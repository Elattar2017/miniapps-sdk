/**
 * Error Recovery - Strategy-based error recovery
 * @module kernel/errors/ErrorRecovery
 *
 * Provides a unified recovery mechanism with four strategies:
 * - 'retry': Retry the operation with exponential backoff
 * - 'fallback': Return a fallback value on error
 * - 'degrade': Log a warning and return undefined (graceful degradation)
 * - 'abort': Re-throw the error (let it propagate)
 */

import { logger } from '../../utils/logger';
import type { RecoveryConfig } from '../../types';

/** Default recovery configuration values */
const DEFAULTS = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1_000,
  BACKOFF_MULTIPLIER: 2,
} as const;

export class ErrorRecovery {
  private readonly log = logger.child({ component: 'ErrorRecovery' });

  /**
   * Execute a function with error recovery based on the provided configuration.
   *
   * @param fn The async function to execute
   * @param config Recovery configuration specifying the strategy and parameters
   * @returns The result of fn, or the fallback/degraded value on failure
   * @throws If strategy is 'abort', or if 'retry' exhausts all attempts
   */
  async recover<T>(fn: () => Promise<T>, config: RecoveryConfig): Promise<T> {
    switch (config.strategy) {
      case 'retry':
        return this.retryWithBackoff(
          fn,
          config.maxRetries ?? DEFAULTS.MAX_RETRIES,
          config.retryDelay ?? DEFAULTS.RETRY_DELAY_MS,
          config.backoffMultiplier ?? DEFAULTS.BACKOFF_MULTIPLIER,
        );

      case 'fallback':
        return this.withFallback(fn, config.fallbackValue as T);

      case 'degrade':
        return this.withDegradation(fn);

      case 'abort':
        return this.withAbort(fn);

      default:
        this.log.warn(`Unknown recovery strategy: ${String(config.strategy)}, aborting`);
        return fn();
    }
  }

  /**
   * Retry the function with exponential backoff.
   *
   * @param fn The async function to retry
   * @param maxRetries Maximum number of retry attempts
   * @param delay Initial delay between retries in milliseconds
   * @param multiplier Factor to multiply the delay by after each retry
   * @returns The result of fn on success
   * @throws The last error if all retries are exhausted
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    delay: number,
    multiplier: number,
  ): Promise<T> {
    let lastError: Error | undefined;
    let currentDelay = delay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < maxRetries) {
          this.log.warn(`Retry attempt ${attempt + 1}/${maxRetries} failed, retrying in ${currentDelay}ms`, {
            error: lastError.message,
            attempt: attempt + 1,
            nextDelayMs: currentDelay,
          });

          await this.sleep(currentDelay);
          currentDelay = Math.floor(currentDelay * multiplier);
        }
      }
    }

    this.log.error('All retry attempts exhausted', {
      maxRetries,
      error: lastError?.message,
    });

    throw lastError ?? new Error('All retry attempts exhausted');
  }

  /**
   * Execute fn and return fallbackValue if it fails.
   */
  private async withFallback<T>(fn: () => Promise<T>, fallbackValue: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn('Operation failed, using fallback value', {
        error: message,
      });
      return fallbackValue;
    }
  }

  /**
   * Execute fn and return undefined if it fails (graceful degradation).
   */
  private async withDegradation<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn('Operation failed, degrading gracefully', {
        error: message,
      });
      return undefined as T;
    }
  }

  /**
   * Execute fn and re-throw any error (abort strategy).
   */
  private async withAbort<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.log.error('Operation failed, aborting', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Helper to sleep for a given duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
