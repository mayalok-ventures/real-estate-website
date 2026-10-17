/**
 * Authentication & Session Management Module for Sahyak Admin Console
 * Provides tamper-proof HMAC-SHA256 session token generation and verification,
 * timing-safe password evaluation, session revocation, and anti-CSRF origin checks.
 */
import type { D1Database } from '../types/db';

export interface AdminSessionUser {
  email: string;
  role: 'superadmin' | 'admin';
  source: 'session' | 'cf-access' | 'access-token';
  sessionId?: string;
}

/**
 * Derives a CryptoKey for HMAC-SHA256 operations using WebCrypto
 */
async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Computes an HMAC-SHA256 signature in hexadecimal string format
 */
export async function signData(data: string, secret: string): Promise<string> {
  const key = await getCryptoKey(secret);
  const enc = new TextEncoder();
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const sigArray = Array.from(new Uint8Array(sigBuf));
  return sigArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies an HMAC-SHA256 signature using constant-time comparison in WebCrypto
 */
export async function verifyData(data: string, signatureHex: string, secret: string): Promise<boolean> {
  try {
    if (!signatureHex || signatureHex.length !== 64) return false;
    const key = await getCryptoKey(secret);
    const enc = new TextEncoder();
    const sigBytes = new Uint8Array(
      signatureHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );
    return await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(data));
  } catch {
    return false;
  }
}

/**
 * Constant-time string equality check to prevent timing side-channel attacks on passwords,
 * tokens, and secrets. Operates across the full maximum length of both inputs to prevent
 * leaking secret length via early-exit timing variations.
 */
export function timingSafeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aLen = a.length;
  const bLen = b.length;
  const maxLen = Math.max(aLen, bLen);
  let diff = aLen ^ bLen;
  for (let i = 0; i < maxLen; i++) {
    const charA = i < aLen ? a.charCodeAt(i) : 0;
    const charB = i < bLen ? b.charCodeAt(i) : 0;
    diff |= (charA ^ charB);
  }
  return diff === 0;
}

/**
 * Cryptographic timing-safe digest comparison for sensitive fixed-length and variable-length
 * authentication tokens. Normalizes inputs to 32-byte SHA-256 digests via WebCrypto before
 * comparing, providing complete length-invariant timing safety.
 */
export async function timingSafeEqualTokens(a: string | null | undefined, b: string | null | undefined): Promise<boolean> {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  const bytesA = new Uint8Array(hashA);
  const bytesB = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < 32; i++) {
    diff |= (bytesA[i] ^ bytesB[i]);
  }
  return diff === 0;
}

/**
 * Generates a signed, cryptographically random admin session token
 * Token format: session_${sessionId}.${emailB64}.${expiry}.${signatureHex}
 */
export async function createSessionToken(
  email: string,
  secret: string,
  db?: D1Database
): Promise<string> {
  if (!secret || secret.trim() === '') {
    throw new Error('Cannot issue session token: Administrator security secret is not configured.');
  }

  const sessionId = crypto.randomUUID();
  const normalizedEmail = email.trim().toLowerCase();
  const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24-hour lifetime
  const emailB64 = btoa(normalizedEmail);
  const payload = `${sessionId}.${emailB64}.${expiry}`;
  const signature = await signData(payload, secret);
  const token = `session_${payload}.${signature}`;

  // Persist into Cloudflare D1 admin_sessions if available
  if (db) {
    try {
      await db.prepare(
        `INSERT INTO admin_sessions (session_id, email, role, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET expires_at = excluded.expires_at`
      ).bind(sessionId, normalizedEmail, 'admin', expiry).run();
    } catch (e) {
      // Non-blocking log if schema migration is pending
      console.warn('[Auth] Note: D1 admin_sessions persistence skipped:', e);
    }
  }

  return token;
}

