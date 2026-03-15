/**
 * ExpressionEngine Profiler Test Suite
 *
 * Tests timing instrumentation and PerformanceBudget integration.
 */

jest.mock('react-native');

import { ExpressionEngine } from '../../src/schema/ExpressionEngine';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createMockPerformanceBudget() {
  return {
    checkBudget: jest.fn().mockReturnValue({ within: true, budget: 5, actual: 0, metric: 'expression_eval' }),
    recordTiming: jest.fn().mockReturnValue({ within: true, budget: 5, actual: 0, metric: 'expression_eval' }),
    getViolations: jest.fn().mockReturnValue([]),
    getTimings: jest.fn().mockReturnValue([]),
    resetTimings: jest.fn(),
  };
}

describe('ExpressionEngine Profiler', () => {
  // ---------------------------------------------------------------------------
  // Constructor tests
  // ---------------------------------------------------------------------------

  describe('constructor', () => {
    it('works without PerformanceBudget (backward compatible)', () => {
      const engine = new ExpressionEngine();
      expect(engine.evaluate('1 + 2', {})).toBe(3);
    });

    it('accepts and stores a PerformanceBudget reference', () => {
      const budget = createMockPerformanceBudget();
      const engine = new ExpressionEngine(budget as any);
      // Engine should be created successfully
      expect(engine).toBeDefined();
    });

    it('evaluate works without PerformanceBudget', () => {
      const engine = new ExpressionEngine();
      const result = engine.evaluate('10 * 5', {});
      expect(result).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // Timing instrumentation tests
  // ---------------------------------------------------------------------------

  describe('timing instrumentation', () => {
    it('calls recordTiming on PerformanceBudget after evaluate', () => {
      const budget = createMockPerformanceBudget();
      const engine = new ExpressionEngine(budget as any);
      engine.evaluate('1 + 1', {});
      expect(budget.recordTiming).toHaveBeenCalled();
    });

    it('calls recordTiming with expression_eval metric', () => {
      const budget = createMockPerformanceBudget();
      const engine = new ExpressionEngine(budget as any);
      engine.evaluate('2 + 2', {});
      expect(budget.recordTiming).toHaveBeenCalledWith('expression_eval', expect.any(Number));
    });

    it('passes non-negative durationMs to recordTiming', () => {
      const budget = createMockPerformanceBudget();
      const engine = new ExpressionEngine(budget as any);
      engine.evaluate('3 + 3', {});
      const durationMs = budget.recordTiming.mock.calls[0][1];
      expect(durationMs).toBeGreaterThanOrEqual(0);
    });

    it('calls recordTiming even when expression evaluation throws', () => {
      const budget = createMockPerformanceBudget();
      const engine = new ExpressionEngine(budget as any);
      try {
        // Unterminated string will cause a parse error
        engine.evaluate("'unterminated", {});
      } catch {
        // Expected to throw
      }
      expect(budget.recordTiming).toHaveBeenCalledWith('expression_eval', expect.any(Number));
    });

    it('calls recordTiming for each evaluate call', () => {
      const budget = createMockPerformanceBudget();
      const engine = new ExpressionEngine(budget as any);
      engine.evaluate('1 + 1', {});
      engine.evaluate('2 + 2', {});
      engine.evaluate('3 + 3', {});
      expect(budget.recordTiming).toHaveBeenCalledTimes(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Profiling stats tests
  // ---------------------------------------------------------------------------

  describe('profiling stats', () => {
    it('returns zero counts initially', () => {
      const engine = new ExpressionEngine();
      const stats = engine.getProfilingStats();
      expect(stats.evaluationCount).toBe(0);
      expect(stats.totalEvalTimeMs).toBe(0);
      expect(stats.averageEvalTimeMs).toBe(0);
    });

    it('increments evaluationCount after each evaluate call', () => {
      const engine = new ExpressionEngine();
      engine.evaluate('1 + 1', {});
      engine.evaluate('2 + 2', {});
      const stats = engine.getProfilingStats();
      expect(stats.evaluationCount).toBe(2);
    });

    it('totalEvalTimeMs is non-negative after evaluations', () => {
      const engine = new ExpressionEngine();
      engine.evaluate('10 + 20', {});
      engine.evaluate('30 * 2', {});
      const stats = engine.getProfilingStats();
      expect(stats.totalEvalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('averageEvalTimeMs is zero when no evaluations', () => {
      const engine = new ExpressionEngine();
      const stats = engine.getProfilingStats();
      expect(stats.averageEvalTimeMs).toBe(0);
    });

    it('averageEvalTimeMs equals total/count after evaluations', () => {
      const engine = new ExpressionEngine();
      engine.evaluate('1 + 1', {});
      engine.evaluate('2 + 2', {});
      engine.evaluate('3 + 3', {});
      const stats = engine.getProfilingStats();
      const expectedAvg = stats.totalEvalTimeMs / stats.evaluationCount;
      expect(stats.averageEvalTimeMs).toBe(expectedAvg);
    });

    it('resetProfilingStats clears all counters back to zero', () => {
      const engine = new ExpressionEngine();
      engine.evaluate('1 + 1', {});
      engine.evaluate('2 + 2', {});
      engine.resetProfilingStats();
      const stats = engine.getProfilingStats();
      expect(stats.evaluationCount).toBe(0);
      expect(stats.totalEvalTimeMs).toBe(0);
      expect(stats.averageEvalTimeMs).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration tests
  // ---------------------------------------------------------------------------

  describe('integration', () => {
    it('resolveExpressions records timing for each embedded expression', () => {
      const budget = createMockPerformanceBudget();
      const engine = new ExpressionEngine(budget as any);
      engine.resolveExpressions('Result: ${1 + 2}', {});
      expect(budget.recordTiming).toHaveBeenCalledWith('expression_eval', expect.any(Number));
    });

    it('multiple expressions in resolveExpressions: evaluationCount reflects all', () => {
      const engine = new ExpressionEngine();
      engine.resolveExpressions('${1 + 1} and ${2 + 2} and ${3 + 3}', {});
      const stats = engine.getProfilingStats();
      expect(stats.evaluationCount).toBe(3);
    });

    it('profiling works with complex expressions (ternary, method calls)', () => {
      const budget = createMockPerformanceBudget();
      const engine = new ExpressionEngine(budget as any);
      const context = { data: { items: [1, 2, 3], name: 'hello' } };
      engine.evaluate('$data.items.length > 0 ? $data.name.toUpperCase() : "none"', context);
      expect(budget.recordTiming).toHaveBeenCalledTimes(1);
      const stats = engine.getProfilingStats();
      expect(stats.evaluationCount).toBe(1);
    });
  });
});
