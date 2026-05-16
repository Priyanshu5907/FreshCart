import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { AppError } from '../middleware/errorHandler';
import { ApiResponse } from '../types';
import {
  getProfile,
  updateProfile,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from '../services/user.service';

const router = Router();

const updateProfileSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    email: z.string().email('Invalid email address').optional(),
    phone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field (name, email, or phone) must be provided',
  });

const pinCodeSchema = z
  .string()
  .length(6, 'PIN code must be exactly 6 digits')
  .regex(/^\d{6}$/, 'PIN code must be numeric');

const addressSchema = z.object({
  label: z.string().min(1).max(50).optional(),
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(1, 'State is required').max(100),
  pinCode: pinCodeSchema,
  landmark: z.string().max(200).optional(),
  isDefault: z.boolean().optional(),
});

const updateAddressSchema = z.object({
  label: z.string().min(1).max(50).optional(),
  street: z.string().min(1).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  pinCode: pinCodeSchema.optional(),
  landmark: z.string().max(200).optional(),
  isDefault: z.boolean().optional(),
});

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

router.use(authenticate);

router.get('/me', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const profile = await getProfile(req.user!.id);
    const response: ApiResponse<typeof profile> = { success: true, data: profile };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

router.patch('/me', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = validate(updateProfileSchema, req.body);
    const updated = await updateProfile(req.user!.id, body);
    const message =
      body.email !== undefined
        ? 'Profile updated. A verification email has been sent to your new email address.'
        : 'Profile updated successfully.';
    const response: ApiResponse<typeof updated> = { success: true, data: updated, message };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/me/addresses',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const addresses = await getAddresses(req.user!.id);
      const response: ApiResponse<typeof addresses> = { success: true, data: addresses };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/me/addresses',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validate(addressSchema, req.body);
      const address = await addAddress(req.user!.id, body);
      const response: ApiResponse<typeof address> = {
        success: true,
        data: address,
        message: 'Address added successfully.',
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/me/addresses/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = validate(updateAddressSchema, req.body);
      const updated = await updateAddress(req.user!.id, req.params.id, body);
      const response: ApiResponse<typeof updated> = {
        success: true,
        data: updated,
        message: 'Address updated successfully.',
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/me/addresses/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await deleteAddress(req.user!.id, req.params.id);
      const response: ApiResponse<null> = {
        success: true,
        message: 'Address deleted successfully.',
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  '/me/addresses/:id/default',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await setDefaultAddress(req.user!.id, req.params.id);
      const response: ApiResponse<typeof updated> = {
        success: true,
        data: updated,
        message: 'Default address updated successfully.',
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
