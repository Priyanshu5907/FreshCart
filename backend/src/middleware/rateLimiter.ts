import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../lib/redis';
import { Request, Response } from 'express';

/**
 * Auth endpoint rate limiter.
 * Allows a maximum of 10 requests per IP per 15-minute window.
 * Returns HTTP 429 when the limit is exceeded.
 *
 * Requirement 21.5 / 21.6: max 10 login attempts per IP per 15-minute window.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again after 15 minutes.',
  },
  store: new RedisStore({
    // @ts-expect-error – ioredis client is compatible but types differ slightly
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix: 'rl:auth:',
  }),
  keyGenerator: (req: Request) => {
    // Use X-Forwarded-For if behind a proxy, otherwise use req.ip
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return ip.trim();
    }
    return req.ip ?? 'unknown';
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP. Please try again after 15 minutes.',
    });
  },
});

/**
 * General API rate limiter.
 * Allows a maximum of 100 requests per user (or IP for unauthenticated) per minute.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
  },
  store: new RedisStore({
    // @ts-expect-error – ioredis client is compatible but types differ slightly
    sendCommand: (...args: string[]) => redis.call(...args),
    prefix: 'rl:api:',
  }),
  keyGenerator: (req: Request) => {
    // Use authenticated user ID if available, otherwise fall back to IP
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return ip.trim();
    }
    return req.ip ?? 'unknown';
  },
});
