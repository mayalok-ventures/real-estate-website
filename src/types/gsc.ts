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
  verdict: 'INDEXED' | 'ELIGIBLE' | 'BLOCKED' | 'NOT_FOUND' | 'HTTP_ACCESSIBLE' | 'NOINDEX_DETECTED' | 'HTTP_ERROR';
  httpStatus: number;
  title: string;
  hasMetaDescription: boolean;
  metaRobots: string;
  canonicalUrl: string;
  isSitemapIncluded: boolean;
  hasOpenGraph: boolean;
  inspectedAt: string;
  inspectionSource?: 'google_api' | 'live_http_check';
  inspectionMessage?: string;
  googleIndexStatus?: any;
}

export interface GSCAlert {
  id: string;
  severity: 'good' | 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  actionLabel?: string;
  actionUrl?: string;
}

export interface GSCTopicCluster {
  id: string;
  name: string;
  persona: string;
  targetPages: string[];
  totalVolume: number;
  rankingCount: number;
  intent: 'Transactional' | 'Commercial' | 'Informational';
  topKeywords: string[];
  color: string;
}

export interface GSCTopicNode {
  topic: string;
  pillar: string;
  authorityScore: number; // 0-100
  rankingKeywords: number;
  targetUrl: string;
  internalLinks: number;
  status: 'Dominant' | 'Strong' | 'Growing' | 'Emerging';
}

export interface GSCProductTruth {
  query: string;
  claimedFeature: string;
  landingPage: string;
  verifiedStatus: '100% Verified Truth' | 'Aligned' | 'Feature Supported';
  accuracyScore: number; // 0-100
  notes: string;
}

export interface GSCCompetitorComparison {
  name: string;
  domain: string;
  overlapPercentage: number;
  pricePosition: string;
  advantages: string;
  vulnerability: string;
}

export interface GSCMarketIntelligence {
  marketSharePercentage: number;
  competitors: GSCCompetitorComparison[];
  intentBreakdown: {
    transactional: number;
    commercial: number;
    informational: number;
  };
  highVolumeLowKDKeywords: {
    keyword: string;
    volume: number;
    kd: number;
    cpc: string;
    intent: string;
  }[];
}

export interface GSCConversionPage {
  page: string;
  organicClicks: number;
  formInquiries: number;
  conversionRate: number;
  estimatedRevenueValue: string;
}

export interface GSCConversionData {
  totalOrganicLeads: number;
  avgConversionRate: number;
  estimatedAdSavings: string;
  topPages: GSCConversionPage[];
}

export interface GSCAuditCheck {
  id: string;
  name: string;
  category: 'Technical' | 'Content' | 'Schema' | 'Mobile' | 'Core Web Vitals';
  status: 'passed' | 'warning' | 'failed';
  score: string;
  details: string;
}

export interface GSCHealthOverview {
  overallScore: number;
  indexingCoverageRate: number;
  coreWebVitalsStatus: 'Passed' | 'Needs Improvement';
  lcpValue: string;
  clsValue: string;
  inpValue: string;
  mobileUsability: string;
  securityIssues: number;
  manualActions: number;
}

export interface GSCDataSummary {
  status: 'connected' | 'not_configured' | 'auth_error' | 'permission_denied';
  statusMessage: string;
  isLive: boolean;
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
  // Optional / Nullable modules
  healthOverview?: GSCHealthOverview | null;
  alerts: GSCAlert[];
  marketIntelligence?: GSCMarketIntelligence | null;
  conversions?: GSCConversionData | null;
  authorityNodes: GSCTopicNode[];
  productTruth: GSCProductTruth[];
  clusters: GSCTopicCluster[];
  auditIssues: GSCAuditCheck[];
}

