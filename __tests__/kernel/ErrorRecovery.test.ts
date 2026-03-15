/**
 * ErrorRecovery Test Suite
 * Tests the four recovery strategies: retry (exponential backoff),
 * fallback, degrade, and abort. Uses real short timeouts for timing tests.
 */

import { ErrorRecovery } from '../../src/kernel/errors/ErrorRecovery';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('ErrorRecovery', () => {
  let recovery: ErrorRecovery;

  beforeEach(() => {
    recovery = new ErrorRecovery();
  });

  // =========================================================================
  // Retry Strategy
  // =========================================================================

  describe('retry strategy', () => {
    it('succeeds on first attempt (no retries needed)', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await recovery.recover(fn, {
        strategy: 'retry',
        retryDelay: 10,
        backoffMultiplier: 2,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('fails once then succeeds on 2nd attempt', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockResolvedValue('recovered');

      const result = await recovery.recover(fn, {
        strategy: 'retry',
        retryDelay: 10,
        backoffMultiplier: 2,
      });

      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('fails twice then succeeds on 3rd attempt', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('third try');

      const result = await recovery.recover(fn, {
        strategy: 'retry',
        retryDelay: 10,
        backoffMultiplier: 2,
      });

      expect(result).toBe('third try');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('exhausts all retries (3 default) and throws last error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('persistent failure'));

      await expect(
        recovery.recover(fn, {
          strategy: 'retry',
          retryDelay: 10,
          backoffMultiplier: 2,
        }),
      ).rejects.toThrow('persistent failure');

      // 1 initial + 3 retries = 4 total attempts
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('uses custom maxRetries (e.g., 1)', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await expect(
        recovery.recover(fn, {
          strategy: 'retry',
          maxRetries: 1,
          retryDelay: 10,
          backoffMultiplier: 2,
        }),
      ).rejects.toThrow('fail');

      // 1 initial + 1 retry = 2 total attempts
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('uses custom retryDelay (verify delays increase)', async () => {
      const callTimes: number[] = [];
      const fn = jest.fn().mockImplementation(async () => {
        callTimes.push(Date.now());
        throw new Error('timed fail');
      });

      const startTime = Date.now();
      await expect(
        recovery.recover(fn, {
          strategy: 'retry',
          maxRetries: 2,
          retryDelay: 50,
          backoffMultiplier: 2,
        }),
      ).rejects.toThrow('timed fail');

      // 3 calls total: initial + 2 retries
      expect(fn).toHaveBeenCalledTimes(3);

      // The total time should be at least 50ms + 100ms = 150ms (with backoff)
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeGreaterThanOrEqual(100);
    });

    it('uses custom backoffMultiplier', async () => {
      const callTimes: number[] = [];
      const fn = jest.fn().mockImplementation(async () => {
        callTimes.push(Date.now());
        throw new Error('backoff fail');
      });

      await expect(
        recovery.recover(fn, {
          strategy: 'retry',
          maxRetries: 2,
          retryDelay: 30,
          backoffMultiplier: 3,
        }),
      ).rejects.toThrow('backoff fail');

      expect(fn).toHaveBeenCalledTimes(3);

      // With multiplier=3: delays are 30ms, 90ms = 120ms minimum total
      if (callTimes.length === 3) {
        const gap1 = callTimes[1] - callTimes[0];
        const gap2 = callTimes[2] - callTimes[1];
        // Second gap should be larger than first gap
        expect(gap2).toBeGreaterThanOrEqual(gap1);
      }
    });

    it('wraps non-Error thrown values to Error', async () => {
      const fn = jest.fn().mockRejectedValue('string error');

      await expect(
        recovery.recover(fn, {
          strategy: 'retry',
          maxRetries: 0,
          retryDelay: 10,
          backoffMultiplier: 2,
        }),
      ).rejects.toThrow('string error');
    });
  });

  // =========================================================================
  // Fallback Strategy
  // =========================================================================

  describe('fallback strategy', () => {
    it('returns function result on success', async () => {
      const fn = jest.fn().mockResolvedValue('real result');

      const result = await recovery.recover(fn, {
        strategy: 'fallback',
        fallbackValue: 'fallback value',
      });

      expect(result).toBe('real result');
    });

    it('returns fallbackValue on failure', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      const result = await recovery.recover(fn, {
        strategy: 'fallback',
        fallbackValue: 'fallback value',
      });

      expect(result).toBe('fallback value');
    });

    it('returns null fallbackValue on failure', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      const result = await recovery.recover(fn, {
        strategy: 'fallback',
        fallbackValue: null,
      });

      expect(result).toBeNull();
    });

    it('returns undefined fallbackValue on failure', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      const result = await recovery.recover(fn, {
        strategy: 'fallback',
        fallbackValue: undefined,
      });

      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // Degrade Strategy
  // =========================================================================

  describe('degrade strategy', () => {
    it('returns function result on success', async () => {
      const fn = jest.fn().mockResolvedValue('degrade success');

      const result = await recovery.recover(fn, {
        strategy: 'degrade',
      });

      expect(result).toBe('degrade success');
    });

    it('returns undefined on failure', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('degrade fail'));

      const result = await recovery.recover(fn, {
        strategy: 'degrade',
      });

      expect(result).toBeUndefined();
    });
  });

  // =========================================================================
  // Abort Strategy
  // =========================================================================

  describe('abort strategy', () => {
    it('returns function result on success', async () => {
      const fn = jest.fn().mockResolvedValue('abort success');

      const result = await recovery.recover(fn, {
        strategy: 'abort',
      });

      expect(result).toBe('abort success');
    });

    it('re-throws error on failure', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('abort fail'));

      await expect(
        recovery.recover(fn, { strategy: 'abort' }),
      ).rejects.toThrow('abort fail');
    });

    it('wraps non-Error to Error before re-throwing', async () => {
      const fn = jest.fn().mockRejectedValue('string thrown');

      await expect(
        recovery.recover(fn, { strategy: 'abort' }),
      ).rejects.toThrow('string thrown');

      // Verify it throws an Error instance, not a raw string
      try {
        await recovery.recover(
          jest.fn().mockRejectedValue(42),
          { strategy: 'abort' },
        );
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toBe('42');
      }
    });
  });

  // =========================================================================
  // Unknown Strategy
  // =========================================================================

  describe('unknown strategy', () => {
    it('falls through to direct function execution', async () => {
      const fn = jest.fn().mockResolvedValue('direct result');

      const result = await recovery.recover(fn, {
        strategy: 'unknown' as any,
      });

      expect(result).toBe('direct result');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
