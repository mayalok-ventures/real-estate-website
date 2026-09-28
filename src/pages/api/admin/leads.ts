import type { APIRoute } from 'astro';
import { getContacts, updateContactStatus } from '../../../lib/db';
import { getRuntimeEnv } from '../../../lib/env';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
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

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { id, status, admin_notes } = body;

    if (!id || !status) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Lead ID and new status are required.'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const validStatuses = ['new', 'contacted', 'qualified', 'closed', 'archived'];
    if (!validStatuses.includes(status)) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid status value.'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const env = await getRuntimeEnv();
    const db = env.DB;
    const success = await updateContactStatus(db, Number(id), status, admin_notes);

    if (success) {
      return new Response(JSON.stringify({
        success: true,
        message: `Lead #${id} status updated to '${status}'.`
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } else {
      return new Response(JSON.stringify({
        success: false,
        message: `Lead #${id} not found.`
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to update lead record.'
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
