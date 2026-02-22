import { Module } from '@nestjs/common';
import { JiraService } from './jira.service';
import { JiraController } from './jira.controller';

@Module({
  controllers: [JiraController],
  providers: [JiraService],
  exports: [JiraService],
})
export class JiraModule {}
