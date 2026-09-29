import type { APIRoute } from 'astro';
import { exportAnalyticsToCsv } from '../../../../lib/analytics';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const admin = (locals as any)?.admin;
  if (!admin || !admin.email) {
    return new Response('Unauthorized: Administrator session required.', {
      status: 401,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  try {
    const type = (url.searchParams.get('type') || 'all') as 'visitors' | 'pages' | 'sources' | 'all';
    const csvContent = exportAnalyticsToCsv(type);

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `sahyak_${type}_analytics_${timestamp}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store'
      }
    });
  } catch (err: any) {
    return new Response(`Error generating CSV: ${err.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};
