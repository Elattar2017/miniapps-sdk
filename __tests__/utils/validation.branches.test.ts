/**
 * Validation Edge Case & Branch Coverage Tests
 *
 * Tests uncovered branches in src/utils/validation.ts:
 * - isValidEmail() edge cases
 * - isValidPhone() edge cases
 * - isExpressionSafe() assignment operators, banned patterns, max length
 */

import {
  isValidEmail,
  isValidPhone,
  isExpressionSafe,
  isValidModuleId,
  isValidVersion,
  isValidUrl,
  isNonEmpty,
} from '../../src/utils/validation';

// ---------------------------------------------------------------------------
// isValidEmail() edge cases
// ---------------------------------------------------------------------------

describe('isValidEmail – edge cases', () => {
  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects string without @ sign', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('rejects string with multiple @ signs', () => {
    expect(isValidEmail('user@@example.com')).toBe(false);
  });

  it('rejects string with no domain part after @', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects string with no TLD (no dot after @)', () => {
    expect(isValidEmail('user@example')).toBe(false);
  });

  it('rejects string with just spaces', () => {
    expect(isValidEmail('   ')).toBe(false);
  });

  it('rejects string with space in local part', () => {
    expect(isValidEmail('us er@example.com')).toBe(false);
  });

  it('accepts valid simple email', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('accepts email with plus tag', () => {
    expect(isValidEmail('user+tag@example.com')).toBe(true);
  });

  it('accepts email with subdomain', () => {
    expect(isValidEmail('user@mail.example.com')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidPhone() edge cases
// ---------------------------------------------------------------------------

describe('isValidPhone – edge cases', () => {
  it('rejects empty string', () => {
    expect(isValidPhone('')).toBe(false);
  });

  it('rejects number with too few digits (less than 7)', () => {
    expect(isValidPhone('12345')).toBe(false);
  });

  it('rejects string containing letters', () => {
    expect(isValidPhone('+1abc2345678')).toBe(false);
  });

  it('rejects string that is only spaces', () => {
    expect(isValidPhone('     ')).toBe(false);
  });

  it('rejects number exceeding max length (>20 chars)', () => {
    expect(isValidPhone('+1234567890123456789012345')).toBe(false);
  });

  it('accepts valid international number with + prefix', () => {
    expect(isValidPhone('+1234567890')).toBe(true);
  });

  it('accepts number with dashes and spaces', () => {
    expect(isValidPhone('+1 (234) 567-8901')).toBe(true);
  });

  it('accepts valid 7-digit number', () => {
    expect(isValidPhone('5551234')).toBe(true);
  });

  it('accepts number with parentheses', () => {
    expect(isValidPhone('(555) 123-4567')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isExpressionSafe() – assignment operators
// ---------------------------------------------------------------------------

describe('isExpressionSafe – assignment operators', () => {
  it('rejects simple assignment operator (=)', () => {
    const result = isExpressionSafe('x = 5');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('assignment operator');
  });

  it('rejects += operator (caught by = check)', () => {
    const result = isExpressionSafe('count += 1');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('assignment operator');
  });

  it('rejects -= operator (caught by = check)', () => {
    const result = isExpressionSafe('count -= 1');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('assignment operator');
  });

  it('rejects *= operator (caught by = check)', () => {
    const result = isExpressionSafe('val *= 2');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('assignment operator');
  });

  it('rejects /= operator (caught by = check)', () => {
    const result = isExpressionSafe('val /= 2');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('assignment operator');
  });

  it('rejects **= operator (caught by = check)', () => {
    const result = isExpressionSafe('val **= 3');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('assignment operator');
  });

  it('rejects ??= operator (caught by = check)', () => {
    const result = isExpressionSafe('val ??= "default"');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('assignment operator');
  });

  it('allows comparison operators (==, ===, !==, !=)', () => {
    expect(isExpressionSafe('x == 5').safe).toBe(true);
    expect(isExpressionSafe('x === 5').safe).toBe(true);
    expect(isExpressionSafe('x !== 5').safe).toBe(true);
    expect(isExpressionSafe('x != 5').safe).toBe(true);
  });

  it('allows >= and <= comparison operators', () => {
    expect(isExpressionSafe('x >= 5').safe).toBe(true);
    expect(isExpressionSafe('x <= 5').safe).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isExpressionSafe() – banned patterns
// ---------------------------------------------------------------------------

describe('isExpressionSafe – banned patterns', () => {
  it('rejects "constructor" access', () => {
    const result = isExpressionSafe('obj.constructor');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('constructor');
  });

  it('rejects "__proto__" access', () => {
    const result = isExpressionSafe('obj.__proto__');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('__proto__');
  });

  it('rejects "prototype" access', () => {
    const result = isExpressionSafe('Array.prototype.slice');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('prototype');
  });

  it('rejects "eval" usage', () => {
    const result = isExpressionSafe('eval("code")');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('eval');
  });

  it('rejects "Function" constructor', () => {
    const result = isExpressionSafe('new Function("return 1")');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Function');
  });

  it('rejects "import" keyword', () => {
    const result = isExpressionSafe('import("module")');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('import');
  });

  it('rejects "require" keyword', () => {
    const result = isExpressionSafe('require("fs")');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('require');
  });

  it('rejects "globalThis" access', () => {
    const result = isExpressionSafe('globalThis.secret');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('globalThis');
  });

  it('rejects "window" access', () => {
    const result = isExpressionSafe('window.location');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('window');
  });

  it('rejects "document" access', () => {
    const result = isExpressionSafe('document.cookie');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('document');
  });

  it('rejects "process" access', () => {
    const result = isExpressionSafe('process.env.SECRET');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('process');
  });
});

// ---------------------------------------------------------------------------
// isExpressionSafe() – max length
// ---------------------------------------------------------------------------

describe('isExpressionSafe – max length', () => {
  it('rejects expressions exceeding 500 chars', () => {
    const longExpr = 'a'.repeat(501);
    const result = isExpressionSafe(longExpr);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('max length');
  });

  it('accepts expression at exactly 500 chars', () => {
    const expr = 'a'.repeat(500);
    const result = isExpressionSafe(expr);
    expect(result.safe).toBe(true);
  });

  it('accepts safe expression within limits', () => {
    const result = isExpressionSafe('state.count + data.total * 2');
    expect(result.safe).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Additional validation functions for coverage
// ---------------------------------------------------------------------------

describe('isValidModuleId – edge cases', () => {
  it('rejects empty string', () => {
    expect(isValidModuleId('')).toBe(false);
  });

  it('rejects module ID starting with number', () => {
    expect(isValidModuleId('1com.vendor.app')).toBe(false);
  });

  it('rejects module ID with uppercase letters', () => {
    expect(isValidModuleId('com.Vendor.App')).toBe(false);
  });

  it('rejects module ID exceeding 128 chars', () => {
    const longId = 'a'.repeat(129);
    expect(isValidModuleId(longId)).toBe(false);
  });

  it('accepts valid reverse-domain module ID', () => {
    expect(isValidModuleId('com.vendor.budget')).toBe(true);
  });
});

describe('isValidVersion – edge cases', () => {
  it('rejects non-semver string', () => {
    expect(isValidVersion('1.0')).toBe(false);
  });

  it('accepts valid semver', () => {
    expect(isValidVersion('1.0.0')).toBe(true);
  });

  it('accepts semver with pre-release', () => {
    expect(isValidVersion('1.0.0-beta.1')).toBe(true);
  });
});

describe('isValidUrl – edge cases', () => {
  it('rejects string without protocol', () => {
    expect(isValidUrl('example.com')).toBe(false);
  });

  it('accepts https URL', () => {
    expect(isValidUrl('https://api.example.com')).toBe(true);
  });

  it('accepts http URL', () => {
    expect(isValidUrl('http://api.example.com')).toBe(true);
  });
});

describe('isNonEmpty – edge cases', () => {
  it('returns false for empty string', () => {
    expect(isNonEmpty('')).toBe(false);
  });

  it('returns false for whitespace-only string', () => {
    expect(isNonEmpty('   ')).toBe(false);
  });

  it('returns true for non-empty string', () => {
    expect(isNonEmpty('hello')).toBe(true);
  });
});
