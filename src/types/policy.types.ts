/**
 * Policy Types - RBAC/ABAC policy rules, evaluation context, decisions
 * @module types/policy
 */

/** Policy rule definition */
export interface PolicyRule {
  id: string;
  resource: string;
  action: string;
  effect: 'allow' | 'deny';
  conditions?: PolicyCondition[];
  priority?: number;
}

/** Policy condition for ABAC evaluation */
export interface PolicyCondition {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'exists' | 'not_exists';
  value: unknown;
}

/** Policy evaluation context */
export interface PolicyContext {
  userId: string;
  tenantId?: string;
  roles?: string[];
  moduleId?: string;
  resource: string;
  action: string;
  attributes?: Record<string, unknown>;
}

/** Policy evaluation result */
export interface PolicyDecision {
  allowed: boolean;
  rule?: PolicyRule;
  reason?: string;
}

/** Policy engine interface */
export interface IPolicyEngine {
  evaluate(context: PolicyContext): Promise<PolicyDecision>;
  loadPolicies(policies: PolicyRule[]): void;
  clearPolicies(): void;
  getPolicies(): PolicyRule[];
}
