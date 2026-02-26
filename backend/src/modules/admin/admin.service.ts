import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../../database/database.module';
import { UpsertBlogPostDto } from './dto/upsert-blog-post.dto';

@Injectable()
export class AdminService {
  constructor(@Inject(DATABASE_POOL) private db: Pool) {}

  private slugify(input: string) {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 180);
  }

  private async generateUniqueSlug(title: string, existingId?: string) {
    const base = this.slugify(title) || 'article';
    let slug = base;
    let i = 1;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const result = await this.db.query(
        `SELECT id FROM blog_posts WHERE slug = $1 ${existingId ? 'AND id <> $2' : ''}`,
        existingId ? [slug, existingId] : [slug],
      );

      if (!result.rows[0]) return slug;
      i += 1;
      slug = `${base}-${i}`;
    }
  }

  async getOverview() {
    const [orgs, users, integrations, posts, latestUsers, latestPosts] = await Promise.all([
      this.db.query(`SELECT COUNT(*)::int AS count FROM organizations WHERE is_active = true`),
      this.db.query(`SELECT COUNT(*)::int AS count FROM users WHERE is_active = true`),
      this.db.query(
        `SELECT COUNT(*)::int AS connected FROM integrations WHERE status = 'active'`,
      ),
      this.db.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'published')::int AS published,
           COUNT(*) FILTER (WHERE status = 'draft')::int AS draft
         FROM blog_posts`,
      ),
      this.db.query(
        `SELECT u.id, u.name, u.email, u.role, u.created_at, o.name AS organization_name
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
         ORDER BY u.created_at DESC
         LIMIT 8`,
      ),
      this.db.query(
        `SELECT id, slug, title, status, author_name, company_name, published_at, created_at
         FROM blog_posts
         ORDER BY created_at DESC
         LIMIT 8`,
      ),
    ]);

    return {
      totals: {
        organizations: orgs.rows[0]?.count || 0,
        users: users.rows[0]?.count || 0,
        connectedIntegrations: integrations.rows[0]?.connected || 0,
        blogPosts: posts.rows[0] || { total: 0, published: 0, draft: 0 },
      },
      latestUsers: latestUsers.rows,
      latestBlogPosts: latestPosts.rows,
    };
  }

  async listBlogPosts() {
    const result = await this.db.query(
      `SELECT id, slug, title, summary, content, author_name, company_name, resource_url,
              cover_image_url, tags, status, published_at, created_at, updated_at
       FROM blog_posts
       ORDER BY created_at DESC`,
    );
    return result.rows;
  }

  async createBlogPost(actorId: string, dto: UpsertBlogPostDto) {
    const slug = await this.generateUniqueSlug(dto.title);
    const status = dto.status || 'draft';

    const result = await this.db.query(
      `INSERT INTO blog_posts (
         slug, title, summary, content, author_name, company_name, resource_url,
         cover_image_url, tags, status, published_at, created_by, updated_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9::text[], $10::text,
         CASE WHEN $10::text = 'published'::text THEN NOW() ELSE NULL::timestamptz END,
         $11, $11
       )
       RETURNING *`,
      [
        slug,
        dto.title,
        dto.summary,
        dto.content,
        dto.authorName,
        dto.companyName || null,
        dto.resourceUrl || null,
        dto.coverImageUrl || null,
        dto.tags || [],
        status,
        actorId,
      ],
    );

    return result.rows[0];
  }

  async updateBlogPost(id: string, actorId: string, dto: UpsertBlogPostDto) {
    const existing = await this.db.query(`SELECT id FROM blog_posts WHERE id = $1`, [id]);
    if (!existing.rows[0]) throw new NotFoundException('Blog post not found');

    const slug = await this.generateUniqueSlug(dto.title, id);
    const status = dto.status || 'draft';

    const result = await this.db.query(
      `UPDATE blog_posts
       SET slug = $1,
           title = $2,
           summary = $3,
           content = $4,
           author_name = $5,
           company_name = $6,
           resource_url = $7,
           cover_image_url = $8,
           tags = $9::text[],
           status = $10::text,
           published_at = CASE
             WHEN $10::text = 'published'::text AND published_at IS NULL THEN NOW()
             WHEN $10::text = 'draft'::text THEN NULL::timestamptz
             ELSE published_at
           END,
           updated_by = $11,
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        slug,
        dto.title,
        dto.summary,
        dto.content,
        dto.authorName,
        dto.companyName || null,
        dto.resourceUrl || null,
        dto.coverImageUrl || null,
        dto.tags || [],
        status,
        actorId,
        id,
      ],
    );

    return result.rows[0];
  }

  async deleteBlogPost(id: string) {
    const result = await this.db.query(
      `DELETE FROM blog_posts WHERE id = $1 RETURNING id`,
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException('Blog post not found');
    return { deleted: true };
  }
}
