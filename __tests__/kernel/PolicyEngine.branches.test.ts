/**
 * PolicyEngine Branch Coverage Test Suite
 * Tests untested operator branches (neq, not_in, gt, lt, contains, unknown),
 * resolveField paths, multiple conditions, and wildcard matching.
 */

import { PolicyEngine } from '../../src/kernel/policy/PolicyEngine';
import type { PolicyRule, PolicyContext } from '../../src/types';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Helper to create a basic policy context */
function createContext(overrides?: Partial<PolicyContext>): PolicyContext {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    roles: ['viewer'],
    resource: 'module:budget',
    action: 'read',
    ...overrides,
  };
}

describe('PolicyEngine - Branch Coverage', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  afterEach(() => {
    engine.clearPolicies();
  });

  // ---------------------------------------------------------------------------
  // neq operator
  // ---------------------------------------------------------------------------

  describe('neq operator', () => {
    it('should match when field value is not equal to condition value', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-non-basic',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.plan', operator: 'neq', value: 'basic' },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { plan: 'gold' } }),
      );
      expect(decision.allowed).toBe(true);
      expect(decision.rule?.id).toBe('allow-non-basic');
    });

    it('should not match when field value equals condition value', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-non-basic',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.plan', operator: 'neq', value: 'basic' },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { plan: 'basic' } }),
      );
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain('default deny');
    });
  });

  // ---------------------------------------------------------------------------
  // not_in operator
  // ---------------------------------------------------------------------------

  describe('not_in operator', () => {
    it('should match when scalar field is not in condition array', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-not-restricted',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.plan', operator: 'not_in', value: ['basic', 'trial'] },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { plan: 'gold' } }),
      );
      expect(decision.allowed).toBe(true);
    });

    it('should not match when scalar field is in condition array', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-not-restricted',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.plan', operator: 'not_in', value: ['basic', 'trial'] },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { plan: 'basic' } }),
      );
      expect(decision.allowed).toBe(false);
    });

    it('should match when array field has no overlap with condition array', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-no-overlap',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'user.roles', operator: 'not_in', value: ['admin', 'superadmin'] },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ roles: ['viewer', 'editor'] }),
      );
      expect(decision.allowed).toBe(true);
    });

    it('should not match when array field has overlap with condition array', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-no-overlap',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'user.roles', operator: 'not_in', value: ['admin', 'superadmin'] },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ roles: ['viewer', 'admin'] }),
      );
      expect(decision.allowed).toBe(false);
    });

    it('should return true when conditionValue is not an array', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-not-in-non-array',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.plan', operator: 'not_in', value: 'not-an-array' },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { plan: 'gold' } }),
      );
      expect(decision.allowed).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // gt operator
  // ---------------------------------------------------------------------------

  describe('gt operator', () => {
    it('should match when field is greater than condition value', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-high-level',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.level', operator: 'gt', value: 5 },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { level: 10 } }),
      );
      expect(decision.allowed).toBe(true);
    });

    it('should not match when field is less than or equal to condition value', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-high-level',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.level', operator: 'gt', value: 5 },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { level: 5 } }),
      );
      expect(decision.allowed).toBe(false);
    });

    it('should return false when field is not a number', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-high-level',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.level', operator: 'gt', value: 5 },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { level: 'ten' } }),
      );
      expect(decision.allowed).toBe(false);
    });

    it('should return false when condition value is not a number', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-high-level',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.level', operator: 'gt', value: 'five' as unknown as number },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { level: 10 } }),
      );
      expect(decision.allowed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // lt operator
  // ---------------------------------------------------------------------------

  describe('lt operator', () => {
    it('should match when field is less than condition value', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'deny-low-priority',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.priority', operator: 'lt', value: 10 },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { priority: 3 } }),
      );
      expect(decision.allowed).toBe(true);
    });

    it('should not match when field is greater than or equal to condition value', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-low-priority',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.priority', operator: 'lt', value: 10 },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { priority: 10 } }),
      );
      expect(decision.allowed).toBe(false);
    });

    it('should return false when field is not a number', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-low-priority',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.priority', operator: 'lt', value: 10 },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { priority: 'high' } }),
      );
      expect(decision.allowed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // contains operator
  // ---------------------------------------------------------------------------

  describe('contains operator', () => {
    it('should match when string field contains string value', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-gmail',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.email', operator: 'contains', value: '@gmail.com' },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { email: 'user@gmail.com' } }),
      );
      expect(decision.allowed).toBe(true);
    });

    it('should not match when string field does not contain string value', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-gmail',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.email', operator: 'contains', value: '@gmail.com' },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { email: 'user@outlook.com' } }),
      );
      expect(decision.allowed).toBe(false);
    });

    it('should match when array field contains value', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-tagged',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.tags', operator: 'contains', value: 'premium' },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { tags: ['premium', 'active'] } }),
      );
      expect(decision.allowed).toBe(true);
    });

    it('should not match when array field does not contain value', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-tagged',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.tags', operator: 'contains', value: 'premium' },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { tags: ['basic', 'inactive'] } }),
      );
      expect(decision.allowed).toBe(false);
    });

    it('should return false when field is neither string nor array', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-contains-number',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.count', operator: 'contains', value: 5 },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { count: 5 } }),
      );
      expect(decision.allowed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown operator
  // ---------------------------------------------------------------------------

  describe('unknown operator', () => {
    it('should return false and log warning for unknown operator', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-unknown-op',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.plan', operator: 'banana_op' as never, value: '.*' },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { plan: 'gold' } }),
      );
      expect(decision.allowed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // resolveField paths
  // ---------------------------------------------------------------------------

  describe('resolveField paths', () => {
    it('should resolve user.id to context.userId', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-specific-user',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'user.id', operator: 'eq', value: 'user-1' },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(createContext({ userId: 'user-1' }));
      expect(decision.allowed).toBe(true);
    });

    it('should resolve tenant.id to context.tenantId', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-tenant',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'tenant.id', operator: 'eq', value: 'tenant-1' },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(createContext({ tenantId: 'tenant-1' }));
      expect(decision.allowed).toBe(true);
    });

    it('should resolve module.id to context.moduleId', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-module',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'module.id', operator: 'eq', value: 'mod-123' },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(createContext({ moduleId: 'mod-123' }));
      expect(decision.allowed).toBe(true);
    });

    it('should resolve attributes.plan to context.attributes.plan', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-gold',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'attributes.plan', operator: 'eq', value: 'gold' },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { plan: 'gold' } }),
      );
      expect(decision.allowed).toBe(true);
    });

    it('should resolve unprefixed field to context.attributes[field]', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-direct-attr',
          resource: 'module:budget',
          action: 'read',
          effect: 'allow',
          priority: 1,
          conditions: [
            { field: 'region', operator: 'eq', value: 'US' },
          ],
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ attributes: { region: 'US' } }),
      );
      expect(decision.allowed).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple conditions (AND logic)
  // ---------------------------------------------------------------------------

  describe('multiple conditions (AND logic)', () => {
    const rules: PolicyRule[] = [
      {
        id: 'allow-gold-admin',
        resource: 'module:budget',
        action: 'read',
        effect: 'allow',
        priority: 1,
        conditions: [
          { field: 'attributes.plan', operator: 'eq', value: 'gold' },
          { field: 'user.roles', operator: 'in', value: ['admin', 'manager'] },
        ],
      },
    ];

    it('should match when all conditions are true', async () => {
      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({
          roles: ['admin'],
          attributes: { plan: 'gold' },
        }),
      );
      expect(decision.allowed).toBe(true);
    });

    it('should not match when one condition is false', async () => {
      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({
          roles: ['viewer'],
          attributes: { plan: 'gold' },
        }),
      );
      expect(decision.allowed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Wildcards (additional combinations)
  // ---------------------------------------------------------------------------

  describe('wildcards', () => {
    it('should match resource wildcard with any resource', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-all-resources',
          resource: '*',
          action: 'read',
          effect: 'allow',
          priority: 1,
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ resource: 'module:anything' }),
      );
      expect(decision.allowed).toBe(true);
    });

    it('should match action wildcard with any action', async () => {
      const rules: PolicyRule[] = [
        {
          id: 'allow-all-actions',
          resource: 'module:budget',
          action: '*',
          effect: 'allow',
          priority: 1,
        },
      ];

      engine.loadPolicies(rules);

      const decision = await engine.evaluate(
        createContext({ action: 'delete' }),
      );
      expect(decision.allowed).toBe(true);
    });
  });
});
