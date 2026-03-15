/**
 * PerformanceBudget Test Suite
 */

import { PerformanceBudget } from '../../../src/kernel/telemetry/PerformanceBudget';
import type { BudgetResult, BudgetViolation } from '../../../src/kernel/telemetry/PerformanceBudget';
import { DataBus } from '../../../src/kernel/communication/DataBus';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PerformanceBudget', () => {
  let budget: PerformanceBudget;
  let dataBus: DataBus;

  beforeEach(() => {
    dataBus = new DataBus();
    budget = new PerformanceBudget(dataBus);
  });

  describe('checkBudget()', () => {
    it('returns within=true when duration is within budget', () => {
      const result = budget.checkBudget('sdk_boot', 300);
      expect(result.within).toBe(true);
      expect(result.budget).toBe(500);
      expect(result.actual).toBe(300);
      expect(result.metric).toBe('sdk_boot');
    });

    it('returns within=false when duration exceeds budget', () => {
      const result = budget.checkBudget('sdk_boot', 600);
      expect(result.within).toBe(false);
      expect(result.budget).toBe(500);
      expect(result.actual).toBe(600);
      expect(result.metric).toBe('sdk_boot');
    });

    it('timing exactly at budget threshold counts as within', () => {
      const result = budget.checkBudget('sdk_boot', 500);
      expect(result.within).toBe(true);
      expect(result.budget).toBe(500);
      expect(result.actual).toBe(500);
    });

    it('unknown metric with no defined budget is always within', () => {
      const result = budget.checkBudget('unknown_metric', 99999);
      expect(result.within).toBe(true);
      expect(result.budget).toBe(0);
      expect(result.actual).toBe(99999);
      expect(result.metric).toBe('unknown_metric');
    });
  });

  describe('recordTiming()', () => {
    it('stores timing and checks budget', () => {
      const result = budget.recordTiming('sdk_boot', 300);
      expect(result.within).toBe(true);

      const timings = budget.getTimings();
      expect(timings).toHaveLength(1);
      expect(timings[0].metric).toBe('sdk_boot');
      expect(timings[0].durationMs).toBe(300);
      expect(timings[0].timestamp).toBeGreaterThan(0);
    });

    it('multiple timings for same metric are all recorded', () => {
      budget.recordTiming('sdk_boot', 300);
      budget.recordTiming('sdk_boot', 400);
      budget.recordTiming('sdk_boot', 600);

      const timings = budget.getTimings('sdk_boot');
      expect(timings).toHaveLength(3);
    });
  });

  describe('getViolations()', () => {
    it('returns all violations', () => {
      budget.recordTiming('sdk_boot', 600);
      budget.recordTiming('sdk_boot', 300);
      budget.recordTiming('input_response', 100);

      const violations = budget.getViolations();
      expect(violations).toHaveLength(2);
      expect(violations[0].metric).toBe('sdk_boot');
      expect(violations[0].actual).toBe(600);
      expect(violations[1].metric).toBe('input_response');
      expect(violations[1].actual).toBe(100);
    });
  });

  describe('getTimings()', () => {
    it('returns all timings when no filter', () => {
      budget.recordTiming('sdk_boot', 300);
      budget.recordTiming('input_response', 30);

      expect(budget.getTimings()).toHaveLength(2);
    });

    it('returns filtered timings by metric', () => {
      budget.recordTiming('sdk_boot', 300);
      budget.recordTiming('input_response', 30);
      budget.recordTiming('sdk_boot', 400);

      const timings = budget.getTimings('sdk_boot');
      expect(timings).toHaveLength(2);
      expect(timings.every(t => t.metric === 'sdk_boot')).toBe(true);
    });
  });

  describe('resetTimings()', () => {
    it('clears all timings and violations', () => {
      budget.recordTiming('sdk_boot', 600);
      budget.recordTiming('input_response', 30);

      budget.resetTimings();

      expect(budget.getTimings()).toHaveLength(0);
      expect(budget.getViolations()).toHaveLength(0);
    });
  });

  describe('predefined budgets', () => {
    it('all 8 predefined budgets have correct values from CLAUDE.md', () => {
      const expectedBudgets: Record<string, number> = {
        'sdk_boot': 500,
        'module_load_cached': 100,
        'module_load_network': 2000,
        'screen_transition': 200,
        'input_response': 50,
        'chart_render': 300,
        'expression_eval': 5,
        'attestation_flow': 500,
      };

      for (const [metric, expectedBudget] of Object.entries(expectedBudgets)) {
        const atBudget = budget.checkBudget(metric, expectedBudget);
        expect(atBudget.within).toBe(true);
        expect(atBudget.budget).toBe(expectedBudget);

        const overBudget = budget.checkBudget(metric, expectedBudget + 1);
        expect(overBudget.within).toBe(false);
        expect(overBudget.budget).toBe(expectedBudget);
      }
    });
  });

  describe('DataBus events', () => {
    it('publishes event on budget violation', () => {
      const publishSpy = jest.spyOn(dataBus, 'publish');

      budget.recordTiming('sdk_boot', 600);

      expect(publishSpy).toHaveBeenCalledWith('sdk:performance:violation', expect.objectContaining({
        within: false,
        metric: 'sdk_boot',
        budget: 500,
        actual: 600,
      }));
    });
  });

  describe('without DataBus', () => {
    it('works without DataBus (undefined)', () => {
      const budgetNoBus = new PerformanceBudget();

      const result = budgetNoBus.recordTiming('sdk_boot', 600);
      expect(result.within).toBe(false);
      expect(budgetNoBus.getViolations()).toHaveLength(1);
    });
  });
});
