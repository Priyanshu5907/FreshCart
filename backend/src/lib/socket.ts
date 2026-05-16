import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis, redisSub } from './redis';
import { verifyAccessToken } from './jwt';
import { activeWebsocketConnections } from './metrics';
import { logger } from './logger';

let io: SocketServer | null = null;

// ── ETA Calculation ────────────────────────────────────────────────────────────

function calculateEta(
  partnerLat: number, partnerLng: number,
  destLat: number, destLng: number,
): number {
  // Haversine formula for distance in km
  const R = 6371;
  const dLat = ((destLat - partnerLat) * Math.PI) / 180;
  const dLng = ((destLng - partnerLng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((partnerLat * Math.PI) / 180) *
      Math.cos((destLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = R * c;

  // Average speed: 30 km/h in city traffic
  const avgSpeedKmh = 30;
  const etaMinutes = Math.ceil((distanceKm / avgSpeedKmh) * 60);
  return etaMinutes;
}

// ── Socket.io Server Setup ─────────────────────────────────────────────────────

export function initSocketServer(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Configure Redis adapter for horizontal scaling
  const pubClient = redis;
  const subClient = redisSub;
  io.adapter(createAdapter(pubClient, subClient));

  // JWT authentication middleware on handshake
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.userId;
      socket.data.role = payload.role;
      socket.data.email = payload.email;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const { userId, role } = socket.data as { userId: string; role: string };

    activeWebsocketConnections.inc();
    logger.info('Socket connected', { socketId: socket.id, userId, role });

    // Join personal room
    void socket.join(`user:${userId}`);

    // Join admin room if admin
    if (role === 'admin') {
      void socket.join('admin');
    }

    // Delivery partner location updates
    socket.on('location:update', async (data: { lat: number; lng: number; orderId?: string }) => {
      if (role !== 'delivery_partner') return;

      const { lat, lng, orderId } = data;

      // Broadcast to order room with ETA (placeholder destination coords)
      if (orderId) {
        const etaMinutes = calculateEta(lat, lng, 19.076, 72.877); // placeholder dest
        io?.to(`order:${orderId}`).emit('delivery:location', {
          orderId,
          lat,
          lng,
          eta: etaMinutes,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    socket.on('disconnect', () => {
      activeWebsocketConnections.dec();
      logger.info('Socket disconnected', { socketId: socket.id, userId });
    });
  });

  logger.info('Socket.io server initialized with Redis adapter');
  return io;
}

export function getSocketServer(): SocketServer | null {
  return io;
}

// ── Event Broadcast Helpers ────────────────────────────────────────────────────

export function broadcastInventoryUpdate(productId: string, stockQty: number, isInStock: boolean) {
  io?.to(`inventory:${productId}`).emit('inventory:update', { productId, stockQty, isInStock });
  // Also broadcast to all clients for cart conflict detection
  io?.emit('inventory:update', { productId, stockQty, isInStock });
}

export function broadcastOrderStatus(userId: string, orderId: string, status: string) {
  io?.to(`user:${userId}`).emit('order:status', {
    orderId,
    status,
    timestamp: new Date().toISOString(),
  });
  io?.to(`order:${orderId}`).emit('order:status', {
    orderId,
    status,
    timestamp: new Date().toISOString(),
  });
}

export function broadcastDeliveryLocation(
  orderId: string,
  lat: number,
  lng: number,
  eta: number,
) {
  io?.to(`order:${orderId}`).emit('delivery:location', {
    orderId,
    lat,
    lng,
    eta,
    updatedAt: new Date().toISOString(),
  });
}

export function broadcastCartConflict(userId: string, productId: string, availableQty: number) {
  io?.to(`user:${userId}`).emit('cart:conflict', { productId, availableQty });
}
