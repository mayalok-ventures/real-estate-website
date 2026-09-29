import type { APIRoute } from 'astro';
import { getContacts, updateContactStatus } from '../../../lib/db';
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

  const env = await getRuntimeEnv();
  const db = env.DB;
  const contacts = await getContacts(db, {
    status,
    search,
    limit: format === 'csv' ? 1000 : 100
  });

  if (format === 'csv') {
    // Generate secure CSV export for authorized real estate admins
    const headers = ['ID', 'Date', 'Name', 'Email', 'Phone', 'Company', 'Inquiry Type', 'Status', 'Message'];
    const rows = contacts.map(c => [
      c.id,
      `"${c.created_at || ''}"`,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.company || '').replace(/"/g, '""')}"`,
      `"${c.inquiry_type}"`,
      `"${c.status}"`,
      `"${(c.message || '').replace(/"/g, '""')}"`
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
    total: contacts.length,
    contacts
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
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
    if (!id || isNaN(numericId) || numericId <= 0 || !status) {
      return new Response(JSON.stringify({
        success: false,
        message: 'A valid positive numeric Lead ID and new status are required.'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const validStatuses = ['new', 'contacted', 'qualified', 'closed', 'archived'];
    if (!validStatuses.includes(status)) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid status value. Permitted values: new, contacted, qualified, closed, archived.'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const env = await getRuntimeEnv();
    const db = env.DB;
    const success = await updateContactStatus(db, numericId, status, admin_notes);

    if (success) {
      return new Response(JSON.stringify({
        success: true,
        message: `Lead #${numericId} status updated to '${status}'.`
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
