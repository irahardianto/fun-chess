import pino, { Logger as PinoInstance, LoggerOptions } from "pino";
import { Logger } from "./logger.interface.js";

export interface PinoLoggerOptions extends LoggerOptions {
  isDev?: boolean;
  stream?: pino.DestinationStream | NodeJS.WritableStream;
}

/**
 * Authoritative default redact paths for Pino structured logging (SEC-01, ENH-009).
 *
 * Security Rationale and Pattern Documentation:
 * 1. Wildcard Redactions for Credentials, Secrets, and Tokens (`*.sessionToken`, `*.password`, `*.secret`, `*.token`, `*.authorization`):
 *    In modern distributed and layered architectures, logging context objects can nest domain
 *    entities, authentication payloads, error objects, and request/response representations
 *    at arbitrary depths (e.g. `auth.sessionToken`, `user.credentials.password`, `api.secret`).
 *    Single wildcards (`*.pattern`) and multi-level wildcards (`*.*.pattern`) instruct Pino's
 *    fast-redact engine to scan beyond root keys and sanitize sensitive fields wherever they appear
 *    in the object graph, satisfying the Rugged Software Mandate ("never log credentials or tokens").
 *
 * 2. The `key` and `apiKey` Redaction Pattern:
 *    The identifier `key` is frequently used for cryptographic keys, HMAC signing keys, and API keys,
 *    but can occasionally appear in generic mapping contexts. To prevent credentials from leaking
 *    while maintaining predictability, exact matches (`"key"`, `"apiKey"`) and nested wildcards
 *    (`"*.key"`, `"*.*.key"`, `"*.apiKey"`) are explicitly registered to redact secrets like private
 *    keys or API tokens if logged in service configs or handshake objects.
 *
 * 3. Nested HTTP Headers & Telemetry Secrets (`headers.authorization`, `*.req.headers.authorization`, `*.req.headers['x-metrics-secret']`):
 *    Incoming HTTP request representations or error contexts containing `req` or `headers` may
 *    harbor sensitive authorization tokens or telemetry probe keys (`x-metrics-secret`).
 *    Explicit bracketed and dot-notated paths ensure that both root-level `headers` and nested
 *    `req.headers` (e.g. inside error objects or audit logs) have their authorization headers and
 *    shared secret tokens redacted.
 */
export const DEFAULT_REDACT_PATHS: string[] = [
  // Session tokens (camelCase & snake_case, root and nested)
  "sessionToken",
  "*.sessionToken",
  "*.*.sessionToken",
  "session_token",
  "*.session_token",
  "*.*.session_token",

  // Passwords
  "password",
  "*.password",
  "*.*.password",

  // Tokens (JWTs, CSRF tokens, bearer tokens)
  "token",
  "*.token",
  "*.*.token",

  // Secrets and cryptographic credentials
  "secret",
  "*.secret",
  "*.*.secret",

  // Authorization headers and Bearer strings
  "authorization",
  "*.authorization",
  "*.*.authorization",
  "bearer",
  "*.bearer",
  "*.*.bearer",

  // Credentials
  "credential",
  "*.credential",
  "*.*.credential",
  "credentials",
  "*.credentials",
  "*.*.credentials",

  // Keys (API keys, private keys, signing keys)
  "key",
  "*.key",
  "*.*.key",
  "apiKey",
  "*.apiKey",
  "*.*.apiKey",

  // Cookies and session identifiers
  "cookie",
  "*.cookie",
  "*.*.cookie",
  "headers.cookie",
  "*.headers.cookie",

  // HTTP Request headers (authorization & telemetry secret guards)
  "headers.authorization",
  "*.headers.authorization",
  "req.headers.authorization",
  "*.req.headers.authorization",
  "*.*.req.headers.authorization",
  "headers['x-metrics-secret']",
  "*.headers['x-metrics-secret']",
  "req.headers['x-metrics-secret']",
  "*.req.headers['x-metrics-secret']",
  "*.*.req.headers['x-metrics-secret']",
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
      type PinoFactory = (
        options?: LoggerOptions,
        destination?: pino.DestinationStream | NodeJS.WritableStream,
      ) => PinoInstance;
      const pinoFn = (
        typeof pino === "function"
          ? pino
          : (pino as unknown as { default: PinoFactory }).default
      ) as unknown as PinoFactory;
      const stream = (opts as { stream?: pino.DestinationStream }).stream;
      const pinoConfig = {
        level,
        redact: {
          paths: DEFAULT_REDACT_PATHS,
          censor: "[REDACTED]",
        },
        ...opts,
      };
      this.logger = stream
        ? pinoFn(pinoConfig, stream)
        : pinoFn(pinoConfig);
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

export const defaultLogger: Logger = new PinoLogger();
export const logger: Logger = defaultLogger;
