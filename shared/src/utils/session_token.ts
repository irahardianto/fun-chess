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

/**
 * Result structure returned when generating a session token.
 */
export interface SessionTokenResult {
  token: string;
  uuid: string;
  expiresAt?: number;
}

/**
 * Result structure returned from session token verification.
 */
export interface SessionTokenVerification {
  valid: boolean;
  uuid?: string;
  expiresAt?: number;
  reason?: "invalid_format" | "invalid_signature" | "missing_secret" | "expired";
}

/**
 * Options accepted when generating a session token.
 */
export interface SessionTokenOptions {
  /** Optional epoch timestamp in milliseconds at which the token expires */
  expiresAt?: number;
}

/**
 * Options accepted when verifying a session token.
 */
export interface VerifySessionTokenOptions {
  /** Allow raw unsigned UUID in dev/test environments */
  allowUnsignedInDev?: boolean;
  /** Explicit reference time in milliseconds for expiry evaluation (defaults to Date.now()) */
  now?: number;
}

/**
 * Parsed components of a signed session token.
 */
export interface ParsedSessionToken {
  sessionId: string;
  signature: string;
  expiresAt?: number;
}

/**
 * Derives a 32-byte cryptographic signing key from an arbitrary session secret string
 * using SHA-256 digest per .agentwork/api_contracts.md Section 3.2.
 *
 * @param secret - Raw session secret string
 * @returns 32-byte Buffer representing derived cryptographic key
 */
export function deriveSessionKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret, "utf-8").digest();
}

/**
 * Generates a cryptographically signed session token.
 * Formats:
 * - Legacy / standard: `<uuid>.<signature>`
 * - With expiration (ENH-002): `<uuid>.<expiresAt>.<signature>`
 *
 * The signature is an HMAC-SHA256 computed over the preimage (`<uuid>` or `<uuid>.<expiresAt>`)
 * using the derived session key.
 *
 * @param uuid - Valid RFC 4122 UUID v4 string
 * @param sessionSecret - Secret key used for HMAC signing
 * @param options - Optional expiration timestamp or configuration object
 * @returns Dot-delimited signed session token string
 */
export function generateSessionToken(
  uuid: string,
  sessionSecret: string,
  options?: SessionTokenOptions | number,
): string {
  if (!sessionSecret || typeof sessionSecret !== "string") {
    throw new Error("Cannot sign session token: sessionSecret is required");
  }

  if (!uuid || typeof uuid !== "string" || !UUID_REGEX.test(uuid)) {
    throw new Error("Cannot sign session token: uuid must be a valid RFC 4122 UUID v4");
  }

  let expiresAt: number | undefined;
  if (typeof options === "number") {
    expiresAt = options;
  } else if (options && typeof options === "object") {
    expiresAt = options.expiresAt;
  }

  if (expiresAt !== undefined) {
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
      throw new Error("Cannot sign session token: expiresAt must be a positive integer timestamp");
    }
  }

  const signingKey = deriveSessionKey(sessionSecret);
  const preimage = expiresAt !== undefined ? `${uuid}.${expiresAt}` : uuid;
  const signature = crypto.createHmac("sha256", signingKey).update(preimage).digest("hex");

  return expiresAt !== undefined
    ? `${uuid}.${expiresAt}.${signature}`
    : `${uuid}.${signature}`;
}

/**
 * Alias for generateSessionToken to satisfy database contracts specification.
 *
 * @param sessionId - Session identifier UUID
 * @param secret - Secret key used for HMAC signing
 * @param options - Optional expiration timestamp or configuration object
 * @returns Dot-delimited signed session token
 */
export function signSessionToken(
  sessionId: string,
  secret: string,
  options?: SessionTokenOptions | number,
): string {
  return generateSessionToken(sessionId, secret, options);
}

/**
 * Validates a session token signature using timing-safe comparison.
 * Supports backward compatibility for:
 * 1. 2-part tokens (`<uuid>.<signature>`)
 * 2. 3-part tokens with stateless expiration (`<uuid>.<expiresAt>.<signature>`) (ENH-002)
 * 3. Legacy unsigned UUID tokens when allowUnsignedInDev is enabled
 *
 * @param token - Candidate token string
 * @param sessionSecret - Secret key used for signature verification
 * @param options - Optional verification parameters (allowUnsignedInDev, now)
 * @returns Verification result with validity status and extracted UUID, expiresAt, or rejection reason
 */
export function verifySessionToken(
  token: string,
  sessionSecret: string,
  options?: VerifySessionTokenOptions,
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

  const { sessionId: uuid, signature, expiresAt } = parsed;

  const signingKey = deriveSessionKey(sessionSecret);
  const preimage = expiresAt !== undefined ? `${uuid}.${expiresAt}` : uuid;
  const expectedSignature = crypto.createHmac("sha256", signingKey).update(preimage).digest("hex");

  const sigBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, reason: "invalid_signature" };
  }

  if (expiresAt !== undefined) {
    const now = options?.now !== undefined ? options.now : Date.now();
    if (expiresAt <= now) {
      return { valid: false, reason: "expired", uuid, expiresAt };
    }
    return { valid: true, uuid, expiresAt };
  }

  return { valid: true, uuid };
}

/**
 * Convenience helper returning boolean validity for session tokens.
 *
 * @param token - Candidate token string
 * @param secret - Secret key used for verification
 * @param options - Optional verification options
 * @returns Boolean indicating whether token is cryptographically valid and unexpired
 */
export function isValidSessionToken(
  token: string,
  secret: string,
  options?: VerifySessionTokenOptions,
): boolean {
  return verifySessionToken(token, secret, options).valid;
}

/**
 * Parses a signed session token into its constituent parts, or returns null if malformed.
 * Supports both 2-part (`<uuid>.<signature>`) and 3-part (`<uuid>.<expiresAt>.<signature>`) tokens.
 *
 * @param token - Token string to parse
 * @returns Parsed session token object or null if malformed
 */
export function parseSessionToken(
  token: string,
): ParsedSessionToken | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length === 2) {
    const sessionId = parts[0]!;
    const signature = parts[1]!;

    if (!sessionId || signature.length !== 64 || !HEX_64_REGEX.test(signature)) {
      return null;
    }

    return { sessionId, signature };
  }

  if (parts.length === 3) {
    const sessionId = parts[0]!;
    const expiresAtStr = parts[1]!;
    const signature = parts[2]!;

    if (
      !sessionId ||
      !/^\d+$/.test(expiresAtStr) ||
      signature.length !== 64 ||
      !HEX_64_REGEX.test(signature)
    ) {
      return null;
    }

    const expiresAt = Number(expiresAtStr);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
      return null;
    }

    return { sessionId, signature, expiresAt };
  }

  return null;
}

/**
 * Redacts raw session token for logging per .agentwork/api_contracts.md Section 3.5.
 *
 * @param token - Raw session token string
 * @returns Redacted string with middle characters hidden
 */
export function maskToken(token: string): string {
  if (!token || typeof token !== "string") return "[REDACTED]";
  if (token.length <= 12) return "[REDACTED]";
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

/**
 * Redacts raw session token for logging (alias for maskToken).
 *
 * @param token - Raw session token string
 * @returns Redacted string
 */
export function maskSessionToken(token: string): string {
  return maskToken(token);
}

/**
 * Computes a non-reversible truncated SHA-256 fingerprint for logging session tokens without leaking credentials (CRIT-002).
 *
 * @param token - Raw session token string
 * @returns 10-character hex fingerprint
 */
export function tokenFingerprint(token: string): string {
  if (!token || typeof token !== "string") return "";
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 10);
}
