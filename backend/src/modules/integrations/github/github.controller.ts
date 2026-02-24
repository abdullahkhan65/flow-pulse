import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
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
  connect() {
    return { url: this.githubService.getOAuthUrl() };
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

    const [userId, orgId] = state.split(':');
    if (!userId || !orgId) {
      return res.redirect(`${frontendUrl}/dashboard/settings?github=error`);
    }

    try {
      await this.githubService.handleCallback(userId, orgId, code);
      res.redirect(`${frontendUrl}/dashboard/settings?github=connected`);
    } catch (err) {
      res.redirect(`${frontendUrl}/dashboard/settings?github=error`);
    }
  }
}
