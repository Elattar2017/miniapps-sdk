/**
 * Module Cache - Multi-tier LRU cache for module data
 * @module modules/ModuleCache
 *
 * 5 cache tiers:
 * - memory: Hot data (20MB) - recently accessed manifests/screens
 * - manifest: Module manifests (50MB)
 * - schema: Screen schemas (100MB)
 * - data: API response data (200MB, 5min TTL)
 * - asset: Module assets/icons (100MB)
 *
 * Entries are evicted using a least-recently-accessed (LRU) strategy
 * when a tier's total estimated size exceeds its configured maximum.
 */

import { logger } from '../utils/logger';
import { DEFAULT_CACHE_CONFIG } from '../constants/defaults';
import type { CacheEntry, CacheTier, CacheConfig } from '../types';

/** Internal cache entry with lastAccessed tracking for LRU eviction */
interface InternalCacheEntry<T = unknown> extends CacheEntry<T> {
  lastAccessed: number;
}

/** Cache statistics snapshot */
interface CacheStats {
  totalEntries: number;
  tierCounts: Record<CacheTier, number>;
}

/** All valid cache tier names */
const CACHE_TIERS: readonly CacheTier[] = [
  'memory',
  'manifest',
  'schema',
  'data',
  'asset',
] as const;

export class ModuleCache {
  private readonly log = logger.child({ component: 'ModuleCache' });
  private readonly config: CacheConfig;
  private readonly store: Map<string, InternalCacheEntry> = new Map();

  constructor(config?: CacheConfig) {
    this.config = config ?? DEFAULT_CACHE_CONFIG;
    this.log.debug('ModuleCache initialized', {
      tiers: CACHE_TIERS.join(', '),
    });
  }

  /**
   * Retrieve a cached value by key and optional tier.
   *
   * If the entry exists but has expired (based on its expiresAt timestamp),
   * it is deleted and undefined is returned. On a cache hit, the
   * lastAccessed timestamp is updated for LRU tracking.
   *
   * @param key   Cache key
   * @param tier  Optional tier filter; if provided, only matches entries in that tier
   * @returns The cached value, or undefined on miss / expiry
   */
  get(key: string, tier?: CacheTier): unknown | undefined {
    const prefixedKey = tier ? `${tier}:${key}` : this.findKeyByRawKey(key);
    if (!prefixedKey) return undefined;

    const entry = this.store.get(prefixedKey);
    if (!entry) return undefined;

    // Check TTL expiration
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.store.delete(prefixedKey);
      this.log.debug('Cache entry expired', { key, tier: entry.tier });
      return undefined;
    }

    // Update lastAccessed for LRU
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  /**
   * Store a value in the cache.
   *
   * Before inserting, the method checks whether the target tier is at
   * capacity. If so, LRU entries are evicted until there is room (or the
   * tier is empty).
   *
   * @param key   Cache key
   * @param value Value to cache
   * @param tier  Cache tier (defaults to 'memory')
   * @param ttl   Time-to-live in seconds; overrides the tier default if provided
   */
  set(key: string, value: unknown, tier: CacheTier = 'memory', ttl?: number): void {
    const prefixedKey = `${tier}:${key}`;
    const size = this.estimateSize(value);
    const now = Date.now();

    // Determine TTL: explicit param > tier default (data tier) > none
    let expiresAt: number | undefined;
    if (ttl !== undefined) {
      expiresAt = now + ttl * 1000;
    } else if (tier === 'data' && this.config.data.ttl) {
      expiresAt = now + this.config.data.ttl * 1000;
    }

    const entry: InternalCacheEntry = {
      key,
      value,
      createdAt: now,
      lastAccessed: now,
      expiresAt,
      size,
      tier,
    };

    // Ensure there is room in the tier (evict LRU entries as needed)
    const maxSize = this.getTierMaxSize(tier);
    while (this.getTierSize(tier) + size > maxSize && this.getTierEntryCount(tier) > 0) {
      this.evictLRU(tier);
    }

    this.store.set(prefixedKey, entry);
    this.log.debug('Cache set', { key, tier, size, expiresAt });
  }

  /**
   * Delete a specific entry by its full prefixed key or raw key.
   */
  delete(key: string): void {
    // Try direct deletion first (already prefixed)
    if (this.store.has(key)) {
      this.store.delete(key);
      return;
    }

    // Try to find it across all tiers
    for (const tier of CACHE_TIERS) {
      const prefixedKey = `${tier}:${key}`;
      if (this.store.has(prefixedKey)) {
        this.store.delete(prefixedKey);
        this.log.debug('Cache entry deleted', { key, tier });
        return;
      }
    }
  }

  /**
   * Clear cached entries. If a tier is specified, only entries in that tier
   * are removed. Otherwise all entries are cleared.
   */
  clear(tier?: CacheTier): void {
    if (tier) {
      const keysToDelete: string[] = [];
      for (const [prefixedKey, entry] of this.store) {
        if (entry.tier === tier) {
          keysToDelete.push(prefixedKey);
        }
      }
      for (const k of keysToDelete) {
        this.store.delete(k);
      }
      this.log.info('Cache tier cleared', { tier, entriesRemoved: keysToDelete.length });
    } else {
      const total = this.store.size;
      this.store.clear();
      this.log.info('All cache tiers cleared', { entriesRemoved: total });
    }
  }

  /**
   * Return a snapshot of cache statistics.
   */
  getStats(): CacheStats {
    const tierCounts: Record<CacheTier, number> = {
      memory: 0,
      manifest: 0,
      schema: 0,
      data: 0,
      asset: 0,
    };

    for (const entry of this.store.values()) {
      tierCounts[entry.tier]++;
    }

    return {
      totalEntries: this.store.size,
      tierCounts,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Evict the least recently accessed entry in the given tier.
   */
  private evictLRU(tier: CacheTier): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [prefixedKey, entry] of this.store) {
      if (entry.tier === tier && entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = prefixedKey;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
      this.log.debug('LRU eviction', { tier, evictedKey: oldestKey });
    }
  }

  /**
   * Estimate the byte size of a value using JSON serialization.
   * Each character is roughly 2 bytes in a JS string (UTF-16).
   */
  private estimateSize(value: unknown): number {
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      // If serialization fails, return a conservative default
      return 1024;
    }
  }

  /**
   * Sum the estimated sizes of all entries in a given tier.
   */
  private getTierSize(tier: CacheTier): number {
    let total = 0;
    for (const entry of this.store.values()) {
      if (entry.tier === tier) {
        total += entry.size;
      }
    }
    return total;
  }

  /**
   * Count entries in a given tier.
   */
  private getTierEntryCount(tier: CacheTier): number {
    let count = 0;
    for (const entry of this.store.values()) {
      if (entry.tier === tier) {
        count++;
      }
    }
    return count;
  }

  /**
   * Return the configured maximum size (in bytes) for a tier.
   */
  private getTierMaxSize(tier: CacheTier): number {
    return this.config[tier].maxSize;
  }

  /**
   * Attempt to find a prefixed store key for a raw (unprefixed) key
   * by checking each tier. Returns the first match, or undefined.
   */
  private findKeyByRawKey(key: string): string | undefined {
    for (const tier of CACHE_TIERS) {
      const prefixedKey = `${tier}:${key}`;
      if (this.store.has(prefixedKey)) {
        return prefixedKey;
      }
    }
    return undefined;
  }
}
