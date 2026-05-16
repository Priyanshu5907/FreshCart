import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';

export async function getAssignedOrders(deliveryPartnerId: string) {
  return prisma.order.findMany({
    where: {
      deliveryPartnerId,
      status: { in: ['shipped', 'out_for_delivery'] },
    },
    include: {
      address: true,
      deliverySlot: true,
      items: { take: 3 },
      _count: { select: { items: true } },
    },
    orderBy: { deliverySlot: { startTime: 'asc' } },
  });
}

export async function updateDeliveryStatus(
  orderId: string,
  deliveryPartnerId: string,
  status: 'out_for_delivery' | 'delivered',
) {
  // Enforce that partner can only update their own orders (P5 / Req 15.6)
  const order = await prisma.order.findFirst({
    where: { id: orderId },
  });

  if (!order) throw new AppError('Order not found', 404);

  if (order.deliveryPartnerId !== deliveryPartnerId) {
    throw new AppError('You are not authorized to update this order', 403);
  }

  const updateData: Record<string, unknown> = { status };
  if (status === 'delivered') {
    updateData.deliveredAt = new Date();
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: updateData,
  });

  // Record status history
  await prisma.orderStatusHistory.create({
    data: { orderId, status, changedBy: deliveryPartnerId },
  });

  logger.info('Delivery status updated', { orderId, status, deliveryPartnerId });
  return updated;
}

export async function updateDeliveryLocation(
  deliveryPartnerId: string,
  latitude: number,
  longitude: number,
) {
  const location = await prisma.deliveryPartnerLocation.upsert({
    where: { userId: deliveryPartnerId },
    create: { userId: deliveryPartnerId, latitude, longitude },
    update: { latitude, longitude },
  });

  logger.info('Delivery location updated', { deliveryPartnerId, latitude, longitude });
  return location;
}
