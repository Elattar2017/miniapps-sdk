/**
 * PolicyCache Test Suite
 *
 * Tests for the LRU cache with TTL expiry used by the PolicyEngine.
 * Covers get/set, TTL expiry, LRU eviction, invalidation, and clear.
 */

import { PolicyCache } from '../../src/kernel/policy/PolicyCache';
import type { PolicyDecision } from '../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Create a PolicyDecision */
function createDecision(allowed: boolean, reason?: string): PolicyDecision {
  return { allowed, reason };
}

/** Helper to wait a given number of milliseconds (real time) */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('PolicyCache', () => {
  // ---------------------------------------------------------------------------
  // get / set basics
  // ---------------------------------------------------------------------------

  describe('get/set', () => {
    it('stores and retrieves PolicyDecision', () => {
      const cache = new PolicyCache();
      const decision = createDecision(true, 'allowed by default');
      cache.set('resource:read:user1', decision);

      const result = cache.get('resource:read:user1');
      expect(result).toEqual(decision);
    });

    it('returns undefined for non-existent key', () => {
      const cache = new PolicyCache();
      expect(cache.get('non-existent')).toBeUndefined();
    });

    it('updates lastAccessedAt (LRU touch) on get', async () => {
      // Use a short TTL but long enough that entries won't expire during the test
      const cache = new PolicyCache(5000, 3);
      cache.set('a', createDecision(true));
      cache.set('b', createDecision(true));
      cache.set('c', createDecision(true));

      // Wait briefly then access 'a' to update its LRU timestamp
      await wait(10);
      cache.get('a');

      // Now adding a new entry should evict 'b' (least recently accessed), not 'a'
      cache.set('d', createDecision(true));

      expect(cache.get('a')).toBeDefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBeDefined();
      expect(cache.get('d')).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // TTL expiry
  // ---------------------------------------------------------------------------

  describe('TTL expiry', () => {
    it('returns undefined for expired entry', async () => {
      const cache = new PolicyCache(50, 100); // 50ms TTL
      cache.set('key', createDecision(true));

      // Wait for expiry
      await wait(60);

      expect(cache.get('key')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // set() overwrite and eviction
  // ---------------------------------------------------------------------------

  describe('set() overwrite and eviction', () => {
    it('overwrites existing key without eviction', () => {
      const cache = new PolicyCache(5000, 3);
      cache.set('a', createDecision(true, 'first'));
      cache.set('a', createDecision(false, 'second'));

      expect(cache.size).toBe(1);
      expect(cache.get('a')?.allowed).toBe(false);
      expect(cache.get('a')?.reason).toBe('second');
    });

    it('at maxEntries capacity triggers LRU eviction', () => {
      const cache = new PolicyCache(5000, 3);
      cache.set('a', createDecision(true));
      cache.set('b', createDecision(true));
      cache.set('c', createDecision(true));

      // Cache is full, adding 'd' should evict 'a' (oldest accessed)
      cache.set('d', createDecision(true));

      expect(cache.size).toBe(3);
      expect(cache.get('a')).toBeUndefined();
    });

    it('evicts least-recently-accessed entry', async () => {
      const cache = new PolicyCache(5000, 3);
      cache.set('a', createDecision(true));
      await wait(5);
      cache.set('b', createDecision(true));
      await wait(5);
      cache.set('c', createDecision(true));

      // Access 'a' to update its timestamp, making 'b' the LRU
      await wait(5);
      cache.get('a');

      cache.set('d', createDecision(true));

      expect(cache.get('a')).toBeDefined();
      expect(cache.get('b')).toBeUndefined(); // 'b' was LRU
      expect(cache.get('c')).toBeDefined();
      expect(cache.get('d')).toBeDefined();
    });

    it('accessing entry before eviction protects it (updates LRU)', async () => {
      const cache = new PolicyCache(5000, 2);
      cache.set('a', createDecision(true));
      await wait(5);
      cache.set('b', createDecision(true));

      // Access 'a' to keep it fresh
      await wait(5);
      cache.get('a');

      // Add 'c' - should evict 'b' (LRU), not 'a'
      cache.set('c', createDecision(true));

      expect(cache.get('a')).toBeDefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // invalidate()
  // ---------------------------------------------------------------------------

  describe('invalidate()', () => {
    it('removes specific entry', () => {
      const cache = new PolicyCache();
      cache.set('a', createDecision(true));
      cache.set('b', createDecision(false));

      cache.invalidate('a');

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeDefined();
      expect(cache.size).toBe(1);
    });

    it('no-op on non-existent key', () => {
      const cache = new PolicyCache();
      cache.set('a', createDecision(true));

      // Should not throw
      cache.invalidate('non-existent');

      expect(cache.size).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // clear()
  // ---------------------------------------------------------------------------

  describe('clear()', () => {
    it('removes all entries', () => {
      const cache = new PolicyCache();
      cache.set('a', createDecision(true));
      cache.set('b', createDecision(false));
      cache.set('c', createDecision(true));

      cache.clear();

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBeUndefined();
    });

    it('size returns 0 after clear', () => {
      const cache = new PolicyCache();
      cache.set('a', createDecision(true));
      cache.set('b', createDecision(false));

      cache.clear();

      expect(cache.size).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // size
  // ---------------------------------------------------------------------------

  describe('size', () => {
    it('returns correct count', () => {
      const cache = new PolicyCache();
      expect(cache.size).toBe(0);

      cache.set('a', createDecision(true));
      expect(cache.size).toBe(1);

      cache.set('b', createDecision(false));
      expect(cache.size).toBe(2);

      cache.invalidate('a');
      expect(cache.size).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Eviction prefers expired entries
  // ---------------------------------------------------------------------------

  describe('eviction edge cases', () => {
    it('prefers expired entries over LRU', async () => {
      const cache = new PolicyCache(50, 3); // 50ms TTL

      cache.set('a', createDecision(true));
      cache.set('b', createDecision(true));
      await wait(60); // 'a' and 'b' are now expired

      cache.set('c', createDecision(true)); // still fresh

      // Now add 'd' - should clean expired 'a' and 'b', keep 'c'
      cache.set('d', createDecision(true));

      expect(cache.get('c')).toBeDefined();
      expect(cache.get('d')).toBeDefined();
      // 'a' and 'b' were expired and cleaned up
      expect(cache.size).toBe(2);
    });

    it('all entries expired during eviction scan', async () => {
      const cache = new PolicyCache(50, 3); // 50ms TTL

      cache.set('a', createDecision(true));
      cache.set('b', createDecision(true));
      cache.set('c', createDecision(true));

      await wait(60); // All expired

      // Adding a new entry should clean all expired entries
      cache.set('d', createDecision(true));

      expect(cache.size).toBe(1);
      expect(cache.get('d')).toBeDefined();
    });
  });
});
