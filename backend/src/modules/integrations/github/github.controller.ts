import { BadRequestException, Body, Controller, Get, Patch, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { GithubService } from './github.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

@ApiTags('Integrations')
@Controller('integrations/github')
export class GithubController {
  constructor(
    private githubService: GithubService,
    private configService: ConfigService,
  ) {}

  @Get('connect')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get GitHub OAuth URL' })
  connect(@CurrentUser() user: JwtPayload) {
    return {
      url: this.githubService.getOAuthUrl({
        userId: user.sub,
        orgId: user.organizationId,
      }),
    };
  }

  @Get('callback')
  @ApiOperation({ summary: 'GitHub OAuth callback (internal)' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    // state = userId:orgId (set in frontend before redirect)
    const frontendUrl = this.configService.get<string>('frontendUrl', 'http://localhost:3000');

    if (!state || !code) {
      return res.redirect(`${frontendUrl}/dashboard/settings?github=error`);
    }

    const parsedState = this.githubService.parseAndValidateState(state);
    if (!parsedState) {
      return res.redirect(`${frontendUrl}/dashboard/settings?github=error`);
    }

    try {
      await this.githubService.handleCallback(parsedState.userId, parsedState.orgId, code);
      res.redirect(`${frontendUrl}/dashboard/settings?github=connected`);
    } catch (err) {
      res.redirect(`${frontendUrl}/dashboard/settings?github=error`);
    }
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update GitHub sync settings (time window + repo allowlist)' })
  async updateSettings(
    @CurrentUser() user: JwtPayload,
    @Body() body: { timeWindowDays?: number; repoAllowlist?: string[] },
  ) {
    const timeWindowDays = body?.timeWindowDays ?? 14;
    if (![7, 14, 30].includes(timeWindowDays)) {
      throw new BadRequestException('timeWindowDays must be one of: 7, 14, 30');
    }
    const repoAllowlist = Array.isArray(body?.repoAllowlist)
      ? body.repoAllowlist.map((r) => String(r).trim().toLowerCase()).filter(Boolean)
      : [];

    await this.githubService.updateSyncSettings(user.sub, { timeWindowDays, repoAllowlist });
    return { success: true };
  }

  @Get('debug')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Debug GitHub integration ingestion status for current user' })
  async debug(@CurrentUser() user: JwtPayload) {
    return this.githubService.getDebugStatus(user.sub);
  }
}
