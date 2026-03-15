/**
 * ModuleCache Advanced Test Suite
 *
 * Additional coverage for LRU eviction edge cases, TTL interactions,
 * multi-tier interactions, and stats accuracy.
 */

jest.mock('react-native');

import { ModuleCache } from '../../src/modules/ModuleCache';
import type { CacheConfig } from '../../src/types';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Small cache config for testing eviction
const smallConfig: CacheConfig = {
  memory: { maxSize: 200 },
  manifest: { maxSize: 200 },
  schema: { maxSize: 200 },
  data: { maxSize: 200, ttl: 5 },
  asset: { maxSize: 200 },
};

describe('ModuleCache Advanced', () => {
  // -------------------------------------------------------------------------
  // LRU eviction
  // -------------------------------------------------------------------------
  describe('LRU eviction', () => {
    it('evicts least recently accessed entry when tier is full', () => {
      const cache = new ModuleCache(smallConfig);

      // Each short string is ~24 bytes (12-char JSON * 2)
      cache.set('k1', 'aaaaaaaaaa', 'memory'); // ~24 bytes
      cache.set('k2', 'bbbbbbbbbb', 'memory'); // ~24 bytes
      cache.set('k3', 'cccccccccc', 'memory'); // ~24 bytes

      // Access k1 and k3 so k2 becomes the least-recently-used
      cache.get('k1', 'memory');
      cache.get('k3', 'memory');

      // Insert a large entry that forces eviction
      cache.set('k4', 'dd'.repeat(50), 'memory'); // ~204 bytes

      // k2 should have been evicted (LRU) while k1 and k3 were accessed
      expect(cache.get('k2', 'memory')).toBeUndefined();

      cache.clear();
    });

    it('re-accessing entry updates LRU position and prevents eviction', () => {
      // Use a larger maxSize so that the large entry + one small entry fit,
      // but two small entries + the large entry do not.
      const config: CacheConfig = {
        memory: { maxSize: 240 },
        manifest: { maxSize: 200 },
        schema: { maxSize: 200 },
        data: { maxSize: 200, ttl: 5 },
        asset: { maxSize: 200 },
      };
      const cache = new ModuleCache(config);

      const originalNow = Date.now;
      let clock = originalNow();

      // Override Date.now so we can guarantee distinct timestamps
      Date.now = () => clock;

      // Each 10-char string -> JSON '"aaaaaaaaaa"' = 12 chars * 2 = 24 bytes
      cache.set('k1', 'aaaaaaaaaa', 'memory'); // 24 bytes, lastAccessed = clock

      clock += 10;
      cache.set('k2', 'bbbbbbbbbb', 'memory'); // 24 bytes, lastAccessed = clock+10

      // Access k1 to refresh its LRU timestamp (now > k2's)
      clock += 10;
      cache.get('k1', 'memory'); // k1 lastAccessed = clock+20

      // Add a large entry: 'cc'.repeat(50) -> 100 chars -> JSON 102 chars -> 204 bytes
      // Total would be 48 + 204 = 252 > 240, need to evict.
      // k2 is the LRU (lastAccessed=clock+10 < k1 lastAccessed=clock+20)
      // After evicting k2: 24 + 204 = 228 <= 240, fits.
      clock += 10;
      cache.set('k3', 'cc'.repeat(50), 'memory');

      // k1 was accessed more recently than k2, so k2 should be evicted
      expect(cache.get('k1', 'memory')).toBe('aaaaaaaaaa');
      expect(cache.get('k2', 'memory')).toBeUndefined();

      Date.now = originalNow;
      cache.clear();
    });

    it('eviction cascade: multiple entries evicted for one large entry', () => {
      // maxSize=200. Each small entry '"a"' = 3 chars * 2 = 6 bytes.
      // 4 small entries = 24 bytes. Large entry 'x'.repeat(90) ->
      // JSON '"xxx..."' = 92 chars * 2 = 184 bytes.
      // 24 + 184 = 208 > 200, so entries must be evicted.
      // Evict k1 (6 bytes): 18 + 184 = 202 > 200, evict k2 (6 bytes):
      // 12 + 184 = 196 <= 200. Two entries evicted, 3 remain (k3, k4, big).
      const cache = new ModuleCache(smallConfig);

      cache.set('k1', 'a', 'memory');
      cache.set('k2', 'b', 'memory');
      cache.set('k3', 'c', 'memory');
      cache.set('k4', 'd', 'memory');

      expect(cache.getStats().tierCounts.memory).toBe(4);

      cache.set('big', 'x'.repeat(90), 'memory');

      const stats = cache.getStats();
      // 2 of the 4 small entries evicted, leaving k3 + k4 + big = 3
      expect(stats.tierCounts.memory).toBeLessThanOrEqual(3);
      // At least 1 entry must have been evicted
      expect(stats.tierCounts.memory).toBeLessThan(5);
      expect(cache.get('big', 'memory')).toBe('x'.repeat(90));
      // k1 was the oldest (LRU), should be evicted
      expect(cache.get('k1', 'memory')).toBeUndefined();

      cache.clear();
    });

    it('eviction only affects target tier (other tiers untouched)', () => {
      const cache = new ModuleCache(smallConfig);

      cache.set('mem1', 'aaaaaaaaaa', 'memory');
      cache.set('man1', 'bbbbbbbbbb', 'manifest');

      // Force eviction in memory tier with a large entry
      cache.set('mem2', 'x'.repeat(90), 'memory');

      // Manifest tier should be completely untouched
      expect(cache.get('man1', 'manifest')).toBe('bbbbbbbbbb');

      cache.clear();
    });

    it('evicting from empty tier does not throw', () => {
      const cache = new ModuleCache(smallConfig);

      // Adding an entry to an empty tier should not throw even if
      // the entry alone exceeds the tier max (eviction loop exits gracefully)
      expect(() => {
        cache.set('oversized', 'x'.repeat(200), 'memory');
      }).not.toThrow();

      cache.clear();
    });
  });

  // -------------------------------------------------------------------------
  // TTL + LRU interaction
  // -------------------------------------------------------------------------
  describe('TTL + LRU interaction', () => {
    it('expired entry cleaned up on get (data tier with TTL)', () => {
      const cache = new ModuleCache(smallConfig);

      // data tier has ttl=5 (5 seconds) in smallConfig
      cache.set('d1', 'value', 'data');

      // Should be accessible immediately
      expect(cache.get('d1', 'data')).toBe('value');

      // Fast-forward time past the 5s TTL
      const originalNow = Date.now;
      Date.now = () => originalNow() + 6000;

      expect(cache.get('d1', 'data')).toBeUndefined();

      Date.now = originalNow;
      cache.clear();
    });

    it('data tier applies default TTL from config', () => {
      const cache = new ModuleCache(smallConfig);

      // Set in data tier without explicit TTL -> should use config ttl=5
      cache.set('d1', 'auto-ttl-value', 'data');

      // Accessible before TTL
      const originalNow = Date.now;
      Date.now = () => originalNow() + 4000;
      expect(cache.get('d1', 'data')).toBe('auto-ttl-value');

      // Expired after TTL
      Date.now = () => originalNow() + 6000;
      expect(cache.get('d1', 'data')).toBeUndefined();

      Date.now = originalNow;
      cache.clear();
    });

    it('explicit TTL overrides data tier default', () => {
      const cache = new ModuleCache(smallConfig);

      // data tier default TTL is 5s, but we pass TTL=1
      cache.set('d1', 'short-lived', 'data', 1);

      const originalNow = Date.now;

      // Should be expired after 2 seconds (TTL=1s)
      Date.now = () => originalNow() + 2000;
      expect(cache.get('d1', 'data')).toBeUndefined();

      Date.now = originalNow;
      cache.clear();
    });

    it('entry without TTL in non-data tier never expires', () => {
      const cache = new ModuleCache(smallConfig);

      cache.set('m1', 'persistent', 'manifest');

      // Fast-forward 24 hours
      const originalNow = Date.now;
      Date.now = () => originalNow() + 86400000;

      expect(cache.get('m1', 'manifest')).toBe('persistent');

      Date.now = originalNow;
      cache.clear();
    });
  });

  // -------------------------------------------------------------------------
  // Multi-tier interactions
  // -------------------------------------------------------------------------
  describe('Multi-tier interactions', () => {
    it('same key stored in different tiers: both accessible independently', () => {
      const cache = new ModuleCache(smallConfig);

      cache.set('shared-key', 'memory-val', 'memory');
      cache.set('shared-key', 'manifest-val', 'manifest');

      expect(cache.get('shared-key', 'memory')).toBe('memory-val');
      expect(cache.get('shared-key', 'manifest')).toBe('manifest-val');

      cache.clear();
    });

    it('get without tier parameter finds key in any tier', () => {
      const cache = new ModuleCache(smallConfig);

      cache.set('findme', 'found-value', 'schema');

      // get without tier should search all tiers
      expect(cache.get('findme')).toBe('found-value');

      cache.clear();
    });

    it('delete without tier prefix searches all tiers', () => {
      const cache = new ModuleCache(smallConfig);

      cache.set('del-target', 'value', 'asset');

      // Delete using raw key (no tier prefix)
      cache.delete('del-target');

      expect(cache.get('del-target', 'asset')).toBeUndefined();

      cache.clear();
    });

    it('clear specific tier preserves all other tiers', () => {
      const cache = new ModuleCache(smallConfig);

      cache.set('k-mem', 'v1', 'memory');
      cache.set('k-man', 'v2', 'manifest');
      cache.set('k-sch', 'v3', 'schema');
      cache.set('k-dat', 'v4', 'data');
      cache.set('k-ast', 'v5', 'asset');

      expect(cache.getStats().totalEntries).toBe(5);

      // Clear only data tier
      cache.clear('data');

      expect(cache.get('k-mem', 'memory')).toBe('v1');
      expect(cache.get('k-man', 'manifest')).toBe('v2');
      expect(cache.get('k-sch', 'schema')).toBe('v3');
      expect(cache.get('k-dat', 'data')).toBeUndefined();
      expect(cache.get('k-ast', 'asset')).toBe('v5');

      expect(cache.getStats().totalEntries).toBe(4);

      cache.clear();
    });

    it('asset tier set/get works correctly', () => {
      const cache = new ModuleCache(smallConfig);

      const assetData = { uri: 'file:///icon.png', width: 64, height: 64 };
      cache.set('icon-1', assetData, 'asset');

      expect(cache.get('icon-1', 'asset')).toEqual(assetData);

      cache.clear();
    });
  });

  // -------------------------------------------------------------------------
  // Stats accuracy
  // -------------------------------------------------------------------------
  describe('Stats accuracy', () => {
    it('stats reflect entries across all 5 tiers simultaneously', () => {
      const cache = new ModuleCache(smallConfig);

      cache.set('a', '1', 'memory');
      cache.set('b', '2', 'manifest');
      cache.set('c', '3', 'schema');
      cache.set('d', '4', 'data');
      cache.set('e', '5', 'asset');

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(5);
      expect(stats.tierCounts.memory).toBe(1);
      expect(stats.tierCounts.manifest).toBe(1);
      expect(stats.tierCounts.schema).toBe(1);
      expect(stats.tierCounts.data).toBe(1);
      expect(stats.tierCounts.asset).toBe(1);

      cache.clear();
    });

    it('stats update correctly after LRU eviction', () => {
      const cache = new ModuleCache(smallConfig);

      cache.set('k1', 'aaaaaaaaaa', 'memory');
      cache.set('k2', 'bbbbbbbbbb', 'memory');

      expect(cache.getStats().tierCounts.memory).toBe(2);

      // Force eviction with a large entry
      cache.set('k3', 'x'.repeat(90), 'memory');

      const stats = cache.getStats();
      // At least one entry should have been evicted
      expect(stats.tierCounts.memory).toBeLessThan(3);
      // The large entry should be present
      expect(cache.get('k3', 'memory')).toBe('x'.repeat(90));

      cache.clear();
    });

    it('stats show zero for cleared tier after clear(tier)', () => {
      const cache = new ModuleCache(smallConfig);

      cache.set('d1', 'v1', 'data');
      cache.set('d2', 'v2', 'data');
      cache.set('m1', 'v3', 'memory');

      cache.clear('data');

      const stats = cache.getStats();
      expect(stats.tierCounts.data).toBe(0);
      expect(stats.tierCounts.memory).toBe(1);
      expect(stats.totalEntries).toBe(1);

      cache.clear();
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('Edge cases', () => {
    it('non-serializable value (circular reference) gets default size estimate', () => {
      const cache = new ModuleCache(smallConfig);

      // Create a circular reference object
      const circular: Record<string, unknown> = { name: 'test' };
      circular.self = circular;

      // Should not throw - estimateSize falls back to 1024
      expect(() => {
        cache.set('circular-key', circular, 'memory');
      }).not.toThrow();

      // Should be retrievable
      const result = cache.get('circular-key', 'memory') as Record<string, unknown>;
      expect(result).toBeDefined();
      expect(result.name).toBe('test');

      cache.clear();
    });

    it('stores and retrieves deeply nested objects', () => {
      const cache = new ModuleCache(smallConfig);

      const nested = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      };

      cache.set('deep-key', nested, 'schema');

      const result = cache.get('deep-key', 'schema') as typeof nested;
      expect(result.level1.level2.level3.level4.value).toBe('deep');

      cache.clear();
    });

    it('delete with already-prefixed key works directly', () => {
      const cache = new ModuleCache(smallConfig);

      cache.set('key1', 'value', 'memory');

      // Delete using the prefixed key directly (memory:key1)
      cache.delete('memory:key1');

      expect(cache.get('key1', 'memory')).toBeUndefined();

      cache.clear();
    });
  });
});
