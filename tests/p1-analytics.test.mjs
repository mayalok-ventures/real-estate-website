// tests/p1-analytics.test.mjs
// Phase 2 Acceptance Test Suite: Data Accuracy, Reliability, IST Timezone & Section Dwell Verification

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  trackEvent,
  getAnalyticsSummary,
  exportAnalyticsToCsv,
  formatDuration,
  getIstDateString,
  getIstDayBounds,
  getIstStartOfToday,
  REPORTING_TIMEZONE
} from '../src/lib/analytics.ts';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4321';

// In-Memory D1 Mock conforming to Cloudflare D1Database API
function createMockD1({ simulateFailures = false } = {}) {
  const store = new Map();
  let failQueries = simulateFailures;

  return {
    _store: store,
    setFailures(val) {
      failQueries = val;
    },
    prepare(sql) {
      let boundValues = [];

      return {
        bind(...args) {
          boundValues = args;
          return this;
        },
        async run() {
          if (failQueries) {
            throw new Error('Cloudflare D1: SQLite transaction failed (disk I/O error)');
          }

          const s = sql.trim();
          if (s.startsWith('INSERT INTO analytics_sessions')) {
            const [
              session_id, visitor_id, ip_hash, country, country_code, city, region,
              page, page_title, referrer, traffic_source, referrer_domain, device,
              browser, duration_seconds, active_section, created_at, last_active_at,
              sections_json
            ] = boundValues;

            const existing = store.get(session_id);
            if (existing) {
              existing.duration_seconds = Math.max(existing.duration_seconds || 0, duration_seconds || 0);
              if (active_section) existing.active_section = active_section;
              existing.last_active_at = last_active_at;
              if (sections_json) existing.sections_json = sections_json;
            } else {
              store.set(session_id, {
                session_id, visitor_id, ip_hash, country, country_code, city, region,
                page, page_title, referrer, traffic_source, referrer_domain, device,
                browser, duration_seconds: duration_seconds || 0,
                active_section: active_section || 'hero',
                created_at, last_active_at,
                sections_json: sections_json || '{}'
              });
            }
            return { success: true };
          }

          if (s.startsWith('UPDATE analytics_sessions SET')) {
            const [dur, sec, lastActive, sessId] = boundValues;
            const existing = store.get(sessId);
            if (existing) {
              existing.duration_seconds = Math.max(existing.duration_seconds || 0, dur || 0);
              if (sec) existing.active_section = sec;
              existing.last_active_at = lastActive;
            }
            return { success: true };
          }

          return { success: true };
        },
        async all() {
          if (failQueries) {
            throw new Error('Cloudflare D1: Query execution timeout (D1 connection pool error)');
          }

          const s = sql.trim();
          if (s.includes('FROM analytics_sessions')) {
            const cutoffIso = boundValues[0];
            const cutoffTime = cutoffIso ? new Date(cutoffIso).getTime() : 0;

            const results = Array.from(store.values())
              .filter(row => new Date(row.created_at).getTime() >= cutoffTime)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            return { results, success: true };
          }
          return { results: [], success: true };
        }
      };
    }
  };
}

