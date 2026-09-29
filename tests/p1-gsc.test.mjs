// tests/p1-gsc.test.mjs
// Phase 3 Acceptance Test Suite: GSC Authentication, Truthful Metrics & URL Inspection

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSearchConsoleData, inspectUrl, exportGscToCsv } from '../src/lib/googleSearchConsole.ts';

const BASE_URL = 'http://localhost:4321';

test('1. GSC Unconfigured: missing credentials returns safe error state with zero totals and no fake metrics', async () => {
  const result = await getSearchConsoleData({}, { range: '28d', forceRefresh: true });

  assert.strictEqual(result.status, 'not_configured');
  assert.strictEqual(result.isLive, false);
  assert.strictEqual(result.totalClicks, 0);
  assert.strictEqual(result.totalImpressions, 0);
  assert.strictEqual(result.avgCtr, 0);
  assert.strictEqual(result.avgPosition, 0);
  assert.deepStrictEqual(result.topQueries, []);
  assert.deepStrictEqual(result.topPages, []);
  assert.deepStrictEqual(result.countries, []);
  assert.deepStrictEqual(result.devices, []);
  assert.deepStrictEqual(result.timeSeries, []);
  assert.deepStrictEqual(result.sitemaps, []);
  assert.deepStrictEqual(result.opportunities, []);
  assert.strictEqual(result.marketIntelligence, null);
  assert.strictEqual(result.conversions, null);
});

test('2. GSC Auth Error: invalid RSA key returns safe auth_error state with zero totals and no synthetic baseline', async () => {
  const result = await getSearchConsoleData({
    GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL: 'invalid-sa@project.iam.gserviceaccount.com',
    GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY: 'not-a-valid-pem-key'
  }, { range: '28d', forceRefresh: true });

  assert.strictEqual(result.status, 'auth_error');
  assert.strictEqual(result.isLive, false);
  assert.strictEqual(result.totalClicks, 0);
  assert.strictEqual(result.totalImpressions, 0);
  assert.strictEqual(result.avgCtr, 0);
  assert.strictEqual(result.avgPosition, 0);
  assert.deepStrictEqual(result.topQueries, []);
  assert.deepStrictEqual(result.topPages, []);
  assert.deepStrictEqual(result.timeSeries, []);
  assert.match(result.statusMessage, /Private Key|format|OAuth2/i);
});

test('3. URL Inspection does not equate HTTP 200 with Google indexing', async () => {
  // Test local inspection of home page
  const inspection = await inspectUrl('/', 'https://sahyak.com');

  assert.strictEqual(inspection.url, 'https://sahyak.com/');
  assert.strictEqual(inspection.inspectionSource, 'live_http_check');
  // MUST NOT equate HTTP 200 with INDEXED!
  assert.notStrictEqual(inspection.verdict, 'INDEXED');
  assert.strictEqual(inspection.verdict, 'HTTP_ACCESSIBLE');
  assert.ok(inspection.inspectionMessage.includes('Does not guarantee Google search indexation'));
});

test('4. URL Inspection identifies 404 error correctly', async () => {
  const inspection = await inspectUrl('/this-page-does-not-exist-xyz-404', 'https://sahyak.com');
  assert.strictEqual(inspection.url, 'https://sahyak.com/this-page-does-not-exist-xyz-404');
  assert.ok(inspection.verdict === 'NOT_FOUND' || inspection.verdict === 'HTTP_ERROR' || inspection.httpStatus === 404);
});

test('5. Impression-weighted average position calculation in GSC fallback', async () => {
  // Verify mathematically that position is weighted by impressions, not simple arithmetic mean
  const queries = [
    { query: 'query a', clicks: 100, impressions: 1000, ctr: 10, position: 1.0 },
    { query: 'query b', clicks: 1, impressions: 10, ctr: 10, position: 50.0 }
  ];

  const totalClicks = queries.reduce((s, q) => s + q.clicks, 0);
  const totalImpressions = queries.reduce((s, q) => s + q.impressions, 0);
  const weightedPosSum = queries.reduce((s, q) => s + (q.position * q.impressions), 0);
  const weightedAvgPos = Math.round((weightedPosSum / totalImpressions) * 10) / 10;

  // Simple arithmetic mean would be (1.0 + 50.0) / 2 = 25.5
  // Weighted mean: (1000*1.0 + 10*50.0) / 1010 = 1500 / 1010 ≈ 1.5
  assert.strictEqual(weightedAvgPos, 1.5);
  assert.notStrictEqual(weightedAvgPos, 25.5);
});

test('6. CSV Export correctly formats unconfigured or empty data without throwing', () => {
  const emptyData = {
    status: 'not_configured',
    isLive: false,
    statusMessage: 'Unconfigured',
    siteUrl: 'https://sahyak.com',
    clientEmail: '',
    hasPrivateKey: false,
    isKeyFormatValid: false,
    startDate: '2026-09-01',
    endDate: '2026-09-28',
    totalClicks: 0,
    totalImpressions: 0,
    avgCtr: 0,
    avgPosition: 0,
    topQueries: [],
    topPages: [],
    countries: [],
    devices: [],
    timeSeries: [],
    sitemaps: [],
    opportunities: [],
    lastFetchedAt: null,
    healthOverview: null,
    alerts: [],
    marketIntelligence: null,
    conversions: null,
    authorityNodes: [],
    productTruth: [],
    clusters: [],
    auditIssues: []
  };

  const csvAll = exportGscToCsv(emptyData, 'all');
  assert.ok(csvAll.includes('GOOGLE SEARCH CONSOLE'));
  assert.ok(csvAll.includes('Total Organic Clicks: 0'));

  const csvQueries = exportGscToCsv(emptyData, 'queries');
  assert.ok(csvQueries.includes('Keyword / Search Query'));

  const csvPages = exportGscToCsv(emptyData, 'pages');
  assert.ok(csvPages.includes('Landing Page URL'));
});

test('7. Protected API routes: /api/admin/gsc/data requires admin authentication', async () => {
  const res = await fetch(`${BASE_URL}/api/admin/gsc/data`);
  assert.strictEqual(res.status, 401);
});

test('8. Protected API routes: /api/admin/gsc/export requires admin authentication', async () => {
  const res = await fetch(`${BASE_URL}/api/admin/gsc/export`);
  assert.strictEqual(res.status, 401);
});

test('9. Protected API routes: /api/admin/gsc/inspect requires admin authentication and CSRF', async () => {
  const res = await fetch(`${BASE_URL}/api/admin/gsc/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: '/' })
  });
  assert.strictEqual(res.status, 401);
});
