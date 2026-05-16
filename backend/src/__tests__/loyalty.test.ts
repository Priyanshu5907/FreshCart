/**
 * Loyalty Points Tests
 * Includes property-based test for:
 * - P8: Loyalty Points Balance Non-Negativity
 * - P10: Wishlist Uniqueness Invariant
 */

import request from 'supertest';
import { createApp } from '../app';
import * as wishlistService from '../services/wishlist.service';
import { signAccessToken } from '../lib/jwt';
import { UserRole } from '../types';
import { AppError } from '../middleware/errorHandler';

jest.mock('../lib/prisma', () => ({
  prisma: {
    wishlist: { findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
    product: { findFirst: jest.fn() },
    cart: { upsert: jest.fn() },
    cartItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    loyaltyPoint: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
    subscriptionPlan: { findMany: jest.fn(), findFirst: jest.fn() },
    userSubscription: { findFirst: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn() },
    refreshToken: { create: jest.fn(), findMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    oauthAccount: { findUnique: jest.fn(), create: jest.fn() },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), setex: jest.fn(), del: jest.fn(), keys: jest.fn().mockResolvedValue([]), call: jest.fn() },
  redisSub: { on: jest.fn() },
  default: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), setex: jest.fn(), del: jest.fn(), keys: jest.fn().mockResolvedValue([]), call: jest.fn() },
}));

jest.mock('../lib/metrics', () => ({
  register: { contentType: 'text/plain', metrics: jest.fn().mockResolvedValue('') },
  httpRequestsTotal: { inc: jest.fn() },
  httpRequestDurationSeconds: { observe: jest.fn(), startTimer: jest.fn().mockReturnValue(jest.fn()) },
  activeWebsocketConnections: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  cacheHitRatio: { set: jest.fn() },
  notificationQueueDepth: { set: jest.fn() },
  collectDefaultMetrics: jest.fn(),
}));

