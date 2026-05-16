import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { loginWithSocial } from '../services/auth.service';
import { logger } from '../lib/logger';

/**
 * Configures Passport.js OAuth strategies for Google and Facebook.
 *
 * The strategies call `loginWithSocial` which handles user lookup/creation
 * and returns a token pair. The tokens are attached to the user object so
 * the OAuth callback route can forward them to the frontend.
 */
export function configurePassport(): void {
  // ── Google OAuth2 Strategy ─────────────────────────────────────────────────
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/auth/google/callback`,
          scope: ['profile', 'email'],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email =
              profile.emails && profile.emails.length > 0
                ? profile.emails[0].value
                : null;
            const name = profile.displayName ?? email ?? 'Google User';

            const result = await loginWithSocial('google', profile.id, email, name);
            done(null, result as unknown as Express.User);
          } catch (err) {
            logger.error('Google OAuth strategy error', { err });
            done(err as Error);
          }
        },
      ),
    );
  } else {
    logger.warn('Google OAuth not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing)');
  }

  // ── Facebook Strategy ──────────────────────────────────────────────────────
  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: process.env.FACEBOOK_APP_ID,
          clientSecret: process.env.FACEBOOK_APP_SECRET,
          callbackURL: `${process.env.API_BASE_URL ?? 'http://localhost:4000'}/api/auth/facebook/callback`,
          profileFields: ['id', 'displayName', 'emails'],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email =
              profile.emails && profile.emails.length > 0
                ? profile.emails[0].value
                : null;
            const name = profile.displayName ?? email ?? 'Facebook User';

            const result = await loginWithSocial('facebook', profile.id, email, name);
            done(null, result as unknown as Express.User);
          } catch (err) {
            logger.error('Facebook OAuth strategy error', { err });
            done(err as Error);
          }
        },
      ),
    );
  } else {
    logger.warn('Facebook OAuth not configured (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET missing)');
  }

  // Passport session serialization is not used (stateless JWT), but required
  // by passport internals when using OAuth redirect flows.
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user as Express.User));
}
