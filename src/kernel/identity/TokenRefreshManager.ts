/**
 * Token Refresh Manager - Monitors JWT expiry and refreshes proactively
 * @module kernel/identity/TokenRefreshManager
 *
 * Refreshes the JWT token at 80% of its TTL to ensure continuous authentication.
 * Uses exponential backoff on failure and integrates with the CircuitBreaker
 * for resilience against sustained auth server outages.
 */

import { logger } from '../../utils/logger';
import { TOKEN_REFRESH } from '../../constants/defaults';
import { CircuitBreaker } from '../errors/CircuitBreaker';
import { JWTValidator } from './JWTValidator';
import type { CircuitBreakerConfig } from '../../types';

/** Callback that the host app provides to fetch a new token */
export type TokenRefreshCallback = () => Promise<string>;

/** Default circuit breaker config for token refresh */
const REFRESH_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  resetTimeout: 30_000,
  halfOpenMaxAttempts: 1,
};

export class TokenRefreshManager {
  private readonly log = logger.child({ component: 'TokenRefreshManager' });
  private readonly jwtValidator: JWTValidator;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly onTokenRefresh: TokenRefreshCallback;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private isMonitoring = false;

  constructor(onTokenRefresh: TokenRefreshCallback) {
    this.onTokenRefresh = onTokenRefresh;
    this.jwtValidator = new JWTValidator();
    this.circuitBreaker = new CircuitBreaker(REFRESH_CIRCUIT_BREAKER_CONFIG);
  }

  /**
   * Start monitoring a JWT token for expiry.
   * Sets up a timer to refresh at 80% of the token's remaining TTL.
   * If the token is already expired or near-expiry, refreshes immediately.
   */
  startMonitoring(token: string): void {
    this.stopMonitoring();
    this.isMonitoring = true;

    const ttlMs = this.jwtValidator.getTimeToExpiry(token);

    if (ttlMs <= 0) {
      this.log.warn('Token is already expired, refreshing immediately');
      void this.scheduleRefresh(0);
      return;
    }

    const refreshAt = Math.floor(ttlMs * TOKEN_REFRESH.REFRESH_AT_PERCENTAGE);
    this.log.info('Token monitoring started', {
      ttlMs,
      refreshInMs: refreshAt,
    });

    void this.scheduleRefresh(refreshAt);
  }

  /**
   * Stop monitoring the current token.
   * Clears any pending refresh timers.
   */
  stopMonitoring(): void {
    this.isMonitoring = false;
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.log.debug('Token monitoring stopped');
  }

  /**
   * Refresh the token immediately with exponential backoff on failure.
   * Retries with delays: 1s, 2s, 4s, 8s, ... up to max 30s.
   * Uses the circuit breaker to prevent hammering a down auth server.
   *
   * @returns The new token string
   * @throws If all retries are exhausted or the circuit breaker is open
   */
  async refreshNow(): Promise<string> {
    let delay: number = TOKEN_REFRESH.MIN_RETRY_DELAY;
    let lastError: Error | undefined;
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const newToken = await this.circuitBreaker.execute(this.onTokenRefresh);
        this.log.info('Token refreshed successfully', { attempt });

        // If still monitoring, set up the next refresh cycle
        if (this.isMonitoring) {
          this.startMonitoring(newToken);
        }

        return newToken;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.log.warn(`Token refresh attempt ${attempt + 1} failed`, {
          error: lastError.message,
          nextRetryMs: delay,
        });

        if (attempt < maxAttempts - 1) {
          await this.sleep(delay);
          delay = Math.min(
            delay * TOKEN_REFRESH.BACKOFF_MULTIPLIER,
            TOKEN_REFRESH.MAX_RETRY_DELAY,
          );
        }
      }
    }

    this.log.error('Token refresh exhausted all retries', {
      attempts: maxAttempts,
    });

    throw lastError ?? new Error('Token refresh failed after all retries');
  }

  /**
   * Schedule a refresh after the given delay in milliseconds.
   */
  private async scheduleRefresh(delayMs: number): Promise<void> {
    if (!this.isMonitoring) return;

    return new Promise<void>((resolve) => {
      this.refreshTimer = setTimeout(() => {
        if (!this.isMonitoring) {
          resolve();
          return;
        }
        this.refreshNow()
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            this.log.error('Scheduled token refresh failed', { error: message });
          })
          .finally(() => {
            resolve();
          });
      }, delayMs);
    });
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
