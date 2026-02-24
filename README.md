# FlowPulse

**Privacy-first team productivity analytics for engineering teams.**

FlowPulse detects burnout risk, meeting overload, and focus deprivation early — by analyzing metadata from Google Calendar, Slack, and Jira. No message content. No meeting titles. No surveillance.

---

## What It Does

Engineering teams burn out silently. FlowPulse surfaces the patterns before they become problems:

- **Burnout risk scoring** — a composite weekly score per team member
- **Meeting load analysis** — total minutes, back-to-back density, frequency
- **Focus time tracking** — uninterrupted blocks ≥90 min available for deep work
- **Context switching detection** — rapid transitions between meetings, Slack, Jira
- **After-hours activity** — late-night and weekend work patterns
- **Slack interrupt scoring** — message volume, channel spread, weekend activity

Managers get a team dashboard with trend charts and anomaly alerts. Individual contributors see only their own scores.

---

## Privacy by Architecture

FlowPulse never stores:
- Message content
- Meeting titles or descriptions
- Attendee names
- Ticket titles or descriptions

It only stores metadata: timestamps, durations, participant counts, event types. All OAuth tokens are encrypted with AES-256-GCM before being written to the database.

Users can opt out of data collection, export their data as JSON, or request full deletion at any time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | NestJS (Node.js) |
| Frontend | Next.js 14, React 18 |
| Database | PostgreSQL (Supabase-compatible) |
| Charts | Recharts |
| Auth | Google OAuth → JWT |
| Integrations | Google Calendar, Slack, Jira |
| Deployment | Railway (backend) + Vercel (frontend) |
| Encryption | AES-256-GCM (token storage) |

---

## Project Structure

```
flow-pulse/
├── backend/                  # NestJS API
│   └── src/
│       ├── modules/
│       │   ├── analytics/    # 5 scoring engines + burnout composite
│       │   ├── auth/         # Google OAuth + JWT
│       │   ├── dashboard/    # API endpoints for all dashboard views
│       │   ├── integrations/ # Google Calendar, Slack, Jira connectors
│       │   ├── jobs/         # Cron-based sync + aggregation
│       │   ├── notifications/# Email + Slack digests
│       │   ├── organizations/# Multi-tenant root
│       │   └── users/        # Profiles, consent, data export/delete
│       └── database/
│           └── migrations/   # PostgreSQL schema
│
├── frontend/                 # Next.js app
│   └── src/
│       ├── app/
│       │   ├── dashboard/    # Team overview, my scores, members, settings
│       │   ├── login/        # OAuth flow
│       │   └── onboarding/   # New user setup
│       └── lib/
│           └── api.ts        # API client + TypeScript types
│
└── docker-compose.yml        # Local PostgreSQL
```

---

## Analytics Engines

All scores are 0–100. Higher = worse, **except** focus score (higher = more focus = better).

### Component Scores

| Engine | What It Measures | High Score Means |
|---|---|---|
| Meeting Load | Total minutes, back-to-back density, count | Overloaded with meetings |
| Focus Time | Uninterrupted blocks ≥90 min | Low — insufficient deep work |
| Context Switching | Rapid transitions between tools | Fragmented attention |
| Slack Interrupts | Message volume, channel spread, weekend activity | Constant interruption |
| After-Hours Activity | Events outside 9am–6pm, weekend work | Boundary violations |

### Burnout Risk Score (Composite)

```
Burnout Risk = (after_hours × 30%)
             + (meeting_load × 25%)
             + (focus_deprivation × 20%)   ← 100 - focus_score
             + (context_switch × 15%)
             + (slack_interrupts × 10%)
```

| Score | Risk Level |
|---|---|
| < 50 | Low |
| 50–69 | Moderate |
| 70–84 | High |
| 85+ | Critical |

Explainable risk flags are generated alongside each score (e.g., "Frequent activity outside work hours", "Heavy meeting load").

---

## Data Pipeline

```
Integrations (Calendar, Slack, Jira)
    ↓  every 4h on weekdays
Raw Activity Logs (metadata only)
    ↓  nightly at 1am
Daily Aggregates (per user/day)
    ↓  weekly (Monday)
Weekly Scores (5 engines + composite)
    ↓
Team Weekly Scores (org-level rollup + anomalies)
```

New users get partial scores from day 1, with a confidence badge (low / medium / high) based on how many days of data have been collected.

---

## API Endpoints

