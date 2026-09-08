import type { IncomingMessage } from "node:http";

export interface SocketLikeWithHandshake {
  handshake?: {
    headers?: Record<string, string | string[] | undefined>;
    address?: string;
  };
  conn?: {
    remoteAddress?: string;
  };
}

/**
 * Normalizes an IP address:
 * - Strips IPv4-mapped IPv6 prefix `::ffff:` (ENH-001)
 * - Normalizes `::1` or localhost fallbacks
 * - Trims whitespace
 */
export function normalizeIp(rawIp: string | undefined): string {
  if (!rawIp || typeof rawIp !== "string") return "127.0.0.1";
  let trimmed = rawIp.trim();
  if (trimmed.startsWith("::ffff:")) {
    trimmed = trimmed.slice(7);
  }
  return trimmed || "127.0.0.1";
}

/**
 * Extracts and normalizes client IP address from an HTTP request or Socket.IO handshake (MIN-020).
 * When trustProxy is true, evaluates `x-forwarded-for` header, taking the RIGHTMOST IP before proxy
 * to prevent rate limiting bypass and IP spoofing (ENH-002, CRIT-006).
 * Strips IPv4-mapped IPv6 prefix (`::ffff:`) (ENH-001).
 * When trustProxy is false, ignores `x-forwarded-for` to prevent client spoofing (CRIT-001).
 */
export function extractClientIp(
  source: IncomingMessage | SocketLikeWithHandshake | unknown,
  trustProxy = false,
): string {
  if (!source || typeof source !== "object") return "127.0.0.1";

  const req = source as IncomingMessage;
  const socket = source as SocketLikeWithHandshake;

  const headers = req.headers || socket.handshake?.headers;

  if (trustProxy && headers) {
    const rawForwarded = headers["x-forwarded-for"];
    const forwarded = Array.isArray(rawForwarded)
      ? rawForwarded.join(",")
      : rawForwarded;

    if (typeof forwarded === "string" && forwarded.trim()) {
      const parts = forwarded.split(",");
      const rightmost = parts[parts.length - 1]?.trim();
      if (rightmost) {
        return normalizeIp(rightmost);
      }
    }
  }

  const directAddress =
    req.socket?.remoteAddress ||
    socket.handshake?.address ||
    socket.conn?.remoteAddress;

  return normalizeIp(directAddress);
}
