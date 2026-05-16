import { Request, Response } from 'express';
import { ApiResponse } from '../types';

/**
 * 404 handler — catches any request that did not match a registered route.
 */
export function notFound(req: Request, res: Response): void {
  const body: ApiResponse<null> = {
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  };

  res.status(404).json(body);
}
