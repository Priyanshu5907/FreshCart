import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { initSocketServer } from './lib/socket';
import { logger } from './lib/logger';
import { validateEnv } from './config/env';

// Validate required environment variables before starting
validateEnv();

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const app = createApp();
const server = http.createServer(app);

// Initialize Socket.io with JWT auth and Redis adapter
initSocketServer(server);

server.listen(PORT, () => {
  logger.info(`Server listening on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export { app };
export default server;
