// tests/p1-analytics.test.mjs
// Phase 4 Acceptance Test Suite: D1-backed Analytics Persistence, Idempotency & Export Reliability

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackEvent, getAnalyticsSummary, exportAnalyticsToCsv } from '../src/lib/analytics.ts';

const BASE_URL = 'http://localhost:4321';

// In-Memory D1 Mock conforming to Cloudflare D1Database API
function createMockD1() {
  const store = new Map();

  return {
    _store: store,
    prepare(sql) {
      let boundValues = [];

      return {
        bind(...args) {
          boundValues = args;
          return this;
        },
        async run() {
          const s = sql.trim();
          if (s.startsWith('INSERT INTO analytics_sessions')) {
            const [
              session_id, visitor_id, ip_hash, country, country_code, city, region,
              page, page_title, referrer, traffic_source, referrer_domain, device,
              browser, duration_seconds, active_section, created_at, last_active_at
            ] = boundValues;

            const existing = store.get(session_id);
            if (existing) {
              // ON CONFLICT(session_id) DO UPDATE SET duration_seconds = MAX(...), active_section = COALESCE(...), last_active_at = ...
              existing.duration_seconds = Math.max(existing.duration_seconds || 0, duration_seconds || 0);
              if (active_section) existing.active_section = active_section;
              existing.last_active_at = last_active_at;
            } else {
              store.set(session_id, {
                session_id, visitor_id, ip_hash, country, country_code, city, region,
                page, page_title, referrer, traffic_source, referrer_domain, device,
                browser, duration_seconds: duration_seconds || 0,
                active_section: active_section || 'hero',
                created_at, last_active_at
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

test('1. Track Event: writes new visitor session into D1 database', async () => {
  const db = createMockD1();
  const headers = new Headers({
    'cf-ipcountry': 'IN',
    'cf-ipcity': 'Bengaluru',
    'cf-region': 'Karnataka',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  });

  const sessionId = `test_sess_001_${Date.now()}`;
  const res = await trackEvent(db, {
    event: 'pageview',
    session_id: sessionId,
    visitor_id: 'vis_test_1',
    page: '/pricing',
    page_title: 'Pricing & Plans',
    referrer: 'https://www.google.com/search?q=sahyak+crm',
    duration_seconds: 15,
    active_section: 'pricing-calculator'
  }, headers);

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.session_id, sessionId);

  // Verify stored in D1
  const stored = db._store.get(sessionId);
  assert.ok(stored, 'Session must be stored in D1 database');
  assert.strictEqual(stored.country, 'India');
  assert.strictEqual(stored.city, 'Bengaluru');
  assert.strictEqual(stored.traffic_source, 'Google');
  assert.strictEqual(stored.duration_seconds, 15);
  assert.strictEqual(stored.page, '/pricing');
});

test('2. Idempotency: repeated / retried event delivery does not duplicate sessions', async () => {
  const db = createMockD1();
  const headers = new Headers({ 'cf-ipcountry': 'IN' });
  const sessionId = `test_sess_idempotent_${Date.now()}`;

  // Deliver event once
  await trackEvent(db, {
    event: 'pageview',
    session_id: sessionId,
    visitor_id: 'vis_test_idem',
    page: '/',
    duration_seconds: 10
  }, headers);

  // Deliver identical event again (network retry simulation)
  await trackEvent(db, {
    event: 'pageview',
    session_id: sessionId,
    visitor_id: 'vis_test_idem',
    page: '/',
    duration_seconds: 10
  }, headers);

  // Verify only 1 record exists in D1
  assert.strictEqual(db._store.size, 1, 'Idempotent delivery must not create duplicate session rows');
});

test('3. Dwell time progression: duration updates monotonically and never decrements', async () => {
  const db = createMockD1();
  const headers = new Headers({ 'cf-ipcountry': 'IN' });
  const sessionId = `test_sess_dur_${Date.now()}`;

  // First heartbeat: 30s
  await trackEvent(db, {
    event: 'heartbeat',
    session_id: sessionId,
    visitor_id: 'vis_dur',
    page: '/features',
    duration_seconds: 30
  }, headers);

  // Delayed / out-of-order packet with 20s
  await trackEvent(db, {
    event: 'heartbeat',
    session_id: sessionId,
    visitor_id: 'vis_dur',
    page: '/features',
    duration_seconds: 20
  }, headers);

  const stored = db._store.get(sessionId);
  assert.strictEqual(stored.duration_seconds, 30, 'Duration must remain at MAX value and never decrement');
});

test('4. Worker Restart Persistence: D1 serves historical summaries even if isolate memory is empty', async () => {
  const db = createMockD1();
  const now = new Date();

  // Populate D1 directly as if persisted before worker restart
  db._store.set('restart_sess_1', {
    session_id: 'restart_sess_1',
    visitor_id: 'vis_restart_1',
    country: 'India',
    country_code: 'IN',
    city: 'Mumbai',
    region: 'Maharashtra',
    page: '/pricing',
    page_title: 'Pricing',
    referrer: 'direct',
    traffic_source: 'Direct',
    referrer_domain: 'direct',
    device: 'Desktop',
    browser: 'Chrome',
    duration_seconds: 60,
    active_section: 'pricing-calculator',
    created_at: now.toISOString(),
    last_active_at: now.toISOString()
  });

  db._store.set('restart_sess_2', {
    session_id: 'restart_sess_2',
    visitor_id: 'vis_restart_2',
    country: 'United States',
    country_code: 'US',
    city: 'New York',
    region: 'New York',
    page: '/security',
    page_title: 'Security',
    referrer: 'https://linkedin.com',
    traffic_source: 'LinkedIn',
    referrer_domain: 'linkedin.com',
    device: 'Mobile',
    browser: 'Safari',
    duration_seconds: 90,
    active_section: 'data-protection',
    created_at: now.toISOString(),
    last_active_at: now.toISOString()
  });

  // Call getAnalyticsSummary with db
  const summary = await getAnalyticsSummary(db, '24h');

  assert.strictEqual(summary.totalVisitors >= 2, true, 'Total unique visitors must reflect D1 persisted data');
  assert.strictEqual(summary.totalPageViews >= 2, true, 'Total pageviews must reflect D1 persisted data');
  assert.ok(summary.trafficChannels.some(c => c.channel === 'LinkedIn'));
  assert.ok(summary.pages.some(p => p.page === '/pricing' && p.totalViews >= 1));
});

test('5. CSV Export matches D1 database persisted source data', async () => {
  const db = createMockD1();
  const now = new Date().toISOString();

  db._store.set('export_sess_1', {
    session_id: 'export_sess_1',
    visitor_id: 'vis_export_1',
    country: 'India',
    country_code: 'IN',
    city: 'Hyderabad',
    region: 'Telangana',
    page: '/contact',
    page_title: 'Contact',
    referrer: 'https://wa.me/919999999999',
    traffic_source: 'WhatsApp',
    referrer_domain: 'wa.me',
    device: 'Mobile',
    browser: 'Chrome',
    duration_seconds: 45,
    active_section: 'contact-form',
    created_at: now,
    last_active_at: now
  });

  const csv = await exportAnalyticsToCsv(db, 'visitors');
  assert.ok(csv.includes('export_sess_1'));
  assert.ok(csv.includes('vis_export_1'));
  assert.ok(csv.includes('WhatsApp'));
  assert.ok(csv.includes('Hyderabad'));
});

test('6. Protected API endpoints enforce admin authorization', async () => {
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
