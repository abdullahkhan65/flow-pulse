-- ============================================================
-- FlowPulse — Migration 004: Enhanced Jira metrics
-- Adds granular Jira columns to daily_aggregates for the
-- Jira load engine (after-hours transitions, weekend work,
-- and completed tickets velocity).
-- ============================================================

ALTER TABLE daily_aggregates
  ADD COLUMN IF NOT EXISTS jira_issues_completed       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jira_after_hours_transitions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jira_weekend_transitions    INTEGER NOT NULL DEFAULT 0;
