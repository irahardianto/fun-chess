import { Logger } from "./logger.interface.js";

export interface LogEntry {
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
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
  public traceLogs: LogEntry[] = [];
  public debugLogs: LogEntry[] = [];
  public infoLogs: LogEntry[] = [];
  public warnLogs: LogEntry[] = [];
  public errorLogs: LogEntry[] = [];
  public fatalLogs: LogEntry[] = [];

  constructor(private readonly bindings: Record<string, unknown> = {}) {}

  public trace(message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: "trace",
      message,
      context: { ...this.bindings, ...context },
      timestamp: Date.now(),
    };
    this.logs.push(entry);
    this.traceLogs.push(entry);
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: "debug",
      message,
      context: { ...this.bindings, ...context },
      timestamp: Date.now(),
    };
    this.logs.push(entry);
    this.debugLogs.push(entry);
  }

  public info(message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: "info",
      message,
      context: { ...this.bindings, ...context },
      timestamp: Date.now(),
    };
    this.logs.push(entry);
    this.infoLogs.push(entry);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: "warn",
      message,
      context: { ...this.bindings, ...context },
      timestamp: Date.now(),
    };
    this.logs.push(entry);
    this.warnLogs.push(entry);
  }

  public error(message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: "error",
      message,
      context: { ...this.bindings, ...context },
      timestamp: Date.now(),
    };
    this.logs.push(entry);
    this.errorLogs.push(entry);
  }

  public fatal(message: string, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level: "fatal",
      message,
      context: { ...this.bindings, ...context },
      timestamp: Date.now(),
    };
    this.logs.push(entry);
    this.fatalLogs.push(entry);
  }

  public child(bindings: Record<string, unknown>): Logger {
    const childLogger = new NullLogger({ ...this.bindings, ...bindings });
    return childLogger;
  }

  public clear(): void {
    this.logs = [];
    this.traceLogs = [];
    this.debugLogs = [];
    this.infoLogs = [];
    this.warnLogs = [];
    this.errorLogs = [];
    this.fatalLogs = [];
  }
}
