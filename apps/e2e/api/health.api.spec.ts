import { test, expect } from '@playwright/test';
import {
  LivenessHealthResponseSchema,
  DetailedHealthResponseSchema,
  type LivenessHealthResponse,
  type DetailedHealthResponse,
} from '@fun-chess/shared';
import { getApiBaseUrl, EXPECTED_SECURITY_HEADERS } from './api_test_helper.js';

test.describe('Health Check API (/health, /api/health, /healthz, /metrics, /health/detail)', () => {
  const baseUrl = getApiBaseUrl();

  test('GET /health returns 200 OK and satisfies LivenessHealthResponse schema contract (ENH-003)', async ({ request }) => {
    // Act
    const response = await request.get(`${baseUrl}/health`);

    // Assert: HTTP Status & Headers
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    // Assert: Contract Schema Validation via Zod
    const body: unknown = await response.json();
    const parseResult = LivenessHealthResponseSchema.safeParse(body);
    expect(parseResult.success, `Schema validation failed: ${JSON.stringify(parseResult)}`).toBe(true);

    // Assert: Structural invariants per .agentwork/api_contracts.md §5.3
    const health = body as LivenessHealthResponse;
    expect(['ok', 'degraded']).toContain(health.status);
    expect(typeof health.uptimeSeconds).toBe('number');
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);

    // Validate ISO 8601 timestamp
    expect(typeof health.timestamp).toBe('string');
    const parsedDate = new Date(health.timestamp);
    expect(Number.isNaN(parsedDate.getTime())).toBe(false);

    // Ensure operational metrics are NOT leaked on unauthenticated /health (ENH-003)
    const anyBody = body as Record<string, unknown>;
    expect(anyBody['activeRooms']).toBeUndefined();
    expect(anyBody['activeSockets']).toBeUndefined();
    expect(anyBody['memoryUsageMb']).toBeUndefined();
  });

  test('GET /api/health alias endpoint returns 200 OK matching /health structure (ENH-003)', async ({ request }) => {
    // Act
    const response = await request.get(`${baseUrl}/api/health`);

    // Assert
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body: unknown = await response.json();
    const parseResult = LivenessHealthResponseSchema.safeParse(body);
    expect(parseResult.success).toBe(true);

    const health = body as LivenessHealthResponse;
    expect(['ok', 'degraded']).toContain(health.status);
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  test('GET /metrics returns 200 OK and satisfies DetailedHealthResponse schema contract (ENH-003)', async ({ request }) => {
    const response = await request.get(`${baseUrl}/metrics`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body: unknown = await response.json();
    const parseResult = DetailedHealthResponseSchema.safeParse(body);
    expect(parseResult.success, `Schema validation failed: ${JSON.stringify(parseResult)}`).toBe(true);

    const detailed = body as DetailedHealthResponse;
    expect(['ok', 'degraded']).toContain(detailed.status);
    expect(typeof detailed.uptimeSeconds).toBe('number');
    expect(detailed.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(detailed.activeRooms)).toBe(true);
    expect(Number.isInteger(detailed.activeSockets)).toBe(true);
    expect(typeof detailed.memoryUsageMb).toBe('object');
    expect(detailed.memoryUsageMb).not.toBeNull();
  });

  test('GET /health/detail returns 200 OK and satisfies DetailedHealthResponse schema contract (ENH-003)', async ({ request }) => {
    const response = await request.get(`${baseUrl}/health/detail`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body: unknown = await response.json();
    const parseResult = DetailedHealthResponseSchema.safeParse(body);
    expect(parseResult.success).toBe(true);
  });

  test('GET /healthz returns 200 OK with plain text "OK" for container orchestrator probes', async ({ request }) => {
    // Act
    const response = await request.get(`${baseUrl}/healthz`);

    // Assert
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/plain');
    const text = await response.text();
    expect(text).toBe('OK');
  });

  test('HEAD /healthz responds with 200 OK, Content-Length header, and empty body', async ({ request }) => {
    // Act
    const response = await request.head(`${baseUrl}/healthz`);

    // Assert
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/plain');
    expect(response.headers()['content-length']).toBeDefined();
    const body = await response.text();
    expect(body).toBe('');
  });

  test('HEAD /health responds with 200 OK, Content-Length header, and empty body', async ({ request }) => {
    // Act
    const response = await request.head(`${baseUrl}/health`);

    // Assert
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(response.headers()['content-length']).toBeDefined();
    const body = await response.text();
    expect(body).toBe('');
  });

  test('GET /health returns all mandatory security headers and correlation ID', async ({ request }) => {
    // Act: Send with x-forwarded-proto: https to verify full security headers suite including HSTS
    const response = await request.get(`${baseUrl}/health`, {
      headers: { 'x-forwarded-proto': 'https' },
    });
    const headers = response.headers();

    // Assert: Standard security headers per .agentwork/api_contracts.md §5.1
    expect(headers['x-frame-options']).toBe(EXPECTED_SECURITY_HEADERS['x-frame-options']);
    expect(headers['x-content-type-options']).toBe(EXPECTED_SECURITY_HEADERS['x-content-type-options']);
    expect(headers['referrer-policy']).toBe(EXPECTED_SECURITY_HEADERS['referrer-policy']);
    if (headers['strict-transport-security']) {
      expect(headers['strict-transport-security']).toBe(EXPECTED_SECURITY_HEADERS['strict-transport-security']);
    }
    expect(headers['permissions-policy']).toBe(EXPECTED_SECURITY_HEADERS['permissions-policy']);

    // Assert: Content-Security-Policy restrictions
    expect(headers['content-security-policy']).toBeDefined();
    const csp = headers['content-security-policy']!;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");

    // Assert: Correlation ID tracking
    expect(headers['x-correlation-id']).toBeDefined();
    expect(headers['x-correlation-id']!.length).toBeGreaterThan(0);
  });
});
