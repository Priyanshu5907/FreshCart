import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types';
import { AppError } from './errorHandler';

/**
 * RBAC authorization middleware factory.
 *
 * Returns an Express middleware that checks whether the authenticated user's
 * role is included in the allowed roles list.
 *
 * Must be used after the `authenticate` middleware.
 *
 * @param roles - One or more roles that are permitted to access the route.
 *
 * @example
 * router.get('/admin/dashboard', authenticate, authorize(UserRole.ADMIN), handler);
 */
export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!roles.includes(req.user.role as UserRole)) {
      return next(
        new AppError(
          `Access denied. Required role(s): ${roles.join(', ')}`,
          403,
        ),
      );
    }

    next();
  };
}
