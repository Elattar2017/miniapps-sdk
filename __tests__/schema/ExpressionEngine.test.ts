/**
 * ExpressionEngine Test Suite
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

describe('ExpressionEngine', () => {
  let engine: ExpressionEngine;

  beforeEach(() => {
    engine = new ExpressionEngine();
  });

  describe('numeric expressions', () => {
    it('should evaluate addition', () => {
      expect(engine.evaluate('2 + 3', {})).toBe(5);
    });

    it('should evaluate subtraction', () => {
      expect(engine.evaluate('10 - 4', {})).toBe(6);
    });

    it('should evaluate multiplication', () => {
      expect(engine.evaluate('3 * 7', {})).toBe(21);
    });

    it('should evaluate division', () => {
      expect(engine.evaluate('20 / 4', {})).toBe(5);
    });

    it('should evaluate modulo', () => {
      expect(engine.evaluate('10 % 3', {})).toBe(1);
    });

    it('should respect operator precedence', () => {
      expect(engine.evaluate('2 + 3 * 4', {})).toBe(14);
    });

    it('should handle parentheses', () => {
      expect(engine.evaluate('(2 + 3) * 4', {})).toBe(20);
    });

    it('should handle negative numbers', () => {
      expect(engine.evaluate('-5 + 3', {})).toBe(-2);
    });

    it('should handle floating point', () => {
      expect(engine.evaluate('1.5 + 2.5', {})).toBe(4);
    });
  });

  describe('string concatenation', () => {
    it('should concatenate strings', () => {
      expect(engine.evaluate("'hello' + ' ' + 'world'", {})).toBe('hello world');
    });

    it('should concatenate string with number', () => {
      expect(engine.evaluate("'count: ' + 42", {})).toBe('count: 42');
    });
  });

  describe('boolean expressions', () => {
    it('should evaluate logical AND', () => {
      expect(engine.evaluate('true && false', {})).toBe(false);
      expect(engine.evaluate('true && true', {})).toBe(true);
    });

    it('should evaluate logical OR', () => {
      expect(engine.evaluate('false || true', {})).toBe(true);
      expect(engine.evaluate('false || false', {})).toBe(false);
    });

    it('should evaluate logical NOT', () => {
      expect(engine.evaluate('!true', {})).toBe(false);
      expect(engine.evaluate('!false', {})).toBe(true);
    });
  });

  describe('comparison operators', () => {
    it('should evaluate equality (===)', () => {
      expect(engine.evaluate('5 === 5', {})).toBe(true);
      expect(engine.evaluate('5 === 6', {})).toBe(false);
    });

    it('should evaluate inequality (!==)', () => {
      expect(engine.evaluate('5 !== 6', {})).toBe(true);
    });

    it('should evaluate less than', () => {
      expect(engine.evaluate('3 < 5', {})).toBe(true);
      expect(engine.evaluate('5 < 3', {})).toBe(false);
    });

    it('should evaluate greater than', () => {
      expect(engine.evaluate('5 > 3', {})).toBe(true);
    });

    it('should evaluate less than or equal', () => {
      expect(engine.evaluate('3 <= 3', {})).toBe(true);
      expect(engine.evaluate('4 <= 3', {})).toBe(false);
    });

    it('should evaluate greater than or equal', () => {
      expect(engine.evaluate('5 >= 5', {})).toBe(true);
    });
  });

  describe('ternary expressions', () => {
    it('should evaluate ternary (truthy)', () => {
      expect(engine.evaluate("true ? 'yes' : 'no'", {})).toBe('yes');
    });

    it('should evaluate ternary (falsy)', () => {
      expect(engine.evaluate("false ? 'yes' : 'no'", {})).toBe('no');
    });

    it('should evaluate ternary with complex condition', () => {
      expect(engine.evaluate("5 > 3 ? 'big' : 'small'", {})).toBe('big');
    });
  });

  describe('variable resolution', () => {
    it('should resolve $data variable references', () => {
      const context = { data: { name: 'Alice', age: 30 } };
      expect(engine.evaluate('$data.name', context)).toBe('Alice');
      expect(engine.evaluate('$data.age', context)).toBe(30);
    });

    it('should resolve $state variable references', () => {
      const context = { state: { count: 42, isOpen: true } };
      expect(engine.evaluate('$state.count', context)).toBe(42);
      expect(engine.evaluate('$state.isOpen', context)).toBe(true);
    });

    it('should resolve $item and $index', () => {
      const context = { item: { id: 'abc', label: 'Test' }, index: 3 };
      expect(engine.evaluate('$item.label', context)).toBe('Test');
      expect(engine.evaluate('$index', context)).toBe(3);
    });

    it('should return undefined for unknown variables', () => {
      expect(engine.evaluate('$unknown', {})).toBeUndefined();
    });
  });

  describe('property access', () => {
    it('should handle dot notation', () => {
      const context = { data: { user: { name: 'Bob' } } };
      expect(engine.evaluate('$data.user.name', context)).toBe('Bob');
    });

    it('should handle bracket notation', () => {
      const context = { data: { items: ['a', 'b', 'c'] } };
      expect(engine.evaluate('$data.items[0]', context)).toBe('a');
      expect(engine.evaluate('$data.items[2]', context)).toBe('c');
    });

    it('should handle nested bracket notation', () => {
      const context = {
        data: { map: { key1: 'value1' } },
      };
      expect(engine.evaluate("$data.map['key1']", context)).toBe('value1');
    });

    it('should return undefined for missing properties', () => {
      const context = { data: { name: 'Alice' } };
      expect(engine.evaluate('$data.missing', context)).toBeUndefined();
    });
  });

  describe('method calls', () => {
    it('should call .includes() on strings', () => {
      const context = { data: { name: 'hello world' } };
      expect(engine.evaluate("$data.name.includes('world')", context)).toBe(true);
      expect(engine.evaluate("$data.name.includes('xyz')", context)).toBe(false);
    });

    it('should access .length on strings', () => {
      const context = { data: { name: 'hello' } };
      expect(engine.evaluate('$data.name.length', context)).toBe(5);
    });

    it('should access .length on arrays', () => {
      const context = { data: { items: [1, 2, 3] } };
      expect(engine.evaluate('$data.items.length', context)).toBe(3);
    });

    it('should call .includes() on arrays', () => {
      const context = { data: { tags: ['react', 'native', 'sdk'] } };
      expect(engine.evaluate("$data.tags.includes('sdk')", context)).toBe(true);
      expect(engine.evaluate("$data.tags.includes('vue')", context)).toBe(false);
    });

    it('should call .toUpperCase()', () => {
      const context = { data: { name: 'hello' } };
      expect(engine.evaluate('$data.name.toUpperCase()', context)).toBe('HELLO');
    });

    it('should call .toLowerCase()', () => {
      const context = { data: { name: 'HELLO' } };
      expect(engine.evaluate('$data.name.toLowerCase()', context)).toBe('hello');
    });
  });

  describe('safety checks', () => {
    it('should reject eval', () => {
      expect(() => engine.evaluate('eval("alert(1)")', {})).toThrow('Unsafe expression');
    });

    it('should reject Function constructor', () => {
      expect(() => engine.evaluate('Function("return 1")', {})).toThrow('Unsafe expression');
    });

    it('should reject constructor access', () => {
      expect(() => engine.evaluate('constructor', {})).toThrow('Unsafe expression');
    });

    it('should reject __proto__ access', () => {
      expect(() => engine.evaluate('__proto__', {})).toThrow('Unsafe expression');
    });

    it('should reject prototype access', () => {
      expect(() => engine.evaluate('prototype', {})).toThrow('Unsafe expression');
    });

    it('should reject import', () => {
      expect(() => engine.evaluate("import('module')", {})).toThrow('Unsafe expression');
    });

    it('should reject require', () => {
      expect(() => engine.evaluate("require('fs')", {})).toThrow('Unsafe expression');
    });

    it('should reject window access', () => {
      expect(() => engine.evaluate('window.location', {})).toThrow('Unsafe expression');
    });

    it('should reject assignment operators', () => {
      expect(() => engine.evaluate('x = 5', {})).toThrow('Unsafe expression');
    });

    it('should reject compound assignment operators', () => {
      expect(() => engine.evaluate('x += 5', {})).toThrow('Unsafe expression');
    });

    it('should reject disallowed methods', () => {
      const context = { data: { name: 'hello' } };
      expect(() => engine.evaluate('$data.name.constructor("return 1")', context)).toThrow();
    });
  });

  describe('${...} wrapper syntax', () => {
    it('should strip ${ } wrapper and evaluate', () => {
      expect(engine.evaluate('${2 + 3}', {})).toBe(5);
    });

    it('should evaluate ${ } with variable references', () => {
      const context = { data: { count: 10 } };
      expect(engine.evaluate('${$data.count + 5}', context)).toBe(15);
    });
  });

  describe('template expressions (resolveExpressions)', () => {
    it('should resolve template strings with embedded expressions', () => {
      const context = { data: { name: 'World' } };
      const result = engine.resolveExpressions('Hello ${$data.name}!', context);
      expect(result).toBe('Hello World!');
    });

    it('should resolve multiple embedded expressions', () => {
      const context = { data: { first: 'John', last: 'Doe' } };
      const result = engine.resolveExpressions(
        '${$data.first} ${$data.last}',
        context,
      );
      expect(result).toBe('John Doe');
    });

    it('should handle missing data gracefully in templates', () => {
      const result = engine.resolveExpressions(
        'Hello ${$data.missing}!',
        { data: {} },
      );
      expect(result).toBe('Hello !');
    });
  });

  describe('isExpression', () => {
    it('should detect ${...} wrapped expressions', () => {
      expect(engine.isExpression('${$data.name}')).toBe(true);
    });

    it('should detect $ variable references', () => {
      expect(engine.isExpression('$data.name')).toBe(true);
    });

    it('should return false for plain strings', () => {
      expect(engine.isExpression('Hello World')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw on division by zero', () => {
      expect(() => engine.evaluate('10 / 0', {})).toThrow('Division by zero');
    });

    it('should throw on max depth exceeded', () => {
      // Create a deeply nested expression that exceeds depth 10
      const deep = '((((((((((((1))))))))))))';
      expect(() => engine.evaluate(deep, {})).toThrow('maximum AST depth');
    });

    it('should handle null and undefined literals', () => {
      expect(engine.evaluate('null', {})).toBeNull();
      expect(engine.evaluate('undefined', {})).toBeUndefined();
    });
  });
});
