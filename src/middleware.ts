import { defineMiddleware } from 'astro:middleware';
import { getRuntimeEnv } from './lib/env';
import { verifySessionToken } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // Protect /admin routes and /api/admin routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    // Exempt login pages/endpoints and assets
    if (pathname === '/admin/login' || pathname === '/api/admin/login' || pathname.startsWith('/admin/assets')) {
      return next();
    }

    const env = await getRuntimeEnv(context);
    const adminEmailsConfig = env.ADMIN_EMAILS.split(',').map((e: string) => e.trim().toLowerCase());
    if (!adminEmailsConfig.includes('admin@sahyak.com')) {
      adminEmailsConfig.push('admin@sahyak.com');
    }

    // 1. Bearer / Access Token Check (Supports Cloudflare ADMIN_ACCESS_TOKEN)
    const authHeader = context.request.headers.get('Authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const xAdminToken = context.request.headers.get('x-admin-token') || '';
    const providedToken = bearerToken || xAdminToken;
    if (providedToken && env.ADMIN_ACCESS_TOKEN && providedToken === env.ADMIN_ACCESS_TOKEN) {
      (context.locals as any).admin = {
        email: 'admin@sahyak.com',
        role: 'superadmin',
        source: 'access-token'
      };
      return next();
    }

    // 2. Cloudflare Access Header Check
    const cfUserEmail = context.request.headers.get('Cf-Access-Authenticated-User-Email');
    if (cfUserEmail && adminEmailsConfig.includes(cfUserEmail.toLowerCase())) {
      (context.locals as any).admin = {
        email: cfUserEmail,
        role: 'superadmin',
        source: 'cf-access'
      };
      return next();
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
          return next();
        }
      }

      // If session is invalid, forged, or secret missing, purge cookie to prevent redirect loop
      context.cookies.delete('sahyak_admin_session', { path: '/' });
    }

    // Access Denied
    if (pathname.startsWith('/api/admin')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized',
        message: 'Valid Cloudflare Access credentials or active administrator session required.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Redirect to Admin Login page with return destination
    const returnUrl = encodeURIComponent(pathname + url.search);
    return context.redirect(`/admin/login?redirect=${returnUrl}`);
  }

  return next();
});
