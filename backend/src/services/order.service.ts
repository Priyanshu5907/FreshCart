import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';
import Decimal from 'decimal.js';

const DELIVERY_FEE = new Decimal(40);
const TAX_RATE = new Decimal(0.05); // 5%
const FREE_DELIVERY_THRESHOLD = new Decimal(500);

// ── Delivery Slots ─────────────────────────────────────────────────────────────

export async function getAvailableDeliverySlots() {
  const now = new Date();
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const slots = await prisma.deliverySlot.findMany({
    where: {
      isActive: true,
      slotDate: { gte: now, lte: sevenDaysLater },
    },
    orderBy: [{ slotDate: 'asc' }, { startTime: 'asc' }],
  });

  return slots.map((slot) => ({
    ...slot,
    available: slot.bookedCount < slot.maxOrders,
    remainingCapacity: slot.maxOrders - slot.bookedCount,
  }));
}

// ── Order Placement ────────────────────────────────────────────────────────────

export interface PlaceOrderInput {
  addressId: string;
  deliverySlotId: string;
  paymentMethod: 'upi' | 'card' | 'cod';
  couponId?: string;
  loyaltyPointsToRedeem?: number;
  paymentGatewayId?: string;
}

export async function placeOrder(userId: string, input: PlaceOrderInput) {
  // Validate address belongs to user
  const address = await prisma.address.findFirst({
    where: { id: input.addressId, userId },
  });
  if (!address) throw new AppError('Address not found', 404);

  // Validate and lock delivery slot
  const slot = await prisma.deliverySlot.findFirst({
    where: { id: input.deliverySlotId, isActive: true },
  });
  if (!slot) throw new AppError('Delivery slot not found', 404);
  if (slot.bookedCount >= slot.maxOrders) {
    throw new AppError('Selected delivery slot is fully booked', 400);
  }

  // Get cart items
  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) throw new AppError('Cart is empty', 400);

  const cartItems = await prisma.cartItem.findMany({
    where: { cartId: cart.id, savedLater: false },
    include: { product: true },
  });

  if (cartItems.length === 0) throw new AppError('Cart is empty', 400);

  // Check for out-of-stock items
  const outOfStock = cartItems.filter((i) => i.product.stockQty < i.quantity);
  if (outOfStock.length > 0) {
    throw new AppError(
      `Some items are out of stock: ${outOfStock.map((i) => i.product.name).join(', ')}`,
      400,
    );
  }

  // Calculate totals
  let subtotal = new Decimal(0);
  for (const item of cartItems) {
    const discounted = new Decimal(item.product.price.toString()).mul(
      new Decimal(1).minus(new Decimal(item.product.discountPct.toString()).div(100)),
    );
    subtotal = subtotal.plus(discounted.mul(item.quantity));
  }

  // Apply coupon discount
  let discountAmount = new Decimal(0);
  let coupon = null;
  if (input.couponId) {
    coupon = await prisma.coupon.findFirst({
      where: { id: input.couponId, isActive: true, expiresAt: { gte: new Date() } },
    });
    if (coupon) {
      if (coupon.discountType === 'percentage') {
        discountAmount = subtotal.mul(coupon.discountValue.toString()).div(100);
      } else {
        discountAmount = new Decimal(coupon.discountValue.toString());
      }
      if (discountAmount.gt(subtotal)) discountAmount = subtotal;
    }
  }

  const afterDiscount = subtotal.minus(discountAmount);
  const deliveryFee = afterDiscount.gte(FREE_DELIVERY_THRESHOLD) ? new Decimal(0) : DELIVERY_FEE;
  const taxAmount = afterDiscount.mul(TAX_RATE);
  const total = afterDiscount.plus(deliveryFee).plus(taxAmount);

  // Create order in a transaction
  const order = await prisma.$transaction(async (tx) => {
    // Decrement stock with optimistic locking
    for (const item of cartItems) {
      const updated = await tx.product.updateMany({
        where: { id: item.productId, stockQty: { gte: item.quantity } },
        data: { stockQty: { decrement: item.quantity } },
      });
      if (updated.count === 0) {
        throw new AppError(`Insufficient stock for ${item.product.name}`, 400);
      }
    }

    // Increment delivery slot booked count
    await tx.deliverySlot.updateMany({
      where: { id: input.deliverySlotId, bookedCount: { lt: slot.maxOrders } },
      data: { bookedCount: { increment: 1 } },
    });

    // Create order
    const newOrder = await tx.order.create({
      data: {
        userId,
        addressId: input.addressId,
        deliverySlotId: input.deliverySlotId,
        couponId: coupon?.id ?? null,
        status: 'confirmed',
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentMethod === 'cod' ? 'pending' : 'paid',
        paymentGatewayId: input.paymentGatewayId ?? null,
        subtotal,
        discountAmount,
        deliveryFee,
        taxAmount,
        total,
        items: {
          create: cartItems.map((item) => {
            const unitPrice = new Decimal(item.product.price.toString());
            const discPct = new Decimal(item.product.discountPct.toString());
            const discounted = unitPrice.mul(new Decimal(1).minus(discPct.div(100)));
            return {
              productId: item.productId,
              productName: item.product.name,
              quantity: item.quantity,
              unitPrice,
              discountPct: discPct,
              totalPrice: discounted.mul(item.quantity),
            };
          }),
        },
      },
      include: { items: true, address: true, deliverySlot: true },
    });

    // Record initial status history
    await tx.orderStatusHistory.create({
      data: { orderId: newOrder.id, status: 'confirmed', changedBy: userId },
    });

    // Increment coupon usage
    if (coupon) {
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usesCount: { increment: 1 } },
      });
    }

    // Clear cart
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return newOrder;
  });

  logger.info('Order placed', { orderId: order.id, userId, total: total.toFixed(2) });
  return order;
}

