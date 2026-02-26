-- Migration 007: add local password auth support + seed default admin user

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Seed default platform admin org + user for credentials login
INSERT INTO organizations (name, slug, plan)
VALUES ('FlowPulse Admin', 'flowpulse-admin', 'enterprise')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (
  organization_id,
  email,
  name,
  role,
  password_hash,
  timezone,
  is_active,
  data_collection_consent
)
SELECT
  o.id,
  'Admin@flowpulse.com',
  'FlowPulse Admin',
  'admin',
  '$2a$10$YNHskeceJ83KhVszu5fzhONSGD7kIBlN3/fjX70nJRCEH1AVHE.PS',
  'UTC',
  true,
  true
FROM organizations o
WHERE o.slug = 'flowpulse-admin'
  AND NOT EXISTS (
    SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER('Admin@flowpulse.com')
  );
