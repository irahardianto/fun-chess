import crypto from "node:crypto";

/**
 * Canonical RFC 4122 UUID regex (accepts standard 36-character UUID strings).
 */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Strict RFC 4122 UUID v4 regex.
 */
export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 64-character lowercase hex regex.
 */
const HEX_64_REGEX = /^[0-9a-f]{64}$/;

export interface SessionTokenResult {
  token: string;
  uuid: string;
}

export interface SessionTokenVerification {
  valid: boolean;
  uuid?: string;
  reason?: "invalid_format" | "invalid_signature" | "missing_secret";
}

/**
 * Derives a 32-byte cryptographic signing key from an arbitrary session secret string
 * using SHA-256 digest per .agentwork/api_contracts.md Section 3.2.
 */
export function deriveSessionKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret, "utf-8").digest();
}

/**
 * Generates a cryptographically signed session token with format `<uuid>.<signature>`.
 * The signature is an HMAC-SHA256 computed over the UUID using the derived session key.
 *
 * @param uuid - Valid RFC 4122 UUID v4 string
 * @param sessionSecret - Secret key used for HMAC signing
 * @returns 101-character dot-delimited signed session token
 */
export function generateSessionToken(uuid: string, sessionSecret: string): string {
  if (!sessionSecret || typeof sessionSecret !== "string") {
    throw new Error("Cannot sign session token: sessionSecret is required");
  }

  if (!uuid || typeof uuid !== "string" || !UUID_REGEX.test(uuid)) {
    throw new Error("Cannot sign session token: uuid must be a valid RFC 4122 UUID v4");
  }

  const signingKey = deriveSessionKey(sessionSecret);
  const signature = crypto.createHmac("sha256", signingKey).update(uuid).digest("hex");

  return `${uuid}.${signature}`;
}

/**
 * Alias for generateSessionToken to satisfy database contracts specification.
 */
export function signSessionToken(sessionId: string, secret: string): string {
  return generateSessionToken(sessionId, secret);
}

/**
 * Validates a session token signature using timing-safe comparison.
 * Supports backward compatibility for legacy unsigned UUID tokens when allowUnsignedInDev is enabled.
 *
 * @param token - Candidate token string
 * @param sessionSecret - Secret key used for signature verification
 * @param options - Optional verification parameters
 * @returns Verification result with validity status and extracted UUID or rejection reason
 */
export function verifySessionToken(
  token: string,
  sessionSecret: string,
  options?: { allowUnsignedInDev?: boolean },
): SessionTokenVerification {
  if (!sessionSecret || typeof sessionSecret !== "string") {
    return { valid: false, reason: "missing_secret" };
  }

  if (!token || typeof token !== "string") {
    return { valid: false, reason: "invalid_format" };
  }

  // Backward compatibility: allow raw unsigned UUID in dev/test if explicitly requested
  if (options?.allowUnsignedInDev && !token.includes(".") && UUID_REGEX.test(token)) {
    return { valid: true, uuid: token };
  }

  const parsed = parseSessionToken(token);
  if (!parsed || !UUID_REGEX.test(parsed.sessionId)) {
    return { valid: false, reason: "invalid_format" };
  }

  const { sessionId: uuid, signature } = parsed;

  const signingKey = deriveSessionKey(sessionSecret);
  const expectedSignature = crypto.createHmac("sha256", signingKey).update(uuid).digest("hex");

  const sigBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, reason: "invalid_signature" };
  }

  return { valid: true, uuid };
}

/**
 * Convenience helper returning boolean validity for session tokens.
 */
export function isValidSessionToken(
  token: string,
  secret: string,
  options?: { allowUnsignedInDev?: boolean },
): boolean {
  return verifySessionToken(token, secret, options).valid;
}

/**
 * Parses a signed session token into its constituent parts, or returns null if malformed.
 */
export function parseSessionToken(
  token: string,
): { sessionId: string; signature: string } | null {
  if (!token || typeof token !== "string") return null;
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return null;

  const sessionId = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  if (!sessionId || !signature || signature.length !== 64 || !HEX_64_REGEX.test(signature)) {
    return null;
  }

  return { sessionId, signature };
}

/**
 * Redacts raw session token for logging per .agentwork/api_contracts.md Section 3.5.
 */
export function maskToken(token: string): string {
  if (!token || typeof token !== "string") return "[REDACTED]";
  if (token.length <= 12) return "[REDACTED]";
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

/**
 * Redacts raw session token for logging (alias for maskToken).
 */
export function maskSessionToken(token: string): string {
  return maskToken(token);
}

/**
 * Computes a non-reversible truncated SHA-256 fingerprint for logging session tokens without leaking credentials (CRIT-002).
 */
export function tokenFingerprint(token: string): string {
  if (!token || typeof token !== "string") return "";
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 10);
}
