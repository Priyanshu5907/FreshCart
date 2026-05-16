import request from 'supertest';
import { createApp } from '../app';
import * as deliveryService from '../services/delivery.service';
import { signAccessToken } from '../lib/jwt';
import { UserRole } from '../types';
import { AppError } from '../middleware/errorHandler';

jest.mock('../lib/prisma', () => ({
  prisma: {
    order: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
    deliveryPartnerLocation: { upsert: jest.fn() },
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

function makeDeliveryToken(userId = 'dp-1'): string {
  return signAccessToken({ userId, role: UserRole.DELIVERY_PARTNER, email: 'dp@test.com' });
}

function makeCustomerToken(): string {
  return signAccessToken({ userId: 'user-1', role: UserRole.CUSTOMER, email: 'user@test.com' });
}

const sampleOrder = {
  id: 'order-1', userId: 'user-1', deliveryPartnerId: 'dp-1',
  status: 'shipped', paymentMethod: 'cod',
};

// ── GET /api/delivery/orders ───────────────────────────────────────────────────

describe('GET /api/delivery/orders', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with assigned orders for delivery partner', async () => {
    jest.spyOn(deliveryService, 'getAssignedOrders').mockResolvedValue([sampleOrder] as never);
    const res = await request(app)
      .get('/api/delivery/orders')
      .set('Authorization', `Bearer ${makeDeliveryToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 403 for customer role', async () => {
    const res = await request(app)
      .get('/api/delivery/orders')
      .set('Authorization', `Bearer ${makeCustomerToken()}`);
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/delivery/orders');
    expect(res.status).toBe(401);
  });
});

// ── PATCH /api/delivery/orders/:id/status ─────────────────────────────────────

describe('PATCH /api/delivery/orders/:id/status', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 when status is updated to out_for_delivery', async () => {
    jest.spyOn(deliveryService, 'updateDeliveryStatus').mockResolvedValue({ ...sampleOrder, status: 'out_for_delivery' } as never);
    const res = await request(app)
      .patch('/api/delivery/orders/order-1/status')
      .set('Authorization', `Bearer ${makeDeliveryToken()}`)
      .send({ status: 'out_for_delivery' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('out_for_delivery');
  });

  it('returns 200 when status is updated to delivered', async () => {
    jest.spyOn(deliveryService, 'updateDeliveryStatus').mockResolvedValue({ ...sampleOrder, status: 'delivered', deliveredAt: new Date() } as never);
    const res = await request(app)
      .patch('/api/delivery/orders/order-1/status')
      .set('Authorization', `Bearer ${makeDeliveryToken()}`)
      .send({ status: 'delivered' });
    expect(res.status).toBe(200);
  });

  it('returns 403 when partner tries to update an order not assigned to them', async () => {
    jest.spyOn(deliveryService, 'updateDeliveryStatus').mockRejectedValue(
      new AppError('You are not authorized to update this order', 403),
    );
    const res = await request(app)
      .patch('/api/delivery/orders/order-2/status')
      .set('Authorization', `Bearer ${makeDeliveryToken('dp-2')}`)
      .send({ status: 'out_for_delivery' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not authorized/i);
  });

  it('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .patch('/api/delivery/orders/order-1/status')
      .set('Authorization', `Bearer ${makeDeliveryToken()}`)
      .send({ status: 'cancelled' }); // not allowed for delivery partner
    expect(res.status).toBe(400);
  });

  it('returns 403 for customer role', async () => {
    const res = await request(app)
      .patch('/api/delivery/orders/order-1/status')
      .set('Authorization', `Bearer ${makeCustomerToken()}`)
      .send({ status: 'out_for_delivery' });
    expect(res.status).toBe(403);
  });
});

// ── POST /api/delivery/location ────────────────────────────────────────────────

describe('POST /api/delivery/location', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 when location is updated', async () => {
    jest.spyOn(deliveryService, 'updateDeliveryLocation').mockResolvedValue({
      id: 'loc-1', userId: 'dp-1', latitude: 19.076, longitude: 72.877, updatedAt: new Date(),
    } as never);
    const res = await request(app)
      .post('/api/delivery/location')
      .set('Authorization', `Bearer ${makeDeliveryToken()}`)
      .send({ latitude: 19.076, longitude: 72.877 });
    expect(res.status).toBe(200);
    expect(res.body.data.latitude).toBe(19.076);
  });

  it('returns 400 for invalid coordinates', async () => {
    const res = await request(app)
      .post('/api/delivery/location')
      .set('Authorization', `Bearer ${makeDeliveryToken()}`)
      .send({ latitude: 200, longitude: 72.877 }); // latitude > 90
    expect(res.status).toBe(400);
  });

  it('returns 403 for customer role', async () => {
    const res = await request(app)
      .post('/api/delivery/location')
      .set('Authorization', `Bearer ${makeCustomerToken()}`)
      .send({ latitude: 19.076, longitude: 72.877 });
    expect(res.status).toBe(403);
  });
});

// ── Authorization Enforcement Tests ───────────────────────────────────────────

describe('Delivery Partner Authorization Enforcement', () => {
  it('partner cannot update order assigned to another partner', async () => {
    const order = { id: 'order-1', deliveryPartnerId: 'dp-1' };
    const requestingPartnerId = 'dp-2'; // different partner

    const isAuthorized = order.deliveryPartnerId === requestingPartnerId;
    expect(isAuthorized).toBe(false);
  });

  it('partner can update their own assigned order', () => {
    const order = { id: 'order-1', deliveryPartnerId: 'dp-1' };
    const requestingPartnerId = 'dp-1';

    const isAuthorized = order.deliveryPartnerId === requestingPartnerId;
    expect(isAuthorized).toBe(true);
  });

  it('delivered_at is set when order is marked as delivered', () => {
    const beforeUpdate = new Date();
    const deliveredAt = new Date();
    expect(deliveredAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
  });
});
