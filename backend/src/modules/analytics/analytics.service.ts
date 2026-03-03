import { Injectable, Inject, Logger } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../database/database.module";
import {
  startOfWeek,
  endOfWeek,
  format,
  subWeeks,
  startOfDay,
  addDays,
} from "date-fns";
import { computeMeetingLoadScore } from "./engines/meeting-load.engine";
import { computeContextSwitchScore } from "./engines/context-switch.engine";
import { computeSlackInterruptScore } from "./engines/slack-interrupt.engine";
import { computeFocusScore } from "./engines/focus-time.engine";
import { computeAfterHoursScore } from "./engines/after-hours.engine";
import { computeBurnoutRiskScore } from "./engines/burnout-risk.engine";
import { computeEmailLoadScore } from "./engines/email-load.engine";
import { computeGithubLoadScore } from "./engines/github-load.engine";
import { computeJiraLoadScore } from "./engines/jira-load.engine";
import {
  DailyAggregate,
  RawActivityLog,
  WeeklyScoreResult,
} from "./analytics.types";
import { differenceInMinutes } from "date-fns";

export interface TodaySnapshot {
  meetingsToday: number;
  meetingMinutesToday: number;
  focusMinutesToday: number;
  slackMessagesToday: number;
  afterHoursEventsToday: number;
  contextSwitchesToday: number;
  backToBackToday: number;
  emailsSentToday: number;
  emailsReceivedToday: number;
  githubEventsToday: number;
}

export interface PartialScoreResult {
  isPartial: true;
  daysCollected: number;
  daysNeededForFull: number;
  confidence: "none" | "low" | "medium" | "high";
  hasEnoughForFullScores: boolean;
  dataFrom: string | null;
  lastSyncedAt: string | null;
  todaySnapshot: TodaySnapshot | null;
  thisWeekSoFar: {
    totalMeetings: number;
    totalMeetingMinutes: number;
    avgMeetingMinutesPerDay: number;
    backToBackMeetings: number;
    afterHoursEvents: number;
    totalSlackMessages: number;
    totalFocusMinutes: number;
    avgFocusMinutesPerDay: number;
    totalEmailsSent: number;
    totalEmailsReceived: number;
    afterHoursEmails: number;
    avgEmailResponseMin: number | null;
    totalGithubCommits: number;
    totalGithubPrReviews: number;
    totalGithubPrsCreated: number;
    githubAfterHoursEvents: number;
    jiraTransitions: number;
    jiraIssuesCompleted: number;
    jiraAfterHoursTransitions: number;
    jiraTodoCount: number;
    jiraInProgressCount: number;
  } | null;
  signalCoverage: {
    calendar: {
      connected: boolean;
      daysWithData: number;
      totalEvents: number;
      coveragePct: number;
    };
    email: {
      connected: boolean;
      daysWithData: number;
      totalEvents: number;
      coveragePct: number;
    };
    github: {
      connected: boolean;
      daysWithData: number;
      totalEvents: number;
      coveragePct: number;
    };
  };
  partialScores: {
    meetingLoadScore: number;
    contextSwitchScore: number;
    slackInterruptScore: number;
    focusScore: number;
    afterHoursScore: number;
    githubLoadScore: number;
    jiraLoadScore: number;
    burnoutRiskScore: number;
    riskLevel: "low" | "moderate" | "high" | "critical";
    riskFlags: string[];
  } | null;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(@Inject(DATABASE_POOL) private db: Pool) {}

  // ─── Step 1: Build daily aggregates from raw logs ─────────────────────────

