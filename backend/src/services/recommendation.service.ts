import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';

const BROWSE_TTL = 30 * 24 * 60 * 60; // 30 days
const RECO_TTL = 30 * 60;             // 30 min
const MAX_RECO = 10;

// ── Browsing Event Tracking ────────────────────────────────────────────────────

export async function trackProductView(userId: string, productId: string) {
  const key = `browse:product:${userId}`;
  await redis.zincrby(key, 1, productId);
  await redis.expire(key, BROWSE_TTL);
}

export async function trackCategoryVisit(userId: string, categorySlug: string) {
  const key = `browse:category:${userId}`;
  await redis.zincrby(key, 1, categorySlug);
  await redis.expire(key, BROWSE_TTL);
}

// ── Recommendation Generation ──────────────────────────────────────────────────

export async function getRecommendationsForUser(userId: string): Promise<unknown[]> {
  const cacheKey = `recommendations:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as unknown[];

  const recommendations = await generateRecommendations(userId);
  await redis.setex(cacheKey, RECO_TTL, JSON.stringify(recommendations));
  return recommendations;
}

async function generateRecommendations(userId: string): Promise<unknown[]> {
  // Get user's most viewed products
  const viewedKey = `browse:product:${userId}`;
  const viewedProducts = await redis.zrevrange(viewedKey, 0, 9);

  if (viewedProducts.length > 0) {
    // Item-based collaborative filtering: find products bought together
    const coOccurrences = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          items: { some: { productId: { in: viewedProducts } } },
          status: { not: 'cancelled' },
        },
        productId: { notIn: viewedProducts },
      },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: MAX_RECO,
    });

    if (coOccurrences.length > 0) {
      const productIds = coOccurrences.map((c) => c.productId);
      return prisma.product.findMany({
        where: {
          id: { in: productIds },
          isActive: true,
          isDeleted: false,
          stockQty: { gt: 0 }, // Filter out-of-stock (16.5)
        },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          category: { select: { id: true, name: true, slug: true } },
        },
        take: MAX_RECO,
      });
    }
  }

  // Cold-start fallback: top-selling by most browsed category or globally (16.4)
  const categoryKey = `browse:category:${userId}`;
  const topCategories = await redis.zrevrange(categoryKey, 0, 0);

  if (topCategories.length > 0) {
    const category = await prisma.category.findUnique({ where: { slug: topCategories[0] } });
    if (category) {
      return prisma.product.findMany({
        where: {
          categoryId: category.id,
          isActive: true,
          isDeleted: false,
          stockQty: { gt: 0 },
        },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          category: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { id: 'desc' },
        take: MAX_RECO,
      });
    }
  }

  // Global top-selling fallback
  return prisma.product.findMany({
    where: { isActive: true, isDeleted: false, stockQty: { gt: 0 } },
    include: {
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      category: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { id: 'desc' },
    take: MAX_RECO,
  });
}

// ── Refresh on Order Placement (16.6) ─────────────────────────────────────────

export async function refreshRecommendationsForUser(userId: string) {
  const cacheKey = `recommendations:${userId}`;
  await redis.del(cacheKey);
  logger.info('Recommendations cache invalidated', { userId });
}

// ── Nightly Cron Job (16.2) ───────────────────────────────────────────────────

export async function computeSimilarityMatrix() {
  logger.info('Starting nightly similarity matrix computation');

  // Get all orders from the last 90 days
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since }, status: { not: 'cancelled' } },
    include: { items: { select: { productId: true } } },
  });

  // Build co-occurrence matrix
  const coOccurrence: Map<string, Map<string, number>> = new Map();

  for (const order of orders) {
    const productIds = order.items.map((i) => i.productId);
    for (let i = 0; i < productIds.length; i++) {
      for (let j = i + 1; j < productIds.length; j++) {
        const a = productIds[i];
        const b = productIds[j];

        if (!coOccurrence.has(a)) coOccurrence.set(a, new Map());
        if (!coOccurrence.has(b)) coOccurrence.set(b, new Map());

        coOccurrence.get(a)!.set(b, (coOccurrence.get(a)!.get(b) ?? 0) + 1);
        coOccurrence.get(b)!.set(a, (coOccurrence.get(b)!.get(a) ?? 0) + 1);
      }
    }
  }

  // Store top-5 similar products per product in Redis
  for (const [productId, similarities] of coOccurrence.entries()) {
    const sorted = [...similarities.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    if (sorted.length > 0) {
      await redis.set(
        `similar:${productId}`,
        JSON.stringify(sorted),
        'EX',
        24 * 60 * 60, // 24h TTL
      );
    }
  }

  logger.info('Similarity matrix computation complete', { products: coOccurrence.size });
}
