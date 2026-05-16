import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../middleware/errorHandler';
import { ApiResponse, PaginatedResponse } from '../types';
import {
  getAvailableDeliverySlots,
  placeOrder,
  getOrderHistory,
  getOrderById,
  reorder,
  getOrderTracking,
} from '../services/order.service';

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

// GET /api/orders/delivery-slots
router.get('/delivery-slots', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const slots = await getAvailableDeliverySlots();
    res.status(200).json({ success: true, data: slots });
  } catch (err) { next(err); }
});

// POST /api/orders
const placeOrderSchema = z.object({
  addressId: z.string().uuid('Invalid address ID'),
  deliverySlotId: z.string().uuid('Invalid delivery slot ID'),
  paymentMethod: z.enum(['upi', 'card', 'cod']),
  couponId: z.string().uuid().optional(),
  paymentGatewayId: z.string().optional(),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validate(placeOrderSchema, req.body);
    const order = await placeOrder(req.user!.id, body);
    res.status(201).json({ success: true, data: order, message: 'Order placed successfully.' });
  } catch (err) { next(err); }
});

// GET /api/orders
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 10);
    const result = await getOrderHistory(req.user!.id, page, pageSize);
    const response: PaginatedResponse<(typeof result.orders)[0]> = {
      success: true,
      data: result.orders,
      pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
    };
    res.status(200).json(response);
  } catch (err) { next(err); }
});

// GET /api/orders/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await getOrderById(req.user!.id, req.params.id);
    res.status(200).json({ success: true, data: order });
  } catch (err) { next(err); }
});

// POST /api/orders/:id/reorder
router.post('/:id/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await reorder(req.user!.id, req.params.id);
    const message = result.skipped.length > 0
      ? `Items added to cart. Skipped out-of-stock items: ${result.skipped.join(', ')}`
      : 'All items added to cart.';
    res.status(200).json({ success: true, data: result, message });
  } catch (err) { next(err); }
});

// GET /api/orders/:id/tracking
router.get('/:id/tracking', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tracking = await getOrderTracking(req.user!.id, req.params.id);
    res.status(200).json({ success: true, data: tracking });
  } catch (err) { next(err); }
});

export default router;
