/**
 * Policy Engine - RBAC/ABAC policy evaluation
 * @module kernel/policy/PolicyEngine
 *
 * Implements deny-first policy evaluation:
 * 1. Deny rules are evaluated first (sorted by priority, highest first)
 * 2. If any deny rule matches, access is denied
 * 3. Allow rules are evaluated next (sorted by priority, highest first)
 * 4. If any allow rule matches, access is granted
 * 5. Default: deny (if no rule matches)
 */

import { logger } from '../../utils/logger';
import { PolicyCache } from './PolicyCache';
import type {
  IPolicyEngine,
  PolicyRule,
  PolicyContext,
  PolicyDecision,
  PolicyCondition,
} from '../../types';

export class PolicyEngine implements IPolicyEngine {
  private readonly log = logger.child({ component: 'PolicyEngine' });
  private policies: PolicyRule[] = [];
  private readonly cache: PolicyCache;

  constructor() {
    this.cache = new PolicyCache();
  }

  /**
   * Load policy rules into the engine.
   * Policies are sorted by priority (highest first) for deterministic evaluation.
   * Replaces any existing policies.
   */
  loadPolicies(policies: PolicyRule[]): void {
    this.policies = [...policies].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    this.cache.clear();
    this.log.info('Policies loaded', { count: this.policies.length });
  }

