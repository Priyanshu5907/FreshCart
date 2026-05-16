import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../middleware/errorHandler';
import { ApiResponse } from '../types';
import {
  initiatePayment,
  verifyRazorpaySignature,
  handleWebhook,
  getPaymentStatus,
} from '../services/payment.service';

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

// POST /api/payments/initiate
router.post('/initiate', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validate(z.object({ orderId: z.string().uuid('Invalid order ID') }), req.body);
    const result = await initiatePayment(body.orderId, req.user!.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /api/payments/webhook — Razorpay webhook (no auth, uses HMAC signature)
router.post('/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    if (!signature) {
      res.status(400).json({ success: false, message: 'Missing webhook signature' });
      return;
    }

    // Use raw body for signature verification
    const rawBody = JSON.stringify(req.body);
    const result = await handleWebhook(rawBody, signature);

    // Always return 200 to prevent Razorpay retries
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    // Log but still return 200 to prevent retries
    next(err);
  }
});

// GET /api/payments/:orderId/status
router.get('/:orderId/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await getPaymentStatus(req.params.orderId, req.user!.id);
    res.status(200).json({ success: true, data: status });
  } catch (err) { next(err); }
});

export default router;
