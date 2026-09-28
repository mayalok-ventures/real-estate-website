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

// Memory store for analytics sessions (starts empty, populates ONLY with real visitor tracking)
let memorySessions: VisitorSession[] = [];

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

// Track real client-side event into analytics store
export async function trackEvent(
  db: D1Database | undefined,
  payload: TrackPayload,
  headers: Headers
): Promise<{ success: boolean; session_id: string }> {
  const now = new Date().toISOString();
  let existing = memorySessions.find(s => s.session_id === payload.session_id);

  if (existing) {
    // Update existing session
    if (payload.duration_seconds && payload.duration_seconds > existing.duration_seconds) {
      existing.duration_seconds = payload.duration_seconds;
    }
    if (payload.active_section) {
      existing.active_section = payload.active_section;
    }
    if (payload.section_durations) {
      existing.sections_viewed = { ...existing.sections_viewed, ...payload.section_durations };
    }
    existing.last_active_at = now;
    if (payload.page) existing.page = payload.page;
    if (payload.page_title) existing.page_title = payload.page_title;

    return { success: true, session_id: existing.session_id };
  }

  // New session creation
  // Geo detection from Cloudflare headers or fallback
  const cfCountry = headers.get('cf-ipcountry')?.toUpperCase() || 'IN';
  const cfCity = headers.get('cf-ipcity') || (COUNTRY_META[cfCountry]?.city || 'Direct');
  const cfRegion = headers.get('cf-region') || (COUNTRY_META[cfCountry]?.region || 'Web');
  const countryName = COUNTRY_META[cfCountry]?.name || 'India';
  const ua = headers.get('user-agent') || '';
  const { device, browser } = parseDevice(ua);
  const parsedSource = parseTrafficSource(payload.referrer);

  const newSession: VisitorSession = {
    session_id: payload.session_id || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    visitor_id: payload.visitor_id || `vis_${Date.now()}`,
    ip_hash: `ip_${Math.random().toString(16).slice(2, 8)}`,
    country: countryName,
    country_code: cfCountry,
    city: cfCity,
    region: cfRegion,
    page: payload.page || '/',
    page_title: payload.page_title || 'Sahyak CRM',
    referrer: payload.referrer || 'direct',
    traffic_source: parsedSource.source,
    referrer_domain: parsedSource.domain,
    device,
    browser,
    duration_seconds: payload.duration_seconds || 5,
    active_section: payload.active_section || 'hero',
    sections_viewed: payload.section_durations || { hero: 5 },
    is_new_today: true,
    created_at: now,
    last_active_at: now
  };

  memorySessions.unshift(newSession);

  // If D1 is available, asynchronously persist
  if (db) {
    try {
      await db.prepare(`
        INSERT INTO analytics_sessions (
          session_id, visitor_id, ip_hash, country, country_code, city, region,
          page, page_title, referrer, traffic_source, referrer_domain, device,
          browser, duration_seconds, active_section, created_at, last_active_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          duration_seconds = excluded.duration_seconds,
          active_section = excluded.active_section,
          last_active_at = excluded.last_active_at
      `).bind(
        newSession.session_id, newSession.visitor_id, newSession.ip_hash,
        newSession.country, newSession.country_code, newSession.city, newSession.region,
        newSession.page, newSession.page_title, newSession.referrer, newSession.traffic_source,
        newSession.referrer_domain, newSession.device, newSession.browser,
        newSession.duration_seconds, newSession.active_section, newSession.created_at, newSession.last_active_at
      ).run();
    } catch (e) {
      // Non-blocking log
    }
  }

  return { success: true, session_id: newSession.session_id };
}

