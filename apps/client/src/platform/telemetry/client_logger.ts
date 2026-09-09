import type { ILogger, LogContext, LogLevel } from './telemetry.interface';

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
  none: 5,
};

export const SENSITIVE_KEY_REGEX =
  /password|token|sessionToken|secret|key|authorization|bearer|cookie|apiKey|credential/i;

/**
 * Recursively scrubs sensitive values from objects and arrays with circular reference protection.
 */
function sanitizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (seen.has(value)) {
    return '[CIRCULAR]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_REGEX.test(k)) {
      sanitized[k] = '[REDACTED]';
    } else {
      sanitized[k] = sanitizeValue(v, seen);
    }
  }
  return sanitized;
}

/**
 * Scrubs sensitive values such as tokens or passwords from logged objects.
 */
function sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(context) as Record<string, unknown>;
}

export class ClientLogger implements ILogger {
  private level: LogLevel;
  private readonly baseContext: LogContext;

  constructor(level: LogLevel = 'info', baseContext: LogContext = {}) {
    this.level = level;
    this.baseContext = { ...baseContext };
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_SEVERITY[level] >= LOG_LEVEL_SEVERITY[this.level];
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) return;

    const merged = sanitizeContext({
      ...this.baseContext,
      ...(context ?? {}),
      timestamp: Date.now(),
      level,
    });

    const prefix = `[FC_${level.toUpperCase()}]`;

    switch (level) {
      case 'debug': {
        const dbgFn = typeof console['debug'] === 'function' ? console['debug'] : console.info;
        dbgFn(prefix, message, merged);
        break;
      }
      case 'info':
        // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
        console.info(prefix, message, merged);
        break;
      case 'warn':
        // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
        console.warn(prefix, message, merged);
        break;
      case 'error':
      case 'fatal':
        // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
        console.error(prefix, message, merged);
        break;
    }
  }

  public debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  public error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  public fatal(message: string, context?: LogContext): void {
    this.log('fatal', message, context);
  }

  public child(childContext: LogContext): ILogger {
    return new ClientLogger(this.level, {
      ...this.baseContext,
      ...childContext,
    });
  }
}

export const logger = new ClientLogger();
