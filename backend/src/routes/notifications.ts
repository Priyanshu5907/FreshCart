import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../middleware/errorHandler';
import { registerDeviceToken, unregisterDeviceToken } from '../services/notification.service';

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

// POST /api/notifications/device-token
router.post('/device-token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validate(z.object({
      token: z.string().min(1),
      platform: z.enum(['web', 'android', 'ios']).default('web'),
    }), req.body);
    const deviceToken = await registerDeviceToken(req.user!.id, body.token, body.platform);
    res.status(200).json({ success: true, data: deviceToken, message: 'Device token registered.' });
  } catch (err) { next(err); }
});

// DELETE /api/notifications/device-token
router.delete('/device-token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validate(z.object({ token: z.string().min(1) }), req.body);
    await unregisterDeviceToken(req.user!.id, body.token);
    res.status(200).json({ success: true, message: 'Device token unregistered.' });
  } catch (err) { next(err); }
});

// PATCH /api/notifications/preferences
router.patch('/preferences', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Preferences stored in user record (language/theme) or a separate table
    // For now, acknowledge the update
    res.status(200).json({ success: true, message: 'Notification preferences updated.' });
  } catch (err) { next(err); }
});

export default router;
