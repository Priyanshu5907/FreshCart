import { Request, Response, NextFunction } from 'express';
import { httpRequestsTotal, httpRequestDurationSeconds } from '../lib/metrics';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - startTime;
    const durationSeconds = Number(durationNs) / 1e9;

    // Normalize path to avoid high cardinality (replace UUIDs and IDs with :id)
    const normalizedPath = req.route?.path ?? req.path.replace(/[0-9a-f-]{8,}/gi, ':id');

    httpRequestsTotal.inc({
      method: req.method,
      path: normalizedPath,
      status: String(res.statusCode),
    });

    httpRequestDurationSeconds.observe(
      { method: req.method, path: normalizedPath, status: String(res.statusCode) },
      durationSeconds,
    );
  });

  next();
}
