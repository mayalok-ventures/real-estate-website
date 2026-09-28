import crypto from 'node:crypto';
import type {
  GSCDataSummary,
  GSCQueryRow,
  GSCPageRow,
  GSCCountryRow,
  GSCDeviceRow,
  GSCDateRow,
  GSCSitemapRow,
  GSCOpportunity,
  URLInspectionResult
} from '../types/gsc';

// Cached token state
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

// Cached GSC results (15-minute TTL to stay under Google quotas)
interface CacheEntry {
  data: GSCDataSummary;
  expiresAt: number;
}
const gscCache: Record<string, CacheEntry> = {};

// GSC Country code mapper (3-letter ISO to Flag & Name)
const GSC_COUNTRY_MAP: Record<string, { name: string; flag: string }> = {
  ind: { name: 'India', flag: '🇮🇳' },
  usa: { name: 'United States', flag: '🇺🇸' },
  gbr: { name: 'United Kingdom', flag: '🇬🇧' },
  are: { name: 'United Arab Emirates', flag: '🇦🇪' },
  can: { name: 'Canada', flag: '🇨🇦' },
  aus: { name: 'Australia', flag: '🇦🇺' },
  sgp: { name: 'Singapore', flag: '🇸🇬' },
  deu: { name: 'Germany', flag: '🇩🇪' },
  fra: { name: 'France', flag: '🇫🇷' },
  sau: { name: 'Saudi Arabia', flag: '🇸🇦' },
  zaf: { name: 'South Africa', flag: '🇿🇦' },
  jpn: { name: 'Japan', flag: '🇯🇵' },
  esp: { name: 'Spain', flag: '🇪🇸' },
  mex: { name: 'Mexico', flag: '🇲🇽' },
  bra: { name: 'Brazil', flag: '🇧🇷' },
  nld: { name: 'Netherlands', flag: '🇳🇱' },
  ita: { name: 'Italy', flag: '🇮🇹' },
  mys: { name: 'Malaysia', flag: '🇲🇾' },
  phl: { name: 'Philippines', flag: '🇵🇭' },
  pak: { name: 'Pakistan', flag: '🇵🇰' },
  bgd: { name: 'Bangladesh', flag: '🇧🇩' }
};

// Helper: Normalize private key PEM string (handles escaped \n, quotes, and whitespace)
export function normalizePrivateKey(key: string): string {
  if (!key) return '';
  let clean = key.trim();
  // Strip outer quotes if any
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1);
  }
  // Replace literal '\n' characters with actual linebreaks
  clean = clean.replace(/\\n/g, '\n');
  return clean;
}

// Generate Google OAuth2 Access Token using RS256 JWT
export async function getGoogleAccessToken(
  clientEmail: string,
  privateKeyRaw: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  const now = Date.now();

  // Return cached token if still valid for at least 2 minutes
  if (cachedToken && cachedToken.expiresAt > now + 120000) {
    return { success: true, token: cachedToken.accessToken };
  }

  const privateKey = normalizePrivateKey(privateKeyRaw);

  if (!clientEmail || !privateKey) {
    return { success: false, error: 'Google Search Console client email or private key is missing.' };
  }

  // Check if private key looks like a Client ID instead of an RSA Private Key
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') && !privateKey.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    return {
      success: false,
      error: 'Invalid Private Key Format: The value in GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY appears to be a Client ID (numeric ID) instead of the RSA Private Key. In your downloaded Google Cloud service account JSON key file, please copy the value from the "private_key" field (starts with "-----BEGIN PRIVATE KEY-----" and ends with "-----END PRIVATE KEY-----").'
    };
  }

  try {
    const iat = Math.floor(now / 1000);
    const exp = iat + 3600; // 1 hour expiration

    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp,
      iat
    };

    const encodeBase64Url = (obj: any) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');

    const signingInput = `${encodeBase64Url(header)}.${encodeBase64Url(payload)}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign.sign(privateKey, 'base64url');

    const assertion = `${signingInput}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      }).toString()
    });

    const tokenData = await res.json();

    if (!res.ok) {
      return {
        success: false,
        error: tokenData.error_description || tokenData.error || 'Failed to authenticate with Google OAuth2.'
      };
    }

    cachedToken = {
      accessToken: tokenData.access_token,
      expiresAt: now + (tokenData.expires_in || 3600) * 1000
    };

    return { success: true, token: cachedToken.accessToken };
  } catch (err: any) {
    return {
      success: false,
      error: `RSA Signing or OAuth2 token error: ${err.message || String(err)}`
    };
  }
}

