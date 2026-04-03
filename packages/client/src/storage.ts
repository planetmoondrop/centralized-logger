import { SessionStorage } from './types';

/**
 * In-memory storage (default).
 * Data is lost when the page is refreshed — use BrowserSessionStorage or
 * BrowserLocalStorage for persistence across navigations.
 */
export class MemoryStorage implements SessionStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

/**
 * sessionStorage-backed storage.
 * Data persists for the lifetime of the browser tab/session and survives
 * in-app navigations (Next.js route changes, React Router, etc.).
 * A new tab or page refresh after the session ends starts fresh.
 */
export class BrowserSessionStorage implements SessionStorage {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      /* Silently ignore quota errors */
    }
  }
}

/**
 * localStorage-backed storage.
 * Data persists across page refreshes and across tabs for the same origin.
 * Use when you want to correlate a user's activity across multiple visits.
 */
export class BrowserLocalStorage implements SessionStorage {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* Silently ignore quota errors */
    }
  }
}
