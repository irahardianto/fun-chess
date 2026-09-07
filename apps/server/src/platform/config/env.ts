import { z } from "zod";
import { ServerEnvSchema as BaseServerEnvSchema } from "@fun-chess/shared";

const emptyStringToUndefined = (val: unknown) =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

export const ServerEnvSchema = BaseServerEnvSchema.extend({
  TRUST_PROXY: z.preprocess((val) => {
    if (typeof val === "boolean") return val;
    if (typeof val === "string") return val.toLowerCase() === "true" || val === "1";
    return false;
  }, z.boolean().default(false)),
  CLIENT_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url("CLIENT_URL must be a valid URL").optional(),
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
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Resolves allowed CORS origins from the environment configuration.
 * Enforces that production environments provide an explicit CORS_ORIGIN or PUBLIC_URL.
 */
export function resolveAllowedOrigins(env?: Partial<ServerEnv>): string[] {
  const nodeEnv = env?.NODE_ENV ?? process.env.NODE_ENV ?? "development";
  const corsOrigin = env?.CORS_ORIGIN ?? process.env.CORS_ORIGIN;
  const clientUrl = env?.CLIENT_URL ?? process.env.CLIENT_URL;
  const publicUrl = env?.PUBLIC_URL ?? process.env.PUBLIC_URL;

  if (corsOrigin) {
    return corsOrigin
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  if (clientUrl) {
    const parsed = new URL(clientUrl);
    return [parsed.origin];
  }
  if (publicUrl) {
    const parsed = new URL(publicUrl);
    return [parsed.origin];
  }
  if (nodeEnv === "production") {
    throw new Error("FATAL: CORS_ORIGIN or PUBLIC_URL must be configured in production mode.");
  }
  // Safe development fallbacks
  return ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"];
}

/**
 * Checks whether an incoming origin header is allowed by the configured origin allowlist.
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return true; // Same-origin or non-browser/server-to-server request
  return allowedOrigins.includes("*") || allowedOrigins.includes(origin);
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