// Fetch Search Console Analytics for specific dimensions
async function querySearchConsole(
  accessToken: string,
  siteUrl: string,
  payload: {
    startDate: string;
    endDate: string;
    dimensions: string[];
    rowLimit?: number;
  }
): Promise<{ rows?: any[]; error?: string }> {
  try {
    const encodedSite = encodeURIComponent(siteUrl);
    const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        startDate: payload.startDate,
        endDate: payload.endDate,
        dimensions: payload.dimensions,
        rowLimit: payload.rowLimit || 100
      })
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson?.error?.message || `Google API returned status ${res.status}`;
      return { error: msg };
    }

    const data = await res.json();
    return { rows: data.rows || [] };
  } catch (err: any) {
    return { error: err.message || String(err) };
  }
}

// Fetch submitted sitemaps status
async function querySitemaps(
  accessToken: string,
  siteUrl: string
): Promise<GSCSitemapRow[]> {
  try {
    const encodedSite = encodeURIComponent(siteUrl);
    const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) return [];

    const data = await res.json();
    const list = data.sitemap || [];

    return list.map((sm: any) => {
      let submittedCount = 0;
      let indexedCount = 0;

      if (sm.contents && Array.isArray(sm.contents)) {
        sm.contents.forEach((c: any) => {
          submittedCount += parseInt(c.submitted || '0', 10);
          indexedCount += parseInt(c.indexed || '0', 10);
        });
      }

      return {
        path: sm.path || siteUrl + '/sitemap-index.xml',
        lastSubmitted: sm.lastSubmitted || new Date().toISOString(),
        isPending: !!sm.isPending,
        isSitemapsIndex: !!sm.isSitemapsIndex,
        type: sm.type || 'sitemap',
        errors: parseInt(sm.errors || '0', 10),
        warnings: parseInt(sm.warnings || '0', 10),
        submitted: submittedCount,
        indexed: indexedCount
      };
    });
  } catch {
    return [];
  }
}

// Live URL Inspection Helper (inspects indexability, headers, canonicals, robots)
export async function inspectUrl(targetPath: string, siteUrl: string): Promise<URLInspectionResult> {
  const cleanBase = siteUrl.replace(/\/$/, '');
  const cleanPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  const fullUrl = targetPath.startsWith('http') ? targetPath : `${cleanBase}${cleanPath}`;
  const now = new Date().toISOString();

  try {
    const res = await fetch(fullUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
    });

    const httpStatus = res.status;
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'No title tag found';

    const hasMetaDesc = /<meta[^>]*name=["']description["'][^>]*content=["'][^"']+["']/i.test(html);
    const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i);
    const metaRobots = robotsMatch ? robotsMatch[1] : 'index, follow (default)';

    const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    const canonicalUrl = canonicalMatch ? canonicalMatch[1] : fullUrl;

    const hasOg = /<meta[^>]*property=["']og:title["']/i.test(html);
    const isSitemapIncluded = !cleanPath.includes('/admin') && !cleanPath.includes('/api/');

    let verdict: URLInspectionResult['verdict'] = 'ELIGIBLE';
    if (httpStatus === 200 && !metaRobots.includes('noindex')) {
      verdict = 'INDEXED';
    } else if (metaRobots.includes('noindex')) {
      verdict = 'BLOCKED';
    } else if (httpStatus === 404) {
      verdict = 'NOT_FOUND';
    }

    return {
      url: fullUrl,
      verdict,
      httpStatus,
      title,
      hasMetaDescription: hasMetaDesc,
      metaRobots,
      canonicalUrl,
      isSitemapIncluded,
      hasOpenGraph: hasOg,
      inspectedAt: now
    };
  } catch (err: any) {
    return {
      url: fullUrl,
      verdict: 'BLOCKED',
      httpStatus: 0,
      title: 'Inspection Network Error',
      hasMetaDescription: false,
      metaRobots: 'network_failure',
      canonicalUrl: fullUrl,
      isSitemapIncluded: false,
      hasOpenGraph: false,
      inspectedAt: now
    };
  }
}

