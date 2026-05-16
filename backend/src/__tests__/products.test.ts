import request from 'supertest';
import { createApp } from '../app';
import * as productService from '../services/product.service';
import { signAccessToken } from '../lib/jwt';
import { UserRole } from '../types';
import { AppError } from '../middleware/errorHandler';

jest.mock('../lib/prisma', () => ({
  prisma: {
    category: { findMany: jest.fn(), findUnique: jest.fn() },
    product: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
    review: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
    orderItem: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    refreshToken: { create: jest.fn(), findMany: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    oauthAccount: { findUnique: jest.fn(), create: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../lib/redis', () => ({
  redis: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), setex: jest.fn(), del: jest.fn(), keys: jest.fn().mockResolvedValue([]), call: jest.fn() },
  redisSub: { on: jest.fn() },
  default: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), setex: jest.fn(), del: jest.fn(), keys: jest.fn().mockResolvedValue([]), call: jest.fn() },
}));

jest.mock('../lib/metrics', () => ({
  register: { contentType: 'text/plain', metrics: jest.fn().mockResolvedValue('') },
  httpRequestsTotal: { inc: jest.fn() },
  httpRequestDurationSeconds: { observe: jest.fn(), startTimer: jest.fn().mockReturnValue(jest.fn()) },
  activeWebsocketConnections: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  cacheHitRatio: { set: jest.fn() },
  notificationQueueDepth: { set: jest.fn() },
  collectDefaultMetrics: jest.fn(),
}));

jest.mock('../middleware/rateLimiter', () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  apiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = createApp();

function makeAccessToken(userId = 'user-1', role: UserRole = UserRole.CUSTOMER): string {
  return signAccessToken({ userId, role, email: 'test@example.com' });
}

const sampleCategory = { id: 'cat-1', name: 'Fruits', slug: 'fruits', imageUrl: null, isActive: true, sortOrder: 1 };
const sampleProduct = {
  id: 'prod-1', categoryId: 'cat-1', name: 'Bananas', slug: 'bananas',
  description: 'Fresh bananas', brand: 'FarmFresh', price: 49, discountPct: 10,
  stockQty: 100, isFeatured: true, isActive: true, isDeleted: false,
  dealExpiresAt: null, category: sampleCategory, images: [], _count: { reviews: 5 },
};

describe('GET /api/categories', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with category list', async () => {
    jest.spyOn(productService, 'listCategories').mockResolvedValue([sampleCategory]);
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].slug).toBe('fruits');
  });
});

describe('GET /api/products', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with paginated product list', async () => {
    jest.spyOn(productService, 'listProducts').mockResolvedValue({
      products: [sampleProduct] as never,
      total: 1, page: 1, pageSize: 20, totalPages: 1,
    });
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ page: 1, total: 1 });
  });

  it('returns 200 with filtered results by category', async () => {
    jest.spyOn(productService, 'listProducts').mockResolvedValue({
      products: [sampleProduct] as never,
      total: 1, page: 1, pageSize: 20, totalPages: 1,
    });
    const res = await request(app).get('/api/products?category=fruits');
    expect(res.status).toBe(200);
  });

  it('returns 200 with sorted results', async () => {
    jest.spyOn(productService, 'listProducts').mockResolvedValue({
      products: [sampleProduct] as never,
      total: 1, page: 1, pageSize: 20, totalPages: 1,
    });
    const res = await request(app).get('/api/products?sort=price_asc');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid sort value', async () => {
    const res = await request(app).get('/api/products?sort=invalid_sort');
    expect(res.status).toBe(400);
  });

  it('returns empty array when no products match search', async () => {
    jest.spyOn(productService, 'listProducts').mockResolvedValue({
      products: [], total: 0, page: 1, pageSize: 20, totalPages: 0,
    });
    const res = await request(app).get('/api/products?q=nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('GET /api/products/featured', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with featured products', async () => {
    jest.spyOn(productService, 'getFeaturedProducts').mockResolvedValue([sampleProduct] as never);
    const res = await request(app).get('/api/products/featured');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('GET /api/products/deals', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with deals', async () => {
    jest.spyOn(productService, 'getDealsOfTheDay').mockResolvedValue([sampleProduct] as never);
    const res = await request(app).get('/api/products/deals');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/products/:slug', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with product detail', async () => {
    jest.spyOn(productService, 'getProductBySlug').mockResolvedValue({ ...sampleProduct, averageRating: 4.5 } as never);
    const res = await request(app).get('/api/products/bananas');
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe('bananas');
  });

  it('returns 404 for non-existent product', async () => {
    jest.spyOn(productService, 'getProductBySlug').mockRejectedValue(new AppError('Product not found', 404));
    const res = await request(app).get('/api/products/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/products/:id/reviews', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with paginated reviews', async () => {
    jest.spyOn(productService, 'getProductReviews').mockResolvedValue({
      reviews: [{ id: 'rev-1', productId: 'prod-1', userId: 'user-1', rating: 5, comment: 'Great!', isVerifiedPurchase: true, createdAt: new Date() }],
      total: 1, page: 1, pageSize: 10, totalPages: 1,
    });
    const res = await request(app).get('/api/products/prod-1/reviews');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('POST /api/products/:id/reviews', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 201 on successful review submission', async () => {
    jest.spyOn(productService, 'submitReview').mockResolvedValue({
      id: 'rev-1', productId: 'prod-1', userId: 'user-1', rating: 4, comment: 'Good', isVerifiedPurchase: false, createdAt: new Date(),
    });
    const res = await request(app)
      .post('/api/products/prod-1/reviews')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ rating: 4, comment: 'Good' });
    expect(res.status).toBe(201);
  });

  it('returns 409 for duplicate review', async () => {
    jest.spyOn(productService, 'submitReview').mockRejectedValue(new AppError('You have already reviewed this product', 409));
    const res = await request(app)
      .post('/api/products/prod-1/reviews')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ rating: 4 });
    expect(res.status).toBe(409);
  });

  it('returns 400 for invalid rating', async () => {
    const res = await request(app)
      .post('/api/products/prod-1/reviews')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ rating: 6 });
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).post('/api/products/prod-1/reviews').send({ rating: 4 });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/recommendations', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 200 with recommendations for authenticated user', async () => {
    jest.spyOn(productService, 'getRecommendations').mockResolvedValue([sampleProduct] as never);
    const res = await request(app)
      .get('/api/recommendations')
      .set('Authorization', `Bearer ${makeAccessToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/recommendations');
    expect(res.status).toBe(401);
  });
});
