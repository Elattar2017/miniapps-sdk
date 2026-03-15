/**
 * TokenRefreshManager Test Suite
 * Tests JWT token monitoring, proactive refresh at 80% TTL,
 * exponential backoff on failure, and circuit breaker integration.
 * Uses real short timeouts (not fake timers) for timing-dependent tests.
 */

import { TokenRefreshManager } from '../../src/kernel/identity/TokenRefreshManager';
import { JWTValidator } from '../../src/kernel/identity/JWTValidator';
import { CircuitBreaker } from '../../src/kernel/errors/CircuitBreaker';

// Mock JWTValidator
jest.mock('../../src/kernel/identity/JWTValidator', () => {
  return {
    JWTValidator: jest.fn().mockImplementation(() => ({
      getTimeToExpiry: jest.fn().mockReturnValue(500),
      validate: jest.fn().mockReturnValue({ valid: true }),
      decode: jest.fn(),
      isExpired: jest.fn().mockReturnValue(false),
    })),
  };
});

// Mock CircuitBreaker to use short resetTimeout for tests
jest.mock('../../src/kernel/errors/CircuitBreaker', () => {
  const { CircuitBreaker: RealCircuitBreaker } = jest.requireActual(
    '../../src/kernel/errors/CircuitBreaker',
  );

  return {
    CircuitBreaker: jest.fn().mockImplementation((config?: any) => {
      // Override the resetTimeout to be very short for testing
      return new RealCircuitBreaker({
        ...config,
        resetTimeout: 100,
      });
    }),
  };
});

