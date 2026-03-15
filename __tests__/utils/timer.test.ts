/**
 * PerformanceTimer Test Suite
 * Tests timer start/end, duration measurement, unknown timer warnings,
 * and async/sync measurement wrappers.
 */

import { PerformanceTimer } from '../../src/utils/timer';

describe('PerformanceTimer', () => {
  let timer: PerformanceTimer;

  beforeEach(() => {
    timer = new PerformanceTimer();
    // Suppress console output from the logger
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    timer.clear();
    jest.restoreAllMocks();
  });

  it('should start and end timers', () => {
    timer.start('test-timer');
    expect(timer.isRunning('test-timer')).toBe(true);

    const duration = timer.end('test-timer');
    expect(timer.isRunning('test-timer')).toBe(false);
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('should return duration in milliseconds', () => {
    const now = Date.now();
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(now)       // start
      .mockReturnValueOnce(now + 50); // end

    timer.start('timed');
    const duration = timer.end('timed');

    expect(duration).toBe(50);
  });

  it('should warn on unknown timer and return -1', () => {
    const duration = timer.end('nonexistent-timer');
    expect(duration).toBe(-1);
    // The logger should have been invoked with a warn about the unknown timer
    expect(console.warn).toHaveBeenCalled();
  });

  it('should measure async functions', async () => {
    const [result, duration] = await timer.measure('async-op', async () => {
      return 'async-result';
    });

    expect(result).toBe('async-result');
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(timer.isRunning('async-op')).toBe(false);
  });

  it('should measure async functions and clean up timer on error', async () => {
    await expect(
      timer.measure('failing-async', async () => {
        throw new Error('async failure');
      }),
    ).rejects.toThrow('async failure');

    expect(timer.isRunning('failing-async')).toBe(false);
  });

  it('should measure sync functions', () => {
    const [result, duration] = timer.measureSync('sync-op', () => {
      return 42;
    });

    expect(result).toBe(42);
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(timer.isRunning('sync-op')).toBe(false);
  });

  it('should measure sync functions and clean up timer on error', () => {
    expect(() => {
      timer.measureSync('failing-sync', () => {
        throw new Error('sync failure');
      });
    }).toThrow('sync failure');

    expect(timer.isRunning('failing-sync')).toBe(false);
  });

  it('should clear all running timers', () => {
    timer.start('timer-a');
    timer.start('timer-b');
    expect(timer.isRunning('timer-a')).toBe(true);
    expect(timer.isRunning('timer-b')).toBe(true);

    timer.clear();

    expect(timer.isRunning('timer-a')).toBe(false);
    expect(timer.isRunning('timer-b')).toBe(false);
  });
});
