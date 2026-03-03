import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JiraService } from "./jira.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import {
  CurrentUser,
  JwtPayload,
} from "../../../common/decorators/current-user.decorator";

@ApiTags("Integrations - Jira")
@Controller("integrations/jira")
export class JiraController {
  constructor(private readonly jiraService: JiraService) {}

  @Get("connect")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get Jira OAuth URL" })
  connect(@CurrentUser() user: JwtPayload) {
    const state = Buffer.from(
      JSON.stringify({ userId: user.sub, orgId: user.organizationId }),
    ).toString("base64");
    return { url: this.jiraService.getOAuthUrl(state) };
  }

  @Get("callback")
  @ApiOperation({ summary: "Jira OAuth callback" })
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: any,
  ) {
    const { userId, orgId } = JSON.parse(
      Buffer.from(state, "base64").toString(),
    );
    await this.jiraService.handleCallback(code, userId, orgId);
    res.redirect(
      `${process.env.FRONTEND_URL}/dashboard/settings?jira=connected`,
    );
  }
}
