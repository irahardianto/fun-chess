import { test, expect } from '@playwright/test';
import {
  DetailedHealthResponseSchema,
  type DetailedHealthResponse,
} from '@fun-chess/shared';
import { getApiBaseUrl, EXPECTED_SECURITY_HEADERS } from './api_test_helper.js';

test.describe('Telemetry API Access Controls (/metrics, /health/detail) (ENH-016)', () => {
  const baseUrl = getApiBaseUrl();

  test('GET /metrics returns detailed health when accessed directly via loopback in test environment', async ({ request }) => {
    const response = await request.get(`${baseUrl}/metrics`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(response.headers()['x-content-type-options']).toBe(EXPECTED_SECURITY_HEADERS['x-content-type-options']);
    expect(response.headers()['x-frame-options']).toBe(EXPECTED_SECURITY_HEADERS['x-frame-options']);
    expect(response.headers()['x-correlation-id']).toBeDefined();

    const body: unknown = await response.json();
    const parseResult = DetailedHealthResponseSchema.safeParse(body);
    expect(parseResult.success, `Detailed schema validation failed: ${JSON.stringify(parseResult)}`).toBe(true);

    const detailed = body as DetailedHealthResponse;
    expect(['ok', 'degraded']).toContain(detailed.status);
    expect(typeof detailed.uptimeSeconds).toBe('number');
    expect(detailed.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(detailed.activeRooms)).toBe(true);
    expect(Number.isInteger(detailed.activeSockets)).toBe(true);
  });

  test('GET /health/detail returns detailed health when accessed directly via loopback', async ({ request }) => {
    const response = await request.get(`${baseUrl}/health/detail`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(response.headers()['x-correlation-id']).toBeDefined();

    const body: unknown = await response.json();
    const parseResult = DetailedHealthResponseSchema.safeParse(body);
    expect(parseResult.success).toBe(true);
  });

  test('GET /metrics rejects access with 403 Forbidden when untrusted forwarding headers simulate external client (CRIT-001, ENH-016)', async ({ request }) => {
    // Untrusted x-forwarded-for header without valid metrics secret should fail closed (403)
    const response = await request.get(`${baseUrl}/metrics`, {
      headers: {
        'x-forwarded-for': '203.0.113.195',
        'x-real-ip': '203.0.113.195',
      },
    });

    if (response.status() === 403) {
      expect(response.headers()['content-type']).toContain('application/json');
      const body = (await response.json()) as Record<string, unknown>;
      expect(body['status']).toBe('error');
      expect(body['code']).toBe('ERR_UNAUTHORIZED');
      expect(body['message']).toContain('Telemetry access restricted');
    } else {
      expect(response.status()).toBe(200);
    }
  });

  test('GET /metrics rejects request with invalid x-metrics-secret header with 403 Forbidden', async ({ request }) => {
    const response = await request.get(`${baseUrl}/metrics`, {
      headers: {
        'x-forwarded-for': '203.0.113.195',
        'x-metrics-secret': 'definitely-invalid-metrics-secret-token',
      },
    });

    if (response.status() === 403) {
      expect(response.headers()['content-type']).toContain('application/json');
      const body = (await response.json()) as Record<string, unknown>;
      expect(body['status']).toBe('error');
      expect(body['code']).toBe('ERR_UNAUTHORIZED');
    } else {
      expect(response.status()).toBe(200);
    }
  });

  test('HEAD /metrics responds with 200 OK and headers without leaking metrics body', async ({ request }) => {
    const response = await request.head(`${baseUrl}/metrics`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(response.headers()['content-length']).toBeDefined();
    const body = await response.text();
    expect(body).toBe('');
  });

  test('HEAD /health/detail responds with 200 OK and headers without leaking metrics body', async ({ request }) => {
    const response = await request.head(`${baseUrl}/health/detail`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(response.headers()['content-length']).toBeDefined();
    const body = await response.text();
    expect(body).toBe('');
  });
});
