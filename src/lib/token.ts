import { useSyncExternalStore } from 'react';

/**
 * The API token lives only in this browser's localStorage. It is entered by
 * the user on the token screen and never shipped in code or the build.
 */
const STORAGE_KEY = 'cashmine.apiToken';

const listeners = new Set<() => void>();

// In-memory copy, so the app keeps working if localStorage is unavailable
// (e.g. blocked storage); undefined means "not read from storage yet".
let current: string | null | undefined;

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function getToken(): string | null {
  if (current === undefined) {
    current = storage()?.getItem(STORAGE_KEY) ?? null;
  }
  return current;
}

export function setToken(token: string): void {
  current = token;
  try {
    storage()?.setItem(STORAGE_KEY, token);
  } catch {
    // Quota or privacy mode: the token still works for this session.
  }
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY) return;
  current = event.newValue;
  listeners.forEach((listener) => listener());
}

export function subscribeToken(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') {
    // Keeps several open tabs on the same token.
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

export function useToken(): string | null {
  return useSyncExternalStore(subscribeToken, getToken, () => null);
}
