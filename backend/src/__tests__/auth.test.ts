/**
 * Unit tests for auth endpoints.
 *
 * All external dependencies (Prisma, Redis, bcrypt, metrics) are mocked so
 * tests run without a real database or cache.
 */

import request from 'supertest';
import { createApp } from '../app';
import * as authService from '../services/auth.service';
import { signAccessToken, signRefreshToken } from '../lib/jwt';
import { UserRole } from '../types';
import { AppError } from '../middleware/errorHandler';

// ── Mock: Prisma ───────────────────────────────────────────────────────────────
jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    oauthAccount: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// ── Mock: Redis ────────────────────────────────────────────────────────────────
jest.mock('../lib/redis', () => ({
  redis: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    call: jest.fn(),
  },
  redisSub: {
    on: jest.fn(),
  },
  default: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    call: jest.fn(),
  },
}));

// ── Mock: Metrics ──────────────────────────────────────────────────────────────
jest.mock('../lib/metrics', () => ({
  register: {
    contentType: 'text/plain; version=0.0.4; charset=utf-8',
    metrics: jest.fn().mockResolvedValue(''),
  },
  httpRequestsTotal: { inc: jest.fn() },
  httpRequestDurationSeconds: { observe: jest.fn(), startTimer: jest.fn().mockReturnValue(jest.fn()) },
  activeWebsocketConnections: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  cacheHitRatio: { set: jest.fn() },
  notificationQueueDepth: { set: jest.fn() },
  collectDefaultMetrics: jest.fn(),
}));

// ── Mock: Rate limiter (bypass in tests) ──────────────────────────────────────
jest.mock('../middleware/rateLimiter', () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  apiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// ── Mock: bcryptjs (speed up tests) ───────────────────────────────────────────
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$hashed$'),
  compare: jest.fn(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const app = createApp();

/** Build a valid access token for a test user. */
function makeAccessToken(userId = 'user-1', role: UserRole = UserRole.CUSTOMER): string {
  return signAccessToken({ userId, role, email: 'test@example.com' });
}

/** Build a valid refresh token for a test user. */
function makeRefreshToken(userId = 'user-1', role: UserRole = UserRole.CUSTOMER): string {
  return signRefreshToken({ userId, role, email: 'test@example.com' });
}

// ── Registration ───────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  const validBody = {
    email: 'alice@example.com',
    password: 'Password1!',
    name: 'Alice',
  };

  beforeEach(() => {
    jest.spyOn(authService, 'registerWithEmail').mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', email: 'alice@example.com', name: 'Alice', role: UserRole.CUSTOMER },
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns 201 with accessToken and refreshToken on success', async () => {
    const res = await request(app).post('/api/auth/register').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
  });

  it('returns 409 when email is already registered', async () => {
    jest.spyOn(authService, 'registerWithEmail').mockRejectedValue(
      new AppError('Email is already registered', 409),
    );

    const res = await request(app).post('/api/auth/register').send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when password is shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: validBody.email, password: validBody.password });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── Login ──────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  const validBody = { email: 'alice@example.com', password: 'Password1!' };

  beforeEach(() => {
    jest.spyOn(authService, 'loginWithEmail').mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'user-1', email: 'alice@example.com', name: 'Alice', role: UserRole.CUSTOMER },
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with tokens on valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
  });

  it('returns 401 for wrong password', async () => {
    jest.spyOn(authService, 'loginWithEmail').mockRejectedValue(
      new AppError('Invalid email or password', 401),
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ ...validBody, password: 'WrongPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for non-existent email', async () => {
    jest.spyOn(authService, 'loginWithEmail').mockRejectedValue(
      new AppError('Invalid email or password', 401),
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password1!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Password1!' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── Token Refresh ──────────────────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with new token pair for a valid refresh token', async () => {
    jest.spyOn(authService, 'refreshTokens').mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-refresh-token' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
  });

  it('returns 401 for an invalid or expired refresh token', async () => {
    jest.spyOn(authService, 'refreshTokens').mockRejectedValue(
      new AppError('Invalid or expired refresh token', 401),
    );

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'expired-or-invalid-token' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when refreshToken field is missing', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── Logout ─────────────────────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 for an authenticated user with a valid refresh token', async () => {
    jest.spyOn(authService, 'logout').mockResolvedValue(undefined);

    const accessToken = makeAccessToken();
    const refreshToken = makeRefreshToken();

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: 'some-token' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

// ── Password Reset Request ─────────────────────────────────────────────────────

describe('POST /api/auth/password/reset', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 for a registered email', async () => {
    jest.spyOn(authService, 'requestPasswordReset').mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/auth/password/reset')
      .send({ email: 'alice@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 200 even for an unknown email (prevents enumeration)', async () => {
    jest.spyOn(authService, 'requestPasswordReset').mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/auth/password/reset')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 for an invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/password/reset')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ── Password Reset Confirm ─────────────────────────────────────────────────────

describe('POST /api/auth/password/reset/confirm', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 400 for an invalid or expired reset token', async () => {
    jest.spyOn(authService, 'confirmPasswordReset').mockRejectedValue(
      new AppError('Password reset token is invalid or has expired', 400),
    );

    const res = await request(app)
      .post('/api/auth/password/reset/confirm')
      .send({ token: 'bad-token', newPassword: 'NewPassword1!' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when token field is missing', async () => {
    const res = await request(app)
      .post('/api/auth/password/reset/confirm')
      .send({ newPassword: 'NewPassword1!' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when newPassword field is missing', async () => {
    const res = await request(app)
      .post('/api/auth/password/reset/confirm')
      .send({ token: 'some-token' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when newPassword is shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/password/reset/confirm')
      .send({ token: 'some-token', newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 200 on successful password reset', async () => {
    jest.spyOn(authService, 'confirmPasswordReset').mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/auth/password/reset/confirm')
      .send({ token: 'valid-token', newPassword: 'NewPassword1!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── JWT Middleware (authenticate) ──────────────────────────────────────────────
// We test the middleware via the /api/auth/logout route which requires authentication.

describe('JWT authenticate middleware', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: 'some-token' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for a malformed / invalid token', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer this.is.not.a.valid.jwt')
      .send({ refreshToken: 'some-token' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for an expired access token', async () => {
    // Sign a token that expired 1 second ago
    const jwt = require('jsonwebtoken');
    const expiredToken: string = jwt.sign(
      { userId: 'user-1', role: UserRole.CUSTOMER, email: 'test@example.com' },
      process.env.JWT_SECRET ?? 'dev-access-secret',
      { expiresIn: -1 },
    );

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send({ refreshToken: 'some-token' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('passes through with a valid access token', async () => {
    jest.spyOn(authService, 'logout').mockResolvedValue(undefined);

    const accessToken = makeAccessToken();
    const refreshToken = makeRefreshToken();

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    // The middleware passed — the route handler ran and returned 200
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
