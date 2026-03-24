import { SessionStorage } from "./types";

/**
 * In-memory storage (default). Useful for testing or environments without persistent storage.
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
