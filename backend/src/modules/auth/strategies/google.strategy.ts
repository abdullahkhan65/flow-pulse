import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-google-oauth20";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../auth.service";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: configService.get("google.clientId"),
      clientSecret: configService.get("google.clientSecret"),
      callbackURL: configService.get("google.callbackUrl"),
      scope: [
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.metadata",
      ],
    });
  }

  // passport-google-oauth20's authorizationParams() reads from runtime options only,
  // not constructor options — accessType/prompt in super() are silently ignored.
  // Override here so Google always issues a refresh token.
  authorizationParams(): object {
    return {
      access_type: "offline",
      prompt: "consent",
    };
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, emails, displayName, photos } = profile;
    const email = emails[0].value;

    // Strip Google's size param (=s96-c) to get the full-resolution photo
    const rawPhoto = photos?.[0]?.value;
    const avatarUrl = rawPhoto
      ? rawPhoto.replace(/=s\d+-[a-z]$/, "")
      : undefined;

    const { user, isNew } = await this.authService.findOrCreateGoogleUser({
      googleId: id,
      email,
      name: displayName,
      avatarUrl,
      accessToken,
      refreshToken,
    });

    done(null, { user, isNew });
  }
}
