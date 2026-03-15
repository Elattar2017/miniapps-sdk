/**
 * ExpressionEngine Branch Coverage Test Suite
 * Tests uncovered branches in the ExpressionEngine parser and evaluator.
 */

import { ExpressionEngine } from '../../src/schema/ExpressionEngine';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ExpressionEngine - branch coverage', () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine();
  });

  // String escape sequences in tokenizer
  test('string with escaped single quote (default case)', () => {
    const result = engine.evaluate("'hello\\'s'", {});
    expect(result).toBe("hello's");
  });

  test('string with backslash escape', () => {
    const result = engine.evaluate("'hello\\\\world'", {});
    expect(result).toBe('hello\\world');
  });

  test('string with newline escape', () => {
    const result = engine.evaluate("'line1\\nline2'", {});
    expect(result).toBe('line1\nline2');
  });

  test('string with tab escape', () => {
    const result = engine.evaluate("'col1\\tcol2'", {});
    expect(result).toBe('col1\tcol2');
  });

  test('string with carriage return escape', () => {
    const result = engine.evaluate("'hello\\rworld'", {});
    expect(result).toBe('hello\rworld');
  });

  // resolveExpressions edge cases
  test('resolveExpressions with number input returns string', () => {
    const result = engine.resolveExpressions(42 as any, {});
    expect(result).toBe('42');
  });

  test('resolveExpressions with null input returns empty string', () => {
    const result = engine.resolveExpressions(null as any, {});
    expect(result).toBe('');
  });

  test('resolveExpressions with undefined input returns empty string', () => {
    const result = engine.resolveExpressions(undefined as any, {});
    expect(result).toBe('');
  });

  test('resolveExpressions with plain text returns original', () => {
    const result = engine.resolveExpressions('plain text', {});
    expect(result).toBe('plain text');
  });

  // Arithmetic edge cases
  test('modulo by zero throws', () => {
    expect(() => engine.evaluate('10 % 0', {})).toThrow('Modulo by zero');
  });

  // Unary operators
  test('double boolean negation', () => {
    expect(engine.evaluate('!!true', {})).toBe(true);
  });

  test('unary minus on parenthesized expression', () => {
    expect(engine.evaluate('-(3 + 2)', {})).toBe(-5);
  });

  // Nested ternary
  test('nested ternary false path', () => {
    expect(engine.evaluate('false ? 1 : true ? 2 : 3', {})).toBe(2);
  });

  // Deep member access
  test('deeply nested member access', () => {
    const ctx = { data: { user: { profile: { name: 'Alice' } } } };
    expect(engine.evaluate('$data.user.profile.name', ctx)).toBe('Alice');
  });

  // Array index with computed expression
  test('array index with computed expression', () => {
    const ctx = { data: { items: ['a', 'b', 'c'] } };
    expect(engine.evaluate('$data.items[1 + 1]', ctx)).toBe('c');
  });

  // Bracket access on null
  test('bracket access on null returns undefined', () => {
    const ctx = { data: { val: null } };
    expect(engine.evaluate('$data.val[0]', ctx)).toBeUndefined();
  });

  // Loose equality operators
  test('loose equality == operator', () => {
    expect(engine.evaluate('1 == 1', {})).toBe(true);
  });

  test('loose inequality != operator', () => {
    expect(engine.evaluate('1 != 2', {})).toBe(true);
  });

  // resolveObjectExpressions edge cases
  test('resolveObjectExpressions with null returns empty object', () => {
    expect(engine.resolveObjectExpressions(null as any, {})).toEqual({});
  });

  test('resolveObjectExpressions resolves nested objects', () => {
    const ctx = { data: { name: 'World' } };
    const result = engine.resolveObjectExpressions(
      { greeting: '${$data.name}', nested: { inner: 'plain' } },
      ctx,
    );
    expect(result.greeting).toBe('World');
    expect((result.nested as any).inner).toBe('plain');
  });

  test('resolveObjectExpressions preserves arrays', () => {
    const ctx = { data: { x: 10 } };
    const result = engine.resolveObjectExpressions({ items: ['$data.x', 'plain'] }, ctx);
    expect((result.items as any)[0]).toBe(10);
    expect((result.items as any)[1]).toBe('plain');
  });

  test('resolveObjectExpressions preserves null and undefined', () => {
    const result = engine.resolveObjectExpressions({ a: null, b: undefined }, {});
    expect(result.a).toBeNull();
    expect(result.b).toBeUndefined();
  });

  test('resolveObjectExpressions preserves numbers and booleans', () => {
    const result = engine.resolveObjectExpressions({ num: 42, flag: true }, {});
    expect(result.num).toBe(42);
    expect(result.flag).toBe(true);
  });

  // evaluate edge cases
  test('evaluate empty string returns input', () => {
    expect(engine.evaluate('', {})).toBe('');
  });

  test('evaluate non-string returns input', () => {
    expect(engine.evaluate(42 as any, {})).toBe(42);
  });

  test('evaluate empty template wrapper returns empty', () => {
    expect(engine.evaluate('${ }', {})).toBe('');
  });

  // safePropertyAccess security
  test('__proto__ access via dot throws forbidden', () => {
    const ctx = { data: { obj: {} } };
    expect(() => engine.evaluate('$data.obj.__proto__', ctx)).toThrow('Unsafe expression');
  });

  // Tokenizer error cases
  test('unterminated string throws', () => {
    expect(() => engine.evaluate("'hello", {})).toThrow('Unterminated string');
  });

  // Method call on null
  test('calling method on null target throws', () => {
    const ctx = { data: { val: null } };
    expect(() => engine.evaluate('$data.val.toString()', ctx)).toThrow();
  });

  // isExpression edge cases
  test('isExpression with non-string returns false', () => {
    expect(engine.isExpression(42 as any)).toBe(false);
  });
});
