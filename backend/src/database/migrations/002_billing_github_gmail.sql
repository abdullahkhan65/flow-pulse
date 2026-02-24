-- ─── Migration 002: Billing, GitHub, Gmail ──────────────────────────────────
-- Adds trial/billing columns, billing_subscriptions table,
-- and new daily_aggregate columns for email + GitHub signals.

-- Organizations: trial management + Stripe customer
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seat_limit INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

-- Back-fill trial for any existing orgs (30-day trial from account creation)
UPDATE organizations
SET trial_ends_at = created_at + INTERVAL '30 days'
WHERE trial_ends_at IS NULL;

-- Billing subscriptions (one per org)
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id  VARCHAR(255) UNIQUE,
  stripe_price_id         VARCHAR(255),
  status                  VARCHAR(50) NOT NULL DEFAULT 'trialing',
    -- trialing | active | past_due | canceled | incomplete
  seats                   INTEGER NOT NULL DEFAULT 4,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id)
);

-- Back-fill trialing subscription for existing orgs
INSERT INTO billing_subscriptions (organization_id, status, seats, current_period_end)
SELECT id, 'trialing', 4, created_at + INTERVAL '30 days'
FROM organizations
WHERE id NOT IN (SELECT organization_id FROM billing_subscriptions)
ON CONFLICT (organization_id) DO NOTHING;

-- Daily aggregates: email metadata signals
ALTER TABLE daily_aggregates
  ADD COLUMN IF NOT EXISTS emails_sent            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_received        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS after_hours_emails     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_email_response_min INTEGER;

-- Daily aggregates: GitHub activity signals
ALTER TABLE daily_aggregates
  ADD COLUMN IF NOT EXISTS github_commits         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS github_pr_reviews      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS github_prs_created     INTEGER NOT NULL DEFAULT 0;

-- Index for billing lookups
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_org
  ON billing_subscriptions(organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_stripe
  ON billing_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
