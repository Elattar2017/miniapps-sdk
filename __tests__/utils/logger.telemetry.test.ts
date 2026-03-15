/**
 * Logger — TelemetryCollector Integration Tests
 *
 * Tests that WARN/ERROR logs are forwarded to the TelemetryCollector
 * when configured, and that DEBUG/INFO logs are not.
 */

import { Logger } from '../../src/utils/logger';
import type { TelemetryCollectorLike } from '../../src/utils/logger';

// Suppress console output during tests
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function createMockCollector(): TelemetryCollectorLike & { track: jest.Mock } {
  return { track: jest.fn() };
}

describe('Logger — TelemetryCollector integration', () => {
  let log: Logger;
  let collector: ReturnType<typeof createMockCollector>;

  beforeEach(() => {
    log = new Logger();
    log.setLevel('DEBUG');
    collector = createMockCollector();
    log.setTelemetryCollector(collector);
  });

  it('forwards WARN logs to the collector', () => {
    log.warn('Something concerning');

    expect(collector.track).toHaveBeenCalledTimes(1);
    const event = collector.track.mock.calls[0][0];
    expect(event.type).toBe('log_event');
    expect(event.data.level).toBe('WARN');
    expect(event.data.message).toBe('Something concerning');
  });

  it('forwards ERROR logs to the collector', () => {
    log.error('Something broke');

    expect(collector.track).toHaveBeenCalledTimes(1);
    const event = collector.track.mock.calls[0][0];
    expect(event.data.level).toBe('ERROR');
    expect(event.data.message).toBe('Something broke');
  });

  it('does NOT forward DEBUG logs to the collector', () => {
    log.debug('Debug info');
    expect(collector.track).not.toHaveBeenCalled();
  });

  it('does NOT forward INFO logs to the collector', () => {
    log.info('Informational');
    expect(collector.track).not.toHaveBeenCalled();
  });

  it('includes context in the forwarded event', () => {
    log.setContext({ tenantId: 'acme', moduleId: 'billing' });
    log.warn('Context test', { screenId: 'main' });

    const event = collector.track.mock.calls[0][0];
    expect(event.tenantId).toBe('acme');
    expect(event.moduleId).toBe('billing');
    expect(event.data.screenId).toBe('main');
  });

  it('still outputs to console when collector is set', () => {
    log.warn('Also to console');

    expect(console.warn).toHaveBeenCalled();
    expect(collector.track).toHaveBeenCalled();
  });

  it('does not forward when collector is null', () => {
    log.setTelemetryCollector(null);
    log.warn('No collector');

    expect(console.warn).toHaveBeenCalled();
    // No error thrown, just silently skipped
  });

  it('child logger inherits the collector', () => {
    const child = log.child({ component: 'TestChild' });
    child.error('Child error');

    expect(collector.track).toHaveBeenCalledTimes(1);
    const event = collector.track.mock.calls[0][0];
    expect(event.data.component).toBe('TestChild');
    expect(event.data.level).toBe('ERROR');
  });

  it('uses "system" as tenantId when not set in context', () => {
    log.error('No tenant context');

    const event = collector.track.mock.calls[0][0];
    expect(event.tenantId).toBe('system');
    expect(event.userId).toBe('system');
  });

  it('uses tenantId from context when available', () => {
    log.setContext({ tenantId: 'operator-x' });
    log.warn('With tenant');

    const event = collector.track.mock.calls[0][0];
    expect(event.tenantId).toBe('operator-x');
  });
});
