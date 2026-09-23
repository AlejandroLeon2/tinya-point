// Session token state + logout, and the online/offline wiring for the future
// OfflineBanner (doc/astrobase.md §3.6, doc/extras.md §6).
// No fetch, no direct localStorage — the token goes through utils/storage.ts.

import { getToken, setToken } from '../utils/storage';

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

// Login success stores ONLY the token — credentials are never persisted
// (doc/appscriptbase.md §5.3).
export function saveSession(token: string): void {
  setToken(token);
}

// Token only — cart and history are device-local data and survive logout.
export function logout(): void {
  setToken(null);
}

export type NetworkStatus = 'online' | 'offline';

type NetworkListener = (status: NetworkStatus) => void;

// Module-level state only — no side effects at import time.
const networkListeners = new Set<NetworkListener>();
let listening = false;

export function getNetworkStatus(): NetworkStatus {
  if (typeof navigator === 'undefined') return 'online';
  return navigator.onLine ? 'online' : 'offline';
}

export function subscribeNetworkStatus(listener: NetworkListener): () => void {
  networkListeners.add(listener);
  // Immediate first call: subscribers need the current status on mount.
  listener(getNetworkStatus());
  return () => {
    networkListeners.delete(listener);
  };
}

// Idempotent. Deliberately NOT run at import time — a later phase wires it
// from a client-side entry point (doc/extras.md §6).
export function startNetworkListener(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('online', () => {
    for (const listener of networkListeners) listener('online');
  });
  window.addEventListener('offline', () => {
    for (const listener of networkListeners) listener('offline');
  });
}
