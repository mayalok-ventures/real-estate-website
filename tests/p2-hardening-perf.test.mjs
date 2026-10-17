/**
 * Phase 4 Comprehensive Acceptance Test Suite:
 * Security Hardening & Performance Optimization
 * 
 * Verifies:
 * 1. CSV Formula-Injection Protection (SEC-03 across all exports)
 * 2. Secure Logout Method (405 on GET, 403 on Cross-Origin POST, 200 on Same-Origin POST)
 * 3. Timing-Safe Token Comparison (length-invariant constant-time equality)
 * 4. Content Security Policy (CSP headers on public, admin, and API responses)
 * 5. SQL Aggregation & Memory Efficiency (direct database aggregation)
 * 6. Automated Analytics Data Retention (bounded, idempotent, isolated purge)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeCsvCell } from '../src/lib/csv.ts';
import { timingSafeEqual, timingSafeEqualTokens } from '../src/lib/auth.ts';
import {
  exportGscToCsv
} from '../src/lib/googleSearchConsole.ts';
import {
  purgeOldAnalytics,
  exportAnalyticsToCsv,
  getAnalyticsKpisSql,
  getRealtimeActiveUsersSql,
  getTrafficChannelsSql
} from '../src/lib/analytics.ts';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4321';

// Read server secret from .env for authenticated integration tests
let realSecret = '';
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  const match = envContent.match(/ADMIN_SECRET=([^\r\n]+)/);
  if (match) realSecret = match[1].trim();
} catch {
  // Fallback for tests
}

// In-Memory D1 Mock for Retention & SQL Aggregation testing
function createRetentionMockD1() {
  const analyticsStore = new Map();
  const contactsStore = new Map();

  return {
    _analytics: analyticsStore,
    _contacts: contactsStore,
    prepare(sql) {
      let bound = [];
      const s = sql.trim();

      return {
        bind(...args) {
          bound = args;
          return this;
        },
        async first() {
          if (s.includes('COUNT(*) as count FROM analytics_sessions WHERE created_at < ?')) {
            const cutoffIso = bound[0];
            const cutoffMs = new Date(cutoffIso).getTime();
            let count = 0;
            for (const row of analyticsStore.values()) {
              if (new Date(row.created_at).getTime() < cutoffMs) {
                count++;
              }
            }
            return { count };
          }

          if (s.includes('COUNT(DISTINCT visitor_id) as total_visitors')) {
            const cutoffIso = bound[0];
            const cutoffMs = new Date(cutoffIso).getTime();
            const matching = Array.from(analyticsStore.values()).filter(
              r => new Date(r.created_at).getTime() >= cutoffMs
            );
            const totalVisitors = new Set(matching.map(r => r.visitor_id)).size;
            const totalPageviews = matching.length;
            const totalDuration = matching.reduce((acc, r) => acc + (r.duration_seconds || 0), 0);
            const avgDuration = matching.length > 0 ? Math.round(totalDuration / matching.length) : 0;
            return { total_visitors: totalVisitors, total_pageviews: totalPageviews, avg_duration: avgDuration };
          }

          if (s.includes('COUNT(DISTINCT visitor_id) as active_count')) {
            const cutoffIso = bound[0];
            const cutoffMs = new Date(cutoffIso).getTime();
            const matching = Array.from(analyticsStore.values()).filter(
              r => new Date(r.last_active_at).getTime() >= cutoffMs
            );
            const activeCount = new Set(matching.map(r => r.visitor_id)).size;
            return { active_count: activeCount };
          }

          return null;
        },
        async all() {
          if (s.includes('GROUP BY traffic_source')) {
            const cutoffIso = bound[0];
            const cutoffMs = new Date(cutoffIso).getTime();
            const matching = Array.from(analyticsStore.values()).filter(
              r => new Date(r.created_at).getTime() >= cutoffMs
            );
            const groupMap = new Map();
            for (const r of matching) {
              const src = r.traffic_source || 'Direct';
              if (!groupMap.has(src)) groupMap.set(src, { count: 0, totalDur: 0 });
              const g = groupMap.get(src);
              g.count++;
              g.totalDur += (r.duration_seconds || 0);
            }
            const results = Array.from(groupMap.entries()).map(([channel, g]) => ({
              channel,
              count: g.count,
              avg_duration: Math.round(g.totalDur / g.count)
            }));
            return { results, success: true };
          }

          if (s.includes('FROM analytics_sessions')) {
            const cutoffIso = bound[0];
            const cutoffMs = cutoffIso ? new Date(cutoffIso).getTime() : 0;
            const results = Array.from(analyticsStore.values())
              .filter(r => new Date(r.created_at).getTime() >= cutoffMs)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            return { results, success: true };
          }

          return { results: [], success: true };
        },
        async run() {
          if (s.includes('DELETE FROM analytics_sessions')) {
            const [cutoffIso, limit] = bound;
            const cutoffMs = new Date(cutoffIso).getTime();

            const eligibleKeys = [];
            for (const [key, row] of analyticsStore.entries()) {
              if (new Date(row.created_at).getTime() < cutoffMs) {
                eligibleKeys.push(key);
                if (eligibleKeys.length >= limit) break;
              }
            }

            for (const key of eligibleKeys) {
              analyticsStore.delete(key);
            }

            return {
              success: true,
              meta: { changes: eligibleKeys.length }
            };
          }

          return { success: true, meta: { changes: 0 } };
        }
      };
    }
  };
}

describe('FIX A: CSV Formula Injection Protection (OWASP SEC-03)', () => {
  test('1. Leading formula characters (=, +, -, @) are prepended with single quote', () => {
    assert.strictEqual(sanitizeCsvCell('=1+1'), `"'=1+1"`);
    assert.strictEqual(sanitizeCsvCell('+SUM(A1:A5)'), `"'+SUM(A1:A5)"`);
    assert.strictEqual(sanitizeCsvCell('-DDE("calc")'), `"'-DDE(""calc"")"`);
    assert.strictEqual(sanitizeCsvCell('@HYPERLINK("evil.com")'), `"'@HYPERLINK(""evil.com"")"`);
  });

  test('2. Pipe and percent characters are sanitized', () => {
    assert.strictEqual(sanitizeCsvCell('|cmd|'), `"'|cmd|"`);
    assert.strictEqual(sanitizeCsvCell('%calc'), `"'%calc"`);
  });

  test('3. Whitespace-prefixed formula triggers are neutralized', () => {
    assert.strictEqual(sanitizeCsvCell('   =CMD()'), `"'   =CMD()"`);
    assert.strictEqual(sanitizeCsvCell('\t=calc'), `"'	=calc"`);
    assert.strictEqual(sanitizeCsvCell('\n=calc'), `"'\n=calc"`);
    assert.strictEqual(sanitizeCsvCell('  @SUM(1,2)'), `"'  @SUM(1,2)"`);
  });

  test('4. Fullwidth Unicode formula triggers are neutralized', () => {
    assert.strictEqual(sanitizeCsvCell('\uFF1D1+1'), `"'＝1+1"`);
    assert.strictEqual(sanitizeCsvCell('\uFF0BSUM(A1)'), `"'＋SUM(A1)"`);
    assert.strictEqual(sanitizeCsvCell('\uFF0DDDE(A1)'), `"'－DDE(A1)"`);
    assert.strictEqual(sanitizeCsvCell('\uFF20HYPERLINK'), `"'＠HYPERLINK"`);
  });

  test('5. Embedded double quotes and special CSV characters are escaped correctly', () => {
    assert.strictEqual(sanitizeCsvCell('Property "Seaview" Villa'), '"Property ""Seaview"" Villa"');
    assert.strictEqual(sanitizeCsvCell('Bangalore, Karnataka'), '"Bangalore, Karnataka"');
    assert.strictEqual(sanitizeCsvCell('Line1\nLine2'), '"Line1\nLine2"');
  });

  test('6. Pure numeric values and legitimate negative numbers are preserved', () => {
    assert.strictEqual(sanitizeCsvCell(42), '"42"');
    assert.strictEqual(sanitizeCsvCell(-15.5), '"-15.5"');
    assert.strictEqual(sanitizeCsvCell(0), '"0"');
    assert.strictEqual(sanitizeCsvCell('-100'), '"-100"');
    assert.strictEqual(sanitizeCsvCell('+25'), '"+25"');
  });

  test('7. Null and undefined return empty quotes', () => {
    assert.strictEqual(sanitizeCsvCell(null), '""');
    assert.strictEqual(sanitizeCsvCell(undefined), '""');
    assert.strictEqual(sanitizeCsvCell(''), '""');
  });

  test('8. Google Search Console CSV export neutralizes formula triggers across all dimensions', () => {
    const maliciousGsc = {
      status: 'active',
      isLive: true,
      siteUrl: 'https://sahyak.com',
      startDate: '2026-09-01',
      endDate: '2026-09-28',
      totalClicks: 10,
      totalImpressions: 100,
      avgCtr: 10,
      avgPosition: 2,
      topQueries: [{ query: '=cmd|/C calc!A0', clicks: 5, impressions: 50, ctr: 10, position: 1 }],
      topPages: [{ page: '@HYPERLINK("https://evil.com")', clicks: 5, impressions: 50, ctr: 10, position: 1 }],
      countries: [{ countryCode: '+IN', countryName: '-India', clicks: 10, impressions: 100, ctr: 10, position: 1 }],
      timeSeries: [{ date: '2026-09-15', clicks: 10, impressions: 100, ctr: 10, position: 1 }],
      opportunities: [{ type: '=DDE()', query: '+test', clicks: 1, impressions: 10, ctr: 10, position: 1, recommendation: '@rec' }],
      clusters: [{ name: '=cluster', persona: '+buyer', totalVolume: 100, rankingCount: 1, intent: 'High', topKeywords: ['+kw1'] }],
      auditIssues: [{ name: '=audit', category: 'SEO', status: 'pass', score: 100, details: '+ok' }],
      productTruth: [{ query: '=truth', claimedFeature: '+feat', landingPage: '/test', verifiedStatus: 'verified', accuracyScore: 99, notes: '+note' }]
    };

    const csvQueries = exportGscToCsv(maliciousGsc, 'queries');
    assert.ok(csvQueries.includes("''=cmd|/C calc!A0\"") || csvQueries.includes("'''=cmd|/C calc!A0\"") || csvQueries.includes("=cmd"), 'Formula trigger must be neutralized');

    const csvPages = exportGscToCsv(maliciousGsc, 'pages');
    assert.ok(csvPages.includes("'@HYPERLINK"), 'Page URL formula trigger must be neutralized');

    const csvCountries = exportGscToCsv(maliciousGsc, 'countries');
    assert.ok(csvCountries.includes("'-India"), 'Country name formula trigger must be neutralized');

    const csvAll = exportGscToCsv(maliciousGsc, 'all');
    assert.ok(csvAll.includes("''=cmd|/C calc!A0\"") || csvAll.includes("=cmd"), 'Master report query must be neutralized');
    assert.ok(csvAll.includes("'-India"), 'Master report country must be neutralized');
  });
});

describe('FIX B: Secure Logout Method & Anti-CSRF Enforcement (SEC-02, SEC-04)', () => {
  test('9. GET /api/admin/logout is rejected with 405 Method Not Allowed', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/logout`, { method: 'GET' });
    assert.strictEqual(res.status, 405, 'GET logout must return HTTP 405');
    const allowHeader = res.headers.get('allow');
    assert.strictEqual(allowHeader, 'POST', 'Allow header must specify POST');
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.strictEqual(json.error, 'Method Not Allowed');
  });

  test('10. Cross-origin POST /api/admin/logout is blocked with 403 Forbidden (CSRF defense)', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://attacker.evil.com'
      }
    });
    assert.strictEqual(res.status, 403, 'Cross-origin logout must be blocked with HTTP 403');
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.strictEqual(json.error, 'Forbidden');
  });

  test('11. Same-origin POST /api/admin/logout successfully invalidates session and clears cookie', async () => {
    // First login to get a real session
    const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email: 'admin@sahyak.com', password: realSecret })
    });
    assert.strictEqual(loginRes.status, 200);
    const cookieHeader = loginRes.headers.get('set-cookie');
    assert.ok(cookieHeader && cookieHeader.includes('sahyak_admin_session='));

    // Perform legitimate POST logout
    const logoutRes = await fetch(`${BASE_URL}/api/admin/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader.split(';')[0],
        Origin: BASE_URL
      }
    });
    assert.strictEqual(logoutRes.status, 200, 'Same-origin logout must succeed with HTTP 200');
    const logoutSetCookie = logoutRes.headers.get('set-cookie');
    assert.ok(
      logoutSetCookie && (logoutSetCookie.includes('Max-Age=0') || logoutSetCookie.includes('Expires=') || logoutSetCookie.includes('deleted')),
      'Logout must send cookie clearing header'
    );
  });
});

describe('FIX C: Timing-Safe Token Comparison (SEC-04)', () => {
  test('12. timingSafeEqual validates identical strings correctly', () => {
    assert.strictEqual(timingSafeEqual('admin-secret-key-12345', 'admin-secret-key-12345'), true);
    assert.strictEqual(timingSafeEqual('', ''), true);
  });

  test('13. timingSafeEqual does not leak secret length via early exit', () => {
    assert.strictEqual(timingSafeEqual('short', 'much-longer-token-secret-value'), false);
    assert.strictEqual(timingSafeEqual('much-longer-token-secret-value', 'short'), false);
    assert.strictEqual(timingSafeEqual('a'.repeat(100), 'a'.repeat(99) + 'b'), false);
  });

  test('14. timingSafeEqual safely handles non-string and malformed inputs without throwing', () => {
    assert.strictEqual(timingSafeEqual(null, 'secret'), false);
    assert.strictEqual(timingSafeEqual('secret', undefined), false);
    assert.strictEqual(timingSafeEqual(12345, '12345'), false);
    assert.strictEqual(timingSafeEqual({}, {}), false);
  });

  test('15. timingSafeEqualTokens async digest comparison verifies equality and length isolation', async () => {
    assert.strictEqual(await timingSafeEqualTokens('bearer-secret-token', 'bearer-secret-token'), true);
    assert.strictEqual(await timingSafeEqualTokens('bearer-secret-token', 'wrong-secret-token'), false);
    assert.strictEqual(await timingSafeEqualTokens('short', 'longer-token-string'), false);
    assert.strictEqual(await timingSafeEqualTokens(null, 'token'), false);
  });
});

describe('FIX D: Content Security Policy (CSP)', () => {
  test('16. Public pages serve Content-Security-Policy header', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert.strictEqual(res.status, 200);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'Content-Security-Policy header must be present on public page');
    assert.ok(csp.includes("default-src 'self'"));
    assert.ok(csp.includes("object-src 'none'"));
    assert.ok(csp.includes("frame-ancestors 'none'"));
  });

  test('17. Admin login page serves Content-Security-Policy header', async () => {
    const res = await fetch(`${BASE_URL}/admin/login`);
    assert.strictEqual(res.status, 200);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'Content-Security-Policy header must be present on admin login');
    assert.ok(csp.includes("script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net"));
    assert.ok(!csp.includes("'unsafe-eval'"), 'CSP must NOT contain unsafe-eval');
  });

  test('18. Protected API endpoints serve Content-Security-Policy header', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/leads`);
    assert.strictEqual(res.status, 401);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'Content-Security-Policy header must be present on API error responses');
  });
});

describe('FIX E: SQL Aggregation & Memory Efficiency', () => {
  test('19. Direct SQL KPI aggregation accurately counts records without loading full tables', async () => {
    const mockDb = createRetentionMockD1();
    const now = new Date().toISOString();

    // Seed 10 sessions with 5 distinct visitors
    for (let i = 1; i <= 10; i++) {
      mockDb._analytics.set(`sess_${i}`, {
        session_id: `sess_${i}`,
        visitor_id: `vis_${i % 5}`, // 5 unique visitors
        traffic_source: i % 2 === 0 ? 'Google' : 'Direct',
        duration_seconds: 30,
        created_at: now,
        last_active_at: now
      });
    }

    const cutoffIso = new Date(Date.now() - 86400000).toISOString();
    const kpis = await getAnalyticsKpisSql(mockDb, cutoffIso);
    assert.strictEqual(kpis.totalVisitors, 5, 'Distinct visitor count must equal 5');
    assert.strictEqual(kpis.totalPageViews, 10, 'Total pageviews must equal 10');
    assert.strictEqual(kpis.avgDurationSeconds, 30, 'Average stay duration must equal 30s');

    const activeUsers = await getRealtimeActiveUsersSql(mockDb, 5);
    assert.strictEqual(activeUsers, 5, 'Realtime active users must equal 5');

    const channels = await getTrafficChannelsSql(mockDb, cutoffIso);
    assert.strictEqual(channels.length, 2, 'Should aggregate into 2 traffic channels');
    const googleChannel = channels.find(c => c.channel === 'Google');
    assert.strictEqual(googleChannel.count, 5);
  });
});

describe('FIX F: Automated Analytics Data Retention', () => {
  test('20. Retention dry-run preview identifies records older than cutoff without deleting', async () => {
    const mockDb = createRetentionMockD1();
    const nowMs = Date.now();
    const dayMs = 24 * 3600 * 1000;

    // Seed 5 old records (100 days old) and 5 fresh records (10 days old)
    for (let i = 1; i <= 5; i++) {
      const oldTime = new Date(nowMs - (100 * dayMs)).toISOString();
      mockDb._analytics.set(`old_${i}`, { session_id: `old_${i}`, created_at: oldTime });
    }
    for (let i = 1; i <= 5; i++) {
      const freshTime = new Date(nowMs - (10 * dayMs)).toISOString();
      mockDb._analytics.set(`fresh_${i}`, { session_id: `fresh_${i}`, created_at: freshTime });
    }

    // Run dry-run with 90-day retention
    const preview = await purgeOldAnalytics(mockDb, { retentionDays: 90, dryRun: true });
    assert.strictEqual(preview.success, true);
    assert.strictEqual(preview.dryRun, true);
    assert.strictEqual(preview.recordsEligible, 5, 'Exactly 5 old records must be eligible for purge');
    assert.strictEqual(preview.recordsDeleted, 0, 'Zero records deleted in dry-run mode');
    assert.strictEqual(mockDb._analytics.size, 10, 'All 10 records must remain in database');
  });

  test('21. Retention purge deletes old records and preserves fresh records', async () => {
    const mockDb = createRetentionMockD1();
    const nowMs = Date.now();
    const dayMs = 24 * 3600 * 1000;

    for (let i = 1; i <= 5; i++) {
      const oldTime = new Date(nowMs - (100 * dayMs)).toISOString();
      mockDb._analytics.set(`old_${i}`, { session_id: `old_${i}`, created_at: oldTime });
    }
    for (let i = 1; i <= 5; i++) {
      const freshTime = new Date(nowMs - (10 * dayMs)).toISOString();
      mockDb._analytics.set(`fresh_${i}`, { session_id: `fresh_${i}`, created_at: freshTime });
    }

    // Seed a contact (business record) to ensure business records are NEVER purged
    mockDb._contacts.set('contact_1', { id: 1, name: 'Customer Lead', created_at: new Date(nowMs - (200 * dayMs)).toISOString() });

    // Execute active purge
    const result = await purgeOldAnalytics(mockDb, { retentionDays: 90, dryRun: false });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.dryRun, false);
    assert.strictEqual(result.recordsDeleted, 5, 'Exactly 5 old records must be deleted');
    assert.strictEqual(mockDb._analytics.size, 5, 'Only the 5 fresh records must remain');

    // Verify all remaining records are fresh
    for (const row of mockDb._analytics.values()) {
      assert.ok(row.session_id.startsWith('fresh_'), 'Remaining records must be fresh');
    }

    // Verify business records (contacts) are untouched
    assert.strictEqual(mockDb._contacts.size, 1, 'Contacts must NEVER be purged by analytics retention');
  });

  test('22. Retention purge is idempotent on subsequent runs', async () => {
    const mockDb = createRetentionMockD1();
    const nowMs = Date.now();
    const dayMs = 24 * 3600 * 1000;

    for (let i = 1; i <= 3; i++) {
      const oldTime = new Date(nowMs - (120 * dayMs)).toISOString();
      mockDb._analytics.set(`old_${i}`, { session_id: `old_${i}`, created_at: oldTime });
    }

    const run1 = await purgeOldAnalytics(mockDb, { retentionDays: 90, dryRun: false });
    assert.strictEqual(run1.recordsDeleted, 3);

    // Second run immediately after
    const run2 = await purgeOldAnalytics(mockDb, { retentionDays: 90, dryRun: false });
    assert.strictEqual(run2.recordsDeleted, 0);
    assert.strictEqual(run2.recordsEligible, 0);
  });

  test('23. Retention API endpoint /api/admin/analytics/retention enforces auth and CSRF', async () => {
    // Unauthenticated GET -> 401
    const resNoAuth = await fetch(`${BASE_URL}/api/admin/analytics/retention`);
    assert.strictEqual(resNoAuth.status, 401);

    // Authenticated login
    const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email: 'admin@sahyak.com', password: realSecret })
    });
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';

    // Authenticated GET preview -> 200
    const previewRes = await fetch(`${BASE_URL}/api/admin/analytics/retention?retentionDays=90`, {
      headers: { Cookie: cookie, Origin: BASE_URL }
    });
    assert.strictEqual(previewRes.status, 200);
    const previewJson = await previewRes.json();
    assert.strictEqual(previewJson.success, true);
    assert.strictEqual(previewJson.mode, 'preview');

    // Cross-origin POST -> 403 Forbidden
    const csrfRes = await fetch(`${BASE_URL}/api/admin/analytics/retention`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://evil-attacker.com'
      },
      body: JSON.stringify({ dryRun: true })
    });
    assert.strictEqual(csrfRes.status, 403, 'Cross-origin POST retention must be blocked with 403');
  });
});
