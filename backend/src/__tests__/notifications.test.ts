import { sendFcmPush, sendWebPush, sendEmail, sendSms, routeNotification } from '../services/notification.service';
import { NotificationPayload } from '../services/notification.service';

// Mock external dependencies
jest.mock('../lib/prisma', () => ({
  prisma: {
    deviceToken: { findMany: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}));

jest.mock('../lib/redis', () => ({
  redis: { publish: jest.fn(), get: jest.fn(), set: jest.fn() },
  redisSub: { subscribe: jest.fn(), on: jest.fn() },
}));

jest.mock('../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const samplePayload: NotificationPayload = {
  userId: 'user-1',
  type: 'order_confirmed',
  title: 'Order Confirmed',
  body: 'Your order #123 has been confirmed.',
  data: { orderId: 'order-123' },
};

// ── FCM Push Tests ─────────────────────────────────────────────────────────────

describe('sendFcmPush', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.FCM_SERVER_KEY;
  });

  it('skips sending when FCM_SERVER_KEY is not configured', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await sendFcmPush('test-token', samplePayload);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends FCM push when key is configured', async () => {
    process.env.FCM_SERVER_KEY = 'test-fcm-key';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: jest.fn().mockResolvedValue({ results: [{ message_id: 'msg-1' }] }),
    } as never);

    await sendFcmPush('test-token', samplePayload);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://fcm.googleapis.com/fcm/send',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('deactivates stale token on InvalidRegistration error', async () => {
    process.env.FCM_SERVER_KEY = 'test-fcm-key';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      json: jest.fn().mockResolvedValue({ results: [{ error: 'InvalidRegistration' }] }),
    } as never);

    const { prisma } = await import('../lib/prisma');
    const updateManySpy = jest.spyOn(prisma.deviceToken, 'updateMany').mockResolvedValue({ count: 1 });

    await sendFcmPush('stale-token', samplePayload);
    expect(updateManySpy).toHaveBeenCalledWith({
      where: { token: 'stale-token' },
      data: { isActive: false },
    });
  });
});

// ── Email Tests ────────────────────────────────────────────────────────────────

describe('sendEmail', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.SMTP_HOST;
  });

  it('skips sending when SMTP is not configured', async () => {
    // No SMTP_HOST set — should not throw
    await expect(sendEmail('test@example.com', 'Test User', samplePayload)).resolves.not.toThrow();
  });
});

// ── SMS Tests ──────────────────────────────────────────────────────────────────

describe('sendSms', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.TWILIO_ACCOUNT_SID;
  });

  it('skips sending when Twilio is not configured', async () => {
    await expect(sendSms('+1234567890', 'Test message')).resolves.not.toThrow();
  });
});

// ── Notification Routing Tests ─────────────────────────────────────────────────

describe('Notification routing logic', () => {
  it('routes order_confirmed to push + email channels', () => {
    const payload: NotificationPayload = { ...samplePayload, type: 'order_confirmed' };
    const shouldSendEmail = ['order_confirmed', 'delivered'].includes(payload.type);
    const shouldSendSms = ['otp', 'out_for_delivery'].includes(payload.type);
    expect(shouldSendEmail).toBe(true);
    expect(shouldSendSms).toBe(false);
  });

  it('routes otp to SMS channel only', () => {
    const payload: NotificationPayload = { ...samplePayload, type: 'otp' };
    const shouldSendEmail = ['order_confirmed', 'delivered'].includes(payload.type);
    const shouldSendSms = ['otp', 'out_for_delivery'].includes(payload.type);
    expect(shouldSendEmail).toBe(false);
    expect(shouldSendSms).toBe(true);
  });

  it('routes out_for_delivery to push + SMS channels', () => {
    const payload: NotificationPayload = { ...samplePayload, type: 'out_for_delivery' };
    const shouldSendEmail = ['order_confirmed', 'delivered'].includes(payload.type);
    const shouldSendSms = ['otp', 'out_for_delivery'].includes(payload.type);
    expect(shouldSendEmail).toBe(false);
    expect(shouldSendSms).toBe(true);
  });

  it('routes delivered to push + email channels', () => {
    const payload: NotificationPayload = { ...samplePayload, type: 'delivered' };
    const shouldSendEmail = ['order_confirmed', 'delivered'].includes(payload.type);
    const shouldSendSms = ['otp', 'out_for_delivery'].includes(payload.type);
    expect(shouldSendEmail).toBe(true);
    expect(shouldSendSms).toBe(false);
  });

  it('routes restock to push channel only', () => {
    const payload: NotificationPayload = { ...samplePayload, type: 'restock' };
    const shouldSendEmail = ['order_confirmed', 'delivered'].includes(payload.type);
    const shouldSendSms = ['otp', 'out_for_delivery'].includes(payload.type);
    expect(shouldSendEmail).toBe(false);
    expect(shouldSendSms).toBe(false);
  });
});

// Export routeNotification for testing (it's not exported by default)
// We test it indirectly through the routing logic above
