import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Primary client for general use (get/set/pub)
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

// Subscriber client for pub/sub (cannot be used for regular commands while subscribed)
export const redisSub = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('connect', () => console.log('[redis] Connected'));
redis.on('error', (err) => console.error('[redis] Error:', err));

redisSub.on('connect', () => console.log('[redis:sub] Connected'));
redisSub.on('error', (err) => console.error('[redis:sub] Error:', err));

export default redis;
