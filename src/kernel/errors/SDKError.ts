/**
 * SDK Error - Custom error class for structured error handling
 * @module kernel/errors/SDKError
 *
 * Extends the native Error class with SDK-specific metadata:
 * - Error code (SDK-XXXX format)
 * - Error category (AUTH, MODULE, SCHEMA, etc.)
 * - Severity level (fatal, error, warning)
 * - Resolution guidance for developers
 * - Contextual data for debugging
 *
 * Provides static factory methods for convenient error creation.
 */

import { ERROR_CODES, getErrorByCode } from '../../constants/error-codes';
import { ErrorCategory } from '../../types';
import type {
  SDKErrorCode,
  ErrorSeverity,
  ErrorCodeEntry,
} from '../../types';

/** Options for constructing an SDKError */
export interface SDKErrorOptions {
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  resolution?: string;
  context?: Record<string, unknown>;
  cause?: Error;
}

export class SDKError extends Error {
  readonly code: SDKErrorCode;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly resolution: string;
  readonly context: Record<string, unknown>;
  readonly timestamp: number;
  readonly cause?: Error;

  constructor(code: SDKErrorCode, message: string, options?: SDKErrorOptions) {
    super(message);

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, SDKError.prototype);
    this.name = 'SDKError';

    this.code = code;
    this.timestamp = Date.now();
    this.context = options?.context ?? {};

    // Look up defaults from error code registry
    const entry: ErrorCodeEntry | undefined = getErrorByCode(code);

    this.category = options?.category ?? entry?.category ?? ErrorCategory.KERNEL;
    this.severity = options?.severity ?? entry?.severity ?? 'error';
    this.resolution = options?.resolution ?? entry?.resolution ?? 'Check SDK documentation';

    // Preserve the original cause if provided
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * Serialize the error for structured logging / telemetry.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      category: this.category,
      severity: this.severity,
      resolution: this.resolution,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  // -------------------------------------------------------------------
  // Static Factory Methods
  // -------------------------------------------------------------------

  /**
   * Create an authentication error (SDK-1000 range).
   */
  static auth(message: string, options?: SDKErrorOptions): SDKError {
    const entry = ERROR_CODES.AUTH_TOKEN_INVALID;
    return new SDKError(entry.code, message, {
      category: entry.category,
      severity: entry.severity,
      resolution: entry.resolution,
      ...options,
    });
  }

  /**
   * Create a module error (SDK-1100 range).
   */
  static module(message: string, options?: SDKErrorOptions): SDKError {
    const entry = ERROR_CODES.MODULE_LOAD_FAILED;
    return new SDKError(entry.code, message, {
      category: entry.category,
      severity: entry.severity,
      resolution: entry.resolution,
      ...options,
    });
  }

  /**
   * Create a schema error (SDK-1200 range).
   */
  static schema(message: string, options?: SDKErrorOptions): SDKError {
    const entry = ERROR_CODES.SCHEMA_PARSE_ERROR;
    return new SDKError(entry.code, message, {
      category: entry.category,
      severity: entry.severity,
      resolution: entry.resolution,
      ...options,
    });
  }

  /**
   * Create a policy error (SDK-1300 range).
   */
  static policy(message: string, options?: SDKErrorOptions): SDKError {
    const entry = ERROR_CODES.POLICY_ACCESS_DENIED;
    return new SDKError(entry.code, message, {
      category: entry.category,
      severity: entry.severity,
      resolution: entry.resolution,
      ...options,
    });
  }

  /**
   * Create a network error (SDK-1400 range).
   */
  static network(message: string, options?: SDKErrorOptions): SDKError {
    const entry = ERROR_CODES.NETWORK_REQUEST_FAILED;
    return new SDKError(entry.code, message, {
      category: entry.category,
      severity: entry.severity,
      resolution: entry.resolution,
      ...options,
    });
  }

  /**
   * Create an expression error (SDK-1600 range).
   */
  static expression(message: string, options?: SDKErrorOptions): SDKError {
    const entry = ERROR_CODES.EXPRESSION_PARSE_ERROR;
    return new SDKError(entry.code, message, {
      category: entry.category,
      severity: entry.severity,
      resolution: entry.resolution,
      ...options,
    });
  }

  /**
   * Create a kernel error (SDK-1800 range).
   */
  static kernel(message: string, options?: SDKErrorOptions): SDKError {
    const entry = ERROR_CODES.KERNEL_BOOT_FAILED;
    return new SDKError(entry.code, message, {
      category: entry.category,
      severity: entry.severity,
      resolution: entry.resolution,
      ...options,
    });
  }
}
