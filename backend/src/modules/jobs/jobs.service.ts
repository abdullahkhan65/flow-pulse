import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../../database/database.module';
import { GoogleCalendarService } from '../integrations/google-calendar/google-calendar.service';
import { SlackService } from '../integrations/slack/slack.service';
import { JiraService } from '../integrations/jira/jira.service';
import { GmailService } from '../integrations/gmail/gmail.service';
import { GithubService } from '../integrations/github/github.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { startOfWeek, subDays, format } from 'date-fns';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private isRunning = false;  // Simple in-memory lock

  constructor(
    @Inject(DATABASE_POOL) private db: Pool,
    private googleCalendarService: GoogleCalendarService,
    private slackService: SlackService,
    private jiraService: JiraService,
    private gmailService: GmailService,
    private githubService: GithubService,
    private analyticsService: AnalyticsService,
    private notificationsService: NotificationsService,
  ) {}

  // ─── Data Sync: every 4 hours during work hours ───────────────────────────
  @Cron('0 */4 8-20 * * 1-5')  // Every 4h, Mon–Fri, 8am–8pm
  async syncAllIntegrations() {
    if (this.isRunning) {
      this.logger.warn('Sync already running, skipping');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting integration sync for all users');

    try {
      // Get all active users with integrations
      const result = await this.db.query(
        `SELECT DISTINCT u.id as user_id, u.organization_id
         FROM users u
         JOIN integrations i ON i.user_id = u.id
         WHERE u.is_active = true AND u.data_collection_consent = true
           AND i.status = 'active'`,
      );

      const users = result.rows;
      this.logger.log(`Syncing ${users.length} users`);

      for (const user of users) {
        await this.syncUser(user.user_id, user.organization_id).catch((err) => {
          this.logger.error(`Failed to sync user ${user.user_id}: ${err.message}`);
        });
        // Throttle between users to avoid API rate limits
        await new Promise((r) => setTimeout(r, 500));
      }

      this.logger.log('Integration sync complete');
    } finally {
      this.isRunning = false;
    }
  }

  private async syncUser(userId: string, orgId: string) {
    const integrationsResult = await this.db.query(
      `SELECT type FROM integrations WHERE user_id = $1 AND status = 'active'`,
      [userId],
    );
    const types = integrationsResult.rows.map((r) => r.type);

    await Promise.allSettled([
      types.includes('google_calendar')
        ? this.googleCalendarService.syncUserCalendar(userId, orgId)
        : Promise.resolve(),
      // Gmail uses the same google_calendar tokens — always run if calendar is active
      types.includes('google_calendar')
        ? this.gmailService.syncUserEmails(userId, orgId)
        : Promise.resolve(),
      types.includes('slack')
        ? this.slackService.syncUserMessages(userId, orgId)
        : Promise.resolve(),
      types.includes('jira')
        ? this.jiraService.syncUserActivity(userId, orgId)
        : Promise.resolve(),
      types.includes('github')
        ? this.githubService.syncUserActivity(userId, orgId)
        : Promise.resolve(),
    ]);
  }

  // ─── Daily Aggregation: every day at midnight ─────────────────────────────
  @Cron('0 0 1 * * *')  // 1am daily
  async runDailyAggregation() {
    this.logger.log('Running daily aggregation');
    const yesterday = subDays(new Date(), 1);

    const result = await this.db.query(
      `SELECT DISTINCT u.id as user_id, u.organization_id
       FROM users u
       WHERE u.is_active = true AND u.data_collection_consent = true`,
    );

    for (const user of result.rows) {
      await this.analyticsService
        .buildDailyAggregates(user.user_id, user.organization_id, yesterday)
        .catch((err) => {
          this.logger.error(`Daily aggregation failed for user ${user.user_id}: ${err.message}`);
        });
    }

    this.logger.log(`Daily aggregation complete for ${result.rows.length} users`);
  }

  // ─── Weekly Score Computation: Monday at 6am ──────────────────────────────
  @Cron('0 0 6 * * 1')  // Monday at 6am
  async runWeeklyScores() {
    this.logger.log('Computing weekly scores');

    // Score for the PREVIOUS week (just completed)
    const lastWeekStart = startOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 });

    const result = await this.db.query(
      `SELECT DISTINCT u.id as user_id, u.organization_id
       FROM users u
       WHERE u.is_active = true AND u.data_collection_consent = true`,
    );

    const orgSet = new Set<string>();

    for (const user of result.rows) {
      await this.analyticsService
        .computeWeeklyScores(user.user_id, user.organization_id, lastWeekStart)
        .catch((err) => {
          this.logger.error(`Weekly score failed for user ${user.user_id}: ${err.message}`);
        });
      orgSet.add(user.organization_id);
    }

    // Compute team-level scores per org
    for (const orgId of orgSet) {
      await this.analyticsService
        .computeTeamWeeklyScores(orgId, lastWeekStart)
        .catch((err) => {
          this.logger.error(`Team score failed for org ${orgId}: ${err.message}`);
        });
    }

    this.logger.log('Weekly score computation complete');
  }

  // ─── Weekly Email Digest: Monday at 8am ───────────────────────────────────
  @Cron('0 0 8 * * 1')  // Monday at 8am
  async sendWeeklyDigests() {
    this.logger.log('Sending weekly digest emails');
    await this.notificationsService.sendWeeklyDigests().catch((err) => {
      this.logger.error(`Weekly digest failed: ${err.message}`);
    });
  }

  // ─── Burnout Alert Checks: daily at 9am ────────────────────────────────────
  @Cron('0 0 9 * * 1-5')  // 9am Mon–Fri
  async checkBurnoutAlerts() {
    this.logger.log('Checking burnout alerts');
    await this.notificationsService.sendBurnoutAlerts().catch((err) => {
      this.logger.error(`Burnout alert check failed: ${err.message}`);
    });
  }

  // ─── Manual trigger (for testing / admin) ─────────────────────────────────
  async triggerSyncForOrg(orgId: string) {
    const result = await this.db.query(
      `SELECT u.id as user_id, u.organization_id
       FROM users u WHERE u.organization_id = $1 AND u.is_active = true`,
      [orgId],
    );

    for (const user of result.rows) {
      await this.syncUser(user.user_id, user.organization_id);
    }

    return { triggered: result.rows.length };
  }
}
