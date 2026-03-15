/**
 * Logger Test Suite
 * Tests the structured Logger class for correct log level filtering,
 * child logger creation, and JSON-formatted output.
 */

import { Logger } from '../../src/utils/logger';
import type { LogContext } from '../../src/utils/logger';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
    // Suppress console output during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create logger with default level INFO', () => {
    // DEBUG should be suppressed at default INFO level
    logger.debug('debug message');
    expect(console.log).not.toHaveBeenCalled();

    // INFO should be logged at default INFO level
    logger.info('info message');
    expect(console.log).toHaveBeenCalledTimes(1);
  });

  it('should not log below current level', () => {
    logger.setLevel('WARN');

    logger.debug('debug message');
    logger.info('info message');
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();

    logger.warn('warn message');
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('should log at and above current level', () => {
    logger.setLevel('DEBUG');

    logger.debug('debug message');
    expect(console.log).toHaveBeenCalledTimes(1);

    logger.info('info message');
    expect(console.log).toHaveBeenCalledTimes(2);

    logger.warn('warn message');
    expect(console.warn).toHaveBeenCalledTimes(1);

    logger.error('error message');
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('should create child loggers with inherited level and merged context', () => {
    logger.setLevel('DEBUG');
    logger.setContext({ tenantId: 'tenant-1' });

    const child = logger.child({ moduleId: 'com.test.module' });

    child.info('child message');
    expect(console.log).toHaveBeenCalledTimes(1);

    const logOutput = (console.log as jest.Mock).mock.calls[0][0] as string;
    const parsed = JSON.parse(logOutput) as {
      level: string;
      message: string;
      context: LogContext;
    };

    expect(parsed.level).toBe('INFO');
    expect(parsed.message).toBe('child message');
    expect(parsed.context.tenantId).toBe('tenant-1');
    expect(parsed.context.moduleId).toBe('com.test.module');
  });

  it('should format structured JSON output', () => {
    logger.setLevel('DEBUG');
    logger.setContext({ tenantId: 'acme' });

    logger.info('test message', { screenId: 'home' });

    expect(console.log).toHaveBeenCalledTimes(1);
    const logOutput = (console.log as jest.Mock).mock.calls[0][0] as string;
    const parsed = JSON.parse(logOutput) as {
      level: string;
      message: string;
      timestamp: string;
      context: LogContext;
    };

    expect(parsed.level).toBe('INFO');
    expect(parsed.message).toBe('test message');
    expect(parsed.timestamp).toBeDefined();
    expect(typeof parsed.timestamp).toBe('string');
    expect(parsed.context.tenantId).toBe('acme');
    expect(parsed.context.screenId).toBe('home');
  });

  it('should route ERROR logs to console.error', () => {
    logger.error('error message');
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('should route WARN logs to console.warn', () => {
    logger.warn('warn message');
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('should not log when disabled', () => {
    logger.setEnabled(false);

    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