/**
 * Validates token signature, format, expiration, email authorization, and revocation state
 */
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  allowedEmails: string[],
  db?: D1Database
): Promise<{ valid: boolean; user?: AdminSessionUser; error?: string }> {
  if (!token || !token.startsWith('session_')) {
    return { valid: false, error: 'Missing or malformed session cookie.' };
  }

  if (!secret || secret.trim() === '') {
    return { valid: false, error: 'Server authentication secret is unconfigured.' };
  }

  const raw = token.slice('session_'.length);
  const parts = raw.split('.');
  if (parts.length !== 4) {
    return { valid: false, error: 'Invalid token structure. Tampering detected.' };
  }

  const [sessionId, emailB64, expiryStr, signatureHex] = parts;
  const expiry = parseInt(expiryStr, 10);

  if (isNaN(expiry) || expiry <= Date.now()) {
    return { valid: false, error: 'Session token has expired.' };
  }

  let email = '';
  try {
    email = atob(emailB64).toLowerCase().trim();
  } catch {
    return { valid: false, error: 'Invalid base64 encoding in session token.' };
  }

  if (!allowedEmails.includes(email)) {
    return { valid: false, error: 'Subject email is not in authorized administrator list.' };
  }

  const payload = `${sessionId}.${emailB64}.${expiryStr}`;
  const isSigValid = await verifyData(payload, signatureHex, secret);
  if (!isSigValid) {
    return { valid: false, error: 'Cryptographic signature verification failed (forged session).' };
  }

  // If D1 is available, verify session is active in database (revocation check)
  if (db) {
    try {
      const row = await db.prepare(
        `SELECT session_id, expires_at FROM admin_sessions WHERE session_id = ?`
      ).bind(sessionId).first<{ session_id: string; expires_at: number }>();

      if (!row || row.expires_at <= Date.now()) {
        return { valid: false, error: 'Session has been revoked or expired.' };
      }
    } catch {
      // D1 table might not yet be provisioned in local dev; cryptographic signature stands
    }
  }

  return {
    valid: true,
    user: {
      email,
      role: 'admin',
      source: 'session',
      sessionId
    }
  };
}

/**
 * Revokes a session by ID in D1 database
 */
export async function revokeSessionToken(
  token: string | undefined,
  db?: D1Database
): Promise<void> {
  if (!token || !token.startsWith('session_')) return;
  const parts = token.slice('session_'.length).split('.');
  const sessionId = parts[0];
  if (sessionId && db) {
    try {
      await db.prepare(`DELETE FROM admin_sessions WHERE session_id = ?`).bind(sessionId).run();
    } catch {
      // Ignored
    }
  }
}

/**
 * Validates Origin and Sec-Fetch-Site headers on state-mutating requests to prevent CSRF
 */
export function verifyCsrfAndOrigin(request: Request): { allowed: boolean; reason?: string } {
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { allowed: true };
  }

  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite === 'cross-site') {
    return { allowed: false, reason: 'Cross-site request blocked by Sec-Fetch-Site policy.' };
  }

  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const reqUrl = new URL(request.url);
      const originUrl = new URL(origin);
      if (originUrl.host !== reqUrl.host) {
        return { allowed: false, reason: `Origin mismatch: ${originUrl.host} does not match ${reqUrl.host}.` };
      }
    } catch {
      return { allowed: false, reason: 'Malformed Origin header in request.' };
    }
  }

  return { allowed: true };
}

/**
 * Validates and sanitizes a post-login redirect URL to eliminate Open Redirect vulnerabilities.
 * Strictly permits only safe relative paths rooted at '/' targeting the admin console,
 * rejecting external schemes, protocol-relative '//', backslashes, control characters, and malformed inputs.
 */
