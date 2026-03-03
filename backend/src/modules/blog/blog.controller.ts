import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { BlogService } from "./blog.service";

@ApiTags("Blog")
@Controller("blog")
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get("posts")
  @ApiOperation({ summary: "List published blog posts" })
  listPublicPosts(@Query("limit") limit?: string) {
    const parsed = Math.min(Math.max(parseInt(limit || "20", 10), 1), 100);
    return this.blogService.getPublicPosts(parsed);
  }

  @Get("posts/:slug")
  @ApiOperation({ summary: "Get one published post by slug" })
  getPublicPost(@Param("slug") slug: string) {
    return this.blogService.getPublicPostBySlug(slug);
  }
}
