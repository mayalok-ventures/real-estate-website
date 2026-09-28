export interface GSCQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number; // Percentage, e.g. 5.4%
  position: number; // e.g. 2.8
}

export interface GSCPageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCCountryRow {
  countryCode: string;
  countryName: string;
  flag: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCDeviceRow {
  device: string; // 'DESKTOP' | 'MOBILE' | 'TABLET'
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  percentage: number;
}

export interface GSCDateRow {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCSitemapRow {
  path: string;
  lastSubmitted: string;
  isPending: boolean;
  isSitemapsIndex: boolean;
  type: string;
  errors: number;
  warnings: number;
  submitted: number;
  indexed: number;
}

export interface GSCOpportunity {
  type: 'striking_distance' | 'low_ctr';
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  recommendation: string;
}

export interface URLInspectionResult {
  url: string;
  verdict: 'INDEXED' | 'ELIGIBLE' | 'BLOCKED' | 'NOT_FOUND';
  httpStatus: number;
  title: string;
  hasMetaDescription: boolean;
  metaRobots: string;
  canonicalUrl: string;
  isSitemapIncluded: boolean;
  hasOpenGraph: boolean;
  inspectedAt: string;
}

export interface GSCDataSummary {
  status: 'connected' | 'not_configured' | 'auth_error' | 'permission_denied';
  statusMessage: string;
  siteUrl: string;
  clientEmail: string;
  hasPrivateKey: boolean;
  isKeyFormatValid?: boolean;
  startDate: string;
  endDate: string;
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  topQueries: GSCQueryRow[];
  topPages: GSCPageRow[];
  countries: GSCCountryRow[];
  devices: GSCDeviceRow[];
  timeSeries: GSCDateRow[];
  sitemaps: GSCSitemapRow[];
  opportunities: GSCOpportunity[];
  lastFetchedAt: string;
}
