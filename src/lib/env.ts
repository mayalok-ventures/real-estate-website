import type { Env, D1Database } from '../types/db';

export interface ProductionRuntimeEnv {
  DB?: D1Database;
  ADMIN_ACCESS_TOKEN: string;
  ADMIN_PASSWORD: string;
  ADMIN_SESSION_SECRET: string;
  ADMIN_EMAILS: string;
  ADMIN_SECRET: string;
  CLOUDFLARE_D1_DATABASE_ID: string;
  CLOUDFLARE_D1_DATABASE_NAME: string;
  CONTACT_EMAIL: string;
  SALES_EMAIL: string;
  SUPPORT_EMAIL: string;
  CRM_API_KEY: string;
  CRM_WEBHOOK_URL: string;
  GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL: string;
  GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY: string;
  GOOGLE_SEARCH_CONSOLE_SITE_URL: string;
  NEXT_PUBLIC_CRM_LOGIN_URL: string;
  NEXT_PUBLIC_CRM_SIGNUP_URL: string;
  NEXT_PUBLIC_SITE_URL: string;
  NEXT_PUBLIC_WHATSAPP_NUMBER: string;
  NEXT_PUBLIC_WHATSAPP_SALES_URL: string;
  NODE_VERSION: string;
  APP_ENV: string;
}

// Helper to safely get Cloudflare / environment variables in both local dev and Cloudflare runtime
export async function getRuntimeEnv(contextOrLocals?: any): Promise<ProductionRuntimeEnv> {
  let cfEnv: any = {};
  let envFileVars: Record<string, string> = {};

  // 1. In Astro v6/v7 with @astrojs/cloudflare, bindings are imported from 'cloudflare:workers'
  try {
    // @ts-ignore
    const cf = await import('cloudflare:workers');
    if (cf && cf.env) {
      cfEnv = { ...cf.env };
    }
  } catch {
    // Not running inside Cloudflare Workers runtime
  }

  // 2. Direct object passed with env
  if (contextOrLocals && typeof contextOrLocals === 'object') {
    if ('env' in contextOrLocals && typeof contextOrLocals.env === 'object' && contextOrLocals.env !== null) {
      cfEnv = { ...contextOrLocals.env, ...cfEnv };
    }
  }

  // 3. Fallback: Read local .env file safely if in Node / dev environment
  try {
    // @ts-ignore
    const fs = await import('node:fs');
    // @ts-ignore
    const path = await import('node:path');
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split('\n');
      let currentKey: string | null = null;
      let currentValue = '';
      let inQuotes = false;
      let quoteChar = '';

      for (const line of lines) {
        if (!inQuotes) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if (val.startsWith('"') || val.startsWith("'")) {
              quoteChar = val[0];
              if (val.endsWith(quoteChar) && val.length > 1) {
                envFileVars[key] = val.slice(1, -1);
              } else {
                inQuotes = true;
                currentKey = key;
                currentValue = val.slice(1) + '\n';
              }
            } else {
              envFileVars[key] = val;
            }
          }
        } else {
          const trimmed = line.trimEnd();
          if (trimmed.endsWith(quoteChar)) {
            currentValue += trimmed.slice(0, -1);
            if (currentKey) envFileVars[currentKey] = currentValue;
            inQuotes = false;
            currentKey = null;
            currentValue = '';
          } else {
            currentValue += line + '\n';
          }
        }
      }
    }
  } catch {
    // Non-node runtime
  }

  // Helper to resolve an env variable from any source in priority order
  const getVal = (name: string, fallback: string = ''): string => {
    return cfEnv[name] ||
      (typeof process !== 'undefined' ? process.env?.[name] : undefined) ||
      envFileVars[name] ||
      fallback;
  };

  const adminPassword = getVal('ADMIN_PASSWORD', '');
  const adminSecret = getVal('ADMIN_SECRET', adminPassword || 'sahyak_admin_secure_key_2026');
  const adminSessionSecret = getVal('ADMIN_SESSION_SECRET', adminSecret);
  const adminAccessToken = getVal('ADMIN_ACCESS_TOKEN', '');

  return {
    DB: cfEnv.DB || (typeof process !== 'undefined' ? (process.env as any)?.DB : undefined),
    ADMIN_ACCESS_TOKEN: adminAccessToken,
    ADMIN_PASSWORD: adminPassword || adminSecret,
    ADMIN_SESSION_SECRET: adminSessionSecret,
    ADMIN_EMAILS: getVal('ADMIN_EMAILS', 'admin@sahyak.com,team@sahyak.com,support@sahyak.com'),
    ADMIN_SECRET: adminSecret,
    CLOUDFLARE_D1_DATABASE_ID: getVal('CLOUDFLARE_D1_DATABASE_ID', '29ac8dce-f4f3-4878-aa36-53648608b38c'),
    CLOUDFLARE_D1_DATABASE_NAME: getVal('CLOUDFLARE_D1_DATABASE_NAME', 'mobile-crm-website'),
    CONTACT_EMAIL: getVal('CONTACT_EMAIL', 'support@sahyak.com'),
    SALES_EMAIL: getVal('SALES_EMAIL', 'sales@sahyak.com'),
    SUPPORT_EMAIL: getVal('SUPPORT_EMAIL', 'support@sahyak.com'),
    CRM_API_KEY: getVal('CRM_API_KEY', ''),
    CRM_WEBHOOK_URL: getVal('CRM_WEBHOOK_URL', ''),
    GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL: getVal('GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL', ''),
    GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY: getVal('GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY', ''),
    GOOGLE_SEARCH_CONSOLE_SITE_URL: getVal('GOOGLE_SEARCH_CONSOLE_SITE_URL', 'https://sahyak.com'),
    NEXT_PUBLIC_CRM_LOGIN_URL: getVal('NEXT_PUBLIC_CRM_LOGIN_URL', 'https://app.sahyak.com/login'),
    NEXT_PUBLIC_CRM_SIGNUP_URL: getVal('NEXT_PUBLIC_CRM_SIGNUP_URL', 'https://app.sahyak.com/signup'),
    NEXT_PUBLIC_SITE_URL: getVal('NEXT_PUBLIC_SITE_URL', 'https://sahyak.com'),
    NEXT_PUBLIC_WHATSAPP_NUMBER: getVal('NEXT_PUBLIC_WHATSAPP_NUMBER', '+91 87964 75107'),
    NEXT_PUBLIC_WHATSAPP_SALES_URL: getVal('NEXT_PUBLIC_WHATSAPP_SALES_URL', 'https://wa.me/918796475107'),
    NODE_VERSION: getVal('NODE_VERSION', '22.12.0'),
    APP_ENV: getVal('APP_ENV', 'production')
  };
}

