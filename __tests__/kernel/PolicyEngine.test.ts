/**
 * PolicyEngine Test Suite
 * Tests RBAC/ABAC policy evaluation with deny-first logic,
 * rule management, and default-deny behavior.
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

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  afterEach(() => {
    engine.clearPolicies();
  });

  it('should evaluate allow policy', async () => {
    const rules: PolicyRule[] = [
      {
        id: 'allow-read',
        resource: 'module:budget',
        action: 'read',
        effect: 'allow',
        priority: 1,
      },
    ];

    engine.loadPolicies(rules);

    const decision = await engine.evaluate(createContext());
    expect(decision.allowed).toBe(true);
    expect(decision.rule?.id).toBe('allow-read');
    expect(decision.reason).toContain('Allowed');
  });

  it('should evaluate deny policy', async () => {
    const rules: PolicyRule[] = [
      {
        id: 'deny-write',
        resource: 'module:budget',
        action: 'write',
        effect: 'deny',
        priority: 1,
      },
    ];

    engine.loadPolicies(rules);

    const decision = await engine.evaluate(
      createContext({ action: 'write' }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.rule?.id).toBe('deny-write');
    expect(decision.reason).toContain('Denied');
  });

  it('should prioritize deny rules over allow rules', async () => {
    const rules: PolicyRule[] = [
      {
        id: 'allow-all',
        resource: '*',
        action: '*',
        effect: 'allow',
        priority: 1,
      },
      {
        id: 'deny-write',
        resource: 'module:budget',
        action: 'write',
        effect: 'deny',
        priority: 1,
      },
    ];

    engine.loadPolicies(rules);

    const decision = await engine.evaluate(
      createContext({ action: 'write' }),
    );
    // Deny rules are evaluated first, so deny wins
    expect(decision.allowed).toBe(false);
    expect(decision.rule?.id).toBe('deny-write');
  });

  it('should default deny when no rules match', async () => {
    engine.loadPolicies([]);

    const decision = await engine.evaluate(createContext());
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('default deny');
  });

  it('should default deny when loaded rules do not match the context', async () => {
    const rules: PolicyRule[] = [
      {
        id: 'allow-other',
        resource: 'module:other',
        action: 'read',
        effect: 'allow',
        priority: 1,
      },
    ];

    engine.loadPolicies(rules);

    const decision = await engine.evaluate(createContext());
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('default deny');
  });

  it('should add and remove rules via loadPolicies', () => {
    const rules: PolicyRule[] = [
      {
        id: 'rule-1',
        resource: '*',
        action: '*',
        effect: 'allow',
        priority: 1,
      },
      {
        id: 'rule-2',
        resource: '*',
        action: 'delete',
        effect: 'deny',
        priority: 2,
      },
    ];

    engine.loadPolicies(rules);
    const loaded = engine.getPolicies();
    expect(loaded).toHaveLength(2);

    // Policies should be sorted by priority (highest first)
    expect(loaded[0].id).toBe('rule-2');
    expect(loaded[1].id).toBe('rule-1');
  });

  it('should clear all policies', () => {
    const rules: PolicyRule[] = [
      {
        id: 'rule-1',
        resource: '*',
        action: '*',
        effect: 'allow',
        priority: 1,
      },
    ];

    engine.loadPolicies(rules);
    expect(engine.getPolicies()).toHaveLength(1);

    engine.clearPolicies();
    expect(engine.getPolicies()).toHaveLength(0);
  });

  it('should match wildcard resource', async () => {
    const rules: PolicyRule[] = [
      {
        id: 'allow-all-read',
        resource: '*',
        action: 'read',
        effect: 'allow',
        priority: 1,
      },
    ];

    engine.loadPolicies(rules);

    const decision = await engine.evaluate(createContext());
    expect(decision.allowed).toBe(true);
  });

  it('should match wildcard action', async () => {
    const rules: PolicyRule[] = [
      {
        id: 'allow-budget-all',
        resource: 'module:budget',
        action: '*',
        effect: 'allow',
        priority: 1,
      },
    ];

    engine.loadPolicies(rules);

    const decision = await engine.evaluate(
      createContext({ action: 'write' }),
    );
    expect(decision.allowed).toBe(true);
  });

  it('should evaluate conditions (role-based)', async () => {
    const rules: PolicyRule[] = [
      {
        id: 'allow-admin',
        resource: 'module:budget',
        action: 'write',
        effect: 'allow',
        priority: 1,
        conditions: [
          {
            field: 'user.roles',
            operator: 'in',
            value: ['admin', 'manager'],
          },
        ],
      },
    ];

    engine.loadPolicies(rules);

    // viewer role should NOT match
    const deniedDecision = await engine.evaluate(
      createContext({ action: 'write', roles: ['viewer'] }),
    );
    expect(deniedDecision.allowed).toBe(false);

    // admin role SHOULD match
    const allowedDecision = await engine.evaluate(
      createContext({ action: 'write', roles: ['admin'] }),
    );
    expect(allowedDecision.allowed).toBe(true);
  });

  it('should evaluate conditions (attribute-based)', async () => {
    const rules: PolicyRule[] = [
      {
        id: 'allow-gold-plan',
        resource: 'module:premium',
        action: 'read',
        effect: 'allow',
        priority: 1,
        conditions: [
          {
            field: 'attributes.plan',
            operator: 'eq',
            value: 'gold',
          },
        ],
      },
    ];

    engine.loadPolicies(rules);

    const decision = await engine.evaluate(
      createContext({
        resource: 'module:premium',
        attributes: { plan: 'gold' },
      }),
    );
    expect(decision.allowed).toBe(true);

    const deniedDecision = await engine.evaluate(
      createContext({
        resource: 'module:premium',
        attributes: { plan: 'basic' },
      }),
    );
    expect(deniedDecision.allowed).toBe(false);
  });
});
