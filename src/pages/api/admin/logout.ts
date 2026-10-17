import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../lib/env';
import { revokeSessionToken, verifyCsrfAndOrigin } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  // Anti-CSRF Origin / Sec-Fetch-Site validation
  const csrfCheck = verifyCsrfAndOrigin(request);
  if (!csrfCheck.allowed) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Forbidden',
      message: csrfCheck.reason || 'Cross-site request blocked.'
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = cookies.get('sahyak_admin_session')?.value;
  try {
    const env = await getRuntimeEnv();
    await revokeSessionToken(token, env.DB);
  } catch {}

  cookies.delete('sahyak_admin_session', { path: '/' });
  return new Response(JSON.stringify({ success: true, message: 'Logged out successfully.' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

// State-changing logout via GET is forbidden to prevent Logout CSRF (SEC-04)
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({
    success: false,
    error: 'Method Not Allowed',
    message: 'Logout requires a state-changing POST request with valid CSRF origin verification.'
  }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      'Allow': 'POST'
    }
  });
};