  async buildDailyAggregates(
    userId: string,
    orgId: string,
    date: Date,
  ): Promise<void> {
    const dateStr = format(date, "yyyy-MM-dd");
    // Use explicit local-timezone boundaries so events stored in UTC are bucketed
    // by the server's local day (matches the user's working day) rather than UTC day.
    const dayStart = startOfDay(date).toISOString();
    const dayEnd = addDays(startOfDay(date), 1).toISOString();

    const logsResult = await this.db.query<RawActivityLog>(
      `SELECT * FROM raw_activity_logs
       WHERE user_id = $1
         AND occurred_at >= $2
         AND occurred_at < $3
       ORDER BY occurred_at ASC`,
      [userId, dayStart, dayEnd],
    );

    const logs = logsResult.rows.map((r) => ({
      ...r,
      occurred_at: new Date(r.occurred_at),
    }));

    const calendarLogs = logs.filter((l) => l.source === "google_calendar");
    const slackLogs = logs.filter((l) => l.source === "slack");
    const jiraLogs = logs.filter((l) => l.source === "jira");
    const gmailLogs = logs.filter((l) => l.source === "gmail");
    const githubLogs = logs.filter((l) => l.source === "github");

    // Calendar metrics
    const meetings = calendarLogs.filter((l) => l.event_type === "meeting");
    const totalMeetingMinutes = Math.round(
      meetings.reduce((s, m) => s + (m.duration_seconds || 0) / 60, 0),
    );

    // Back-to-back: meetings with < 10 min gap between them
    let b2bCount = 0;
    for (let i = 1; i < meetings.length; i++) {
      const prevEnd = new Date(
        meetings[i - 1].occurred_at.getTime() +
          (meetings[i - 1].duration_seconds || 0) * 1000,
      );
      const gap = differenceInMinutes(meetings[i].occurred_at, prevEnd);
      if (gap >= 0 && gap < 10) b2bCount++;
    }

    // Focus blocks: gaps ≥30 min between meetings during work hours (9am–6pm)
    const WORK_START = 9 * 60;
    const WORK_END = 18 * 60;
    let soloFocusMinutes = 0;

    // Only count focus if the person has any activity data that day.
    // An empty day (no logs) means no data — not a 9-hour focus block.
    const hasAnyActivity = logs.length > 0;

    if (meetings.length === 0) {
      // No meetings — count whole workday as focus only if other signals show they were working
      soloFocusMinutes = hasAnyActivity ? WORK_END - WORK_START : 0;
    } else {
      const sortedMeetings = [...meetings].sort(
        (a, b) => a.occurred_at.getTime() - b.occurred_at.getTime(),
      );
      let cursor = WORK_START;
      for (const m of sortedMeetings) {
        const mStart =
          m.occurred_at.getHours() * 60 + m.occurred_at.getMinutes();
        const mEnd = mStart + Math.round((m.duration_seconds || 0) / 60);
        if (mStart > cursor) {
          const gap = Math.min(mStart, WORK_END) - cursor;
          if (gap >= 30) soloFocusMinutes += gap;
        }
        cursor = Math.max(cursor, mEnd);
      }
      if (cursor < WORK_END) {
        const remaining = WORK_END - cursor;
        if (remaining >= 30) soloFocusMinutes += remaining;
      }
    }

    // Slack metrics
    const slackChannels = new Set(slackLogs.map((l) => l.metadata?.channelId))
      .size;

    // After-hours and weekend
    const afterHoursEvents = logs.filter((l) => l.is_after_hours).length;
    const weekendEvents = logs.filter((l) => l.is_weekend).length;

    // Gmail email metrics
    const emailsSent = gmailLogs.filter(
      (l) => l.event_type === "email_sent",
    ).length;
    const emailsReceived = gmailLogs.filter(
      (l) => l.event_type === "email_received",
    ).length;
    const afterHoursEmails = gmailLogs.filter(
      (l) => l.is_after_hours && l.event_type === "email_sent",
    ).length;

    // Average email response time (minutes) — thread-based
    let avgEmailResponseMin: number | null = null;
    const sentByThread = new Map<string, number>();
    const receivedByThread = new Map<string, number>();
    for (const log of gmailLogs) {
      const threadId = log.metadata?.threadId;
      if (!threadId) continue;
      const ts = log.occurred_at.getTime();
      if (log.event_type === "email_sent") {
        if (!sentByThread.has(threadId)) sentByThread.set(threadId, ts);
      } else {
        if (!receivedByThread.has(threadId)) receivedByThread.set(threadId, ts);
      }
    }
    const responseTimes: number[] = [];
    for (const [threadId, receivedTs] of receivedByThread.entries()) {
      const sentTs = sentByThread.get(threadId);
      if (sentTs && sentTs > receivedTs) {
        responseTimes.push(Math.round((sentTs - receivedTs) / 60000));
      }
    }
    if (responseTimes.length > 0) {
      avgEmailResponseMin = Math.round(
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      );
    }

    // Jira: separate transition events (changelog) from state snapshot events
    const jiraTransitionLogs = jiraLogs.filter(
      (l) => l.event_type === "jira_transition",
    );
    const jiraStateLogs = jiraLogs.filter(
      (l) => l.event_type === "jira_ticket_state",
    );

    // Issues completed: prefer transition-based count; fall back to state snapshot
    const jiraIssuesCompletedFromTransitions = jiraTransitionLogs.filter(
      (l) => l.metadata?.isCompleted === true,
    ).length;
    const jiraIssuesCompletedFromSnapshot = jiraStateLogs.filter(
      (l) => l.metadata?.statusCategory === "Done",
    ).length;
    const jiraIssuesCompleted = Math.max(
      jiraIssuesCompletedFromTransitions,
      jiraIssuesCompletedFromSnapshot,
    );

    // After-hours: count from both transition events AND ticket state updates
    const jiraAfterHoursTransitions = [
      ...jiraTransitionLogs.filter((l) => l.is_after_hours),
      ...jiraStateLogs.filter(
        (l) => l.metadata?.lastUpdatedAfterHours === true,
      ),
    ].length;
    const jiraWeekendTransitions = [
      ...jiraTransitionLogs.filter((l) => l.is_weekend),
      ...jiraStateLogs.filter((l) => l.metadata?.lastUpdatedWeekend === true),
    ].length;

    // Workload snapshot: current ticket counts by status category
    const jiraTodoCount = jiraStateLogs.filter(
      (l) => l.metadata?.statusCategory === "To Do",
    ).length;
    const jiraInProgressCount = jiraStateLogs.filter(
      (l) => l.metadata?.statusCategory === "In Progress",
    ).length;

    // GitHub metrics
    const githubCommits = githubLogs.filter(
      (l) => l.event_type === "commit_pushed",
    ).length;
    const githubPrReviews = githubLogs.filter(
      (l) => l.event_type === "pr_reviewed",
    ).length;
    const githubPrsCreated = githubLogs.filter(
      (l) => l.event_type === "pr_created",
    ).length;
    const githubAfterHoursEvents = githubLogs.filter(
      (l) => l.is_after_hours,
    ).length;
    const githubWeekendEvents = githubLogs.filter((l) => l.is_weekend).length;

    // Context switches (within this day)
    let contextSwitches = 0;
    const dayLogs = [...logs].sort(
      (a, b) => a.occurred_at.getTime() - b.occurred_at.getTime(),
    );
    for (let i = 1; i < dayLogs.length; i++) {
      const prev = dayLogs[i - 1];
      const curr = dayLogs[i];
      const gap = differenceInMinutes(curr.occurred_at, prev.occurred_at);
      if (prev.source !== curr.source && gap < 60) {
        contextSwitches++;
      }
    }

    await this.db.query(
      `INSERT INTO daily_aggregates
         (organization_id, user_id, date, total_meeting_minutes, meeting_count,
          back_to_back_meetings, solo_focus_minutes, slack_messages_sent, slack_channels_active,
          after_hours_events, weekend_events, jira_transitions, context_switches,
          jira_issues_completed, jira_after_hours_transitions, jira_weekend_transitions,
          jira_todo_count, jira_in_progress_count,
          emails_sent, emails_received, after_hours_emails, avg_email_response_min,
          github_commits, github_pr_reviews, github_prs_created, github_after_hours_events, github_weekend_events)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
       ON CONFLICT (organization_id, user_id, date) DO UPDATE SET
         total_meeting_minutes = EXCLUDED.total_meeting_minutes,
         meeting_count = EXCLUDED.meeting_count,
         back_to_back_meetings = EXCLUDED.back_to_back_meetings,
         solo_focus_minutes = EXCLUDED.solo_focus_minutes,
         slack_messages_sent = EXCLUDED.slack_messages_sent,
         slack_channels_active = EXCLUDED.slack_channels_active,
         after_hours_events = EXCLUDED.after_hours_events,
         weekend_events = EXCLUDED.weekend_events,
         jira_transitions = EXCLUDED.jira_transitions,
         context_switches = EXCLUDED.context_switches,
         jira_issues_completed = EXCLUDED.jira_issues_completed,
         jira_after_hours_transitions = EXCLUDED.jira_after_hours_transitions,
         jira_weekend_transitions = EXCLUDED.jira_weekend_transitions,
         jira_todo_count = EXCLUDED.jira_todo_count,
         jira_in_progress_count = EXCLUDED.jira_in_progress_count,
         emails_sent = EXCLUDED.emails_sent,
         emails_received = EXCLUDED.emails_received,
         after_hours_emails = EXCLUDED.after_hours_emails,
         avg_email_response_min = EXCLUDED.avg_email_response_min,
         github_commits = EXCLUDED.github_commits,
         github_pr_reviews = EXCLUDED.github_pr_reviews,
         github_prs_created = EXCLUDED.github_prs_created,
         github_after_hours_events = EXCLUDED.github_after_hours_events,
         github_weekend_events = EXCLUDED.github_weekend_events,
         updated_at = NOW()`,
      [
        orgId,
        userId,
        dateStr,
        totalMeetingMinutes,
        meetings.length,
        b2bCount,
        soloFocusMinutes,
        slackLogs.length,
        slackChannels,
        afterHoursEvents,
        weekendEvents,
        jiraTransitionLogs.length,
        contextSwitches,
        jiraIssuesCompleted,
        jiraAfterHoursTransitions,
        jiraWeekendTransitions,
        jiraTodoCount,
        jiraInProgressCount,
        emailsSent,
        emailsReceived,
        afterHoursEmails,
        avgEmailResponseMin,
        githubCommits,
        githubPrReviews,
        githubPrsCreated,
        githubAfterHoursEvents,
        githubWeekendEvents,
      ],
    );
  }

