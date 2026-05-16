import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';

export async function getWishlist(userId: string) {
  return prisma.wishlist.findMany({
    where: { userId },
    include: {
      product: {
        select: {
          id: true, name: true, slug: true, price: true, discountPct: true,
          stockQty: true, isActive: true,
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      },
    },
  });
}

export async function addToWishlist(userId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true, isDeleted: false },
  });
  if (!product) throw new AppError('Product not found', 404);

  // Idempotent — upsert to avoid duplicates (P10)
  return prisma.wishlist.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId },
    update: {},
  });
}

export async function removeFromWishlist(userId: string, productId: string) {
  const item = await prisma.wishlist.findFirst({ where: { userId, productId } });
  if (!item) throw new AppError('Item not in wishlist', 404);
  await prisma.wishlist.delete({ where: { id: item.id } });
}

export async function moveWishlistItemToCart(userId: string, productId: string) {
  const item = await prisma.wishlist.findFirst({ where: { userId, productId } });
  if (!item) throw new AppError('Item not in wishlist', 404);

  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true, isDeleted: false },
  });
  if (!product) throw new AppError('Product not found', 404);
  if (product.stockQty === 0) throw new AppError('Product is out of stock', 400);

  // Get or create cart
  const cart = await prisma.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  // Add to cart
  const existing = await prisma.cartItem.findFirst({
    where: { cartId: cart.id, productId, savedLater: false },
  });

  if (existing) {
    const newQty = Math.min(existing.quantity + 1, product.stockQty);
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: newQty } });
  } else {
    await prisma.cartItem.create({ data: { cartId: cart.id, productId, quantity: 1 } });
  }

  // Remove from wishlist
  await prisma.wishlist.delete({ where: { id: item.id } });
  logger.info('Wishlist item moved to cart', { userId, productId });
}
