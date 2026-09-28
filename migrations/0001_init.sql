-- Migration: 0001_init.sql
-- Cloudflare D1 Schema for Sahayak CRM Website

-- 1. Contacts / Lead Inquiries
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
    status TEXT DEFAULT 'new', -- 'new', 'contacted', 'qualified', 'closed', 'archived'
    admin_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

-- 2. Rate Limits (Spam prevention)
CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER DEFAULT 1,
    reset_at INTEGER NOT NULL
);

-- 3. Content Resources Metadata (Admin managed)
CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL, -- 'guide', 'video', 'checklist', 'template'
    summary TEXT NOT NULL,
    read_time TEXT NOT NULL,
    featured INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial resources
INSERT OR IGNORE INTO resources (id, title, slug, category, type, summary, read_time, featured) VALUES
(1, 'Mastering Real Estate Follow-ups: The 5-Minute Rule', 'mastering-real-estate-follow-ups', 'Lead Management', 'guide', 'Why responding to property inquiries within 5 minutes increases site visit conversion by 391%.', '6 min read', 1),
(2, 'Site Visit Scheduling Playbook for High-Value Properties', 'site-visit-scheduling-playbook', 'Field Operations', 'guide', 'How top agents organize weekend property tours without double bookings or lost leads.', '8 min read', 1),
(3, 'WhatsApp Business API vs Sahayak Mobile CRM', 'whatsapp-business-crm-comparison', 'Automation', 'guide', 'A detailed comparison of managing client conversations via native WhatsApp vs a dedicated CRM.', '5 min read', 0),
(4, 'Inventory Tracking Without Excel Chaos', 'inventory-tracking-without-excel', 'Inventory Management', 'guide', 'Eliminate mismatched unit availability, stale price sheets, and accidental double selling.', '7 min read', 0),
(5, 'Video Tour: Onboarding Your Sales Team in Under 15 Minutes', 'onboarding-sales-team-video', 'Tutorials', 'video', 'Walkthrough of how brokers and developers set up user permissions and import lead databases.', '12 min video', 1);

-- 4. Admin Sessions & Role-based authentication
CREATE TABLE IF NOT EXISTS admin_sessions (
    session_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'admin', -- 'superadmin', 'admin', 'viewer'
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
