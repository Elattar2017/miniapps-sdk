/**
 * ExpressionEngine.resolveObjectExpressions Test Suite
 * Tests the safe expression evaluator including arithmetic, string ops,
 * boolean logic, ternary, variable resolution, property access,
 * method calls, safety checks, and template resolution.
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

describe('ExpressionEngine.resolveObjectExpressions', () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine();
  });

  it('resolves $state.name in flat object values', () => {
    const obj = { email: '$state.email', name: '$state.name' };
    const context = { state: { email: 'alice@test.com', name: 'Alice' } };
    const result = engine.resolveObjectExpressions(obj, context);
    expect(result).toEqual({ email: 'alice@test.com', name: 'Alice' });
  });

  it('resolves $data.items in flat object values', () => {
    const obj = { items: '$data.items', total: '$data.total' };
    const context = { data: { items: [1, 2, 3], total: 42 } };
    const result = engine.resolveObjectExpressions(obj, context);
    expect(result).toEqual({ items: [1, 2, 3], total: 42 });
  });

  it('resolves nested object trees', () => {
    const obj = { user: { email: '$state.email', profile: { displayName: '$data.name' } } };
    const context = { state: { email: 'bob@test.com' }, data: { name: 'Bob' } };
    const result = engine.resolveObjectExpressions(obj, context);
    expect(result).toEqual({ user: { email: 'bob@test.com', profile: { displayName: 'Bob' } } });
  });

  it('preserves numbers, booleans, null as-is', () => {
    const obj = { count: 42, active: true, disabled: false, empty: null };
    const result = engine.resolveObjectExpressions(obj, {});
    expect(result).toEqual({ count: 42, active: true, disabled: false, empty: null });
  });

  it('handles arrays with expression elements', () => {
    const obj = { tags: ['$state.tag1', 'literal', '$state.tag2'] };
    const context = { state: { tag1: 'react', tag2: 'native' } };
    const result = engine.resolveObjectExpressions(obj, context);
    expect(result).toEqual({ tags: ['react', 'literal', 'native'] });
  });

  it('returns empty object for null input', () => {
    const result = engine.resolveObjectExpressions(null as any, {});
    expect(result).toEqual({});
  });

  it('returns empty object for undefined input', () => {
    const result = engine.resolveObjectExpressions(undefined as any, {});
    expect(result).toEqual({});
  });

  it('handles expression evaluation errors gracefully', () => {
    const obj = { value: '$state.missing.toString()' };
    const context = { state: {} };
    const result = engine.resolveObjectExpressions(obj, context);
    expect(result.value).toBe('$state.missing.toString()');
  });

  it('handles mixed values: expressions and literals', () => {
    const obj = { name: '$state.name', label: 'Static Label', count: 5, active: true };
    const context = { state: { name: 'Alice' } };
    const result = engine.resolveObjectExpressions(obj, context);
    expect(result).toEqual({ name: 'Alice', label: 'Static Label', count: 5, active: true });
  });

  it('resolves template expressions with ${...} syntax', () => {
    const obj = { greeting: 'Hello ${$state.name}!' };
    const context = { state: { name: 'World' } };
    const result = engine.resolveObjectExpressions(obj, context);
    expect(result).toEqual({ greeting: 'Hello World!' });
  });

  it('handles deep nesting (3+ levels)', () => {
    const obj = { l1: { l2: { l3: { value: '$state.deep' } } } };
    const context = { state: { deep: 'found' } };
    const result = engine.resolveObjectExpressions(obj, context);
    expect(result).toEqual({ l1: { l2: { l3: { value: 'found' } } } });
  });

  it('returns empty object for empty object input', () => {
    const result = engine.resolveObjectExpressions({}, {});
    expect(result).toEqual({});
  });

  it('preserves non-expression strings as-is', () => {
    const obj = { label: 'Submit', desc: 'Click to continue' };
    const result = engine.resolveObjectExpressions(obj, {});
    expect(result).toEqual({ label: 'Submit', desc: 'Click to continue' });
  });

  it('handles arrays of objects with expressions', () => {
    const obj = { items: [{ name: '$state.first', v: 1 }, { name: '$state.second', v: 2 }] };
    const context = { state: { first: 'Alpha', second: 'Beta' } };
    const result = engine.resolveObjectExpressions(obj, context);
    expect(result).toEqual({ items: [{ name: 'Alpha', v: 1 }, { name: 'Beta', v: 2 }] });
  });
});