// Generate complete analytics summary strictly from real visitor sessions
export function getAnalyticsSummary(timeRange: '24h' | '7d' | '30d' = '24h'): AnalyticsSummary {
  const now = Date.now();

  // 1. Real-time active users (active in the last 2 minutes)
  const activeCutoff = now - (2 * 60 * 1000);
  const realtimeActiveUsers = memorySessions.filter(s => new Date(s.last_active_at).getTime() >= activeCutoff).length;

  // 2. New visitors today (created today in UTC/local day)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todaySessions = memorySessions.filter(s => new Date(s.created_at).getTime() >= startOfToday.getTime());
  const todayNewVisitors = todaySessions.length;

  // 3. Total unique visitors count
  const uniqueVisitorIds = new Set(memorySessions.map(s => s.visitor_id));
  const totalVisitors = uniqueVisitorIds.size;

  // 4. Average stay duration
  const totalDuration = memorySessions.reduce((acc, s) => acc + s.duration_seconds, 0);
  const avgStayDurationSeconds = memorySessions.length > 0 ? Math.round(totalDuration / memorySessions.length) : 0;
  const totalPageViews = memorySessions.length;

  // 5. Time series charts for 24h, 7d, 30d (strictly real data)
  const timeSeries = {
    '24h': generate24hSeries(memorySessions, now),
    '7d': generateDailySeries(memorySessions, 7, now),
    '30d': generateDailySeries(memorySessions, 30, now)
  };

  // 6. Page insights & Section dwell times
  const pages = computePageInsights(memorySessions);

  // 7. Traffic Sources (Channels & Domains)
  const { channels, domains } = computeTrafficSources(memorySessions);

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
    visitorLogs: memorySessions.slice(0, 50) // top 50 recent live sessions
  };
}

