import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";

@ApiTags("Users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @ApiOperation({ summary: "Get my profile" })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.findById(user.sub);
  }

  @Patch("me/profile")
  @ApiOperation({ summary: "Update my profile (name, timezone)" })
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name?: string; timezone?: string },
  ) {
    return this.usersService.updateProfile(user.sub, body);
  }

  @Patch("me/consent")
  @ApiOperation({
    summary: "Update data collection consent — revoke to delete all your data",
  })
  updateConsent(
    @CurrentUser() user: JwtPayload,
    @Body() body: { consent: boolean },
  ) {
    return this.usersService.updateConsent(user.sub, body.consent);
  }

  @Get("me/data")
  @ApiOperation({ summary: "Export my stored data (privacy transparency)" })
  getMyData(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMyData(user.sub);
  }

  @Delete("me/data")
  @ApiOperation({
    summary: "Delete all my collected data (GDPR right to erasure)",
  })
  deleteMyData(@CurrentUser() user: JwtPayload) {
    return this.usersService.deleteMyData(user.sub);
  }

  @Patch("me/notifications")
  @ApiOperation({ summary: "Update notification preferences" })
  updateNotifications(@CurrentUser() user: JwtPayload, @Body() body: any) {
    return this.usersService.updateNotificationPreferences(user.sub, body);
  }
}
