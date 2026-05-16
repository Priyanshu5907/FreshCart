import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { AppError } from '../middleware/errorHandler';
import { JwtPayload, UserRole } from '../types';

const BCRYPT_COST = 12;
const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const RESET_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

// ── Helpers ────────────────────────────────────────────────────────────────────

function otpRedisKey(phone: string): string {
  return `otp:${phone}`;
}

function resetRedisKey(token: string): string {
  return `pwd_reset:${token}`;
}

function generateOtp(): string {
  // Cryptographically random 6-digit OTP
  return String(crypto.randomInt(100000, 999999));
}

/**
 * Creates an access + refresh token pair, stores the refresh token hash in DB.
 */
export async function generateTokenPair(user: {
  id: string;
  role: string;
  email: string | null;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const payload: JwtPayload = {
    userId: user.id,
    role: user.role as UserRole,
    email: user.email ?? '',
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Hash the refresh token before storing (bcrypt cost 12)
  const tokenHash = await bcrypt.hash(refreshToken, BCRYPT_COST);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  return { accessToken, refreshToken };
}

// ── Email / Password Registration ─────────────────────────────────────────────

export async function registerWithEmail(
  email: string,
  password: string,
  name: string,
): Promise<{ accessToken: string; refreshToken: string; user: object }> {
  // Check for existing account
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError('Email is already registered', 409);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: UserRole.CUSTOMER,
    },
  });

  logger.info('User registered via email', { userId: user.id });

  const tokens = await generateTokenPair(user);

  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

// ── Phone OTP Registration ─────────────────────────────────────────────────────

export async function requestPhoneOtp(phone: string): Promise<void> {
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, BCRYPT_COST);

  // Store hash in Redis with 5-minute TTL
  await redis.set(otpRedisKey(phone), otpHash, 'EX', OTP_TTL_SECONDS);

  // Send OTP via Twilio (gracefully skip if not configured)
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (accountSid && authToken && fromNumber) {
    try {
      // Dynamic import to avoid hard dependency at startup
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const twilio = require('twilio');
      const client = twilio(accountSid, authToken);
      await client.messages.create({
        body: `Your verification code is: ${otp}. Valid for 5 minutes.`,
        from: fromNumber,
        to: phone,
      });
      logger.info('OTP sent via Twilio', { phone });
    } catch (err) {
      logger.error('Failed to send OTP via Twilio', { phone, err });
      throw new AppError('Failed to send OTP. Please try again.', 503);
    }
  } else {
    // Development mode: log OTP to console
    logger.warn('Twilio not configured – OTP (dev only)', { phone, otp });
  }
}

export async function verifyPhoneOtp(
  phone: string,
  otp: string,
  name: string,
): Promise<{ accessToken: string; refreshToken: string; user: object }> {
  const storedHash = await redis.get(otpRedisKey(phone));
  if (!storedHash) {
    throw new AppError('OTP has expired or was not requested', 400);
  }

  const isValid = await bcrypt.compare(otp, storedHash);
  if (!isValid) {
    throw new AppError('Invalid OTP', 400);
  }

  // Delete OTP from Redis immediately after successful verification
  await redis.del(otpRedisKey(phone));

  // Upsert user: create if new, mark phone verified if existing
  let user = await prisma.user.findUnique({ where: { phone } });
  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { phoneVerified: true },
    });
  } else {
    user = await prisma.user.create({
      data: {
        phone,
        name,
        role: UserRole.CUSTOMER,
        phoneVerified: true,
      },
    });
  }

  logger.info('User registered/verified via phone OTP', { userId: user.id });

  const tokens = await generateTokenPair(user);

  return {
    ...tokens,
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
    },
  };
}

// ── Email / Password Login ─────────────────────────────────────────────────────

export async function loginWithEmail(
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string; user: object }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isActive) {
    throw new AppError('Account is deactivated', 403);
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    throw new AppError('Invalid email or password', 401);
  }

  logger.info('User logged in via email', { userId: user.id });

  const tokens = await generateTokenPair(user);

  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

// ── Social Login (OAuth) ───────────────────────────────────────────────────────

