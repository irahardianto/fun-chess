import { z } from "zod";
import { ServerEnvSchema as BaseServerEnvSchema, serializeError } from "@fun-chess/shared";

const emptyStringToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

export interface LoggerLike {
  debug(msg: string, context?: Record<string, unknown>): void;
}

/**
 * Safely parses and normalizes a URL string.
 * If protocol is missing, prepends https:// (or http:// for localhost/127.0.0.1).
 * Returns URL object if valid, or undefined if invalid (MAJ-006).
 */
export function safeParseUrl(
  input: string | undefined,
  logger?: LoggerLike,
): URL | undefined {
  if (!input || typeof input !== "string") return undefined;
  let trimmed = input.trim();
  if (!trimmed) return undefined;

  // Handle protocol-relative URL
  if (trimmed.startsWith("//")) {
    trimmed = `https:${trimmed}`;
  } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    // Missing protocol: use http for local hosts, https for remote
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(trimmed);
    trimmed = `${isLocal ? "http://" : "https://"}${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    // Ensure hostname is present and valid
    if (!parsed.hostname) {
      if (logger && typeof logger.debug === "function") {
        logger.debug("safeParseUrl rejected URL: missing hostname", {
          operation: "safe_parse_url",
          input,
          trimmed,
        });
      }
      return undefined;
    }
    return parsed;
  } catch (err: unknown) {
    if (logger && typeof logger.debug === "function") {
      logger.debug("safeParseUrl rejected invalid URL", {
        operation: "safe_parse_url",
        input,
        trimmed,
        error: serializeError(err),
      });
    }
    return undefined;
  }
}

export const ServerEnvSchema = BaseServerEnvSchema.extend({
  CLIENT_DIST_PATH: z.preprocess(
    emptyStringToUndefined,
    z.string().optional(),
  ),
  TRUST_PROXY: z.preprocess((val) => {
    if (typeof val === "boolean") return val;
    if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
    return false;
  }, z.boolean().default(false)),
  CLIENT_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().optional(),
  ),
  RATE_LIMIT_WINDOW_MS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  RATE_LIMIT_MAX_REQUESTS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  RATE_LIMIT_MAX_KEYS: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  RATE_LIMIT_ROOM_CREATE_MAX: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().default(3),
  ),
  SESSION_SECRET: z.preprocess(
    emptyStringToUndefined,
    z.string().min(16, "SESSION_SECRET must contain at least 16 characters.").optional(),
  ),
  METRICS_SECRET: z.preprocess(
    emptyStringToUndefined,
    z.string().min(8, "METRICS_SECRET must contain at least 8 characters.").optional(),
  ),
  CSP_REPORT_URI: z.preprocess(
    emptyStringToUndefined,
    z.string().optional(),
  ),
}).superRefine((val, ctx) => {
  if (val.NODE_ENV === "production") {
    if (!val.METRICS_SECRET) {
      process.stderr.write(
        JSON.stringify({
          level: "warn",
          operation: "env_validation",
          warning: "METRICS_SECRET_MISSING",
          message:
            "WARNING: METRICS_SECRET is not configured in production mode (MIN-002). " +
            "Telemetry endpoints (/metrics, /health/detail) will deny all non-loopback requests.",
        }) + "\n",
      );
    }
    if (!val.SESSION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET must be configured in production mode (MAJ-004).",
      });
    }
    if (!val.CORS_ORIGIN && !val.PUBLIC_URL && !val.CLIENT_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message: "Either CORS_ORIGIN, PUBLIC_URL, or CLIENT_URL must be configured in production mode.",
      });
    }
    if (val.PUBLIC_URL) {
      const parsed = safeParseUrl(val.PUBLIC_URL);
      if (!parsed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PUBLIC_URL"],
          message: "PUBLIC_URL must be a valid URL.",
        });
      }
    }
  }
  if (val.CORS_ORIGIN) {
    const origins = val.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
    for (const origin of origins) {
      if (origin === "*") {
        if (val.NODE_ENV === "production") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["CORS_ORIGIN"],
            message: "Wildcard CORS_ORIGIN '*' is forbidden in production mode.",
          });
        }
      } else {
        const parsed = safeParseUrl(origin);
        if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["CORS_ORIGIN"],
            message: `CORS_ORIGIN contains invalid origin URL: '${origin}'.`,
          });
        }
      }
    }
  }
  if (val.CLIENT_URL) {
    const parsed = safeParseUrl(val.CLIENT_URL);
    if (!parsed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CLIENT_URL"],
        message: "CLIENT_URL must be a valid URL.",
      });
    }
  }
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Resolves allowed CORS origins strictly from the provided environment configuration.
 * Normalizes origins using new URL().origin, stripping default ports and trailing slashes (MIN-002, MIN-003).
 * Safely parses CLIENT_URL and PUBLIC_URL without uncaught exceptions (CRIT-003).
 * Enforces that production environments provide an explicit CORS_ORIGIN or PUBLIC_URL.
 */
export function resolveAllowedOrigins(env?: Partial<ServerEnv>): string[] {
  const nodeEnv = env?.NODE_ENV ?? "development";
  const corsOrigin = env?.CORS_ORIGIN;
  const clientUrl = env?.CLIENT_URL;
  const publicUrl = env?.PUBLIC_URL;

  if (corsOrigin) {
    return corsOrigin
      .split(",")
      .map((o) => {
        const trimmed = o.trim();
        if (trimmed === "*") return "*";
        const parsed = safeParseUrl(trimmed);
        if (parsed) {
          return parsed.origin.replace(/\/+$/, "");
        }
        return trimmed.replace(/\/+$/, "");
      })
      .filter(Boolean);
  }
  const origins = new Set<string>();
  if (clientUrl) {
    const parsed = safeParseUrl(clientUrl);
    if (parsed) {
      origins.add(parsed.origin.replace(/\/+$/, ""));
    }
  }
  if (publicUrl) {
    const parsed = safeParseUrl(publicUrl);
    if (parsed) {
      origins.add(parsed.origin.replace(/\/+$/, ""));
    }
  }
  if (origins.size > 0) {
    return Array.from(origins);
  }
  if (nodeEnv === "production") {
    throw new Error("FATAL: CORS_ORIGIN, PUBLIC_URL, or CLIENT_URL must be configured in production mode.");
  }
  // Safe development fallbacks
  return ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000"];
}

/**
 * Checks whether an incoming origin header is allowed by the configured origin allowlist.
 * Normalizes origins using new URL().origin to handle default ports (e.g. :443, :80) (MIN-002).
 *
 * Origin Policy Rationale (MIN-004):
 * Requests without an Origin header (undefined) are permitted because they represent
 * same-origin browser navigations, server-to-server calls, or non-browser HTTP clients
 * (e.g. curl, container health probes) that do not enforce or send CORS headers.
 * Cross-origin browser requests will always attach an Origin header.
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return true; // Same-origin navigation or non-browser client (see rationale above)
  if (allowedOrigins.includes("*")) return true;

  const parsedOrigin = safeParseUrl(origin);
  const normalizedOrigin = (parsedOrigin ? parsedOrigin.origin : origin.trim().replace(/\/+$/, "")).toLowerCase();

  return allowedOrigins.some((allowed) => {
    if (allowed === "*") return true;
    const parsedAllowed = safeParseUrl(allowed);
    const normalizedAllowed = (parsedAllowed ? parsedAllowed.origin : allowed.trim().replace(/\/+$/, "")).toLowerCase();
    return normalizedAllowed === normalizedOrigin;
  });
}

/**
 * Centralized, fail-fast server configuration loader.
 * Parses raw environment variables with ServerEnvSchema and halts on validation failure.
 */
export function loadServerConfig(rawEnv: Record<string, unknown> = process.env): ServerEnv {
  const result = ServerEnvSchema.safeParse(rawEnv);
  if (!result.success) {
    const errorMessages = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Server configuration validation failed:\n${errorMessages}`);
  }
  return result.data;
}

