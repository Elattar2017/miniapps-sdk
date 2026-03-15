/**
 * Performance Budget - Enforces SDK performance budgets from CLAUDE.md
 * @module kernel/telemetry/PerformanceBudget
 *
 * Programmatic enforcement of the performance budgets defined in
 * CLAUDE.md. Each metric has a maximum allowed duration in milliseconds.
 * Timings can be checked against budgets and violations are tracked
 * and published on the DataBus.
 */

import { logger } from '../../utils/logger';
import type { DataBus } from '../communication/DataBus';

const PERFORMANCE_BUDGETS: Record<string, number> = {
  'sdk_boot': 500,
  'module_load_cached': 100,
  'module_load_network': 2000,
  'screen_transition': 200,
  'input_response': 50,
  'chart_render': 300,
  'expression_eval': 5,
  'attestation_flow': 500,
};

export interface BudgetResult {
  within: boolean;
  budget: number;
  actual: number;
  metric: string;
}

export interface BudgetViolation extends BudgetResult {
  timestamp: number;
}

export class PerformanceBudget {
  private readonly log = logger.child({ component: 'PerformanceBudget' });
  private readonly dataBus: DataBus | undefined;
  private readonly violations: BudgetViolation[] = [];
  private readonly timings: Array<{ metric: string; durationMs: number; timestamp: number }> = [];

  constructor(dataBus?: DataBus) {
    this.dataBus = dataBus;
    this.log.info('PerformanceBudget initialized');
  }

  checkBudget(metric: string, durationMs: number): BudgetResult {
    const budget = PERFORMANCE_BUDGETS[metric];

    if (budget === undefined) {
      return { within: true, budget: 0, actual: durationMs, metric };
    }

    const within = durationMs <= budget;
    return { within, budget, actual: durationMs, metric };
  }

  recordTiming(metric: string, durationMs: number): BudgetResult {
    const timestamp = Date.now();
    this.timings.push({ metric, durationMs, timestamp });

    const result = this.checkBudget(metric, durationMs);

    if (!result.within) {
      const violation: BudgetViolation = { ...result, timestamp };
      this.violations.push(violation);
      this.dataBus?.publish('sdk:performance:violation', violation);
      this.log.warn('Performance budget violated', {
        metric,
        budget: result.budget,
        actual: durationMs,
      });
    }

    return result;
  }

  getViolations(): BudgetViolation[] {
    return [...this.violations];
  }

  getTimings(metric?: string): Array<{ metric: string; durationMs: number; timestamp: number }> {
    if (metric !== undefined) {
      return this.timings.filter(t => t.metric === metric);
    }
    return [...this.timings];
  }

  resetTimings(): void {
    this.timings.length = 0;
    this.violations.length = 0;
    this.log.debug('Performance timings and violations reset');
  }
}
