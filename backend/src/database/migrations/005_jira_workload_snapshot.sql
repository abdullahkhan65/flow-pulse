-- Migration 005: Add Jira workload snapshot columns to daily_aggregates
-- These are populated from jira_ticket_state events (current assigned ticket counts)
-- NOT from changelog transitions — so they work even when tickets are created in-column.

ALTER TABLE daily_aggregates
  ADD COLUMN IF NOT EXISTS jira_todo_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jira_in_progress_count INT NOT NULL DEFAULT 0;
