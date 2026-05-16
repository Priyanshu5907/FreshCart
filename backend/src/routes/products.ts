import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../middleware/errorHandler';
import { ApiResponse, PaginatedResponse } from '../types';
import {
  listCategories,
  listProducts,
  getAutoSuggestions,
  getFeaturedProducts,
  getDealsOfTheDay,
  getProductBySlug,
  getProductReviews,
  submitReview,
  getRecommendations,
} from '../services/product.service';

const router = Router();

function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || 'general';
      if (!errors[key]) errors[key] = [];
      errors[key].push(issue.message);
    }
    const err = new AppError('Validation failed', 400) as AppError & {
      errors?: Record<string, string[]>;
    };
    err.errors = errors;
    throw err;
  }
  return result.data;
}

// ── GET /api/categories ───────────────────────────────────────────────────────
router.get('/categories', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await listCategories();
    const response: ApiResponse<typeof categories> = { success: true, data: categories };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/products/featured ────────────────────────────────────────────────
// Must be before /:slug to avoid route conflict
router.get('/products/featured', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await getFeaturedProducts();
    const response: ApiResponse<typeof products> = { success: true, data: products };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/products/deals ───────────────────────────────────────────────────
router.get('/products/deals', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const products = await getDealsOfTheDay();
    const response: ApiResponse<typeof products> = { success: true, data: products };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/products ─────────────────────────────────────────────────────────
const productQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  brand: z.string().optional(),
  sort: z.enum(['price_asc', 'price_desc', 'rating_desc', 'newest']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = validate(productQuerySchema, req.query);

    // Return auto-suggestions if q is provided and suggest=true
    if (query.q && req.query.suggest === 'true') {
      const suggestions = await getAutoSuggestions(query.q);
      return res.status(200).json({ success: true, data: suggestions });
    }

    const result = await listProducts({
      q: query.q,
      categorySlug: query.category,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minRating: query.minRating,
      brand: query.brand,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    });

    const response: PaginatedResponse<(typeof result.products)[0]> = {
      success: true,
      data: result.products,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/products/:slug ───────────────────────────────────────────────────
router.get('/products/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await getProductBySlug(req.params.slug);
    const response: ApiResponse<typeof product> = { success: true, data: product };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/products/:id/reviews ─────────────────────────────────────────────
router.get('/products/:id/reviews', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 10);
    const result = await getProductReviews(req.params.id, page, pageSize);

    const response: PaginatedResponse<(typeof result.reviews)[0]> = {
      success: true,
      data: result.reviews,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/products/:id/reviews ────────────────────────────────────────────
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

router.post(
  '/products/:id/reviews',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = validate(reviewSchema, req.body);
      const review = await submitReview(req.params.id, req.user!.id, body.rating, body.comment);
      const response: ApiResponse<typeof review> = {
        success: true,
        data: review,
        message: 'Review submitted successfully.',
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/recommendations ──────────────────────────────────────────────────
router.get(
  '/recommendations',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recommendations = await getRecommendations(req.user!.id);
      const response: ApiResponse<typeof recommendations> = {
        success: true,
        data: recommendations,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
