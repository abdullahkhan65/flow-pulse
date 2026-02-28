import {
  Controller, Get, Post, Query, Param, UseGuards, Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // ─── Sync Now: triggered on first login / manual refresh ──────────────────

  @Post('sync-now')
  @ApiOperation({
    summary: 'Trigger immediate sync + build aggregates. Returns preview data. Safe to call repeatedly.',
  })
  syncNow(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.syncNow(user.sub, user.organizationId);
  }

  // ─── Preview: partial scores without needing 7 full days ──────────────────

  @Get('preview')
  @ApiOperation({
    summary: 'Get partial week scores + today snapshot. Works from day 1 after first sync.',
  })
  getPreview(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getPreview(user.sub, user.organizationId);
  }

  // ─── Team Dashboard ────────────────────────────────────────────────────────

  @Get('team')
  @Roles('manager')
  @ApiOperation({ summary: 'Get team dashboard (4-week view + current week in progress)' })
  getTeamDashboard(
    @CurrentUser() user: JwtPayload,
    @Query('weeks') weeks?: string,
  ) {
    return this.dashboardService.getTeamDashboard(
      user.organizationId,
      parseInt(weeks || '4'),
    );
  }

  @Get('team/members')
  @Roles('manager')
  @ApiOperation({ summary: 'Get all team members with latest scores (no ranking)' })
  getTeamMembers(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getTeamMembersOverview(user.organizationId);
  }

  @Post('team/sync-now')
  @Roles('manager')
  @ApiOperation({ summary: 'Trigger immediate sync for all active org members. Returns counts of succeeded/failed.' })
  syncTeamNow(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.syncTeamNow(user.organizationId);
  }

  @Post('members/:userId/sync-now')
  @Roles('manager')
  @ApiOperation({ summary: 'Trigger immediate sync for a single team member.' })
  syncMemberNow(
    @CurrentUser() user: JwtPayload,
    @Param('userId') userId: string,
  ) {
    return this.dashboardService.syncMemberNow(user.organizationId, userId);
  }

  @Get('team/calendar')
  @Roles('manager')
  @ApiOperation({ summary: 'Get team busyness heatmap for a 7-day window' })
  getTeamCalendar(
    @CurrentUser() user: JwtPayload,
    @Query('start') start?: string,
  ) {
    const startDate = start || new Date().toISOString().split('T')[0];
    return this.dashboardService.getTeamCalendar(user.organizationId, startDate);
  }

  @Get('team/export')
  @Roles('admin')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="flowpulse-team-export.csv"')
  @ApiOperation({ summary: 'Export team scores as CSV' })
  exportCsv(
    @CurrentUser() user: JwtPayload,
    @Query('weeks') weeks?: string,
  ) {
    return this.dashboardService.exportTeamCsv(
      user.organizationId,
      parseInt(weeks || '12'),
    );
  }

  // ─── Member Scores ─────────────────────────────────────────────────────────

  @Get('members/:userId')
  @Roles('manager')
  @ApiOperation({ summary: 'Get individual member scores (managers only)' })
  getMemberScores(
    @CurrentUser() user: JwtPayload,
    @Param('userId') userId: string,
    @Query('weeks') weeks?: string,
  ) {
    return this.dashboardService.getMemberScores(
      user.organizationId,
      userId,
      parseInt(weeks || '8'),
    );
  }

  @Get('me/scores')
  @ApiOperation({ summary: 'Get my completed weekly scores' })
  getMyScores(@CurrentUser() user: JwtPayload, @Query('weeks') weeks?: string) {
    return this.dashboardService.getMemberScores(
      user.organizationId,
      user.sub,
      parseInt(weeks || '8'),
    );
  }

  @Get('me/jira-tickets')
  @ApiOperation({ summary: 'Get tickets completed this week + currently in-progress from Jira. Titles fetched live, never stored.' })
  getJiraTickets(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getJiraTicketSummary(user.sub);
  }

  @Get('integrations')
  @ApiOperation({ summary: 'Get my integration connection status' })
  getIntegrationStatus(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getIntegrationStatus(user.sub);
  }
}