  // ─── Step 2: Compute weekly scores from daily aggregates ──────────────────

  async computeWeeklyScores(
    userId: string,
    orgId: string,
    weekStart: Date,
  ): Promise<WeeklyScoreResult> {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const weekEndStr = format(weekEnd, "yyyy-MM-dd");

    const [aggregatesResult, logsResult] = await Promise.all([
      this.db.query<DailyAggregate>(
        `SELECT * FROM daily_aggregates
         WHERE user_id = $1 AND date BETWEEN $2 AND $3
         ORDER BY date ASC`,
        [userId, weekStartStr, weekEndStr],
      ),
      this.db.query<RawActivityLog>(
        `SELECT * FROM raw_activity_logs
         WHERE user_id = $1 AND occurred_at BETWEEN $2 AND $3
         ORDER BY occurred_at ASC`,
        [userId, weekStart.toISOString(), weekEnd.toISOString()],
      ),
    ]);

    const aggregates = aggregatesResult.rows.map((r) => ({
      ...r,
      date: new Date(r.date),
    }));

    const logs = logsResult.rows.map((r) => ({
      ...r,
      occurred_at: new Date(r.occurred_at),
    }));

    // Run all engines
    const { score: meetingLoadScore, breakdown: mlBreakdown } =
      computeMeetingLoadScore(aggregates);
    const { score: contextSwitchScore, breakdown: csBreakdown } =
      computeContextSwitchScore(logs);
    const { score: slackInterruptScore, breakdown: siBreakdown } =
      computeSlackInterruptScore(aggregates);
    const { score: focusScore, breakdown: ftBreakdown } =
      computeFocusScore(aggregates);
    const { score: afterHoursScore, breakdown: ahBreakdown } =
      computeAfterHoursScore(aggregates);
    const { score: emailLoadScore, breakdown: elBreakdown } =
      computeEmailLoadScore(aggregates);
    const { score: githubLoadScore, breakdown: ghBreakdown } =
      computeGithubLoadScore(aggregates);
    const { score: jiraLoadScore, breakdown: jlBreakdown } =
      computeJiraLoadScore(aggregates);

    // 1:1 meeting count: 2-person meetings ≥ 30 min this week
    const oneOnOneCount = logs.filter(
      (l) =>
        l.source === "google_calendar" &&
        l.event_type === "meeting" &&
        l.participants_count === 2 &&
        (l.duration_seconds || 0) >= 1800,
    ).length;

    // Get previous 4 weeks of scores for delta + trajectory calculation
    const prevScoresResult = await this.db.query(
      `SELECT week_start, burnout_risk_score FROM weekly_scores
       WHERE user_id = $1 AND week_start < $2
       ORDER BY week_start DESC LIMIT 4`,
      [userId, weekStartStr],
    );
    const prevScores = prevScoresResult.rows;
    const previousWeekBurnoutScore = prevScores[0]?.burnout_risk_score;

    // Burnout trajectory: linear slope over last 3+ weeks (including current)
    let trajectory: "escalating" | "improving" | "stable" = "stable";
    let slopePerWeek = 0;
    let projectedIn2Weeks: number | null = null;
    if (prevScores.length >= 2) {
      const points = prevScores
        .slice(0, 3)
        .reverse()
        .map((r, i) => ({
          x: i,
          y: parseFloat(r.burnout_risk_score),
        }));
      const n = points.length;
      const sumX = points.reduce((s, p) => s + p.x, 0);
      const sumY = points.reduce((s, p) => s + p.y, 0);
      const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
      const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
      slopePerWeek = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      if (slopePerWeek > 3) trajectory = "escalating";
      else if (slopePerWeek < -3) trajectory = "improving";
      projectedIn2Weeks = Math.min(
        100,
        Math.max(
          0,
          Math.round(
            parseFloat(previousWeekBurnoutScore || "0") + slopePerWeek * 2,
          ),
        ),
      );
    }

    const burnoutResult = computeBurnoutRiskScore({
      meetingLoadScore,
      contextSwitchScore,
      slackInterruptScore,
      focusScore,
      afterHoursScore,
      emailLoadScore,
      githubLoadScore,
      jiraLoadScore,
      previousWeekBurnoutScore: previousWeekBurnoutScore
        ? parseFloat(previousWeekBurnoutScore)
        : undefined,
    });

    const scoreBreakdown = {
      meetingLoad: mlBreakdown,
      contextSwitch: csBreakdown,
      slackInterrupt: siBreakdown,
      focusTime: ftBreakdown,
      afterHours: ahBreakdown,
      emailLoad: elBreakdown,
      githubLoad: { score: githubLoadScore, ...ghBreakdown },
      jiraLoad: jlBreakdown,
      burnout: burnoutResult.weightedComponents,
      riskFlags: burnoutResult.riskFlags,
      oneOnOneCount,
      trajectory,
      slopePerWeek: Math.round(slopePerWeek * 10) / 10,
      projectedIn2Weeks,
    };

    // Persist scores
    await this.db.query(
      `INSERT INTO weekly_scores
         (organization_id, user_id, week_start, meeting_load_score, context_switch_score,
          slack_interrupt_score, focus_score, after_hours_score, burnout_risk_score,
          score_breakdown, burnout_risk_delta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (organization_id, user_id, week_start) DO UPDATE SET
         meeting_load_score = EXCLUDED.meeting_load_score,
         context_switch_score = EXCLUDED.context_switch_score,
         slack_interrupt_score = EXCLUDED.slack_interrupt_score,
         focus_score = EXCLUDED.focus_score,
         after_hours_score = EXCLUDED.after_hours_score,
         burnout_risk_score = EXCLUDED.burnout_risk_score,
         score_breakdown = EXCLUDED.score_breakdown,
         burnout_risk_delta = EXCLUDED.burnout_risk_delta,
         updated_at = NOW()`,
      [
        orgId,
        userId,
        weekStartStr,
        meetingLoadScore,
        contextSwitchScore,
        slackInterruptScore,
        focusScore,
        afterHoursScore,
        burnoutResult.burnoutRiskScore,
        JSON.stringify(scoreBreakdown),
        burnoutResult.delta ?? null,
      ],
    );

    return {
      userId,
      weekStart,
      meetingLoadScore,
      contextSwitchScore,
      slackInterruptScore,
      focusScore,
      afterHoursScore,
      burnoutRiskScore: burnoutResult.burnoutRiskScore,
      riskLevel: burnoutResult.riskLevel,
      riskFlags: burnoutResult.riskFlags,
      breakdown: scoreBreakdown,
    };
  }

