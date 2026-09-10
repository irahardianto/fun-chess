export const SENSITIVE_EXACT_KEYS: ReadonlySet<string> = new Set([
  "sessiontoken",
  "session_token",
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "key",
  "apikey",
  "api_key",
  "bearer",
  "credential",
  "credentials",
]);

export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  if (SENSITIVE_EXACT_KEYS.has(lower)) {
    return true;
  }
  const clean = lower.replace(/[-_]/g, "");
  return (
    clean.includes("sessiontoken") ||
    clean.includes("password") ||
    clean.includes("secret") ||
    clean.includes("authorization") ||
    clean.includes("cookie") ||
    clean.includes("credential") ||
    clean.includes("bearer") ||
    clean === "token" ||
    clean.endsWith("token") ||
    clean === "key" ||
    clean.endsWith("key")
  );
}

/**
 * Deeply redacts sensitive fields from payloads before logging (MIN-012).
 * Covers sessionToken, password, token, secret, authorization, cookie, key.
 * Handles circular references safely using WeakSet.
 */
export function sanitizePayload<T>(data: T, seen = new WeakSet<object>()): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data !== "object") {
    return data;
  }
  if (seen.has(data as object)) {
    return "[CIRCULAR]" as unknown as T;
  }
  seen.add(data as object);

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePayload(item, seen)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizePayload(value, seen);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}
