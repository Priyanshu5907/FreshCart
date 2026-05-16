import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';
import Decimal from 'decimal.js';

const MAX_REDEMPTION_PCT = 0.20; // 20% of order total

// ── Subscription Plans ─────────────────────────────────────────────────────────

export async function listSubscriptionPlans() {
  return prisma.subscriptionPlan.findMany({ where: { isActive: true } });
}

export async function subscribe(userId: string, planId: string, gatewaySubId?: string) {
  const plan = await prisma.subscriptionPlan.findFirst({ where: { id: planId, isActive: true } });
  if (!plan) throw new AppError('Subscription plan not found', 404);

  const now = new Date();
  const renewsAt = new Date(now);
  if (plan.billingCycle === 'monthly') {
    renewsAt.setMonth(renewsAt.getMonth() + 1);
  } else {
    renewsAt.setFullYear(renewsAt.getFullYear() + 1);
  }

  return prisma.userSubscription.create({
    data: { userId, planId, status: 'active', gatewaySubId, startsAt: now, renewsAt },
  });
}

export async function getActiveSubscription(userId: string) {
  return prisma.userSubscription.findFirst({
    where: { userId, status: 'active' },
    include: { plan: true },
  });
}

// ── Loyalty Points ─────────────────────────────────────────────────────────────

export async function getLoyaltyBalance(userId: string): Promise<number> {
  const result = await prisma.loyaltyPoint.aggregate({
    where: { userId },
    _sum: { points: true },
  });
  return Math.max(0, result._sum.points ?? 0);
}

export async function getLoyaltyHistory(userId: string, page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;
  const [history, total] = await Promise.all([
    prisma.loyaltyPoint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.loyaltyPoint.count({ where: { userId } }),
  ]);
  return { history, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function creditLoyaltyPoints(userId: string, orderId: string, orderTotal: number) {
  const points = Math.floor(orderTotal); // 1 point per currency unit
  if (points <= 0) return;

  await prisma.loyaltyPoint.create({
    data: {
      userId,
      orderId,
      points,
      type: 'credit',
      description: `Points earned for order`,
    },
  });

  logger.info('Loyalty points credited', { userId, orderId, points });
}

export async function redeemLoyaltyPoints(
  userId: string,
  pointsToRedeem: number,
  orderTotal: number,
): Promise<number> {
  const balance = await getLoyaltyBalance(userId);

  if (pointsToRedeem > balance) {
    throw new AppError(`Insufficient loyalty points. Balance: ${balance}`, 400);
  }

  const maxRedeemable = Math.floor(orderTotal * MAX_REDEMPTION_PCT);
  const actualRedeem = Math.min(pointsToRedeem, maxRedeemable);

  if (actualRedeem <= 0) return 0;

  await prisma.loyaltyPoint.create({
    data: {
      userId,
      points: -actualRedeem,
      type: 'debit',
      description: 'Points redeemed at checkout',
    },
  });

  logger.info('Loyalty points redeemed', { userId, points: actualRedeem });
  return actualRedeem;
}

export async function debitLoyaltyPointsOnCancellation(userId: string, orderId: string) {
  // Find the credit entry for this order
  const credit = await prisma.loyaltyPoint.findFirst({
    where: { userId, orderId, type: 'credit' },
  });

  if (!credit) return;

  // Check current balance won't go negative (P8)
  const balance = await getLoyaltyBalance(userId);
  const debitAmount = Math.min(credit.points, balance);

  if (debitAmount <= 0) return;

  await prisma.loyaltyPoint.create({
    data: {
      userId,
      orderId,
      points: -debitAmount,
      type: 'debit',
      description: 'Points reversed due to order cancellation',
    },
  });

  logger.info('Loyalty points debited on cancellation', { userId, orderId, points: debitAmount });
}
