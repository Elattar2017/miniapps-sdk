/**
 * ModuleCache Test Suite
 * Tests multi-tier LRU cache: store/retrieve, TTL expiry, LRU eviction,
 * tier clearing, and statistics reporting.
 */

import { ModuleCache } from '../../src/modules/ModuleCache';
import type { CacheConfig } from '../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ModuleCache', () => {
  let cache: ModuleCache;

  beforeEach(() => {
    cache = new ModuleCache();
  });

  afterEach(() => {
    cache.clear();
  });

  describe('store and retrieve', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', { name: 'test' }, 'memory');

      const result = cache.get('key1', 'memory');
      expect(result).toEqual({ name: 'test' });
    });

    it('should return undefined for missing keys', () => {
      const result = cache.get('nonexistent', 'memory');
      expect(result).toBeUndefined();
    });

    it('should store in different tiers', () => {
      cache.set('manifest-key', { id: 'mod-1' }, 'manifest');
      cache.set('schema-key', { id: 'screen-1' }, 'schema');

      expect(cache.get('manifest-key', 'manifest')).toEqual({ id: 'mod-1' });
      expect(cache.get('schema-key', 'schema')).toEqual({ id: 'screen-1' });
    });

    it('should overwrite existing values', () => {
      cache.set('key1', 'original', 'memory');
      cache.set('key1', 'updated', 'memory');

      expect(cache.get('key1', 'memory')).toBe('updated');
    });
  });

  describe('TTL expiry', () => {
    it('should respect TTL expiry', () => {
      // Set with a very short TTL (1 second)
      cache.set('expiring', 'temporary', 'memory', 1);

      // Should be accessible immediately
      expect(cache.get('expiring', 'memory')).toBe('temporary');

      // Fast-forward time past the TTL
      const originalNow = Date.now;
      Date.now = () => originalNow() + 2000; // 2 seconds later

      // Should be expired
      expect(cache.get('expiring', 'memory')).toBeUndefined();

      // Restore
      Date.now = originalNow;
    });

    it('should not expire entries without TTL', () => {
      cache.set('persistent', 'stays forever', 'manifest');

      // Fast-forward time significantly
      const originalNow = Date.now;
      Date.now = () => originalNow() + 86400000; // 24 hours later

      expect(cache.get('persistent', 'manifest')).toBe('stays forever');

      // Restore
      Date.now = originalNow;
    });
  });

  describe('LRU eviction', () => {
    it('should evict LRU entries when tier is full', () => {
      // Create a cache with a very small memory tier (100 bytes)
      const smallConfig: CacheConfig = {
        memory: { maxSize: 100 },
        manifest: { maxSize: 50 * 1024 * 1024 },
        schema: { maxSize: 100 * 1024 * 1024 },
        data: { maxSize: 200 * 1024 * 1024, ttl: 300 },
        asset: { maxSize: 100 * 1024 * 1024 },
      };

      const smallCache = new ModuleCache(smallConfig);

      // Insert entries that collectively exceed 100 bytes
      // JSON.stringify of a string includes quotes, then * 2 for UTF-16 estimate
      smallCache.set('entry-1', 'aaaaaaaaaa', 'memory'); // ~24 bytes estimate
      smallCache.set('entry-2', 'bbbbbbbbbb', 'memory'); // ~24 bytes
      smallCache.set('entry-3', 'cccccccccc', 'memory'); // ~24 bytes

      // Force access to entry-3 to make it most recently used
      smallCache.get('entry-3', 'memory');

      // Add a large entry that forces eviction
      smallCache.set('entry-4', 'dd'.repeat(30), 'memory'); // ~124 bytes

      // entry-1 should have been evicted as it was least recently accessed
      // (entry-3 was accessed, entry-2 was inserted after entry-1)
      const stats = smallCache.getStats();
      // The total should be reduced due to eviction
      expect(stats.tierCounts.memory).toBeLessThanOrEqual(3);

      smallCache.clear();
    });
  });

  describe('clear', () => {
    it('should clear specific tier', () => {
      cache.set('mem-1', 'value1', 'memory');
      cache.set('mem-2', 'value2', 'memory');
      cache.set('manifest-1', 'value3', 'manifest');

      cache.clear('memory');

      expect(cache.get('mem-1', 'memory')).toBeUndefined();
      expect(cache.get('mem-2', 'memory')).toBeUndefined();
      // Manifest tier should be untouched
      expect(cache.get('manifest-1', 'manifest')).toBe('value3');
    });

    it('should clear all tiers', () => {
      cache.set('mem-1', 'value1', 'memory');
      cache.set('manifest-1', 'value2', 'manifest');
      cache.set('schema-1', 'value3', 'schema');

      cache.clear();

      expect(cache.get('mem-1', 'memory')).toBeUndefined();
      expect(cache.get('manifest-1', 'manifest')).toBeUndefined();
      expect(cache.get('schema-1', 'schema')).toBeUndefined();
    });
  });

  describe('stats', () => {
    it('should report accurate statistics', () => {
      cache.set('mem-1', 'value1', 'memory');
      cache.set('mem-2', 'value2', 'memory');
      cache.set('manifest-1', 'value3', 'manifest');
      cache.set('schema-1', 'value4', 'schema');
      cache.set('data-1', 'value5', 'data');

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(5);
      expect(stats.tierCounts.memory).toBe(2);
      expect(stats.tierCounts.manifest).toBe(1);
      expect(stats.tierCounts.schema).toBe(1);
      expect(stats.tierCounts.data).toBe(1);
      expect(stats.tierCounts.asset).toBe(0);
    });

    it('should report empty stats on fresh cache', () => {
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.tierCounts.memory).toBe(0);
      expect(stats.tierCounts.manifest).toBe(0);
      expect(stats.tierCounts.schema).toBe(0);
      expect(stats.tierCounts.data).toBe(0);
      expect(stats.tierCounts.asset).toBe(0);
    });

    it('should update stats after deletion', () => {
      cache.set('key-1', 'value', 'memory');
      cache.set('key-2', 'value', 'memory');

      expect(cache.getStats().totalEntries).toBe(2);

      cache.delete('key-1');

      // Note: delete uses the raw key and searches all tiers
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(1);
    });
  });

  describe('delete', () => {
    it('should delete specific entries', () => {
      cache.set('to-delete', 'value', 'memory');
      expect(cache.get('to-delete', 'memory')).toBe('value');

      cache.delete('to-delete');
      expect(cache.get('to-delete', 'memory')).toBeUndefined();
    });

    it('should handle deleting non-existent keys', () => {
      // Should not throw
      expect(() => cache.delete('nonexistent')).not.toThrow();
    });
  });
});
