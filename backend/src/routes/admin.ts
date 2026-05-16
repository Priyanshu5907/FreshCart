import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { AppError } from '../middleware/errorHandler';
import { UserRole } from '../types';
import {
  getDashboardStats, adminListProducts, adminCreateProduct, adminUpdateProduct,
  adminDeleteProduct, generatePresignedUrl, adminCreateCategory, adminUpdateCategory,
  adminListOrders, adminUpdateOrderStatus, adminAssignDeliveryPartner, adminCancelOrder,
  adminListCoupons, adminCreateCoupon, adminUpdateCoupon,
  adminListBanners, adminCreateBanner, adminUpdateBanner, adminDeleteBanner,
} from '../services/admin.service';

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
    const err = new AppError('Validation failed', 400) as AppError & { errors?: Record<string, string[]> };
    err.errors = errors;
    throw err;
  }
  return result.data;
}

// All admin routes require authentication + admin role
router.use(authenticate, authorize(UserRole.ADMIN));

// ── Dashboard ──────────────────────────────────────────────────────────────────
router.get('/dashboard', async (_req, res, next) => {
  try {
    const stats = await getDashboardStats();
    res.status(200).json({ success: true, data: stats });
  } catch (err) { next(err); }
});

// ── Products ───────────────────────────────────────────────────────────────────
router.get('/products', async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    const search = req.query.search as string | undefined;
    const result = await adminListProducts(page, pageSize, search);
    res.status(200).json({ success: true, data: result.products, pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages } });
  } catch (err) { next(err); }
});

const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  description: z.string().optional(),
  brand: z.string().optional(),
  price: z.number().positive(),
  discountPct: z.number().min(0).max(99.99).optional(),
  stockQty: z.number().int().min(0).optional(),
  isFeatured: z.boolean().optional(),
  imageUrls: z.array(z.string().url()).optional(),
});

router.post('/products', async (req, res, next) => {
  try {
    const body = validate(createProductSchema, req.body);
    const product = await adminCreateProduct(body);
    res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.put('/products/:id', async (req, res, next) => {
  try {
    const product = await adminUpdateProduct(req.params.id, req.body);
    res.status(200).json({ success: true, data: product });
  } catch (err) { next(err); }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    await adminDeleteProduct(req.params.id);
    res.status(200).json({ success: true, message: 'Product deleted.' });
  } catch (err) { next(err); }
});

router.post('/products/upload', async (req, res, next) => {
  try {
    const body = validate(z.object({ fileName: z.string(), contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) }), req.body);
    const result = await generatePresignedUrl(body.fileName, body.contentType);
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ── Categories ─────────────────────────────────────────────────────────────────
router.post('/categories', async (req, res, next) => {
  try {
    const body = validate(z.object({ name: z.string().min(1).max(100), slug: z.string().min(1).max(100), imageUrl: z.string().url().optional() }), req.body);
    const category = await adminCreateCategory(body);
    res.status(201).json({ success: true, data: category });
  } catch (err) { next(err); }
});

router.put('/categories/:id', async (req, res, next) => {
  try {
    const category = await adminUpdateCategory(req.params.id, req.body);
    res.status(200).json({ success: true, data: category });
  } catch (err) { next(err); }
});

// ── Orders ─────────────────────────────────────────────────────────────────────
router.get('/orders', async (req, res, next) => {
  try {
    const result = await adminListOrders({
      status: req.query.status as string | undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      page: Number(req.query.page ?? 1),
      pageSize: Number(req.query.pageSize ?? 20),
    });
    res.status(200).json({ success: true, data: result.orders, pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages } });
  } catch (err) { next(err); }
});

router.patch('/orders/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validate(z.object({ status: z.string().min(1), note: z.string().optional() }), req.body);
    const order = await adminUpdateOrderStatus(req.params.id, body.status, req.user!.id, body.note);
    res.status(200).json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.post('/orders/:id/assign', async (req, res, next) => {
  try {
    const body = validate(z.object({ deliveryPartnerId: z.string().uuid() }), req.body);
    const order = await adminAssignDeliveryPartner(req.params.id, body.deliveryPartnerId);
    res.status(200).json({ success: true, data: order });
  } catch (err) { next(err); }
});

router.post('/orders/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validate(z.object({ reason: z.string().min(1, 'Cancellation reason is required') }), req.body);
    const order = await adminCancelOrder(req.params.id, body.reason, req.user!.id);
    res.status(200).json({ success: true, data: order });
  } catch (err) { next(err); }
});

// ── Coupons ────────────────────────────────────────────────────────────────────
router.get('/coupons', async (_req, res, next) => {
  try {
    const coupons = await adminListCoupons();
    res.status(200).json({ success: true, data: coupons });
  } catch (err) { next(err); }
});

const createCouponSchema = z.object({
  code: z.string().min(4).max(20).regex(/^[A-Z0-9]+$/, 'Code must be alphanumeric uppercase'),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().positive(),
  minOrderValue: z.number().positive().optional(),
  maxUses: z.number().int().positive().optional(),
  startsAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
});

router.post('/coupons', async (req, res, next) => {
  try {
    const body = validate(createCouponSchema, req.body);
    const coupon = await adminCreateCoupon(body);
    res.status(201).json({ success: true, data: coupon });
  } catch (err) { next(err); }
});

router.put('/coupons/:id', async (req, res, next) => {
  try {
    const coupon = await adminUpdateCoupon(req.params.id, req.body);
    res.status(200).json({ success: true, data: coupon });
  } catch (err) { next(err); }
});

// ── Banners ────────────────────────────────────────────────────────────────────
router.get('/banners', async (_req, res, next) => {
  try {
    const banners = await adminListBanners();
    res.status(200).json({ success: true, data: banners });
  } catch (err) { next(err); }
});

router.post('/banners', async (req, res, next) => {
  try {
    const body = validate(z.object({ title: z.string().min(1).max(200), imageUrl: z.string().url(), linkUrl: z.string().url().optional(), sortOrder: z.number().int().optional() }), req.body);
    const banner = await adminCreateBanner(body);
    res.status(201).json({ success: true, data: banner });
  } catch (err) { next(err); }
});

router.put('/banners/:id', async (req, res, next) => {
  try {
    const banner = await adminUpdateBanner(req.params.id, req.body);
    res.status(200).json({ success: true, data: banner });
  } catch (err) { next(err); }
});

router.delete('/banners/:id', async (req, res, next) => {
  try {
    await adminDeleteBanner(req.params.id);
    res.status(200).json({ success: true, message: 'Banner deleted.' });
  } catch (err) { next(err); }
});

export default router;