// Master function: Fetch and summarize all Google Search Console data
export async function getSearchConsoleData(
  env: {
    GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL?: string;
    GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY?: string;
    GOOGLE_SEARCH_CONSOLE_SITE_URL?: string;
  },
  options: {
    range?: '7d' | '28d' | '90d';
    forceRefresh?: boolean;
  } = {}
): Promise<GSCDataSummary> {
  const siteUrl = env.GOOGLE_SEARCH_CONSOLE_SITE_URL || 'https://sahyak.com';
  const clientEmail = env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL || '';
  const privateKey = env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY || '';
  const hasPrivateKey = !!privateKey.trim();

  // Validate private key format
  const isKeyFormatValid = hasPrivateKey && (privateKey.includes('-----BEGIN PRIVATE KEY-----') || privateKey.includes('-----BEGIN RSA PRIVATE KEY-----'));

  const range = options.range || '28d';
  const cacheKey = `${siteUrl}_${range}`;
  const now = Date.now();

  // Return cached result if valid and not forcing refresh
  if (!options.forceRefresh && gscCache[cacheKey] && gscCache[cacheKey].expiresAt > now) {
    return gscCache[cacheKey].data;
  }

  // Calculate dates (Search Console data has a 2-day reporting latency)
  const daysBack = range === '7d' ? 7 : (range === '90d' ? 90 : 28);
  const endD = new Date(now - 2 * 24 * 3600 * 1000);
  const startD = new Date(endD.getTime() - daysBack * 24 * 3600 * 1000);

  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  const startDate = formatDate(startD);
  const endDate = formatDate(endD);

  // Check if credentials are provided
  if (!clientEmail || !hasPrivateKey) {
    return {
      status: 'not_configured',
      statusMessage: 'Google Search Console credentials not yet configured in environment variables.',
      siteUrl,
      clientEmail,
      hasPrivateKey,
      isKeyFormatValid,
      startDate,
      endDate,
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
      lastFetchedAt: new Date().toISOString()
    };
  }

  // Authenticate
  const auth = await getGoogleAccessToken(clientEmail, privateKey);
  if (!auth.success || !auth.token) {
    return {
      status: 'auth_error',
      statusMessage: auth.error || 'Authentication with Google failed.',
      siteUrl,
      clientEmail,
      hasPrivateKey,
      isKeyFormatValid,
      startDate,
      endDate,
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
      lastFetchedAt: new Date().toISOString()
    };
  }

  const token = auth.token;

  // Run queries in parallel across dimensions
  const [queryRes, pageRes, countryRes, deviceRes, dateRes, sitemaps] = await Promise.all([
    querySearchConsole(token, siteUrl, { startDate, endDate, dimensions: ['query'], rowLimit: 100 }),
    querySearchConsole(token, siteUrl, { startDate, endDate, dimensions: ['page'], rowLimit: 50 }),
    querySearchConsole(token, siteUrl, { startDate, endDate, dimensions: ['country'], rowLimit: 30 }),
    querySearchConsole(token, siteUrl, { startDate, endDate, dimensions: ['device'], rowLimit: 5 }),
    querySearchConsole(token, siteUrl, { startDate, endDate, dimensions: ['date'], rowLimit: 100 }),
    querySitemaps(token, siteUrl)
  ]);

  // Handle Permission Error
  if (queryRes.error && queryRes.error.toLowerCase().includes('permission')) {
    return {
      status: 'permission_denied',
      statusMessage: `Google Search Console Permission Denied: Make sure ${clientEmail} is added as a User (Full or Restricted) on the property "${siteUrl}" in Search Console Settings -> Users.`,
      siteUrl,
      clientEmail,
      hasPrivateKey,
      isKeyFormatValid,
      startDate,
      endDate,
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
      lastFetchedAt: new Date().toISOString()
    };
  }

  // Process Queries
  const topQueries: GSCQueryRow[] = (queryRes.rows || []).map((r: any) => ({
    query: r.keys?.[0] || 'Unknown Query',
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: Math.round((r.ctr || 0) * 1000) / 10,
    position: Math.round((r.position || 0) * 10) / 10
  })).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

  // Process Pages
  const topPages: GSCPageRow[] = (pageRes.rows || []).map((r: any) => ({
    page: r.keys?.[0] || '/',
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: Math.round((r.ctr || 0) * 1000) / 10,
    position: Math.round((r.position || 0) * 10) / 10
  })).sort((a, b) => b.clicks - a.clicks);

  // Process Countries
  const countries: GSCCountryRow[] = (countryRes.rows || []).map((r: any) => {
    const code = (r.keys?.[0] || 'ind').toLowerCase();
    const meta = GSC_COUNTRY_MAP[code] || { name: code.toUpperCase(), flag: '🌐' };
    return {
      countryCode: code,
      countryName: meta.name,
      flag: meta.flag,
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: Math.round((r.ctr || 0) * 1000) / 10,
      position: Math.round((r.position || 0) * 10) / 10
    };
  }).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

  // Process Devices
  const totalDeviceImpressions = (deviceRes.rows || []).reduce((acc: number, r: any) => acc + (r.impressions || 0), 0) || 1;
  const devices: GSCDeviceRow[] = (deviceRes.rows || []).map((r: any) => {
    const rawDev = (r.keys?.[0] || 'DESKTOP').toUpperCase();
    return {
      device: rawDev,
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: Math.round((r.ctr || 0) * 1000) / 10,
      position: Math.round((r.position || 0) * 10) / 10,
      percentage: Math.round(((r.impressions || 0) / totalDeviceImpressions) * 100)
    };
  }).sort((a, b) => b.clicks - a.clicks);

  // Process Time Series (sorted chronologically)
  const timeSeries: GSCDateRow[] = (dateRes.rows || []).map((r: any) => ({
    date: r.keys?.[0] || '',
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: Math.round((r.ctr || 0) * 1000) / 10,
    position: Math.round((r.position || 0) * 10) / 10
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Compute Totals
  const totalClicks = topQueries.reduce((acc, q) => acc + q.clicks, 0);
  const totalImpressions = topQueries.reduce((acc, q) => acc + q.impressions, 0);
  const avgCtr = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 1000) / 10 : 0;
  const avgPosition = topQueries.length > 0
    ? Math.round((topQueries.reduce((acc, q) => acc + q.position, 0) / topQueries.length) * 10) / 10
    : 0;

  // Compute SEO Opportunities
  const opportunities: GSCOpportunity[] = [];
  topQueries.filter(q => q.position >= 4 && q.position <= 15).slice(0, 10).forEach(q => {
    opportunities.push({
      type: 'striking_distance',
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.ctr,
      position: q.position,
      recommendation: `Currently ranking #${q.position}. Optimize on-page headings and internal links to push into Google Top 3.`
    });
  });

  topQueries.filter(q => q.impressions >= 25 && q.ctr < 3.0).slice(0, 10).forEach(q => {
    opportunities.push({
      type: 'low_ctr',
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.ctr,
      position: q.position,
      recommendation: `High visibility (${q.impressions} views) but only ${q.ctr}% CTR. Rewrite meta title & description with stronger CTR hooks.`
    });
  });

  const result: GSCDataSummary = {
    status: 'connected',
    statusMessage: `Successfully connected to Google Search Console for property: ${siteUrl}`,
    siteUrl,
    clientEmail,
    hasPrivateKey,
    isKeyFormatValid,
    startDate,
    endDate,
    totalClicks,
    totalImpressions,
    avgCtr,
    avgPosition,
    topQueries,
    topPages,
    countries,
    devices,
    timeSeries,
    sitemaps,
    opportunities,
    lastFetchedAt: new Date().toISOString()
  };

  // Cache for 15 minutes
  gscCache[cacheKey] = {
    data: result,
    expiresAt: now + 15 * 60 * 1000
  };

  return result;
}

// Generate CSV Exports for Google Search Console data
export function exportGscToCsv(
  data: GSCDataSummary,
  dimension: 'all' | 'queries' | 'pages' | 'countries' | 'dates' | 'opportunities' = 'all'
): string {
  if (dimension === 'queries') {
    const headers = ['Keyword / Search Query', 'Organic Clicks', 'Google Impressions', 'CTR (%)', 'Average Position'];
    const rows = data.topQueries.map(q => [
      `"${q.query.replace(/"/g, '""')}"`,
      q.clicks,
      q.impressions,
      `${q.ctr}%`,
      q.position
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  if (dimension === 'pages') {
    const headers = ['Landing Page URL', 'Organic Clicks', 'Google Impressions', 'CTR (%)', 'Average Position'];
    const rows = data.topPages.map(p => [
      `"${p.page}"`,
      p.clicks,
      p.impressions,
      `${p.ctr}%`,
      p.position
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  if (dimension === 'countries') {
    const headers = ['Country Code', 'Country Name', 'Clicks', 'Impressions', 'CTR (%)', 'Average Position'];
    const rows = data.countries.map(c => [
      `"${c.countryCode}"`,
      `"${c.countryName}"`,
      c.clicks,
      c.impressions,
      `${c.ctr}%`,
      c.position
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  if (dimension === 'dates') {
    const headers = ['Date', 'Organic Clicks', 'Google Impressions', 'CTR (%)', 'Average Position'];
    const rows = data.timeSeries.map(t => [
      `"${t.date}"`,
      t.clicks,
      t.impressions,
      `${t.ctr}%`,
      t.position
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  if (dimension === 'opportunities') {
    const headers = ['Opportunity Type', 'Search Query', 'Clicks', 'Impressions', 'CTR (%)', 'Position', 'Action Recommendation'];
    const rows = data.opportunities.map(o => [
      `"${o.type}"`,
      `"${o.query.replace(/"/g, '""')}"`,
      o.clicks,
      o.impressions,
      `${o.ctr}%`,
      o.position,
      `"${o.recommendation.replace(/"/g, '""')}"`
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  // Dimension === 'all' (Master GSC Executive Report)
  const lines: string[] = [];
  lines.push('=== GOOGLE SEARCH CONSOLE - ORGANIC PERFORMANCE REPORT ===');
  lines.push(`Site Property: ${data.siteUrl}`);
  lines.push(`Reporting Period: ${data.startDate} to ${data.endDate}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total Organic Clicks: ${data.totalClicks}`);
  lines.push(`Total Impressions: ${data.totalImpressions}`);
  lines.push(`Average CTR: ${data.avgCtr}%`);
  lines.push(`Average Position: ${data.avgPosition}`);
  lines.push('');
  lines.push('--- TOP SEARCH QUERIES / KEYWORDS ---');
  lines.push('Query,Clicks,Impressions,CTR,Position');
  data.topQueries.slice(0, 50).forEach(q => {
    lines.push(`"${q.query.replace(/"/g, '""')}",${q.clicks},${q.impressions},${q.ctr}%,${q.position}`);
  });
  lines.push('');
  lines.push('--- TOP LANDING PAGES ---');
  lines.push('Page,Clicks,Impressions,CTR,Position');
  data.topPages.slice(0, 30).forEach(p => {
    lines.push(`"${p.page}",${p.clicks},${p.impressions},${p.ctr}%,${p.position}`);
  });
  lines.push('');
  lines.push('--- DEVICE DISTRIBUTION ---');
  lines.push('Device,Clicks,Impressions,CTR,Share');
  data.devices.forEach(d => {
    lines.push(`"${d.device}",${d.clicks},${d.impressions},${d.ctr}%,${d.percentage}%`);
  });
  lines.push('');
  lines.push('--- COUNTRY BREAKDOWN ---');
  lines.push('Country,Clicks,Impressions,CTR,Position');
  data.countries.slice(0, 20).forEach(c => {
    lines.push(`"${c.countryName}",${c.clicks},${c.impressions},${c.ctr}%,${c.position}`);
  });

  return lines.join('\n');
}
