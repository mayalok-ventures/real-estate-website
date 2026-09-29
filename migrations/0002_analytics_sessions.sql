-- Migration: 0002_analytics_sessions.sql
-- Cloudflare D1 Schema for Durable Analytics Sessions and Indexes

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
);

CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_visitor_id ON analytics_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_analytics_page ON analytics_sessions(page);
CREATE INDEX IF NOT EXISTS idx_analytics_traffic_source ON analytics_sessions(traffic_source);
CREATE INDEX IF NOT EXISTS idx_analytics_last_active ON analytics_sessions(last_active_at);
