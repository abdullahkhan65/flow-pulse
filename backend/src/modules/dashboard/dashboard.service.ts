import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../../database/database.module';
import { format, subWeeks, startOfWeek, subDays } from 'date-fns';
import { GoogleCalendarService } from '../integrations/google-calendar/google-calendar.service';
import { SlackService } from '../integrations/slack/slack.service';
import { JiraService } from '../integrations/jira/jira.service';
import { AnalyticsService, PartialScoreResult } from '../analytics/analytics.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @Inject(DATABASE_POOL) private db: Pool,
    private googleCalendarService: GoogleCalendarService,
    private slackService: SlackService,
    private jiraService: JiraService,
    private analyticsService: AnalyticsService,
  ) {}

  // ─── Sync Now: immediate sync + aggregate build ────────────────────────────
  // Called on first login and on manual refresh. Returns preview data immediately.

  async syncNow(userId: string, orgId: string): Promise<PartialScoreResult> {
    const intResult = await this.db.query(
      `SELECT type FROM integrations WHERE user_id = $1 AND status = 'active'`,
      [userId],
    );
    const types = intResult.rows.map((r) => r.type);

    // Sync all connected integrations — failures don't block the response
    await Promise.allSettled([
      types.includes('google_calendar')
        ? this.googleCalendarService.syncUserCalendar(userId, orgId)
        : Promise.resolve(),
      types.includes('slack')
        ? this.slackService.syncUserMessages(userId, orgId)
        : Promise.resolve(),
      types.includes('jira')
        ? this.jiraService.syncUserActivity(userId, orgId)
        : Promise.resolve(),
    ]);

    // Build daily aggregates for last 7 days in parallel
    const today = new Date();
    await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        this.analyticsService
          .buildDailyAggregates(userId, orgId, subDays(today, i))
          .catch((err) => this.logger.warn(`Day -${i} aggregate failed: ${err.message}`)),
      ),
    );

    return this.analyticsService.computePartialScores(userId, orgId);
  }

  // ─── Preview: partial week scores without needing 7 full days ─────────────

  async getPreview(userId: string, orgId: string): Promise<PartialScoreResult> {
    return this.analyticsService.computePartialScores(userId, orgId);
  }

  // ─── Team Dashboard ────────────────────────────────────────────────────────

  async getTeamDashboard(orgId: string, weeks: number = 4) {
    const weekStarts = Array.from({ length: weeks }, (_, i) => {
      const w = startOfWeek(subWeeks(new Date(), i + 1), { weekStartsOn: 1 });
      return format(w, 'yyyy-MM-dd');
    });

    const [teamScores, memberCount, integrationStatus, latestAnomalies] = await Promise.all([
      this.db.query(
        `SELECT week_start, avg_meeting_load_score, avg_context_switch_score,
                avg_slack_interrupt_score, avg_focus_score, avg_burnout_risk_score,
                members_at_risk, total_members, insights, anomalies
         FROM team_weekly_scores
         WHERE organization_id = $1
           AND week_start = ANY($2::date[])
         ORDER BY week_start DESC`,
        [orgId, weekStarts],
      ),
      this.db.query(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_active = true) as active,
                COUNT(*) FILTER (WHERE data_collection_consent = true) as consented
         FROM users WHERE organization_id = $1`,
        [orgId],
      ),
      this.db.query(
        `SELECT i.type,
                COUNT(*) FILTER (WHERE i.status = 'active') as connected,
                COUNT(*) FILTER (WHERE i.status = 'error') as errored,
                MAX(i.last_synced_at) as last_synced
         FROM integrations i
         JOIN users u ON u.id = i.user_id
         WHERE u.organization_id = $1
         GROUP BY i.type`,
        [orgId],
      ),
      this.db.query(
        `SELECT anomalies, week_start FROM team_weekly_scores
         WHERE organization_id = $1 AND week_start >= NOW() - INTERVAL '4 weeks'
         ORDER BY week_start DESC LIMIT 1`,
        [orgId],
      ),
    ]);

    const latestWeek = teamScores.rows[0] || null;
    const trend = teamScores.rows.slice(0, 4).map((w) => ({
      weekStart: w.week_start,
      burnoutRisk: parseFloat(w.avg_burnout_risk_score),
      meetingLoad: parseFloat(w.avg_meeting_load_score),
      focusScore: parseFloat(w.avg_focus_score),
      membersAtRisk: w.members_at_risk,
    }));

    const weekInProgress = await this.getTeamWeekInProgress(orgId);

    return {
      latestWeek,
      trend,
      weekInProgress,
      memberStats: memberCount.rows[0],
      integrationStatus: integrationStatus.rows,
      activeAnomalies:
        latestAnomalies.rows[0]?.anomalies?.filter((a: any) => a.severity !== 'info') || [],
    };
  }

  // Current (partial) week aggregate across the team — shown when no completed week exists
  private async getTeamWeekInProgress(orgId: string) {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    const result = await this.db.query(
      `SELECT
         COUNT(DISTINCT da.user_id) as members_with_data,
         ROUND(AVG(da.total_meeting_minutes)) as avg_meeting_minutes,
         ROUND(AVG(da.solo_focus_minutes)) as avg_focus_minutes,
         SUM(da.after_hours_events) as total_after_hours,
         SUM(da.back_to_back_meetings) as total_b2b,
         COUNT(DISTINCT da.date) as days_collected
       FROM daily_aggregates da
       JOIN users u ON u.id = da.user_id
       WHERE u.organization_id = $1
         AND da.date BETWEEN $2 AND $3`,
      [orgId, weekStartStr, todayStr],
    );

    const row = result.rows[0];
    if (!row || parseInt(row.members_with_data) === 0) return null;

    return {
      weekStart: weekStartStr,
      membersWithData: parseInt(row.members_with_data),
      avgDailyMeetingMinutes: parseInt(row.avg_meeting_minutes) || 0,
      avgDailyFocusMinutes: parseInt(row.avg_focus_minutes) || 0,
      totalAfterHoursEvents: parseInt(row.total_after_hours) || 0,
      totalBackToBack: parseInt(row.total_b2b) || 0,
      daysCollected: parseInt(row.days_collected) || 0,
    };
  }

  // ─── Individual Score View ─────────────────────────────────────────────────

  async getMemberScores(orgId: string, userId: string, weeks: number = 8) {
    const weekStarts = Array.from({ length: weeks }, (_, i) => {
      const w = startOfWeek(subWeeks(new Date(), i + 1), { weekStartsOn: 1 });
      return format(w, 'yyyy-MM-dd');
    });

    const [weeklyScores, recentDaily] = await Promise.all([
      this.db.query(
        `SELECT week_start, meeting_load_score, context_switch_score,
                slack_interrupt_score, focus_score, after_hours_score,
                burnout_risk_score, burnout_risk_delta, score_breakdown
         FROM weekly_scores
         WHERE user_id = $1 AND organization_id = $2
           AND week_start = ANY($3::date[])
         ORDER BY week_start DESC`,
        [userId, orgId, weekStarts],
      ),
      this.db.query(
        `SELECT date, total_meeting_minutes, meeting_count, solo_focus_minutes,
                slack_messages_sent, after_hours_events, context_switches, back_to_back_meetings
         FROM daily_aggregates
         WHERE user_id = $1 AND organization_id = $2
           AND date >= NOW() - INTERVAL '14 days'
         ORDER BY date DESC`,
        [userId, orgId],
      ),
    ]);

    return {
      weeklyScores: weeklyScores.rows,
      recentDaily: recentDaily.rows,
    };
  }

  // ─── Team Members Overview ─────────────────────────────────────────────────

  async getTeamMembersOverview(orgId: string) {
    const latestWeek = format(
      startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 }),
      'yyyy-MM-dd',
    );

    const result = await this.db.query(
      `SELECT
         u.id, u.name, u.email, u.avatar_url, u.timezone,
         ws.burnout_risk_score, ws.meeting_load_score, ws.focus_score,
         ws.after_hours_score, ws.burnout_risk_delta,
         ws.score_breakdown->'riskFlags' as risk_flags,
         COALESCE(
           json_object_agg(i.type, i.status) FILTER (WHERE i.type IS NOT NULL),
           '{}'::json
         ) as integrations
       FROM users u
       LEFT JOIN weekly_scores ws ON ws.user_id = u.id AND ws.week_start = $2
       LEFT JOIN integrations i ON i.user_id = u.id
       WHERE u.organization_id = $1 AND u.is_active = true
       GROUP BY u.id, ws.burnout_risk_score, ws.meeting_load_score, ws.focus_score,
                ws.after_hours_score, ws.burnout_risk_delta, ws.score_breakdown
       ORDER BY ws.burnout_risk_score DESC NULLS LAST`,
      [orgId, latestWeek],
    );

    return result.rows;
  }

  // ─── Integration Status ────────────────────────────────────────────────────

  async getIntegrationStatus(userId: string) {
    const result = await this.db.query(
      `SELECT type, status, last_synced_at, error_message,
              metadata->>'teamName' as slack_team,
              metadata->>'siteName' as jira_site
       FROM integrations WHERE user_id = $1`,
      [userId],
    );
    return result.rows;
  }

  // ─── Export CSV ────────────────────────────────────────────────────────────

  async exportTeamCsv(orgId: string, weeks: number = 12): Promise<string> {
    const result = await this.db.query(
      `SELECT u.name, u.email,
              ws.week_start, ws.meeting_load_score, ws.context_switch_score,
              ws.slack_interrupt_score, ws.focus_score, ws.after_hours_score,
              ws.burnout_risk_score
       FROM weekly_scores ws
       JOIN users u ON u.id = ws.user_id
       WHERE ws.organization_id = $1
         AND ws.week_start >= NOW() - INTERVAL '${weeks} weeks'
       ORDER BY ws.week_start DESC, u.name ASC`,
      [orgId],
    );

    const headers = [
      'Name', 'Email', 'Week', 'Meeting Load', 'Context Switch',
      'Slack Interrupt', 'Focus Score', 'After Hours', 'Burnout Risk',
    ];
    const rows = result.rows.map((r) => [
      r.name, r.email, r.week_start,
      r.meeting_load_score, r.context_switch_score, r.slack_interrupt_score,
      r.focus_score, r.after_hours_score, r.burnout_risk_score,
    ]);

    return [headers, ...rows].map((r) => r.join(',')).join('\n');
  }
}
