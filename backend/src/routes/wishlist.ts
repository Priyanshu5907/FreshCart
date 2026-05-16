import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../middleware/errorHandler';
import { getWishlist, addToWishlist, removeFromWishlist, moveWishlistItemToCart } from '../services/wishlist.service';

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

router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await getWishlist(req.user!.id);
    res.status(200).json({ success: true, data: items });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validate(z.object({ productId: z.string().uuid() }), req.body);
    const item = await addToWishlist(req.user!.id, body.productId);
    res.status(200).json({ success: true, data: item, message: 'Added to wishlist.' });
  } catch (err) { next(err); }
});

router.delete('/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await removeFromWishlist(req.user!.id, req.params.productId);
    res.status(200).json({ success: true, message: 'Removed from wishlist.' });
  } catch (err) { next(err); }
});

router.post('/:productId/move-to-cart', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await moveWishlistItemToCart(req.user!.id, req.params.productId);
    res.status(200).json({ success: true, message: 'Item moved to cart.' });
  } catch (err) { next(err); }
});

export default router;
