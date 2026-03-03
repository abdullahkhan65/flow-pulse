import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../database/database.module";

@Injectable()
export class UsersService {
  constructor(@Inject(DATABASE_POOL) private db: Pool) {}

  async findById(id: string) {
    const result = await this.db.query(
      `SELECT u.*, o.name as organization_name, o.slug as organization_slug
       FROM users u JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = $1`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException("User not found");
    return result.rows[0];
  }

  async updateProfile(
    userId: string,
    updates: { name?: string; timezone?: string },
  ) {
    const result = await this.db.query(
      `UPDATE users SET
         name = COALESCE($1, name),
         timezone = COALESCE($2, timezone),
         updated_at = NOW()
       WHERE id = $3
       RETURNING id, email, name, timezone, role`,
      [updates.name, updates.timezone, userId],
    );
    return result.rows[0];
  }

  async updateConsent(userId: string, consent: boolean) {
    await this.db.query(
      `UPDATE users SET data_collection_consent = $1, updated_at = NOW() WHERE id = $2`,
      [consent, userId],
    );
    if (!consent) {
      // Privacy: delete all collected data when user revokes consent
      await this.db.query(`DELETE FROM raw_activity_logs WHERE user_id = $1`, [
        userId,
      ]);
      await this.db.query(`DELETE FROM daily_aggregates WHERE user_id = $1`, [
        userId,
      ]);
      await this.db.query(`DELETE FROM weekly_scores WHERE user_id = $1`, [
        userId,
      ]);
    }
    return { consent };
  }

  async getMyData(userId: string) {
    // Privacy: let users see exactly what we store about them
    const [logs, dailyAgg, weeklyScores] = await Promise.all([
      this.db.query(
        `SELECT source, event_type, occurred_at, duration_seconds, participants_count,
                is_after_hours, is_weekend, metadata
         FROM raw_activity_logs WHERE user_id = $1
         ORDER BY occurred_at DESC LIMIT 100`,
        [userId],
      ),
      this.db.query(
        `SELECT date, total_meeting_minutes, meeting_count, focus_time_minutes: solo_focus_minutes,
                slack_messages_sent, after_hours_events, context_switches
         FROM daily_aggregates WHERE user_id = $1
         ORDER BY date DESC LIMIT 30`,
        [userId],
      ),
      this.db.query(
        `SELECT week_start, meeting_load_score, context_switch_score, slack_interrupt_score,
                focus_score, after_hours_score, burnout_risk_score
         FROM weekly_scores WHERE user_id = $1
         ORDER BY week_start DESC LIMIT 12`,
        [userId],
      ),
    ]);

    return {
      activityLogs: logs.rows,
      dailyAggregates: dailyAgg.rows,
      weeklyScores: weeklyScores.rows,
    };
  }

  async deleteMyData(userId: string) {
    // GDPR: full data deletion
    await this.db.query(`DELETE FROM raw_activity_logs WHERE user_id = $1`, [
      userId,
    ]);
    await this.db.query(`DELETE FROM daily_aggregates WHERE user_id = $1`, [
      userId,
    ]);
    await this.db.query(`DELETE FROM weekly_scores WHERE user_id = $1`, [
      userId,
    ]);
    await this.db.query(`DELETE FROM integrations WHERE user_id = $1`, [
      userId,
    ]);
    return { deleted: true };
  }

  async updateNotificationPreferences(userId: string, prefs: any) {
    await this.db.query(
      `INSERT INTO notification_preferences (user_id, weekly_digest_email, burnout_alert_email, slack_weekly_digest, alert_threshold)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         weekly_digest_email = EXCLUDED.weekly_digest_email,
         burnout_alert_email = EXCLUDED.burnout_alert_email,
         slack_weekly_digest = EXCLUDED.slack_weekly_digest,
         alert_threshold = EXCLUDED.alert_threshold,
         updated_at = NOW()`,
      [
        userId,
        prefs.weeklyDigestEmail ?? true,
        prefs.burnoutAlertEmail ?? true,
        prefs.slackWeeklyDigest ?? false,
        prefs.alertThreshold ?? 70,
      ],
    );
    return prefs;
  }
}