All endpoints are prefixed `/api/v1` and require `Authorization: Bearer <jwt>` except auth routes.

### Auth
```
GET /auth/google              Initiate Google OAuth
GET /auth/me                  Get current user
```

### Dashboard
```
GET  /dashboard/me/scores     My weekly scores (8 weeks)
GET  /dashboard/preview       Current week in-progress + today snapshot
GET  /dashboard/team          Team overview (managers+)
GET  /dashboard/team/members  All member scores (managers+)
GET  /dashboard/integrations  My integration status
POST /dashboard/sync-now      Trigger immediate sync
```

### Integrations
```
GET /integrations/slack/connect   Get Slack OAuth URL
GET /integrations/jira/connect    Get Jira OAuth URL
```

### Users
```
PATCH  /users/me/consent    Opt in/out of data collection
GET    /users/me/data       Export personal data as JSON
DELETE /users/me/data       Delete all personal data
```

### Organizations
```
GET   /organizations/me              Get current org
PATCH /organizations/me/settings     Update settings (admins)
GET   /organizations/me/members      List members (managers+)
POST  /organizations/me/members/invite   Invite member
```

---

## Dashboard Pages

| Route | Who Can See | What It Shows |
|---|---|---|
| `/dashboard` | All | Team scores, trend chart, anomalies, integration status |
| `/dashboard/my-scores` | All | Personal weekly scores, daily breakdown, today snapshot |
| `/dashboard/members` | Managers+ | All team members with latest risk scores |
| `/dashboard/settings` | All | Connect integrations, privacy controls, data export |

---

## Getting Started

### Prerequisites

- Node.js ≥20
- PostgreSQL (or Docker)
- Google OAuth app (Cloud Console)
- Slack app (optional)
- Jira OAuth app (optional)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/flow-pulse.git
cd flow-pulse
npm install
```

### 2. Start the Database

```bash
docker-compose up -d
```

### 3. Configure Environment

**Backend** — copy `backend/.env.example` to `backend/.env` and fill in:

```bash
DATABASE_URL=postgresql://flowpulse:flowpulse_dev@localhost:5432/flowpulse
JWT_SECRET=your-secret-key
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ENCRYPTION_KEY=32-character-random-string
```

**Frontend** — copy `frontend/.env.example` to `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

### 4. Run Migrations

```bash
npm run db:migrate
```

### 5. Start Dev Servers

```bash
npm run dev
```

- Backend: [http://localhost:3001](http://localhost:3001)
- Frontend: [http://localhost:3000](http://localhost:3000)
- Swagger docs: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)

---

## Background Jobs

| Job | Schedule | What It Does |
|---|---|---|
| Integration Sync | Every 4h, Mon–Fri 8am–8pm | Syncs Calendar, Slack, Jira for all active users |
| Daily Aggregation | 1am daily | Computes per-user daily metrics from raw logs |
| Weekly Scores | Monday (after aggregation) | Runs all scoring engines, computes burnout risk |
| Email Digests | Configurable | Sends weekly reports to managers |
| Burnout Alerts | On score compute | Alerts managers when a member hits risk threshold |

---

## Database Schema (Key Tables)

```
organizations      — root multi-tenant entity
users              — team members, scoped by org
integrations       — encrypted OAuth tokens
raw_activity_logs  — partitioned metadata events (no content)
daily_aggregates   — pre-computed daily metrics per user
weekly_scores      — 5 component scores + burnout risk per user/week
team_weekly_scores — org-level rollup with anomalies
notification_preferences — email/Slack digest settings
audit_logs         — compliance tracking
```

---

## Deployment

### Backend (Railway)

Set all environment variables from `backend/.env.example`. The app reads `DATABASE_URL` directly.

```bash
npm run build:backend
# Railway auto-deploys from main branch
```

### Frontend (Vercel)

Set `NEXT_PUBLIC_API_URL` to your Railway backend URL.

```bash
npm run build:frontend
# Vercel auto-deploys from main branch
```

---

## GDPR / Privacy Controls

- Users can opt out of data collection at any time (`PATCH /users/me/consent`)
- Users can export all their data as JSON (`GET /users/me/data`)
- Users can request full deletion (`DELETE /users/me/data`)
- Managers can see team-level scores but not other teams
- All data access is logged in `audit_logs`
- No third-party analytics or tracking in the frontend

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Open a pull request

---

## License

MIT
