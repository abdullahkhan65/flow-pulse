import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsService } from './jobs.service';
import { GoogleCalendarModule } from '../integrations/google-calendar/google-calendar.module';
import { SlackModule } from '../integrations/slack/slack.module';
import { JiraModule } from '../integrations/jira/jira.module';
import { GmailModule } from '../integrations/gmail/gmail.module';
import { GithubModule } from '../integrations/github/github.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    GoogleCalendarModule,
    SlackModule,
    JiraModule,
    GmailModule,
    GithubModule,
    AnalyticsModule,
    NotificationsModule,
  ],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
