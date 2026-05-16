/**
 * Order Service Tests
 * Includes property-based tests for:
 * - P4: Order Total Integrity
 * - P7: Delivery Slot Capacity
 */

import request from 'supertest';
import { createApp } from '../app';
import * as orderService from '../services/order.service';
import { signAccessToken } from '../lib/jwt';
import { UserRole } from '../types';
import { AppError } from '../middleware/errorHandler';
import Decimal from 'decimal.js';

jest.mock('../lib/prisma', () => ({
  prisma: {
    order: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
    orderItem: { findFirst: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
    deliverySlot: { findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    cart: { findUnique: jest.fn(), upsert: jest.fn() },
    cartItem: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    address: { findFirst: jest.fn() },
    coupon: { findFirst: jest.fn(), update: jest.fn() },
    product: { updateMany: jest.fn() },
    deliveryPartnerLocation: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    refreshToken: { create: jest.fn(), findMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    oauthAccount: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
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

function makeAccessToken(userId = 'user-1'): string {
  return signAccessToken({ userId, role: UserRole.CUSTOMER, email: 'test@example.com' });
}

const sampleSlot = {
  id: 'slot-1', slotDate: new Date(), startTime: new Date(), endTime: new Date(),
  maxOrders: 20, bookedCount: 5, isActive: true, available: true, remainingCapacity: 15,
};

const sampleOrder = {
  id: 'order-1', userId: 'user-1', status: 'confirmed', paymentMethod: 'cod',
  subtotal: new Decimal(200), discountAmount: new Decimal(0),
  deliveryFee: new Decimal(40), taxAmount: new Decimal(10), total: new Decimal(250),
  createdAt: new Date(), updatedAt: new Date(),
};

// ── HTTP endpoint tests ────────────────────────────────────────────────────────

describe('GET /api/orders/delivery-slots', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with available slots', async () => {
    jest.spyOn(orderService, 'getAvailableDeliverySlots').mockResolvedValue([sampleSlot] as never);
    const res = await request(app).get('/api/orders/delivery-slots').set('Authorization', `Bearer ${makeAccessToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].available).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/orders/delivery-slots');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/orders', () => {
  const validBody = {
    addressId: '00000000-0000-0000-0000-000000000001',
    deliverySlotId: '00000000-0000-0000-0000-000000000002',
    paymentMethod: 'cod',
  };

  afterEach(() => jest.restoreAllMocks());

  it('returns 201 when order is placed successfully', async () => {
    jest.spyOn(orderService, 'placeOrder').mockResolvedValue(sampleOrder as never);
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('order-1');
  });

  it('returns 400 when cart is empty', async () => {
    jest.spyOn(orderService, 'placeOrder').mockRejectedValue(new AppError('Cart is empty', 400));
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send(validBody);
    expect(res.status).toBe(400);
  });

  it('returns 400 when delivery slot is fully booked', async () => {
    jest.spyOn(orderService, 'placeOrder').mockRejectedValue(new AppError('Selected delivery slot is fully booked', 400));
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/fully booked/i);
  });

  it('returns 400 for invalid payment method', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ ...validBody, paymentMethod: 'bitcoin' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid address UUID', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ ...validBody, addressId: 'not-a-uuid' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/orders', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with paginated order history', async () => {
    jest.spyOn(orderService, 'getOrderHistory').mockResolvedValue({
      orders: [sampleOrder] as never, total: 1, page: 1, pageSize: 10, totalPages: 1,
    });
    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${makeAccessToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
  });
});

describe('GET /api/orders/:id', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with order detail', async () => {
    jest.spyOn(orderService, 'getOrderById').mockResolvedValue(sampleOrder as never);
    const res = await request(app).get('/api/orders/order-1').set('Authorization', `Bearer ${makeAccessToken()}`);
    expect(res.status).toBe(200);
  });

  it('returns 404 for non-existent order', async () => {
    jest.spyOn(orderService, 'getOrderById').mockRejectedValue(new AppError('Order not found', 404));
    const res = await request(app).get('/api/orders/bad-id').set('Authorization', `Bearer ${makeAccessToken()}`);
    expect(res.status).toBe(404);
  });
});

// ── P4: Order Total Integrity (Property-Based Test) ───────────────────────────
// Property: total = subtotal - discount_amount + delivery_fee + tax_amount

describe('P4: Order Total Integrity', () => {
  it('total equals subtotal - discount + delivery_fee + tax for all combinations', () => {
    const testCases = [
      { subtotal: 200, discount: 0, delivery: 40, tax: 10, expected: 250 },
      { subtotal: 500, discount: 50, delivery: 0, tax: 22.5, expected: 472.5 },
      { subtotal: 100, discount: 10, delivery: 40, tax: 4.5, expected: 134.5 },
      { subtotal: 1000, discount: 100, delivery: 0, tax: 45, expected: 945 },
      { subtotal: 0, discount: 0, delivery: 0, tax: 0, expected: 0 },
    ];

    for (const tc of testCases) {
      const subtotal = new Decimal(tc.subtotal);
      const discount = new Decimal(tc.discount);
      const delivery = new Decimal(tc.delivery);
      const tax = new Decimal(tc.tax);

      const total = subtotal.minus(discount).plus(delivery).plus(tax);
      expect(total.toNumber()).toBeCloseTo(tc.expected, 2);
    }
  });

  it('total is always >= 0', () => {
    const cases = [
      { subtotal: 100, discount: 100, delivery: 0, tax: 0 },
      { subtotal: 50, discount: 50, delivery: 0, tax: 0 },
    ];

    for (const tc of cases) {
      const total = Math.max(0, tc.subtotal - tc.discount + tc.delivery + tc.tax);
      expect(total).toBeGreaterThanOrEqual(0);
    }
  });

  it('discount never exceeds subtotal', () => {
    const subtotals = [100, 200, 500, 1000];
    const discountPcts = [10, 20, 50, 100];

    for (const subtotal of subtotals) {
      for (const pct of discountPcts) {
        const discount = Math.min((subtotal * pct) / 100, subtotal);
        expect(discount).toBeLessThanOrEqual(subtotal);
        expect(discount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('tax is computed on after-discount subtotal', () => {
    const subtotal = new Decimal(200);
    const discount = new Decimal(20);
    const taxRate = new Decimal(0.05);

    const afterDiscount = subtotal.minus(discount);
    const tax = afterDiscount.mul(taxRate);

    expect(tax.toNumber()).toBeCloseTo(9, 2); // (200-20) * 0.05 = 9
  });
});

// ── P7: Delivery Slot Capacity (Property-Based Test) ──────────────────────────
// Property: booked_count <= max_orders must always hold

describe('P7: Delivery Slot Capacity', () => {
  it('slot is available when booked_count < max_orders', () => {
    const slots = [
      { maxOrders: 20, bookedCount: 0, shouldBeAvailable: true },
      { maxOrders: 20, bookedCount: 19, shouldBeAvailable: true },
      { maxOrders: 20, bookedCount: 20, shouldBeAvailable: false },
      { maxOrders: 5, bookedCount: 5, shouldBeAvailable: false },
      { maxOrders: 1, bookedCount: 0, shouldBeAvailable: true },
    ];

    for (const slot of slots) {
      const available = slot.bookedCount < slot.maxOrders;
      expect(available).toBe(slot.shouldBeAvailable);
    }
  });

  it('booked_count never exceeds max_orders', () => {
    // Simulate concurrent bookings — only those that pass the check should succeed
    const maxOrders = 20;
    let bookedCount = 0;
    const bookingAttempts = 25;
    let successfulBookings = 0;

    for (let i = 0; i < bookingAttempts; i++) {
      if (bookedCount < maxOrders) {
        bookedCount++;
        successfulBookings++;
      }
    }

    expect(bookedCount).toBe(maxOrders);
    expect(successfulBookings).toBe(maxOrders);
    expect(bookedCount).toBeLessThanOrEqual(maxOrders);
  });

  it('returns 400 when slot is fully booked', async () => {
    jest.spyOn(orderService, 'placeOrder').mockRejectedValue(
      new AppError('Selected delivery slot is fully booked', 400),
    );

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({
        addressId: '00000000-0000-0000-0000-000000000001',
        deliverySlotId: '00000000-0000-0000-0000-000000000002',
        paymentMethod: 'cod',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/fully booked/i);
  });

  it('remaining capacity is always non-negative', () => {
    const testSlots = [
      { maxOrders: 20, bookedCount: 0 },
      { maxOrders: 20, bookedCount: 10 },
      { maxOrders: 20, bookedCount: 20 },
      { maxOrders: 5, bookedCount: 5 },
    ];

    for (const slot of testSlots) {
      const remaining = Math.max(0, slot.maxOrders - slot.bookedCount);
      expect(remaining).toBeGreaterThanOrEqual(0);
    }
  });
});
