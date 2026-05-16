import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { z } from 'zod';
import {
  registerWithEmail,
  requestPhoneOtp,
  verifyPhoneOtp,
  loginWithEmail,
  refreshTokens,
  logout,
  requestPasswordReset,
  confirmPasswordReset,
} from '../services/auth.service';
import { authenticate } from '../middleware/authenticate';
import { authLimiter } from '../middleware/rateLimiter';
import { AppError } from '../middleware/errorHandler';
import { ApiResponse } from '../types';

const router = Router();

// ── Zod Validation Schemas ─────────────────────────────────────────────────────

const registerEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  name: z.string().min(1, 'Name is required').max(200, 'Name must be at most 200 characters'),
});

const phoneSchema = z.object({
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format'),
});

const verifyOtpSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format'),
  otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'OTP must be numeric'),
  name: z.string().min(1, 'Name is required').max(200, 'Name must be at most 200 characters').optional().default('User'),
});

const loginEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

// ── Validation helper ──────────────────────────────────────────────────────────

function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || 'general';
      if (!errors[key]) errors[key] = [];
      errors[key].push(issue.message);
    }
    const err = new AppError('Validation failed', 400) as AppError & { errors?: Record<string, string[]> };
    err.errors = errors;
    throw err;
  }
  return result.data;
}

// ── POST /api/auth/register ────────────────────────────────────────────────────
// Task 4.1: Email/password registration with bcrypt hashing (cost 12) and JWT issuance

router.post(
  '/register',
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validate(registerEmailSchema, req.body);
      const result = await registerWithEmail(body.email, body.password, body.name);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: 'Registration successful',
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/auth/register/phone ──────────────────────────────────────────────
// Task 4.2: Generate OTP, store hash in Redis with 5-min TTL, send via Twilio

router.post(
  '/register/phone',
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validate(phoneSchema, req.body);
      await requestPhoneOtp(body.phone);

      const response: ApiResponse<null> = {
        success: true,
        message: 'OTP sent successfully. Please verify within 5 minutes.',
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/auth/register/phone/verify ──────────────────────────────────────
// Task 4.3: Validate OTP, complete registration

router.post(
  '/register/phone/verify',
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validate(verifyOtpSchema, req.body);
      const result = await verifyPhoneOtp(body.phone, body.otp, body.name ?? 'User');

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: 'Phone verified and registration complete',
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/auth/login ───────────────────────────────────────────────────────
// Task 4.4: Email/password login, return access token (15 min) + refresh token (7 days)

router.post(
  '/login',
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validate(loginEmailSchema, req.body);
      const result = await loginWithEmail(body.email, body.password);

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: 'Login successful',
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/auth/login/social ────────────────────────────────────────────────
// Task 4.5: Social login endpoint (accepts provider + token from frontend OAuth flow)
// Also supports redirect-based OAuth via GET /api/auth/google and /api/auth/facebook

router.post(
  '/login/social',
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const socialSchema = z.object({
        provider: z.enum(['google', 'facebook']),
        providerId: z.string().min(1),
        email: z.string().email().nullable().optional(),
        name: z.string().min(1).max(200),
      });

      const body = validate(socialSchema, req.body);

      // Import loginWithSocial directly for the POST endpoint
      const { loginWithSocial } = await import('../services/auth.service');
      const result = await loginWithSocial(
        body.provider,
        body.providerId,
        body.email ?? null,
        body.name,
      );

      const response: ApiResponse<typeof result> = {
        success: true,
        data: result,
        message: 'Social login successful',
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/auth/google ───────────────────────────────────────────────────────
// Redirect-based Google OAuth flow

router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false }),
);

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=oauth_failed' }),
  (req: Request, res: Response) => {
    const user = req.user as { accessToken: string; refreshToken: string } | undefined;
    if (!user) {
      res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login?error=oauth_failed`);
      return;
    }
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    res.redirect(
      `${frontendUrl}/auth/callback?accessToken=${encodeURIComponent(user.accessToken)}&refreshToken=${encodeURIComponent(user.refreshToken)}`,
    );
  },
);

// ── GET /api/auth/facebook ─────────────────────────────────────────────────────
// Redirect-based Facebook OAuth flow

router.get(
  '/facebook',
  passport.authenticate('facebook', { scope: ['email'], session: false }),
);

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: '/login?error=oauth_failed' }),
  (req: Request, res: Response) => {
    const user = req.user as { accessToken: string; refreshToken: string } | undefined;
    if (!user) {
      res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login?error=oauth_failed`);
      return;
    }
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    res.redirect(
      `${frontendUrl}/auth/callback?accessToken=${encodeURIComponent(user.accessToken)}&refreshToken=${encodeURIComponent(user.refreshToken)}`,
    );
  },
);

// ── POST /api/auth/refresh ─────────────────────────────────────────────────────
// Task 4.6: Validate refresh token hash, rotate token, issue new access token

router.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validate(refreshSchema, req.body);
      const tokens = await refreshTokens(body.refreshToken);

      const response: ApiResponse<typeof tokens> = {
        success: true,
        data: tokens,
        message: 'Tokens refreshed successfully',
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/auth/logout ──────────────────────────────────────────────────────
// Task 4.7: Delete refresh token from database

router.post(
  '/logout',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validate(logoutSchema, req.body);
      await logout(body.refreshToken);

      const response: ApiResponse<null> = {
        success: true,
        message: 'Logged out successfully',
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/auth/password/reset ─────────────────────────────────────────────
// Task 4.8: Send reset email with 1-hour expiry token

router.post(
  '/password/reset',
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validate(passwordResetRequestSchema, req.body);
      await requestPasswordReset(body.email);

      // Always return success to avoid email enumeration (Requirement 1.9)
      const response: ApiResponse<null> = {
        success: true,
        message: 'If that email is registered, a password reset link has been sent.',
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/auth/password/reset/confirm ─────────────────────────────────────
// Task 4.9: Validate token, update password hash

router.post(
  '/password/reset/confirm',
  authLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validate(passwordResetConfirmSchema, req.body);
      await confirmPasswordReset(body.token, body.newPassword);

      const response: ApiResponse<null> = {
        success: true,
        message: 'Password has been reset successfully. Please log in with your new password.',
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
