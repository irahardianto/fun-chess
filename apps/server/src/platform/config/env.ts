import { z } from "zod";

const emptyStringToUndefined = (val: unknown): unknown =>
  typeof val === "string" && val.trim() === "" ? undefined : val;

export const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(0, "Port must be >= 0").max(65535, "Port must be <= 65535").default(3000),
  ),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGIN: z.preprocess(emptyStringToUndefined, z.string().optional()),
  PUBLIC_URL: z.preprocess(emptyStringToUndefined, z.string().url("PUBLIC_URL must be a valid URL").optional()),
  LAN_IP: z.preprocess(emptyStringToUndefined, z.string().ip("LAN_IP must be a valid IP address").optional()),
  HOST_IP: z.preprocess(emptyStringToUndefined, z.string().ip("HOST_IP must be a valid IP address").optional()),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Resolves allowed CORS origins from the environment configuration.
 * Enforces that production environments provide an explicit CORS_ORIGIN or PUBLIC_URL.
 */
export function resolveAllowedOrigins(env?: Partial<ServerEnv>): string[] {
  const nodeEnv = env?.NODE_ENV ?? process.env.NODE_ENV ?? "development";
  const corsOrigin = env?.CORS_ORIGIN ?? process.env.CORS_ORIGIN;
  const publicUrl = env?.PUBLIC_URL ?? process.env.PUBLIC_URL;

  if (corsOrigin) {
    return corsOrigin
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
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
