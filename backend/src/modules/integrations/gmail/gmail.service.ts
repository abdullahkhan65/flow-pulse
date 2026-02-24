import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { DATABASE_POOL } from '../../../database/database.module';
import { decrypt } from '../../../common/utils/encryption';
import { subDays, getHours, getDay, startOfDay, format } from 'date-fns';

interface NormalizedEmailEvent {
  userId: string;
  organizationId: string;
  source: 'gmail';
  eventType: 'email_sent' | 'email_received';
  occurredAt: Date;
  isAfterHours: boolean;
  isWeekend: boolean;
  metadata: {
    recipientCount: number;
    hasAttachment: boolean;
    isThread: boolean;
    threadId: string;
    internalDate: string;
  };
}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    @Inject(DATABASE_POOL) private db: Pool,
    private configService: ConfigService,
  ) {}

  private getOAuthClient() {
    return new google.auth.OAuth2(
      this.configService.get('google.clientId'),
      this.configService.get('google.clientSecret'),
      this.configService.get('google.callbackUrl'),
    );
  }

  private async getTokensForUser(userId: string) {
    // Gmail uses the same google_calendar integration tokens
    const result = await this.db.query(
      `SELECT i.access_token, i.refresh_token, i.token_expires_at,
              o.settings
       FROM integrations i
       JOIN organizations o ON o.id = i.organization_id
       WHERE i.user_id = $1 AND i.type = 'google_calendar' AND i.status = 'active'`,
      [userId],
    );
    if (!result.rows[0]) return null;

    const encKey = this.configService.get<string>('encryption.key')!;
    const row = result.rows[0];
    return {
      accessToken: decrypt(row.access_token, encKey),
      refreshToken: row.refresh_token ? decrypt(row.refresh_token, encKey) : null,
      tokenExpiresAt: row.token_expires_at,
      orgSettings: row.settings || {},
    };
  }

  private isAfterWorkHours(date: Date, settings: any): boolean {
    const hour = getHours(date);
    const workStart = settings?.workdayStart ?? 9;
    const workEnd = settings?.workdayEnd ?? 18;
    return hour < workStart || hour >= workEnd;
  }

  async syncUserEmails(userId: string, orgId: string): Promise<{ synced: number }> {
    const tokens = await this.getTokensForUser(userId);
    if (!tokens) {
      this.logger.debug(`No Google tokens for user ${userId} — skipping Gmail sync`);
      return { synced: 0 };
    }

    const auth = this.getOAuthClient();
    auth.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    // Save refreshed tokens back to DB
    auth.on('tokens', async (newTokens) => {
      if (newTokens.access_token) {
        const encKey = this.configService.get<string>('encryption.key')!;
        const { encrypt } = await import('../../../common/utils/encryption');
        const encToken = encrypt(newTokens.access_token, encKey);
        await this.db.query(
          `UPDATE integrations SET access_token = $1, updated_at = NOW()
           WHERE user_id = $2 AND type = 'google_calendar'`,
          [encToken, userId],
        );
      }
    });

    const gmail = google.gmail({ version: 'v1', auth });
    const sevenDaysAgo = Math.floor(subDays(new Date(), 7).getTime() / 1000);
    const events: NormalizedEmailEvent[] = [];

    // Fetch SENT emails
    try {
      const sentRes = await gmail.users.messages.list({
        userId: 'me',
        q: `after:${sevenDaysAgo} in:sent`,
        maxResults: 200,
      });

      const sentMessages = sentRes.data.messages || [];
      for (const msg of sentMessages) {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['To', 'Cc', 'Date', 'Content-Type'],
        });

        const headers = detail.data.payload?.headers || [];
        const toHeader = headers.find((h) => h.name === 'To')?.value || '';
        const ccHeader = headers.find((h) => h.name === 'Cc')?.value || '';
        const recipientCount = (toHeader.split(',').length) + (ccHeader ? ccHeader.split(',').length : 0);
        const hasAttachment = (detail.data.payload?.parts || []).some((p) => p.filename && p.filename.length > 0);
        const internalDate = detail.data.internalDate || '0';
        const occurredAt = new Date(parseInt(internalDate));
        const isWeekend = [0, 6].includes(getDay(occurredAt));

        events.push({
          userId,
          organizationId: orgId,
          source: 'gmail',
          eventType: 'email_sent',
          occurredAt,
          isAfterHours: this.isAfterWorkHours(occurredAt, tokens.orgSettings),
          isWeekend,
          metadata: {
            recipientCount: Math.min(recipientCount, 50), // cap to avoid outliers
            hasAttachment,
            isThread: !!detail.data.threadId,
            threadId: detail.data.threadId || '',
            internalDate,
          },
        });
      }
    } catch (err) {
      this.logger.error(`Gmail SENT sync error for ${userId}: ${err.message}`);
    }

    // Fetch INBOX received emails (not sent by user)
    try {
      const inboxRes = await gmail.users.messages.list({
        userId: 'me',
        q: `after:${sevenDaysAgo} in:inbox -in:sent`,
        maxResults: 200,
      });

      const inboxMessages = inboxRes.data.messages || [];
      for (const msg of inboxMessages) {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['Date'],
        });

        const internalDate = detail.data.internalDate || '0';
        const occurredAt = new Date(parseInt(internalDate));
        const isWeekend = [0, 6].includes(getDay(occurredAt));

        events.push({
          userId,
          organizationId: orgId,
          source: 'gmail',
          eventType: 'email_received',
          occurredAt,
          isAfterHours: this.isAfterWorkHours(occurredAt, tokens.orgSettings),
          isWeekend,
          metadata: {
            recipientCount: 0,
            hasAttachment: false,
            isThread: !!detail.data.threadId,
            threadId: detail.data.threadId || '',
            internalDate,
          },
        });
      }
    } catch (err) {
      this.logger.error(`Gmail INBOX sync error for ${userId}: ${err.message}`);
    }

    if (events.length === 0) return { synced: 0 };

    // Delete existing Gmail logs for last 7 days and re-insert
    const cutoff = subDays(new Date(), 7);
    await this.db.query(
      `DELETE FROM raw_activity_logs
       WHERE user_id = $1 AND source = 'gmail' AND occurred_at >= $2`,
      [userId, cutoff],
    );

    // Bulk insert
    const values = events.map((e, i) => {
      const base = i * 9;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
    });

    const params: any[] = [];
    for (const e of events) {
      params.push(
        e.organizationId, e.userId, e.source, e.eventType, e.occurredAt,
        e.isAfterHours, e.isWeekend, false, JSON.stringify(e.metadata),
      );
    }

    await this.db.query(
      `INSERT INTO raw_activity_logs
         (organization_id, user_id, source, event_type, occurred_at,
          is_after_hours, is_weekend, is_recurring, metadata)
       VALUES ${values.join(', ')}
       ON CONFLICT DO NOTHING`,
      params,
    );

    await this.db.query(
      `UPDATE integrations SET last_synced_at = NOW(), status = 'active'
       WHERE user_id = $1 AND type = 'google_calendar'`,
      [userId],
    );

    return { synced: events.length };
  }
}
