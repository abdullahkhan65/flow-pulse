import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import { DATABASE_POOL } from '../../../database/database.module';
import { encrypt, decrypt } from '../../../common/utils/encryption';
import { subDays, getDay } from 'date-fns';

interface NormalizedGithubEvent {
  userId: string;
  organizationId: string;
  source: 'github';
  eventType: 'commit_pushed' | 'pr_created' | 'pr_reviewed' | 'issue_commented';
  occurredAt: Date;
  isAfterHours: boolean;
  isWeekend: boolean;
  metadata: {
    repoId: number;
    eventAction: string;
    isPrReview: boolean;
  };
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(
    @Inject(DATABASE_POOL) private db: Pool,
    private configService: ConfigService,
  ) {}

  getOAuthUrl(): string {
    const clientId = this.configService.get<string>('github.clientId');
    const callbackUrl = this.configService.get<string>('github.callbackUrl');
    const scope = 'read:user,repo';
    return `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl!)}&scope=${scope}`;
  }

  async handleCallback(userId: string, orgId: string, code: string): Promise<void> {
    const clientId = this.configService.get<string>('github.clientId');
    const clientSecret = this.configService.get<string>('github.clientSecret');

    // Exchange code for token
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });

    const data = await response.json() as any;
    if (!data.access_token) throw new Error('GitHub OAuth failed: no access token returned');

    const encKey = this.configService.get<string>('encryption.key')!;
    const encToken = encrypt(data.access_token, encKey);

    // Get GitHub user info for metadata
    const octokit = new Octokit({ auth: data.access_token });
    const { data: ghUser } = await octokit.users.getAuthenticated();

    await this.db.query(
      `INSERT INTO integrations (organization_id, user_id, type, access_token, status, metadata)
       VALUES ($1, $2, 'github', $3, 'active', $4)
       ON CONFLICT (user_id, type) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         status = 'active',
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [orgId, userId, encToken, JSON.stringify({ githubLogin: ghUser.login, githubId: ghUser.id })],
    );
  }

  async syncUserActivity(userId: string, orgId: string): Promise<{ synced: number }> {
    const tokenResult = await this.db.query(
      `SELECT i.access_token, i.metadata, o.settings
       FROM integrations i
       JOIN organizations o ON o.id = i.organization_id
       WHERE i.user_id = $1 AND i.type = 'github' AND i.status = 'active'`,
      [userId],
    );

    if (!tokenResult.rows[0]) return { synced: 0 };

    const encKey = this.configService.get<string>('encryption.key')!;
    const token = decrypt(tokenResult.rows[0].access_token, encKey);
    const orgSettings = tokenResult.rows[0].settings || {};
    const workStart = orgSettings.workdayStart ?? 9;
    const workEnd = orgSettings.workdayEnd ?? 18;

    const octokit = new Octokit({ auth: token });
    const events: NormalizedGithubEvent[] = [];
    const cutoff = subDays(new Date(), 7);

    try {
      const { data: ghUser } = await octokit.users.getAuthenticated();
      const eventsResult = await octokit.activity.listEventsForAuthenticatedUser({
        username: ghUser.login,
        per_page: 100,
      });

      for (const event of eventsResult.data) {
        const occurredAt = new Date(event.created_at!);
        if (occurredAt < cutoff) continue;

        const hour = occurredAt.getHours();
        const isAfterHours = hour < workStart || hour >= workEnd;
        const isWeekend = [0, 6].includes(getDay(occurredAt));

        let eventType: NormalizedGithubEvent['eventType'] | null = null;
        let eventAction = event.type || '';

        if (event.type === 'PushEvent') {
          eventType = 'commit_pushed';
        } else if (event.type === 'PullRequestEvent') {
          eventType = 'pr_created';
          eventAction = (event.payload as any)?.action || 'opened';
        } else if (event.type === 'PullRequestReviewEvent') {
          eventType = 'pr_reviewed';
        } else if (event.type === 'IssueCommentEvent' || event.type === 'PullRequestReviewCommentEvent') {
          eventType = 'issue_commented';
        }

        if (!eventType) continue;

        events.push({
          userId,
          organizationId: orgId,
          source: 'github',
          eventType,
          occurredAt,
          isAfterHours,
          isWeekend,
          metadata: {
            repoId: (event.repo as any)?.id || 0, // repo ID only, no name
            eventAction,
            isPrReview: event.type === 'PullRequestReviewEvent',
          },
        });
      }
    } catch (err) {
      this.logger.error(`GitHub sync error for user ${userId}: ${err.message}`);
      await this.db.query(
        `UPDATE integrations SET status = 'error', error_message = $1 WHERE user_id = $2 AND type = 'github'`,
        [err.message, userId],
      );
      return { synced: 0 };
    }

    if (events.length === 0) {
      await this.db.query(
        `UPDATE integrations SET last_synced_at = NOW() WHERE user_id = $1 AND type = 'github'`,
        [userId],
      );
      return { synced: 0 };
    }

    // Delete and re-insert
    await this.db.query(
      `DELETE FROM raw_activity_logs WHERE user_id = $1 AND source = 'github' AND occurred_at >= $2`,
      [userId, cutoff],
    );

    const values = events.map((_, i) => {
      const b = i * 9;
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`;
    }).join(',');

    const params: any[] = [];
    for (const e of events) {
      params.push(e.organizationId, e.userId, e.source, e.eventType, e.occurredAt, e.isAfterHours, e.isWeekend, false, JSON.stringify(e.metadata));
    }

    await this.db.query(
      `INSERT INTO raw_activity_logs (organization_id, user_id, source, event_type, occurred_at, is_after_hours, is_weekend, is_recurring, metadata)
       VALUES ${values} ON CONFLICT DO NOTHING`,
      params,
    );

    await this.db.query(
      `UPDATE integrations SET last_synced_at = NOW(), status = 'active' WHERE user_id = $1 AND type = 'github'`,
      [userId],
    );

    return { synced: events.length };
  }
}
