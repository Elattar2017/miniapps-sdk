/**
 * Default Configuration Values
 * @module constants/defaults
 */

import type { CacheConfig, CircuitBreakerConfig, DesignTokens } from '../types';

/** Default cache tier sizes (in bytes) */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  memory: { maxSize: 20 * 1024 * 1024 },     // 20MB
  manifest: { maxSize: 50 * 1024 * 1024 },    // 50MB
  schema: { maxSize: 100 * 1024 * 1024 },     // 100MB
  data: { maxSize: 200 * 1024 * 1024, ttl: 300 }, // 200MB, 5min TTL
  asset: { maxSize: 100 * 1024 * 1024 },      // 100MB
};

/** Default circuit breaker configuration */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 60_000,     // 60 seconds
  halfOpenMaxAttempts: 3,
  monitorInterval: 30_000,  // 30 seconds
};

/** Default design tokens */
export const DEFAULT_DESIGN_TOKENS: DesignTokens = {
  colors: {
    primary: '#0066CC',
    secondary: '#6B7280',
    background: '#FFFFFF',
    surface: '#F9FAFB',
    text: '#111827',
    textSecondary: '#6B7280',
    error: '#DC2626',
    success: '#16A34A',
    warning: '#D97706',
    border: '#E5E7EB',
  },
  typography: {
    fontFamily: 'System',
    baseFontSize: 14,
    scale: {
      h1: 32,
      h2: 24,
      h3: 20,
      h4: 16,
      body: 14,
      caption: 12,
    },
  },
  spacing: {
    unit: 4,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    default: 8,
    sm: 4,
    lg: 12,
    full: 9999,
  },
  shadows: {
    sm: { offsetX: 0, offsetY: 1, blurRadius: 2, color: 'rgba(0,0,0,0.1)' },
    md: { offsetX: 0, offsetY: 2, blurRadius: 4, color: 'rgba(0,0,0,0.15)' },
    lg: { offsetX: 0, offsetY: 4, blurRadius: 8, color: 'rgba(0,0,0,0.2)' },
  },
};

/** Default network timeouts (ms) */
export const DEFAULT_TIMEOUTS = {
  API_REQUEST: 10_000,       // 10 seconds
  MODULE_FETCH: 15_000,      // 15 seconds
  TOKEN_REFRESH: 5_000,      // 5 seconds
  BOOT_TIMEOUT: 500,         // 500ms (performance budget)
} as const;

/** Token refresh settings */
export const TOKEN_REFRESH = {
  REFRESH_AT_PERCENTAGE: 0.8,  // Refresh at 80% of TTL
  MIN_RETRY_DELAY: 1_000,     // 1 second
  MAX_RETRY_DELAY: 30_000,    // 30 seconds
  BACKOFF_MULTIPLIER: 2,
} as const;

/** Expression engine limits */
export const EXPRESSION_LIMITS = {
  MAX_LENGTH: 500,
  MAX_AST_DEPTH: 10,
  MAX_EVAL_TIME_MS: 5,
} as const;

/** Data bus limits */
export const DATA_BUS_LIMITS = {
  MAX_MESSAGES_PER_SECOND: 100,
  DEAD_LETTER_QUEUE_SIZE: 1000,
} as const;

/** Dev server defaults */
export const DEV_SERVER = {
  PORT: 3000,
  HOST: '0.0.0.0',
} as const;
