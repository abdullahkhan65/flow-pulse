import {
  Controller, Get, Patch, Post, Delete,
  Body, Param, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current organization' })
  getMyOrg(@CurrentUser() user: JwtPayload) {
    return this.orgsService.findById(user.organizationId);
  }

  @Patch('me/settings')
  @Roles('admin')
  @ApiOperation({ summary: 'Update organization settings' })
  updateSettings(@CurrentUser() user: JwtPayload, @Body() body: Record<string, any>) {
    return this.orgsService.updateSettings(user.organizationId, body);
  }

  @Get('me/members')
  @Roles('manager')
  @ApiOperation({ summary: 'List organization members with integration status' })
  getMembers(@CurrentUser() user: JwtPayload) {
    return this.orgsService.getMembers(user.organizationId);
  }

  @Post('me/members/invite')
  @Roles('admin')
  @ApiOperation({ summary: 'Invite a new member to the organization' })
  invite(@CurrentUser() user: JwtPayload, @Body() body: { email: string; role?: string }) {
    return this.orgsService.inviteMember(user.organizationId, body.email, body.role);
  }

  @Delete('me/members/:userId')
  @Roles('admin')
  @ApiOperation({ summary: 'Remove a member from the organization' })
  remove(@CurrentUser() user: JwtPayload, @Param('userId') userId: string) {
    return this.orgsService.removeMember(user.organizationId, userId);
  }

  @Patch('me/members/:userId/role')
  @Roles('admin')
  @ApiOperation({ summary: 'Update member role' })
  updateRole(
    @CurrentUser() user: JwtPayload,
    @Param('userId') userId: string,
    @Body() body: { role: string },
  ) {
    return this.orgsService.updateMemberRole(user.organizationId, userId, body.role);
  }
}
