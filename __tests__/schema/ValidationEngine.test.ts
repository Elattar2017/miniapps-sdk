/**
 * ValidationEngine Test Suite
 * Tests declarative form field validation: required, min/max, length,
 * email, phone, pattern, numeric, and custom error messages.
 */

import { ValidationEngine } from '../../src/schema/ValidationEngine';
import type { ValidationRule } from '../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ValidationEngine', () => {
  let engine: ValidationEngine;

  beforeEach(() => {
    engine = new ValidationEngine();
  });

  describe('required', () => {
    const rules: ValidationRule[] = [{ rule: 'required' }];

    it('should fail for undefined', () => {
      const result = engine.validate(undefined, rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('required');
    });

    it('should fail for null', () => {
      const result = engine.validate(null, rules);
      expect(result.valid).toBe(false);
    });

    it('should fail for empty string', () => {
      const result = engine.validate('', rules);
      expect(result.valid).toBe(false);
    });

    it('should fail for whitespace-only string', () => {
      const result = engine.validate('   ', rules);
      expect(result.valid).toBe(false);
    });

    it('should pass for non-empty value', () => {
      const result = engine.validate('hello', rules);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass for zero', () => {
      const result = engine.validate(0, rules);
      expect(result.valid).toBe(true);
    });
  });

  describe('min', () => {
    const rules: ValidationRule[] = [{ rule: 'min', value: 5 }];

    it('should fail when value is below min', () => {
      const result = engine.validate(3, rules);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at least 5');
    });

    it('should pass when value equals min', () => {
      const result = engine.validate(5, rules);
      expect(result.valid).toBe(true);
    });

    it('should pass when value exceeds min', () => {
      const result = engine.validate(10, rules);
      expect(result.valid).toBe(true);
    });
  });

  describe('max', () => {
    const rules: ValidationRule[] = [{ rule: 'max', value: 100 }];

    it('should fail when value exceeds max', () => {
      const result = engine.validate(150, rules);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at most 100');
    });

    it('should pass when value equals max', () => {
      const result = engine.validate(100, rules);
      expect(result.valid).toBe(true);
    });

    it('should pass when value is below max', () => {
      const result = engine.validate(50, rules);
      expect(result.valid).toBe(true);
    });
  });

  describe('minLength', () => {
    const rules: ValidationRule[] = [{ rule: 'minLength', value: 3 }];

    it('should fail when string is too short', () => {
      const result = engine.validate('ab', rules);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at least 3 characters');
    });

    it('should pass when string meets minimum length', () => {
      const result = engine.validate('abc', rules);
      expect(result.valid).toBe(true);
    });

    it('should pass when string exceeds minimum length', () => {
      const result = engine.validate('abcdef', rules);
      expect(result.valid).toBe(true);
    });
  });

  describe('maxLength', () => {
    const rules: ValidationRule[] = [{ rule: 'maxLength', value: 5 }];

    it('should fail when string is too long', () => {
      const result = engine.validate('abcdef', rules);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at most 5 characters');
    });

    it('should pass when string meets maximum length', () => {
      const result = engine.validate('abcde', rules);
      expect(result.valid).toBe(true);
    });

    it('should pass when string is under maximum length', () => {
      const result = engine.validate('abc', rules);
      expect(result.valid).toBe(true);
    });
  });

  describe('email', () => {
    const rules: ValidationRule[] = [{ rule: 'email' }];

    it('should validate valid email', () => {
      const result = engine.validate('user@example.com', rules);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid email (no @)', () => {
      const result = engine.validate('userexample.com', rules);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('email');
    });

    it('should reject invalid email (no domain)', () => {
      const result = engine.validate('user@', rules);
      expect(result.valid).toBe(false);
    });

    it('should pass for empty value (use required rule separately)', () => {
      const result = engine.validate('', rules);
      expect(result.valid).toBe(true);
    });
  });

  describe('phone', () => {
    const rules: ValidationRule[] = [{ rule: 'phone' }];

    it('should validate valid phone numbers', () => {
      expect(engine.validate('+1234567890', rules).valid).toBe(true);
      expect(engine.validate('(555) 123-4567', rules).valid).toBe(true);
      expect(engine.validate('+44 20 7946 0958', rules).valid).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      const result = engine.validate('abc', rules);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('phone');
    });

    it('should reject too short phone numbers', () => {
      const result = engine.validate('123', rules);
      expect(result.valid).toBe(false);
    });

    it('should pass for empty value (use required rule separately)', () => {
      const result = engine.validate('', rules);
      expect(result.valid).toBe(true);
    });
  });

  describe('pattern', () => {
    const rules: ValidationRule[] = [
      { rule: 'pattern', value: '^[A-Z]{3}$' },
    ];

    it('should validate matching pattern', () => {
      const result = engine.validate('ABC', rules);
      expect(result.valid).toBe(true);
    });

    it('should reject non-matching pattern', () => {
      const result = engine.validate('abc', rules);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('format');
    });

    it('should reject pattern with wrong length', () => {
      const result = engine.validate('ABCD', rules);
      expect(result.valid).toBe(false);
    });
  });

  describe('numeric', () => {
    const rules: ValidationRule[] = [{ rule: 'numeric' }];

    it('should validate numeric strings', () => {
      expect(engine.validate('42', rules).valid).toBe(true);
      expect(engine.validate('3.14', rules).valid).toBe(true);
      expect(engine.validate('-10', rules).valid).toBe(true);
    });

    it('should reject non-numeric strings', () => {
      const result = engine.validate('abc', rules);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('number');
    });

    it('should pass for empty value (use required rule separately)', () => {
      const result = engine.validate('', rules);
      expect(result.valid).toBe(true);
    });
  });

  describe('custom error messages', () => {
    it('should return custom error message for required', () => {
      const rules: ValidationRule[] = [
        { rule: 'required', message: 'Please fill in your name' },
      ];
      const result = engine.validate('', rules);
      expect(result.errors[0]).toBe('Please fill in your name');
    });

    it('should return custom error message for min', () => {
      const rules: ValidationRule[] = [
        { rule: 'min', value: 18, message: 'You must be at least 18 years old' },
      ];
      const result = engine.validate(16, rules);
      expect(result.errors[0]).toBe('You must be at least 18 years old');
    });

    it('should return custom error message for email', () => {
      const rules: ValidationRule[] = [
        { rule: 'email', message: 'That does not look like an email' },
      ];
      const result = engine.validate('not-an-email', rules);
      expect(result.errors[0]).toBe('That does not look like an email');
    });

    it('should return custom error message for pattern', () => {
      const rules: ValidationRule[] = [
        { rule: 'pattern', value: '^[A-Z]+$', message: 'Only uppercase letters allowed' },
      ];
      const result = engine.validate('abc', rules);
      expect(result.errors[0]).toBe('Only uppercase letters allowed');
    });
  });

  describe('multiple rules', () => {
    it('should collect errors from all failing rules', () => {
      const rules: ValidationRule[] = [
        { rule: 'required' },
        { rule: 'minLength', value: 5 },
      ];
      const result = engine.validate('', rules);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });

    it('should pass when all rules pass', () => {
      const rules: ValidationRule[] = [
        { rule: 'required' },
        { rule: 'minLength', value: 3 },
        { rule: 'maxLength', value: 10 },
      ];
      const result = engine.validate('hello', rules);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
