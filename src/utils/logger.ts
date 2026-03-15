/**
 * Structured Logger - JSON output with optional TelemetryCollector integration
 * @module utils/logger
 *
 * WARN and ERROR level logs are automatically forwarded to the
 * TelemetryCollector (when configured) for remote log aggregation.
 * Console output is always preserved regardless of collector state.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogContext {
  moduleId?: string;
  tenantId?: string;
  screenId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
}

/**
 * Minimal telemetry interface to avoid circular dependency.
 * The real TelemetryCollector imports logger, so we use a lightweight
 * interface here and set the instance at runtime via setTelemetryCollector().
 */
interface TelemetryCollectorLike {
  track(event: {
    type: string;
    timestamp: number;
    tenantId: string;
    userId: string;
    data: Record<string, unknown>;
    moduleId?: string;
  }): void;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/** Minimum log level that triggers telemetry forwarding */
const TELEMETRY_FORWARD_LEVEL = LOG_LEVELS.WARN;

class Logger {
  private level: LogLevel = 'INFO';
  private context: LogContext = {};
  private enabled = true;
  private telemetryCollector: TelemetryCollectorLike | null = null;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Wire a TelemetryCollector for remote log aggregation.
   * WARN and ERROR level logs will be forwarded as SDK events.
   * Pass null to disconnect.
   */
  setTelemetryCollector(collector: TelemetryCollectorLike | null): void {
    this.telemetryCollector = collector;
  }

  /** Create a child logger with additional context */
  child(context: LogContext): Logger {
    const child = new Logger();
    child.level = this.level;
    child.context = { ...this.context, ...context };
    child.enabled = this.enabled;
    child.telemetryCollector = this.telemetryCollector;
    return child;
  }

  debug(message: string, context?: LogContext): void {
    this.log('DEBUG', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('INFO', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('WARN', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('ERROR', message, context);
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.enabled) return;
    if (LOG_LEVELS[level] < LOG_LEVELS[this.level]) return;

    const mergedContext = context ? { ...this.context, ...context } : this.context;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: mergedContext,
    };

    // Console output (always)
    switch (level) {
      case 'ERROR':
        // eslint-disable-next-line no-console
        console.error(JSON.stringify(entry));
        break;
      case 'WARN':
        // eslint-disable-next-line no-console
        console.warn(JSON.stringify(entry));
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(entry));
    }

    // Forward WARN/ERROR to telemetry for remote aggregation
    if (LOG_LEVELS[level] >= TELEMETRY_FORWARD_LEVEL && this.telemetryCollector) {
      this.telemetryCollector.track({
        type: 'log_event',
        timestamp: Date.now(),
        tenantId: (mergedContext.tenantId as string) ?? 'system',
        userId: 'system',
        moduleId: mergedContext.moduleId as string | undefined,
        data: {
          level,
          message,
          ...mergedContext,
        },
      });
    }
  }
}

/** Global SDK logger instance */
export const logger = new Logger();

export { Logger };
export type { TelemetryCollectorLike };
