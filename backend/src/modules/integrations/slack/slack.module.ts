import { Module } from "@nestjs/common";
import { SlackService } from "./slack.service";
import { SlackController } from "./slack.controller";

@Module({
  controllers: [SlackController],
  providers: [SlackService],
  exports: [SlackService],
})
export class SlackModule {}
