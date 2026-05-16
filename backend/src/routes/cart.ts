import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../middleware/errorHandler';
import { ApiResponse } from '../types';
import {
  getCart,
  addItem,
  updateItemQuantity,
  removeItem,
  saveForLater,
  moveToCart,
  applyCoupon,
  removeCoupon,
} from '../services/cart.service';

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

// All cart routes require authentication
router.use(authenticate);

// GET /api/cart
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cart = await getCart(req.user!.id);
    res.status(200).json({ success: true, data: cart });
  } catch (err) { next(err); }
});

// POST /api/cart/items
router.post('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validate(z.object({
      productId: z.string().uuid('Invalid product ID'),
      quantity: z.number().int().min(1).default(1),
    }), req.body);
    const result = await addItem(req.user!.id, body.productId, body.quantity);
    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
      message: result.capped ? 'Quantity capped at available stock.' : 'Item added to cart.',
    };
    res.status(200).json(response);
  } catch (err) { next(err); }
});

// PATCH /api/cart/items/:id
router.patch('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validate(z.object({ quantity: z.number().int().min(0) }), req.body);
    const item = await updateItemQuantity(req.user!.id, req.params.id, body.quantity);
    res.status(200).json({
      success: true,
      data: item,
      message: item === null ? 'Item removed from cart.' : 'Cart updated.',
    });
  } catch (err) { next(err); }
});

// DELETE /api/cart/items/:id
router.delete('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await removeItem(req.user!.id, req.params.id);
    res.status(200).json({ success: true, message: 'Item removed from cart.' });
  } catch (err) { next(err); }
});

// POST /api/cart/items/:id/save-later
router.post('/items/:id/save-later', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await saveForLater(req.user!.id, req.params.id);
    res.status(200).json({ success: true, data: item, message: 'Item saved for later.' });
  } catch (err) { next(err); }
});

// POST /api/cart/items/:id/move-to-cart
router.post('/items/:id/move-to-cart', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await moveToCart(req.user!.id, req.params.id);
    res.status(200).json({ success: true, data: item, message: 'Item moved to cart.' });
  } catch (err) { next(err); }
});

// POST /api/cart/coupon
router.post('/coupon', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validate(z.object({ code: z.string().min(1, 'Coupon code is required') }), req.body);
    const result = await applyCoupon(req.user!.id, body.code);
    res.status(200).json({ success: true, data: result, message: 'Coupon applied successfully.' });
  } catch (err) { next(err); }
});

// DELETE /api/cart/coupon
router.delete('/coupon', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await removeCoupon(req.user!.id);
    res.status(200).json({ success: true, data: result, message: 'Coupon removed.' });
  } catch (err) { next(err); }
});

export default router;
