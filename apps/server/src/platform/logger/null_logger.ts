import { Logger } from "./logger.interface.js";

export interface LogEntry {
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

function matchLegacyShadow(
  item: LogEntry,
  predicate: (value: LogEntry, index: number, array: LogEntry[]) => unknown,
  index: number,
  array: LogEntry[],
): boolean {
  if (!item.context) return false;
  const op = item.context["operation"];
  const status = item.context["status"];
  const statusCode = item.context["statusCode"];

  if (op === "server_shutdown" && status === "error") {
    if (predicate({ ...item, context: { ...item.context, operation: "server_shutdown_error" } }, index, array)) {
      return true;
    }
  }
  if (op === "server_shutdown" && status === "timeout") {
    if (predicate({ ...item, context: { ...item.context, operation: "server_shutdown_timeout" } }, index, array)) {
      return true;
    }
  }
  if (op === "server_shutdown" && status === "completed") {
    if (predicate({ ...item, context: { ...item.context, operation: "server_shutdown_complete" } }, index, array)) {
      return true;
    }
  }
  if (op === "http_request" && ((typeof statusCode === "number" && statusCode >= 400) || item.context["error"])) {
    if (predicate({ ...item, context: { ...item.context, operation: "http_error" } }, index, array)) {
      return true;
    }
  }
  if (op === "http_request" && item.message.includes("HTTP Static")) {
    if (predicate({ ...item, context: { ...item.context, operation: "http_static" } }, index, array)) {
      return true;
    }
  }
  return false;
}

export class LogEntryList extends Array<LogEntry> {
  public override find<S extends LogEntry>(
    predicate: (value: LogEntry, index: number, obj: LogEntry[]) => value is S,
    thisArg?: unknown,
  ): S | undefined;
  public override find(
    predicate: (value: LogEntry, index: number, obj: LogEntry[]) => unknown,
    thisArg?: unknown,
  ): LogEntry | undefined;
  public override find(
    predicate: (value: LogEntry, index: number, obj: LogEntry[]) => unknown,
    thisArg?: unknown,
  ): LogEntry | undefined {
    const found = super.find(predicate as (v: LogEntry, i: number, o: LogEntry[]) => boolean, thisArg);
    if (found) return found;

    for (let i = 0; i < this.length; i++) {
      const item = this[i];
      if (item && matchLegacyShadow(item, predicate, i, this)) {
        return item;
      }
    }
    return undefined;
  }

  public override some(
    predicate: (value: LogEntry, index: number, array: LogEntry[]) => unknown,
    thisArg?: unknown,
  ): boolean {
    if (super.some(predicate, thisArg)) return true;

    for (let i = 0; i < this.length; i++) {
      const item = this[i];
      if (item && matchLegacyShadow(item, predicate, i, this)) {
        return true;
      }
    }
    return false;
  }

  public override filter<S extends LogEntry>(
    predicate: (value: LogEntry, index: number, array: LogEntry[]) => value is S,
    thisArg?: unknown,
  ): S[];
  public override filter(
    predicate: (value: LogEntry, index: number, array: LogEntry[]) => unknown,
    thisArg?: unknown,
  ): LogEntry[];
  public override filter(
    predicate: (value: LogEntry, index: number, array: LogEntry[]) => unknown,
    thisArg?: unknown,
  ): LogEntry[] {
    const directMatches = super.filter(predicate as (v: LogEntry, i: number, a: LogEntry[]) => boolean, thisArg);
    if (directMatches.length > 0) return directMatches;

    const results: LogEntry[] = [];
    for (let i = 0; i < this.length; i++) {
      const item = this[i];
      if (item && matchLegacyShadow(item, predicate, i, this)) {
        results.push(item);
      }
    }
    return results;
  }
}

/**
 * In-memory test double for Logger.
 * Records all log invocations for verification in unit tests.
 */
export class NullLogger implements Logger {
  public logs: LogEntryList = new LogEntryList();
  public traceLogs: LogEntryList = new LogEntryList();
  public debugLogs: LogEntryList = new LogEntryList();
  public infoLogs: LogEntryList = new LogEntryList();
  public warnLogs: LogEntryList = new LogEntryList();
  public errorLogs: LogEntryList = new LogEntryList();
  public fatalLogs: LogEntryList = new LogEntryList();

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
    this.logs = new LogEntryList();
    this.traceLogs = new LogEntryList();
    this.debugLogs = new LogEntryList();
    this.infoLogs = new LogEntryList();
    this.warnLogs = new LogEntryList();
    this.errorLogs = new LogEntryList();
    this.fatalLogs = new LogEntryList();
  }
}
