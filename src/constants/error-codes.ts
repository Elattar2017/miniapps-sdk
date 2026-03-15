/**
 * Error Code Registry - All SDK error codes with messages and resolution
 * @module constants/error-codes
 */

import { ErrorCategory, type SDKErrorCode, type ErrorCodeEntry, type ErrorSeverity } from '../types';

function entry(
  code: number,
  message: string,
  resolution: string,
  severity: ErrorSeverity,
  category: ErrorCategory,
): ErrorCodeEntry {
  return { code: `SDK-${code}` as SDKErrorCode, message, resolution, severity, category };
}

export const ERROR_CODES: Record<string, ErrorCodeEntry> = {
  // AUTH (1000-1099)
  AUTH_TOKEN_MISSING: entry(1000, 'Authentication token is missing', 'Provide authToken in SDKProvider props', 'fatal', ErrorCategory.AUTH),
  AUTH_TOKEN_EXPIRED: entry(1001, 'Authentication token has expired', 'Implement onTokenRefresh callback', 'error', ErrorCategory.AUTH),
  AUTH_TOKEN_INVALID: entry(1002, 'Authentication token is invalid', 'Check JWT format and claims', 'fatal', ErrorCategory.AUTH),
  AUTH_TOKEN_REFRESH_FAILED: entry(1003, 'Token refresh failed', 'Check network connectivity and auth server', 'error', ErrorCategory.AUTH),
  AUTH_CLAIMS_MISSING: entry(1004, 'Required JWT claims are missing', 'Ensure JWT contains sub, iss, aud, tenantId', 'fatal', ErrorCategory.AUTH),

  // MODULE (1100-1199)
  MODULE_NOT_FOUND: entry(1100, 'Module not found', 'Check module ID and availability', 'error', ErrorCategory.MODULE),
  MODULE_LOAD_FAILED: entry(1101, 'Module failed to load', 'Check network and module server', 'error', ErrorCategory.MODULE),
  MODULE_SIGNATURE_INVALID: entry(1102, 'Module signature verification failed', 'Module may be tampered with - contact developer', 'fatal', ErrorCategory.MODULE),
  MODULE_VERSION_INCOMPATIBLE: entry(1103, 'Module requires newer SDK version', 'Update SDK to meet minSDKVersion', 'error', ErrorCategory.MODULE),
  MODULE_MEMORY_EXCEEDED: entry(1104, 'Module exceeded memory budget', 'Reduce module data or optimize schema', 'warning', ErrorCategory.MODULE),
  MODULE_ALREADY_LOADED: entry(1105, 'Module is already loaded', 'Module was loaded previously', 'warning', ErrorCategory.MODULE),

  // SCHEMA (1200-1299)
  SCHEMA_PARSE_ERROR: entry(1200, 'Failed to parse screen schema', 'Check JSON syntax in screen file', 'error', ErrorCategory.SCHEMA),
  SCHEMA_INVALID_COMPONENT: entry(1201, 'Unknown component type in schema', 'Use only registered component types', 'error', ErrorCategory.SCHEMA),
  SCHEMA_INVALID_PROP: entry(1202, 'Invalid property on schema component', 'Check component spec for allowed props', 'warning', ErrorCategory.SCHEMA),
  SCHEMA_MISSING_REQUIRED: entry(1203, 'Required schema field is missing', 'Add required fields to schema node', 'error', ErrorCategory.SCHEMA),
  SCHEMA_RENDER_ERROR: entry(1204, 'Schema rendering failed', 'Check component tree structure', 'error', ErrorCategory.SCHEMA),

  // POLICY (1300-1399)
  POLICY_ACCESS_DENIED: entry(1300, 'Access denied by policy engine', 'User lacks required permissions', 'error', ErrorCategory.POLICY),
  POLICY_UNAUTHORIZED_STATE: entry(1301, 'Unauthorized state access attempt', 'Module attempted cross-tenant state access', 'fatal', ErrorCategory.POLICY),
  POLICY_LOAD_FAILED: entry(1302, 'Failed to load policies', 'Check policy server connectivity', 'error', ErrorCategory.POLICY),

  // NETWORK (1400-1499)
  NETWORK_REQUEST_FAILED: entry(1400, 'Network request failed', 'Check network connectivity', 'error', ErrorCategory.NETWORK),
  NETWORK_TIMEOUT: entry(1401, 'Network request timed out', 'Server may be slow - retry later', 'error', ErrorCategory.NETWORK),
  NETWORK_INVALID_RESPONSE: entry(1402, 'Invalid response from server', 'Check API server health', 'error', ErrorCategory.NETWORK),

  // STORAGE (1500-1599)
  STORAGE_READ_FAILED: entry(1500, 'Failed to read from storage', 'Check storage permissions', 'error', ErrorCategory.STORAGE),
  STORAGE_WRITE_FAILED: entry(1501, 'Failed to write to storage', 'Check available storage space', 'error', ErrorCategory.STORAGE),
  STORAGE_QUOTA_EXCEEDED: entry(1502, 'Storage quota exceeded', 'Clear old data or increase quota', 'warning', ErrorCategory.STORAGE),

  // EXPRESSION (1600-1699)
  EXPRESSION_PARSE_ERROR: entry(1600, 'Expression parse error', 'Check expression syntax', 'error', ErrorCategory.EXPRESSION),
  EXPRESSION_EVAL_TIMEOUT: entry(1601, 'Expression evaluation timed out (>5ms)', 'Simplify expression', 'error', ErrorCategory.EXPRESSION),
  EXPRESSION_MAX_DEPTH: entry(1602, 'Expression exceeds max AST depth (10)', 'Reduce nesting in expression', 'error', ErrorCategory.EXPRESSION),
  EXPRESSION_MAX_LENGTH: entry(1603, 'Expression exceeds max length (500 chars)', 'Shorten expression', 'error', ErrorCategory.EXPRESSION),
  EXPRESSION_UNSAFE: entry(1604, 'Expression contains unsafe operations', 'Remove assignment or function calls', 'fatal', ErrorCategory.EXPRESSION),

  // NAVIGATION (1700-1799)
  NAVIGATION_SCREEN_NOT_FOUND: entry(1700, 'Navigation target screen not found', 'Check screen ID in module manifest', 'error', ErrorCategory.NAVIGATION),
  NAVIGATION_MODULE_NOT_ACTIVE: entry(1701, 'Cannot navigate - module not active', 'Load module before navigating', 'error', ErrorCategory.NAVIGATION),

  // KERNEL (1800-1899)
  KERNEL_BOOT_FAILED: entry(1800, 'Kernel boot failed', 'Check configuration and dependencies', 'fatal', ErrorCategory.KERNEL),
  KERNEL_INVALID_STATE: entry(1801, 'Invalid kernel state transition', 'Internal SDK error - report bug', 'fatal', ErrorCategory.KERNEL),
  KERNEL_CONFIG_INVALID: entry(1802, 'Invalid kernel configuration', 'Check SDKProvider props', 'fatal', ErrorCategory.KERNEL),
  KERNEL_BOOT_TIMEOUT: entry(1803, 'Kernel boot exceeded 500ms budget', 'Optimize initialization or check network', 'warning', ErrorCategory.KERNEL),

  // VALIDATION (1900-1999)
  VALIDATION_REQUIRED: entry(1900, 'Required field is empty', 'Fill in the required field', 'error', ErrorCategory.VALIDATION),
  VALIDATION_MIN: entry(1901, 'Value is below minimum', 'Enter a larger value', 'error', ErrorCategory.VALIDATION),
  VALIDATION_MAX: entry(1902, 'Value exceeds maximum', 'Enter a smaller value', 'error', ErrorCategory.VALIDATION),
  VALIDATION_PATTERN: entry(1903, 'Value does not match pattern', 'Enter value in correct format', 'error', ErrorCategory.VALIDATION),
  VALIDATION_CUSTOM: entry(1904, 'Custom validation failed', 'Check the field requirements', 'error', ErrorCategory.VALIDATION),

  // DATA BUS (2000-2099)
  DATA_BUS_CHANNEL_DENIED: entry(2000, 'Data bus channel access denied', 'Module not authorized for this channel', 'error', ErrorCategory.DATA_BUS),
  DATA_BUS_RATE_LIMIT: entry(2001, 'Data bus rate limit exceeded', 'Reduce message frequency', 'warning', ErrorCategory.DATA_BUS),
};

/** Get error code entry by code string */
export function getErrorByCode(code: SDKErrorCode): ErrorCodeEntry | undefined {
  return Object.values(ERROR_CODES).find((e) => e.code === code);
}

/** Get all error codes for a category */
export function getErrorsByCategory(category: ErrorCategory): ErrorCodeEntry[] {
  return Object.values(ERROR_CODES).filter((e) => e.category === category);
}
