import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { Roles, RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminService } from "./admin.service";
import { UpsertBlogPostDto } from "./dto/upsert-blog-post.dto";

@ApiTags("Admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("overview")
  @ApiOperation({ summary: "Get admin overview metrics for the whole app" })
  getOverview() {
    return this.adminService.getOverview();
  }

  @Get("blog-posts")
  @ApiOperation({ summary: "List all blog posts including drafts" })
  listBlogPosts() {
    return this.adminService.listBlogPosts();
  }

  @Post("blog-posts")
  @ApiOperation({ summary: "Create a blog post" })
  createBlogPost(
    @CurrentUser() user: JwtPayload,
    @Body() body: UpsertBlogPostDto,
  ) {
    return this.adminService.createBlogPost(user.sub, body);
  }

  @Patch("blog-posts/:id")
  @ApiOperation({ summary: "Update a blog post" })
  updateBlogPost(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: UpsertBlogPostDto,
  ) {
    return this.adminService.updateBlogPost(id, user.sub, body);
  }

  @Delete("blog-posts/:id")
  @ApiOperation({ summary: "Delete a blog post" })
  deleteBlogPost(@Param("id") id: string) {
    return this.adminService.deleteBlogPost(id);
  }
}
