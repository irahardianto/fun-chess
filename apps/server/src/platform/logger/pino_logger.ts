import pino, { Logger as PinoInstance, LoggerOptions } from "pino";
import { Logger } from "./logger.interface.js";

export interface PinoLoggerOptions extends LoggerOptions {
  isDev?: boolean;
}

const DEFAULT_REDACT_PATHS = [
  "sessionToken",
  "*.sessionToken",
  "*.*.sessionToken",
  "password",
  "*.password",
  "token",
  "*.token",
  "secret",
  "*.secret",
  "authorization",
  "headers.authorization",
  "headers.cookie",
  "cookie",
  "key",
  "*.key",
  "apiKey",
  "*.apiKey",
];

/**
 * Production-ready Pino logger implementing the application Logger interface.
 * Serializes structured context fields including correlationId, duration, and error objects.
 */
export class PinoLogger implements Logger {
  private readonly logger: PinoInstance;

  constructor(options?: PinoLoggerOptions | PinoInstance) {
    if (options && typeof (options as PinoInstance).info === "function") {
      this.logger = options as PinoInstance;
    } else {
      const opts = (options as PinoLoggerOptions) || {};
      const level = opts.level ?? "info";
      const pinoFn: any = (pino as any).default || pino;
      this.logger = pinoFn({
        level,
        redact: {
          paths: DEFAULT_REDACT_PATHS,
          censor: "[REDACTED]",
        },
        ...opts,
      });
    }
  }

  public trace(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.logger.trace(context, message);
    } else {
      this.logger.trace(message);
    }
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.logger.debug(context, message);
    } else {
      this.logger.debug(message);
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

  public fatal(message: string, context?: Record<string, unknown>): void {
    if (context) {
      this.logger.fatal(context, message);
    } else {
      this.logger.fatal(message);
    }
  }

  public child(bindings: Record<string, unknown>): Logger {
    return new PinoLogger(this.logger.child(bindings));
  }
}
