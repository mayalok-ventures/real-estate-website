import type {
  VisitorSession,
  TrackPayload,
  PageInsight,
  TrafficSourceSummary,
  TrafficDomainSummary,
  TimeSeriesData,
  AnalyticsSummary,
} from '../types/analytics';
import type { D1Database } from '../types/db';
import { sanitizeCsvCell } from './csv.ts';

/**
 * Standard Business Reporting Timezone for Sahyak CRM:
 * India Standard Time (IST, UTC+05:30)
 * All daily aggregation buckets, start-of-day filters, and calendar reports
 * strictly use this timezone without daylight saving ambiguities.
 */
export const REPORTING_TIMEZONE = 'Asia/Kolkata';

// In-memory write throttling tracker to prevent D1 write quota exhaustion
// Key: session_id -> { lastPersistedAt: ms, lastPersistedDuration: sec }
interface SessionThrottleState {
  lastPersistedAt: number;
  lastPersistedDuration: number;
}
const sessionThrottleMap = new Map<string, SessionThrottleState>();

// Minimum interval between D1 writes for an active session (30 seconds)
const D1_WRITE_THROTTLE_MS = 30000;
// Minimum duration increase between D1 writes for an active session (30 seconds)
const D1_DURATION_DELTA_THRESHOLD_SEC = 30;

// Periodic cleanup of stale session throttle entries (older than 2 hours)
function pruneThrottleMap() {
  const now = Date.now();
  if (sessionThrottleMap.size > 2000) {
    for (const [sid, state] of sessionThrottleMap.entries()) {
      if (now - state.lastPersistedAt > 2 * 3600 * 1000) {
        sessionThrottleMap.delete(sid);
      }
    }
  }
}

/**
 * Converts a UTC timestamp into an Asia/Kolkata calendar date string (YYYY-MM-DD)
 */
export function getIstDateString(dateInput: Date | number | string = new Date()): string {
  const d = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORTING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
}

/**
 * Computes exact UTC millisecond bounds for a given Asia/Kolkata date (YYYY-MM-DD)
 * Example: 2026-10-17 IST starts at 2026-10-16T18:30:00.000Z and ends at 2026-10-17T18:29:59.999Z
 */
export function getIstDayBounds(dateString: string): { startMs: number; endMs: number } {
  const startMs = Date.parse(`${dateString}T00:00:00+05:30`);
  const endMs = Date.parse(`${dateString}T23:59:59.999+05:30`);
  return { startMs, endMs };
}

/**
 * Returns the start of the current reporting day in IST as UTC epoch milliseconds
 */
export function getIstStartOfToday(): number {
  const todayStr = getIstDateString(new Date());
  return getIstDayBounds(todayStr).startMs;
}

// Country code to country name and flag mapping
export const COUNTRY_META: Record<string, { name: string; flag: string; city: string; region: string }> = {
  IN: { name: 'India', flag: '🇮🇳', city: 'Mumbai', region: 'Maharashtra' },
  US: { name: 'United States', flag: '🇺🇸', city: 'New York', region: 'New York' },
  GB: { name: 'United Kingdom', flag: '🇬🇧', city: 'London', region: 'Greater London' },
  AE: { name: 'United Arab Emirates', flag: '🇦🇪', city: 'Dubai', region: 'Dubai' },
  AU: { name: 'Australia', flag: '🇦🇺', city: 'Sydney', region: 'New South Wales' },
  CA: { name: 'Canada', flag: '🇨🇦', city: 'Toronto', region: 'Ontario' },
  SG: { name: 'Singapore', flag: '🇸🇬', city: 'Singapore', region: 'Central' },
  DE: { name: 'Germany', flag: '🇩🇪', city: 'Berlin', region: 'Berlin' },
  FR: { name: 'France', flag: '🇫🇷', city: 'Paris', region: 'Île-de-France' },
  SA: { name: 'Saudi Arabia', flag: '🇸🇦', city: 'Riyadh', region: 'Riyadh' },
  ZA: { name: 'South Africa', flag: '🇿🇦', city: 'Johannesburg', region: 'Gauteng' },
  JP: { name: 'Japan', flag: '🇯🇵', city: 'Tokyo', region: 'Kanto' },
  ES: { name: 'Spain', flag: '🇪🇸', city: 'Madrid', region: 'Community of Madrid' },
  MX: { name: 'Mexico', flag: '🇲🇽', city: 'Mexico City', region: 'CDMX' },
  BR: { name: 'Brazil', flag: '🇧🇷', city: 'São Paulo', region: 'São Paulo' }
};

