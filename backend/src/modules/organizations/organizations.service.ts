import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../../database/database.module';

@Injectable()
export class OrganizationsService {
  constructor(@Inject(DATABASE_POOL) private db: Pool) {}

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
    // In V1 — just create placeholder user. They log in via Google OAuth.
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
    return result.rows[0];
  }

  async removeMember(orgId: string, userId: string) {
    await this.db.query(
      `UPDATE users SET is_active = false WHERE id = $1 AND organization_id = $2`,
      [userId, orgId],
    );
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
