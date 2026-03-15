/**
 * Policy Cache - LRU cache for policy decisions
 * @module kernel/policy/PolicyCache
 *
 * Caches policy evaluation results to avoid redundant computation.
 * Uses an LRU (Least Recently Used) eviction strategy with TTL expiry.
 *
 * Key format: `${resource}:${action}:${userId}`
 * TTL: 5 minutes (300,000ms)
 * Max entries: 1000
 */

import { logger } from '../../utils/logger';
import type { PolicyDecision } from '../../types';

/** Default TTL for cache entries in milliseconds (5 minutes) */
const DEFAULT_TTL_MS = 300_000;

/** Default maximum number of cache entries */
const DEFAULT_MAX_ENTRIES = 1000;

/** Internal cache entry with metadata */
interface CacheEntry {
  decision: PolicyDecision;
  createdAt: number;
  lastAccessedAt: number;
}

export class PolicyCache {
  private readonly log = logger.child({ component: 'PolicyCache' });
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS, maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  /**
   * Get a cached policy decision by key.
   * Returns undefined if the entry does not exist or has expired.
   * Updates the last accessed time on hit (for LRU ordering).
   */
  get(key: string): PolicyDecision | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check TTL expiry
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.log.debug('Policy cache entry expired', { key });
      return undefined;
    }

    // Update last accessed time for LRU
    entry.lastAccessedAt = Date.now();
    return entry.decision;
  }

  /**
   * Store a policy decision in the cache.
   * If the cache is at capacity, evicts the least recently used entry.
   */
  set(key: string, decision: PolicyDecision): void {
    // If key already exists, update it
    if (this.cache.has(key)) {
      this.cache.set(key, {
        decision,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      });
      return;
    }

    // Evict if at capacity
    if (this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }

    this.cache.set(key, {
      decision,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    });
  }

  /**
   * Invalidate (remove) a specific cache entry.
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    this.log.debug('Policy cache entry invalidated', { key });
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    if (size > 0) {
      this.log.debug('Policy cache cleared', { entriesRemoved: size });
    }
  }

  /**
   * Get the number of entries currently in the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Check if a cache entry has expired based on its creation time.
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.createdAt > this.ttlMs;
  }

  /**
   * Evict the least recently used (oldest lastAccessedAt) entry.
   * Also prunes any expired entries encountered during the scan.
   */
  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      // Collect expired entries for cleanup
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
        continue;
      }

      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    // Remove expired entries first
    for (const key of expiredKeys) {
      this.cache.delete(key);
    }

    // If we freed enough space, no need to evict LRU
    if (this.cache.size < this.maxEntries) {
      return;
    }

    // Evict the LRU entry
    if (oldestKey !== undefined) {
      this.cache.delete(oldestKey);
      this.log.debug('Policy cache LRU eviction', { evictedKey: oldestKey });
    }
  }
}
