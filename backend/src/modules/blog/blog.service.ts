import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Pool } from "pg";
import { DATABASE_POOL } from "../../database/database.module";

@Injectable()
export class BlogService {
  constructor(@Inject(DATABASE_POOL) private db: Pool) {}

  async getPublicPosts(limit = 20) {
    const result = await this.db.query(
      `SELECT id, slug, title, summary, author_name, company_name, resource_url, cover_image_url,
              tags, status, published_at, created_at
       FROM blog_posts
       WHERE status = 'published'
       ORDER BY published_at DESC NULLS LAST, created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  async getPublicPostBySlug(slug: string) {
    const result = await this.db.query(
      `SELECT id, slug, title, summary, content, author_name, company_name, resource_url,
              cover_image_url, tags, status, published_at, created_at
       FROM blog_posts
       WHERE slug = $1 AND status = 'published'`,
      [slug],
    );

    if (!result.rows[0]) throw new NotFoundException("Article not found");
    return result.rows[0];
  }
}
