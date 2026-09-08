import { test, expect } from '@playwright/test';
import { LanInfoResponseSchema, type LanInfoResponse } from '@fun-chess/shared';
import { getApiBaseUrl, EXPECTED_SECURITY_HEADERS } from './api_test_helper.js';

test.describe('LAN Information & Discovery API (/api/lan-info)', () => {
  const baseUrl = getApiBaseUrl();

  test('GET /api/lan-info returns 200 OK and satisfies LanInfoResponse schema contract', async ({ request }) => {
    // Act
    const response = await request.get(`${baseUrl}/api/lan-info`);

    // Assert: HTTP Status & Headers
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    // Assert: Contract Schema Validation via Zod
    const body: unknown = await response.json();
    const parseResult = LanInfoResponseSchema.safeParse(body);
    expect(parseResult.success, `Schema validation failed: ${JSON.stringify(parseResult)}`).toBe(true);

    // Assert: Structural invariants per .agentwork/api_contracts.md
    const lanInfo = body as LanInfoResponse;

    // lanIp
    expect(typeof lanInfo.lanIp).toBe('string');
    expect(lanInfo.lanIp.length).toBeGreaterThan(0);

    // port
    expect(typeof lanInfo.port).toBe('number');
    expect(Number.isInteger(lanInfo.port)).toBe(true);
    expect(lanInfo.port).toBeGreaterThan(0);
    expect(lanInfo.port).toBeLessThanOrEqual(65535);

    // localUrl
    expect(typeof lanInfo.localUrl).toBe('string');
    expect(() => new URL(lanInfo.localUrl)).not.toThrow();
    const localUrlObj = new URL(lanInfo.localUrl);
    expect(['http:', 'https:']).toContain(localUrlObj.protocol);
    expect(localUrlObj.port).toBe(String(lanInfo.port));

    // joinUrl
    expect(typeof lanInfo.joinUrl).toBe('string');
    expect(() => new URL(lanInfo.joinUrl)).not.toThrow();
    const joinUrlObj = new URL(lanInfo.joinUrl);
    expect(['http:', 'https:']).toContain(joinUrlObj.protocol);
    expect(joinUrlObj.hostname).toBe(lanInfo.lanIp);
    expect(joinUrlObj.port).toBe(String(lanInfo.port));

    // interfaces
    expect(Array.isArray(lanInfo.interfaces)).toBe(true);
    for (const iface of lanInfo.interfaces) {
      expect(typeof iface).toBe('string');
      expect(iface.length).toBeGreaterThan(0);
    }

    // Optional relay properties
    if (lanInfo.relayMode) {
      expect(['cloud', 'lan']).toContain(lanInfo.relayMode);
    }
    if (lanInfo.isCloudRelay !== undefined) {
      expect(typeof lanInfo.isCloudRelay).toBe('boolean');
    }
    if (lanInfo.publicUrl) {
      const publicUrl = lanInfo.publicUrl;
      expect(() => new URL(publicUrl)).not.toThrow();
    }
  });

  test('HEAD /api/lan-info responds with 200 OK, Content-Length header, and empty body', async ({ request }) => {
    // Act
    const response = await request.head(`${baseUrl}/api/lan-info`);

    // Assert
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(response.headers()['content-length']).toBeDefined();
    const body = await response.text();
    expect(body).toBe('');
  });

  test('GET /api/lan-info includes mandatory security headers and correlation ID', async ({ request }) => {
    // Act: Send with x-forwarded-proto: https to verify full security headers suite including HSTS
    const response = await request.get(`${baseUrl}/api/lan-info`, {
      headers: { 'x-forwarded-proto': 'https' },
    });
    const headers = response.headers();

    // Assert: Standard security headers per .agentwork/api_contracts.md §5.1
    expect(headers['x-frame-options']).toBe(EXPECTED_SECURITY_HEADERS['x-frame-options']);
    expect(headers['x-content-type-options']).toBe(EXPECTED_SECURITY_HEADERS['x-content-type-options']);
    expect(headers['referrer-policy']).toBe(EXPECTED_SECURITY_HEADERS['referrer-policy']);
    expect(headers['strict-transport-security']).toBe(EXPECTED_SECURITY_HEADERS['strict-transport-security']);
    expect(headers['permissions-policy']).toBe(EXPECTED_SECURITY_HEADERS['permissions-policy']);

    // Assert: Content-Security-Policy & correlation ID
    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['x-correlation-id']).toBeDefined();
    expect(headers['x-correlation-id']!.length).toBeGreaterThan(0);
  });

  test('GET on unknown API route returns 404 with structured error contract payload [MIN-032]', async ({ request }) => {
    // Act
    const response = await request.get(`${baseUrl}/api/non-existent-endpoint`);

    // Assert: Status & Headers
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type']).toContain('application/json');

    // Assert: Standardized error envelope per MIN-032
    const body = (await response.json()) as {
      code: number;
      error: string;
      message: string;
      correlationId?: string;
      timestamp: number;
    };
    expect(body).toBeDefined();
    expect(body.code).toBe(404);
    expect(body.error).toBe('ERR_NOT_FOUND');
    expect(body.message).toBeDefined();
  });

  test('rapid repeated requests adhere to HTTP rate limiting rules [MIN-002]', async ({ request }) => {
    // Act: Issue a burst of rapid requests to /api/lan-info
    const requests = Array.from({ length: 150 }, () => request.get(`${baseUrl}/api/lan-info`));
    const responses = await Promise.all(requests);

    // Assert: Every response must either succeed (200 OK) or be rate-limited (429 Too Many Requests)
    for (const res of responses) {
      expect([200, 429]).toContain(res.status());
      if (res.status() === 429) {
        expect(res.headers()['content-type']).toContain('application/json');
        const body = (await res.json()) as {
          code: number;
          error: string;
          message: string;
        };
        expect(body.code).toBe(429);
        expect(body.error).toBe('ERR_RATE_LIMITED');
      }
    }
  });
});
