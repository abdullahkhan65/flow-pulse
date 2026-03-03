import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import configuration from "./config/configuration";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { UsersModule } from "./modules/users/users.module";
import { GoogleCalendarModule } from "./modules/integrations/google-calendar/google-calendar.module";
import { SlackModule } from "./modules/integrations/slack/slack.module";
import { JiraModule } from "./modules/integrations/jira/jira.module";
import { GmailModule } from "./modules/integrations/gmail/gmail.module";
import { GithubModule } from "./modules/integrations/github/github.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { BillingModule } from "./modules/billing/billing.module";
import { BlogModule } from "./modules/blog/blog.module";
import { AdminModule } from "./modules/admin/admin.module";

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [".env", ".env.local"],
    }),

    // Rate limiting: 100 requests per minute per IP
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Database
    DatabaseModule,

    // Feature modules
    AuthModule,
    OrganizationsModule,
    UsersModule,
    GoogleCalendarModule,
    SlackModule,
    JiraModule,
    GmailModule,
    GithubModule,
    AnalyticsModule,
    JobsModule,
    DashboardModule,
    NotificationsModule,
    BillingModule,
    BlogModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
