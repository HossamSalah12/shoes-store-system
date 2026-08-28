import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL } from '../api/client';
import { useAuthStore } from '../state/authStore';
import { useConnectionStore } from '../state/connectionStore';
import { useRealtimeStore } from '../state/realtimeStore';

/**
 * Establishes (and tears down) a single Socket.IO connection scoped to the
 * current tenant, authenticated with the same short-lived access token used
 * for REST calls. Mounted once, near the app root (see App.tsx), for the
 * lifetime of an authenticated session — NOT per-page — so the connection
 * indicator and background data-refresh signals stay accurate no matter
 * which screen the cashier/owner is currently looking at.
 *
 * Every event bumps the matching counter in `useRealtimeStore`; individual
 * pages (Inventory, Sales, Dashboard, Returns) subscribe to just the
 * counter(s) relevant to them and re-fetch when it changes, rather than
 * each page opening its own socket connection.
 */
export function useRealtimeSocket(onEvent?: (event: string, payload: unknown) => void) {
  const socketRef = useRef<Socket | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSocketConnected = useConnectionStore((s) => s.setSocketConnected);
  const touchSynced = useConnectionStore((s) => s.touchSynced);
  const { bumpStock, bumpSale, bumpReturn, bumpBranch } = useRealtimeStore();

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(API_BASE_URL, {
      path: '/realtime',
      auth: { token: accessToken },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      touchSynced();
    });
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('connect_error', () => setSocketConnected(false));

    const bumpByEvent: Record<string, () => void> = {
      'stock:updated': bumpStock,
      'sale:created': bumpSale,
      'sale:cancelled': bumpSale,
      'return:created': bumpReturn,
      'branch:updated': bumpBranch,
    };

    for (const [event, bump] of Object.entries(bumpByEvent)) {
      socket.on(event, (payload) => {
        bump();
        touchSynced();
        onEvent?.(event, payload);
      });
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return socketRef;
}
