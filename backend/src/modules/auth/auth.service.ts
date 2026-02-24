import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../../database/database.module';
import { encrypt } from '../../common/utils/encryption';
import { ConfigService } from '@nestjs/config';

interface GoogleUserPayload {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_POOL) private db: Pool,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async findOrCreateGoogleUser(payload: GoogleUserPayload): Promise<{ user: any; isNew: boolean }> {
    const encKey = this.configService.get<string>('encryption.key')!;

    // Check if user already exists
    const existing = await this.db.query(
      `SELECT u.*, o.slug as org_slug
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE u.google_id = $1 OR u.email = $2
       LIMIT 1`,
      [payload.googleId, payload.email],
    );

    if (existing.rows.length > 0) {
      const user = existing.rows[0];

      // Update tokens and profile — also activate invited users (is_active was false)
      await this.db.query(
        `UPDATE users SET google_id = $1, name = $2, avatar_url = $3, last_login_at = NOW(), is_active = true WHERE id = $4`,
        [payload.googleId, payload.name, payload.avatarUrl, user.id],
      );

      // Update Google Calendar integration tokens
      if (payload.accessToken) {
        const encAccessToken = encrypt(payload.accessToken, encKey);
        const encRefreshToken = payload.refreshToken
          ? encrypt(payload.refreshToken, encKey)
          : null;

        await this.db.query(
          `INSERT INTO integrations (organization_id, user_id, type, access_token, refresh_token, status)
           VALUES ($1, $2, 'google_calendar', $3, $4, 'active')
           ON CONFLICT (user_id, type) DO UPDATE SET
             access_token = EXCLUDED.access_token,
             refresh_token = COALESCE(EXCLUDED.refresh_token, integrations.refresh_token),
             status = 'active',
             updated_at = NOW()`,
          [user.organization_id, user.id, encAccessToken, encRefreshToken],
        );
      }

      return { user, isNew: false };
    }

    // New user — create org + user
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Generate org slug from email domain
      const emailDomain = payload.email.split('@')[1];
      const baseSlug = emailDomain.replace(/\./g, '-').replace(/[^a-z0-9-]/g, '');
      const slug = `${baseSlug}-${Date.now().toString(36)}`;

      const orgResult = await client.query(
        `INSERT INTO organizations (name, slug, trial_ends_at, seat_limit)
         VALUES ($1, $2, NOW() + INTERVAL '30 days', 4)
         RETURNING *`,
        [emailDomain, slug],
      );
      const org = orgResult.rows[0];

      // Initialize billing subscription (trialing)
      await client.query(
        `INSERT INTO billing_subscriptions (organization_id, status, seats, current_period_end)
         VALUES ($1, 'trialing', 4, NOW() + INTERVAL '30 days')`,
        [org.id],
      );

      const userResult = await client.query(
        `INSERT INTO users (organization_id, email, name, avatar_url, google_id, role)
         VALUES ($1, $2, $3, $4, $5, 'owner')
         RETURNING *`,
        [org.id, payload.email, payload.name, payload.avatarUrl, payload.googleId],
      );
      const user = userResult.rows[0];

      // Create notification preferences
      await client.query(
        `INSERT INTO notification_preferences (user_id) VALUES ($1)`,
        [user.id],
      );

      // Store Google Calendar integration
      if (payload.accessToken) {
        const encAccessToken = encrypt(payload.accessToken, encKey);
        const encRefreshToken = payload.refreshToken
          ? encrypt(payload.refreshToken, encKey)
          : null;

        await client.query(
          `INSERT INTO integrations (organization_id, user_id, type, access_token, refresh_token, status)
           VALUES ($1, $2, 'google_calendar', $3, $4, 'active')`,
          [org.id, user.id, encAccessToken, encRefreshToken],
        );
      }

      await client.query('COMMIT');
      return { user: { ...user, org_slug: org.slug }, isNew: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  generateJwt(user: any): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      organizationId: user.organization_id,
      role: user.role,
    });
  }

  async getMe(userId: string) {
    const result = await this.db.query(
      `SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.timezone, u.data_collection_consent,
              o.id as organization_id, o.name as organization_name, o.slug as organization_slug, o.plan
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = $1 AND u.is_active = true`,
      [userId],
    );
    return result.rows[0] || null;
  }
}