  // ─── Step 3: Compute team-level aggregate ─────────────────────────────────

  async computeTeamWeeklyScores(orgId: string, weekStart: Date): Promise<void> {
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const burnoutThreshold = 70;

    const result = await this.db.query(
      `SELECT
         COUNT(*) as total_members,
         AVG(meeting_load_score) as avg_meeting_load,
         AVG(context_switch_score) as avg_context_switch,
         AVG(slack_interrupt_score) as avg_slack_interrupt,
         AVG(focus_score) as avg_focus,
         AVG(burnout_risk_score) as avg_burnout_risk,
         COUNT(*) FILTER (WHERE burnout_risk_score >= $2) as members_at_risk
       FROM weekly_scores
       WHERE organization_id = $1 AND week_start = $3`,
      [orgId, burnoutThreshold, weekStartStr],
    );

    if (!result.rows[0] || parseInt(result.rows[0].total_members) === 0) return;

    const row = result.rows[0];

    // Generate simple team-level insights
    const insights = generateTeamInsights(row);
    const anomalies = await this.detectAnomalies(orgId, weekStart, row);

    await this.db.query(
      `INSERT INTO team_weekly_scores
         (organization_id, week_start, avg_meeting_load_score, avg_context_switch_score,
          avg_slack_interrupt_score, avg_focus_score, avg_burnout_risk_score,
          members_at_risk, total_members, insights, anomalies)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (organization_id, week_start) DO UPDATE SET
         avg_meeting_load_score = EXCLUDED.avg_meeting_load_score,
         avg_context_switch_score = EXCLUDED.avg_context_switch_score,
         avg_slack_interrupt_score = EXCLUDED.avg_slack_interrupt_score,
         avg_focus_score = EXCLUDED.avg_focus_score,
         avg_burnout_risk_score = EXCLUDED.avg_burnout_risk_score,
         members_at_risk = EXCLUDED.members_at_risk,
         total_members = EXCLUDED.total_members,
         insights = EXCLUDED.insights,
         anomalies = EXCLUDED.anomalies,
         updated_at = NOW()`,
      [
        orgId,
        weekStartStr,
        parseFloat(row.avg_meeting_load) || 0,
        parseFloat(row.avg_context_switch) || 0,
        parseFloat(row.avg_slack_interrupt) || 0,
        parseFloat(row.avg_focus) || 0,
        parseFloat(row.avg_burnout_risk) || 0,
        parseInt(row.members_at_risk) || 0,
        parseInt(row.total_members) || 0,
        JSON.stringify(insights),
        JSON.stringify(anomalies),
      ],
    );
  }