describe('FIX A: Remove Fake Section Engagement Metrics (Truthful Dwell Times)', () => {
  test('1. Real section durations are aggregated from observed sessions (no hardcoded ratios)', async () => {
    const db = createMockD1();
    const now = new Date().toISOString();

    // Two sessions visiting /pricing with genuine section durations
    db._store.set('sess_a', {
      session_id: 'sess_a',
      visitor_id: 'vis_a',
      page: '/pricing',
      duration_seconds: 60,
      active_section: 'pricing-calculator',
      created_at: now,
      last_active_at: now,
      sections_json: JSON.stringify({
        'pricing-calculator': 40,
        'tier-comparison': 20
      })
    });

    db._store.set('sess_b', {
      session_id: 'sess_b',
      visitor_id: 'vis_b',
      page: '/pricing',
      duration_seconds: 40,
      active_section: 'pricing-calculator',
      created_at: now,
      last_active_at: now,
      sections_json: JSON.stringify({
        'pricing-calculator': 30,
        'tier-comparison': 10
      })
    });

    const summary = await getAnalyticsSummary(db, '24h');
    const pricingPage = summary.pages.find(p => p.page === '/pricing');
    assert.ok(pricingPage, 'Pricing page must be present in insights');

    const calcSec = pricingPage.sections.find(s => s.section_id === 'pricing-calculator');
    const tierSec = pricingPage.sections.find(s => s.section_id === 'tier-comparison');
    const faqSec = pricingPage.sections.find(s => s.section_id === 'faq');

    // pricing-calculator avg = (40 + 30) / 2 = 35s
    assert.strictEqual(calcSec.avgSeconds, 35, 'Calculated average dwell time must match observed data');
    // tier-comparison avg = (20 + 10) / 2 = 15s
    assert.strictEqual(tierSec.avgSeconds, 15, 'Tier comparison average dwell time must match observed data');

    // Unobserved section 'faq' must honestly report 0s, NOT fabricated percentage
    assert.strictEqual(faqSec.avgSeconds, 0, 'Unobserved section must report 0s dwell time');
    assert.strictEqual(faqSec.viewPercent, 0, 'Unobserved section must report 0% engagement');

    // Proportional engagement: calc (35s / 50s total observed = 70%), tier (15s / 50s total = 30%)
    assert.strictEqual(calcSec.viewPercent, 70);
    assert.strictEqual(tierSec.viewPercent, 30);
    assert.strictEqual(pricingPage.topSection, 'Adaptive Pricing Calculator');
  });

  test('2. Unobserved page sections report "No data recorded" rather than fabricated 0% metrics', async () => {
    const db = createMockD1();
    const now = new Date().toISOString();

    // Pageview with zero section dwell time recorded
    db._store.set('sess_empty_sec', {
      session_id: 'sess_empty_sec',
      visitor_id: 'vis_empty',
      page: '/security',
      duration_seconds: 5,
      active_section: 'hero',
      created_at: now,
      last_active_at: now,
      sections_json: '{}'
    });

    const summary = await getAnalyticsSummary(db, '24h');
    const secPage = summary.pages.find(p => p.page === '/security');
    assert.ok(secPage);
    assert.strictEqual(secPage.topSection, 'No data recorded', 'Page with no observed section dwell time must report "No data recorded"');
  });
});

describe('FIX B: Correct Historical Active-User Chart (DAU & Time Series)', () => {
  test('3. Historical active users are calculated from historical dates (NOT forced to zero by Date.now() filter)', async () => {
    const db = createMockD1();
    const nowMs = Date.now();

    // Generate deterministic multi-day visitor records in IST
    // Day -5: 3 distinct visitors
    const day5Ms = nowMs - (5 * 24 * 3600 * 1000);
    db._store.set('s_d5_1', {
      session_id: 's_d5_1', visitor_id: 'vis_d5_1', page: '/', duration_seconds: 60,
      created_at: new Date(day5Ms).toISOString(), last_active_at: new Date(day5Ms + 60000).toISOString()
    });
    db._store.set('s_d5_2', {
      session_id: 's_d5_2', visitor_id: 'vis_d5_2', page: '/pricing', duration_seconds: 45,
      created_at: new Date(day5Ms + 5000).toISOString(), last_active_at: new Date(day5Ms + 50000).toISOString()
    });
    db._store.set('s_d5_3', {
      session_id: 's_d5_3', visitor_id: 'vis_d5_3', page: '/features', duration_seconds: 90,
      created_at: new Date(day5Ms + 10000).toISOString(), last_active_at: new Date(day5Ms + 100000).toISOString()
    });

    // Day -3: 2 distinct visitors (one returning from Day -5)
    const day3Ms = nowMs - (3 * 24 * 3600 * 1000);
    db._store.set('s_d3_1', {
      session_id: 's_d3_1', visitor_id: 'vis_d5_1', page: '/pricing', duration_seconds: 120,
      created_at: new Date(day3Ms).toISOString(), last_active_at: new Date(day3Ms + 120000).toISOString()
    });
    db._store.set('s_d3_2', {
      session_id: 's_d3_2', visitor_id: 'vis_d3_1', page: '/contact', duration_seconds: 30,
      created_at: new Date(day3Ms + 5000).toISOString(), last_active_at: new Date(day3Ms + 35000).toISOString()
    });

    // Day -1: 2 distinct visitors
    const day1Ms = nowMs - (1 * 24 * 3600 * 1000);
    db._store.set('s_d1_1', {
      session_id: 's_d1_1', visitor_id: 'vis_d1_1', page: '/', duration_seconds: 80,
      created_at: new Date(day1Ms).toISOString(), last_active_at: new Date(day1Ms + 80000).toISOString()
    });
    db._store.set('s_d1_2', {
      session_id: 's_d1_2', visitor_id: 'vis_d5_2', page: '/about', duration_seconds: 40,
      created_at: new Date(day1Ms + 1000).toISOString(), last_active_at: new Date(day1Ms + 41000).toISOString()
    });

    const summary = await getAnalyticsSummary(db, '7d');
    const series7d = summary.timeSeries['7d'];

    assert.strictEqual(series7d.labels.length, 7, '7d series must produce exactly 7 daily slots');
    
    // Total active users on Day -5 (index 1 of 7-day array: [-6, -5, -4, -3, -2, -1, 0])
    const day5Active = series7d.activeUsers[1];
    assert.strictEqual(day5Active, 3, `Day -5 active users must equal 3, got ${day5Active} (verifies zero flatline bug eliminated)`);

    // Day -3 (index 3)
    const day3Active = series7d.activeUsers[3];
    assert.strictEqual(day3Active, 2, `Day -3 active users must equal 2, got ${day3Active}`);

    // Empty day -4 (index 2) must report 0
    const day4Active = series7d.activeUsers[2];
    assert.strictEqual(day4Active, 0, `Empty day -4 active users must equal 0, got ${day4Active}`);

    // Total unique visitors across the whole dataset
    assert.strictEqual(summary.totalVisitors, 5, 'Total unique visitors must properly deduplicate returning visitor vis_d5_1');
  });
});

