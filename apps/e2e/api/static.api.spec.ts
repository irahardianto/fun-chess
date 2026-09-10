import { test, expect } from '@playwright/test';
import { getApiBaseUrl, EXPECTED_SECURITY_HEADERS } from './api_test_helper.js';

test.describe('Static Asset Serving & Security Controls (ENH-016)', () => {
  const baseUrl = getApiBaseUrl();

  test('GET / serves index.html with text/html content-type and mandatory security headers', async ({ request }) => {
    const response = await request.get(`${baseUrl}/`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(response.headers()['x-content-type-options']).toBe(EXPECTED_SECURITY_HEADERS['x-content-type-options']);
    expect(response.headers()['x-frame-options']).toBe(EXPECTED_SECURITY_HEADERS['x-frame-options']);
    expect(response.headers()['referrer-policy']).toBe(EXPECTED_SECURITY_HEADERS['referrer-policy']);
    expect(response.headers()['permissions-policy']).toBe(EXPECTED_SECURITY_HEADERS['permissions-policy']);
    expect(response.headers()['x-correlation-id']).toBeDefined();

    const body = await response.text();
    expect(body).toMatch(/<!doctype html>/i);
  });

  test('HEAD / responds with 200 OK, Content-Length header, and empty body', async ({ request }) => {
    const response = await request.head(`${baseUrl}/`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(response.headers()['content-length']).toBeDefined();
    const body = await response.text();
    expect(body).toBe('');
  });

  test('GET /academy SPA history route falls back to index.html for HTML requests', async ({ request }) => {
    const response = await request.get(`${baseUrl}/academy`, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    const body = await response.text();
    expect(body).toMatch(/<!doctype html>/i);
  });

  test('GET /solo-ai SPA history route falls back to index.html for HTML requests', async ({ request }) => {
    const response = await request.get(`${baseUrl}/solo-ai`, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    const body = await response.text();
    expect(body).toMatch(/<!doctype html>/i);
  });

  test('blocks directory traversal attempts with 403 Forbidden or 404 for WHATWG-normalized paths (CRIT-008, MAJ-001, MAJ-034, ENH-016)', async ({ request }) => {
    // Unnormalized traversal sequences reaching the server are blocked with 403 Forbidden
    const unnormalizedTraversalPaths = [
      '/..%2f..%2fpackage.json',
      '/index.html%00.txt',
    ];

    for (const testPath of unnormalizedTraversalPaths) {
      const response = await request.get(`${baseUrl}${testPath}`);
      expect(response.status(), `Expected 403 for path: ${testPath}`).toBe(403);
      expect(response.headers()['x-correlation-id']).toBeDefined();
    }

    // Traversal sequences normalized by WHATWG URL parser prior to transmission result in 404 Not Found
    const normalizedTraversalPaths = [
      '/%2e%2e/%2e%2e/package.json',
      '/static/../../package.json',
    ];

    for (const testPath of normalizedTraversalPaths) {
      const response = await request.get(`${baseUrl}${testPath}`);
      expect(response.status(), `Expected 404 for WHATWG-normalized path: ${testPath}`).toBe(404);
      expect(response.headers()['x-correlation-id']).toBeDefined();
    }
  });

  test('returns 404 Not Found for non-existent static asset file extensions', async ({ request }) => {
    const response = await request.get(`${baseUrl}/assets/non-existent-asset-xyz123.png`);

    expect(response.status()).toBe(404);
    expect(response.headers()['x-correlation-id']).toBeDefined();
  });
});
