/**
 * PolicyEngine Operators Test Suite
 *
 * Tests the expanded condition operators: gte, lte, startsWith,
 * endsWith, regex, exists, not_exists.
 */

import { PolicyEngine } from '../../../src/kernel/policy/PolicyEngine';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createEngine(operator: string, value: unknown) {
  const engine = new PolicyEngine();
  engine.loadPolicies([{
    id: `test-${operator}`,
    effect: 'allow',
    resource: '*',
    action: '*',
    conditions: [{ field: 'attributes.val', operator: operator as any, value }],
  }]);
  return engine;
}

async function check(operator: string, conditionValue: unknown, attrValue: unknown): Promise<boolean> {
  const engine = createEngine(operator, conditionValue);
  const decision = await engine.evaluate({
    resource: 'test',
    action: 'read',
    userId: 'user1',
    attributes: { val: attrValue },
  });
  return decision.allowed;
}

describe('PolicyEngine operators', () => {
  describe('gte', () => {
    it('5 >= 5 is true', async () => {
      expect(await check('gte', 5, 5)).toBe(true);
    });
    it('4 >= 5 is false', async () => {
      expect(await check('gte', 5, 4)).toBe(false);
    });
    it('6 >= 5 is true', async () => {
      expect(await check('gte', 5, 6)).toBe(true);
    });
  });

  describe('lte', () => {
    it('5 <= 5 is true', async () => {
      expect(await check('lte', 5, 5)).toBe(true);
    });
    it('6 <= 5 is false', async () => {
      expect(await check('lte', 5, 6)).toBe(false);
    });
  });

  describe('startsWith', () => {
    it('"hello world" starts with "hello"', async () => {
      expect(await check('startsWith', 'hello', 'hello world')).toBe(true);
    });
    it('"hello" does not start with "world"', async () => {
      expect(await check('startsWith', 'world', 'hello')).toBe(false);
    });
  });

  describe('endsWith', () => {
    it('"hello world" ends with "world"', async () => {
      expect(await check('endsWith', 'world', 'hello world')).toBe(true);
    });
    it('"hello" does not end with "world"', async () => {
      expect(await check('endsWith', 'world', 'hello')).toBe(false);
    });
  });

  describe('regex', () => {
    it('"abc123" matches "^[a-z]+\\d+$"', async () => {
      expect(await check('regex', '^[a-z]+\\d+$', 'abc123')).toBe(true);
    });
    it('"ABC" does not match "^[a-z]+$"', async () => {
      expect(await check('regex', '^[a-z]+$', 'ABC')).toBe(false);
    });
    it('pattern > 200 chars is rejected', async () => {
      const longPattern = 'a'.repeat(201);
      expect(await check('regex', longPattern, 'test')).toBe(false);
    });
  });

  describe('exists', () => {
    it('defined attribute returns true', async () => {
      expect(await check('exists', true, 'something')).toBe(true);
    });
    it('undefined attribute returns false', async () => {
      const engine = new PolicyEngine();
      engine.loadPolicies([{
        id: 'test-exists',
        effect: 'allow',
        resource: '*',
        action: '*',
        conditions: [{ field: 'attributes.missing', operator: 'exists', value: true }],
      }]);
      const decision = await engine.evaluate({
        resource: 'test',
        action: 'read',
        userId: 'user1',
        attributes: {},
      });
      expect(decision.allowed).toBe(false);
    });
  });

  describe('not_exists', () => {
    it('undefined attribute returns true', async () => {
      const engine = new PolicyEngine();
      engine.loadPolicies([{
        id: 'test-not_exists',
        effect: 'allow',
        resource: '*',
        action: '*',
        conditions: [{ field: 'attributes.missing', operator: 'not_exists', value: true }],
      }]);
      const decision = await engine.evaluate({
        resource: 'test',
        action: 'read',
        userId: 'user1',
        attributes: {},
      });
      expect(decision.allowed).toBe(true);
    });
    it('defined attribute returns false', async () => {
      expect(await check('not_exists', true, 'something')).toBe(false);
    });
  });
});
