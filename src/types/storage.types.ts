/**
 * Storage Types - Storage adapter, cache tiers, cache configuration
 * @module types/storage
 */

/** Low-level storage backend interface (MMKV or in-memory fallback) */
export interface IStorageBackend {
  getString(key: string): string | undefined;
  setString(key: string, value: string): void;
  getNumber(key: string): number | undefined;
  setNumber(key: string, value: number): void;
  getBoolean(key: string): boolean | undefined;
  setBoolean(key: string, value: boolean): void;
  contains(key: string): boolean;
  delete(key: string): void;
  getAllKeys(): string[];
  clearAll(): void;
}

/** Storage adapter interface (abstracts MMKV + SQLite) */
export interface IStorageAdapter {
  // Key-value (MMKV)
  getString(key: string): string | undefined;
  setString(key: string, value: string): void;
  getNumber(key: string): number | undefined;
  setNumber(key: string, value: number): void;
  getBoolean(key: string): boolean | undefined;
  setBoolean(key: string, value: boolean): void;
  delete(key: string): void;
  contains(key: string): boolean;
  getAllKeys(): string[];
  clearAll(): void;

  // Structured (SQLite - encrypted)
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
}

/** Cache entry with metadata */
export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt?: number;
  size: number;
  tier: CacheTier;
}

/** Cache tier levels */
export type CacheTier = 'memory' | 'manifest' | 'schema' | 'data' | 'asset';

/** Cache configuration per tier */
export interface CacheConfig {
  memory: { maxSize: number };
  manifest: { maxSize: number };
  schema: { maxSize: number };
  data: { maxSize: number; ttl: number };
  asset: { maxSize: number };
}