  /**
   * Evaluate a policy context against all loaded rules.
   *
   * Evaluation order:
   * 1. Check cache for a previous decision
   * 2. Evaluate deny rules first (any match => denied)
   * 3. Evaluate allow rules (any match => allowed)
   * 4. Default deny if no rule matches
   */
  async evaluate(context: PolicyContext): Promise<PolicyDecision> {
    const rolesKey = context.roles?.slice().sort().join(',') ?? '';
    const attrsKey = context.attributes ? JSON.stringify(context.attributes) : '';
    const cacheKey = `${context.resource}:${context.action}:${context.userId}:${rolesKey}:${attrsKey}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.log.debug('Policy decision from cache', { cacheKey, allowed: cached.allowed });
      return cached;
    }

    // Separate deny and allow rules (already sorted by priority)
    const denyRules = this.policies.filter((r) => r.effect === 'deny');
    const allowRules = this.policies.filter((r) => r.effect === 'allow');

    // Evaluate deny rules first
    for (const rule of denyRules) {
      if (this.matchesRule(rule, context)) {
        const decision: PolicyDecision = {
          allowed: false,
          rule,
          reason: `Denied by rule: ${rule.id}`,
        };
        this.cache.set(cacheKey, decision);
        this.log.info('Access denied by policy', {
          ruleId: rule.id,
          resource: context.resource,
          action: context.action,
          userId: context.userId,
        });
        return decision;
      }
    }

    // Evaluate allow rules
    for (const rule of allowRules) {
      if (this.matchesRule(rule, context)) {
        const decision: PolicyDecision = {
          allowed: true,
          rule,
          reason: `Allowed by rule: ${rule.id}`,
        };
        this.cache.set(cacheKey, decision);
        this.log.debug('Access allowed by policy', {
          ruleId: rule.id,
          resource: context.resource,
          action: context.action,
        });
        return decision;
      }
    }

    // Default deny
    const decision: PolicyDecision = {
      allowed: false,
      reason: 'No matching policy rule found - default deny',
    };
    this.cache.set(cacheKey, decision);
    this.log.info('Access denied by default (no matching rule)', {
      resource: context.resource,
      action: context.action,
      userId: context.userId,
    });
    return decision;
  }

  /**
   * Clear all loaded policies and the decision cache.
   */
  clearPolicies(): void {
    this.policies = [];
    this.cache.clear();
    this.log.info('All policies cleared');
  }

  /**
   * Get a copy of the currently loaded policies.
   */
  getPolicies(): PolicyRule[] {
    return [...this.policies];
  }

  /**
   * Check if a rule matches the given context.
   * A rule matches if:
   * 1. The resource matches (exact or wildcard '*')
   * 2. The action matches (exact or wildcard '*')
   * 3. All conditions (if any) are satisfied
   */
  private matchesRule(rule: PolicyRule, context: PolicyContext): boolean {
    // Check resource match
    if (rule.resource !== '*' && rule.resource !== context.resource) {
      return false;
    }

    // Check action match
    if (rule.action !== '*' && rule.action !== context.action) {
      return false;
    }

    // Check all conditions
    if (rule.conditions && rule.conditions.length > 0) {
      return this.matchesConditions(rule.conditions, context);
    }

    return true;
  }

  /**
   * Evaluate all conditions against the policy context.
   * All conditions must be satisfied (AND logic).
   *
   * Condition fields can reference:
   * - 'user.roles' => context.roles
   * - 'user.id' => context.userId
   * - 'tenant.id' => context.tenantId
   * - 'module.id' => context.moduleId
   * - Any key in context.attributes
   */
  private matchesConditions(
    conditions: PolicyCondition[],
    context: PolicyContext,
  ): boolean {
    return conditions.every((condition) => this.evaluateCondition(condition, context));
  }

  /**
   * Evaluate a single condition against the context.
   */
  private evaluateCondition(condition: PolicyCondition, context: PolicyContext): boolean {
    const fieldValue = this.resolveField(condition.field, context);
    const { operator, value: conditionValue } = condition;

    switch (operator) {
      case 'eq':
        return fieldValue === conditionValue;

      case 'neq':
        return fieldValue !== conditionValue;

      case 'in': {
        if (!Array.isArray(conditionValue)) return false;
        if (Array.isArray(fieldValue)) {
          // Check if any item in fieldValue is in conditionValue
          return fieldValue.some((item) =>
            (conditionValue as unknown[]).includes(item),
          );
        }
        return (conditionValue as unknown[]).includes(fieldValue);
      }

      case 'not_in': {
        if (!Array.isArray(conditionValue)) return true;
        if (Array.isArray(fieldValue)) {
          return !fieldValue.some((item) =>
            (conditionValue as unknown[]).includes(item),
          );
        }
        return !(conditionValue as unknown[]).includes(fieldValue);
      }

      case 'gt': {
        if (typeof fieldValue !== 'number' || typeof conditionValue !== 'number') return false;
        return fieldValue > conditionValue;
      }

      case 'lt': {
        if (typeof fieldValue !== 'number' || typeof conditionValue !== 'number') return false;
        return fieldValue < conditionValue;
      }

      case 'contains': {
        if (typeof fieldValue === 'string' && typeof conditionValue === 'string') {
          return fieldValue.includes(conditionValue);
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(conditionValue);
        }
        return false;
      }

      case 'gte': {
        if (typeof fieldValue !== 'number' || typeof conditionValue !== 'number') return false;
        return fieldValue >= conditionValue;
      }

      case 'lte': {
        if (typeof fieldValue !== 'number' || typeof conditionValue !== 'number') return false;
        return fieldValue <= conditionValue;
      }

      case 'startsWith': {
        if (typeof fieldValue !== 'string' || typeof conditionValue !== 'string') return false;
        return fieldValue.startsWith(conditionValue);
      }

      case 'endsWith': {
        if (typeof fieldValue !== 'string' || typeof conditionValue !== 'string') return false;
        return fieldValue.endsWith(conditionValue);
      }

      case 'regex': {
        if (typeof fieldValue !== 'string' || typeof conditionValue !== 'string') return false;
        if (conditionValue.length > 200) {
          this.log.warn('Regex pattern too long, rejecting', { length: conditionValue.length });
          return false;
        }
        try {
          const regex = new RegExp(conditionValue);
          return regex.test(fieldValue);
        } catch {
          this.log.warn('Invalid regex pattern', { pattern: conditionValue });
          return false;
        }
      }

      case 'exists': {
        return fieldValue !== undefined && fieldValue !== null;
      }

      case 'not_exists': {
        return fieldValue === undefined || fieldValue === null;
      }

      default:
        this.log.warn(`Unknown policy condition operator: ${String(operator)}`);
        return false;
    }
  }

  /**
   * Resolve a dotted field path to a value from the policy context.
   *
   * Supported field paths:
   * - 'user.roles' => context.roles
   * - 'user.id' => context.userId
   * - 'tenant.id' => context.tenantId
   * - 'module.id' => context.moduleId
   * - 'attributes.<key>' => context.attributes[key]
   * - Direct attribute key => context.attributes[field]
   */
  private resolveField(field: string, context: PolicyContext): unknown {
    switch (field) {
      case 'user.roles':
        return context.roles;
      case 'user.id':
        return context.userId;
      case 'tenant.id':
        return context.tenantId;
      case 'module.id':
        return context.moduleId;
      default: {
        // Check attributes with 'attributes.' prefix
        if (field.startsWith('attributes.')) {
          const attrKey = field.slice('attributes.'.length);
          return context.attributes?.[attrKey];
        }
        // Direct lookup in attributes
        return context.attributes?.[field];
      }
    }
  }
}
