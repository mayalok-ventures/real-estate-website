/**
 * PHASE 1 — P0 CRITICAL SECURITY REMEDIATION TEST SUITE
 * 
 * Verifies:
 * 1. P0-A: Cloudflare Access Header Spoofing / Assertion Verification
 *    - Rejection of spoofed Cf-Access-Authenticated-User-Email header without signed JWT
 *    - Failure modes: missing token, malformed token, unsupported alg, wrong kid,
 *      wrong issuer, audience mismatch, expired token, non-whitelisted email, tampered signature
 *    - Success mode: valid RS256 token signed by authorized keypair against JWKS
 * 2. P0-B: Unvalidated Post-Login Redirect (Open Redirect)
 *    - Strict rejection of external hosts, protocol-relative '//', backslashes, schemes,
 *      control characters, traversal, and non-admin targets
 *    - Safe fallback to /admin
 *    - Preservation of valid internal admin routes, query parameters, and fragments
 * 3. Timing-Safe Comparisons
 *    - Resistance to timing side-channels for access tokens and passwords
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import {
  sanitizeRedirectUrl,
  verifyCloudflareAccessJWT,
  timingSafeEqual,
  createSessionToken,
  verifySessionToken
} from '../src/lib/auth.ts';

// Helper to base64url encode buffers or strings
function base64UrlEncode(data) {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : Buffer.from(data);
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

describe('P0-B: Unvalidated Post-Login Redirect (sanitizeRedirectUrl)', () => {
  describe('Malicious External Redirection Vectors (Must Reject & Fallback to /admin)', () => {
    const maliciousVectors = [
      { name: 'Absolute HTTPS URL', input: 'https://evil.com' },
      { name: 'Absolute HTTP URL', input: 'http://attacker.com/admin' },
      { name: 'Protocol-relative URL //', input: '//evil.com' },
      { name: 'Protocol-relative URL // with path', input: '//evil.com/admin' },
      { name: 'Triple slash ///evil.com', input: '///evil.com' },
      { name: 'Backslash bypass /\\evil.com', input: '/\\evil.com' },
      { name: 'Backslash bypass \\evil.com', input: '\\evil.com' },
      { name: 'Backslash after admin /admin\\evil.com', input: '/admin\\evil.com' },
      { name: 'Scheme: javascript:', input: 'javascript:alert(document.cookie)' },
      { name: 'Scheme: data:', input: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' },
      { name: 'Scheme: vbscript:', input: 'vbscript:msgbox("hacked")' },
      { name: 'Scheme with uppercase: JAVASCRIPT:', input: 'JAVASCRIPT:alert(1)' },
      { name: 'Control characters / CRLF injection', input: '/admin\r\nSet-Cookie: pwned=1' },
      { name: 'Null byte injection', input: '/admin\u0000/evil' },
      { name: 'URL-encoded protocol-relative', input: '%2f%2fevil.com' },
      { name: 'Directory traversal escaping admin /admin/../', input: '/admin/../' },
      { name: 'Targeting non-admin root /', input: '/' },
      { name: 'Targeting marketing page /about', input: '/about' },
      { name: 'Targeting contact page /contact', input: '/contact' },
      { name: 'Malformed URL garbage', input: ':::not-a-url:::' },
      { name: 'Empty string', input: '' },
      { name: 'Whitespace only', input: '   ' },
      { name: 'Null input', input: null },
      { name: 'Undefined input', input: undefined }
    ];

    for (const vector of maliciousVectors) {
      test(`Rejects: ${vector.name} -> "${vector.input}"`, () => {
        const result = sanitizeRedirectUrl(vector.input, '/admin');
        assert.equal(result, '/admin', `Expected fallback '/admin' for vector: ${vector.input}`);
      });
    }
  });

  describe('Legitimate Internal Admin Destinations (Must Allow)', () => {
    const legitimatePaths = [
      { name: 'Exact /admin', input: '/admin', expected: '/admin' },
      { name: 'Admin dashboard trailing slash /admin/', input: '/admin/', expected: '/admin/' },
      { name: 'Admin leads view /admin/leads', input: '/admin/leads', expected: '/admin/leads' },
      { name: 'Admin with query params /admin?tab=gsc', input: '/admin?tab=gsc', expected: '/admin?tab=gsc' },
      { name: 'Admin with multiple query params', input: '/admin?tab=leads&page=2', expected: '/admin?tab=leads&page=2' },
      { name: 'Admin with fragment /admin#analytics-section', input: '/admin#analytics-section', expected: '/admin#analytics-section' },
      { name: 'Admin with query and fragment', input: '/admin?range=30d#performance', expected: '/admin?range=30d#performance' },
      { name: 'Padded whitespace around valid /admin/leads', input: '  /admin/leads  ', expected: '/admin/leads' }
    ];

    for (const item of legitimatePaths) {
      test(`Permits: ${item.name} -> "${item.input}"`, () => {
        const result = sanitizeRedirectUrl(item.input, '/admin');
        assert.equal(result, item.expected, `Expected '${item.expected}', got '${result}'`);
      });
    }
  });
});

describe('P0-A: Cloudflare Access JWT Cryptographic Verification (verifyCloudflareAccessJWT)', () => {
  const TEAM_NAME = 'sahyak-team';
  const AUDIENCE = 'a1b2c3d4e5f6g7h8i9j0-fake-aud-tag-for-testing';
  const ALLOWED_EMAILS = ['admin@sahyak.com', 'team@sahyak.com'];
  const KID = 'test-key-id-1';

  // Generate synthetic RSA keypair for testing RS256 signatures
  let keyPair;
  let publicJwk;
  let mockServer;
  let mockServerUrl;

  before(async () => {
    // Generate 2048-bit RSA keypair in Node.js
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048
    });
    keyPair = { privateKey, publicKey };

    // Export public key as JWK
    const jwk = publicKey.export({ format: 'jwk' });
    publicJwk = {
      ...jwk,
      kid: KID,
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig'
    };

    // Spin up local HTTP server to host mock Cloudflare Access JWKS endpoint
    mockServer = http.createServer((req, res) => {
      if (req.url === '/cdn-cgi/access/certs') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          keys: [publicJwk],
          public_cert: { kid: KID }
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const port = mockServer.address().port;
        mockServerUrl = `http://127.0.0.1:${port}/cdn-cgi/access/certs`;
        resolve();
      });
    });
  });

  after(() => {
    if (mockServer) {
      mockServer.close();
    }
  });

  // Helper to mint synthetic RS256 JWT
  async function mintSyntheticJwt({
    headerOverrides = {},
    payloadOverrides = {},
    tamperSig = false
  } = {}) {
    const header = {
      alg: 'RS256',
      kid: KID,
      typ: 'JWT',
      ...headerOverrides
    };

    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      iss: `https://${TEAM_NAME}.cloudflareaccess.com`,
      aud: AUDIENCE,
      sub: 'user-uuid-1234',
      email: 'admin@sahyak.com',
      identity: { email: 'admin@sahyak.com' },
      exp: nowSec + 3600, // +1 hour
      nbf: nowSec - 60,
      iat: nowSec,
      ...payloadOverrides
    };

    const headerB64 = base64UrlEncode(JSON.stringify(header));
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const dataToSign = `${headerB64}.${payloadB64}`;

    // Sign with private key using crypto.subtle (convert PEM/PKCS8 or use node:crypto)
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      keyPair.privateKey.export({ format: 'der', type: 'pkcs8' }),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sigBuf = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(dataToSign)
    );

    let sigB64 = base64UrlEncode(new Uint8Array(sigBuf));
    if (tamperSig) {
      // Flip characters in the signature
      sigB64 = sigB64.slice(0, -6) + 'AAAAAA';
    }

    return `${headerB64}.${payloadB64}.${sigB64}`;
  }

  test('Valid RS256 Cloudflare Access JWT is verified and authenticated', async () => {
    const validJwt = await mintSyntheticJwt();
    const result = await verifyCloudflareAccessJWT(
      validJwt,
      TEAM_NAME,
      AUDIENCE,
      ALLOWED_EMAILS,
      mockServerUrl
    );

    assert.equal(result.valid, true, `Verification failed: ${result.error}`);
    assert.equal(result.email, 'admin@sahyak.com');
  });

  test('Rejects missing or empty JWT assertion', async () => {
    const result = await verifyCloudflareAccessJWT(
      '',
      TEAM_NAME,
      AUDIENCE,
      ALLOWED_EMAILS,
      mockServerUrl
    );
    assert.equal(result.valid, false);
    assert.match(result.error, /Missing Cloudflare Access JWT/i);
  });

  test('Fails closed if server TEAM_NAME or AUD is unconfigured', async () => {
    const validJwt = await mintSyntheticJwt();
    const resultNoTeam = await verifyCloudflareAccessJWT(
      validJwt,
      '',
      AUDIENCE,
      ALLOWED_EMAILS,
      mockServerUrl
    );
    assert.equal(resultNoTeam.valid, false);
    assert.match(resultNoTeam.error, /unconfigured on the server/i);

    const resultNoAud = await verifyCloudflareAccessJWT(
      validJwt,
      TEAM_NAME,
      '',
      ALLOWED_EMAILS,
      mockServerUrl
    );
    assert.equal(resultNoAud.valid, false);
    assert.match(resultNoAud.error, /unconfigured on the server/i);
  });

  test('Rejects malformed JWT structure (not 3 dot-separated segments)', async () => {
    const result = await verifyCloudflareAccessJWT(
      'segment1.segment2',
      TEAM_NAME,
      AUDIENCE,
      ALLOWED_EMAILS,
      mockServerUrl
    );
    assert.equal(result.valid, false);
    assert.match(result.error, /Invalid JWT structure/i);
  });

  test('Rejects unsupported algorithm (e.g. HS256, none)', async () => {
    const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'HS256', kid: KID }));
    const payloadB64 = base64UrlEncode(JSON.stringify({
      iss: `https://${TEAM_NAME}.cloudflareaccess.com`,
      aud: AUDIENCE,
      email: 'admin@sahyak.com',
      exp: Math.floor(Date.now() / 1000) + 3600
    }));
    const fakeToken = `${headerB64}.${payloadB64}.fakesig`;

    const result = await verifyCloudflareAccessJWT(
      fakeToken,
      TEAM_NAME,
      AUDIENCE,
      ALLOWED_EMAILS,
      mockServerUrl
    );
    assert.equal(result.valid, false);
    assert.match(result.error, /Unsupported algorithm/i);
  });

  test('Rejects token with missing kid in header', async () => {
    const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'RS256' }));
    const payloadB64 = base64UrlEncode(JSON.stringify({
      iss: `https://${TEAM_NAME}.cloudflareaccess.com`,
      aud: AUDIENCE,
      email: 'admin@sahyak.com',
      exp: Math.floor(Date.now() / 1000) + 3600
    }));
    const fakeToken = `${headerB64}.${payloadB64}.fakesig`;

    const result = await verifyCloudflareAccessJWT(
      fakeToken,
      TEAM_NAME,
      AUDIENCE,
      ALLOWED_EMAILS,
      mockServerUrl
    );
    assert.equal(result.valid, false);
    assert.match(result.error, /Missing key ID/i);
  });

  test('Rejects issuer mismatch (e.g. issued by attacker team)', async () => {
    const wrongIssuerJwt = await mintSyntheticJwt({
      payloadOverrides: { iss: 'https://attacker-team.cloudflareaccess.com' }
    });
    const result = await verifyCloudflareAccessJWT(
      wrongIssuerJwt,
      TEAM_NAME,
      AUDIENCE,
      ALLOWED_EMAILS,
      mockServerUrl
    );
    assert.equal(result.valid, false);
    assert.match(result.error, /Invalid issuer/i);
  });

  test('Rejects audience mismatch (JWT minted for different app)', async () => {
    const wrongAudJwt = await mintSyntheticJwt({
      payloadOverrides: { aud: 'different-app-aud-tag' }
    });
    const result = await verifyCloudflareAccessJWT(
      wrongAudJwt,
      TEAM_NAME,
      AUDIENCE,
      ALLOWED_EMAILS,
      mockServerUrl
    );
    assert.equal(result.valid, false);
    assert.match(result.error, /Audience mismatch/i);
  });

  test('Rejects expired JWT assertion', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredJwt = await mintSyntheticJwt({
      payloadOverrides: { exp: nowSec - 300 } // expired 5 minutes ago
    });
    const result = await verifyCloudflareAccessJWT(
      expiredJwt,
      TEAM_NAME,
      AUDIENCE,
      ALLOWED_EMAILS,
      mockServerUrl
    );
    assert.equal(result.valid, false);
    assert.match(result.error, /expired/i);
  });

  test('Rejects future not-before (nbf) beyond clock skew tolerance', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const futureJwt = await mintSyntheticJwt({
      payloadOverrides: { nbf: nowSec + 3600 } // valid only in 1 hour
    });
    const result = await verifyCloudflareAccessJWT(
      futureJwt,
      TEAM_NAME,
      AUDIENCE,
      ALLOWED_EMAILS,
      mockServerUrl
    );
    assert.equal(result.valid, false);
    assert.match(result.error, /not yet valid/i);
  });

  test('Rejects non-whitelisted email claim in validly signed JWT', async () => {
    const nonAdminJwt = await mintSyntheticJwt({
      payloadOverrides: {
        email: 'unauthorized-user@external.com',
        identity: { email: 'unauthorized-user@external.com' }
      }
    });
    const result = await verifyCloudflareAccessJWT(
      nonAdminJwt,
      TEAM_NAME,
      AUDIENCE,
      ALLOWED_EMAILS,
      mockServerUrl
    );
    assert.equal(result.valid, false);
    assert.match(result.error, /not an authorized administrator/i);
  });

  test('Rejects tampered signature (forged JWT)', async () => {
    const tamperedJwt = await mintSyntheticJwt({ tamperSig: true });
    const result = await verifyCloudflareAccessJWT(
      tamperedJwt,
      TEAM_NAME,
      AUDIENCE,
      ALLOWED_EMAILS,
      mockServerUrl
    );
    assert.equal(result.valid, false);
    assert.match(result.error, /signature verification failed/i);
  });

  test('Rejects unknown kid not present in JWKS', async () => {
    const unknownKidJwt = await mintSyntheticJwt({
      headerOverrides: { kid: 'non-existent-kid' }
    });
    const result = await verifyCloudflareAccessJWT(
      unknownKidJwt,
      TEAM_NAME,
      AUDIENCE,
      ALLOWED_EMAILS,
      mockServerUrl
    );
    assert.equal(result.valid, false);
    assert.match(result.error, /not found at JWKS endpoint/i);
  });
});

describe('Constant-Time Equality (timingSafeEqual)', () => {
  test('Identical strings return true', () => {
    assert.equal(timingSafeEqual('my-secret-access-token-12345', 'my-secret-access-token-12345'), true);
  });

  test('Different lengths return false immediately without exception', () => {
    assert.equal(timingSafeEqual('short', 'longer-string'), false);
  });

  test('Same length with single character difference returns false', () => {
    assert.equal(timingSafeEqual('password1234', 'password1235'), false);
    assert.equal(timingSafeEqual('A'.repeat(64), 'A'.repeat(63) + 'B'), false);
  });

  test('Non-string inputs return false safely', () => {
    assert.equal(timingSafeEqual(null, 'test'), false);
    assert.equal(timingSafeEqual('test', undefined), false);
    assert.equal(timingSafeEqual({}, {}), false);
  });
});

describe('End-to-End Cryptographic Session Integrity', () => {
  const SECRET = 'test-admin-secret-key-32-chars-long!!';
  const ALLOWED = ['admin@sahyak.com'];

  test('Issued session token can be verified and resolves to user', async () => {
    const token = await createSessionToken('admin@sahyak.com', SECRET);
    assert.match(token, /^session_/);

    const verification = await verifySessionToken(token, SECRET, ALLOWED);
    assert.equal(verification.valid, true);
    assert.equal(verification.user.email, 'admin@sahyak.com');
    assert.equal(verification.user.role, 'admin');
  });

  test('Tampering with session payload invalidates signature', async () => {
    const token = await createSessionToken('admin@sahyak.com', SECRET);
    const parts = token.split('.');
    // Tamper with the base64-encoded email portion
    parts[1] = Buffer.from('hacker@evil.com').toString('base64');
    const tampered = parts.join('.');
    const verification = await verifySessionToken(tampered, SECRET, ALLOWED);
    assert.equal(verification.valid, false);
    assert.match(verification.error, /Cryptographic signature verification failed|Subject email is not in authorized/);
  });
});
