import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { AppError } from '../middleware/errorHandler';
import { UserRole } from '../types';
import {
  getAssignedOrders,
  updateDeliveryStatus,
  updateDeliveryLocation,
} from '../services/delivery.service';

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

// All delivery routes require delivery_partner role
router.use(authenticate, authorize(UserRole.DELIVERY_PARTNER));

// GET /api/delivery/orders
router.get('/orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = await getAssignedOrders(req.user!.id);
    res.status(200).json({ success: true, data: orders });
  } catch (err) { next(err); }
});

// PATCH /api/delivery/orders/:id/status
router.patch('/orders/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validate(
      z.object({ status: z.enum(['out_for_delivery', 'delivered']) }),
      req.body,
    );
    const order = await updateDeliveryStatus(req.params.id, req.user!.id, body.status);
    res.status(200).json({ success: true, data: order });
  } catch (err) { next(err); }
});

// POST /api/delivery/location
router.post('/location', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validate(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      }),
      req.body,
    );
    const location = await updateDeliveryLocation(req.user!.id, body.latitude, body.longitude);
    res.status(200).json({ success: true, data: location });
  } catch (err) { next(err); }
});

export default router;
