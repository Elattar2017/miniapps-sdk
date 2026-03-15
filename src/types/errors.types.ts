/**
 * Error Types - Error codes, circuit breaker, recovery strategies
 * @module types/errors
 */

/** SDK error code format: SDK-XXXX */
export type SDKErrorCode = `SDK-${number}`;

/** Error category ranges */
export enum ErrorCategory {
  AUTH = 1000,
  MODULE = 1100,
  SCHEMA = 1200,
  POLICY = 1300,
  NETWORK = 1400,
  STORAGE = 1500,
  EXPRESSION = 1600,
  NAVIGATION = 1700,
  KERNEL = 1800,
  VALIDATION = 1900,
  DATA_BUS = 2000,
}

/** Error severity levels */
export type ErrorSeverity = 'fatal' | 'error' | 'warning';

/** Error code entry */
export interface ErrorCodeEntry {
  code: SDKErrorCode;
  message: string;
  resolution: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
}

/** Circuit breaker states */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenMaxAttempts: number;
  monitorInterval?: number;
}

/** Circuit breaker statistics */
export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  totalRequests: number;
}

/** Error recovery strategy */
export type RecoveryStrategy = 'retry' | 'fallback' | 'degrade' | 'abort';

/** Error recovery configuration */
export interface RecoveryConfig {
  strategy: RecoveryStrategy;
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  fallbackValue?: unknown;
}
