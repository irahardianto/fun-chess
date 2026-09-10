/**
 * URL normalization and parsing utilities.
 * Conforms to MIN-017 (eliminating triplicated URL normalization logic across modules).
 */

const LOCAL_HOST_PATTERN = /^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i;
const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

/**
 * Preprocessor function for Zod URL schemas (e.g. UrlSchema, ServerEnvSchema.PUBLIC_URL).
 * Trims whitespace, maps empty strings to undefined, and prepends protocol if omitted.
 * Leaves invalid URLs intact so downstream Zod validators can reject them.
 *
 * @param val - Input value to preprocess
 * @returns Preprocessed URL string or original value / undefined
 */
export function normalizeUrlString(val: unknown): unknown {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  if (trimmed === "") return undefined;
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (!SCHEME_PATTERN.test(trimmed)) {
    const isLocal = LOCAL_HOST_PATTERN.test(trimmed);
    return `${isLocal ? "http://" : "https://"}${trimmed}`;
  }
  return trimmed;
}

/**
 * Safely normalizes an input URL string by trimming whitespace, resolving protocol-relative URLs,
 * and prepending appropriate protocols (http:// for localhost/127.0.0.1, https:// for remote hosts).
 * Validates the normalized string against standard URL semantics.
 *
 * @param input - Candidate URL string
 * @returns Valid normalized URL string or undefined if invalid or empty
 */
export function safeNormalizeUrl(input: string | undefined | null): string | undefined {
  if (!input || typeof input !== "string") return undefined;
  const normalized = normalizeUrlString(input);
  if (!normalized || typeof normalized !== "string") return undefined;

  try {
    const parsed = new URL(normalized);
    if (!parsed.hostname) return undefined;
    return normalized;
  } catch (err: unknown) {
    const debugFn = typeof console !== "undefined" ? console["debug"] : undefined;
    debugFn?.("safeNormalizeUrl encountered invalid URL syntax", {
      input,
      normalized,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

/**
 * Safely parses an input URL string into a WHATWG URL instance after normalization.
 * Returns undefined if the string is empty or invalid.
 *
 * @param input - Candidate URL string
 * @returns Parsed URL instance or undefined
 */
export function safeParseUrl(input: string | undefined | null): URL | undefined {
  if (!input || typeof input !== "string") return undefined;
  const normalized = normalizeUrlString(input);
  if (!normalized || typeof normalized !== "string") return undefined;
  try {
    const parsed = new URL(normalized);
    if (!parsed.hostname) return undefined;
    return parsed;
  } catch (err: unknown) {
    const debugFn = typeof console !== "undefined" ? console["debug"] : undefined;
    debugFn?.("safeParseUrl encountered invalid URL syntax", {
      input,
      normalized,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}
