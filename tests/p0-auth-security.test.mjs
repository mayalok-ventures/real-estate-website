/**
 * P0 Admin Authentication & Security Acceptance Test Suite
 * Tests session signing, forgery resistance, backdoor removal,
 * defense-in-depth API protection, and CSRF origin validation.
 */
import fs from 'node:fs';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4321';

// Read server secret from .env for valid authentication test
let realSecret = '';
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  const match = envContent.match(/ADMIN_SECRET=([^\r\n]+)/);
  if (match) realSecret = match[1].trim();
} catch (e) {
  console.warn('[Test] Warning: .env not found, using empty secret');
}

// Preflight connection check to ensure server is ready
for (let i = 0; i < 5; i++) {
  try {
    await fetch(`${BASE_URL}/admin/login`);
    break;
  } catch (e) {
    if (i === 4) throw new Error(`Could not connect to ${BASE_URL}. Ensure dev server is running.`);
    await new Promise(r => setTimeout(r, 1000));
  }
}

const results = [];

async function runTest(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    results.push({ name, status: 'FAIL', error: err.message });
    console.error(`  ✗ FAIL: ${name} -> ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('====================================================');
console.log('RUNNING P0 SECURITY & AUTHENTICATION ACCEPTANCE TESTS');
console.log('Base URL:', BASE_URL);
console.log('====================================================');

// Test 1: No session cookie -> 401
await runTest('No session cookie -> 401 Unauthorized on protected leads API', async () => {
  const res = await fetch(`${BASE_URL}/api/admin/leads`);
  assert(res.status === 401, `Expected status 401, got ${res.status}`);
  const json = await res.json();
  assert(json.success === false, 'Expected success to be false');
});

// Test 2: Forged unsigned cookie -> 401
await runTest('Forged unsigned cookie -> 401 Unauthorized (Anti-forgery check)', async () => {
  const forged = 'session_' + Buffer.from('admin@sahyak.com').toString('base64') + ':' + (Date.now() + 86400000);
  const res = await fetch(`${BASE_URL}/api/admin/leads`, {
    headers: { Cookie: `sahyak_admin_session=${forged}` }
  });
  assert(res.status === 401, `Expected status 401, got ${res.status}`);
});

// Test 3: Tampered signature -> 401
await runTest('Tampered signature token -> 401 Unauthorized (Cryptographic verification)', async () => {
  const tampered = `session_${crypto.randomUUID()}.${Buffer.from('admin@sahyak.com').toString('base64')}.${Date.now() + 86400000}.${'0'.repeat(64)}`;
  const res = await fetch(`${BASE_URL}/api/admin/leads`, {
    headers: { Cookie: `sahyak_admin_session=${tampered}` }
  });
  assert(res.status === 401, `Expected status 401, got ${res.status}`);
});

// Test 4: Malformed cookie -> safe denial, no exception
await runTest('Malformed cookie -> 401 Unauthorized without crashing server', async () => {
  const malformed = 'session_!!!not_valid_json_or_base64!!!';
  const res = await fetch(`${BASE_URL}/api/admin/leads`, {
    headers: { Cookie: `sahyak_admin_session=${malformed}` }
  });
  assert(res.status === 401, `Expected status 401, got ${res.status}`);
});

// Test 5: Expired session token -> 401
await runTest('Expired session token -> 401 Unauthorized', async () => {
  const expiredExpiry = Date.now() - 3600000; // 1 hour ago
  const expired = `session_${crypto.randomUUID()}.${Buffer.from('admin@sahyak.com').toString('base64')}.${expiredExpiry}.${'a'.repeat(64)}`;
  const res = await fetch(`${BASE_URL}/api/admin/leads`, {
    headers: { Cookie: `sahyak_admin_session=${expired}` }
  });
  assert(res.status === 401, `Expected status 401, got ${res.status}`);
});

// Test 6: Backdoor password 'admin' -> denied
await runTest("Backdoor password 'admin' -> Denied (401)", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email: 'admin@sahyak.com', password: 'admin' })
  });
  assert(res.status === 401, `Expected status 401, got ${res.status}`);
});

// Test 7: Backdoor password 'admin123' -> denied
await runTest("Backdoor password 'admin123' -> Denied (401)", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email: 'admin@sahyak.com', password: 'admin123' })
  });
  assert(res.status === 401, `Expected status 401, got ${res.status}`);
});

// Test 8: Backdoor password 'sahyak2026' -> denied
await runTest("Backdoor password 'sahyak2026' -> Denied (401)", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email: 'admin@sahyak.com', password: 'sahyak2026' })
  });
  assert(res.status === 401, `Expected status 401, got ${res.status}`);
});

// Test 9: Authenticated non-admin email -> denied
await runTest('Non-whitelisted email -> Denied (401)', async () => {
  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email: 'attacker@evil.com', password: realSecret })
  });
  assert(res.status === 401, `Expected status 401, got ${res.status}`);
});

// Test 10: Valid login produces authenticated session
let validSessionCookie = '';
await runTest('Valid authorized administrator login -> 200 OK with valid cookie', async () => {
  assert(realSecret.length > 0, 'Real secret required for valid login test');
  const res = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email: 'admin@sahyak.com', password: realSecret })
  });
  assert(res.status === 200, `Expected status 200, got ${res.status}`);
  const setCookie = res.headers.get('set-cookie');
  assert(setCookie && setCookie.includes('sahyak_admin_session='), 'Set-Cookie header missing');
  validSessionCookie = setCookie.split(';')[0];
});

// Test 11: Every protected API route enforces authorization
const protectedRoutes = [
  { path: '/api/admin/leads', method: 'GET' },
  { path: '/api/admin/analytics', method: 'GET' },
  { path: '/api/admin/analytics/export', method: 'GET' },
  { path: '/api/admin/gsc/data', method: 'GET' },
  { path: '/api/admin/gsc/export', method: 'GET' },
  { path: '/api/admin/gsc/inspect', method: 'POST', body: JSON.stringify({ url: '/' }) }
];

for (const route of protectedRoutes) {
  await runTest(`Protected route ${route.method} ${route.path} blocks unauthenticated requests`, async () => {
    const res = await fetch(`${BASE_URL}${route.path}`, {
      method: route.method,
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: route.body
    });
    assert(res.status === 401, `Expected 401 on ${route.path}, got ${res.status}`);
  });
}

// Test 12: Cross-origin mutation attempt (CSRF) -> 403 Forbidden
await runTest('Cross-origin PATCH /api/admin/leads -> 403 Forbidden (CSRF defense)', async () => {
  assert(validSessionCookie.length > 0, 'Valid session cookie required');
  const res = await fetch(`${BASE_URL}/api/admin/leads`, {
    method: 'PATCH',
    headers: {
      Cookie: validSessionCookie,
      'Content-Type': 'application/json',
      Origin: 'https://attacker-website.com'
    },
    body: JSON.stringify({ id: 1, status: 'contacted' })
  });
  assert(res.status === 403, `Expected status 403, got ${res.status}`);
});

// Test 13: Legitimate same-origin mutation -> 200 OK
await runTest('Same-origin PATCH /api/admin/leads -> 200 OK', async () => {
  assert(validSessionCookie.length > 0, 'Valid session cookie required');
  const res = await fetch(`${BASE_URL}/api/admin/leads`, {
    method: 'PATCH',
    headers: {
      Cookie: validSessionCookie,
      'Content-Type': 'application/json',
      Origin: BASE_URL
    },
    body: JSON.stringify({ id: 1, status: 'qualified' })
  });
  assert(res.status === 200, `Expected status 200, got ${res.status}`);
  const json = await res.json();
  assert(json.success === true, 'Expected mutation success to be true');
});

// Test 14: Logout clears session cookie
await runTest('POST /api/admin/logout -> 200 OK and purges cookie', async () => {
  assert(validSessionCookie.length > 0, 'Valid session cookie required');
  const res = await fetch(`${BASE_URL}/api/admin/logout`, {
    method: 'POST',
    headers: { Cookie: validSessionCookie, Origin: BASE_URL }
  });
  assert(res.status === 200, `Expected status 200, got ${res.status}`);
  const setCookie = res.headers.get('set-cookie');
  assert(setCookie && (setCookie.includes('Max-Age=0') || setCookie.includes('Expires=') || setCookie.includes('deleted')), 'Expected cookie deletion header');
});

console.log('\n====================================================');
console.log(`SUMMARY: ${results.filter(r => r.status === 'PASS').length}/${results.length} TESTS PASSED`);
console.log('====================================================');

if (results.some(r => r.status === 'FAIL')) {
  process.exit(1);
} else {
  process.exit(0);
}
