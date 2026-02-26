import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { DATABASE_POOL } from '../../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DATABASE_POOL) private db: Pool,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {}

  async findById(id: string) {
    const result = await this.db.query(
      `SELECT * FROM organizations WHERE id = $1 AND is_active = true`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('Organization not found');
    return result.rows[0];
  }

  async updateSettings(orgId: string, settings: Record<string, any>) {
    const result = await this.db.query(
      `UPDATE organizations
       SET settings = settings || $1::jsonb, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(settings), orgId],
    );
    return result.rows[0];
  }

  async getMembers(orgId: string) {
    const result = await this.db.query(
      `SELECT
         u.id, u.email, u.name, u.avatar_url, u.role, u.timezone,
         u.data_collection_consent, u.is_active, u.last_login_at, u.created_at,
         -- Integration statuses
         COALESCE(
           json_object_agg(i.type, json_build_object('status', i.status, 'last_synced_at', i.last_synced_at))
             FILTER (WHERE i.type IS NOT NULL),
           '{}'::json
         ) as integrations
       FROM users u
       LEFT JOIN integrations i ON i.user_id = u.id
       WHERE u.organization_id = $1
       GROUP BY u.id
       ORDER BY u.created_at ASC`,
      [orgId],
    );
    return result.rows;
  }

  async inviteMember(orgId: string, email: string, role: string = 'member') {
    // Check seat limit before creating user
    const billingRow = await this.db.query(
      `SELECT bs.seats, o.trial_ends_at,
              COUNT(u.id) FILTER (WHERE u.is_active = true) as active_seats
       FROM organizations o
       LEFT JOIN billing_subscriptions bs ON bs.organization_id = o.id
       LEFT JOIN users u ON u.organization_id = o.id
       WHERE o.id = $1
       GROUP BY bs.seats, o.trial_ends_at`,
      [orgId],
    );

    if (billingRow.rows.length > 0) {
      const { seats, trial_ends_at, active_seats } = billingRow.rows[0];
      const seatLimit = seats || 4;
      const isTrialExpired = trial_ends_at && new Date(trial_ends_at) < new Date();

      if (parseInt(active_seats) >= seatLimit) {
        throw new ForbiddenException(
          `Seat limit reached (${seatLimit} seats). Upgrade your plan to add more members.`,
        );
      }
      if (isTrialExpired) {
        throw new ForbiddenException(
          'Trial expired. Please upgrade your plan to invite members.',
        );
      }
    }

    const existing = await this.db.query(
      `SELECT id FROM users WHERE organization_id = $1 AND email = $2`,
      [orgId, email],
    );
    if (existing.rows.length > 0) {
      throw new ForbiddenException('User already in organization');
    }

    const result = await this.db.query(
      `INSERT INTO users (organization_id, email, role, is_active)
       VALUES ($1, $2, $3, false)
       RETURNING id, email, role`,
      [orgId, email, role],
    );

    // Send invite email — fire and forget (non-blocking)
    const org = await this.findById(orgId);
    const frontendUrl = this.configService.get<string>('frontendUrl', 'http://localhost:3000');
    const loginUrl = `${frontendUrl}/login?invited=true`;
    this.notificationsService.sendInviteEmail(email, org.name, loginUrl);

    return result.rows[0];
  }

  async removeMember(orgId: string, userId: string) {
    const result = await this.db.query(
      `DELETE FROM users
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [userId, orgId],
    );
    if (!result.rows[0]) throw new NotFoundException('User not found');
    return { deleted: true };
  }

  async resendInvite(orgId: string, userId: string) {
    const memberResult = await this.db.query(
      `SELECT id, email, is_active FROM users WHERE id = $1 AND organization_id = $2`,
      [userId, orgId],
    );
    const member = memberResult.rows[0];
    if (!member) throw new NotFoundException('User not found');
    if (member.is_active) {
      throw new ForbiddenException('User is already active. Invite resend is only for pending users.');
    }

    const org = await this.findById(orgId);
    const frontendUrl = this.configService.get<string>('frontendUrl', 'http://localhost:3000');
    const loginUrl = `${frontendUrl}/login?invited=true`;
    this.notificationsService.sendInviteEmail(member.email, org.name, loginUrl);

    return { sent: true };
  }

  async updateMemberRole(orgId: string, userId: string, role: string) {
    const result = await this.db.query(
      `UPDATE users SET role = $1 WHERE id = $2 AND organization_id = $3 RETURNING id, email, role`,
      [role, userId, orgId],
    );
    if (!result.rows[0]) throw new NotFoundException('User not found');
    return result.rows[0];
  }
}
