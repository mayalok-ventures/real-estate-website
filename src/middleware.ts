import { defineMiddleware } from 'astro:middleware';
import { getRuntimeEnv } from './lib/env';
import { verifySessionToken, verifyCloudflareAccessJWT, timingSafeEqual, sanitizeRedirectUrl } from './lib/auth';

const CSP_DIRECTIVES = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; img-src 'self' data: https://images.unsplash.com https://i.pravatar.cc https://sahyak.com; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;";

function applySecurityHeaders(res: Response): Response {
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.headers.set('Content-Security-Policy', CSP_DIRECTIVES);
  return res;
}

const CONSOLIDATION_REDIRECTS: Record<string, string> = {
  '/solutions/real-estate-lead-follow-up': '/solutions/real-estate-lead-management/',
  '/solutions/real-estate-lead-follow-up/': '/solutions/real-estate-lead-management/',
  '/resources/real-estate-crm-migration': '/tools/real-estate-crm-migration-checklist/',
  '/resources/real-estate-crm-migration/': '/tools/real-estate-crm-migration-checklist/',
  '/tools/real-estate-lead-leakage-calculator': '/tools/real-estate-crm-roi-calculator/',
  '/tools/real-estate-lead-leakage-calculator/': '/tools/real-estate-crm-roi-calculator/',
  '/tools/crm-roi-calculator': '/tools/real-estate-crm-roi-calculator/',
  '/tools/crm-roi-calculator/': '/tools/real-estate-crm-roi-calculator/',
  '/industry/channel-partners': '/industry/real-estate-brokers/',
  '/industry/channel-partners/': '/industry/real-estate-brokers/'
};

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // Handle SEO permanent consolidation redirects
  if (CONSOLIDATION_REDIRECTS[pathname]) {
    return context.redirect(CONSOLIDATION_REDIRECTS[pathname], 301);
  }

  // Protect /admin routes and /api/admin routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    // Exempt login/logout endpoints and assets
    if (pathname === '/admin/login' || pathname === '/api/admin/login' || pathname === '/api/admin/logout' || pathname.startsWith('/admin/assets')) {
      const response = await next();
      return applySecurityHeaders(response);
    }

    const env = await getRuntimeEnv(context);
    const adminEmailsConfig = env.ADMIN_EMAILS.split(',').map((e: string) => e.trim().toLowerCase());
    if (!adminEmailsConfig.includes('admin@sahyak.com')) {
      adminEmailsConfig.push('admin@sahyak.com');
    }

    // 1. Bearer / Access Token Check (Timing-safe comparison)
    const authHeader = context.request.headers.get('Authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const xAdminToken = context.request.headers.get('x-admin-token') || '';
    const providedToken = bearerToken || xAdminToken;
    if (providedToken && env.ADMIN_ACCESS_TOKEN && timingSafeEqual(providedToken, env.ADMIN_ACCESS_TOKEN)) {
      (context.locals as any).admin = {
        email: 'admin@sahyak.com',
        role: 'superadmin',
        source: 'access-token'
      };
      const response = await next();
      return applySecurityHeaders(response);
    }

    // 2. Cloudflare Access Cryptographically Signed Assertion Check (Never trust plain email header)
    const cfJwtAssertion = context.request.headers.get('Cf-Access-Jwt-Assertion') ||
                           context.cookies.get('CF_Authorization')?.value;
    if (cfJwtAssertion && env.CF_ACCESS_TEAM_NAME && env.CF_ACCESS_AUD) {
      const cfVerification = await verifyCloudflareAccessJWT(
        cfJwtAssertion,
        env.CF_ACCESS_TEAM_NAME,
        env.CF_ACCESS_AUD,
        adminEmailsConfig
      );

      if (cfVerification.valid && cfVerification.email) {
        (context.locals as any).admin = {
          email: cfVerification.email,
          role: 'superadmin',
          source: 'cf-access'
        };
        const response = await next();
        return applySecurityHeaders(response);
      }
    }

    // 3. Cryptographically Signed App-Level Session Cookie Check
    const sessionCookie = context.cookies.get('sahyak_admin_session')?.value;
    const sessionSecret = env.ADMIN_SESSION_SECRET || env.ADMIN_SECRET;

    if (sessionCookie) {
      if (sessionSecret) {
        const verification = await verifySessionToken(
          sessionCookie,
          sessionSecret,
          adminEmailsConfig,
          env.DB
        );

        if (verification.valid && verification.user) {
          (context.locals as any).admin = verification.user;
          const response = await next();
          return applySecurityHeaders(response);
        }
      }

      // If session is invalid, forged, or secret missing, purge cookie to prevent redirect loop
      context.cookies.delete('sahyak_admin_session', { path: '/' });
    }

    // Access Denied
    if (pathname.startsWith('/api/admin')) {
      const res = new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized',
        message: 'Valid Cloudflare Access credentials or active administrator session required.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
      return applySecurityHeaders(res);
    }

    // Redirect to Admin Login page with sanitized return destination
    const safeReturnPath = sanitizeRedirectUrl(pathname + url.search, '/admin');
    const returnUrl = encodeURIComponent(safeReturnPath);
    const redirectRes = context.redirect(`/admin/login?redirect=${returnUrl}`);
    return applySecurityHeaders(redirectRes);
  }

  const response = await next();
  return applySecurityHeaders(response);
});
