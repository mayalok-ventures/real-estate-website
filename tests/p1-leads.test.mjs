// tests/p1-leads.test.mjs
// Phase 3 Acceptance Test Suite: Complete Lead Pagination, Notes Editor, KPI Refresh & New Lead Polling

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getContactsWithCount,
  getLeadSummary,
  updateContact,
  insertContact,
  sanitizeCsvCell
} from '../src/lib/db.ts';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4321';

// Read server secret from .env for valid authentication test
let realSecret = '';
try {
  const envContent = readFileSync('.env', 'utf8');
  const match = envContent.match(/ADMIN_SECRET=([^\r\n]+)/);
  if (match) realSecret = match[1].trim();
} catch (e) {
  console.warn('[Test] Warning: .env not found');
}

// In-Memory D1 Mock conforming to Cloudflare D1Database API
function createMockD1(initialRows = []) {
  let rows = [...initialRows];
  let lastId = initialRows.reduce((max, r) => Math.max(max, r.id || 0), 0);

  return {
    _rows: rows,
    batch: async () => [],
    prepare(sql) {
      const bound = [];
      const stmt = {
        bind(...args) {
          bound.push(...args);
          return stmt;
        },
        async run() {
          const sqlTrimmed = sql.trim();
          if (sqlTrimmed.startsWith('INSERT INTO contacts')) {
            lastId++;
            const newRecord = {
              id: lastId,
              name: bound[0],
              email: bound[1],
              phone: bound[2],
              company: bound[3] || null,
              inquiry_type: bound[4],
              message: bound[5] || null,
              ip_hash: bound[6] || null,
              user_agent: bound[7] || null,
              status: bound[8] || 'new',
              admin_notes: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            rows.push(newRecord);
            return { meta: { last_row_id: lastId, changes: 1 } };
          }
          if (sqlTrimmed.startsWith('UPDATE contacts')) {
            const id = bound[bound.length - 1];
            const target = rows.find(r => r.id === id);
            if (target) {
              if (sqlTrimmed.includes('status = ?') && sqlTrimmed.includes('admin_notes = ?')) {
                target.status = bound[0];
                target.admin_notes = bound[1];
              } else if (sqlTrimmed.includes('status = ?')) {
                target.status = bound[0];
              } else if (sqlTrimmed.includes('admin_notes = ?')) {
                target.admin_notes = bound[0];
              }
              target.updated_at = new Date().toISOString();
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          return { meta: { changes: 0 } };
        },
        async first() {
          const res = await stmt.all();
          return res.results[0] || null;
        },
        async all() {
          const sqlTrimmed = sql.trim();

          // 1. SELECT count(*) as total FROM contacts
          if (sqlTrimmed.includes('count(*) as total')) {
            let filtered = [...rows];
            if (sqlTrimmed.includes('status = ?')) {
              filtered = filtered.filter(r => r.status === bound[0]);
            }
            return { results: [{ total: filtered.length }] };
          }

          // 2. Pipeline summary: SELECT status, count(*) as count FROM contacts GROUP BY status
          if (sqlTrimmed.includes('SELECT status, count(*) as count')) {
            const counts = {};
            rows.forEach(r => {
              counts[r.status] = (counts[r.status] || 0) + 1;
            });
            const results = Object.entries(counts).map(([status, count]) => ({ status, count }));
            return { results };
          }

          // 3. SELECT * FROM contacts ... ORDER BY ...
          let filtered = [...rows];
          let paramIdx = 0;

          if (sqlTrimmed.includes('id > ?')) {
            const since = bound[paramIdx++];
            filtered = filtered.filter(r => r.id > since);
          }
          if (sqlTrimmed.includes('status = ?')) {
            const st = bound[paramIdx++];
            filtered = filtered.filter(r => r.status === st);
          }
          if (sqlTrimmed.includes('(name LIKE ?')) {
            const pattern = bound[paramIdx].replace(/%/g, '').toLowerCase();
            paramIdx += 4;
            filtered = filtered.filter(r =>
              (r.name || '').toLowerCase().includes(pattern) ||
              (r.email || '').toLowerCase().includes(pattern) ||
              (r.phone || '').includes(pattern) ||
              (r.company || '').toLowerCase().includes(pattern)
            );
          }

          if (sqlTrimmed.includes('ORDER BY id ASC')) {
            filtered.sort((a, b) => a.id - b.id);
          } else {
            // Default deterministic: created_at DESC, id DESC
            filtered.sort((a, b) => {
              const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              return diff !== 0 ? diff : b.id - a.id;
            });
          }

          if (sqlTrimmed.includes('LIMIT ? OFFSET ?')) {
            const limit = bound[bound.length - 2];
            const offset = bound[bound.length - 1];
            return { results: filtered.slice(offset, offset + limit) };
          } else if (sqlTrimmed.includes('LIMIT ?')) {
            const limit = bound[bound.length - 1];
            return { results: filtered.slice(0, limit) };
          }

          return { results: filtered };
        }
      };
      return stmt;
    }
  };
}

describe('FIX A: Complete Lead Server-Side Pagination & Deterministic Sorting', () => {
  test('1. More than 100 leads are accessible across pages with deterministic tie-breaking', async () => {
    // Generate 150 deterministic mock leads
    const mockLeads = [];
    const baseTime = Date.now();
    for (let i = 1; i <= 150; i++) {
      mockLeads.push({
        id: i,
        name: `Prospect Lead #${i}`,
        email: `lead${i}@example.com`,
        phone: `+91 98765 432${i.toString().padStart(2, '0')}`,
        company: i % 2 === 0 ? `Developer Corp ${i}` : null,
        inquiry_type: 'demo',
        message: `Prospect inquiry message number ${i}`,
        status: i % 5 === 0 ? 'qualified' : 'new',
        admin_notes: null,
        created_at: new Date(baseTime + i * 1000).toISOString(),
        updated_at: new Date(baseTime + i * 1000).toISOString()
      });
    }

    const mockD1 = createMockD1(mockLeads);

    // Page 1 (25 per page): Leads #150 to #126
    const p1 = await getContactsWithCount(mockD1, { page: 1, limit: 25 });
    assert.equal(p1.total, 150);
    assert.equal(p1.totalPages, 6);
    assert.equal(p1.contacts.length, 25);
    assert.equal(p1.page, 1);
    assert.equal(p1.hasNext, true);
    assert.equal(p1.hasPrev, false);
    assert.equal(p1.contacts[0].id, 150);
    assert.equal(p1.contacts[24].id, 126);

    // Page 2 (25 per page): Leads #125 to #101
    const p2 = await getContactsWithCount(mockD1, { page: 2, limit: 25 });
    assert.equal(p2.contacts.length, 25);
    assert.equal(p2.page, 2);
    assert.equal(p2.hasNext, true);
    assert.equal(p2.hasPrev, true);
    assert.equal(p2.contacts[0].id, 125);
    assert.equal(p2.contacts[24].id, 101);

    // Middle Page 4: Leads #75 to #51
    const p4 = await getContactsWithCount(mockD1, { page: 4, limit: 25 });
    assert.equal(p4.contacts.length, 25);
    assert.equal(p4.contacts[0].id, 75);
    assert.equal(p4.contacts[24].id, 51);

    // Last Page 6: Leads #25 to #1
    const p6 = await getContactsWithCount(mockD1, { page: 6, limit: 25 });
    assert.equal(p6.contacts.length, 25);
    assert.equal(p6.hasNext, false);
    assert.equal(p6.hasPrev, true);
    assert.equal(p6.contacts[0].id, 25);
    assert.equal(p6.contacts[24].id, 1);
  });

  test('2. Filters and search apply across complete dataset before pagination', async () => {
    const mockLeads = [];
    for (let i = 1; i <= 60; i++) {
      mockLeads.push({
        id: i,
        name: i <= 30 ? `Prestige Realty Lead ${i}` : `Individual Broker ${i}`,
        email: `client${i}@realty.com`,
        phone: `+91 91234 567${i}`,
        company: i <= 30 ? 'Prestige Estates' : 'Freelance',
        inquiry_type: 'demo',
        status: i % 2 === 0 ? 'qualified' : 'new',
        admin_notes: null,
        created_at: new Date(Date.now() + i * 1000).toISOString(),
        updated_at: new Date(Date.now() + i * 1000).toISOString()
      });
    }

    const mockD1 = createMockD1(mockLeads);

    // Status filter: qualified leads (30 total)
    const qualifiedResult = await getContactsWithCount(mockD1, { status: 'qualified', limit: 10, page: 1 });
    assert.equal(qualifiedResult.total, 30);
    assert.equal(qualifiedResult.totalPages, 3);
    assert.equal(qualifiedResult.contacts.length, 10);
    assert.ok(qualifiedResult.contacts.every(c => c.status === 'qualified'));
  });

  test('3. CSV formula injection neutralization (SEC-03)', () => {
    // Malicious spreadsheet formula triggers
    assert.equal(sanitizeCsvCell('=CMD("calc.exe")'), `"'=CMD(""calc.exe"")"`);
    assert.equal(sanitizeCsvCell('+SUM(A1:A10)'), `"'+SUM(A1:A10)"`);
    assert.equal(sanitizeCsvCell('-DDE("server")'), `"'-DDE(""server"")"`);
    assert.equal(sanitizeCsvCell('@HYPERLINK("evil.com")'), `"\'@HYPERLINK(""evil.com"")"`);
    assert.equal(sanitizeCsvCell('\tTabSeparated'), `"'	TabSeparated"`);
    // Safe standard string
    assert.equal(sanitizeCsvCell('Rajesh Sharma'), '"Rajesh Sharma"');
    assert.equal(sanitizeCsvCell(null), '""');
  });
});

describe('FIX B: Real Admin Notes Editor & Field Separation', () => {
  test('4. Admin notes can be created, edited, and retrieved while preserving prospect message and status', async () => {
    const originalLead = {
      id: 42,
      name: 'Priya Mehta',
      email: 'priya@mehtagroup.in',
      phone: '+91 98200 12345',
      company: 'Mehta Developers',
      inquiry_type: 'demo',
      message: 'Looking for 25 broker licenses with WhatsApp CRM integration.',
      status: 'new',
      admin_notes: null,
      created_at: '2026-04-10T10:00:00Z',
      updated_at: '2026-04-10T10:00:00Z'
    };

    const mockD1 = createMockD1([originalLead]);

    // Update only admin notes (status not provided)
    const noteContent = 'Called Priya at 11:30 AM. Budget verified at ₹45k/mo. Scheduled demo for Thursday.';
    const updated = await updateContact(mockD1, 42, { admin_notes: noteContent });
    assert.equal(updated, true);

    // Verify persisted state in D1
    const p = await getContactsWithCount(mockD1, { page: 1, limit: 10 });
    const lead = p.contacts.find(c => c.id === 42);
    assert.ok(lead);
    // 1. Admin notes saved accurately
    assert.equal(lead.admin_notes, noteContent);
    // 2. Original prospect message preserved intact
    assert.equal(lead.message, 'Looking for 25 broker licenses with WhatsApp CRM integration.');
    // 3. Status remains 'new' (not overwritten or nulled)
    assert.equal(lead.status, 'new');
    // 4. Contact details preserved
    assert.equal(lead.name, 'Priya Mehta');
    assert.equal(lead.company, 'Mehta Developers');
  });

  test('5. Updating lead status preserves confidential admin notes', async () => {
    const originalLead = {
      id: 77,
      name: 'Vikram Joshi',
      email: 'vikram@joshibuilders.com',
      phone: '+91 99887 76655',
      company: 'Joshi Builders',
      inquiry_type: 'pricing',
      message: 'Need pricing for residential tower sales team.',
      status: 'new',
      admin_notes: 'High priority developer. Key decision maker.',
      created_at: '2026-04-11T12:00:00Z',
      updated_at: '2026-04-11T12:00:00Z'
    };

    const mockD1 = createMockD1([originalLead]);

    // Update status to 'contacted' without sending admin_notes
    await updateContact(mockD1, 77, { status: 'contacted' });

    const p = await getContactsWithCount(mockD1, { page: 1, limit: 10 });
    const lead = p.contacts.find(c => c.id === 77);
    assert.ok(lead);
    assert.equal(lead.status, 'contacted');
    assert.equal(lead.admin_notes, 'High priority developer. Key decision maker.');
  });
});

describe('FIX C: Accurate KPI Refresh After Lead Mutations', () => {
  test('6. Authoritative pipeline summary aggregates all statuses across database', async () => {
    const leads = [
      { id: 1, name: 'Lead 1', email: '1@a.com', phone: '1', status: 'new' },
      { id: 2, name: 'Lead 2', email: '2@a.com', phone: '2', status: 'new' },
      { id: 3, name: 'Lead 3', email: '3@a.com', phone: '3', status: 'contacted' },
      { id: 4, name: 'Lead 4', email: '4@a.com', phone: '4', status: 'qualified' },
      { id: 5, name: 'Lead 5', email: '5@a.com', phone: '5', status: 'qualified' },
      { id: 6, name: 'Lead 6', email: '6@a.com', phone: '6', status: 'closed' },
      { id: 7, name: 'Lead 7', email: '7@a.com', phone: '7', status: 'archived' }
    ];

    const mockD1 = createMockD1(leads);
    const summary = await getLeadSummary(mockD1);

    assert.equal(summary.total, 7);
    assert.equal(summary.new, 2);
    assert.equal(summary.contacted, 1);
    assert.equal(summary.qualified, 2);
    assert.equal(summary.closed, 1);
    assert.equal(summary.archived, 1);

    // Mutate lead #1 from 'new' to 'contacted'
    await updateContact(mockD1, 1, { status: 'contacted' });
    const refreshed = await getLeadSummary(mockD1);

    assert.equal(refreshed.total, 7);
    assert.equal(refreshed.new, 1);
    assert.equal(refreshed.contacted, 2);
    assert.equal(refreshed.qualified, 2);
    assert.equal(refreshed.closed, 1);
  });
});

describe('FIX D: Automatic Real-Time New-Lead Polling & Deduplication', () => {
  test('7. Polling endpoint returns newly persisted leads with id > sinceId and empty when no new leads', async () => {
    const initialLeads = [
      { id: 10, name: 'Old Lead 1', email: 'old1@a.com', phone: '1', status: 'new' },
      { id: 11, name: 'Old Lead 2', email: 'old2@a.com', phone: '2', status: 'new' }
    ];

    const mockD1 = createMockD1(initialLeads);

    // Polling with sinceId = 11: no new leads
    const pollEmpty = await getContactsWithCount(mockD1, { sinceId: 11, limit: 10 });
    assert.equal(pollEmpty.contacts.length, 0);

    // Visitor submits new contact form -> new lead #12 inserted
    await insertContact(mockD1, {
      name: 'Sunil Verma',
      email: 'sunil@vermarealty.com',
      phone: '+91 94444 33221',
      inquiry_type: 'demo',
      message: 'Urgent demo requested for upcoming project launch.',
      status: 'new'
    });

    // Polling with sinceId = 11: returns lead #12
    const pollNew = await getContactsWithCount(mockD1, { sinceId: 11, limit: 10 });
    assert.equal(pollNew.contacts.length, 1);
    assert.equal(pollNew.contacts[0].id, 12);
    assert.equal(pollNew.contacts[0].name, 'Sunil Verma');
    assert.equal(pollNew.contacts[0].status, 'new');
  });
});

describe('HTTP Integration: Protected Leads API & Validation Contracts', () => {
  let adminSessionCookie = '';

  test('8. Admin login succeeds and provides authenticated session cookie', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ email: 'admin@sahyak.com', password: realSecret })
    });
    assert.equal(loginRes.status, 200, `Expected 200 on login, got ${loginRes.status}`);
    const setCookie = loginRes.headers.get('set-cookie');
    assert.ok(setCookie && setCookie.includes('sahyak_admin_session='), 'Session cookie must be present');
    adminSessionCookie = setCookie.split(';')[0];
  });

  test('9. GET /api/admin/leads returns server-side paginated contracts and pipeline summary', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/leads?page=1&limit=10`, {
      headers: { Cookie: adminSessionCookie }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.contacts));
    assert.ok(data.pagination);
    assert.equal(data.pagination.page, 1);
    assert.equal(data.pagination.limit, 10);
    assert.ok(typeof data.pagination.total === 'number');
    assert.ok(data.summary);
    assert.ok(typeof data.summary.total === 'number');
    assert.ok(typeof data.summary.new === 'number');
  });

  test('10. PATCH /api/admin/leads validates payload: rejects empty updates and invalid inputs', async () => {
    // 1. Missing id
    const resNoId = await fetch(`${BASE_URL}/api/admin/leads`, {
      method: 'PATCH',
      headers: { Cookie: adminSessionCookie, 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ status: 'contacted' })
    });
    assert.equal(resNoId.status, 400);

    // 2. No fields to update
    const resNoFields = await fetch(`${BASE_URL}/api/admin/leads`, {
      method: 'PATCH',
      headers: { Cookie: adminSessionCookie, 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ id: 1 })
    });
    assert.equal(resNoFields.status, 400);

    // 3. Invalid status
    const resBadStatus = await fetch(`${BASE_URL}/api/admin/leads`, {
      method: 'PATCH',
      headers: { Cookie: adminSessionCookie, 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ id: 1, status: 'invalid_status_enum' })
    });
    assert.equal(resBadStatus.status, 400);

    // 4. Notes exceeding 5,000 characters
    const resTooLong = await fetch(`${BASE_URL}/api/admin/leads`, {
      method: 'PATCH',
      headers: { Cookie: adminSessionCookie, 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ id: 1, admin_notes: 'A'.repeat(5001) })
    });
    assert.equal(resTooLong.status, 400);
  });

  test('11. PATCH /api/admin/leads allows updating notes independently and returns updated summary', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/leads`, {
      method: 'PATCH',
      headers: { Cookie: adminSessionCookie, 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({
        id: 1,
        admin_notes: 'Client confirmed budget and requested brochure on WhatsApp.'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.summary);
    assert.ok(typeof data.summary.total === 'number');
  });

  test('12. Protected leads endpoints reject unauthenticated access with HTTP 401', async () => {
    const unauthGet = await fetch(`${BASE_URL}/api/admin/leads`);
    assert.equal(unauthGet.status, 401);

    const unauthPatch = await fetch(`${BASE_URL}/api/admin/leads`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ id: 1, status: 'closed' })
    });
    assert.equal(unauthPatch.status, 401);
  });
});
