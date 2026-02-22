import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SlackService } from './slack.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../../common/decorators/current-user.decorator';

@ApiTags('Integrations - Slack')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('integrations/slack')
export class SlackController {
  constructor(private readonly slackService: SlackService) {}

  @Get('connect')
  @ApiOperation({ summary: 'Get Slack OAuth URL' })
  connect(@CurrentUser() user: JwtPayload) {
    const state = Buffer.from(JSON.stringify({ userId: user.sub, orgId: user.organizationId })).toString('base64');
    return { url: this.slackService.getOAuthUrl(state) };
  }

  @Get('callback')
  @ApiOperation({ summary: 'Slack OAuth callback' })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: any,
  ) {
    const { userId, orgId } = JSON.parse(Buffer.from(state, 'base64').toString());
    await this.slackService.handleCallback(code, userId, orgId);
    res.redirect(`${process.env.FRONTEND_URL}/settings?slack=connected`);
  }
}
