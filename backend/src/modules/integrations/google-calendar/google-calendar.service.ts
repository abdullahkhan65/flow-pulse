import { Injectable, Inject, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { google, calendar_v3 } from 'googleapis';
import { DATABASE_POOL } from '../../../database/database.module';
import { encrypt, decrypt } from '../../../common/utils/encryption';
import { isAfter, isBefore, parseISO, getHours, getDay } from 'date-fns';

interface NormalizedCalendarEvent {
  userId: string;
  organizationId: string;
  source: 'google_calendar';
  eventType: 'meeting' | 'focus_block' | 'all_day_event';
  occurredAt: Date;
  durationSeconds: number;
  participantsCount: number;
  isRecurring: boolean;
  isAfterHours: boolean;
  isWeekend: boolean;
  metadata: {
    hasVideoConferencing: boolean;
    isOrganizer: boolean;
    responseStatus: string;
  };
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

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
    const result = await this.db.query(
      `SELECT access_token, refresh_token, token_expires_at, sync_cursor
       FROM integrations WHERE user_id = $1 AND type = 'google_calendar' AND status = 'active'`,
      [userId],
    );
    if (!result.rows[0]) return null;

    const encKey = this.configService.get<string>('encryption.key');
    const row = result.rows[0];
    return {
      accessToken: decrypt(row.access_token, encKey),
      refreshToken: row.refresh_token ? decrypt(row.refresh_token, encKey) : null,
      expiresAt: row.token_expires_at,
      syncCursor: row.sync_cursor,
    };
  }

  private async saveRefreshedTokens(userId: string, accessToken: string, expiresAt: Date) {
    const encKey = this.configService.get<string>('encryption.key');
    await this.db.query(
      `UPDATE integrations
       SET access_token = $1, token_expires_at = $2, updated_at = NOW()
       WHERE user_id = $3 AND type = 'google_calendar'`,
      [encrypt(accessToken, encKey), expiresAt, userId],
    );
  }

  private isAfterWorkHours(date: Date, workdayStart = 9, workdayEnd = 18): boolean {
    const hour = getHours(date);
    return hour < workdayStart || hour >= workdayEnd;
  }

  private isWeekend(date: Date): boolean {
    const day = getDay(date);
    return day === 0 || day === 6;
  }

  private normalizeEvent(
    event: calendar_v3.Schema$Event,
    userId: string,
    orgId: string,
    orgSettings: any,
  ): NormalizedCalendarEvent | null {
    if (!event.start?.dateTime || !event.end?.dateTime) return null; // Skip all-day events
    if (event.status === 'cancelled') return null;

    // Only include events user accepted or is organizer
    const selfAttendee = event.attendees?.find((a) => a.self);
    const responseStatus = selfAttendee?.responseStatus || 'accepted';
    if (responseStatus === 'declined') return null;

    const startTime = parseISO(event.start.dateTime);
    const endTime = parseISO(event.end.dateTime);
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

    // Filter noise: skip <5 min events
    if (durationSeconds < 300) return null;

    const participantsCount = (event.attendees?.length || 1);
    const workdayStart = parseInt(orgSettings?.workdayStart?.split(':')[0] || '9');
    const workdayEnd = parseInt(orgSettings?.workdayEnd?.split(':')[0] || '18');

    return {
      userId,
      organizationId: orgId,
      source: 'google_calendar',
      eventType: participantsCount > 1 ? 'meeting' : 'focus_block',
      occurredAt: startTime,
      durationSeconds,
      participantsCount,
      isRecurring: !!event.recurringEventId,
      isAfterHours: this.isAfterWorkHours(startTime, workdayStart, workdayEnd),
      isWeekend: this.isWeekend(startTime),
      metadata: {
        hasVideoConferencing: !!(event.conferenceData || event.hangoutLink),
        isOrganizer: event.organizer?.self || false,
        responseStatus,
      },
    };
  }

  async syncUserCalendar(userId: string, orgId: string) {
    const tokens = await this.getTokensForUser(userId);
    if (!tokens) {
      this.logger.warn(`No Google Calendar integration for user ${userId}`);
      return { synced: 0 };
    }

    const orgResult = await this.db.query(
      `SELECT settings FROM organizations WHERE id = $1`,
      [orgId],
    );
    const orgSettings = orgResult.rows[0]?.settings || {};

    const auth = this.getOAuthClient();
    auth.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    // Handle token refresh
    auth.on('tokens', async (newTokens) => {
      if (newTokens.access_token) {
        const expiresAt = newTokens.expiry_date
          ? new Date(newTokens.expiry_date)
          : new Date(Date.now() + 3600 * 1000);
        await this.saveRefreshedTokens(userId, newTokens.access_token, expiresAt);
        this.logger.log(`Refreshed tokens for user ${userId}`);
      }
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Sync last 7 days
    const timeMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date().toISOString();

    let pageToken: string | undefined;
    const events: NormalizedCalendarEvent[] = [];

    do {
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
        pageToken,
        fields: 'items(id,start,end,attendees,status,recurringEventId,conferenceData,hangoutLink,organizer),nextPageToken',
      });

      const items = response.data.items || [];
      for (const event of items) {
        const normalized = this.normalizeEvent(event, userId, orgId, orgSettings);
        if (normalized) events.push(normalized);
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    // Bulk insert, skip duplicates by using occurred_at + user_id + source as natural key
    if (events.length > 0) {
      const client = await this.db.connect();
      try {
        await client.query('BEGIN');

        // Delete existing logs for this period (re-sync strategy)
        await client.query(
          `DELETE FROM raw_activity_logs
           WHERE user_id = $1 AND source = 'google_calendar' AND occurred_at >= $2`,
          [userId, timeMin],
        );

        for (const evt of events) {
          await client.query(
            `INSERT INTO raw_activity_logs
               (organization_id, user_id, source, event_type, occurred_at, duration_seconds,
                participants_count, is_recurring, is_after_hours, is_weekend, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              evt.organizationId, evt.userId, evt.source, evt.eventType,
              evt.occurredAt, evt.durationSeconds, evt.participantsCount,
              evt.isRecurring, evt.isAfterHours, evt.isWeekend,
              JSON.stringify(evt.metadata),
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

    // Update last synced timestamp
    await this.db.query(
      `UPDATE integrations SET last_synced_at = NOW(), status = 'active' WHERE user_id = $1 AND type = 'google_calendar'`,
      [userId],
    );

    this.logger.log(`Synced ${events.length} calendar events for user ${userId}`);
    return { synced: events.length };
  }
}
