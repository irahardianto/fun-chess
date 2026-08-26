import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerInstance } from '../helpers/test_server';
import { fetchLanInfo, fetchHealth } from '../helpers/http_client_helper';
import { LanInfoResponse, HealthCheckResponse } from '@fun-chess/shared';

describe('HTTP API Contracts', () => {
  let serverInstance: TestServerInstance;

  beforeAll(async () => {
    serverInstance = await createTestServer();
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  describe('GET /api/lan-info', () => {
    it('should return 200 OK with valid LanInfoResponse schema when requested', async () => {
      // Arrange & Act
      const { status, data } = await fetchLanInfo(serverInstance.url);

      // Assert
      expect(status).toBe(200);
      expect(data).toBeDefined();

      // Contract assertions for LanInfoResponse
      expect(typeof data.lanIp).toBe('string');
      expect(data.lanIp.length).toBeGreaterThan(0);
      expect(typeof data.port).toBe('number');
      expect(data.port).toBe(serverInstance.port);
      expect(data.localUrl).toBe(`http://localhost:${serverInstance.port}`);
      expect(data.joinUrl).toBe(`http://${data.lanIp}:${serverInstance.port}`);
      expect(Array.isArray(data.interfaces)).toBe(true);
    });

    it('should include valid URL formats for localUrl and joinUrl when returned', async () => {
      // Arrange & Act
      const { data } = await fetchLanInfo(serverInstance.url);

      // Assert
      expect(() => new URL(data.localUrl)).not.toThrow();
      expect(() => new URL(data.joinUrl)).not.toThrow();
    });
  });

  describe('GET /api/health', () => {
    it('should return 200 OK with valid HealthCheckResponse schema when healthy', async () => {
      // Arrange & Act
      const { status, data } = await fetchHealth(serverInstance.url);

      // Assert
      expect(status).toBe(200);
      expect(data).toBeDefined();

      // Contract assertions for HealthCheckResponse
      expect(data.status).toBe('ok');
      expect(typeof data.uptimeSeconds).toBe('number');
      expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(typeof data.timestamp).toBe('string');
      expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
      expect(typeof data.activeRooms).toBe('number');
      expect(typeof data.activeSockets).toBe('number');

      // Memory metrics
      expect(data.memoryUsageMb).toBeDefined();
      expect(typeof data.memoryUsageMb.rss).toBe('number');
      expect(typeof data.memoryUsageMb.heapTotal).toBe('number');
      expect(typeof data.memoryUsageMb.heapUsed).toBe('number');
      expect(data.memoryUsageMb.rss).toBeGreaterThan(0);
    });
  });
});
