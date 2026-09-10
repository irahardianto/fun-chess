/**
 * Socket logging middleware and pipeline facade (MAJ-017).
 * Decomposed into cohesive sub-modules per architectural standards:
 * - socket_sanitizer.ts: pure payload redaction and data protection (MIN-012)
 * - socket_rate_limiter.ts: socket-level event rate limiting and quota verification (MAJ-021)
 * - socket_pipeline.ts: functional middleware pipeline composition and execution (MAJ-025)
 *
 * This facade re-exports all pipeline symbols to guarantee complete backward compatibility
 * across all existing socket handlers, features, and test suites.
 */

export * from "./socket_sanitizer.js";
export * from "./socket_rate_limiter.js";
export * from "./socket_pipeline.js";
