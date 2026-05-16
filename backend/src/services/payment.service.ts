import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';

// ── Razorpay Order Creation ────────────────────────────────────────────────────

export async function initiatePayment(orderId: string, userId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
  });

  if (!order) throw new AppError('Order not found', 404);
  if (order.paymentMethod === 'cod') {
    throw new AppError('COD orders do not require payment initiation', 400);
  }
  if (order.paymentStatus === 'paid') {
    throw new AppError('Order is already paid', 400);
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    // Development fallback
    logger.warn('Razorpay not configured – returning mock payment order');
    return {
      razorpayOrderId: `order_mock_${Date.now()}`,
      amount: Number(order.total) * 100, // paise
      currency: 'INR',
      key: 'rzp_test_mock',
      orderId: order.id,
    };
  }

  // Create Razorpay order via API
  const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    },
    body: JSON.stringify({
      amount: Math.round(Number(order.total) * 100),
      currency: 'INR',
      receipt: order.id,
    }),
  });

  if (!razorpayResponse.ok) {
    const error = await razorpayResponse.text();
    logger.error('Razorpay order creation failed', { orderId, error });
    throw new AppError('Payment initiation failed. Please try again.', 502);
  }

  const razorpayOrder = await razorpayResponse.json() as { id: string; amount: number; currency: string };

  // Store Razorpay order ID for webhook verification
  await redis.set(`razorpay:order:${razorpayOrder.id}`, orderId, 'EX', 24 * 60 * 60);

  return {
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    key: keyId,
    orderId: order.id,
  };
}

// ── Signature Verification ─────────────────────────────────────────────────────

export function verifyRazorpaySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? '';
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(signature, 'hex'),
  );
}

export function verifyWebhookSignature(body: string, signature: string): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(signature, 'hex'),
  );
}

// ── Webhook Handler ────────────────────────────────────────────────────────────

export async function handleWebhook(rawBody: string, signature: string) {
  // Verify webhook signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    throw new AppError('Invalid webhook signature', 400);
  }

  const event = JSON.parse(rawBody) as {
    event: string;
    payload: {
      payment: {
        entity: {
          id: string;
          order_id: string;
          status: string;
        };
      };
    };
  };

  const payment = event.payload?.payment?.entity;
  if (!payment) return { processed: false };

  // Idempotency check — skip if already processed
  const idempotencyKey = `webhook:processed:${payment.id}`;
  const alreadyProcessed = await redis.get(idempotencyKey);
  if (alreadyProcessed) {
    logger.info('Webhook already processed', { paymentId: payment.id });
    return { processed: false, reason: 'already_processed' };
  }

  if (event.event === 'payment.captured') {
    // Find the order linked to this Razorpay order
    const orderId = await redis.get(`razorpay:order:${payment.order_id}`);

    if (orderId) {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'paid',
          paymentGatewayId: payment.id,
          status: 'confirmed',
        },
      });
      logger.info('Payment confirmed via webhook', { orderId, paymentId: payment.id });
    }
  } else if (event.event === 'payment.failed') {
    const orderId = await redis.get(`razorpay:order:${payment.order_id}`);
    if (orderId) {
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'failed' },
      });
      logger.warn('Payment failed via webhook', { orderId, paymentId: payment.id });
    }
  }

  // Mark as processed (24h TTL)
  await redis.set(idempotencyKey, '1', 'EX', 24 * 60 * 60);

  return { processed: true };
}

// ── Payment Status ─────────────────────────────────────────────────────────────

export async function getPaymentStatus(orderId: string, userId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: {
      id: true,
      paymentMethod: true,
      paymentStatus: true,
      paymentGatewayId: true,
      total: true,
    },
  });

  if (!order) throw new AppError('Order not found', 404);
  return order;
}
