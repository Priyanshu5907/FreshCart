import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import passport from 'passport';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { requestLogger } from './middleware/requestLogger';
import { metricsMiddleware } from './middleware/metricsMiddleware';
import { register } from './lib/metrics';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import productsRouter from './routes/products';
import cartRouter from './routes/cart';
import ordersRouter from './routes/orders';
import paymentsRouter from './routes/payments';
import adminRouter from './routes/admin';
import deliveryRouter from './routes/delivery';
import notificationsRouter from './routes/notifications';
import wishlistRouter from './routes/wishlist';
import subscriptionsRouter from './routes/subscriptions';
import { configurePassport } from './config/passport';

export function createApp(): express.Application {
  const app = express();

  configurePassport();

  app.use(helmet({
    // Disable HSTS in development to avoid HTTPS redirect loops
    hsts: process.env.NODE_ENV === 'production',
  }));
  app.use(
    cors({
      origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      credentials: true,
    }),
  );
  app.use(requestLogger);
  app.use(metricsMiddleware);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(passport.initialize());

  app.get('/metrics', async (req, res) => {
    const metricsSecret = process.env.METRICS_SECRET;
    const isLocalhost =
      req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';

    if (!isLocalhost && metricsSecret && req.headers['x-metrics-secret'] !== metricsSecret) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api', productsRouter);
  app.use('/api/cart', cartRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/delivery', deliveryRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/wishlist', wishlistRouter);
  app.use('/api/subscriptions', subscriptionsRouter);
  app.use('/api/loyalty', subscriptionsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
