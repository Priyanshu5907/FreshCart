import { prisma } from '../lib/prisma';
import { redis, redisSub } from '../lib/redis';
import { logger } from '../lib/logger';

// ── Notification Types ─────────────────────────────────────────────────────────

export interface NotificationPayload {
  userId: string;
  type: 'order_confirmed' | 'order_status' | 'out_for_delivery' | 'delivered' | 'restock' | 'promotion' | 'otp';
  title: string;
  body: string;
  data?: Record<string, string>;
}

// ── Redis Pub/Sub Worker ───────────────────────────────────────────────────────

export function startNotificationWorker() {
  redisSub.subscribe('notifications', (err) => {
    if (err) {
      logger.error('Failed to subscribe to notifications channel', { err });
      return;
    }
    logger.info('Notification worker subscribed to Redis channel');
  });

  redisSub.on('message', async (_channel: string, message: string) => {
    try {
      const payload = JSON.parse(message) as NotificationPayload;
      await routeNotification(payload);
    } catch (err) {
      logger.error('Failed to process notification', { err });
    }
  });
}

export async function publishNotification(payload: NotificationPayload) {
  await redis.publish('notifications', JSON.stringify(payload));
}

async function routeNotification(payload: NotificationPayload) {
  const { userId, type } = payload;

  // Get user's device tokens and preferences
  const tokens = await prisma.deviceToken.findMany({
    where: { userId, isActive: true },
  });

  // Send push notifications to all registered devices
  for (const token of tokens) {
    if (token.platform === 'web') {
      await sendWebPush(token.token, payload);
    } else {
      await sendFcmPush(token.token, payload);
    }
  }

  // Send email for order events
  if (['order_confirmed', 'delivered'].includes(type)) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (user?.email) {
      await sendEmail(user.email, user.name, payload);
    }
  }

  // Send SMS for OTP and out_for_delivery
  if (['otp', 'out_for_delivery'].includes(type)) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
    if (user?.phone) {
      await sendSms(user.phone, payload.body);
    }
  }
}

// ── FCM Push Notifications ─────────────────────────────────────────────────────

export async function sendFcmPush(token: string, payload: NotificationPayload) {
  const fcmKey = process.env.FCM_SERVER_KEY;
  if (!fcmKey) {
    logger.warn('FCM not configured – skipping push notification', { token: token.slice(0, 10) });
    return;
  }

  try {
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${fcmKey}`,
      },
      body: JSON.stringify({
        to: token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
      }),
    });

    const result = await response.json() as { results?: Array<{ error?: string }> };

    // Auto-remove stale tokens on InvalidRegistration
    if (result.results?.[0]?.error === 'InvalidRegistration') {
      await prisma.deviceToken.updateMany({
        where: { token },
        data: { isActive: false },
      });
      logger.info('Stale FCM token deactivated', { token: token.slice(0, 10) });
    }
  } catch (err) {
    logger.error('FCM push failed', { err });
  }
}

// ── Web Push Notifications ─────────────────────────────────────────────────────

export async function sendWebPush(subscription: string, payload: NotificationPayload) {
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';

  if (!vapidPublic || !vapidPrivate) {
    logger.warn('VAPID keys not configured – skipping web push');
    return;
  }

  try {
    const webpush = await import('web-push');
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const pushSubscription = JSON.parse(subscription) as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify({ title: payload.title, body: payload.body, data: payload.data }),
    );
  } catch (err) {
    logger.error('Web push failed', { err });
  }
}

// ── Email Notifications ────────────────────────────────────────────────────────

export async function sendEmail(to: string, name: string, payload: NotificationPayload) {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) {
    logger.warn('SMTP not configured – skipping email', { to });
    return;
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM ?? 'noreply@freshcart.com',
      to,
      subject: payload.title,
      html: `<p>Hi ${name},</p><p>${payload.body}</p>`,
    });

    logger.info('Email sent', { to, type: payload.type });
  } catch (err) {
    logger.error('Email send failed', { to, err });
  }
}

// ── SMS Notifications ──────────────────────────────────────────────────────────

export async function sendSms(phone: string, message: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    logger.warn('Twilio not configured – skipping SMS', { phone });
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const twilio = require('twilio');
    const client = twilio(accountSid, authToken);
    await client.messages.create({ body: message, from: fromNumber, to: phone });
    logger.info('SMS sent', { phone });
  } catch (err) {
    logger.error('SMS send failed', { phone, err });
  }
}

// ── Device Token Management ────────────────────────────────────────────────────

export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: 'web' | 'android' | 'ios',
) {
  return prisma.deviceToken.upsert({
    where: { token },
    create: { userId, token, platform, isActive: true },
    update: { userId, isActive: true },
  });
}

export async function unregisterDeviceToken(userId: string, token: string) {
  await prisma.deviceToken.updateMany({
    where: { token, userId },
    data: { isActive: false },
  });
}
