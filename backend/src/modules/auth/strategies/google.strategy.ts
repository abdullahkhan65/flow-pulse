import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get('google.clientId'),
      clientSecret: configService.get('google.clientSecret'),
      callbackURL: configService.get('google.callbackUrl'),
      scope: [
        'email',
        'profile',
        'https://www.googleapis.com/auth/calendar.readonly',
      ],
      accessType: 'offline',
      prompt: 'consent',  // Force refresh token on every login
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, emails, displayName, photos } = profile;
    const email = emails[0].value;

    const { user, isNew } = await this.authService.findOrCreateGoogleUser({
      googleId: id,
      email,
      name: displayName,
      avatarUrl: photos?.[0]?.value,
      accessToken,
      refreshToken,
    });

    done(null, { user, isNew });
  }
}
