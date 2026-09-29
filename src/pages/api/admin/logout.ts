import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../lib/env';
import { revokeSessionToken } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ cookies }) => {
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

export const GET: APIRoute = async ({ cookies, redirect }) => {
  const token = cookies.get('sahyak_admin_session')?.value;
  try {
    const env = await getRuntimeEnv();
    await revokeSessionToken(token, env.DB);
  } catch {}

  cookies.delete('sahyak_admin_session', { path: '/' });
  return redirect('/admin/login');
};