  // ─── Step 4: Partial scores for new users (< 7 days of data) ────────────

  async computePartialScores(userId: string): Promise<PartialScoreResult> {
    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const todayStr = format(today, "yyyy-MM-dd");
    const weekStartStr = format(weekStart, "yyyy-MM-dd");

    const [
      aggregatesResult,
      logsResult,
      lastSyncResult,
      firstLogResult,
      integrationsResult,
    ] = await Promise.all([
      this.db.query<DailyAggregate>(
        `SELECT * FROM daily_aggregates
         WHERE user_id = $1 AND date BETWEEN $2 AND $3
         ORDER BY date ASC`,
        [userId, weekStartStr, todayStr],
      ),
      this.db.query<RawActivityLog>(
        `SELECT * FROM raw_activity_logs
         WHERE user_id = $1 AND occurred_at >= $2
         ORDER BY occurred_at ASC`,
        [userId, weekStart.toISOString()],
      ),
      this.db.query(
        `SELECT MAX(last_synced_at) as last_synced
         FROM integrations WHERE user_id = $1`,
        [userId],
      ),
      this.db.query(
        `SELECT MIN(occurred_at) as first_log FROM raw_activity_logs WHERE user_id = $1`,
        [userId],
      ),
      this.db.query(
        `SELECT type, status FROM integrations WHERE user_id = $1`,
        [userId],
      ),
    ]);

    const aggregates = aggregatesResult.rows.map((r) => ({
      ...r,
      date: new Date(r.date),
    }));
    const logs = logsResult.rows.map((r) => ({
      ...r,
      occurred_at: new Date(r.occurred_at),
    }));
    const lastSyncedAt = lastSyncResult.rows[0]?.last_synced ?? null;
    const dataFrom = firstLogResult.rows[0]?.first_log
      ? format(new Date(firstLogResult.rows[0].first_log), "yyyy-MM-dd")
      : null;

    const daysCollected = aggregates.length;
    const DAYS_NEEDED = 7;
    const connectedTypes = new Set(
      integrationsResult.rows
        .filter((r) => r.status === "active")
        .map((r) => r.type),
    );
    const buildCoverage = (
      source: "google_calendar" | "gmail" | "github",
      connected: boolean,
    ) => {
      const sourceLogs = logs.filter((l) => l.source === source);
      const daysWithData = new Set(
        sourceLogs.map((l) => format(l.occurred_at, "yyyy-MM-dd")),
      ).size;
      const coveragePct =
        daysCollected > 0
          ? Math.round((daysWithData / daysCollected) * 100)
          : 0;
      return {
        connected,
        daysWithData,
        totalEvents: sourceLogs.length,
        coveragePct,
      };
    };
    const signalCoverage = {
      calendar: buildCoverage(
        "google_calendar",
        connectedTypes.has("google_calendar"),
      ),
      email: buildCoverage("gmail", connectedTypes.has("google_calendar")),
      github: buildCoverage("github", connectedTypes.has("github")),
    };

    const confidence: PartialScoreResult["confidence"] =
      daysCollected === 0
        ? "none"
        : daysCollected <= 2
          ? "low"
          : daysCollected <= 4
            ? "medium"
            : "high";

    const todaySnapshot = await this.getTodaySnapshot(userId, todayStr);

    if (daysCollected === 0) {
      return {
        isPartial: true,
        daysCollected: 0,
        daysNeededForFull: DAYS_NEEDED,
        confidence: "none",
        hasEnoughForFullScores: false,
        dataFrom,
        lastSyncedAt,
        todaySnapshot,
        thisWeekSoFar: null,
        signalCoverage,
        partialScores: null,
      };
    }

    // Supplement jira workload counts from raw jira_ticket_state snapshot logs.
    // buildDailyAggregates may have failed silently (e.g. during first-run race),
    // so we compute workload directly from raw logs as a reliable fallback.
    const jiraStateLogs = logs.filter(
      (l) => l.source === "jira" && l.event_type === "jira_ticket_state",
    );
    const liveJiraTodoCount = jiraStateLogs.filter(
      (l) => l.metadata?.statusCategory === "To Do",
    ).length;
    const liveJiraInProgressCount = jiraStateLogs.filter(
      (l) => l.metadata?.statusCategory === "In Progress",
    ).length;

    if (jiraStateLogs.length > 0 && aggregates.length > 0) {
      const latestAgg = aggregates[aggregates.length - 1];
      if (!latestAgg.jira_todo_count && !latestAgg.jira_in_progress_count) {
        latestAgg.jira_todo_count = liveJiraTodoCount;
        latestAgg.jira_in_progress_count = liveJiraInProgressCount;
      }
    }

    const { score: meetingLoadScore } = computeMeetingLoadScore(aggregates);
    const { score: contextSwitchScore } = computeContextSwitchScore(logs);
    const { score: slackInterruptScore } =
      computeSlackInterruptScore(aggregates);
    const { score: focusScore } = computeFocusScore(aggregates);
    const { score: afterHoursScore } = computeAfterHoursScore(aggregates);
    const { score: emailLoadScore } = computeEmailLoadScore(aggregates);
    const { score: githubLoadScore } = computeGithubLoadScore(aggregates);
    const { score: jiraLoadScore } = computeJiraLoadScore(aggregates);
    const burnoutResult = computeBurnoutRiskScore({
      meetingLoadScore,
      contextSwitchScore,
      slackInterruptScore,
      focusScore,
      afterHoursScore,
      emailLoadScore,
      githubLoadScore,
      jiraLoadScore,
    });

    const totalMeetings = aggregates.reduce((s, d) => s + d.meeting_count, 0);
    const totalMeetingMinutes = aggregates.reduce(
      (s, d) => s + d.total_meeting_minutes,
      0,
    );
    const totalFocusMinutes = aggregates.reduce(
      (s, d) => s + (d.solo_focus_minutes || 0),
      0,
    );
    const totalEmailsSent = aggregates.reduce(
      (s, d) => s + (d.emails_sent || 0),
      0,
    );
    const totalEmailsReceived = aggregates.reduce(
      (s, d) => s + (d.emails_received || 0),
      0,
    );
    const totalAfterHoursEmails = aggregates.reduce(
      (s, d) => s + (d.after_hours_emails || 0),
      0,
    );
    const totalGithubCommits = aggregates.reduce(
      (s, d) => s + (d.github_commits || 0),
      0,
    );
    const totalGithubPrReviews = aggregates.reduce(
      (s, d) => s + (d.github_pr_reviews || 0),
      0,
    );
    const totalGithubPrsCreated = aggregates.reduce(
      (s, d) => s + (d.github_prs_created || 0),
      0,
    );
    const githubAfterHoursEvents = aggregates.reduce(
      (s, d) => s + (d.github_after_hours_events || 0),
      0,
    );
    const jiraTransitions = aggregates.reduce(
      (s, d) => s + (d.jira_transitions || 0),
      0,
    );
    const jiraIssuesCompleted = aggregates.reduce(
      (s, d) => s + (d.jira_issues_completed || 0),
      0,
    );
    const jiraAfterHoursTransitions = aggregates.reduce(
      (s, d) => s + (d.jira_after_hours_transitions || 0),
      0,
    );
    const responseMins = aggregates
      .map((d) => d.avg_email_response_min)
      .filter((v) => v != null) as number[];
    const avgEmailResponseMin =
      responseMins.length > 0
        ? Math.round(
            responseMins.reduce((a, b) => a + b, 0) / responseMins.length,
          )
        : null;

    return {
      isPartial: true,
      daysCollected,
      daysNeededForFull: DAYS_NEEDED,
      confidence,
      hasEnoughForFullScores: daysCollected >= DAYS_NEEDED,
      dataFrom,
      lastSyncedAt,
      todaySnapshot,
      signalCoverage,
      thisWeekSoFar: {
        totalMeetings,
        totalMeetingMinutes,
        avgMeetingMinutesPerDay: daysCollected
          ? Math.round(totalMeetingMinutes / daysCollected)
          : 0,
        backToBackMeetings: aggregates.reduce(
          (s, d) => s + (d.back_to_back_meetings || 0),
          0,
        ),
        afterHoursEvents: aggregates.reduce(
          (s, d) => s + d.after_hours_events,
          0,
        ),
        totalSlackMessages: aggregates.reduce(
          (s, d) => s + d.slack_messages_sent,
          0,
        ),
        totalFocusMinutes,
        avgFocusMinutesPerDay: daysCollected
          ? Math.round(totalFocusMinutes / daysCollected)
          : 0,
        totalEmailsSent,
        totalEmailsReceived,
        afterHoursEmails: totalAfterHoursEmails,
        avgEmailResponseMin,
        totalGithubCommits,
        totalGithubPrReviews,
        totalGithubPrsCreated,
        githubAfterHoursEvents,
        jiraTransitions,
        jiraIssuesCompleted,
        jiraAfterHoursTransitions,
        jiraTodoCount: liveJiraTodoCount,
        jiraInProgressCount: liveJiraInProgressCount,
      },
      partialScores: {
        meetingLoadScore,
        contextSwitchScore,
        slackInterruptScore,
        focusScore,
        afterHoursScore,
        githubLoadScore,
        jiraLoadScore,
        burnoutRiskScore: burnoutResult.burnoutRiskScore,
        riskLevel: burnoutResult.riskLevel,
        riskFlags: burnoutResult.riskFlags,
      },
    };
  }