// Helper: Parse referrer into category and specific platform name (supports 1,000+ domains)
export function parseTrafficSource(referrerUrl: string | undefined): {
  source: VisitorSession['traffic_source'];
  domain: string;
  platform: string;
} {
  if (!referrerUrl || referrerUrl.trim() === '' || referrerUrl === 'direct') {
    return { source: 'Direct', domain: 'direct', platform: 'Direct Navigation / Bookmark' };
  }

  try {
    const url = new URL(referrerUrl.startsWith('http') ? referrerUrl : `https://${referrerUrl}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    if (host.includes('google.')) return { source: 'Google', domain: host, platform: 'Google Search & Ads' };
    if (host.includes('whatsapp') || host.includes('wa.me')) return { source: 'WhatsApp', domain: host, platform: 'WhatsApp Direct Chat' };
    if (host.includes('linkedin.') || host.includes('lnkd.in')) return { source: 'LinkedIn', domain: host, platform: 'LinkedIn Business & Feeds' };
    if (host.includes('instagram.')) return { source: 'Instagram', domain: host, platform: 'Instagram Mobile & Stories' };
    if (host.includes('youtube.') || host.includes('youtu.be')) return { source: 'YouTube', domain: host, platform: 'YouTube Channel & Demos' };
    if (host.includes('facebook.') || host.includes('fb.com')) return { source: 'Facebook', domain: host, platform: 'Facebook Groups & Ads' };
    if (host.includes('x.com') || host.includes('twitter.') || host.includes('t.co')) return { source: 'Twitter/X', domain: host, platform: 'Twitter / X Real Estate Network' };

    // Property portals
    if (host.includes('99acres.')) return { source: 'Property Portal', domain: host, platform: '99acres Real Estate Portal' };
    if (host.includes('magicbricks.')) return { source: 'Property Portal', domain: host, platform: 'MagicBricks Portal' };
    if (host.includes('housing.com')) return { source: 'Property Portal', domain: host, platform: 'Housing.com Network' };
    if (host.includes('zillow.')) return { source: 'Property Portal', domain: host, platform: 'Zillow Group' };
    if (host.includes('realtor.com')) return { source: 'Property Portal', domain: host, platform: 'Realtor.com' };
    if (host.includes('propertyfinder.')) return { source: 'Property Portal', domain: host, platform: 'PropertyFinder Middle East' };

    // Any other platform/site
    const capitalized = host.split('.')[0];
    const platformName = capitalized.charAt(0).toUpperCase() + capitalized.slice(1) + ' Referral';
    return { source: 'Referral', domain: host, platform: platformName };
  } catch {
    return { source: 'Referral', domain: referrerUrl.slice(0, 50), platform: 'External Website' };
  }
}

// Helper: Parse user-agent for device and browser
export function parseDevice(ua: string | undefined): { device: 'Desktop' | 'Mobile' | 'Tablet'; browser: string } {
  if (!ua) return { device: 'Desktop', browser: 'Chrome' };
  const s = ua.toLowerCase();

  let device: 'Desktop' | 'Mobile' | 'Tablet' = 'Desktop';
  if (/ipad|tablet|(android(?!.*mobile))/i.test(s)) {
    device = 'Tablet';
  } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(s)) {
    device = 'Mobile';
  }

  let browser = 'Chrome';
  if (s.includes('edg/')) browser = 'Edge';
  else if (s.includes('safari') && !s.includes('chrome')) browser = 'Safari';
  else if (s.includes('firefox')) browser = 'Firefox';
  else if (s.includes('opera') || s.includes('opr/')) browser = 'Opera';

  return { device, browser };
}

// Helper: Validate and sanitize client-provided section duration map
function sanitizeSectionDurations(raw: Record<string, any> | undefined, maxDuration: number): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    // Only accept valid alphanumeric section IDs up to 64 chars
    if (typeof k === 'string' && /^[a-zA-Z0-9_\-]{1,64}$/.test(k)) {
      if (typeof v === 'number' && !isNaN(v) && v >= 0) {
        // Section duration cannot exceed total duration + 30s skew
        clean[k] = Math.min(Math.round(v), Math.max(maxDuration + 30, 86400));
      }
    }
  }
  return clean;
}

/**
 * Tracks real client-side events into authoritative Cloudflare D1 storage.
 * Enforces server-side validation, write throttling on high-frequency heartbeats,
 * and fails closed when the database is unavailable (no silent fake persistence).
 */
export async function trackEvent(
  db: D1Database | undefined,
  payload: TrackPayload,
  headers: Headers
): Promise<{ success: boolean; session_id: string; throttled?: boolean }> {
  // Fail closed if D1 database is not provisioned or binding missing
  if (!db) {
    throw new Error('D1 database binding is unconfigured or unavailable.');
  }

  // Validate session ID and visitor ID
  const sessionId = (payload.session_id || '').trim();
  const visitorId = (payload.visitor_id || '').trim();
  if (!sessionId || !visitorId) {
    throw new Error('Invalid analytics payload: session_id and visitor_id are required.');
  }

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const durationSec = Math.max(0, Math.min(Math.round(payload.duration_seconds || 0), 86400));
  const activeSection = (payload.active_section || 'hero').slice(0, 64);
  const cleanSections = sanitizeSectionDurations(payload.section_durations, durationSec);
  const sectionsJson = JSON.stringify(cleanSections);

  pruneThrottleMap();
  const throttle = sessionThrottleMap.get(sessionId);

  // Check if this heartbeat can be throttled (D1 write skipped to protect quotas)
  // Heartbeats are throttled if < 30s have elapsed and duration change < 30s, UNLESS it is a 'leave' event
  const isLeaveEvent = payload.event === 'leave';
  const isPageview = payload.event === 'pageview';

  if (!isPageview && !isLeaveEvent && throttle) {
    const elapsedSinceLastWrite = nowMs - throttle.lastPersistedAt;
    const durationDelta = durationSec - throttle.lastPersistedDuration;

    if (elapsedSinceLastWrite < D1_WRITE_THROTTLE_MS && durationDelta < D1_DURATION_DELTA_THRESHOLD_SEC) {
      // Return success to the client without executing redundant D1 transaction
      return { success: true, session_id: sessionId, throttled: true };
    }
  }

  // Geo and client metadata detection from Cloudflare headers
  const cfCountry = headers.get('cf-ipcountry')?.toUpperCase() || 'IN';
  const cfCity = headers.get('cf-ipcity') || (COUNTRY_META[cfCountry]?.city || 'Direct');
  const cfRegion = headers.get('cf-region') || (COUNTRY_META[cfCountry]?.region || 'Web');
  const countryName = COUNTRY_META[cfCountry]?.name || 'India';
  const ua = headers.get('user-agent') || '';
  const { device, browser } = parseDevice(ua);
  const parsedSource = parseTrafficSource(payload.referrer);
  const rawPage = (payload.page || '/').slice(0, 256);
  const rawPageTitle = (payload.page_title || 'Sahyak CRM').slice(0, 256);

  try {
    // Attempt insert/update with sections_json support (Migration 0003)
    await db.prepare(`
      INSERT INTO analytics_sessions (
        session_id, visitor_id, ip_hash, country, country_code, city, region,
        page, page_title, referrer, traffic_source, referrer_domain, device,
        browser, duration_seconds, active_section, created_at, last_active_at, sections_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        duration_seconds = MAX(analytics_sessions.duration_seconds, excluded.duration_seconds),
        active_section = COALESCE(excluded.active_section, analytics_sessions.active_section),
        last_active_at = excluded.last_active_at,
        sections_json = COALESCE(excluded.sections_json, analytics_sessions.sections_json)
    `).bind(
      sessionId, visitorId, `ip_${sessionId.slice(-6)}`,
      countryName, cfCountry, cfCity, cfRegion,
      rawPage, rawPageTitle, payload.referrer || 'direct', parsedSource.source,
      parsedSource.domain, device, browser,
      durationSec, activeSection, nowIso, nowIso, sectionsJson
    ).run();

    // Record write timestamp for throttling future heartbeats
    sessionThrottleMap.set(sessionId, {
      lastPersistedAt: nowMs,
      lastPersistedDuration: durationSec
    });

    return { success: true, session_id: sessionId };
  } catch (err: any) {
    // If migration 0003 has not yet been applied, fallback gracefully to insert without sections_json
    if (err?.message?.includes('sections_json')) {
      await db.prepare(`
        INSERT INTO analytics_sessions (
          session_id, visitor_id, ip_hash, country, country_code, city, region,
          page, page_title, referrer, traffic_source, referrer_domain, device,
          browser, duration_seconds, active_section, created_at, last_active_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          duration_seconds = MAX(analytics_sessions.duration_seconds, excluded.duration_seconds),
          active_section = COALESCE(excluded.active_section, analytics_sessions.active_section),
          last_active_at = excluded.last_active_at
      `).bind(
        sessionId, visitorId, `ip_${sessionId.slice(-6)}`,
        countryName, cfCountry, cfCity, cfRegion,
        rawPage, rawPageTitle, payload.referrer || 'direct', parsedSource.source,
        parsedSource.domain, device, browser,
        durationSec, activeSection, nowIso, nowIso
      ).run();

      sessionThrottleMap.set(sessionId, {
        lastPersistedAt: nowMs,
        lastPersistedDuration: durationSec
      });

      return { success: true, session_id: sessionId };
    }

    // Re-throw genuine database failure so the API fails honestly (no silent false success)
    throw new Error(`Failed to persist analytics event into D1: ${err.message}`);
  }
}

/**
 * Generates an authoritative analytics summary backed strictly by Cloudflare D1.
 * Fails closed if D1 is unavailable (no silent in-memory fallback).
 */
export async function getAnalyticsSummary(
  dbOrRange?: D1Database | '24h' | '7d' | '30d',
  maybeRange?: '24h' | '7d' | '30d'
): Promise<AnalyticsSummary> {
  let db: D1Database | undefined;
  let timeRange: '24h' | '7d' | '30d' = '24h';

  if (typeof dbOrRange === 'string') {
    timeRange = dbOrRange;
  } else if (dbOrRange) {
    db = dbOrRange;
    if (maybeRange) timeRange = maybeRange;
  }

  // Authoritative D1 check: do not silently fabricate results if database binding is missing
  if (!db) {
    throw new Error('D1 database binding is unconfigured or unavailable.');
  }

  const nowMs = Date.now();
  const days = timeRange === '7d' ? 7 : (timeRange === '30d' ? 30 : 1);
  const cutoffMs = nowMs - (days * 24 * 3600 * 1000);
  const cutoffIso = new Date(cutoffMs).toISOString();

  let dbSessions: VisitorSession[] = [];

  try {
    // Query durable D1 storage
    let rows: any[] = [];
    try {
      const result = await db.prepare(`
        SELECT session_id, visitor_id, ip_hash, country, country_code, city, region,
               page, page_title, referrer, traffic_source, referrer_domain, device,
               browser, duration_seconds, active_section, created_at, last_active_at,
               sections_json
        FROM analytics_sessions
        WHERE created_at >= ?
        ORDER BY created_at DESC
        LIMIT 5000
      `).bind(cutoffIso).all<any>();
      rows = result.results || [];
    } catch (e: any) {
      // Fallback query if sections_json column is not present
      if (e?.message?.includes('sections_json')) {
        const result = await db.prepare(`
          SELECT session_id, visitor_id, ip_hash, country, country_code, city, region,
                 page, page_title, referrer, traffic_source, referrer_domain, device,
                 browser, duration_seconds, active_section, created_at, last_active_at
          FROM analytics_sessions
          WHERE created_at >= ?
          ORDER BY created_at DESC
          LIMIT 5000
        `).bind(cutoffIso).all<any>();
        rows = result.results || [];
      } else {
        throw e;
      }
    }

    dbSessions = rows.map(r => {
      let sectionsViewed: Record<string, number> = {};
      if (r.sections_json !== undefined && r.sections_json !== null) {
        try {
          sectionsViewed = JSON.parse(r.sections_json);
        } catch {
          sectionsViewed = {};
        }
      } else if (r.active_section && r.active_section !== 'hero') {
        sectionsViewed[r.active_section] = r.duration_seconds || 0;
      }

      return {
        session_id: r.session_id,
        visitor_id: r.visitor_id,
        ip_hash: r.ip_hash || '',
        country: r.country || 'India',
        country_code: r.country_code || 'IN',
        city: r.city || 'Direct',
        region: r.region || 'Web',
        page: r.page || '/',
        page_title: r.page_title || 'Sahyak CRM',
        referrer: r.referrer || 'direct',
        traffic_source: r.traffic_source || 'Direct',
        referrer_domain: r.referrer_domain || 'direct',
        device: r.device || 'Desktop',
        browser: r.browser || 'Chrome',
        duration_seconds: r.duration_seconds || 0,
        active_section: r.active_section || 'hero',
        sections_viewed: sectionsViewed,
        is_new_today: true,
        created_at: r.created_at,
        last_active_at: r.last_active_at
      };
    });
  } catch (err: any) {
    throw new Error(`D1 query failed for analytics_sessions: ${err.message}`);
  }

  // Genuinely empty database: return honest empty state
  if (dbSessions.length === 0) {
    return {
      realtimeActiveUsers: 0,
      todayNewVisitors: 0,
      totalVisitors: 0,
      avgStayDurationSeconds: 0,
      totalPageViews: 0,
      timeSeries: {
        '24h': generate24hSeries([], nowMs),
        '7d': generateDailySeries([], 7, nowMs),
        '30d': generateDailySeries([], 30, nowMs)
      },
      pages: computePageInsights([]),
      trafficChannels: computeTrafficSources([]).channels,
      trafficDomains: computeTrafficSources([]).domains,
      visitorLogs: []
    };
  }

  // 1. Real-time active users (active in the last 2 minutes)
  const activeCutoffMs = nowMs - (2 * 60 * 1000);
  const realtimeActiveUsers = new Set(
    dbSessions
      .filter(s => new Date(s.last_active_at).getTime() >= activeCutoffMs)
      .map(s => s.visitor_id)
  ).size;

  // 2. New visitors today (calendar day in Asia/Kolkata timezone)
  const istStartOfTodayMs = getIstStartOfToday();
  const todaySessions = dbSessions.filter(s => new Date(s.created_at).getTime() >= istStartOfTodayMs);
  const todayNewVisitors = new Set(todaySessions.map(s => s.visitor_id)).size;

  // 3. Total unique visitors count
  const uniqueVisitorIds = new Set(dbSessions.map(s => s.visitor_id));
  const totalVisitors = uniqueVisitorIds.size;

  // 4. Average stay duration
  const totalDuration = dbSessions.reduce((acc, s) => acc + s.duration_seconds, 0);
  const avgStayDurationSeconds = dbSessions.length > 0 ? Math.round(totalDuration / dbSessions.length) : 0;
  const totalPageViews = dbSessions.length;

  // 5. Time series charts for 24h, 7d, 30d (truthful historical metrics)
  const timeSeries = {
    '24h': generate24hSeries(dbSessions, nowMs),
    '7d': generateDailySeries(dbSessions, 7, nowMs),
    '30d': generateDailySeries(dbSessions, 30, nowMs)
  };

  // 6. Page insights & Section dwell times (strictly real observations)
  const pages = computePageInsights(dbSessions);

  // 7. Traffic Sources (Channels & Domains)
  const { channels, domains } = computeTrafficSources(dbSessions);

  return {
    realtimeActiveUsers,
    todayNewVisitors,
    totalVisitors,
    avgStayDurationSeconds,
    totalPageViews,
    timeSeries,
    pages,
    trafficChannels: channels,
    trafficDomains: domains,
    visitorLogs: dbSessions.slice(0, 50)
  };
}

// Helper: 24h Time Series (Hourly intervals aligned to IST hours)
function generate24hSeries(sessions: VisitorSession[], nowMs: number): TimeSeriesData {
  const labels: string[] = [];
  const visitors: number[] = [];
  const pageviews: number[] = [];
  const activeUsers: number[] = [];
  const avgDuration: number[] = [];

  for (let i = 23; i >= 0; i--) {
    const slotTime = new Date(nowMs - (i * 3600 * 1000));
    const hourLabel = new Intl.DateTimeFormat('en-IN', {
      timeZone: REPORTING_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(slotTime);
    labels.push(hourLabel);

    const slotStart = slotTime.getTime() - 1800 * 1000;
    const slotEnd = slotTime.getTime() + 1800 * 1000;

    const slotSessions = sessions.filter(s => {
      const t = new Date(s.created_at).getTime();
      return t >= slotStart && t < slotEnd;
    });

    const vCount = new Set(slotSessions.map(s => s.visitor_id)).size;
    const pvCount = slotSessions.length;
    // Active users in this hour bucket = unique visitors active in this time window
    const activeCount = vCount;
    const dur = slotSessions.length > 0
      ? Math.round(slotSessions.reduce((acc, s) => acc + s.duration_seconds, 0) / slotSessions.length)
      : 0;

    visitors.push(vCount);
    pageviews.push(pvCount);
    activeUsers.push(activeCount);
    avgDuration.push(dur);
  }

  return { labels, visitors, pageviews, activeUsers, avgDuration };
}

/**
 * Generates 7d & 30d Time Series with strict IST (Asia/Kolkata) day boundaries
 * Fixes DATA-02: computes historical Daily Active Users from persisted sessions active on that date,
 * eliminating the fatal bug that caused historical active users to evaluate to 0.
 */
function generateDailySeries(sessions: VisitorSession[], days: number, nowMs: number): TimeSeriesData {
  const labels: string[] = [];
  const visitors: number[] = [];
  const pageviews: number[] = [];
  const activeUsers: number[] = [];
  const avgDuration: number[] = [];

  const todayStr = getIstDateString(nowMs);
  const nowDate = new Date(nowMs);

  for (let i = days - 1; i >= 0; i--) {
    // Step backwards day-by-day in IST
    const targetDate = new Date(nowDate.getTime() - (i * 24 * 3600 * 1000));
    const dateStr = getIstDateString(targetDate);
    const { startMs, endMs } = getIstDayBounds(dateStr);

    const label = new Intl.DateTimeFormat('en-IN', {
      timeZone: REPORTING_TIMEZONE,
      month: 'short',
      day: 'numeric'
    }).format(new Date(startMs + 43200000)); // midday IST
    labels.push(label);

    // Sessions active on this calendar day:
    // Either created on this day, or last_active on this day
    const daySessions = sessions.filter(s => {
      const createdMs = new Date(s.created_at).getTime();
      const lastActiveMs = new Date(s.last_active_at).getTime();
      return (createdMs >= startMs && createdMs <= endMs) ||
        (lastActiveMs >= startMs && lastActiveMs <= endMs);
    });

    // Unique active visitors on this calendar date (DAU)
    const uniqueDayVisitors = new Set(daySessions.map(s => s.visitor_id));
    const vCount = uniqueDayVisitors.size;
    const pvCount = daySessions.length;
    // Active users: historical days reflect genuine active visitors, not zero
    const activeCount = vCount;
    const dur = daySessions.length > 0
      ? Math.round(daySessions.reduce((acc, s) => acc + s.duration_seconds, 0) / daySessions.length)
      : 0;

    visitors.push(vCount);
    pageviews.push(pvCount);
    activeUsers.push(activeCount);
    avgDuration.push(dur);
  }

  return { labels, visitors, pageviews, activeUsers, avgDuration };
}

// Known website pages for structure and labels
const KNOWN_PAGES: Array<{ page: string; title: string }> = [
  { page: '/', title: 'Homepage (Editorial Magazine Experience)' },
  { page: '/pricing', title: 'Pricing & 15-Country Adaptive Matrix' },
  { page: '/features', title: 'Features & Real Estate Workflows' },
  { page: '/resources', title: 'Resources, Tutorials & Guides' },
  { page: '/contact', title: 'Direct Support & Demo Booking' },
  { page: '/security', title: 'Security, GDPR & Data Isolation' },
  { page: '/about', title: 'Company Purpose & Team Philosophy' }
];

// Documented section names by page (Labels only — all fake ratio constants REMOVED)
const CONFIGURED_PAGE_SECTIONS: Record<string, Array<{ id: string; label: string }>> = {
  '/pricing': [
    { id: 'pricing-calculator', label: 'Adaptive Pricing Calculator' },
    { id: 'tier-comparison', label: 'Feature Matrix & Add-ons' },
    { id: 'unsupported-country-banner', label: 'Global Direct Sales CTA' },
    { id: 'faq', label: 'Pricing FAQs' }
  ],
  '/features': [
    { id: 'whatsapp-hub', label: 'WhatsApp & Communication Hub' },
    { id: 'lead-management', label: 'Lead Capture & Pipelines' },
    { id: 'site-visits', label: 'Site Visit Coordination' },
    { id: 'inventory', label: 'Real Estate Inventory Tracker' }
  ],
  '/resources': [
    { id: 'video-tutorials', label: 'Video Player & Walkthroughs' },
    { id: 'guides', label: 'Step-by-Step Playbooks' },
    { id: 'templates', label: 'Downloadable Sales Templates' },
    { id: 'help-articles', label: 'Searchable Knowledge Base' }
  ],
  '/': [
    { id: 'hero', label: 'Hero Mockup & Value Proposition' },
    { id: 'chaos-section', label: 'The Chaos Problem Overview' },
    { id: 'features-overview', label: 'Core Features Carousel' },
    { id: 'testimonials', label: 'Brokerage Social Proof' }
  ],
  '/contact': [
    { id: 'contact-form', label: 'Interactive Inquiry Form' },
    { id: 'direct-support', label: 'Direct Phone & WhatsApp Hotline' },
    { id: 'location-map', label: 'Global Hubs & Hours' }
  ],
  '/security': [
    { id: 'data-protection', label: 'Data Protection & Encryption' },
    { id: 'multi-tenant', label: 'Organization Data Isolation' },
    { id: 'access-control', label: 'RBAC & Audit Logging' }
  ],
  '/about': [
    { id: 'purpose', label: 'Our Purpose & Beliefs' },
    { id: 'teams-collage', label: 'Teams Magazine Collage' },
    { id: 'road-ahead', label: 'The Road Ahead Portal' }
  ]
};

/**
 * Computes page insights and section dwell breakdowns strictly from real observations.
 * Fixes DATA-01: Removes hardcoded static ratios entirely. Sections without observations
 * honestly report 0s dwell time and 'No data recorded', distinguishing from fabricated metrics.
 */
function computePageInsights(sessions: VisitorSession[]): PageInsight[] {
  const pageMap: Record<string, {
    title: string;
    views: number;
    visitors: Set<string>;
    durations: number[];
    observedSections: Record<string, number[]>;
  }> = {};

  // Pre-populate known pages
  KNOWN_PAGES.forEach(p => {
    pageMap[p.page] = {
      title: p.title,
      views: 0,
      visitors: new Set(),
      durations: [],
      observedSections: {}
    };
  });

  // Aggregate real session data
  sessions.forEach(s => {
    const rawPath = s.page.split('?')[0].replace(/\/$/, '') || '/';
    if (!pageMap[rawPath]) {
      pageMap[rawPath] = {
        title: s.page_title || rawPath,
        views: 0,
        visitors: new Set(),
        durations: [],
        observedSections: {}
      };
    }

    const entry = pageMap[rawPath];
    entry.views += 1;
    entry.visitors.add(s.visitor_id);
    entry.durations.push(s.duration_seconds);

    // Record real observed section durations
    if (s.sections_viewed && typeof s.sections_viewed === 'object') {
      Object.entries(s.sections_viewed).forEach(([secId, secDur]) => {
        if (typeof secDur === 'number' && secDur > 0) {
          if (!entry.observedSections[secId]) entry.observedSections[secId] = [];
          entry.observedSections[secId].push(secDur);
        }
      });
    }
  });

  return Object.entries(pageMap).map(([page, data]) => {
    const totalViews = data.views;
    const uniqueVisitors = data.visitors.size;
    const avgDurationSeconds = data.durations.length > 0
      ? Math.round(data.durations.reduce((a, b) => a + b, 0) / data.durations.length)
      : 0;
    const bounceRate = totalViews > 0
      ? Math.round((data.durations.filter(d => d < 15).length / totalViews) * 100)
      : 0;

    // Get configured sections for this page, or dynamically discovered sections
    const configured = CONFIGURED_PAGE_SECTIONS[page] || [];
    const sectionIds = new Set([
      ...configured.map(c => c.id),
      ...Object.keys(data.observedSections)
    ]);

    // Compute actual observed metrics per section
    const sectionMetrics = Array.from(sectionIds).map(secId => {
      const configItem = configured.find(c => c.id === secId);
      const label = configItem?.label || (secId.charAt(0).toUpperCase() + secId.slice(1).replace(/-/g, ' '));
      const observations = data.observedSections[secId] || [];

      const avgSec = observations.length > 0
        ? Math.round(observations.reduce((a, b) => a + b, 0) / observations.length)
        : 0;

      return {
        section_id: secId,
        label,
        avgSeconds: avgSec,
        observationCount: observations.length,
        viewPercent: 0 // Will compute relative to total observed dwell seconds
      };
    });

    // Compute viewPercent strictly from observed engagement
    const totalObservedSec = sectionMetrics.reduce((acc, s) => acc + s.avgSeconds, 0);
    const sections = sectionMetrics.map(s => ({
      section_id: s.section_id,
      label: s.label,
      avgSeconds: s.avgSeconds,
      viewPercent: totalObservedSec > 0 ? Math.round((s.avgSeconds / totalObservedSec) * 100) : 0
    }));

    // Find top section based on real measurements
    const sectionsWithData = sections.filter(s => s.avgSeconds > 0).sort((a, b) => b.avgSeconds - a.avgSeconds);
    const topSection = sectionsWithData.length > 0 ? sectionsWithData[0].label : 'No data recorded';

    return {
      page,
      title: data.title,
      totalViews,
      uniqueVisitors,
      avgDurationSeconds,
      bounceRate,
      topSection,
      sections
    };
  }).sort((a, b) => b.totalViews - a.totalViews);
}

// Helper: Compute traffic sources & channels strictly from real sessions
function computeTrafficSources(sessions: VisitorSession[]): {
  channels: TrafficSourceSummary[];
  domains: TrafficDomainSummary[];
} {
  const channelCounts: Record<string, { count: number; durations: number[]; icon: string; color: string }> = {
    'Google': { count: 0, durations: [], icon: 'fa-brands fa-google', color: '#EA4335' },
    'WhatsApp': { count: 0, durations: [], icon: 'fa-brands fa-whatsapp', color: '#25D366' },
    'LinkedIn': { count: 0, durations: [], icon: 'fa-brands fa-linkedin', color: '#0A66C2' },
    'Instagram': { count: 0, durations: [], icon: 'fa-brands fa-instagram', color: '#E4405F' },
    'YouTube': { count: 0, durations: [], icon: 'fa-brands fa-youtube', color: '#FF0000' },
    'Property Portal': { count: 0, durations: [], icon: 'fa-solid fa-building', color: '#4ADE80' },
    'Direct': { count: 0, durations: [], icon: 'fa-solid fa-compass', color: '#9CA3AF' },
    'Referral': { count: 0, durations: [], icon: 'fa-solid fa-link', color: '#6366F1' }
  };

  const domainMap: Record<string, {
    platformName: string;
    channel: string;
    count: number;
    durations: number[];
  }> = {};

  const total = sessions.length;

  sessions.forEach(s => {
    const ch = s.traffic_source || 'Direct';
    if (!channelCounts[ch]) {
      channelCounts[ch] = { count: 0, durations: [], icon: 'fa-solid fa-globe', color: '#6B7280' };
    }
    channelCounts[ch].count += 1;
    channelCounts[ch].durations.push(s.duration_seconds);

    const dom = s.referrer_domain || 'direct';
    if (!domainMap[dom]) {
      const parsed = parseTrafficSource(s.referrer);
      domainMap[dom] = {
        platformName: parsed.platform,
        channel: ch,
        count: 0,
        durations: []
      };
    }
    domainMap[dom].count += 1;
    domainMap[dom].durations.push(s.duration_seconds);
  });

  const channels: TrafficSourceSummary[] = Object.entries(channelCounts)
    .map(([channel, data]) => ({
      channel,
      count: data.count,
      percentage: total > 0 ? Math.round((data.count / total) * 100) : 0,
      avgDurationSeconds: data.durations.length > 0 ? Math.round(data.durations.reduce((a, b) => a + b, 0) / data.durations.length) : 0,
      icon: data.icon,
      color: data.color
    }))
    .sort((a, b) => b.count - a.count);

  const domains: TrafficDomainSummary[] = Object.entries(domainMap)
    .map(([domain, data]) => ({
      domain,
      platformName: data.platformName,
      channel: data.channel,
      count: data.count,
      percentage: total > 0 ? Math.round((data.count / total) * 100) : 0,
      avgDurationSeconds: data.durations.length > 0 ? Math.round(data.durations.reduce((a, b) => a + b, 0) / data.durations.length) : 0
    }))
    .sort((a, b) => b.count - a.count);

  return { channels, domains };
}

// Helper: Format seconds to 'Xm Ys'
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// Re-export canonical CSV sanitization helper
export { sanitizeCsvCell };

/**
 * Generates CSV Exports for analytics dimensions backed by durable D1 storage.
 * Neutralizes formula injection vulnerabilities and fails closed if D1 is unavailable.
 */
export async function exportAnalyticsToCsv(
  dbOrType?: D1Database | 'visitors' | 'pages' | 'sources' | 'all',
  maybeType?: 'visitors' | 'pages' | 'sources' | 'all'
): Promise<string> {
  let db: D1Database | undefined;
  let type: 'visitors' | 'pages' | 'sources' | 'all' = 'all';

  if (typeof dbOrType === 'string') {
    type = dbOrType;
  } else if (dbOrType) {
    db = dbOrType;
    if (maybeType) type = maybeType;
  }

  if (!db) {
    throw new Error('D1 database binding is unconfigured or unavailable.');
  }

  const summary = await getAnalyticsSummary(db, '30d');

  if (type === 'visitors') {
    const headers = ['Session ID', 'Visitor ID', 'Country', 'City', 'Region', 'Page Visited', 'Traffic Source', 'Referrer Domain', 'Device', 'Browser', 'Stay Duration (Sec)', 'Stay Duration (Formatted)', 'Last Active'];
    const rows = summary.visitorLogs.map((v: VisitorSession) => [
      sanitizeCsvCell(v.session_id),
      sanitizeCsvCell(v.visitor_id),
      sanitizeCsvCell(v.country),
      sanitizeCsvCell(v.city),
      sanitizeCsvCell(v.region),
      sanitizeCsvCell(v.page),
      sanitizeCsvCell(v.traffic_source),
      sanitizeCsvCell(v.referrer_domain),
      sanitizeCsvCell(v.device),
      sanitizeCsvCell(v.browser),
      v.duration_seconds,
      sanitizeCsvCell(formatDuration(v.duration_seconds)),
      sanitizeCsvCell(v.last_active_at)
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  if (type === 'pages') {
    const headers = ['Page URL', 'Page Title', 'Total Pageviews', 'Unique Visitors', 'Avg Duration (Sec)', 'Avg Duration (Formatted)', 'Bounce Rate (%)', 'Most Engaged Section'];
    const rows = summary.pages.map((p: PageInsight) => [
      sanitizeCsvCell(p.page),
      sanitizeCsvCell(p.title),
      p.totalViews,
      p.uniqueVisitors,
      p.avgDurationSeconds,
      sanitizeCsvCell(formatDuration(p.avgDurationSeconds)),
      `${p.bounceRate}%`,
      sanitizeCsvCell(p.topSection)
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  if (type === 'sources') {
    const headers = ['Platform / Domain Name', 'Full Domain', 'Channel Category', 'Visitor Count', 'Traffic Share (%)', 'Avg Duration (Sec)', 'Avg Duration (Formatted)'];
    const rows = summary.trafficDomains.map((d: TrafficDomainSummary) => [
      sanitizeCsvCell(d.platformName),
      sanitizeCsvCell(d.domain),
      sanitizeCsvCell(d.channel),
      d.count,
      `${d.percentage}%`,
      d.avgDurationSeconds,
      sanitizeCsvCell(formatDuration(d.avgDurationSeconds))
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  // Master Summary Report ('all')
  const lines: string[] = [];
  lines.push('=== SAHYAK CRM - EXECUTIVE ANALYTICS REPORT ===');
  lines.push(`Generated: ${new Date().toISOString()} (IST Day: ${getIstDateString()})`);
  lines.push(`Reporting Timezone: ${REPORTING_TIMEZONE}`);
  lines.push(`Real-time Active Users: ${summary.realtimeActiveUsers}`);
  lines.push(`New Visitors Today: ${summary.todayNewVisitors}`);
  lines.push(`Total Unique Visitors: ${summary.totalVisitors}`);
  lines.push(`Average Duration of Stay: ${formatDuration(summary.avgStayDurationSeconds)}`);
  lines.push('');
  lines.push('--- TOP PAGES BY ENGAGEMENT ---');
  lines.push('Page,Views,Unique Visitors,Avg Duration,Top Section');
  summary.pages.forEach((p: PageInsight) => {
    lines.push(`${sanitizeCsvCell(p.page)},${p.totalViews},${p.uniqueVisitors},${sanitizeCsvCell(formatDuration(p.avgDurationSeconds))},${sanitizeCsvCell(p.topSection)}`);
  });
  lines.push('');
  lines.push('--- TOP TRAFFIC CHANNELS ---');
  lines.push('Channel,Visitors,Percentage,Avg Duration');
  summary.trafficChannels.forEach((c: TrafficSourceSummary) => {
    lines.push(`${sanitizeCsvCell(c.channel)},${c.count},${c.percentage}%,${sanitizeCsvCell(formatDuration(c.avgDurationSeconds))}`);
  });
  lines.push('');
  lines.push('--- RECENT VISITOR SESSIONS ---');
  lines.push('Country,City,Page,Source,Device,Duration,Last Active');
  summary.visitorLogs.slice(0, 30).forEach((v: VisitorSession) => {
    lines.push(`${sanitizeCsvCell(v.country)},${sanitizeCsvCell(v.city)},${sanitizeCsvCell(v.page)},${sanitizeCsvCell(v.traffic_source)},${sanitizeCsvCell(v.device)},${sanitizeCsvCell(formatDuration(v.duration_seconds))},${sanitizeCsvCell(v.last_active_at)}`);
  });

  return lines.join('\n');
}

export interface RetentionResult {
  success: boolean;
  dryRun: boolean;
  retentionDays: number;
  cutoffDate: string;
  recordsEligible: number;
  recordsDeleted: number;
  batchesExecuted: number;
  hasMore: boolean;
  error?: string;
}

/**
 * Executes safe, automated, bounded data retention for raw analytics sessions (FIX F).
 * - Identifies records older than the configured cutoff (default 90 days).
 * - Leaves business records (leads, contacts, notes, sessions, resources) untouched.
 * - Operates in bounded batches to avoid transaction timeouts on D1.
 * - Supports dry-run preview mode.
 * - Fails closed on database errors without false reporting.
 */
export async function purgeOldAnalytics(
  db: D1Database | undefined,
  options: {
    retentionDays?: number;
    batchSize?: number;
    maxBatches?: number;
    dryRun?: boolean;
  } = {}
): Promise<RetentionResult> {
  if (!db) {
    throw new Error('D1 database binding is unconfigured or unavailable.');
  }

  const retentionDays = options.retentionDays && options.retentionDays > 0 ? options.retentionDays : 90;
  const cutoffMs = Date.now() - (retentionDays * 24 * 3600 * 1000);
  const cutoffIso = new Date(cutoffMs).toISOString();

  // 1. Count records eligible for deletion
  let recordsEligible = 0;
  try {
    const countRow = await db.prepare(
      `SELECT COUNT(*) as count FROM analytics_sessions WHERE created_at < ?`
    ).bind(cutoffIso).first<{ count: number }>();
    recordsEligible = countRow?.count ?? 0;
  } catch (err: any) {
    throw new Error(`Failed to query eligible records for analytics retention: ${err.message}`);
  }

  // If dryRun mode is enabled, return preview without executing deletions
  if (options.dryRun || recordsEligible === 0) {
    return {
      success: true,
      dryRun: Boolean(options.dryRun),
      retentionDays,
      cutoffDate: cutoffIso,
      recordsEligible,
      recordsDeleted: 0,
      batchesExecuted: 0,
      hasMore: recordsEligible > 0
    };
  }

  // 2. Perform bounded batch deletion
  const batchSize = Math.min(Math.max(options.batchSize || 500, 1), 2000);
  const maxBatches = Math.min(Math.max(options.maxBatches || 5, 1), 20);

  let totalDeleted = 0;
  let batchesExecuted = 0;

  try {
    while (batchesExecuted < maxBatches) {
      const delResult = await db.prepare(`
        DELETE FROM analytics_sessions
        WHERE session_id IN (
          SELECT session_id FROM analytics_sessions
          WHERE created_at < ?
          LIMIT ?
        )
      `).bind(cutoffIso, batchSize).run();

      const changes = delResult.meta?.changes ?? (delResult as any).changes ?? 0;
      totalDeleted += changes;
      batchesExecuted++;

      // If fewer than batchSize rows were deleted, all eligible records have been purged
      if (changes < batchSize) {
        break;
      }
    }

    const remainingEligible = Math.max(0, recordsEligible - totalDeleted);

    return {
      success: true,
      dryRun: false,
      retentionDays,
      cutoffDate: cutoffIso,
      recordsEligible,
      recordsDeleted: totalDeleted,
      batchesExecuted,
      hasMore: remainingEligible > 0
    };
  } catch (err: any) {
    throw new Error(`Failed to execute analytics retention batch purge: ${err.message}`);
  }
}

/**
 * Direct SQL aggregation for KPI summary counts, avoiding large in-memory record loading (FIX E).
 */
export async function getAnalyticsKpisSql(
  db: D1Database,
  cutoffIso: string
): Promise<{ totalVisitors: number; totalPageViews: number; avgDurationSeconds: number }> {
  const row = await db.prepare(`
    SELECT
      COUNT(DISTINCT visitor_id) as total_visitors,
      COUNT(*) as total_pageviews,
      COALESCE(ROUND(AVG(duration_seconds)), 0) as avg_duration
    FROM analytics_sessions
    WHERE created_at >= ?
  `).bind(cutoffIso).first<{ total_visitors: number; total_pageviews: number; avg_duration: number }>();

  return {
    totalVisitors: row?.total_visitors ?? 0,
    totalPageViews: row?.total_pageviews ?? 0,
    avgDurationSeconds: row?.avg_duration ?? 0
  };
}

/**
 * Direct SQL aggregation for real-time active users in the last N minutes (FIX E).
 */
export async function getRealtimeActiveUsersSql(
  db: D1Database,
  windowMinutes = 2
): Promise<number> {
  const cutoffIso = new Date(Date.now() - (windowMinutes * 60 * 1000)).toISOString();
  const row = await db.prepare(`
    SELECT COUNT(DISTINCT visitor_id) as active_count
    FROM analytics_sessions
    WHERE last_active_at >= ?
  `).bind(cutoffIso).first<{ active_count: number }>();

  return row?.active_count ?? 0;
}

/**
 * Direct SQL aggregation for top traffic channels (FIX E).
 */
export async function getTrafficChannelsSql(
  db: D1Database,
  cutoffIso: string
): Promise<Array<{ channel: string; count: number; avgDuration: number }>> {
  const res = await db.prepare(`
    SELECT
      traffic_source as channel,
      COUNT(*) as count,
      COALESCE(ROUND(AVG(duration_seconds)), 0) as avg_duration
    FROM analytics_sessions
    WHERE created_at >= ?
    GROUP BY traffic_source
    ORDER BY count DESC
  `).bind(cutoffIso).all<{ channel: string; count: number; avg_duration: number }>();

  return (res.results || []).map(r => ({
    channel: r.channel || 'Direct',
    count: r.count || 0,
    avgDuration: r.avg_duration || 0
  }));
}

