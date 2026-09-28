import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../../../lib/env';
import { getSearchConsoleData, exportGscToCsv } from '../../../../lib/googleSearchConsole';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const dimension = (url.searchParams.get('type') || url.searchParams.get('dimension') || 'all') as 'all' | 'queries' | 'pages' | 'countries' | 'dates' | 'opportunities' | 'clusters' | 'market' | 'audit' | 'truth' | 'authority';
    const range = (url.searchParams.get('range') as '7d' | '28d' | '90d') || '28d';

    const env = await getRuntimeEnv();
    const data = await getSearchConsoleData(env, { range });

    const csvContent = exportGscToCsv(data, dimension);
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `sahyak_gsc_${dimension}_${timestamp}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store'
      }
    });
  } catch (err: any) {
    return new Response(`Error generating Google Search Console CSV: ${err.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
