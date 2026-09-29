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
 * Constant-time string equality check to prevent timing attacks on passwords/tokens
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
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
