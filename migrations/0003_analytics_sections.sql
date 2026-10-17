-- Migration: 0003_analytics_sections.sql
-- Add sections_json column for durable section-level engagement and dwell time observations

ALTER TABLE analytics_sessions ADD COLUMN sections_json TEXT;
