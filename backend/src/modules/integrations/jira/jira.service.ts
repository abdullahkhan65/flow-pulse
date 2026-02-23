import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DATABASE_POOL } from '../../../database/database.module';
import { encrypt, decrypt } from '../../../common/utils/encryption';
import { parseISO, getHours, getDay } from 'date-fns';

@Injectable()
export class JiraService {
  private readonly logger = new Logger(JiraService.name);

  constructor(
    @Inject(DATABASE_POOL) private db: Pool,
    private configService: ConfigService,
  ) {}

  getOAuthUrl(state: string): string {
    const clientId = this.configService.get('jira.clientId');
    const callbackUrl = encodeURIComponent(this.configService.get('jira.callbackUrl') ?? '');
    const scopes = encodeURIComponent('read:jira-work read:jira-user');
    return `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${clientId}&scope=${scopes}&redirect_uri=${callbackUrl}&state=${state}&response_type=code&prompt=consent`;
  }

  async handleCallback(code: string, userId: string, orgId: string) {
    const tokenRes = await axios.post('https://auth.atlassian.com/oauth/token', {
      grant_type: 'authorization_code',
      client_id: this.configService.get('jira.clientId'),
      client_secret: this.configService.get('jira.clientSecret'),
      code,
      redirect_uri: this.configService.get('jira.callbackUrl'),
    });

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Get accessible Jira resources
    const resourcesRes = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
    });

    const sites = resourcesRes.data;
    if (!sites.length) throw new Error('No Jira sites found');

    const primarySite = sites[0];
    const encKey = this.configService.get<string>('encryption.key')!;

    await this.db.query(
      `INSERT INTO integrations (organization_id, user_id, type, access_token, refresh_token, token_expires_at, status, metadata)
       VALUES ($1, $2, 'jira', $3, $4, $5, 'active', $6)
       ON CONFLICT (user_id, type) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expires_at = EXCLUDED.token_expires_at,
         status = 'active',
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [
        orgId,
        userId,
        encrypt(access_token, encKey),
        refresh_token ? encrypt(refresh_token, encKey) : null,
        new Date(Date.now() + expires_in * 1000),
        JSON.stringify({ cloudId: primarySite.id, siteUrl: primarySite.url, siteName: primarySite.name }),
      ],
    );

    return { connected: true, site: primarySite.name };
  }

  private isAfterHours(date: Date, workdayStart = 9, workdayEnd = 18): boolean {
    const hour = getHours(date);
    return hour < workdayStart || hour >= workdayEnd;
  }

  private isWeekend(date: Date): boolean {
    const day = getDay(date);
    return day === 0 || day === 6;
  }

  async syncUserActivity(userId: string, orgId: string) {
    const result = await this.db.query(
      `SELECT access_token, refresh_token, metadata FROM integrations
       WHERE user_id = $1 AND type = 'jira' AND status = 'active'`,
      [userId],
    );
    if (!result.rows[0]) return { synced: 0 };

    const encKey = this.configService.get<string>('encryption.key')!;
    const token = decrypt(result.rows[0].access_token, encKey);
    const { cloudId } = result.rows[0].metadata;

    const userResult = await this.db.query(`SELECT jira_account_id FROM users WHERE id = $1`, [userId]);
    let accountId = userResult.rows[0]?.jira_account_id;

    if (!accountId) {
      const meRes = await axios.get(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/myself`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      accountId = meRes.data.accountId;
      await this.db.query(`UPDATE users SET jira_account_id = $1 WHERE id = $2`, [accountId, userId]);
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const jql = `assignee = "${accountId}" AND updated >= "${since.split('T')[0]}" ORDER BY updated DESC`;

    const issuesRes = await axios.get(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        params: {
          jql,
          fields: 'summary,status,priority,updated,created,issuetype,changelog',
          expand: 'changelog',
          maxResults: 100,
        },
      },
    );

    const issues = issuesRes.data.issues || [];
    const logs: any[] = [];

    for (const issue of issues) {
      const changelog = issue.changelog?.histories || [];

      for (const history of changelog) {
        const historyDate = parseISO(history.created);
        const statusChanges = history.items?.filter((item: any) => item.field === 'status') || [];

        if (statusChanges.length > 0) {
          logs.push({
            organizationId: orgId,
            userId,
            source: 'jira',
            eventType: 'jira_transition',
            occurredAt: historyDate,
            isAfterHours: this.isAfterHours(historyDate),
            isWeekend: this.isWeekend(historyDate),
            metadata: {
              issueType: issue.fields.issuetype?.name,
              priority: issue.fields.priority?.name,
              fromStatus: statusChanges[0]?.fromString,
              toStatus: statusChanges[0]?.toString,
              // No issue title/description stored
            },
          });
        }
      }
    }

    if (logs.length > 0) {
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `DELETE FROM raw_activity_logs WHERE user_id = $1 AND source = 'jira' AND occurred_at >= NOW() - INTERVAL '7 days'`,
          [userId],
        );
        for (const log of logs) {
          await client.query(
            `INSERT INTO raw_activity_logs (organization_id, user_id, source, event_type, occurred_at, is_after_hours, is_weekend, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [log.organizationId, log.userId, log.source, log.eventType, log.occurredAt, log.isAfterHours, log.isWeekend, JSON.stringify(log.metadata)],
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    await this.db.query(`UPDATE integrations SET last_synced_at = NOW() WHERE user_id = $1 AND type = 'jira'`, [userId]);
    this.logger.log(`Synced ${logs.length} Jira events for user ${userId}`);
    return { synced: logs.length };
  }
}
