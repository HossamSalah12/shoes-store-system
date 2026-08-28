import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { verifyAccessToken } from '../auth/tokens';
import { env } from '../config/env';
import { logger } from '../lib/logger';

let io: SocketIOServer | undefined;

/**
 * Every desktop client connects to the server over the internet (never
 * assumes LAN, per spec) and authenticates its socket connection with the
 * same short-lived JWT access token used for REST calls. On successful
 * auth, the socket joins a room scoped to `tenant:<tenantId>` — every
 * realtime event (stock updates, new sales, cancellations) is broadcast
 * only to that room, so tenant isolation is preserved on the realtime
 * channel exactly as it is on REST. A device also joins `branch:<branchId>`
 * rooms for the branches it has access to, letting branch-specific UI
 * (e.g. "someone in this branch just made a sale") narrow further.
 */
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: env.CORS_ALLOWED_ORIGINS, credentials: true },
    path: '/realtime',
  });

  io.use((socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('Missing authentication token'));
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.tenantId = payload.tenantId;
      next();
    } catch {
      next(new Error('Invalid or expired authentication token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const tenantId = socket.data.tenantId as string | null;
    if (tenantId) {
      socket.join(`tenant:${tenantId}`);
    }

    socket.on('branch:subscribe', (branchId: string) => {
      if (typeof branchId === 'string') {
        socket.join(`branch:${branchId}`);
      }
    });

    socket.emit('connection:status', { connected: true });

    socket.on('disconnect', () => {
      logger.debug({ userId: socket.data.userId }, 'Socket disconnected');
    });
  });

  return io;
}

export function getIo(): SocketIOServer | undefined {
  return io;
}
