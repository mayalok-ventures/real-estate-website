import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../lib/env';
import { createSessionToken, timingSafeEqual } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as any;
    const { email, password } = body;

    const env = await getRuntimeEnv();
    const adminEmails = env.ADMIN_EMAILS.split(',').map((e: string) => e.trim().toLowerCase());
    if (!adminEmails.includes('admin@sahyak.com')) {
      adminEmails.push('admin@sahyak.com');
    }

    const validSecret = env.ADMIN_SECRET || '';
    const validPassword = env.ADMIN_PASSWORD || '';
    const sessionSecret = env.ADMIN_SESSION_SECRET || validSecret || validPassword;

    // Fail safely if no administrative secret is configured in the environment
    if (!validPassword && !validSecret) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Administrator security credentials are not configured on the server.'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let normalizedEmail = (email || '').trim().toLowerCase();
    if (normalizedEmail === 'admin') normalizedEmail = 'admin@sahyak.com';

    // Constant-time timing-safe password comparison against configured secrets only
    const isPasswordValid = (validPassword && timingSafeEqual(password || '', validPassword)) ||
                            (validSecret && timingSafeEqual(password || '', validSecret));

    if (!adminEmails.includes(normalizedEmail) || !isPasswordValid) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid administrator email or security credentials.'
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate cryptographic HMAC-SHA256 session token (24-hour expiry) backed by D1
    const token = await createSessionToken(normalizedEmail, sessionSecret, env.DB);

    const isSecure = new URL(request.url).protocol === 'https:' || env.APP_ENV === 'production';

    cookies.set('sahyak_admin_session', token, {
      path: '/',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Authentication successful.',
      user: { email: normalizedEmail, role: 'admin' }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to process authentication.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
