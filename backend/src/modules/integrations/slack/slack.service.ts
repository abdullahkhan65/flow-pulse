import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DATABASE_POOL } from '../../../database/database.module';
import { encrypt, decrypt } from '../../../common/utils/encryption';
import { getHours, getDay, fromUnixTime } from 'date-fns';

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  constructor(
    @Inject(DATABASE_POOL) private db: Pool,
    private configService: ConfigService,
  ) {}

  getOAuthUrl(state: string): string {
    const clientId = this.configService.get('slack.clientId');
    const callbackUrl = encodeURIComponent(this.configService.get('slack.callbackUrl'));
    const scopes = [
      'users:read',
      'users:read.email',
      'channels:history',
      'channels:read',
      'im:history',
      'mpim:history',
      'groups:history',
    ].join(',');

    return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${callbackUrl}&state=${state}`;
  }

  async handleCallback(code: string, userId: string, orgId: string) {
    const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: this.configService.get('slack.clientId'),
        client_secret: this.configService.get('slack.clientSecret'),
        code,
        redirect_uri: this.configService.get('slack.callbackUrl'),
      },
    });

    const data = response.data;
    if (!data.ok) throw new Error(`Slack OAuth error: ${data.error}`);

    const encKey = this.configService.get<string>('encryption.key');
    const encToken = encrypt(data.access_token, encKey);

    await this.db.query(
      `INSERT INTO integrations (organization_id, user_id, type, access_token, status, metadata)
       VALUES ($1, $2, 'slack', $3, 'active', $4)
       ON CONFLICT (user_id, type) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         status = 'active',
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [
        orgId,
        userId,
        encToken,
        JSON.stringify({
          teamId: data.team?.id,
          teamName: data.team?.name,
          slackUserId: data.authed_user?.id,
          botToken: data.access_token,
        }),
      ],
    );

    // Store slack_id on user
    if (data.authed_user?.id) {
      await this.db.query(
        `UPDATE users SET slack_id = $1 WHERE id = $2`,
        [data.authed_user.id, userId],
      );
    }

    return { connected: true, team: data.team?.name };
  }

  private isAfterHours(date: Date, workdayStart = 9, workdayEnd = 18): boolean {
    const hour = getHours(date);
    return hour < workdayStart || hour >= workdayEnd;
  }

  private isWeekend(date: Date): boolean {
    const day = getDay(date);
    return day === 0 || day === 6;
  }

  async syncUserMessages(userId: string, orgId: string) {
    const result = await this.db.query(
      `SELECT access_token, metadata FROM integrations
       WHERE user_id = $1 AND type = 'slack' AND status = 'active'`,
      [userId],
    );
    if (!result.rows[0]) return { synced: 0 };

    const encKey = this.configService.get<string>('encryption.key');
    const token = decrypt(result.rows[0].access_token, encKey);
    const metadata = result.rows[0].metadata;
    const slackUserId = metadata?.slackUserId;

    const orgResult = await this.db.query(
      `SELECT settings FROM organizations WHERE id = $1`,
      [orgId],
    );
    const orgSettings = orgResult.rows[0]?.settings || {};
    const workdayStart = parseInt(orgSettings?.workdayStart?.split(':')[0] || '9');
    const workdayEnd = parseInt(orgSettings?.workdayEnd?.split(':')[0] || '18');

    // Fetch user's conversations
    const channelsResponse = await axios.get('https://slack.com/api/conversations.list', {
      headers: { Authorization: `Bearer ${token}` },
      params: { types: 'public_channel,private_channel', limit: 100 },
    });

    if (!channelsResponse.data.ok) {
      this.logger.warn(`Slack API error for user ${userId}: ${channelsResponse.data.error}`);
      return { synced: 0 };
    }

    const channels = channelsResponse.data.channels || [];
    const oldest = (Date.now() / 1000 - 7 * 24 * 3600).toString();

    let totalMessages = 0;
    const logs = [];

    for (const channel of channels.slice(0, 20)) { // Limit to 20 channels
      try {
        const historyResponse = await axios.get('https://slack.com/api/conversations.history', {
          headers: { Authorization: `Bearer ${token}` },
          params: { channel: channel.id, oldest, limit: 200 },
        });

        if (!historyResponse.data.ok) continue;

        const messages = historyResponse.data.messages || [];

        // Only count messages sent BY this user — no content stored
        const userMessages = messages.filter(
          (m: any) => m.user === slackUserId && m.type === 'message' && !m.bot_id,
        );

        for (const msg of userMessages) {
          const msgDate = fromUnixTime(parseFloat(msg.ts));
          logs.push({
            organizationId: orgId,
            userId,
            source: 'slack',
            eventType: 'slack_message',
            occurredAt: msgDate,
            isAfterHours: this.isAfterHours(msgDate, workdayStart, workdayEnd),
            isWeekend: this.isWeekend(msgDate),
            metadata: {
              channelId: channel.id,  // No channel name for privacy
              isThread: !!msg.thread_ts,
            },
          });
          totalMessages++;
        }

        // Rate limit: 1 req/sec for conversations.history (Tier 3)
        await new Promise((r) => setTimeout(r, 1100));
      } catch (err) {
        this.logger.warn(`Failed to fetch Slack history for channel ${channel.id}: ${err.message}`);
      }
    }

    if (logs.length > 0) {
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `DELETE FROM raw_activity_logs
           WHERE user_id = $1 AND source = 'slack' AND occurred_at >= NOW() - INTERVAL '7 days'`,
          [userId],
        );

        for (const log of logs) {
          await client.query(
            `INSERT INTO raw_activity_logs
               (organization_id, user_id, source, event_type, occurred_at, is_after_hours, is_weekend, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              log.organizationId, log.userId, log.source, log.eventType,
              log.occurredAt, log.isAfterHours, log.isWeekend, JSON.stringify(log.metadata),
            ],
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

    await this.db.query(
      `UPDATE integrations SET last_synced_at = NOW() WHERE user_id = $1 AND type = 'slack'`,
      [userId],
    );

    this.logger.log(`Synced ${totalMessages} Slack messages for user ${userId}`);
    return { synced: totalMessages };
  }
}