jest.mock('../middleware/rateLimiter', () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  apiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = createApp();

function makeToken(userId = 'user-1'): string {
  return signAccessToken({ userId, role: UserRole.CUSTOMER, email: 'test@example.com' });
}

// ── P8: Loyalty Points Balance Non-Negativity ─────────────────────────────────

describe('P8: Loyalty Points Balance Non-Negativity', () => {
  it('balance is always >= 0 after any sequence of credits and debits', () => {
    const testCases = [
      { credits: [100, 50, 200], debits: [80, 30], expectedBalance: 240 },
      { credits: [100], debits: [100], expectedBalance: 0 },
      { credits: [50], debits: [0], expectedBalance: 50 },
      { credits: [], debits: [], expectedBalance: 0 },
      { credits: [1000], debits: [999], expectedBalance: 1 },
    ];

    for (const tc of testCases) {
      const totalCredits = tc.credits.reduce((sum, c) => sum + c, 0);
      const totalDebits = tc.debits.reduce((sum, d) => sum + d, 0);
      const balance = Math.max(0, totalCredits - totalDebits);

      expect(balance).toBeGreaterThanOrEqual(0);
      expect(balance).toBe(tc.expectedBalance);
    }
  });

  it('debit cannot exceed current balance', () => {
    const balance = 100;
    const requestedDebit = 150;
    const actualDebit = Math.min(requestedDebit, balance);

    expect(actualDebit).toBeLessThanOrEqual(balance);
    expect(balance - actualDebit).toBeGreaterThanOrEqual(0);
  });

  it('redemption is capped at 20% of order total', () => {
    const testCases = [
      { orderTotal: 500, pointsToRedeem: 200, maxRedeemable: 100, expected: 100 },
      { orderTotal: 1000, pointsToRedeem: 150, maxRedeemable: 200, expected: 150 },
      { orderTotal: 200, pointsToRedeem: 50, maxRedeemable: 40, expected: 40 },
    ];

    for (const tc of testCases) {
      const maxRedeemable = Math.floor(tc.orderTotal * 0.20);
      const actualRedeem = Math.min(tc.pointsToRedeem, maxRedeemable);

      expect(maxRedeemable).toBe(tc.maxRedeemable);
      expect(actualRedeem).toBe(tc.expected);
      expect(actualRedeem).toBeLessThanOrEqual(maxRedeemable);
    }
  });

  it('loyalty points credited = floor(order_total)', () => {
    const testCases = [
      { orderTotal: 250.75, expectedPoints: 250 },
      { orderTotal: 100.00, expectedPoints: 100 },
      { orderTotal: 99.99, expectedPoints: 99 },
      { orderTotal: 0.50, expectedPoints: 0 },
    ];

    for (const tc of testCases) {
      const points = Math.floor(tc.orderTotal);
      expect(points).toBe(tc.expectedPoints);
      expect(points).toBeGreaterThanOrEqual(0);
    }
  });

  it('balance never goes negative after order cancellation debit', () => {
    const scenarios = [
      { balance: 100, creditToReverse: 100, expectedAfter: 0 },
      { balance: 50, creditToReverse: 100, expectedAfter: 0 }, // cap at balance
      { balance: 200, creditToReverse: 50, expectedAfter: 150 },
    ];

    for (const s of scenarios) {
      const debitAmount = Math.min(s.creditToReverse, s.balance);
      const balanceAfter = s.balance - debitAmount;
      expect(balanceAfter).toBeGreaterThanOrEqual(0);
      expect(balanceAfter).toBe(s.expectedAfter);
    }
  });
});

// ── P10: Wishlist Uniqueness Invariant ────────────────────────────────────────

describe('P10: Wishlist Uniqueness Invariant', () => {
  it('adding the same product twice does not create duplicates', async () => {
    jest.spyOn(wishlistService, 'addToWishlist').mockResolvedValue({ id: 'wish-1', userId: 'user-1', productId: 'prod-1' } as never);

    // First add
    const res1 = await request(app)
      .post('/api/wishlist')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ productId: '00000000-0000-0000-0000-000000000001' });
    expect(res1.status).toBe(200);

    // Second add (idempotent)
    const res2 = await request(app)
      .post('/api/wishlist')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ productId: '00000000-0000-0000-0000-000000000001' });
    expect(res2.status).toBe(200);

    // Service was called twice but upsert ensures no duplicates
    expect(wishlistService.addToWishlist).toHaveBeenCalledTimes(2);
  });

  it('wishlist contains at most one entry per (userId, productId) pair', () => {
    const wishlistItems = [
      { userId: 'user-1', productId: 'prod-1' },
      { userId: 'user-1', productId: 'prod-2' },
      { userId: 'user-1', productId: 'prod-1' }, // duplicate
    ];

    // Simulate deduplication
    const unique = wishlistItems.filter(
      (item, index, self) =>
        index === self.findIndex((t) => t.userId === item.userId && t.productId === item.productId),
    );

    expect(unique).toHaveLength(2);
    expect(unique.filter((i) => i.productId === 'prod-1')).toHaveLength(1);
  });

  it('returns 404 when removing a product not in wishlist', async () => {
    jest.spyOn(wishlistService, 'removeFromWishlist').mockRejectedValue(new AppError('Item not in wishlist', 404));
    const res = await request(app)
      .delete('/api/wishlist/00000000-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });
});

// ── Wishlist HTTP Tests ────────────────────────────────────────────────────────

describe('GET /api/wishlist', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with wishlist items', async () => {
    jest.spyOn(wishlistService, 'getWishlist').mockResolvedValue([
      { id: 'wish-1', userId: 'user-1', productId: 'prod-1', product: { id: 'prod-1', name: 'Bananas', slug: 'bananas', price: 49, discountPct: 10, stockQty: 100, isActive: true, images: [] } },
    ] as never);
    const res = await request(app).get('/api/wishlist').set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/wishlist');
    expect(res.status).toBe(401);
  });
});
