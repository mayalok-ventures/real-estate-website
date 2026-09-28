export interface VisitorSession {
  session_id: string;
  visitor_id: string;
  ip_hash: string;
  country: string;
  country_code: string;
  city: string;
  region: string;
  page: string;
  page_title: string;
  referrer: string;
  traffic_source: 'Direct' | 'Google' | 'WhatsApp' | 'LinkedIn' | 'Instagram' | 'YouTube' | 'Facebook' | 'Twitter/X' | 'Property Portal' | 'Referral';
  referrer_domain: string;
  device: 'Desktop' | 'Mobile' | 'Tablet';
  browser: string;
  duration_seconds: number;
  active_section: string;
  sections_viewed: Record<string, number>;
  is_new_today: boolean;
  created_at: string;
  last_active_at: string;
}

export interface TrackPayload {
  event: 'pageview' | 'heartbeat' | 'leave';
  session_id: string;
  visitor_id: string;
  page: string;
  page_title?: string;
  referrer?: string;
  duration_seconds?: number;
  active_section?: string;
  section_durations?: Record<string, number>;
  screen_width?: number;
}

export interface PageInsight {
  page: string;
  title: string;
  totalViews: number;
  uniqueVisitors: number;
  avgDurationSeconds: number;
  bounceRate: number;
  topSection: string;
  sections: Array<{ section_id: string; label: string; avgSeconds: number; viewPercent: number }>;
}

export interface TrafficSourceSummary {
  channel: string;
  count: number;
  percentage: number;
  avgDurationSeconds: number;
  icon: string;
  color: string;
}

export interface TrafficDomainSummary {
  domain: string;
  platformName: string;
  channel: string;
  count: number;
  percentage: number;
  avgDurationSeconds: number;
}

export interface TimeSeriesData {
  labels: string[];
  visitors: number[];
  pageviews: number[];
  activeUsers: number[];
  avgDuration: number[];
}

export interface AnalyticsSummary {
  realtimeActiveUsers: number;
  todayNewVisitors: number;
  totalVisitors: number;
  avgStayDurationSeconds: number;
  totalPageViews: number;
  timeSeries: Record<'24h' | '7d' | '30d', TimeSeriesData>;
  pages: PageInsight[];
  trafficChannels: TrafficSourceSummary[];
  trafficDomains: TrafficDomainSummary[];
  visitorLogs: VisitorSession[];
}
