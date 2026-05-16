import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';
import Decimal from 'decimal.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CartItemWithProduct {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  savedLater: boolean;
  product: {
    id: string;
    name: string;
    slug: string;
    price: Decimal;
    discountPct: Decimal;
    stockQty: number;
    isActive: boolean;
    images: Array<{ url: string; sortOrder: number }>;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeDiscountedPrice(price: Decimal, discountPct: Decimal): Decimal {
  return price.mul(new Decimal(1).minus(discountPct.div(100)));
}

function computeSubtotal(items: CartItemWithProduct[]): Decimal {
  return items.reduce((sum, item) => {
    const discounted = computeDiscountedPrice(item.product.price, item.product.discountPct);
    return sum.plus(discounted.mul(item.quantity));
  }, new Decimal(0));
}

async function getOrCreateCart(userId: string) {
  let cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) {
    cart = await prisma.cart.create({ data: { userId } });
  }
  return cart;
}

// ── Cart Read ──────────────────────────────────────────────────────────────────

export async function getCart(userId: string) {
  const cart = await getOrCreateCart(userId);

  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          discountPct: true,
          stockQty: true,
          isActive: true,
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      },
    },
  });

  const activeItems = items.filter((i) => !i.savedLater);
  const savedItems = items.filter((i) => i.savedLater);

  const subtotal = computeSubtotal(activeItems as CartItemWithProduct[]);

  return {
    cartId: cart.id,
    items: activeItems,
    savedForLater: savedItems,
    subtotal: subtotal.toFixed(2),
    itemCount: activeItems.reduce((sum, i) => sum + i.quantity, 0),
  };
}

// ── Add Item ───────────────────────────────────────────────────────────────────

export async function addItem(userId: string, productId: string, quantity = 1) {
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true, isDeleted: false },
  });

  if (!product) throw new AppError('Product not found or unavailable', 404);
  if (product.stockQty === 0) throw new AppError('Product is out of stock', 400);

  const cart = await getOrCreateCart(userId);

  const existing = await prisma.cartItem.findFirst({
    where: { cartId: cart.id, productId, savedLater: false },
  });

  if (existing) {
    // Increment quantity, cap at stock
    const newQty = Math.min(existing.quantity + quantity, product.stockQty);
    const capped = newQty < existing.quantity + quantity;

    const updated = await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: newQty },
      include: { product: { select: { id: true, name: true, slug: true, price: true, discountPct: true, stockQty: true, isActive: true, images: { take: 1 } } } },
    });

    return { item: updated, capped };
  }

  // New item
  const cappedQty = Math.min(quantity, product.stockQty);
  const item = await prisma.cartItem.create({
    data: { cartId: cart.id, productId, quantity: cappedQty, savedLater: false },
    include: { product: { select: { id: true, name: true, slug: true, price: true, discountPct: true, stockQty: true, isActive: true, images: { take: 1 } } } },
  });

  logger.info('Item added to cart', { userId, productId, quantity: cappedQty });
  return { item, capped: cappedQty < quantity };
}

// ── Update Quantity ────────────────────────────────────────────────────────────

export async function updateItemQuantity(userId: string, itemId: string, quantity: number) {
  const cart = await getOrCreateCart(userId);

  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
    include: { product: true },
  });

  if (!item) throw new AppError('Cart item not found', 404);

  if (quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: itemId } });
    return null;
  }

  const cappedQty = Math.min(quantity, item.product.stockQty);
  const updated = await prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity: cappedQty },
    include: { product: { select: { id: true, name: true, slug: true, price: true, discountPct: true, stockQty: true, isActive: true, images: { take: 1 } } } },
  });

  return updated;
}

// ── Remove Item ────────────────────────────────────────────────────────────────

export async function removeItem(userId: string, itemId: string) {
  const cart = await getOrCreateCart(userId);

  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
  if (!item) throw new AppError('Cart item not found', 404);

  await prisma.cartItem.delete({ where: { id: itemId } });
  logger.info('Item removed from cart', { userId, itemId });
}

// ── Save for Later ─────────────────────────────────────────────────────────────

export async function saveForLater(userId: string, itemId: string) {
  const cart = await getOrCreateCart(userId);

  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id, savedLater: false },
  });
  if (!item) throw new AppError('Cart item not found', 404);

  return prisma.cartItem.update({ where: { id: itemId }, data: { savedLater: true } });
}

// ── Move to Cart ───────────────────────────────────────────────────────────────

export async function moveToCart(userId: string, itemId: string) {
  const cart = await getOrCreateCart(userId);

  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id, savedLater: true },
    include: { product: true },
  });
  if (!item) throw new AppError('Saved item not found', 404);

  if (item.product.stockQty === 0) {
    throw new AppError('Product is currently out of stock', 400);
  }

  return prisma.cartItem.update({ where: { id: itemId }, data: { savedLater: false } });
}

// ── Coupon ─────────────────────────────────────────────────────────────────────

export interface CartWithCoupon {
  cartId: string;
  couponId: string | null;
  couponCode: string | null;
  discountAmount: string;
  subtotal: string;
  total: string;
}

export async function applyCoupon(userId: string, code: string): Promise<CartWithCoupon> {
  const now = new Date();

  const coupon = await prisma.coupon.findFirst({
    where: {
      code: { equals: code, mode: 'insensitive' },
      isActive: true,
      startsAt: { lte: now },
      expiresAt: { gte: now },
    },
  });

  if (!coupon) throw new AppError('Invalid or expired coupon code', 400);

  if (coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses) {
    throw new AppError('Coupon usage limit has been reached', 400);
  }

  const cart = await getCart(userId);
  const subtotal = new Decimal(cart.subtotal);

  if (coupon.minOrderValue && subtotal.lt(coupon.minOrderValue)) {
    throw new AppError(
      `Minimum order value of ₹${coupon.minOrderValue} required for this coupon`,
      400,
    );
  }

  let discountAmount: Decimal;
  if (coupon.discountType === 'percentage') {
    discountAmount = subtotal.mul(coupon.discountValue).div(100);
  } else {
    discountAmount = new Decimal(coupon.discountValue);
  }

  // Cap discount at subtotal
  if (discountAmount.gt(subtotal)) discountAmount = subtotal;

  const total = subtotal.minus(discountAmount);

  return {
    cartId: cart.cartId,
    couponId: coupon.id,
    couponCode: coupon.code,
    discountAmount: discountAmount.toFixed(2),
    subtotal: subtotal.toFixed(2),
    total: total.toFixed(2),
  };
}

export async function removeCoupon(userId: string) {
  const cart = await getCart(userId);
  return {
    cartId: cart.cartId,
    couponId: null,
    couponCode: null,
    discountAmount: '0.00',
    subtotal: cart.subtotal,
    total: cart.subtotal,
  };
}
