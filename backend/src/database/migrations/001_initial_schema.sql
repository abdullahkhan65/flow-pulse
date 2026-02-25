-- ============================================================
-- FlowPulse — Initial Database Schema
-- Privacy-first team productivity analytics
-- Only metadata is stored. No message content. No PII beyond email.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Organizations (multi-tenant root) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) UNIQUE NOT NULL,
  plan          VARCHAR(50)  NOT NULL DEFAULT 'free',  -- 'free', 'pro', 'enterprise'
  billing_email VARCHAR(255),
  settings      JSONB        NOT NULL DEFAULT '{
    "workdayStart": "09:00",
    "workdayEnd": "18:00",
    "workdays": [1,2,3,4,5],
    "timezone": "UTC",
    "burnoutThreshold": 70,
    "slackAlerts": true,
    "weeklyDigestEnabled": true
  }',
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

-- ─── Users ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  name            VARCHAR(255),
  avatar_url      TEXT,
  role            VARCHAR(50) NOT NULL DEFAULT 'member',   -- 'owner', 'admin', 'manager', 'member'
  google_id       VARCHAR(255),
  slack_id        VARCHAR(255),
  jira_account_id VARCHAR(255),
  timezone        VARCHAR(100) NOT NULL DEFAULT 'UTC',
  -- Privacy: users can opt out of having their data collected
  data_collection_consent BOOLEAN NOT NULL DEFAULT true,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_slack_id ON users(slack_id) WHERE slack_id IS NOT NULL;

-- ─── Integrations ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integrations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            VARCHAR(50) NOT NULL,   -- 'google_calendar', 'slack', 'jira'
  status          VARCHAR(50) NOT NULL DEFAULT 'active',  -- 'active', 'inactive', 'error', 'revoked'
  -- Encrypted storage for tokens
  access_token    TEXT,
  refresh_token   TEXT,
  token_expires_at TIMESTAMPTZ,
  -- Integration-specific metadata (workspace_id, calendar_id, jira_site, etc.)
  metadata        JSONB       NOT NULL DEFAULT '{}',
  error_message   TEXT,
  last_synced_at  TIMESTAMPTZ,
  sync_cursor     TEXT,   -- Pagination cursor / next page token for resumable syncs
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_integrations_organization_id ON integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_type_status ON integrations(type, status);

-- ─── Raw Activity Logs — source of truth, metadata only ───────────────────────

