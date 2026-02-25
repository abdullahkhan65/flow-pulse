-- ─── Migration 003: GitHub after-hours/weekend aggregate fields ────────────
-- Supports githubLoadScore without overloading global after-hours signal.

ALTER TABLE daily_aggregates
  ADD COLUMN IF NOT EXISTS github_after_hours_events INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS github_weekend_events     INTEGER NOT NULL DEFAULT 0;
