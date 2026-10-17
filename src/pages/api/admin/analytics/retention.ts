import type { APIRoute } from 'astro';
import { purgeOldAnalytics } from '../../../../lib/analytics';
import { getRuntimeEnv } from '../../../../lib/env';
import { verifyCsrfAndOrigin } from '../../../../lib/auth';

export const prerender = false;

/**
 * GET /api/admin/analytics/retention
 * Returns dry-run retention inspection: counts records older than cutoff without modifying data.
 */
export const GET: APIRoute = async ({ url, locals }) => {
  const admin = (locals as any)?.admin;
  if (!admin || !admin.email) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Unauthorized',
      message: 'Administrator authentication required.'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const env = await getRuntimeEnv();
    const daysParam = url.searchParams.get('retentionDays');
    const retentionDays = daysParam ? parseInt(daysParam, 10) : 90;

    const preview = await purgeOldAnalytics(env?.DB, {
      retentionDays: isNaN(retentionDays) ? 90 : retentionDays,
      dryRun: true
    });

    return new Response(JSON.stringify({
      success: true,
      mode: 'preview',
      retention: preview
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (err: any) {
    const isDbUnavailable = err.message?.includes('database binding is unconfigured') || err.message?.includes('unavailable');
    return new Response(JSON.stringify({
      success: false,
      error: isDbUnavailable ? 'Service Unavailable' : 'Internal Error',
      message: err.message
    }), {
      status: isDbUnavailable ? 503 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * POST /api/admin/analytics/retention
 * Executes bounded, idempotent batch purge of analytics sessions older than retention cutoff (FIX F).
 * Protected by Anti-CSRF Origin verification and Administrator Authentication.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const admin = (locals as any)?.admin;
  if (!admin || !admin.email) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Unauthorized',
      message: 'Administrator authentication required.'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

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

  try {
    const body = (await request.json().catch(() => ({}))) as any;
    const env = await getRuntimeEnv();

    const dryRun = Boolean(body.dryRun);
    const retentionDays = typeof body.retentionDays === 'number' ? body.retentionDays : 90;
    const batchSize = typeof body.batchSize === 'number' ? body.batchSize : 500;
    const maxBatches = typeof body.maxBatches === 'number' ? body.maxBatches : 5;

    const result = await purgeOldAnalytics(env?.DB, {
      retentionDays,
      batchSize,
      maxBatches,
      dryRun
    });

    return new Response(JSON.stringify({
      success: true,
      mode: dryRun ? 'dry_run' : 'purge_executed',
      retention: result
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (err: any) {
    const isDbUnavailable = err.message?.includes('database binding is unconfigured') || err.message?.includes('unavailable');
    return new Response(JSON.stringify({
      success: false,
      error: isDbUnavailable ? 'Service Unavailable' : 'Internal Error',
      message: err.message
    }), {
      status: isDbUnavailable ? 503 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
