import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { DATABASE_POOL } from '../../../database/database.module';
import { decrypt } from '../../../common/utils/encryption';
import { subDays } from 'date-fns';

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
              o.settings,
              u.timezone AS user_timezone
       FROM integrations i
       JOIN organizations o ON o.id = i.organization_id
       JOIN users u ON u.id = i.user_id
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
      userTimezone: row.user_timezone || row.settings?.timezone || 'UTC',
    };
  }

  private parseWorkHour(value: string | number | undefined, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(23, value));
    if (typeof value === 'string') {
      const parsed = parseInt(value.split(':')[0], 10);
      if (Number.isFinite(parsed)) return Math.max(0, Math.min(23, parsed));
    }
    return fallback;
  }

  private getHourAndWeekdayInTimezone(date: Date, timeZone: string): { hour: number; weekday: number } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    const parts = formatter.formatToParts(date);
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const weekdayStr = parts.find((p) => p.type === 'weekday')?.value || 'Mon';
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { hour, weekday: weekdayMap[weekdayStr] ?? 1 };
  }

  private isAfterWorkHours(date: Date, settings: any, userTimezone: string): boolean {
    const { hour } = this.getHourAndWeekdayInTimezone(date, userTimezone);
    const workStart = this.parseWorkHour(settings?.workdayStart, 9);
    const workEnd = this.parseWorkHour(settings?.workdayEnd, 18);
    return hour < workStart || hour >= workEnd;
  }

  async syncUserEmails(userId: string, orgId: string): Promise<{ synced: number }> {
    const tokens = await this.getTokensForUser(userId);
    if (!tokens) {
      this.logger.debug(`No Google tokens for user ${userId} — skipping Gmail sync`);
      return { synced: 0 };
    }
    const userTimezone = tokens.userTimezone || 'UTC';

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
    // gmail.metadata scope does NOT support the 'q' search parameter.
    // Use labelIds to filter by mailbox, then discard messages older than 7 days by internalDate.
    const sevenDaysAgoMs = subDays(new Date(), 7).getTime();
    const events: NormalizedEmailEvent[] = [];

    // Fetch message details in parallel batches of 10 to avoid sequential N+1 API calls
    const fetchInBatches = async <T>(
      ids: string[],
      fn: (id: string) => Promise<T>,
    ): Promise<T[]> => {
      const BATCH = 10;
      const results: T[] = [];
      for (let i = 0; i < ids.length; i += BATCH) {
        results.push(...await Promise.all(ids.slice(i, i + BATCH).map(fn)));
      }
      return results;
    };

    // Fetch SENT emails (labelIds replaces q= which is unsupported with metadata scope)
    try {
      const sentRes = await gmail.users.messages.list({
        userId: 'me',
        labelIds: ['SENT'],
        maxResults: 200,
      });

      const sentIds = (sentRes.data.messages || []).map((m) => m.id!);
      const sentDetails = await fetchInBatches(sentIds, (id) =>
        gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['To', 'Cc'],
        }),
      );

      for (const detail of sentDetails) {
        const internalDate = detail.data.internalDate || '0';
        const occurredAt = new Date(parseInt(internalDate));
        // Skip messages older than 7 days (can't filter by date via q with metadata scope)
        if (occurredAt.getTime() < sevenDaysAgoMs) continue;

        const headers = detail.data.payload?.headers || [];
        const toHeader = headers.find((h) => h.name === 'To')?.value || '';
        const ccHeader = headers.find((h) => h.name === 'Cc')?.value || '';
        const recipientCount = toHeader.split(',').length + (ccHeader ? ccHeader.split(',').length : 0);

        const { weekday } = this.getHourAndWeekdayInTimezone(occurredAt, userTimezone);
        events.push({
          userId,
          organizationId: orgId,
          source: 'gmail',
          eventType: 'email_sent',
          occurredAt,
          isAfterHours: this.isAfterWorkHours(occurredAt, tokens.orgSettings, userTimezone),
          isWeekend: [0, 6].includes(weekday),
          metadata: {
            recipientCount: Math.min(recipientCount, 50),
            hasAttachment: false,
            isThread: !!detail.data.threadId,
            threadId: detail.data.threadId || '',
            internalDate,
          },
        });
      }
    } catch (err) {
      this.logger.error(`Gmail SENT sync error for ${userId}: ${err.message}`);
    }

    // Fetch INBOX received emails
    try {
      const inboxRes = await gmail.users.messages.list({
        userId: 'me',
        labelIds: ['INBOX'],
        maxResults: 200,
      });

      const inboxIds = (inboxRes.data.messages || []).map((m) => m.id!);
      const inboxDetails = await fetchInBatches(inboxIds, (id) =>
        gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: [],
        }),
      );

      for (const detail of inboxDetails) {
        const internalDate = detail.data.internalDate || '0';
        const occurredAt = new Date(parseInt(internalDate));
        if (occurredAt.getTime() < sevenDaysAgoMs) continue;

        const { weekday } = this.getHourAndWeekdayInTimezone(occurredAt, userTimezone);
        events.push({
          userId,
          organizationId: orgId,
          source: 'gmail',
          eventType: 'email_received',
          occurredAt,
          isAfterHours: this.isAfterWorkHours(occurredAt, tokens.orgSettings, userTimezone),
          isWeekend: [0, 6].includes(weekday),
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
