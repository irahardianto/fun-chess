/**
 * API Test Suite Configuration and Helpers for Fun Chess E2E verification.
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Playwright standards.
 */

/**
 * Resolves the authoritative backend server base URL.
 * Checks environment overrides before falling back to local server default (port 3000).
 */
export function getApiBaseUrl(): string {
  if (process.env.SERVER_URL) return process.env.SERVER_URL;
  if (process.env.API_BASE_URL) return process.env.API_BASE_URL;
  if (process.env.BASE_URL && !process.env.BASE_URL.includes(':5173')) {
    return process.env.BASE_URL;
  }
  return 'http://localhost:3000';
}

export const EXPECTED_SECURITY_HEADERS = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
} as const;
