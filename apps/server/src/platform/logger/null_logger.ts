import { Logger } from './logger.interface.js';

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

/**
 * In-memory test double for Logger.
 * Records all log invocations for verification in unit tests.
 */
export class NullLogger implements Logger {
  public logs: LogEntry[] = [];
  public infoLogs: LogEntry[] = [];
  public warnLogs: LogEntry[] = [];
  public errorLogs: LogEntry[] = [];
  public debugLogs: LogEntry[] = [];

  constructor(private readonly bindings: Record<string, unknown> = {}) {}

  public info(message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: 'info',
      message,
      context: { ...this.bindings, ...context },
      timestamp: Date.now(),
    };
    this.logs.push(entry);
    this.infoLogs.push(entry);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: 'warn',
      message,
      context: { ...this.bindings, ...context },
      timestamp: Date.now(),
    };
    this.logs.push(entry);
    this.warnLogs.push(entry);
  }

  public error(message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: 'error',
      message,
      context: { ...this.bindings, ...context },
      timestamp: Date.now(),
    };
    this.logs.push(entry);
    this.errorLogs.push(entry);
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: 'debug',
      message,
      context: { ...this.bindings, ...context },
      timestamp: Date.now(),
    };
    this.logs.push(entry);
    this.debugLogs.push(entry);
  }

  public child(bindings: Record<string, unknown>): Logger {
    const childLogger = new NullLogger({ ...this.bindings, ...bindings });
    return childLogger;
  }

  public clear(): void {
    this.logs = [];
    this.infoLogs = [];
    this.warnLogs = [];
    this.errorLogs = [];
    this.debugLogs = [];
  }
}