export const validateServerConfig = loadServerConfig;

let cachedEnv: ServerEnv | undefined;

/**
 * Resets the cached environment configuration proxy state (for testing).
 */
export function resetCachedEnv(): void {
  cachedEnv = undefined;
}

/**
 * Returns the validated server environment configuration (MIN-021).
 */
export function getServerEnv(): ServerEnv {
  if (!cachedEnv) {
    cachedEnv = loadServerConfig();
  }
  return cachedEnv;
}

/**
 * Lazy proxy to server environment configuration.
 * Avoids throwing at import-time when configuration is not yet available (CRIT-003).
 * Implements proxy reflection traps (get, has, ownKeys, getOwnPropertyDescriptor)
 * so Object.keys(env) and property reflection function correctly (MIN-021).
 */
export const env: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: string | symbol) {
    const current = getServerEnv();
    return (current as unknown as Record<string | symbol, unknown>)[prop];
  },
  has(_target, prop: string | symbol) {
    const current = getServerEnv();
    return prop in current;
  },
  ownKeys(_target) {
    const current = getServerEnv();
    return Reflect.ownKeys(current);
  },
  getOwnPropertyDescriptor(_target, prop: string | symbol) {
    const current = getServerEnv();
    const descriptor = Object.getOwnPropertyDescriptor(current, prop);
    if (descriptor) {
      return {
        ...descriptor,
        configurable: true,
      };
    }
    return undefined;
  },
});
