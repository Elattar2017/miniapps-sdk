/**
 * Circuit Breaker - Protect against cascading failures
 * @module kernel/errors/CircuitBreaker
 *
 * Implements the circuit breaker pattern with three states:
 * - CLOSED: Normal operation, tracking failures
 * - OPEN: Failing fast, rejecting all calls immediately
 * - HALF_OPEN: Testing recovery with limited calls
 *
 * State transitions:
 * CLOSED -> OPEN: When failure count reaches threshold
 * OPEN -> HALF_OPEN: After resetTimeout elapses
 * HALF_OPEN -> CLOSED: On successful call
 * HALF_OPEN -> OPEN: On failed call
 */

import { logger } from '../../utils/logger';
import { DEFAULT_CIRCUIT_BREAKER_CONFIG } from '../../constants/defaults';
import type { CircuitBreakerConfig, CircuitBreakerState, CircuitBreakerStats } from '../../types';

export class CircuitBreaker {
  private readonly log = logger.child({ component: 'CircuitBreaker' });
  private readonly config: CircuitBreakerConfig;

  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private lastFailureTime: number | undefined;
  private lastSuccessTime: number | undefined;
  private halfOpenAttempts = 0;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      ...config,
    };
  }

  /**
   * Execute a function through the circuit breaker.
   *
   * - CLOSED: Execute normally; on failure, increment failure count.
   *   If failure count reaches threshold, trip to OPEN.
   * - OPEN: Throw immediately without executing. If resetTimeout has
   *   elapsed since last failure, transition to HALF_OPEN and try.
   * - HALF_OPEN: Execute; on success, go to CLOSED; on failure, go to OPEN.
   *
   * @param fn The async function to execute
   * @returns The result of fn
   * @throws SDKError if circuit is OPEN, or the original error if fn fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    switch (this.state) {
      case 'OPEN':
        return this.handleOpen(fn);

      case 'HALF_OPEN':
        return this.handleHalfOpen(fn);

      case 'CLOSED':
      default:
        return this.handleClosed(fn);
    }
  }

  /**
   * Get the current state of the circuit breaker.
   */
  getState(): CircuitBreakerState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN' && this.shouldAttemptReset()) {
      return 'HALF_OPEN';
    }
    return this.state;
  }

  /**
   * Get statistics about the circuit breaker.
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
    };
  }

  /**
   * Reset the circuit breaker to CLOSED state with zero counts.
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.totalRequests = 0;
    this.log.info('Circuit breaker reset to CLOSED');
  }

  /**
   * Handle execution in CLOSED state.
   * Execute fn; on failure, increment failure count and possibly trip to OPEN.
   */
  private async handleClosed<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      if (this.failureCount >= this.config.failureThreshold) {
        this.tripOpen();
      }
      throw err;
    }
  }

  /**
   * Handle execution in OPEN state.
   * If the reset timeout has elapsed, transition to HALF_OPEN and try.
   * Otherwise, throw immediately.
   */
  private async handleOpen<T>(fn: () => Promise<T>): Promise<T> {
    if (this.shouldAttemptReset()) {
      this.state = 'HALF_OPEN';
      this.halfOpenAttempts = 0;
      this.log.info('Circuit breaker transitioning to HALF_OPEN');
      return this.handleHalfOpen(fn);
    }

    this.log.debug('Circuit breaker is OPEN, rejecting call');
    throw new Error('Circuit breaker is OPEN - call rejected');
  }

  /**
   * Handle execution in HALF_OPEN state.
   * On success, go to CLOSED. On failure, go back to OPEN.
   */
  private async handleHalfOpen<T>(fn: () => Promise<T>): Promise<T> {
    this.halfOpenAttempts++;

    if (this.halfOpenAttempts > this.config.halfOpenMaxAttempts) {
      this.tripOpen();
      throw new Error('Circuit breaker HALF_OPEN max attempts exceeded');
    }

    try {
      const result = await fn();
      this.onSuccess();
      this.closeCircuit();
      return result;
    } catch (err) {
      this.onFailure();
      this.tripOpen();
      throw err;
    }
  }

  /**
   * Record a successful execution.
   */
  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = Date.now();
  }

  /**
   * Record a failed execution.
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
  }

  /**
   * Trip the circuit to OPEN state.
   */
  private tripOpen(): void {
    this.state = 'OPEN';
    this.log.warn('Circuit breaker tripped to OPEN', {
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
    });
  }

  /**
   * Close the circuit (return to normal operation).
   */
  private closeCircuit(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
    this.log.info('Circuit breaker returned to CLOSED');
  }

  /**
   * Check whether enough time has passed since the last failure
   * to attempt a reset (transition from OPEN to HALF_OPEN).
   */
  private shouldAttemptReset(): boolean {
    if (this.lastFailureTime === undefined) {
      return true;
    }
    return Date.now() - this.lastFailureTime >= this.config.resetTimeout;
  }
}
