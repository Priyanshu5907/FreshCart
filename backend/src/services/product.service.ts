import { prisma } from '../lib/prisma';
import { getOrSet, invalidateCache } from '../lib/cache';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';

const CACHE_TTL = {
  CATEGORIES: 5 * 60,       // 5 min
  FEATURED: 5 * 60,
  DEALS: 5 * 60,
  PRODUCT: 10 * 60,
  SEARCH: 2 * 60,
  RECOMMENDATIONS: 30 * 60,
};

// ── Categories ────────────────────────────────────────────────────────────────

export async function listCategories() {
  return getOrSet('categories:all', CACHE_TTL.CATEGORIES, () =>
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
  );
}

// ── Products ──────────────────────────────────────────────────────────────────

export interface ProductFilters {
  q?: string;
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  brand?: string;
  sort?: 'price_asc' | 'price_desc' | 'rating_desc' | 'newest';
  page?: number;
  pageSize?: number;
}

export async function listProducts(filters: ProductFilters) {
  const {
    q,
    categorySlug,
    minPrice,
    maxPrice,
    minRating,
    brand,
    sort = 'newest',
    page = 1,
    pageSize = 20,
  } = filters;

  const skip = (page - 1) * pageSize;

  // Build where clause
  const where: Record<string, unknown> = {
    isActive: true,
    isDeleted: false,
  };

  if (categorySlug) {
    const category = await prisma.category.findUnique({ where: { slug: categorySlug } });
    if (category) {
      where.categoryId = category.id;
    }
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.price = {
      ...(minPrice !== undefined && { gte: minPrice }),
      ...(maxPrice !== undefined && { lte: maxPrice }),
    };
  }

  if (brand) {
    where.brand = { contains: brand, mode: 'insensitive' };
  }

  // Full-text search via pg_trgm
  if (q && q.length >= 2) {
    // Use raw query for full-text search
    const searchResults = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM products
      WHERE is_active = true AND is_deleted = false
        AND (
          search_vector @@ plainto_tsquery('english', ${q})
          OR name ILIKE ${'%' + q + '%'}
        )
      LIMIT 200
    `;
    const ids = searchResults.map((r) => r.id);
    if (ids.length === 0) {
      return { products: [], total: 0, page, pageSize, totalPages: 0 };
    }
    where.id = { in: ids };
  }

  // Sort order
  let orderBy: Record<string, string> | Array<Record<string, string>>;
  switch (sort) {
    case 'price_asc':
      orderBy = { price: 'asc' };
      break;
    case 'price_desc':
      orderBy = { price: 'desc' };
      break;
    case 'rating_desc':
      orderBy = { id: 'desc' }; // placeholder — real rating sort uses aggregation
      break;
    case 'newest':
    default:
      orderBy = { id: 'desc' };
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        _count: { select: { reviews: true } },
      },
      orderBy,
      skip,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  // Filter by minRating if specified (requires aggregation — done in-memory for simplicity)
  let filtered = products;
  if (minRating !== undefined) {
    const productIds = products.map((p) => p.id);
    const ratings = await prisma.review.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _avg: { rating: true },
    });
    const ratingMap = new Map(ratings.map((r) => [r.productId, r._avg.rating ?? 0]));
    filtered = products.filter((p) => (ratingMap.get(p.id) ?? 0) >= minRating);
  }

  return {
    products: filtered,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getAutoSuggestions(q: string): Promise<string[]> {
  if (q.length < 2) return [];

  const results = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT DISTINCT name FROM products
    WHERE is_active = true AND is_deleted = false
      AND name ILIKE ${'%' + q + '%'}
    ORDER BY name
    LIMIT 10
  `;

  return results.map((r) => r.name);
}

export async function getFeaturedProducts() {
  return getOrSet('products:featured', CACHE_TTL.FEATURED, () =>
    prisma.product.findMany({
      where: { isFeatured: true, isActive: true, isDeleted: false },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: { select: { id: true, name: true, slug: true } },
      },
      take: 20,
    }),
  );
}

export async function getDealsOfTheDay() {
  return getOrSet('products:deals', CACHE_TTL.DEALS, () =>
    prisma.product.findMany({
      where: {
        isActive: true,
        isDeleted: false,
        discountPct: { gt: 0 },
      },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { discountPct: 'desc' },
      take: 20,
    }),
  );
}

export async function getProductBySlug(slug: string) {
  const cacheKey = `product:slug:${slug}`;
  return getOrSet(cacheKey, CACHE_TTL.PRODUCT, async () => {
    const product = await prisma.product.findFirst({
      where: { slug, isActive: true, isDeleted: false },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { reviews: true } },
      },
    });

    if (!product) throw new AppError('Product not found', 404);

    // Compute average rating
    const ratingAgg = await prisma.review.aggregate({
      where: { productId: product.id },
      _avg: { rating: true },
    });

    return {
      ...product,
      averageRating: ratingAgg._avg.rating
        ? Math.round(ratingAgg._avg.rating * 10) / 10
        : null,
    };
  });
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export async function getProductReviews(
  productId: string,
  page = 1,
  pageSize = 10,
) {
  const skip = (page - 1) * pageSize;

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.review.count({ where: { productId } }),
  ]);

  return { reviews, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function submitReview(
  productId: string,
  userId: string,
  rating: number,
  comment?: string,
) {
  // Check for duplicate review
  const existing = await prisma.review.findFirst({ where: { productId, userId } });
  if (existing) {
    throw new AppError('You have already reviewed this product', 409);
  }

  // Check for verified purchase
  const purchase = await prisma.orderItem.findFirst({
    where: {
      productId,
      order: { userId, status: { not: 'cancelled' } },
    },
  });

  const review = await prisma.review.create({
    data: {
      productId,
      userId,
      rating,
      comment,
      isVerifiedPurchase: !!purchase,
    },
  });

  // Invalidate product cache
  await invalidateCache(`product:slug:*`);
  logger.info('Review submitted', { productId, userId });

  return review;
}

// ── Recommendations ───────────────────────────────────────────────────────────

export async function getRecommendations(userId: string) {
  const cacheKey = `recommendations:${userId}`;
  const cached = await import('../lib/redis').then(({ redis }) => redis.get(cacheKey));

  if (cached) {
    return JSON.parse(cached) as unknown[];
  }

  // Cold-start fallback: top-selling products globally
  const topProducts = await prisma.product.findMany({
    where: { isActive: true, isDeleted: false, stockQty: { gt: 0 } },
    include: {
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      category: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { id: 'desc' },
    take: 10,
  });

  return topProducts;
}
