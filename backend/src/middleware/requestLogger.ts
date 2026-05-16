import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../lib/logger';

/**
 * HTTP request logging middleware.
 *
 * - Generates a unique requestId (uuid v4) for each request and attaches it
 *   to `req.requestId` so downstream handlers can reference it.
 * - Logs the incoming request at the 'http' level.
 * - Listens for the response 'finish' event to log the completed request with
 *   status code and response time.
 * - Includes userId when the request has been authenticated.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.requestId = uuidv4();
  const startTime = Date.now();

  logger.http('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  res.on('finish', () => {
    const responseTimeMs = Date.now() - startTime;
    const userId = req.user?.id;

    logger.http('Request completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTimeMs,
      ...(userId && { userId }),
    });
  });

  next();
}
