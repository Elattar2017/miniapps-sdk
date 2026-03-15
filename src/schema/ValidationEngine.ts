/**
 * Validation Engine - Declarative validation for form fields
 * @module schema/ValidationEngine
 *
 * Evaluates an ordered array of ValidationRule objects against a value.
 * Each rule type has a built-in default error message that can be overridden
 * by the module author via `rule.message`.
 */

import { logger } from '../utils/logger';
import { isValidEmail, isValidPhone } from '../utils/validation';
import type { ValidationRule } from '../types';

const validationLogger = logger.child({ component: 'ValidationEngine' });

/** Result of a validation pass */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class ValidationEngine {
  /**
   * Validate a value against an ordered list of validation rules.
   * All rules are evaluated; the result contains every failing rule's message.
   *
   * @param value - The form field value to validate
   * @param rules - Ordered array of validation rules
   * @returns Validation result with boolean flag and error messages
   */
  validate(value: unknown, rules: ValidationRule[]): ValidationResult {
    const errors: string[] = [];

    for (const rule of rules) {
      const error = this.evaluateRule(value, rule);
      if (error !== null) {
        errors.push(error);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Evaluate a single rule.
   * Returns the error message string if the rule fails, or null if it passes.
   */
  private evaluateRule(value: unknown, rule: ValidationRule): string | null {
    switch (rule.rule) {
      case 'required':
        return this.validateRequired(value, rule);

      case 'min':
        return this.validateMin(value, rule);

      case 'max':
        return this.validateMax(value, rule);

      case 'minLength':
        return this.validateMinLength(value, rule);

      case 'maxLength':
        return this.validateMaxLength(value, rule);

      case 'pattern':
        return this.validatePattern(value, rule);

      case 'email':
        return this.validateEmail(value, rule);

      case 'phone':
        return this.validatePhone(value, rule);

      case 'numeric':
        return this.validateNumeric(value, rule);

      case 'custom':
        return this.validateCustom(value, rule);

      default:
        validationLogger.warn(`Unknown validation rule type: "${(rule as ValidationRule).rule}"`);
        return null;
    }
  }

  // -----------------------------------------------------------------------
  // Rule implementations
  // -----------------------------------------------------------------------

  private validateRequired(value: unknown, rule: ValidationRule): string | null {
    const isEmpty =
      value === undefined ||
      value === null ||
      value === '' ||
      (typeof value === 'string' && value.trim().length === 0);

    if (isEmpty) {
      return rule.message ?? 'This field is required';
    }
    return null;
  }

  private validateMin(value: unknown, rule: ValidationRule): string | null {
    const min = Number(rule.value);
    if (Number.isNaN(min)) {
      validationLogger.warn('Invalid "min" rule value - expected a number');
      return null;
    }

    const numValue = Number(value);
    if (Number.isNaN(numValue)) {
      return null; // Non-numeric values are not validated by min
    }

    if (numValue < min) {
      return rule.message ?? `Value must be at least ${min}`;
    }
    return null;
  }

  private validateMax(value: unknown, rule: ValidationRule): string | null {
    const max = Number(rule.value);
    if (Number.isNaN(max)) {
      validationLogger.warn('Invalid "max" rule value - expected a number');
      return null;
    }

    const numValue = Number(value);
    if (Number.isNaN(numValue)) {
      return null; // Non-numeric values are not validated by max
    }

    if (numValue > max) {
      return rule.message ?? `Value must be at most ${max}`;
    }
    return null;
  }

  private validateMinLength(value: unknown, rule: ValidationRule): string | null {
    const minLength = Number(rule.value);
    if (Number.isNaN(minLength)) {
      validationLogger.warn('Invalid "minLength" rule value - expected a number');
      return null;
    }

    const strValue = String(value ?? '');
    if (strValue.length < minLength) {
      return rule.message ?? `Must be at least ${minLength} characters`;
    }
    return null;
  }

  private validateMaxLength(value: unknown, rule: ValidationRule): string | null {
    const maxLength = Number(rule.value);
    if (Number.isNaN(maxLength)) {
      validationLogger.warn('Invalid "maxLength" rule value - expected a number');
      return null;
    }

    const strValue = String(value ?? '');
    if (strValue.length > maxLength) {
      return rule.message ?? `Must be at most ${maxLength} characters`;
    }
    return null;
  }

  private validatePattern(value: unknown, rule: ValidationRule): string | null {
    if (typeof rule.value !== 'string') {
      validationLogger.warn('Invalid "pattern" rule value - expected a regex string');
      return null;
    }

    const strValue = String(value ?? '');
    try {
      const regex = new RegExp(rule.value);
      if (!regex.test(strValue)) {
        return rule.message ?? 'Value does not match the required format';
      }
    } catch {
      validationLogger.warn(`Invalid regex pattern in validation rule: "${rule.value}"`);
      return null;
    }

    return null;
  }

  private validateEmail(value: unknown, rule: ValidationRule): string | null {
    const strValue = String(value ?? '');
    if (strValue.length === 0) {
      return null; // Empty values should be caught by 'required' rule
    }

    if (!isValidEmail(strValue)) {
      return rule.message ?? 'Please enter a valid email address';
    }
    return null;
  }

  private validatePhone(value: unknown, rule: ValidationRule): string | null {
    const strValue = String(value ?? '');
    if (strValue.length === 0) {
      return null; // Empty values should be caught by 'required' rule
    }

    if (!isValidPhone(strValue)) {
      return rule.message ?? 'Please enter a valid phone number';
    }
    return null;
  }

  private validateNumeric(value: unknown, rule: ValidationRule): string | null {
    const strValue = String(value ?? '');
    if (strValue.length === 0) {
      return null; // Empty values should be caught by 'required' rule
    }

    if (Number.isNaN(Number(strValue))) {
      return rule.message ?? 'Value must be a number';
    }
    return null;
  }

  private validateCustom(value: unknown, rule: ValidationRule): string | null {
    // Custom rules use expression strings evaluated by ExpressionEngine
    if (typeof rule.value !== 'string') {
      return null; // No expression to evaluate
    }

    try {
      // Lazy import to avoid circular dependency at module level
      const { ExpressionEngine } = require('./ExpressionEngine');
      const engine = new ExpressionEngine();
      const result = engine.evaluate(rule.value, { value, $value: value });

      // Falsy results mean validation failed
      if (result === false || result === 0 || result === '' || result === null || result === undefined) {
        return rule.message ?? 'Custom validation failed';
      }
      return null;
    } catch (err: unknown) {
      validationLogger.warn('Custom validation expression failed', {
        expression: rule.value,
        error: err instanceof Error ? err.message : String(err),
      });
      return rule.message ?? 'Custom validation failed';
    }
  }
}
