import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../middleware/errorHandler';
import {
  listSubscriptionPlans, subscribe,
  getLoyaltyBalance, getLoyaltyHistory,
} from '../services/loyalty.service';

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

// GET /api/subscriptions/plans (public)
router.get('/plans', async (_req, res, next) => {
  try {
    const plans = await listSubscriptionPlans();
    res.status(200).json({ success: true, data: plans });
  } catch (err) { next(err); }
});

// POST /api/subscriptions (authenticated)
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validate(z.object({
      planId: z.string().uuid(),
      gatewaySubId: z.string().optional(),
    }), req.body);
    const subscription = await subscribe(req.user!.id, body.planId, body.gatewaySubId);
    res.status(201).json({ success: true, data: subscription });
  } catch (err) { next(err); }
});

// GET /api/loyalty/balance
router.get('/loyalty/balance', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const balance = await getLoyaltyBalance(req.user!.id);
    res.status(200).json({ success: true, data: { balance } });
  } catch (err) { next(err); }
});

// GET /api/loyalty/history
router.get('/loyalty/history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number(req.query.page ?? 1);
    const result = await getLoyaltyHistory(req.user!.id, page, 20);
    res.status(200).json({
      success: true,
      data: result.history,
      pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
    });
  } catch (err) { next(err); }
});

export default router;
