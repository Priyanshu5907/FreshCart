'use client';

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

// Exponential backoff reconnection config
const RECONNECTION_ATTEMPTS = 10;
const RECONNECTION_DELAY = 1000;
const RECONNECTION_DELAY_MAX = 30000;

export function getSocket(token?: string): Socket {
  if (socket?.connected) return socket;

  const url = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';

  socket = io(url, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: RECONNECTION_ATTEMPTS,
    reconnectionDelay: RECONNECTION_DELAY,
    reconnectionDelayMax: RECONNECTION_DELAY_MAX,
    randomizationFactor: 0.5, // jitter for exponential backoff
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[socket] Connection error:', err.message);
  });

  socket.on('reconnect', (attempt) => {
    console.log('[socket] Reconnected after', attempt, 'attempts');
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log('[socket] Reconnection attempt', attempt);
  });

  socket.on('reconnect_failed', () => {
    console.error('[socket] Reconnection failed after max attempts');
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function joinOrderRoom(orderId: string) {
  socket?.emit('join:order', { orderId });
}

export function joinInventoryRoom(productId: string) {
  socket?.emit('join:inventory', { productId });
}

export { socket };
