/**
 * Input Validation Helpers
 * @module utils/validation
 */

const MODULE_ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;
const URL_PATTERN = /^https?:\/\/.+/;

// Banned patterns in expressions (security)
const EXPRESSION_BANNED_PATTERNS = [
  /\beval\b/,
  /\bFunction\b/,
  /\bconstructor\b/,
  /\b__proto__\b/,
  /\bprototype\b/,
  /\bimport\b/,
  /\brequire\b/,
  /\bglobalThis\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bprocess\b/,
];

// Assignment operators banned in expressions
const ASSIGNMENT_OPERATORS = ['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '^=', '|=', '??=', '&&=', '||='];

/** Validate module ID (reverse domain notation) */
export function isValidModuleId(id: string): boolean {
  return MODULE_ID_PATTERN.test(id) && id.length <= 128;
}

/** Validate semantic version string */
export function isValidVersion(version: string): boolean {
  return SEMVER_PATTERN.test(version);
}

/** Validate URL */
export function isValidUrl(url: string): boolean {
  return URL_PATTERN.test(url);
}

/** Validate expression for safety (basic check, full validation in ExpressionEngine) */
export function isExpressionSafe(expression: string): { safe: boolean; reason?: string } {
  if (expression.length > 500) {
    return { safe: false, reason: 'Expression exceeds max length (500 chars)' };
  }

  for (const pattern of EXPRESSION_BANNED_PATTERNS) {
    if (pattern.test(expression)) {
      return { safe: false, reason: `Expression contains banned pattern: ${pattern.source}` };
    }
  }

  for (const op of ASSIGNMENT_OPERATORS) {
    // Check for assignment operators but not comparison operators (==, !=, ===, !==)
    // Only match if not preceded by =, !, <, > (which form comparison operators)
    if (op === '=' && /(?<![=!<>])=(?!=)/.test(expression)) {
      return { safe: false, reason: 'Expression contains assignment operator' };
    } else if (op !== '=' && expression.includes(op)) {
      return { safe: false, reason: `Expression contains assignment operator: ${op}` };
    }
  }

  return { safe: true };
}

/** Validate email format */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Validate phone number (basic international format) */
export function isValidPhone(phone: string): boolean {
  return /^\+?[\d\s-()]{7,20}$/.test(phone);
}

/** Validate that a string is non-empty after trimming */
export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}