CREATE TABLE IF NOT EXISTS raw_activity_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source          VARCHAR(50) NOT NULL,   -- 'google_calendar', 'slack', 'jira'
  event_type      VARCHAR(100) NOT NULL,  -- 'meeting', 'slack_message', 'jira_transition', etc.
  occurred_at     TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER,              -- for calendar events
  participants_count INTEGER,            -- for calendar meetings
  is_recurring    BOOLEAN     DEFAULT false,
  is_after_hours  BOOLEAN     NOT NULL DEFAULT false,
  is_weekend      BOOLEAN     NOT NULL DEFAULT false,
  -- Non-PII metadata only: NO message content, NO meeting titles
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partition by month for performance at scale
CREATE INDEX IF NOT EXISTS idx_raw_logs_user_occurred ON raw_activity_logs(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_logs_org_occurred  ON raw_activity_logs(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_logs_source        ON raw_activity_logs(source, occurred_at DESC);

-- ─── Daily Aggregates — pre-computed per user per day ─────────────────────────

CREATE TABLE IF NOT EXISTS daily_aggregates (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id               UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                  DATE    NOT NULL,
  -- Calendar metrics
  total_meeting_minutes INTEGER NOT NULL DEFAULT 0,
  meeting_count         INTEGER NOT NULL DEFAULT 0,
  back_to_back_meetings INTEGER NOT NULL DEFAULT 0,  -- meetings with <5 min gap
  solo_focus_minutes    INTEGER NOT NULL DEFAULT 0,  -- meeting-free blocks > 30 min
  -- Slack metrics
  slack_messages_sent   INTEGER NOT NULL DEFAULT 0,
  slack_active_minutes  INTEGER NOT NULL DEFAULT 0,
  slack_channels_active INTEGER NOT NULL DEFAULT 0,
  -- After-hours metrics
  after_hours_events    INTEGER NOT NULL DEFAULT 0,
  weekend_events        INTEGER NOT NULL DEFAULT 0,
  -- Jira metrics
  jira_transitions      INTEGER NOT NULL DEFAULT 0,
  jira_comments         INTEGER NOT NULL DEFAULT 0,
  -- Context switching
  context_switches      INTEGER NOT NULL DEFAULT 0,
  -- Email metrics
  emails_sent           INTEGER NOT NULL DEFAULT 0,
  emails_received       INTEGER NOT NULL DEFAULT 0,
  after_hours_emails    INTEGER NOT NULL DEFAULT 0,
  avg_email_response_min INTEGER,
  -- GitHub metrics
  github_commits        INTEGER NOT NULL DEFAULT 0,
  github_pr_reviews     INTEGER NOT NULL DEFAULT 0,
  github_prs_created    INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_agg_user_date ON daily_aggregates(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_agg_org_date  ON daily_aggregates(organization_id, date DESC);

-- ─── Weekly Scores — computed analytics per user per week ─────────────────────

CREATE TABLE IF NOT EXISTS weekly_scores (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id               UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start            DATE         NOT NULL,   -- Always a Monday
  -- Scores 0-100 (higher = worse load / more risk)
  meeting_load_score    DECIMAL(5,2) NOT NULL DEFAULT 0,
  context_switch_score  DECIMAL(5,2) NOT NULL DEFAULT 0,
  slack_interrupt_score DECIMAL(5,2) NOT NULL DEFAULT 0,
  focus_score           DECIMAL(5,2) NOT NULL DEFAULT 0,  -- higher = MORE focus (inverted)
  after_hours_score     DECIMAL(5,2) NOT NULL DEFAULT 0,
  burnout_risk_score    DECIMAL(5,2) NOT NULL DEFAULT 0,
  -- Full breakdown for explainability
  score_breakdown       JSONB        NOT NULL DEFAULT '{}',
  -- Week-over-week delta
  burnout_risk_delta    DECIMAL(5,2),   -- positive = worsening
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_scores_user_week ON weekly_scores(user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_scores_org_week  ON weekly_scores(organization_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_scores_burnout   ON weekly_scores(organization_id, burnout_risk_score DESC, week_start DESC);

-- ─── Team Weekly Scores — org-level aggregates (no individual ranking) ─────────

CREATE TABLE IF NOT EXISTS team_weekly_scores (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_start                DATE         NOT NULL,
  avg_meeting_load_score    DECIMAL(5,2) NOT NULL DEFAULT 0,
  avg_context_switch_score  DECIMAL(5,2) NOT NULL DEFAULT 0,
  avg_slack_interrupt_score DECIMAL(5,2) NOT NULL DEFAULT 0,
  avg_focus_score           DECIMAL(5,2) NOT NULL DEFAULT 0,
  avg_burnout_risk_score    DECIMAL(5,2) NOT NULL DEFAULT 0,
  members_at_risk           INTEGER      NOT NULL DEFAULT 0,   -- burnout_risk > threshold
  total_members             INTEGER      NOT NULL DEFAULT 0,
  -- AI-generated team-level insights (V2)
  insights                  JSONB        NOT NULL DEFAULT '[]',
  anomalies                 JSONB        NOT NULL DEFAULT '[]',
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_team_weekly_org_week ON team_weekly_scores(organization_id, week_start DESC);

-- ─── Audit Log — track all data access for privacy compliance ─────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  actor_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(100) NOT NULL,  -- 'data_export', 'data_delete', 'view_scores', etc.
  resource_type   VARCHAR(100),
  resource_id     UUID,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);

-- ─── Notification Preferences ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_preferences (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID    NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  weekly_digest_email   BOOLEAN NOT NULL DEFAULT true,
  burnout_alert_email   BOOLEAN NOT NULL DEFAULT true,
  slack_weekly_digest   BOOLEAN NOT NULL DEFAULT false,
  alert_threshold       INTEGER NOT NULL DEFAULT 70,  -- burnout risk score to alert at
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Helper: auto-update updated_at ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_integrations_updated_at ON integrations;
DROP TRIGGER IF EXISTS update_daily_aggregates_updated_at ON daily_aggregates;
DROP TRIGGER IF EXISTS update_weekly_scores_updated_at ON weekly_scores;
DROP TRIGGER IF EXISTS update_team_weekly_scores_updated_at ON team_weekly_scores;

CREATE TRIGGER update_organizations_updated_at   BEFORE UPDATE ON organizations   FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_users_updated_at           BEFORE UPDATE ON users           FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_integrations_updated_at    BEFORE UPDATE ON integrations    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_daily_aggregates_updated_at BEFORE UPDATE ON daily_aggregates FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_weekly_scores_updated_at   BEFORE UPDATE ON weekly_scores   FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_team_weekly_scores_updated_at BEFORE UPDATE ON team_weekly_scores FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
