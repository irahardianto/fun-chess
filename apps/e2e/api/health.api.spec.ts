import { test, expect } from '@playwright/test';
import { HealthCheckResponseSchema, type HealthCheckResponse } from '@fun-chess/shared';
import { getApiBaseUrl, EXPECTED_SECURITY_HEADERS } from './api_test_helper.js';

test.describe('Health Check API (/health, /api/health, /healthz)', () => {
  const baseUrl = getApiBaseUrl();

  test('GET /health returns 200 OK and satisfies HealthCheckResponse schema contract', async ({ request }) => {
    // Act
    const response = await request.get(`${baseUrl}/health`);

    // Assert: HTTP Status & Headers
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    // Assert: Contract Schema Validation via Zod
    const body: unknown = await response.json();
    const parseResult = HealthCheckResponseSchema.safeParse(body);
    expect(parseResult.success, `Schema validation failed: ${JSON.stringify(parseResult)}`).toBe(true);

    // Assert: Structural invariants per .agentwork/api_contracts.md
    const health = body as HealthCheckResponse;
    expect(['ok', 'degraded']).toContain(health.status);
    expect(typeof health.uptimeSeconds).toBe('number');
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);

    // Validate ISO 8601 timestamp
    expect(typeof health.timestamp).toBe('string');
    const parsedDate = new Date(health.timestamp);
    expect(Number.isNaN(parsedDate.getTime())).toBe(false);

    // Validate active counters
    expect(Number.isInteger(health.activeRooms)).toBe(true);
    expect(health.activeRooms).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(health.activeSockets)).toBe(true);
    expect(health.activeSockets).toBeGreaterThanOrEqual(0);

    // Validate memory telemetry structure
    expect(typeof health.memoryUsageMb).toBe('object');
    expect(health.memoryUsageMb).not.toBeNull();
    expect(typeof health.memoryUsageMb.rss).toBe('number');
    expect(health.memoryUsageMb.rss).toBeGreaterThanOrEqual(0);
    expect(typeof health.memoryUsageMb.heapTotal).toBe('number');
    expect(health.memoryUsageMb.heapTotal).toBeGreaterThanOrEqual(0);
    expect(typeof health.memoryUsageMb.heapUsed).toBe('number');
    expect(health.memoryUsageMb.heapUsed).toBeGreaterThanOrEqual(0);

    // Enforce consistency: in production mode memory telemetry is redacted to zeros [MIN-001],
    // while non-production telemetry reports non-zero positive numbers.
    if (health.memoryUsageMb.rss === 0) {
      expect(health.memoryUsageMb.heapTotal).toBe(0);
      expect(health.memoryUsageMb.heapUsed).toBe(0);
    } else {
      expect(health.memoryUsageMb.heapTotal).toBeGreaterThan(0);
      expect(health.memoryUsageMb.heapUsed).toBeGreaterThan(0);
    }

    // Validate relay mode if present
    if (health.relay) {
      const relay = health.relay;
      expect(['cloud', 'lan']).toContain(relay.mode);
      if (relay.publicUrl) {
        const publicUrl = relay.publicUrl;
        expect(() => new URL(publicUrl)).not.toThrow();
      }
    }
  });

  test('GET /api/health alias endpoint returns 200 OK matching /health structure', async ({ request }) => {
    // Act
    const response = await request.get(`${baseUrl}/api/health`);

    // Assert
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const body: unknown = await response.json();
    const parseResult = HealthCheckResponseSchema.safeParse(body);
    expect(parseResult.success).toBe(true);

    const health = body as HealthCheckResponse;
    expect(['ok', 'degraded']).toContain(health.status);
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(health.memoryUsageMb.rss).toBeGreaterThanOrEqual(0);
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
    // Act
    const response = await request.get(`${baseUrl}/health`);
    const headers = response.headers();

    // Assert: Standard security headers per .agentwork/api_contracts.md §5.1
    expect(headers['x-frame-options']).toBe(EXPECTED_SECURITY_HEADERS['x-frame-options']);
    expect(headers['x-content-type-options']).toBe(EXPECTED_SECURITY_HEADERS['x-content-type-options']);
    expect(headers['referrer-policy']).toBe(EXPECTED_SECURITY_HEADERS['referrer-policy']);
    expect(headers['strict-transport-security']).toBe(EXPECTED_SECURITY_HEADERS['strict-transport-security']);
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