// ── Order History ──────────────────────────────────────────────────────────────

export async function getOrderHistory(userId: string, page = 1, pageSize = 10) {
  const skip = (page - 1) * pageSize;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { userId },
      include: {
        items: { take: 3 },
        deliverySlot: true,
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.order.count({ where: { userId } }),
  ]);

  return { orders, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getOrderById(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: {
      items: true,
      address: true,
      deliverySlot: true,
      statusHistory: { orderBy: { createdAt: 'asc' } },
      coupon: { select: { code: true, discountType: true, discountValue: true } },
    },
  });

  if (!order) throw new AppError('Order not found', 404);
  return order;
}

export async function reorder(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { items: { include: { product: { select: { id: true, stockQty: true, isActive: true, isDeleted: true } } } } },
  });

  if (!order) throw new AppError('Order not found', 404);

  const cart = await prisma.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  const skipped: string[] = [];
  for (const item of order.items) {
    if (!item.product || item.product.stockQty === 0 || !item.product.isActive || item.product.isDeleted) {
      skipped.push(item.productName);
      continue;
    }

    const existing = await prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId: item.productId, savedLater: false },
    });

    if (existing) {
      const newQty = Math.min(existing.quantity + item.quantity, item.product.stockQty);
      await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: newQty } });
    } else {
      const qty = Math.min(item.quantity, item.product.stockQty);
      await prisma.cartItem.create({
        data: { cartId: cart.id, productId: item.productId, quantity: qty },
      });
    }
  }

  return { skipped };
}

export async function getOrderTracking(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: {
      id: true,
      status: true,
      deliveryPartnerId: true,
      deliveredAt: true,
      statusHistory: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!order) throw new AppError('Order not found', 404);

  let deliveryPartnerLocation = null;
  if (order.deliveryPartnerId) {
    deliveryPartnerLocation = await prisma.deliveryPartnerLocation.findUnique({
      where: { userId: order.deliveryPartnerId },
    });
  }

  return { ...order, deliveryPartnerLocation };
}

// ── Status History ─────────────────────────────────────────────────────────────

export async function recordStatusChange(
  orderId: string,
  status: string,
  changedBy: string,
  note?: string,
) {
  return prisma.orderStatusHistory.create({
    data: { orderId, status, changedBy, note },
  });
}