export function sanitizeRedirectUrl(rawUrl: string | null | undefined, fallback: string = '/admin'): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return fallback;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return fallback;
  }

  // Reject control characters (0x00 - 0x1F, 0x7F - 0x9F)
  if (/[\u0000-\u001F\u007F-\u009F]/.test(trimmed)) {
    return fallback;
  }

  // Reject URLs containing backslashes anywhere before query/hash to prevent normalization bypasses
  const pathPart = trimmed.split('?')[0].split('#')[0];
  if (pathPart.includes('\\')) {
    return fallback;
  }

  // Reject protocol-relative URLs (//) or backslash variants (/\, \/)
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }

  // Reject explicit schemes (e.g. javascript:, data:, https:)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }

  try {
    // Parse against a fixed internal dummy origin to inspect standard URL component resolution
    const dummyOrigin = 'https://sahyak.internal';
    const parsed = new URL(trimmed, dummyOrigin);

    // Enforce that parsed origin strictly matches the dummy origin (no escaping to external host)
    if (parsed.origin !== dummyOrigin) {
      return fallback;
    }

    // Enforce protocol is https:
    if (parsed.protocol !== 'https:') {
      return fallback;
    }

    // Enforce pathname begins with '/' and does not begin with '//'
    if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) {
      return fallback;
    }

    // Reconstruct sanitized relative target using ONLY pathname + search + hash
    const cleanRelative = parsed.pathname + parsed.search + parsed.hash;

    // Strictly restrict redirect to admin portal routes
    if (cleanRelative !== '/admin' && !cleanRelative.startsWith('/admin/') && !cleanRelative.startsWith('/admin?') && !cleanRelative.startsWith('/admin#')) {
      return fallback;
    }

    return cleanRelative;
  } catch {
    return fallback;
  }
}

/**
 * Result of Cloudflare Access JWT assertion cryptographic verification
 */
export interface CfAccessVerificationResult {
  valid: boolean;
  email?: string;
  error?: string;
}

// In-memory JWKS cache for Cloudflare Access public keys
interface JwksCacheEntry {
  keys: any[];
  expiresAt: number;
}
const jwksCache: Record<string, JwksCacheEntry> = {};

/**
 * Helper to decode base64url strings into byte arrays or strings
 */
function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecodeString(str: string): string {
  const bytes = base64UrlDecode(str);
  return new TextDecoder().decode(bytes);
}

/**
 * Retrieves public keys (JWKS) from Cloudflare Access certs endpoint with caching
 */
export async function fetchCloudflareAccessJwks(certsUrl: string, forceRefresh = false): Promise<any[]> {
  const now = Date.now();
  if (!forceRefresh && jwksCache[certsUrl] && jwksCache[certsUrl].expiresAt > now) {
    return jwksCache[certsUrl].keys;
  }

  try {
    const res = await fetch(certsUrl);
    if (!res.ok) {
      return [];
    }
    const data = await res.json() as any;
    const keys = Array.isArray(data?.keys) ? data.keys : [];
    // Cache for 15 minutes
    jwksCache[certsUrl] = {
      keys,
      expiresAt: now + 15 * 60 * 1000
    };
    return keys;
  } catch {
    return [];
  }
}

/**
 * Cryptographically verifies a Cloudflare Access JWT Assertion (Cf-Access-Jwt-Assertion)
 * Validates RS256 signature against official JWKS, issuer (iss), audience (aud),
 * expiration (exp), not-before (nbf), and authorized admin email list.
 */
