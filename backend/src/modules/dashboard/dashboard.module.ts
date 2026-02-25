import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { GoogleCalendarModule } from '../integrations/google-calendar/google-calendar.module';
import { GmailModule } from '../integrations/gmail/gmail.module';
import { SlackModule } from '../integrations/slack/slack.module';
import { JiraModule } from '../integrations/jira/jira.module';
import { GithubModule } from '../integrations/github/github.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [GoogleCalendarModule, GmailModule, SlackModule, JiraModule, GithubModule, AnalyticsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