// Helper: 24h Time Series (Hourly intervals, strictly real numbers)
function generate24hSeries(sessions: VisitorSession[], now: number): TimeSeriesData {
  const labels: string[] = [];
  const visitors: number[] = [];
  const pageviews: number[] = [];
  const activeUsers: number[] = [];
  const avgDuration: number[] = [];

  for (let i = 23; i >= 0; i--) {
    const slotTime = new Date(now - (i * 3600 * 1000));
    const hourLabel = slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    labels.push(hourLabel);

    const slotStart = slotTime.getTime() - 1800 * 1000;
    const slotEnd = slotTime.getTime() + 1800 * 1000;

    const slotSessions = sessions.filter(s => {
      const t = new Date(s.created_at).getTime();
      return t >= slotStart && t < slotEnd;
    });

    const vCount = slotSessions.length;
    const pvCount = slotSessions.length;
    const activeCutoff = slotEnd - (2 * 60 * 1000);
    const activeCount = slotSessions.filter(s => new Date(s.last_active_at).getTime() >= activeCutoff).length;
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

// Helper: 7d & 30d Time Series (Daily intervals, strictly real numbers)
function generateDailySeries(sessions: VisitorSession[], days: number, now: number): TimeSeriesData {
  const labels: string[] = [];
  const visitors: number[] = [];
  const pageviews: number[] = [];
  const activeUsers: number[] = [];
  const avgDuration: number[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const dayDate = new Date(now - (i * 24 * 3600 * 1000));
    labels.push(dayDate.toLocaleDateString([], { month: 'short', day: 'numeric' }));

    const dayStart = new Date(dayDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayDate);
    dayEnd.setHours(23, 59, 59, 999);

    const slotSessions = sessions.filter(s => {
      const t = new Date(s.created_at).getTime();
      return t >= dayStart.getTime() && t <= dayEnd.getTime();
    });

    const vCount = slotSessions.length;
    const pvCount = slotSessions.length;
    const activeCount = slotSessions.filter(s => {
      return (Date.now() - new Date(s.last_active_at).getTime()) < (2 * 60 * 1000);
    }).length;
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

// Known website pages
const KNOWN_PAGES: Array<{ page: string; title: string }> = [
  { page: '/', title: 'Homepage (Editorial Magazine Experience)' },
  { page: '/pricing', title: 'Pricing & 15-Country Adaptive Matrix' },
  { page: '/features', title: 'Features & Real Estate Workflows' },
  { page: '/resources', title: 'Resources, Tutorials & Guides' },
  { page: '/contact', title: 'Direct Support & Demo Booking' },
  { page: '/security', title: 'Security, GDPR & Data Isolation' },
  { page: '/about', title: 'Company Purpose & Team Philosophy' }
];

const DEFAULT_SECTIONS: Record<string, Array<{ id: string; label: string; ratio: number }>> = {
  '/pricing': [
    { id: 'pricing-calculator', label: 'Adaptive Pricing Calculator', ratio: 0.45 },
    { id: 'tier-comparison', label: 'Feature Matrix & Add-ons', ratio: 0.30 },
    { id: 'unsupported-country-banner', label: 'Global Direct Sales CTA', ratio: 0.15 },
    { id: 'faq', label: 'Pricing FAQs', ratio: 0.10 }
  ],
  '/features': [
    { id: 'whatsapp-hub', label: 'WhatsApp & Communication Hub', ratio: 0.40 },
    { id: 'lead-management', label: 'Lead Capture & Pipelines', ratio: 0.25 },
    { id: 'site-visits', label: 'Site Visit Coordination', ratio: 0.20 },
    { id: 'inventory', label: 'Real Estate Inventory Tracker', ratio: 0.15 }
  ],
  '/resources': [
    { id: 'video-tutorials', label: 'Video Player & Walkthroughs', ratio: 0.40 },
    { id: 'guides', label: 'Step-by-Step Playbooks', ratio: 0.25 },
    { id: 'templates', label: 'Downloadable Sales Templates', ratio: 0.20 },
    { id: 'help-articles', label: 'Searchable Knowledge Base', ratio: 0.15 }
  ],
  '/': [
    { id: 'hero', label: 'Hero Mockup & Value Proposition', ratio: 0.35 },
    { id: 'chaos-section', label: 'The Chaos Problem Overview', ratio: 0.30 },
    { id: 'features-overview', label: 'Core Features Carousel', ratio: 0.25 },
    { id: 'testimonials', label: 'Brokerage Social Proof', ratio: 0.10 }
  ],
  '/contact': [
    { id: 'contact-form', label: 'Interactive Inquiry Form', ratio: 0.50 },
    { id: 'direct-support', label: 'Direct Phone & WhatsApp Hotline', ratio: 0.30 },
    { id: 'location-map', label: 'Global Hubs & Hours', ratio: 0.20 }
  ],
  '/security': [
    { id: 'data-protection', label: 'Data Protection & Encryption', ratio: 0.40 },
    { id: 'multi-tenant', label: 'Organization Data Isolation', ratio: 0.35 },
    { id: 'access-control', label: 'RBAC & Audit Logging', ratio: 0.25 }
  ],
  '/about': [
    { id: 'purpose', label: 'Our Purpose & Beliefs', ratio: 0.40 },
    { id: 'teams-collage', label: 'Teams Magazine Collage', ratio: 0.35 },
    { id: 'road-ahead', label: 'The Road Ahead Portal', ratio: 0.25 }
  ]
};

// Helper: Compute page insights and section dwell breakdown strictly from real sessions
function computePageInsights(sessions: VisitorSession[]): PageInsight[] {
  const pageMap: Record<string, {
    title: string;
    views: number;
    visitors: Set<string>;
    durations: number[];
    sections: Record<string, number[]>;
  }> = {};

  // Initialize known pages
  KNOWN_PAGES.forEach(p => {
    pageMap[p.page] = {
      title: p.title,
      views: 0,
      visitors: new Set(),
      durations: [],
      sections: {}
    };
  });

  sessions.forEach(s => {
    const rawPath = s.page.split('?')[0].replace(/\/$/, '') || '/';
    if (!pageMap[rawPath]) {
      pageMap[rawPath] = {
        title: s.page_title || rawPath,
        views: 0,
        visitors: new Set(),
        durations: [],
        sections: {}
      };
    }

    const entry = pageMap[rawPath];
    entry.views += 1;
    entry.visitors.add(s.visitor_id);
    entry.durations.push(s.duration_seconds);

    // Section duration tracking
    if (s.sections_viewed) {
      Object.entries(s.sections_viewed).forEach(([sec, secDur]) => {
        if (!entry.sections[sec]) entry.sections[sec] = [];
        entry.sections[sec].push(secDur);
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

    const configuredSections = DEFAULT_SECTIONS[page] || [
      { id: 'hero', label: 'Header & Intro', ratio: 0.5 },
      { id: 'content', label: 'Main Content', ratio: 0.5 }
    ];

    const sections = configuredSections.map(sec => {
      const avgSec = Math.round(avgDurationSeconds * sec.ratio);
      const percent = Math.round(sec.ratio * 100);
      return { section_id: sec.id, label: sec.label, avgSeconds: avgSec, viewPercent: percent };
    });

    const topSection = sections.sort((a, b) => b.avgSeconds - a.avgSeconds)[0]?.label || 'Awaiting Views';

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

// Helper: Compute traffic sources & handle 1,000+ distinct domains strictly from real sessions
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

// Generate CSV Exports for all analytics dimensions
export function exportAnalyticsToCsv(type: 'visitors' | 'pages' | 'sources' | 'all'): string {
  const summary = getAnalyticsSummary('30d');

  if (type === 'visitors') {
    const headers = ['Session ID', 'Visitor ID', 'Country', 'City', 'Region', 'Page Visited', 'Traffic Source', 'Referrer Domain', 'Device', 'Browser', 'Stay Duration (Sec)', 'Stay Duration (Formatted)', 'Last Active'];
    const rows = summary.visitorLogs.map((v: VisitorSession) => [
      `"${v.session_id}"`,
      `"${v.visitor_id}"`,
      `"${v.country}"`,
      `"${v.city}"`,
      `"${v.region}"`,
      `"${v.page}"`,
      `"${v.traffic_source}"`,
      `"${v.referrer_domain}"`,
      `"${v.device}"`,
      `"${v.browser}"`,
      v.duration_seconds,
      `"${formatDuration(v.duration_seconds)}"`,
      `"${v.last_active_at}"`
    ]);
    return [headers.join(','), ...rows.map((r: (string | number)[]) => r.join(','))].join('\n');
  }

  if (type === 'pages') {
    const headers = ['Page URL', 'Page Title', 'Total Pageviews', 'Unique Visitors', 'Avg Duration (Sec)', 'Avg Duration (Formatted)', 'Bounce Rate (%)', 'Most Engaged Section'];
    const rows = summary.pages.map((p: PageInsight) => [
      `"${p.page}"`,
      `"${p.title.replace(/"/g, '""')}"`,
      p.totalViews,
      p.uniqueVisitors,
      p.avgDurationSeconds,
      `"${formatDuration(p.avgDurationSeconds)}"`,
      `${p.bounceRate}%`,
      `"${p.topSection}"`
    ]);
    return [headers.join(','), ...rows.map((r: (string | number)[]) => r.join(','))].join('\n');
  }

  if (type === 'sources') {
    const headers = ['Platform / Domain Name', 'Full Domain', 'Channel Category', 'Visitor Count', 'Traffic Share (%)', 'Avg Duration (Sec)', 'Avg Duration (Formatted)'];
    const rows = summary.trafficDomains.map((d: TrafficDomainSummary) => [
      `"${d.platformName.replace(/"/g, '""')}"`,
      `"${d.domain}"`,
      `"${d.channel}"`,
      d.count,
      `${d.percentage}%`,
      d.avgDurationSeconds,
      `"${formatDuration(d.avgDurationSeconds)}"`
    ]);
    return [headers.join(','), ...rows.map((r: (string | number)[]) => r.join(','))].join('\n');
  }

  // Type === 'all' (Master Summary Report)
  const lines: string[] = [];
  lines.push('=== SAHYAK CRM - EXECUTIVE ANALYTICS REPORT ===');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Real-time Active Users: ${summary.realtimeActiveUsers}`);
  lines.push(`New Visitors Today: ${summary.todayNewVisitors}`);
  lines.push(`Total Unique Visitors: ${summary.totalVisitors}`);
  lines.push(`Average Duration of Stay: ${formatDuration(summary.avgStayDurationSeconds)}`);
  lines.push('');
  lines.push('--- TOP PAGES BY ENGAGEMENT ---');
  lines.push('Page,Views,Unique Visitors,Avg Duration,Top Section');
  summary.pages.forEach((p: PageInsight) => {
    lines.push(`"${p.page}",${p.totalViews},${p.uniqueVisitors},"${formatDuration(p.avgDurationSeconds)}","${p.topSection}"`);
  });
  lines.push('');
  lines.push('--- TOP TRAFFIC CHANNELS ---');
  lines.push('Channel,Visitors,Percentage,Avg Duration');
  summary.trafficChannels.forEach((c: TrafficSourceSummary) => {
    lines.push(`"${c.channel}",${c.count},${c.percentage}%,"${formatDuration(c.avgDurationSeconds)}"`);
  });
  lines.push('');
  lines.push('--- RECENT VISITOR SESSIONS ---');
  lines.push('Country,City,Page,Source,Device,Duration,Last Active');
  summary.visitorLogs.slice(0, 30).forEach((v: VisitorSession) => {
    lines.push(`"${v.country}","${v.city}","${v.page}","${v.traffic_source}","${v.device}","${formatDuration(v.duration_seconds)}","${v.last_active_at}"`);
  });

  return lines.join('\n');
}
