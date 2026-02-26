import {
  Controller,
  Get,
  UseGuards,
  Req,
  Res,
  HttpCode,
  Post,
  Body,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { AdminLoginDto } from './dto/admin-login.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  googleAuth() {
    // Passport redirects automatically
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(@Req() req: any, @Res() res: any) {
    const { user, isNew } = req.user;
    const token = this.authService.generateJwt(user);
    const frontendUrl = this.configService.get<string>('frontendUrl');

    // Redirect to frontend — always via /login so the token is picked up and stored
    const redirectPath = isNew ? `/login?new=true&token=${token}` : `/login?token=${token}`;
    res.redirect(`${frontendUrl}${redirectPath}`);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current authenticated user' })
  async getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }

  @Get('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout (client should discard token)' })
  logout() {
    return { message: 'Logged out successfully' };
  }

  @Post('admin-login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin login with email/password credentials' })
  async adminLogin(@Body() body: AdminLoginDto) {
    const user = await this.authService.loginWithPassword(body.email, body.password);
    const token = this.authService.generateJwt(user);
    const me = await this.authService.getMe(user.id);
    return { token, user: me };
  }
}
