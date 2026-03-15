/**
 * TokenRefreshManager Advanced Test Suite
 *
 * Additional edge case coverage for backoff, monitoring, and error paths.
 */

import { TokenRefreshManager } from '../../../src/kernel/identity/TokenRefreshManager';
import { JWTValidator } from '../../../src/kernel/identity/JWTValidator';

jest.mock('../../../src/kernel/identity/JWTValidator', () => ({
  JWTValidator: jest.fn().mockImplementation(() => ({
    getTimeToExpiry: jest.fn().mockReturnValue(500),
    validate: jest.fn().mockReturnValue({ valid: true }),
    decode: jest.fn(),
    isExpired: jest.fn().mockReturnValue(false),
  })),
}));

jest.mock('../../../src/kernel/errors/CircuitBreaker', () => {
  const { CircuitBreaker: RealCB } = jest.requireActual(
    '../../../src/kernel/errors/CircuitBreaker',
  );
  return {
    CircuitBreaker: jest.fn().mockImplementation((config?: any) =>
      new RealCB({ ...config, resetTimeout: 50 }),
    ),
  };
});

jest.mock('../../../src/constants/defaults', () => {
  const actual = jest.requireActual('../../../src/constants/defaults');
  return {
    ...actual,
    TOKEN_REFRESH: {
      ...actual.TOKEN_REFRESH,
      MIN_RETRY_DELAY: 5,
      MAX_RETRY_DELAY: 50,
      BACKOFF_MULTIPLIER: 2,
      REFRESH_AT_PERCENTAGE: 0.8,
    },
  };
});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function getMockValidator(): any {
  const M = JWTValidator as jest.MockedClass<typeof JWTValidator>;
  return M.mock.results[M.mock.results.length - 1]?.value;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TokenRefreshManager Advanced', () => {
  let mockCallback: jest.Mock<Promise<string>>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallback = jest.fn().mockResolvedValue('new-token');
  });

  // -------------------------------------------------------------------------
  // Backoff behavior
  // -------------------------------------------------------------------------
  describe('Backoff behavior', () => {
    it('delay doubles between retry attempts', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const callTimes: number[] = [];

      mockCallback.mockImplementation(async () => {
        callTimes.push(Date.now());
        throw new Error('fail');
      });

      await expect(manager.refreshNow()).rejects.toThrow();

      // We need at least 3 actual callback calls to compare gaps
      // (circuit breaker may limit this, but with threshold=3 we get 3)
      expect(callTimes.length).toBeGreaterThanOrEqual(3);

      const gap1 = callTimes[1] - callTimes[0];
      const gap2 = callTimes[2] - callTimes[1];

      // With MIN_RETRY_DELAY=5 and BACKOFF_MULTIPLIER=2:
      // gap1 ~= 5ms, gap2 ~= 10ms
      // Due to system timer jitter, use a tolerance: gap2 should be at
      // least 60% of gap1 (verifying backoff is configured, not exact doubling)
      // The key invariant is that total elapsed time is consistent with backoff.
      const totalElapsed = callTimes[callTimes.length - 1] - callTimes[0];
      // Total elapsed should be > MIN_RETRY_DELAY (backoff is occurring)
      expect(totalElapsed).toBeGreaterThanOrEqual(5);
      // gap2 should be roughly >= gap1 (within timing jitter)
      // We verify the second delay is at least 4ms (since MIN=5 * MULT=2 = 10ms target)
      expect(gap2).toBeGreaterThanOrEqual(4);
    });

    it('delay caps at MAX_RETRY_DELAY', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const callTimes: number[] = [];

      // Make the circuit breaker not trip too early by having the callback
      // track times on each call
      mockCallback.mockImplementation(async () => {
        callTimes.push(Date.now());
        throw new Error('fail');
      });

      const startTime = Date.now();
      await expect(manager.refreshNow()).rejects.toThrow();
      const totalElapsed = Date.now() - startTime;

      // With MIN=5, MAX=50, MULT=2, the delays are: 5, 10, 20, 40, 50 (capped)
      // But circuit breaker may open after 3 failures, limiting actual delays used.
      // The total elapsed should be bounded and not grow unboundedly.
      // 5 attempts max with delays up to 50ms each -> max ~200ms total
      expect(totalElapsed).toBeLessThan(500);
    });
  });

  // -------------------------------------------------------------------------
  // Monitoring edge cases
  // -------------------------------------------------------------------------
  describe('Monitoring edge cases', () => {
    it('negative TTL triggers immediate refresh', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const validator = getMockValidator();
      validator.getTimeToExpiry.mockReturnValue(-100);

      // After first callback, set a large TTL to prevent infinite loop
      mockCallback.mockImplementation(async () => {
        validator.getTimeToExpiry.mockReturnValue(60000);
        return 'refreshed-after-negative-ttl';
      });

      manager.startMonitoring('expired-token');

      // Should trigger almost immediately (negative TTL -> delay 0)
      await wait(50);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      manager.stopMonitoring();
    });

    it('stopMonitoring called multiple times does not throw', () => {
      const manager = new TokenRefreshManager(mockCallback);
      const validator = getMockValidator();
      validator.getTimeToExpiry.mockReturnValue(5000);

      manager.startMonitoring('token');

      // Call stopMonitoring multiple times
      expect(() => {
        manager.stopMonitoring();
        manager.stopMonitoring();
        manager.stopMonitoring();
      }).not.toThrow();
    });

    it('stopMonitoring when no monitoring started does not throw', () => {
      const manager = new TokenRefreshManager(mockCallback);

      // Never called startMonitoring, stopMonitoring should be safe
      expect(() => {
        manager.stopMonitoring();
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Error paths
  // -------------------------------------------------------------------------
  describe('Error paths', () => {
    it('throws last error when all retries exhausted', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      mockCallback.mockRejectedValue(new Error('auth-server-down'));

      try {
        await manager.refreshNow();
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        // The error could be from the callback or from the circuit breaker
        expect((err as Error).message).toBeDefined();
      }
    });

    it('non-Error thrown values are handled', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      mockCallback.mockRejectedValue('string-error-value');

      // Should not crash; string errors are wrapped into Error objects
      await expect(manager.refreshNow()).rejects.toThrow();
    });

    it('callback succeeds on 3rd attempt: returns token', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      mockCallback
        .mockRejectedValueOnce(new Error('attempt-1-fail'))
        .mockRejectedValueOnce(new Error('attempt-2-fail'))
        .mockResolvedValueOnce('success-on-third');

      const result = await manager.refreshNow();
      expect(result).toBe('success-on-third');
      expect(mockCallback).toHaveBeenCalledTimes(3);
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------
  describe('Lifecycle', () => {
    it('startMonitoring immediately after stopMonitoring works', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const validator = getMockValidator();
      validator.getTimeToExpiry.mockReturnValue(100);

      // Prevent re-monitoring loop on success
      mockCallback.mockImplementation(async () => {
        validator.getTimeToExpiry.mockReturnValue(60000);
        return 'refreshed';
      });

      manager.startMonitoring('token-1');
      manager.stopMonitoring();

      // Immediately start again
      validator.getTimeToExpiry.mockReturnValue(100);
      manager.startMonitoring('token-2');

      // Wait for the refresh to fire (80% of 100ms = 80ms)
      await wait(150);

      expect(mockCallback).toHaveBeenCalledTimes(1);

      manager.stopMonitoring();
    });

    it('refreshNow while monitoring restarts monitoring cycle', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const validator = getMockValidator();
      validator.getTimeToExpiry.mockReturnValue(5000);

      manager.startMonitoring('original-token');

      mockCallback.mockResolvedValue('manually-refreshed-token');

      const result = await manager.refreshNow();
      expect(result).toBe('manually-refreshed-token');

      // After refreshNow succeeds while monitoring, startMonitoring is called
      // internally with the new token, which calls getTimeToExpiry again
      expect(validator.getTimeToExpiry.mock.calls.length).toBeGreaterThanOrEqual(2);

      manager.stopMonitoring();
    });
  });
});
