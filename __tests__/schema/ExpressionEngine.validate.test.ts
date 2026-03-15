/**
 * ExpressionEngine.validate() Test Suite (Fix 8)
 */

import { ExpressionEngine } from '../../src/schema/ExpressionEngine';

describe('ExpressionEngine.validate()', () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine();
  });

  it('should report valid for a simple member access', () => {
    const result = engine.validate('state.name');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should report valid for arithmetic expression', () => {
    const result = engine.validate('1 + 2 * 3');
    expect(result.valid).toBe(true);
  });

  it('should report valid for ternary expression', () => {
    const result = engine.validate('x > 0 ? "positive" : "non-positive"');
    expect(result.valid).toBe(true);
  });

  it('should report valid for ${...} wrapped expression', () => {
    const result = engine.validate('${state.count + 1}');
    expect(result.valid).toBe(true);
  });

  it('should report invalid for banned word (eval)', () => {
    const result = engine.validate('eval("bad")');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should report valid for empty string', () => {
    const result = engine.validate('');
    expect(result.valid).toBe(true);
  });

  it('should report valid for undefined variable (runtime error, not syntax)', () => {
    // Accessing an undefined variable is a runtime issue, not a syntax error
    const result = engine.validate('someUndefinedVar');
    expect(result.valid).toBe(true);
  });

  it('should report invalid for unterminated string', () => {
    const result = engine.validate('"unterminated');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });
});
