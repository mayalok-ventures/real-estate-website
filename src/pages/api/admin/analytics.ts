import type { APIRoute } from 'astro';
import { getAnalyticsSummary } from '../../../lib/analytics';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const admin = (locals as any)?.admin;
  if (!admin || !admin.email) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized', message: 'Admin authentication required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const range = (url.searchParams.get('range') as '24h' | '7d' | '30d') || '24h';
    const summary = getAnalyticsSummary(range);

    return new Response(JSON.stringify({
      success: true,
      data: summary
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      message: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
