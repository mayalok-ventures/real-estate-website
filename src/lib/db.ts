import type { ContactSubmission, ResourceItem, D1Database } from '../types/db';

let tablesInitialized = false;

export async function ensureTables(db: D1Database | undefined): Promise<void> {
  if (!db || tablesInitialized) return;

  try {
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT NOT NULL,
          company TEXT,
          inquiry_type TEXT NOT NULL,
          message TEXT,
          ip_hash TEXT,
          user_agent TEXT,
          status TEXT DEFAULT 'new',
          admin_notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          count INTEGER DEFAULT 1,
          reset_at INTEGER NOT NULL
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS resources (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          category TEXT NOT NULL,
          type TEXT NOT NULL,
          summary TEXT NOT NULL,
          read_time TEXT NOT NULL,
          featured INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS admin_sessions (
          session_id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          role TEXT DEFAULT 'admin',
          expires_at INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS analytics_sessions (
          session_id TEXT PRIMARY KEY,
          visitor_id TEXT NOT NULL,
          ip_hash TEXT,
          country TEXT,
          country_code TEXT,
          city TEXT,
          region TEXT,
          page TEXT NOT NULL,
          page_title TEXT,
          referrer TEXT,
          traffic_source TEXT,
          referrer_domain TEXT,
          device TEXT,
          browser TEXT,
          duration_seconds INTEGER DEFAULT 0,
          active_section TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at)`)
    ]);

    // Check if resources have initial seeds
    const countCheck = await db.prepare(`SELECT count(*) as count FROM resources`).first<{ count: number }>();
    if (countCheck && countCheck.count === 0) {
      await db.batch([
        db.prepare(`INSERT INTO resources (id, title, slug, category, type, summary, read_time, featured) VALUES (1, 'Mastering Real Estate Follow-ups: The 5-Minute Rule', 'mastering-real-estate-follow-ups', 'Lead Management', 'guide', 'Why responding to property inquiries within 5 minutes increases site visit conversion by 391%.', '6 min read', 1)`),
        db.prepare(`INSERT INTO resources (id, title, slug, category, type, summary, read_time, featured) VALUES (2, 'Site Visit Scheduling Playbook for High-Value Properties', 'site-visit-scheduling-playbook', 'Field Operations', 'guide', 'How top agents organize weekend property tours without double bookings or lost leads.', '8 min read', 1)`),
        db.prepare(`INSERT INTO resources (id, title, slug, category, type, summary, read_time, featured) VALUES (3, 'WhatsApp Business API vs Sahyak Mobile CRM', 'whatsapp-business-crm-comparison', 'Automation', 'guide', 'A detailed comparison of managing client conversations via native WhatsApp vs a dedicated CRM.', '5 min read', 0)`),
        db.prepare(`INSERT INTO resources (id, title, slug, category, type, summary, read_time, featured) VALUES (4, 'Inventory Tracking Without Excel Chaos', 'inventory-tracking-without-excel', 'Inventory Management', 'guide', 'Eliminate mismatched unit availability, stale price sheets, and accidental double selling.', '7 min read', 0)`),
        db.prepare(`INSERT INTO resources (id, title, slug, category, type, summary, read_time, featured) VALUES (5, 'Video Tour: Onboarding Your Sales Team in Under 15 Minutes', 'onboarding-sales-team-video', 'Tutorials', 'video', 'Walkthrough of how brokers and developers set up user permissions and import lead databases.', '12 min video', 1)`)
      ]);
    }

    tablesInitialized = true;
  } catch (err) {
    console.error('Failed to initialize D1 schema:', err);
  }
}

// In-memory store for fallback if D1 is unavailable (starts completely empty, real submissions only)
const memoryContacts: ContactSubmission[] = [];

const memoryResources: ResourceItem[] = [
  {
    id: 1,
    title: 'Mastering Real Estate Follow-ups: The 5-Minute Rule',
    slug: 'mastering-real-estate-follow-ups',
    category: 'Lead Management',
    type: 'guide',
    summary: 'Why responding to property inquiries within 5 minutes increases site visit conversion by 391%.',
    read_time: '6 min read',
    featured: 1,
  },
  {
    id: 2,
    title: 'Site Visit Scheduling Playbook for High-Value Properties',
    slug: 'site-visit-scheduling-playbook',
    category: 'Field Operations',
    type: 'guide',
    summary: 'How top agents organize weekend property tours without double bookings or lost leads.',
    read_time: '8 min read',
    featured: 1,
  },
  {
    id: 3,
    title: 'WhatsApp Business API vs Sahyak Mobile CRM',
    slug: 'whatsapp-business-crm-comparison',
    category: 'Automation',
    type: 'guide',
    summary: 'A detailed comparison of managing client conversations via native WhatsApp vs a dedicated CRM.',
    read_time: '5 min read',
    featured: 0,
  },
  {
    id: 4,
    title: 'Inventory Tracking Without Excel Chaos',
    slug: 'inventory-tracking-without-excel',
    category: 'Inventory Management',
    type: 'guide',
    summary: 'Eliminate mismatched unit availability, stale price sheets, and accidental double selling.',
    read_time: '7 min read',
    featured: 0,
  },
  {
    id: 5,
    title: 'Video Tour: Onboarding Your Sales Team in Under 15 Minutes',
    slug: 'onboarding-sales-team-video',
    category: 'Tutorials',
    type: 'video',
    summary: 'Walkthrough of how brokers and developers set up user permissions and import lead databases.',
    read_time: '12 min video',
    featured: 1,
  }
];

export interface ContactFilterOptions {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  sinceId?: number;
  forExport?: boolean;
}

export interface LeadSummary {
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  closed: number;
  archived: number;
}

export interface PaginatedContactsResult {
  contacts: ContactSubmission[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  summary: LeadSummary;
}

export { sanitizeCsvCell } from './csv.ts';

export async function insertContact(db: D1Database | undefined, contact: ContactSubmission): Promise<number> {
  if (db) {
    await ensureTables(db);
    const result = await db.prepare(
      `INSERT INTO contacts (name, email, phone, company, inquiry_type, message, ip_hash, user_agent, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      contact.name,
      contact.email,
      contact.phone,
      contact.company || null,
      contact.inquiry_type,
      contact.message || null,
      contact.ip_hash || null,
      contact.user_agent || null,
      contact.status || 'new'
    ).run();

    return result.meta?.last_row_id || 1;
  }

  // Safe fallback for local development or test mocks
  const newId = memoryContacts.length + 1;
  const newContact: ContactSubmission = {
    ...contact,
    id: newId,
    status: contact.status || 'new',
    created_at: new Date().toISOString()
  };
  memoryContacts.unshift(newContact);
  return newId;
}

export async function getLeadSummary(db: D1Database | undefined): Promise<LeadSummary> {
  const summary: LeadSummary = { total: 0, new: 0, contacted: 0, qualified: 0, closed: 0, archived: 0 };
  if (db) {
    await ensureTables(db);
    try {
      const rows = await db.prepare(`SELECT status, count(*) as count FROM contacts GROUP BY status`).all<{ status: string; count: number }>();
      if (rows.results) {
        for (const r of rows.results) {
          const c = Number(r.count) || 0;
          summary.total += c;
          if (r.status === 'new') summary.new = c;
          else if (r.status === 'contacted') summary.contacted = c;
          else if (r.status === 'qualified') summary.qualified = c;
          else if (r.status === 'closed') summary.closed = c;
          else if (r.status === 'archived') summary.archived = c;
        }
      }
    } catch (e) {
      console.error('[DB] Failed to fetch lead summary:', e);
    }
    return summary;
  }

  // Memory fallback for mock/local test runs
  for (const c of memoryContacts) {
    summary.total++;
    const s = c.status || 'new';
    if (s === 'new') summary.new++;
    else if (s === 'contacted') summary.contacted++;
    else if (s === 'qualified') summary.qualified++;
    else if (s === 'closed') summary.closed++;
    else if (s === 'archived') summary.archived++;
  }
  return summary;
}

export async function getContactsWithCount(
  db: D1Database | undefined,
  options?: ContactFilterOptions
): Promise<PaginatedContactsResult> {
  const page = Math.max(1, parseInt(String(options?.page || 1), 10) || 1);
  const requestedLimit = parseInt(String(options?.limit || 25), 10) || 25;
  const limit = Math.max(1, Math.min(100, requestedLimit));
  const offset = (page - 1) * limit;
  const sinceId = options?.sinceId ? Math.max(0, parseInt(String(options.sinceId), 10) || 0) : 0;
  const forExport = Boolean(options?.forExport);

  if (db) {
    await ensureTables(db);

    const conditions: string[] = [];
    const params: any[] = [];

    if (sinceId > 0) {
      conditions.push('id > ?');
      params.push(sinceId);
    }
    if (options?.status && options.status !== 'all') {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options?.search) {
      const term = `%${options.search.trim()}%`;
      conditions.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR company LIKE ?)');
      params.push(term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? ` WHERE ` + conditions.join(' AND ') : '';

    // 1. Fetch matching total count
    const countQuery = `SELECT count(*) as total FROM contacts` + whereClause;
    const countRes = await db.prepare(countQuery).bind(...params).first<{ total: number }>();
    const total = Number(countRes?.total) || 0;

    // 2. Fetch contacts with deterministic ordering (tie-breaker on id DESC)
    let dataQuery = `SELECT * FROM contacts` + whereClause;
    const dataParams = [...params];

    if (sinceId > 0) {
      dataQuery += ` ORDER BY id ASC LIMIT ?`;
      dataParams.push(limit);
    } else if (forExport) {
      dataQuery += ` ORDER BY created_at DESC, id DESC LIMIT 10000`;
    } else {
      dataQuery += ` ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
      dataParams.push(limit, offset);
    }

    const result = await db.prepare(dataQuery).bind(...dataParams).all<ContactSubmission>();
    const contacts = result.results || [];

    // 3. Fetch authoritative pipeline summary
    const summary = await getLeadSummary(db);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      contacts,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      summary
    };
  }

  // Memory fallback for mock/local test runs
  let list = [...memoryContacts];
  if (sinceId > 0) {
    list = list.filter(c => (c.id || 0) > sinceId);
  }
  if (options?.status && options.status !== 'all') {
    list = list.filter(c => c.status === options.status);
  }
  if (options?.search) {
    const s = options.search.toLowerCase().trim();
    list = list.filter(c =>
      (c.name || '').toLowerCase().includes(s) ||
      (c.email || '').toLowerCase().includes(s) ||
      (c.phone || '').includes(s) ||
      (c.company || '').toLowerCase().includes(s)
    );
  }

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const contacts = forExport ? list : list.slice(offset, offset + limit);
  const summary = await getLeadSummary(undefined);

  return {
    contacts,
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    summary
  };
}

export async function getContacts(
  db: D1Database | undefined,
  filter?: { status?: string; search?: string; limit?: number; offset?: number }
): Promise<ContactSubmission[]> {
  const limit = filter?.limit || 50;
  const offset = filter?.offset || 0;
  const page = Math.floor(offset / limit) + 1;

  const result = await getContactsWithCount(db, {
    status: filter?.status,
    search: filter?.search,
    page,
    limit
  });
  return result.contacts;
}

export async function updateContact(
  db: D1Database | undefined,
  id: number,
  updates: { status?: string; admin_notes?: string | null }
): Promise<boolean> {
  if (db) {
    await ensureTables(db);
    const sets: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (updates.status !== undefined) {
      sets.push('status = ?');
      params.push(updates.status);
    }
    if (updates.admin_notes !== undefined) {
      sets.push('admin_notes = ?');
      params.push(updates.admin_notes);
    }

    if (sets.length === 1) {
      return true; // No updates requested
    }

    params.push(id);
    const query = `UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`;
    await db.prepare(query).bind(...params).run();
    return true;
  }

  const found = memoryContacts.find(c => c.id === id);
  if (found) {
    if (updates.status !== undefined) found.status = updates.status as any;
    if (updates.admin_notes !== undefined) found.admin_notes = updates.admin_notes;
    found.updated_at = new Date().toISOString();
    return true;
  }
  return true;
}

export async function updateContactStatus(
  db: D1Database | undefined,
  id: number,
  status: string,
  adminNotes?: string
): Promise<boolean> {
  return updateContact(db, id, { status, admin_notes: adminNotes });
}

export async function getResources(db: D1Database | undefined): Promise<ResourceItem[]> {
  if (db) {
    try {
      await ensureTables(db);
      const result = await db.prepare(`SELECT * FROM resources ORDER BY featured DESC, id ASC`).all<ResourceItem>();
      if (result.results && result.results.length > 0) {
        return result.results;
      }
    } catch {
      // If table not yet initialized, fall through to memory
    }
  }
  return memoryResources;
}

export async function checkRateLimit(db: D1Database | undefined, key: string, maxAttempts = 5, windowMs = 600000): Promise<{ allowed: boolean; remaining: number }> {
  const now = Date.now();
  if (db) {
    try {
      await ensureTables(db);
      const record = await db.prepare(`SELECT count, reset_at FROM rate_limits WHERE key = ?`).bind(key).first<{ count: number; reset_at: number }>();
      if (!record || record.reset_at < now) {
        const resetAt = now + windowMs;
        await db.prepare(`INSERT OR REPLACE INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)`).bind(key, resetAt).run();
        return { allowed: true, remaining: maxAttempts - 1 };
      }

      if (record.count >= maxAttempts) {
        return { allowed: false, remaining: 0 };
      }

      await db.prepare(`UPDATE rate_limits SET count = count + 1 WHERE key = ?`).bind(key).run();
      return { allowed: true, remaining: maxAttempts - (record.count + 1) };
    } catch {
      return { allowed: true, remaining: maxAttempts };
    }
  }

  return { allowed: true, remaining: maxAttempts };
}