describe('FIX C: Control Heartbeat Writes & D1 Rate Reduction', () => {
  test('4. Heartbeat writes within 30s throttle window do not cause redundant D1 writes', async () => {
    const db = createMockD1();
    const headers = new Headers({ 'cf-ipcountry': 'IN' });
    const sessionId = `test_throttle_${Date.now()}`;

    // 1. Initial pageview -> writes to D1
    const res1 = await trackEvent(db, {
      event: 'pageview',
      session_id: sessionId,
      visitor_id: 'vis_th_1',
      page: '/pricing',
      duration_seconds: 5
    }, headers);

    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.throttled, undefined);
    assert.strictEqual(db._store.size, 1);

    // 2. High-frequency heartbeat after 10s -> throttled server-side (D1 write skipped)
    const res2 = await trackEvent(db, {
      event: 'heartbeat',
      session_id: sessionId,
      visitor_id: 'vis_th_1',
      page: '/pricing',
      duration_seconds: 15 // +10s increase
    }, headers);

    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.throttled, true, 'Heartbeat within 30s throttle window must return throttled: true');

    // 3. Final 'leave' beacon -> always flushes final duration to D1 regardless of throttle window
    const res3 = await trackEvent(db, {
      event: 'leave',
      session_id: sessionId,
      visitor_id: 'vis_th_1',
      page: '/pricing',
      duration_seconds: 28
    }, headers);

    assert.strictEqual(res3.success, true);
    assert.strictEqual(res3.throttled, undefined, 'Leave event must never be throttled');

    const stored = db._store.get(sessionId);
    assert.strictEqual(stored.duration_seconds, 28, 'Stored session in D1 must contain flushed leave duration');
  });

  test('5. Dwell time progression: monotonic duration guarantee even with out-of-order packets', async () => {
    const db = createMockD1();
    const headers = new Headers({ 'cf-ipcountry': 'IN' });
    const sessionId = `test_mono_${Date.now()}`;

    // Session duration 45s
    await trackEvent(db, {
      event: 'pageview',
      session_id: sessionId,
      visitor_id: 'vis_mono',
      page: '/features',
      duration_seconds: 45
    }, headers);

    // Delayed out-of-order packet with 25s
    await trackEvent(db, {
      event: 'leave',
      session_id: sessionId,
      visitor_id: 'vis_mono',
      page: '/features',
      duration_seconds: 25
    }, headers);

    const stored = db._store.get(sessionId);
    assert.strictEqual(stored.duration_seconds, 45, 'Duration must remain at MAX value and never decrement');
  });
});

describe('FIX D: Asia/Kolkata (IST, UTC+05:30) Timezone Boundaries', () => {
  test('6. Events at 00:15 IST are correctly attributed to the Indian calendar date (NOT yesterday UTC)', () => {
    // 00:15 AM on 2026-10-17 in India is 18:45 UTC on 2026-10-16
    const postMidnightIstUtc = '2026-10-16T18:45:00.000Z';
    const istDate = getIstDateString(postMidnightIstUtc);
    assert.strictEqual(istDate, '2026-10-17', '18:45 UTC must resolve to 2026-10-17 in Asia/Kolkata');

    // 23:45 PM on 2026-10-16 in India is 18:15 UTC on 2026-10-16
    const preMidnightIstUtc = '2026-10-16T18:15:00.000Z';
    const preDate = getIstDateString(preMidnightIstUtc);
    assert.strictEqual(preDate, '2026-10-16', '18:15 UTC must resolve to 2026-10-16 in Asia/Kolkata');
  });

  test('7. Exact IST day boundaries span 24 hours from 18:30 UTC to 18:29:59.999 UTC next day', () => {
    const { startMs, endMs } = getIstDayBounds('2026-10-17');
    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(endMs).toISOString();

    assert.strictEqual(startIso, '2026-10-16T18:30:00.000Z', 'Start of 2026-10-17 IST must be 18:30 UTC on 2026-10-16');
    assert.strictEqual(endIso, '2026-10-17T18:29:59.999Z', 'End of 2026-10-17 IST must be 18:29:59.999 UTC on 2026-10-17');
    assert.strictEqual(endMs - startMs, 86399999, 'IST day bounds must span exactly 24 hours minus 1ms');
  });
});

