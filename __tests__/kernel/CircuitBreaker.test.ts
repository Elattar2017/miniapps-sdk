/**
 * CircuitBreaker Test Suite
 * Tests the circuit breaker pattern: CLOSED, OPEN, HALF_OPEN states,
 * transitions, failure counting, reset, and recovery behavior.
 */

import { CircuitBreaker } from '../../src/kernel/errors/CircuitBreaker';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CircuitBreaker', () => {
  it('should start in CLOSED state', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should execute successfully in CLOSED state', async () => {
    const breaker = new CircuitBreaker();
    const result = await breaker.execute(async () => 'success');
    expect(result).toBe('success');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should transition to OPEN after failure threshold', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 60_000,
    });

    const failingFn = async (): Promise<string> => {
      throw new Error('service down');
    };

    // Trip the breaker by reaching the failure threshold
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow('service down');
    }

    expect(breaker.getState()).toBe('OPEN');
  });

  it('should reject calls when OPEN', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeout: 60_000,
    });

    const failingFn = async (): Promise<string> => {
      throw new Error('service down');
    };

    // Trip to OPEN
    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow('service down');
    }
    expect(breaker.getState()).toBe('OPEN');

    // Should reject immediately without calling the function
    await expect(
      breaker.execute(async () => 'should not run'),
    ).rejects.toThrow('Circuit breaker is OPEN');
  });

  it('should transition to HALF_OPEN after reset timeout', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeout: 100, // 100ms for testing
    });

    const failingFn = async (): Promise<string> => {
      throw new Error('service down');
    };

    // Trip to OPEN
    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow('service down');
    }
    expect(breaker.getState()).toBe('OPEN');

    // Wait for the reset timeout to elapse
    await new Promise((resolve) => setTimeout(resolve, 150));

    // getState() should report HALF_OPEN after timeout
    expect(breaker.getState()).toBe('HALF_OPEN');
  });

  it('should close on successful HALF_OPEN call', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeout: 100,
    });

    const failingFn = async (): Promise<string> => {
      throw new Error('service down');
    };

    // Trip to OPEN
    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow('service down');
    }

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Execute a successful call in HALF_OPEN state
    const result = await breaker.execute(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should reopen on failed HALF_OPEN call', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeout: 100,
    });

    const failingFn = async (): Promise<string> => {
      throw new Error('service down');
    };

    // Trip to OPEN
    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow('service down');
    }

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Execute a failing call in HALF_OPEN state
    await expect(breaker.execute(failingFn)).rejects.toThrow('service down');
    expect(breaker.getState()).toBe('OPEN');
  });

  it('should reset properly', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeout: 60_000,
    });

    const failingFn = async (): Promise<string> => {
      throw new Error('service down');
    };

    // Trip to OPEN
    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow('service down');
    }
    expect(breaker.getState()).toBe('OPEN');

    // Reset
    breaker.reset();
    expect(breaker.getState()).toBe('CLOSED');

    // Should work normally again
    const result = await breaker.execute(async () => 'works again');
    expect(result).toBe('works again');
  });

  it('should track statistics', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60_000,
    });

    // One success
    await breaker.execute(async () => 'ok');

    // One failure
    await expect(
      breaker.execute(async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');

    const stats = breaker.getStats();
    expect(stats.state).toBe('CLOSED');
    expect(stats.successCount).toBe(1);
    expect(stats.failureCount).toBe(1);
    expect(stats.totalRequests).toBe(2);
    expect(stats.lastSuccessTime).toBeDefined();
    expect(stats.lastFailureTime).toBeDefined();
  });
});
