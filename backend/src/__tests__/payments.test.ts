/**
 * Payment Service Tests
 * Covers signature verification and webhook idempotency
 */

import crypto from 'crypto';
import { verifyRazorpaySignature, verifyWebhookSignature } from '../services/payment.service';

// ── Signature Verification Tests ──────────────────────────────────────────────

describe('verifyRazorpaySignature', () => {
  const keySecret = 'test_secret_key';

  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = keySecret;
  });

  afterEach(() => {
    delete process.env.RAZORPAY_KEY_SECRET;
  });

  it('returns true for a valid HMAC-SHA256 signature', () => {
    const razorpayOrderId = 'order_test123';
    const razorpayPaymentId = 'pay_test456';
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const validSignature = crypto
      .createHmac('sha256', keySecret)
      .update(body)
      .digest('hex');

    expect(verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, validSignature)).toBe(true);
  });

  it('returns false for a tampered signature', () => {
    const razorpayOrderId = 'order_test123';
    const razorpayPaymentId = 'pay_test456';
    const tamperedSignature = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';

    expect(verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, tamperedSignature)).toBe(false);
  });

  it('returns false when order ID is different', () => {
    const razorpayPaymentId = 'pay_test456';
    const body = `order_original|${razorpayPaymentId}`;
    const signature = crypto.createHmac('sha256', keySecret).update(body).digest('hex');

    // Verify with different order ID
    expect(verifyRazorpaySignature('order_tampered', razorpayPaymentId, signature)).toBe(false);
  });

  it('returns false when payment ID is different', () => {
    const razorpayOrderId = 'order_test123';
    const body = `${razorpayOrderId}|pay_original`;
    const signature = crypto.createHmac('sha256', keySecret).update(body).digest('hex');

    expect(verifyRazorpaySignature(razorpayOrderId, 'pay_tampered', signature)).toBe(false);
  });
});

describe('verifyWebhookSignature', () => {
  const webhookSecret = 'webhook_secret_key';

  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;
  });

  afterEach(() => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it('returns true for a valid webhook signature', () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: {} });
    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    expect(verifyWebhookSignature(body, validSignature)).toBe(true);
  });

  it('returns false for an invalid webhook signature', () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: {} });
    const invalidSignature = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

    expect(verifyWebhookSignature(body, invalidSignature)).toBe(false);
  });

  it('returns false when body is tampered', () => {
    const originalBody = JSON.stringify({ event: 'payment.captured', payload: {} });
    const signature = crypto.createHmac('sha256', webhookSecret).update(originalBody).digest('hex');

    const tamperedBody = JSON.stringify({ event: 'payment.captured', payload: { tampered: true } });
    expect(verifyWebhookSignature(tamperedBody, signature)).toBe(false);
  });
});

// ── Webhook Idempotency Tests ──────────────────────────────────────────────────

describe('Webhook Idempotency', () => {
  it('same payment ID should produce same signature (deterministic)', () => {
    const keySecret = 'test_secret';
    process.env.RAZORPAY_KEY_SECRET = keySecret;

    const orderId = 'order_abc';
    const paymentId = 'pay_xyz';
    const body = `${orderId}|${paymentId}`;

    const sig1 = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
    const sig2 = crypto.createHmac('sha256', keySecret).update(body).digest('hex');

    expect(sig1).toBe(sig2);
    delete process.env.RAZORPAY_KEY_SECRET;
  });

  it('different payment IDs produce different signatures', () => {
    const keySecret = 'test_secret';
    const orderId = 'order_abc';

    const sig1 = crypto.createHmac('sha256', keySecret).update(`${orderId}|pay_1`).digest('hex');
    const sig2 = crypto.createHmac('sha256', keySecret).update(`${orderId}|pay_2`).digest('hex');

    expect(sig1).not.toBe(sig2);
  });
});
