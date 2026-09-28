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
      `)
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

  // Fallback in-memory
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

export async function getContacts(
  db: D1Database | undefined,
  filter?: { status?: string; search?: string; limit?: number; offset?: number }
): Promise<ContactSubmission[]> {
  const limit = filter?.limit || 50;
  const offset = filter?.offset || 0;

  if (db) {
    await ensureTables(db);
    let query = `SELECT * FROM contacts`;
    const params: any[] = [];
    const conditions: string[] = [];

    if (filter?.status && filter.status !== 'all') {
      conditions.push(`status = ?`);
      params.push(filter.status);
    }
    if (filter?.search) {
      conditions.push(`(name LIKE ? OR email LIKE ? OR phone LIKE ? OR company LIKE ?)`);
      const searchPattern = `%${filter.search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const result = await db.prepare(query).bind(...params).all<ContactSubmission>();
    return result.results || [];
  }

  // Memory fallback
  let list = [...memoryContacts];
  if (filter?.status && filter.status !== 'all') {
    list = list.filter(c => c.status === filter.status);
  }
  if (filter?.search) {
    const s = filter.search.toLowerCase();
    list = list.filter(c =>
      c.name.toLowerCase().includes(s) ||
      c.email.toLowerCase().includes(s) ||
      c.phone.includes(s) ||
      (c.company && c.company.toLowerCase().includes(s))
    );
  }
  return list.slice(offset, offset + limit);
}

export async function updateContactStatus(
  db: D1Database | undefined,
  id: number,
  status: string,
  adminNotes?: string
): Promise<boolean> {
  if (db) {
    await ensureTables(db);
    await db.prepare(
      `UPDATE contacts SET status = ?, admin_notes = COALESCE(?, admin_notes), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(status, adminNotes || null, id).run();
    return true;
  }

  const found = memoryContacts.find(c => c.id === id);
  if (found) {
    found.status = status as any;
    if (adminNotes) found.admin_notes = adminNotes;
    found.updated_at = new Date().toISOString();
    return true;
  }
  return false;
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