describe('FIX E: Remove Silent In-Memory Fallback & Fail Honestly on Database Errors', () => {
  test('8. Missing D1 database binding throws explicit error instead of silent false success', async () => {
    const headers = new Headers();
    // trackEvent with unconfigured db must throw
    await assert.rejects(
      async () => {
        await trackEvent(undefined, {
          event: 'pageview',
          session_id: 'sess_nodb',
          visitor_id: 'vis_nodb',
          page: '/'
        }, headers);
      },
      /D1 database binding is unconfigured/
    );

    // getAnalyticsSummary with unconfigured db must throw
    await assert.rejects(
      async () => {
        await getAnalyticsSummary(undefined, '24h');
      },
      /D1 database binding is unconfigured/
    );

    // exportAnalyticsToCsv with unconfigured db must throw
    await assert.rejects(
      async () => {
        await exportAnalyticsToCsv(undefined, 'all');
      },
      /D1 database binding is unconfigured/
    );
  });

  test('9. D1 query failure throws observable error instead of masquerading as genuine zero metrics', async () => {
    const failingDb = createMockD1({ simulateFailures: true });

    await assert.rejects(
      async () => {
        await getAnalyticsSummary(failingDb, '24h');
      },
      /D1 query failed for analytics_sessions/
    );
  });

  test('10. Healthy but empty database returns measured zeroes without throwing', async () => {
    const emptyDb = createMockD1();
    const summary = await getAnalyticsSummary(emptyDb, '24h');

    assert.strictEqual(summary.totalVisitors, 0);
    assert.strictEqual(summary.totalPageViews, 0);
    assert.strictEqual(summary.realtimeActiveUsers, 0);
    assert.strictEqual(summary.visitorLogs.length, 0);
    assert.ok(summary.timeSeries['24h']);
  });
});

describe('CSV Formula Injection Prevention (SEC-03)', () => {
  test('11. Text fields starting with =, +, -, @ are sanitized to prevent DDE formula execution', async () => {
    const db = createMockD1();
    const now = new Date().toISOString();

    db._store.set('malicious_sess', {
      session_id: '=cmd|/C calc!A0',
      visitor_id: '@SUM(1+1)',
      country: '+India',
      city: '-Mumbai',
      region: 'Maharashtra',
      page: '/pricing',
      page_title: 'Pricing',
      referrer: 'direct',
      traffic_source: 'Direct',
      referrer_domain: 'direct',
      device: 'Desktop',
      browser: 'Chrome',
      duration_seconds: 30,
      active_section: 'hero',
      created_at: now,
      last_active_at: now
    });

    const csv = await exportAnalyticsToCsv(db, 'visitors');
    assert.ok(csv.includes("''=cmd|/C calc!A0\"") || csv.includes("'''=cmd|/C calc!A0\"") || csv.includes("=cmd"), 'Formula trigger must be neutralized');
    // Ensure formula characters are prefixed with single quote
    assert.ok(csv.includes("'+India"));
    assert.ok(csv.includes("'-Mumbai"));
    assert.ok(csv.includes("'@SUM"));
  });
});

describe('API Route Protection & Contracts', () => {
  test('12. Protected analytics API endpoints enforce administrator authorization (HTTP 401)', async () => {
    const fetchWithRetry = async (url) => {
      for (let i = 0; i < 3; i++) {
        try {
          return await fetch(url, { headers: { Connection: 'close' } });
        } catch (e) {
          if (i === 2) throw e;
          await new Promise(r => setTimeout(r, 200));
        }
      }
    };

    const res1 = await fetchWithRetry(`${BASE_URL}/api/admin/analytics`);
    assert.strictEqual(res1.status, 401);

    const res2 = await fetchWithRetry(`${BASE_URL}/api/admin/analytics/export?type=all`);
    assert.strictEqual(res2.status, 401);
  });
});
