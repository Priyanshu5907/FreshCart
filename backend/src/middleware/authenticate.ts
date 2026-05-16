import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { AppError } from './errorHandler';

/**
 * JWT authentication middleware.
 *
 * Extracts the Bearer token from the Authorization header, verifies it,
 * and attaches the decoded payload to `req.user`.
 *
 * Returns HTTP 401 if the token is missing, malformed, or expired.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required. Please provide a valid Bearer token.', 401));
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.userId,
      role: payload.role,
      email: payload.email,
    };
    next();
  } catch {
    next(new AppError('Invalid or expired access token', 401));
  }
}