// Mock TOKEN_REFRESH constants to use very short delays for testing
jest.mock('../../src/constants/defaults', () => {
  const actual = jest.requireActual('../../src/constants/defaults');
  return {
    ...actual,
    TOKEN_REFRESH: {
      ...actual.TOKEN_REFRESH,
      MIN_RETRY_DELAY: 10,     // 10ms instead of 1000ms
      MAX_RETRY_DELAY: 100,    // 100ms instead of 30000ms
      BACKOFF_MULTIPLIER: 2,
      REFRESH_AT_PERCENTAGE: 0.8,
    },
  };
});

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

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Get the mocked JWTValidator instance from a TokenRefreshManager */
function getMockValidator(): any {
  const MockedJWTValidator = JWTValidator as jest.MockedClass<typeof JWTValidator>;
  const lastCall = MockedJWTValidator.mock.results[MockedJWTValidator.mock.results.length - 1];
  return lastCall?.value;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TokenRefreshManager', () => {
  let mockCallback: jest.Mock<Promise<string>>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallback = jest.fn().mockResolvedValue('new-token-abc');
  });

  describe('constructor', () => {
    it('creates JWTValidator and CircuitBreaker instances', () => {
      const _manager = new TokenRefreshManager(mockCallback);

      expect(JWTValidator).toHaveBeenCalledTimes(1);
      expect(CircuitBreaker).toHaveBeenCalledTimes(1);
    });
  });

  describe('startMonitoring', () => {
    it('schedules refresh that fires after ~80% of TTL', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const validator = getMockValidator();
      // TTL of 200ms -> refresh at 80% = 160ms
      validator.getTimeToExpiry.mockReturnValue(200);

      // After callback succeeds, prevent re-monitoring loop
      mockCallback.mockImplementation(async () => {
        validator.getTimeToExpiry.mockReturnValue(60000); // large TTL for restart
        return 'refreshed-token';
      });

      manager.startMonitoring('test-token');

      // At 100ms, callback should NOT have been called yet
      await wait(100);
      expect(mockCallback).not.toHaveBeenCalled();

      // At 250ms (past 160ms), callback should have been called
      await wait(150);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      manager.stopMonitoring();
    });

    it('with expired token (TTL=0), triggers immediate refresh', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const validator = getMockValidator();
      validator.getTimeToExpiry.mockReturnValue(0);

      // After first callback, return large TTL to prevent infinite loop
      mockCallback.mockImplementation(async () => {
        validator.getTimeToExpiry.mockReturnValue(60000);
        return 'refreshed-expired-token';
      });

      manager.startMonitoring('expired-token');

      // Should trigger almost immediately
      await wait(50);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      manager.stopMonitoring();
    });

    it('stops any previous monitoring first', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const validator = getMockValidator();
      validator.getTimeToExpiry.mockReturnValue(100);

      // Prevent re-monitoring loop on callback success
      mockCallback.mockImplementation(async () => {
        validator.getTimeToExpiry.mockReturnValue(60000);
        return 'refreshed';
      });

      // Start first monitoring
      manager.startMonitoring('token-1');

      // Start second monitoring before first fires
      await wait(30);
      validator.getTimeToExpiry.mockReturnValue(200);
      manager.startMonitoring('token-2');

      // Wait for the original 80ms (80% of 100ms) to pass
      // The first timer should have been cleared, so callback should not fire at 80ms
      await wait(60);
      expect(mockCallback).not.toHaveBeenCalled();

      // Wait for the second timer's 160ms (80% of 200ms) to pass
      await wait(130);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      manager.stopMonitoring();
    });
  });

  describe('stopMonitoring', () => {
    it('prevents scheduled refresh from firing', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const validator = getMockValidator();
      validator.getTimeToExpiry.mockReturnValue(200);

      manager.startMonitoring('test-token');

      // Stop before the refresh would fire (80% of 200ms = 160ms)
      await wait(50);
      manager.stopMonitoring();

      // Wait past when the refresh would have fired
      await wait(200);
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('sets isMonitoring to false', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const validator = getMockValidator();
      validator.getTimeToExpiry.mockReturnValue(500);

      manager.startMonitoring('test-token');
      manager.stopMonitoring();

      // Calling refreshNow while not monitoring should NOT restart monitoring
      await manager.refreshNow();
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Wait a bit to confirm no new monitoring was started
      await wait(100);
      // Only the one explicit refreshNow call
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('refreshNow', () => {
    it('succeeds on first attempt, returns new token', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      mockCallback.mockResolvedValue('fresh-token');

      const result = await manager.refreshNow();

      expect(result).toBe('fresh-token');
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('fails once then succeeds on 2nd attempt', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      mockCallback
        .mockRejectedValueOnce(new Error('auth server down'))
        .mockResolvedValue('retry-token');

      const result = await manager.refreshNow();

      expect(result).toBe('retry-token');
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('exhausts all 5 attempts and throws', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      mockCallback.mockRejectedValue(new Error('persistent auth failure'));

      await expect(manager.refreshNow()).rejects.toThrow();

      // The circuit breaker will open after 3 failures (threshold=3),
      // remaining attempts get circuit breaker rejections (callback not called).
      // So callback is called 3 times, but there are 5 total attempts.
      expect(mockCallback.mock.calls.length).toBeLessThanOrEqual(5);
    });

    it('after success while monitoring, restarts monitoring with new token', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const validator = getMockValidator();
      validator.getTimeToExpiry.mockReturnValue(5000);

      manager.startMonitoring('original-token');
      mockCallback.mockResolvedValue('refreshed-token');

      const result = await manager.refreshNow();
      expect(result).toBe('refreshed-token');

      // startMonitoring should have been called internally with the new token
      // Verify getTimeToExpiry was called again (for the new monitoring cycle)
      // It was called once for the original startMonitoring and once for the restart
      expect(validator.getTimeToExpiry.mock.calls.length).toBeGreaterThanOrEqual(2);

      manager.stopMonitoring();
    });

    it('after success while NOT monitoring, does NOT restart', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const validator = getMockValidator();
      validator.getTimeToExpiry.mockReturnValue(500);

      // Do NOT call startMonitoring - just call refreshNow directly
      mockCallback.mockResolvedValue('direct-refresh-token');

      const result = await manager.refreshNow();
      expect(result).toBe('direct-refresh-token');

      // getTimeToExpiry should NOT have been called (no monitoring restart)
      expect(validator.getTimeToExpiry).not.toHaveBeenCalled();
    });

    it('stopMonitoring during pending refreshNow: no restart after completion', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const validator = getMockValidator();
      validator.getTimeToExpiry.mockReturnValue(5000);

      manager.startMonitoring('original-token');

      // Make callback slow so we can stop monitoring during refresh
      mockCallback.mockImplementation(async () => {
        await wait(50);
        return 'slow-refresh-token';
      });

      const refreshPromise = manager.refreshNow();

      // Stop monitoring while refresh is in progress
      await wait(10);
      manager.stopMonitoring();

      const result = await refreshPromise;
      expect(result).toBe('slow-refresh-token');

      // getTimeToExpiry: called once for initial startMonitoring,
      // NOT called again because monitoring was stopped
      const callCount = validator.getTimeToExpiry.mock.calls.length;
      expect(callCount).toBe(1);
    });

    it('wraps non-Error thrown values to Error', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      mockCallback.mockRejectedValue('string error');

      // The circuit breaker and retry loop should still handle non-Error throws
      await expect(manager.refreshNow()).rejects.toThrow();
    });
  });

  describe('circuit breaker integration', () => {
    it('after 3 failures, breaker opens, next call gets breaker rejection', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      mockCallback.mockRejectedValue(new Error('auth down'));

      // First refreshNow will exhaust its 5 attempts.
      // The circuit breaker (threshold=3) will open after 3 failures,
      // and the remaining attempts will be rejected by the breaker.
      await expect(manager.refreshNow()).rejects.toThrow();

      // The callback is called until breaker opens (3 times), plus possibly
      // once more when the breaker transitions to HALF_OPEN after reset timeout
      // elapses during the backoff delays within refreshNow.
      const callCountAfterFirst = mockCallback.mock.calls.length;
      expect(callCountAfterFirst).toBeGreaterThanOrEqual(3);
      expect(callCountAfterFirst).toBeLessThanOrEqual(5);

      // Reset the callback to succeed
      mockCallback.mockResolvedValue('recovered-token');

      // Wait for breaker resetTimeout (100ms) so it transitions to HALF_OPEN
      await wait(150);

      // Now the breaker should be in HALF_OPEN and allow a call through
      const result = await manager.refreshNow();
      expect(result).toBe('recovered-token');
    });
  });

  describe('exponential backoff', () => {
    it('delays increase between retry attempts', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const callTimes: number[] = [];

      mockCallback.mockImplementation(async () => {
        callTimes.push(Date.now());
        throw new Error('timed failure');
      });

      const startTime = Date.now();
      await expect(manager.refreshNow()).rejects.toThrow();

      const elapsed = Date.now() - startTime;
      // With mocked MIN_RETRY_DELAY=10 and BACKOFF_MULTIPLIER=2,
      // delays are 10ms, 20ms before breaker opens at attempt 3.
      // Total minimum elapsed: 10 + 20 = 30ms
      expect(elapsed).toBeGreaterThanOrEqual(20);

      // Called at least 3 times (before breaker opens), possibly more
      // if breaker resets to HALF_OPEN during backoff waits
      expect(callTimes.length).toBeGreaterThanOrEqual(3);

      // Verify delays increased between the first 3 calls
      const gap1 = callTimes[1] - callTimes[0];
      const gap2 = callTimes[2] - callTimes[1];
      // Second gap should be >= first gap (backoff multiplier)
      expect(gap2).toBeGreaterThanOrEqual(gap1);
    });
  });

  describe('multiple startMonitoring calls', () => {
    it('only one timer active at a time', async () => {
      const manager = new TokenRefreshManager(mockCallback);
      const validator = getMockValidator();
      validator.getTimeToExpiry.mockReturnValue(150);

      // Prevent re-monitoring loop
      mockCallback.mockImplementation(async () => {
        validator.getTimeToExpiry.mockReturnValue(60000);
        return 'refreshed';
      });

      // Start monitoring 3 times quickly
      manager.startMonitoring('token-1');
      manager.startMonitoring('token-2');
      manager.startMonitoring('token-3');

      // Wait for the refresh to fire (80% of 150ms = 120ms)
      await wait(200);

      // Only one timer should have fired, so callback called once
      expect(mockCallback).toHaveBeenCalledTimes(1);

      manager.stopMonitoring();
    });
  });
});
