import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';

const router = Router();

async function checkWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs),
      ),
    ]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

router.get('/', async (_req: Request, res: Response) => {
  const [dbResult, redisResult] = await Promise.all([
    checkWithTimeout(prisma.$queryRaw`SELECT 1`, 3000),
    checkWithTimeout(redis.ping(), 3000),
  ]);

  const allHealthy = dbResult.ok && redisResult.ok;

  const body = {
    status: allHealthy ? 'ok' : 'degraded',
    version: process.env.npm_package_version ?? '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      database: dbResult.ok ? 'ok' : 'error',
      redis: redisResult.ok ? 'ok' : 'error',
    },
  };

  if (!allHealthy) {
    logger.warn('Health check failed', {
      database: dbResult,
      redis: redisResult,
    });
  }

  res.status(allHealthy ? 200 : 503).json(body);
});

export default router;