  private async getTodaySnapshot(
    userId: string,
    todayStr: string,
  ): Promise<TodaySnapshot | null> {
    const result = await this.db.query(
      `SELECT * FROM daily_aggregates WHERE user_id = $1 AND date = $2`,
      [userId, todayStr],
    );
    if (!result.rows[0]) return null;
    const r = result.rows[0];
    return {
      meetingsToday: r.meeting_count || 0,
      meetingMinutesToday: r.total_meeting_minutes || 0,
      focusMinutesToday: r.solo_focus_minutes || 0,
      slackMessagesToday: r.slack_messages_sent || 0,
      afterHoursEventsToday: r.after_hours_events || 0,
      contextSwitchesToday: r.context_switches || 0,
      backToBackToday: r.back_to_back_meetings || 0,
      emailsSentToday: r.emails_sent || 0,
      emailsReceivedToday: r.emails_received || 0,
      githubEventsToday:
        (r.github_commits || 0) +
        (r.github_pr_reviews || 0) +
        (r.github_prs_created || 0),
    };
  }

  private async detectAnomalies(
    orgId: string,
    weekStart: Date,
    currentWeek: any,
  ): Promise<any[]> {
    const prevWeekResult = await this.db.query(
      `SELECT * FROM team_weekly_scores
       WHERE organization_id = $1 AND week_start = $2`,
      [orgId, format(subWeeks(weekStart, 1), "yyyy-MM-dd")],
    );

    if (!prevWeekResult.rows[0]) return [];

    const prev = prevWeekResult.rows[0];
    const anomalies: any[] = [];

    const burnoutDelta =
      parseFloat(currentWeek.avg_burnout_risk) -
      parseFloat(prev.avg_burnout_risk_score);
    if (burnoutDelta > 10) {
      anomalies.push({
        type: "burnout_spike",
        severity: burnoutDelta > 20 ? "critical" : "warning",
        message: `Team burnout risk increased by ${Math.round(burnoutDelta)} points this week`,
        delta: burnoutDelta,
      });
    }

    const focusDelta =
      parseFloat(currentWeek.avg_focus) - parseFloat(prev.avg_focus_score);
    if (focusDelta < -15) {
      anomalies.push({
        type: "focus_drop",
        severity: "warning",
        message: `Team focus time dropped significantly this week`,
        delta: focusDelta,
      });
    }

    const meetingDelta =
      parseFloat(currentWeek.avg_meeting_load) -
      parseFloat(prev.avg_meeting_load_score);
    if (meetingDelta > 15) {
      anomalies.push({
        type: "meeting_spike",
        severity: "warning",
        message: `Meeting load increased sharply — consider reviewing recurring meetings`,
        delta: meetingDelta,
      });
    }

    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const prevWeekStartStr = format(subWeeks(weekStart, 1), "yyyy-MM-dd");
    const githubSpikeResult = await this.db.query(
      `WITH curr AS (
         SELECT COALESCE(SUM(github_commits + github_pr_reviews + github_prs_created), 0) AS github_events,
                COALESCE(SUM(github_after_hours_events), 0) AS github_after_hours
         FROM daily_aggregates da
         JOIN users u ON u.id = da.user_id
         WHERE u.organization_id = $1
           AND da.date BETWEEN $2::date AND ($2::date + INTERVAL '6 days')
       ),
       prevw AS (
         SELECT COALESCE(SUM(github_commits + github_pr_reviews + github_prs_created), 0) AS github_events,
                COALESCE(SUM(github_after_hours_events), 0) AS github_after_hours
         FROM daily_aggregates da
         JOIN users u ON u.id = da.user_id
         WHERE u.organization_id = $1
           AND da.date BETWEEN $3::date AND ($3::date + INTERVAL '6 days')
       )
       SELECT
         curr.github_events::int AS curr_events,
         prevw.github_events::int AS prev_events,
         curr.github_after_hours::int AS curr_after_hours,
         prevw.github_after_hours::int AS prev_after_hours
       FROM curr, prevw`,
      [orgId, weekStartStr, prevWeekStartStr],
    );

    const g = githubSpikeResult.rows[0];
    if (g) {
      const eventsDelta = (g.curr_events || 0) - (g.prev_events || 0);
      const offHoursDelta =
        (g.curr_after_hours || 0) - (g.prev_after_hours || 0);
      if (offHoursDelta >= 20 || (eventsDelta >= 60 && offHoursDelta >= 10)) {
        anomalies.push({
          type: "github_after_hours_spike",
          severity: offHoursDelta >= 35 ? "critical" : "warning",
          message: `GitHub after-hours activity spiked by ${offHoursDelta} events week-over-week`,
          delta: offHoursDelta,
        });
      } else if (eventsDelta >= 80) {
        anomalies.push({
          type: "github_volume_spike",
          severity: "warning",
          message: `GitHub activity volume increased sharply by ${eventsDelta} events this week`,
          delta: eventsDelta,
        });
      }
    }

    return anomalies;
  }
}