export async function loginWithSocial(
  provider: string,
  providerId: string,
  email: string | null,
  name: string,
): Promise<{ accessToken: string; refreshToken: string; user: object }> {
  // Try to find existing OAuth account
  let oauthAccount = await prisma.oauthAccount.findUnique({
    where: { provider_providerId: { provider, providerId } },
    include: { user: true },
  });

  let user = oauthAccount?.user ?? null;

  if (!user) {
    // Try to find user by email (link accounts)
    if (email) {
      user = await prisma.user.findUnique({ where: { email } });
    }

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          email,
          name,
          role: UserRole.CUSTOMER,
          emailVerified: email ? true : false,
        },
      });
    }

    // Create OAuth account link
    oauthAccount = await prisma.oauthAccount.create({
      data: {
        userId: user.id,
        provider,
        providerId,
      },
      include: { user: true },
    });
  }

  if (!user.isActive) {
    throw new AppError('Account is deactivated', 403);
  }

  logger.info('User logged in via social OAuth', { userId: user.id, provider });

  const tokens = await generateTokenPair(user);

  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

// ── Token Refresh ──────────────────────────────────────────────────────────────

export async function refreshTokens(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  // Verify JWT signature and expiry first
  let payload: JwtPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  // Find all non-expired refresh tokens for this user and check hash
  const storedTokens = await prisma.refreshToken.findMany({
    where: {
      userId: payload.userId,
      expiresAt: { gt: new Date() },
    },
  });

  let matchedToken: (typeof storedTokens)[0] | null = null;
  for (const stored of storedTokens) {
    const matches = await bcrypt.compare(refreshToken, stored.tokenHash);
    if (matches) {
      matchedToken = stored;
      break;
    }
  }

  if (!matchedToken) {
    throw new AppError('Refresh token not found or already used', 401);
  }

  // Delete the used refresh token (rotation)
  await prisma.refreshToken.delete({ where: { id: matchedToken.id } });

  // Fetch fresh user data
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.isActive) {
    throw new AppError('User not found or deactivated', 401);
  }

  logger.info('Refresh tokens rotated', { userId: user.id });

  return generateTokenPair(user);
}

// ── Logout ─────────────────────────────────────────────────────────────────────

export async function logout(refreshToken: string): Promise<void> {
  let payload: JwtPayload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    // Token is invalid/expired – nothing to delete, treat as success
    return;
  }

  const storedTokens = await prisma.refreshToken.findMany({
    where: { userId: payload.userId },
  });

  for (const stored of storedTokens) {
    const matches = await bcrypt.compare(refreshToken, stored.tokenHash);
    if (matches) {
      await prisma.refreshToken.delete({ where: { id: stored.id } });
      logger.info('User logged out, refresh token deleted', { userId: payload.userId });
      return;
    }
  }
}

// ── Password Reset ─────────────────────────────────────────────────────────────

export async function requestPasswordReset(email: string): Promise<void> {
  // Always return success to avoid email enumeration
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    logger.info('Password reset requested for unknown email', { email });
    return;
  }

  // Generate a secure random token
  const resetToken = uuidv4();
  const tokenHash = await bcrypt.hash(resetToken, BCRYPT_COST);

  // Store hash in Redis with 1-hour TTL, keyed by the plain token
  await redis.set(resetRedisKey(resetToken), JSON.stringify({ hash: tokenHash, userId: user.id }), 'EX', RESET_TOKEN_TTL_SECONDS);

  // Send reset email
  const resetUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password?token=${resetToken}`;

  const nodemailerConfigured =
    process.env.SMTP_HOST || process.env.AWS_SES_REGION;

  if (nodemailerConfigured) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.EMAIL_FROM ?? 'noreply@grocery.example.com',
        to: email,
        subject: 'Password Reset Request',
        html: `
          <p>You requested a password reset.</p>
          <p>Click the link below to reset your password (valid for 1 hour):</p>
          <a href="${resetUrl}">${resetUrl}</a>
          <p>If you did not request this, please ignore this email.</p>
        `,
      });
      logger.info('Password reset email sent', { userId: user.id });
    } catch (err) {
      logger.error('Failed to send password reset email', { userId: user.id, err });
      throw new AppError('Failed to send reset email. Please try again.', 503);
    }
  } else {
    // Development mode: log reset URL
    logger.warn('Email not configured – password reset URL (dev only)', { email, resetUrl });
  }
}

export async function confirmPasswordReset(
  token: string,
  newPassword: string,
): Promise<void> {
  const stored = await redis.get(resetRedisKey(token));
  if (!stored) {
    throw new AppError('Password reset token is invalid or has expired', 400);
  }

  const { userId } = JSON.parse(stored) as { hash: string; userId: string };

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  // Invalidate the reset token
  await redis.del(resetRedisKey(token));

  // Invalidate all existing refresh tokens for security
  await prisma.refreshToken.deleteMany({ where: { userId } });

  logger.info('Password reset confirmed', { userId });
}
