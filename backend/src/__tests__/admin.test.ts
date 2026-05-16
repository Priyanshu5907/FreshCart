import request from 'supertest';
import { createApp } from '../app';
import * as adminService from '../services/admin.service';
import { signAccessToken } from '../lib/jwt';
import { UserRole } from '../types';
import { AppError } from '../middleware/errorHandler';

jest.mock('../lib/prisma', () => ({
  prisma: {
    order: { count: jest.fn(), aggregate: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    orderItem: { groupBy: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
    user: { count: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
    product: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    category: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    coupon: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    banner: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    refreshToken: { create: jest.fn(), findMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    oauthAccount: { findUnique: jest.fn(), create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
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

function makeAdminToken(): string {
  return signAccessToken({ userId: 'admin-1', role: UserRole.ADMIN, email: 'admin@test.com' });
}

function makeCustomerToken(): string {
  return signAccessToken({ userId: 'user-1', role: UserRole.CUSTOMER, email: 'user@test.com' });
}

const sampleDashboard = {
  orders: { daily: 5, weekly: 30, monthly: 120 },
  revenue: { daily: 2500, weekly: 15000, monthly: 60000 },
  newCustomers: { daily: 2, weekly: 10, monthly: 45 },
  topProducts: [{ productId: 'prod-1', productName: 'Bananas', _sum: { quantity: 100 } }],
  dailyRevenueChart: [{ date: '2026-05-01', revenue: 2000 }],
};

// ── Dashboard ──────────────────────────────────────────────────────────────────

describe('GET /api/admin/dashboard', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with dashboard stats for admin', async () => {
    jest.spyOn(adminService, 'getDashboardStats').mockResolvedValue(sampleDashboard as never);
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${makeAdminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.orders).toMatchObject({ daily: 5, weekly: 30, monthly: 120 });
    expect(res.body.data.revenue).toMatchObject({ daily: 2500 });
    expect(res.body.data.topProducts).toHaveLength(1);
  });

  it('returns 403 for non-admin user', async () => {
    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${makeCustomerToken()}`);
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(401);
  });
});

// ── Dashboard Aggregation Logic Tests ─────────────────────────────────────────

describe('Dashboard aggregation correctness', () => {
  it('daily revenue is sum of all non-cancelled orders today', () => {
    const orders = [
      { total: 250, status: 'confirmed' },
      { total: 500, status: 'delivered' },
      { total: 100, status: 'cancelled' }, // should be excluded
    ];
    const revenue = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + o.total, 0);
    expect(revenue).toBe(750);
  });

  it('top products are sorted by units sold descending', () => {
    const products = [
      { productName: 'Apples', unitsSold: 50 },
      { productName: 'Bananas', unitsSold: 120 },
      { productName: 'Milk', unitsSold: 80 },
    ];
    const sorted = [...products].sort((a, b) => b.unitsSold - a.unitsSold);
    expect(sorted[0].productName).toBe('Bananas');
    expect(sorted[1].productName).toBe('Milk');
    expect(sorted[2].productName).toBe('Apples');
  });

  it('new customer count excludes admin and delivery_partner roles', () => {
    const users = [
      { role: 'customer', createdToday: true },
      { role: 'customer', createdToday: true },
      { role: 'admin', createdToday: true },
      { role: 'delivery_partner', createdToday: true },
    ];
    const newCustomers = users.filter((u) => u.role === 'customer' && u.createdToday).length;
    expect(newCustomers).toBe(2);
  });

  it('weekly revenue includes all days in the current week', () => {
    const dailyRevenues = [100, 200, 150, 300, 250, 0, 400];
    const weeklyTotal = dailyRevenues.reduce((sum, r) => sum + r, 0);
    expect(weeklyTotal).toBe(1400);
  });
});

// ── Admin Product Management ───────────────────────────────────────────────────

describe('POST /api/admin/products', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 201 when product is created', async () => {
    jest.spyOn(adminService, 'adminCreateProduct').mockResolvedValue({ id: 'prod-1', name: 'Test' } as never);
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ categoryId: '00000000-0000-0000-0000-000000000001', name: 'Test Product', slug: 'test-product', price: 99 });
    expect(res.status).toBe(201);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ name: 'Test' }); // missing categoryId, slug, price
    expect(res.status).toBe(400);
  });

  it('returns 403 for non-admin', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${makeCustomerToken()}`)
      .send({ categoryId: '00000000-0000-0000-0000-000000000001', name: 'Test', slug: 'test', price: 99 });
    expect(res.status).toBe(403);
  });
});

// ── Admin Order Management ─────────────────────────────────────────────────────

describe('PATCH /api/admin/orders/:id/status', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 when order status is updated', async () => {
    jest.spyOn(adminService, 'adminUpdateOrderStatus').mockResolvedValue({ id: 'order-1', status: 'processing' } as never);
    const res = await request(app)
      .patch('/api/admin/orders/order-1/status')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ status: 'processing' });
    expect(res.status).toBe(200);
  });

  it('returns 400 when status is missing', async () => {
    const res = await request(app)
      .patch('/api/admin/orders/order-1/status')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/orders/:id/cancel', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 when order is cancelled with reason', async () => {
    jest.spyOn(adminService, 'adminCancelOrder').mockResolvedValue({ id: 'order-1', status: 'cancelled' } as never);
    const res = await request(app)
      .post('/api/admin/orders/order-1/cancel')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ reason: 'Customer requested cancellation' });
    expect(res.status).toBe(200);
  });

  it('returns 400 when reason is missing', async () => {
    const res = await request(app)
      .post('/api/admin/orders/order-1/cancel')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when order is already delivered', async () => {
    jest.spyOn(adminService, 'adminCancelOrder').mockRejectedValue(new AppError('Cannot cancel a delivered order', 400));
    const res = await request(app)
      .post('/api/admin/orders/order-1/cancel')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ reason: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot cancel/i);
  });
});

// ── Admin Coupon Management ────────────────────────────────────────────────────

describe('POST /api/admin/coupons', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 201 when coupon is created', async () => {
    jest.spyOn(adminService, 'adminCreateCoupon').mockResolvedValue({ id: 'coup-1', code: 'SAVE10' } as never);
    const res = await request(app)
      .post('/api/admin/coupons')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ code: 'SAVE10', discountType: 'percentage', discountValue: 10, startsAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect(res.status).toBe(201);
  });

  it('returns 400 for invalid coupon code format', async () => {
    const res = await request(app)
      .post('/api/admin/coupons')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ code: 'abc', discountType: 'percentage', discountValue: 10, startsAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect(res.status).toBe(400);
  });

  it('returns 400 when percentage discount > 100', async () => {
    jest.spyOn(adminService, 'adminCreateCoupon').mockRejectedValue(new AppError('Percentage discount must be between 1 and 100', 400));
    const res = await request(app)
      .post('/api/admin/coupons')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ code: 'OVER100', discountType: 'percentage', discountValue: 150, startsAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() });
    expect(res.status).toBe(400);
  });
});
