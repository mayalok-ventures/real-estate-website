import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../../lib/env';
import { inspectUrl } from '../../../../lib/googleSearchConsole';
import { verifyCsrfAndOrigin } from '../../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = (locals as any)?.admin;
  if (!admin || !admin.email) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized', message: 'Admin authentication required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

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

  try {
    const body = (await request.json().catch(() => ({}))) as any;
    const targetUrl = body.url || '/';

    const env = await getRuntimeEnv();
    const siteUrl = env.GOOGLE_SEARCH_CONSOLE_SITE_URL || 'https://sahyak.com';

    const result = await inspectUrl(targetUrl, siteUrl);

    return new Response(JSON.stringify({
      success: true,
      data: result
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      message: err.message || 'Error inspecting URL'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
