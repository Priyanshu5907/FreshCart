import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';
import { logger } from '../lib/logger';

/**
 * Custom application error with an HTTP status code.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}

/**
 * Global error-handling middleware.
 * Must be registered after all routes with four parameters so Express
 * recognises it as an error handler.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message =
    err instanceof AppError ? err.message : 'Internal Server Error';

  const body: ApiResponse<null> & { errors?: Record<string, string[]> } = {
    success: false,
    message,
  };

  // Include field-level validation errors if present
  const errWithErrors = err as AppError & { errors?: Record<string, string[]> };
  if (errWithErrors.errors) {
    body.errors = errWithErrors.errors;
  }

  // Include stack trace in development for easier debugging
  if (process.env.NODE_ENV === 'development') {
    logger.error(err.message, { stack: err.stack });
  } else {
    logger.error(err.message, {
      statusCode,
      stack: err instanceof AppError ? undefined : err.stack,
    });
  }

  res.status(statusCode).json(body);
}
