import pino, { Logger as PinoInstance, LoggerOptions } from 'pino';
import { Logger } from './logger.interface.js';

export interface PinoLoggerOptions extends LoggerOptions {
  isDev?: boolean;
}

/**
 * Production-ready Pino logger implementing the application Logger interface.
 * Serializes structured context fields including correlationId, durationMs, and error objects.
 */
export class PinoLogger implements Logger {
  private readonly logger: PinoInstance;

  constructor(options?: PinoLoggerOptions | PinoInstance) {
    if (options && typeof (options as PinoInstance).info === 'function') {
      this.logger = options as PinoInstance;
    } else {
      const opts = (options as PinoLoggerOptions) || {};
      const level = opts.level || (process.env.LOG_LEVEL ?? 'info');
      this.logger = pino({
        level,
        ...opts,
      });
    }
  }

  public info(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.logger.info(context, message);
    } else {
      this.logger.info(message);
    }
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.logger.warn(context, message);
    } else {
      this.logger.warn(message);
    }
  }

  public error(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.logger.error(context, message);
    } else {
      this.logger.error(message);
    }
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.logger.debug(context, message);
    } else {
      this.logger.debug(message);
    }
  }

  public child(bindings: Record<string, unknown>): Logger {
    return new PinoLogger(this.logger.child(bindings));
  }
}
