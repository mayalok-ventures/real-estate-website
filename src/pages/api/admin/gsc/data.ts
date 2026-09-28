import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../../lib/env';
import { getSearchConsoleData } from '../../../../lib/googleSearchConsole';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const range = (url.searchParams.get('range') as '7d' | '28d' | '90d') || '28d';
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    const env = await getRuntimeEnv();
    const data = await getSearchConsoleData(env, { range, forceRefresh });

    return new Response(JSON.stringify({
      success: true,
      data
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
      message: err.message || 'Error fetching Google Search Console data.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
