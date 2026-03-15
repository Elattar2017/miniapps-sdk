/**
 * ValidationEngine Custom Rule Test Suite
 * Tests the custom validation rule that delegates to ExpressionEngine.
 */

import { ValidationEngine } from '../../src/schema/ValidationEngine';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ValidationEngine - custom rule', () => {
  let engine: ValidationEngine;

  beforeEach(() => {
    engine = new ValidationEngine();
  });

  test('custom rule with truthy expression passes', () => {
    const result = engine.validate(5, [
      { rule: 'custom', value: '$value > 0' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('custom rule with falsy expression fails', () => {
    const result = engine.validate(-1, [
      { rule: 'custom', value: '$value > 0' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe('Custom validation failed');
  });

  test('custom rule with custom error message', () => {
    const result = engine.validate(-1, [
      { rule: 'custom', value: '$value > 0', message: 'Must be positive' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toBe('Must be positive');
  });

  test('custom rule with no expression string passes', () => {
    const result = engine.validate('anything', [
      { rule: 'custom' },
    ]);
    expect(result.valid).toBe(true);
  });

  test('custom rule with non-string value passes', () => {
    const result = engine.validate('test', [
      { rule: 'custom', value: 123 },
    ]);
    expect(result.valid).toBe(true);
  });

  test('custom rule with invalid expression fails', () => {
    const result = engine.validate('test', [
      { rule: 'custom', value: '$$invalid!!syntax' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toBe('Custom validation failed');
  });

  test('custom rule evaluating value > 0 passes for positive', () => {
    const result = engine.validate(10, [
      { rule: 'custom', value: '$value > 0' },
    ]);
    expect(result.valid).toBe(true);
  });

  test('custom rule evaluating equality', () => {
    const result = engine.validate('hello', [
      { rule: 'custom', value: "$value === 'hello'" },
    ]);
    expect(result.valid).toBe(true);
  });

  test('custom rule returning null/undefined fails', () => {
    // Expression that evaluates to null should be treated as falsy
    const result = engine.validate(null, [
      { rule: 'custom', value: '$value' },
    ]);
    expect(result.valid).toBe(false);
  });

  test('custom rule combined with other rules', () => {
    const result = engine.validate(5, [
      { rule: 'required' },
      { rule: 'custom', value: '$value > 10', message: 'Must be > 10' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe('Must be > 10');
  });
});
