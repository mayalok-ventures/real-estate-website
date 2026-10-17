import type { APIRoute } from 'astro';
import { getContactsWithCount, updateContact, getLeadSummary, sanitizeCsvCell } from '../../../lib/db';
import { getRuntimeEnv } from '../../../lib/env';
import { verifyCsrfAndOrigin } from '../../../lib/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  // Defense-in-depth authorization check
  const admin = (locals as any)?.admin;
  if (!admin || !admin.email) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized', message: 'Admin authentication required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'all';
  const search = url.searchParams.get('search') || '';
  const format = url.searchParams.get('format');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const requestedLimit = parseInt(url.searchParams.get('limit') || '25', 10) || 25;
  const limit = Math.max(1, Math.min(100, requestedLimit));
  const sinceId = parseInt(url.searchParams.get('since_id') || '0', 10) || 0;

  const env = await getRuntimeEnv();
  const db = env.DB;

  try {
    const result = await getContactsWithCount(db, {
      status,
      search,
      page,
      limit,
      sinceId,
      forExport: format === 'csv'
    });

    if (format === 'csv') {
      // Generate secure CSV export for authorized real estate admins with formula injection neutralization (SEC-03)
      const headers = ['ID', 'Date', 'Name', 'Email', 'Phone', 'Company', 'Inquiry Type', 'Status', 'Message', 'Admin Notes'];
      const rows = result.contacts.map(c => [
        c.id,
        sanitizeCsvCell(c.created_at || ''),
        sanitizeCsvCell(c.name || ''),
        sanitizeCsvCell(c.email || ''),
        sanitizeCsvCell(c.phone || ''),
        sanitizeCsvCell(c.company || ''),
        sanitizeCsvCell(c.inquiry_type),
        sanitizeCsvCell(c.status),
        sanitizeCsvCell(c.message || ''),
        sanitizeCsvCell(c.admin_notes || '')
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');

      return new Response(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="sahyak-leads-${new Date().toISOString().slice(0, 10)}.csv"`
        }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      contacts: result.contacts,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNext: result.hasNext,
        hasPrev: result.hasPrev
      },
      summary: result.summary,
      total: result.total
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      error: 'DATABASE_ERROR',
      message: 'Failed to retrieve lead records.'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  // Defense-in-depth authorization check
  const admin = (locals as any)?.admin;
  if (!admin || !admin.email) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized', message: 'Admin authentication required.' }), {
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
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid Content-Type. Expected application/json.'
      }), { status: 415, headers: { 'Content-Type': 'application/json' } });
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const { id, status, admin_notes } = body;

    const numericId = parseInt(id, 10);
    if (!id || isNaN(numericId) || numericId <= 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'A valid positive numeric Lead ID is required.'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!status && admin_notes === undefined) {
      return new Response(JSON.stringify({
        success: false,
        message: 'At least one field (status or admin_notes) must be provided to update.'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const validStatuses = ['new', 'contacted', 'qualified', 'closed', 'archived'];
    if (status && !validStatuses.includes(status)) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid status value. Permitted values: new, contacted, qualified, closed, archived.'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (admin_notes !== undefined && typeof admin_notes !== 'string' && admin_notes !== null) {
      return new Response(JSON.stringify({
        success: false,
        message: 'admin_notes must be a string or null.'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (typeof admin_notes === 'string' && admin_notes.length > 5000) {
      return new Response(JSON.stringify({
        success: false,
        message: 'admin_notes exceeds maximum permitted length of 5000 characters.'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const env = await getRuntimeEnv();
    const db = env.DB;
    const success = await updateContact(db, numericId, {
      status,
      admin_notes: admin_notes !== undefined ? (admin_notes ? admin_notes.trim() : null) : undefined
    });

    if (success) {
      const summary = await getLeadSummary(db);
      return new Response(JSON.stringify({
        success: true,
        message: `Lead #${numericId} updated successfully.`,
        summary
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: `Lead #${numericId} not found.`
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to update lead record.'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
