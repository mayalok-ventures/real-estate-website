export interface ContactSubmission {
  id?: number;
  name: string;
  email: string;
  phone: string;
  company?: string | null;
  inquiry_type: 'demo' | 'pricing' | 'support' | 'partnership' | 'general';
  message?: string | null;
  ip_hash?: string;
  user_agent?: string;
  status?: 'new' | 'contacted' | 'qualified' | 'closed' | 'archived';
  admin_notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ResourceItem {
  id?: number;
  title: string;
  slug: string;
  category: string;
  type: 'guide' | 'video' | 'checklist' | 'template';
  summary: string;
  read_time: string;
  featured: number;
  created_at?: string;
}

export interface AdminSession {
  session_id: string;
  email: string;
  role: 'superadmin' | 'admin' | 'viewer';
  expires_at: number;
  created_at?: string;
}

export interface Env {
  DB?: D1Database;
  ASSETS?: Fetcher;
  ADMIN_ACCESS_TOKEN?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
  ADMIN_EMAILS?: string;
  ADMIN_SECRET?: string;
  CLOUDFLARE_D1_DATABASE_ID?: string;
  CLOUDFLARE_D1_DATABASE_NAME?: string;
  CONTACT_EMAIL?: string;
  SALES_EMAIL?: string;
  SUPPORT_EMAIL?: string;
  CRM_API_KEY?: string;
  CRM_WEBHOOK_URL?: string;
  GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL?: string;
  GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY?: string;
  GOOGLE_SEARCH_CONSOLE_SITE_URL?: string;
  NEXT_PUBLIC_CRM_LOGIN_URL?: string;
  NEXT_PUBLIC_CRM_SIGNUP_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_WHATSAPP_NUMBER?: string;
  NEXT_PUBLIC_WHATSAPP_SALES_URL?: string;
  NODE_VERSION?: string;
  APP_ENV?: string;
}

