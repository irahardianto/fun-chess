import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer, TestServerInstance } from "../helpers/test_server";
import { fetchLanInfo, fetchHealth } from "../helpers/http_client_helper";
import { LanInfoResponse, HealthCheckResponse } from "@fun-chess/shared";

describe("HTTP API Contracts", () => {
  let serverInstance: TestServerInstance;

  beforeAll(async () => {
    serverInstance = await createTestServer();
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  describe("GET /api/lan-info", () => {
    it("should return 200 OK with valid LanInfoResponse schema when requested", async () => {
      // Arrange & Act
      const { status, data } = await fetchLanInfo(serverInstance.url);

      // Assert
      expect(status).toBe(200);
      expect(data).toBeDefined();

      // Contract assertions for LanInfoResponse
      expect(typeof data.lanIp).toBe("string");
      expect(data.lanIp.length).toBeGreaterThan(0);
      expect(typeof data.port).toBe("number");
      expect(data.port).toBe(serverInstance.port);
      expect(data.localUrl).toBe(`http://localhost:${serverInstance.port}`);
      expect(data.joinUrl).toBe(`http://${data.lanIp}:${serverInstance.port}`);
      expect(Array.isArray(data.interfaces)).toBe(true);
    });

    it("should include valid URL formats for localUrl and joinUrl when returned", async () => {
      // Arrange & Act
      const { data } = await fetchLanInfo(serverInstance.url);

      // Assert
      expect(() => new URL(data.localUrl)).not.toThrow();
      expect(() => new URL(data.joinUrl)).not.toThrow();
    });
  });

  describe("GET /health", () => {
    it("should return 200 OK with valid HealthCheckResponse schema at root /health", async () => {
      // Arrange & Act
      const res = await fetch(`${serverInstance.url}/health`);
      const data = (await res.json()) as HealthCheckResponse;

      // Assert
      expect(res.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.activeRooms).toBe(0);
      expect(data.activeSockets).toBe(0);
      expect(data.relay).toBeDefined();
    });
  });

  describe("GET /healthz", () => {
    it('should return 200 OK with text/plain "OK" for container liveness/readiness probe', async () => {
      // Arrange & Act
      const res = await fetch(`${serverInstance.url}/healthz`);
      const body = await res.text();

      // Assert
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
      expect(body).toBe("OK");
    });
  });
});