function generateTeamInsights(weekData: any): any[] {
  const insights: any[] = [];
  const burnoutRisk = parseFloat(weekData.avg_burnout_risk) || 0;
  const meetingLoad = parseFloat(weekData.avg_meeting_load) || 0;
  const focusScore = parseFloat(weekData.avg_focus) || 0;
  const membersAtRisk = parseInt(weekData.members_at_risk) || 0;
  const totalMembers = parseInt(weekData.total_members) || 0;
  const ceremonyOverheadPct = weekData.ceremony_overhead_pct || 0;

  if (membersAtRisk > 0) {
    insights.push({
      type: "members_at_risk",
      priority: "high",
      text: `${membersAtRisk} of ${totalMembers} team members show elevated burnout risk signals`,
      recommendation:
        "Schedule 1:1 check-ins to understand workload and wellbeing",
    });
  }

  if (meetingLoad > 65) {
    insights.push({
      type: "meeting_overload",
      priority: "medium",
      text: `Team average meeting load is high (${Math.round(meetingLoad)}/100)`,
      recommendation:
        "Audit recurring meetings. Aim for meeting-free blocks of 2+ hours daily",
    });
  }

  if (focusScore < 40) {
    insights.push({
      type: "low_focus_time",
      priority: "medium",
      text: `Team has insufficient deep work time this week`,
      recommendation:
        "Protect morning blocks (9am–12pm) as focus time across the team",
    });
  }

  if (ceremonyOverheadPct > 20) {
    insights.push({
      type: "ceremony_overhead",
      priority: "medium",
      text: `${Math.round(ceremonyOverheadPct)}% of team work time spent in recurring meetings`,
      recommendation:
        "Review standup, retro, and planning durations — even 15 min savings per ceremony compounds",
    });
  }

  if (burnoutRisk > 60 && focusScore < 35) {
    insights.push({
      type: "focus_burnout_combo",
      priority: "high",
      text: `High burnout risk combined with low focus time — high-risk combination`,
      recommendation:
        "Block protected focus time on calendars this week and defer non-urgent meetings",
    });
  }

  return insights;
}
