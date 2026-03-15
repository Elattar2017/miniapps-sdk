/**
 * Performance Timer - Tracks execution time against budgets
 * @module utils/timer
 */

import { PERFORMANCE_BUDGETS, type PerformanceBudgetKey } from '../constants';
import { logger } from './logger';

interface TimerEntry {
  label: string;
  startTime: number;
}

class PerformanceTimer {
  private timers: Map<string, TimerEntry> = new Map();

  /** Start a named timer */
  start(label: string): void {
    this.timers.set(label, {
      label,
      startTime: Date.now(),
    });
  }

  /** End a named timer and return duration in ms */
  end(label: string): number {
    const entry = this.timers.get(label);
    if (!entry) {
      logger.warn(`Timer "${label}" was never started`);
      return -1;
    }

    const duration = Date.now() - entry.startTime;
    this.timers.delete(label);
    return duration;
  }

  /**
   * End a timer and check against a performance budget.
   * Logs a warning if the budget is exceeded.
   */
  endWithBudget(label: string, budgetKey: PerformanceBudgetKey): number {
    const duration = this.end(label);
    if (duration < 0) return duration;

    const budget = PERFORMANCE_BUDGETS[budgetKey];
    if (duration > budget) {
      logger.warn(`Performance budget exceeded: ${label} took ${duration}ms (budget: ${budget}ms)`, {
        label,
        duration,
        budget,
        budgetKey,
      });
    }

    return duration;
  }

  /**
   * Measure an async function's execution time.
   * Returns [result, durationMs].
   */
  async measure<T>(label: string, fn: () => Promise<T>): Promise<[T, number]> {
    this.start(label);
    try {
      const result = await fn();
      const duration = this.end(label);
      return [result, duration];
    } catch (error) {
      this.end(label);
      throw error;
    }
  }

  /**
   * Measure a sync function's execution time.
   * Returns [result, durationMs].
   */
  measureSync<T>(label: string, fn: () => T): [T, number] {
    this.start(label);
    try {
      const result = fn();
      const duration = this.end(label);
      return [result, duration];
    } catch (error) {
      this.end(label);
      throw error;
    }
  }

  /** Check if a timer is currently running */
  isRunning(label: string): boolean {
    return this.timers.has(label);
  }

  /** Clear all running timers */
  clear(): void {
    this.timers.clear();
  }
}

/** Global SDK performance timer */
export const timer = new PerformanceTimer();

export { PerformanceTimer };
