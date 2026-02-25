-- Migration: add email and github metric columns to daily_aggregates
-- These were referenced in analytics.service.ts but missing from the initial schema,
-- causing buildDailyAggregates() to fail and no meeting/calendar data to appear.

ALTER TABLE daily_aggregates
  ADD COLUMN IF NOT EXISTS emails_sent            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_received        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS after_hours_emails     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_email_response_min INTEGER,
  ADD COLUMN IF NOT EXISTS github_commits         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS github_pr_reviews      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS github_prs_created     INTEGER NOT NULL DEFAULT 0;