export async function verifyCloudflareAccessJWT(
  jwtAssertion: string | undefined,
  teamName: string | undefined,
  expectedAud: string | undefined,
  allowedEmails: string[],
  customCertsUrl?: string
): Promise<CfAccessVerificationResult> {
  if (!jwtAssertion || typeof jwtAssertion !== 'string' || jwtAssertion.trim() === '') {
    return { valid: false, error: 'Missing Cloudflare Access JWT assertion.' };
  }

  const cleanTeam = (teamName || '').trim();
  const cleanAud = (expectedAud || '').trim();

  // If team domain or AUD is unconfigured on the server, fail closed
  if (!cleanTeam || !cleanAud) {
    return { valid: false, error: 'Cloudflare Access authentication is unconfigured on the server.' };
  }

  const parts = jwtAssertion.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Invalid JWT structure. Expected 3 dot-separated segments.' };
  }

  const [headerB64, payloadB64, sigB64] = parts;

  let header: any;
  let payload: any;
  try {
    header = JSON.parse(base64UrlDecodeString(headerB64));
    payload = JSON.parse(base64UrlDecodeString(payloadB64));
  } catch {
    return { valid: false, error: 'Malformed base64url or JSON in JWT header or payload.' };
  }

  // 1. Validate Header
  if (header.alg !== 'RS256') {
    return { valid: false, error: `Unsupported algorithm: expected RS256, got ${header.alg}.` };
  }
  if (!header.kid || typeof header.kid !== 'string') {
    return { valid: false, error: 'Missing key ID (kid) in JWT header.' };
  }

  // 2. Validate Issuer (iss)
  let expectedDomain = cleanTeam;
  if (!expectedDomain.includes('.')) {
    expectedDomain = `${cleanTeam}.cloudflareaccess.com`;
  }
  expectedDomain = expectedDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const expectedIssuer = `https://${expectedDomain}`;

  if (payload.iss !== expectedIssuer) {
    return { valid: false, error: `Invalid issuer: expected ${expectedIssuer}, got ${payload.iss}.` };
  }

  // 3. Validate Audience (aud)
  let audMatches = false;
  if (typeof payload.aud === 'string') {
    audMatches = payload.aud === cleanAud;
  } else if (Array.isArray(payload.aud)) {
    audMatches = payload.aud.includes(cleanAud);
  }
  if (!audMatches) {
    return { valid: false, error: 'Audience mismatch: JWT not minted for this application.' };
  }

  // 4. Validate Expiry (exp)
  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    return { valid: false, error: 'Cloudflare Access JWT assertion has expired.' };
  }

  // 5. Validate Not Before (nbf) with 60-second clock skew tolerance
  if (payload.nbf && typeof payload.nbf === 'number' && payload.nbf > nowSec + 60) {
    return { valid: false, error: 'Cloudflare Access JWT assertion is not yet valid.' };
  }

  // 6. Validate Subject Email
  const userEmail = (payload.email || payload.identity?.email || '').trim().toLowerCase();
  if (!userEmail) {
    return { valid: false, error: 'No email address found in JWT assertion claims.' };
  }
  if (!allowedEmails.includes(userEmail)) {
    return { valid: false, error: 'User email in assertion is not an authorized administrator.' };
  }

  // 7. Cryptographic RS256 Signature Verification via WebCrypto JWKS
  const certsUrl = customCertsUrl || `${expectedIssuer}/cdn-cgi/access/certs`;
  let keys = await fetchCloudflareAccessJwks(certsUrl);
  let matchingJwk = keys.find(k => k.kid === header.kid);

  // If not found in cache, attempt forced refresh in case keys just rotated
  if (!matchingJwk) {
    keys = await fetchCloudflareAccessJwks(certsUrl, true);
    matchingJwk = keys.find(k => k.kid === header.kid);
  }

  if (!matchingJwk) {
    return { valid: false, error: `Public signing key with kid '${header.kid}' not found at JWKS endpoint.` };
  }

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      matchingJwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const enc = new TextEncoder();
    const signedData = enc.encode(`${headerB64}.${payloadB64}`);
    const sigBytes = base64UrlDecode(sigB64);

    const isSigValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      sigBytes,
      signedData
    );

    if (!isSigValid) {
      return { valid: false, error: 'Cryptographic signature verification failed (tampered JWT).' };
    }
  } catch (err: any) {
    return { valid: false, error: `Crypto verification error: ${err.message || String(err)}` };
  }

  return {
    valid: true,
    email: userEmail
  };
}

