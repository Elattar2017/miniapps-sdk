/**
 * Kernel Configuration - Validates and normalizes kernel config
 * @module kernel/KernelConfig
 *
 * Provides functions to validate that KernelConfig has all required fields
 * and to normalize config values (merge default design tokens, strip trailing
 * slashes from URLs, etc.) before the Runtime Kernel boots.
 */

import type { KernelConfig, DesignTokens } from '../types';
import { DEFAULT_DESIGN_TOKENS } from '../constants/defaults';
import { isValidUrl, isNonEmpty } from '../utils/validation';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'KernelConfig' });

/**
 * Validation result returned by `validateKernelConfig`.
 * When `valid` is false the `errors` array describes each problem found.
 */
export interface KernelConfigValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a KernelConfig for completeness and correctness.
 *
 * Checks performed:
 *  - `authToken` is a non-empty string
 *  - `tenantId` is a non-empty string
 *  - `userId` is a non-empty string
 *  - `apiBaseUrl` is a valid HTTP(S) URL
 *  - `zones` contains at least one zone entry
 */
export function validateKernelConfig(config: KernelConfig): KernelConfigValidation {
  const errors: string[] = [];

  if (!config.authToken || !isNonEmpty(config.authToken)) {
    errors.push('authToken is required and must be a non-empty string');
  }

  if (!config.tenantId || !isNonEmpty(config.tenantId)) {
    errors.push('tenantId is required and must be a non-empty string');
  }

  if (!config.userId || !isNonEmpty(config.userId)) {
    errors.push('userId is required and must be a non-empty string');
  }

  if (!config.apiBaseUrl || !isValidUrl(config.apiBaseUrl)) {
    errors.push('apiBaseUrl is required and must be a valid HTTP(S) URL');
  }

  if (!config.zones || typeof config.zones !== 'object' || Object.keys(config.zones).length === 0) {
    errors.push('zones must contain at least one zone configuration');
  }

  if (errors.length > 0) {
    log.warn('Kernel configuration validation failed', { errors });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Deep-merge two DesignTokens objects, preferring values from `overrides`
 * whenever they are defined.
 */
function mergeDesignTokens(defaults: DesignTokens, overrides: Partial<DesignTokens>): DesignTokens {
  return {
    colors: { ...defaults.colors, ...overrides.colors },
    typography: { ...defaults.typography, ...overrides.typography },
    spacing: { ...defaults.spacing, ...overrides.spacing },
    borderRadius: { ...defaults.borderRadius, ...overrides.borderRadius },
  };
}

/**
 * Normalize a KernelConfig by applying defaults and cleaning values.
 *
 * Operations:
 *  - Merge DEFAULT_DESIGN_TOKENS with any provided designTokens
 *  - Strip trailing slashes from apiBaseUrl
 *  - Set debug to false if not explicitly provided
 */
export function normalizeKernelConfig(config: KernelConfig): KernelConfig {
  const designTokens = config.designTokens
    ? mergeDesignTokens(DEFAULT_DESIGN_TOKENS, config.designTokens)
    : { ...DEFAULT_DESIGN_TOKENS };

  const apiBaseUrl = config.apiBaseUrl.replace(/\/+$/, '');

  const normalized: KernelConfig = {
    ...config,
    apiBaseUrl,
    designTokens,
    debug: config.debug ?? false,
  };

  log.debug('Kernel configuration normalized', {
    tenantId: normalized.tenantId,
    zoneCount: Object.keys(normalized.zones).length,
    debug: normalized.debug,
  });

  return normalized;
}
