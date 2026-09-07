/**
 * Log level severity definitions.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

/**
 * Standard structured logging context.
 * Enforces mandatory context fields per Logging and Observability Mandate.
 */
export interface LogContext {
  /** Clear operation name (e.g. 'create_room', 'fetch_lan_info') */
  operation?: string;
  /** UUID or unique identifier for distributed request tracing */
  correlationId?: string;
  /** Operation execution duration in milliseconds */
  duration?: number;
  /** Actor or player ID triggering the operation */
  userId?: string;
  /** Error object or error details if the operation failed */
  error?: unknown;
  /** Additional domain metadata */
  [key: string]: unknown;
}

/**
 * Structured client telemetry logger interface.
 * Compatible with Dependency Injection tokens and platform abstractions.
 */
export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): ILogger;
}
