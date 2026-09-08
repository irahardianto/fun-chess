import { describe, it, expect, afterEach } from "vitest";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import { startServer, type ServerInstance } from "../index.js";
import { NullLogger } from "../platform/logger/null_logger.js";
import type {
  HealthCheckResponse,
  LanInfoResponse,
  LivenessHealthResponse,
  DetailedHealthResponse,
} from "@fun-chess/shared";

describe("Server Bootstrap Integration (MAJ-033)", () => {
  let instance: ServerInstance | undefined;

  afterEach(async () => {
    if (instance) {
      await instance.close();
      instance = undefined;
    }
  });

  const createOptions = (overrides: Record<string, unknown> = {}) => ({
    port: 0,
    logger: new NullLogger(),
    ...overrides,
  });

  it("boots cleanly on ephemeral port (PORT=0)", async () => {
    // Act
    instance = await startServer(createOptions());

    // Assert: Dynamic ephemeral port binding
    expect(instance).toBeDefined();
    expect(instance.port).toBeGreaterThan(0);
    expect(instance.port).toBeLessThan(65536);
    expect(instance.url).toBe(`http://127.0.0.1:${instance.port}`);
    expect(instance.server.listening).toBe(true);
  });

  it("responds to /health with 200 and expected status object (ENH-003)", async () => {
    // Arrange
    instance = await startServer(createOptions());

    // Act
    const res = await fetch(`${instance.url}/health`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = (await res.json()) as LivenessHealthResponse;
    expect(data.status).toBe("ok");
    expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(data.timestamp).toBeDefined();
    expect(new Date(data.timestamp).getTime()).not.toBeNaN();
    expect((data as any).activeRooms).toBeUndefined();
    expect((data as any).activeSockets).toBeUndefined();
    expect((data as any).memoryUsageMb).toBeUndefined();

    // Act: Deep operational telemetry on /metrics
    const metricsRes = await fetch(`${instance.url}/metrics`);
    expect(metricsRes.status).toBe(200);
    const metricsData = (await metricsRes.json()) as DetailedHealthResponse;
    expect(metricsData.status).toBe("ok");
    expect(metricsData.activeRooms).toBe(0);
    expect(metricsData.activeSockets).toBe(0);
    expect(metricsData.memoryUsageMb).toBeDefined();
    expect(metricsData.memoryUsageMb.rss).toBeGreaterThan(0);
    expect(metricsData.memoryUsageMb.heapTotal).toBeGreaterThan(0);
    expect(metricsData.memoryUsageMb.heapUsed).toBeGreaterThan(0);
  });

  it("responds to /api/lan-info with 200 and network interface metadata", async () => {
    // Arrange
    instance = await startServer(createOptions());

    // Act
    const res = await fetch(`${instance.url}/api/lan-info`);

    // Assert
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = (await res.json()) as LanInfoResponse;
    expect(data.port).toBe(instance.port);
    expect(data.localUrl).toBe(`http://localhost:${instance.port}`);
    expect(data.joinUrl).toBeDefined();
    expect(data.lanIp).toBeDefined();
    expect(Array.isArray(data.interfaces)).toBe(true);
  });

  it("enforces CORS origin validation according to configured allowed origins", async () => {
    // Arrange: Server configured with explicit allowed origins
    const allowedOrigin = "http://trusted-client.funchess.local:5173";
    const untrustedOrigin = "http://evil-phishing-site.example.org";

    instance = await startServer(
      createOptions({
        config: {
          CORS_ORIGIN: allowedOrigin,
        },
      }),
    );

    // Act 1: Request with trusted origin
    const trustedRes = await fetch(`${instance.url}/api/lan-info`, {
      headers: { Origin: allowedOrigin },
    });
    expect(trustedRes.status).toBe(200);
    expect(trustedRes.headers.get("access-control-allow-origin")).toBe(
      allowedOrigin,
    );

    // Act 2: Request with untrusted origin
    const untrustedRes = await fetch(`${instance.url}/api/lan-info`, {
      headers: { Origin: untrustedOrigin },
    });
    expect(untrustedRes.status).toBe(200);
    // Disallowed origin should NOT receive matching access-control-allow-origin header
    expect(untrustedRes.headers.get("access-control-allow-origin")).not.toBe(
      untrustedOrigin,
    );
  });

  it("serves static assets correctly and enforces SPA fallback for HTML requests", async () => {
    // Arrange
    instance = await startServer(createOptions());

    // Act 1: Missing asset with extension must return 404 Not Found (CRIT-008: NEVER 200 or index.html)
    const missingAssetRes = await fetch(
      `${instance.url}/assets/nonexistent-bundle.js`,
    );
    expect(missingAssetRes.status).toBe(404);
    const missingAssetText = await missingAssetRes.text();
    expect(missingAssetText).not.toContain("<!DOCTYPE html>");

    // Act 2: SPA client-side route without extension with Accept: text/html must return 200 HTML
    const spaRouteRes = await fetch(`${instance.url}/room/ABCD`, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
      },
    });
    expect(spaRouteRes.status).toBe(200);
    expect(spaRouteRes.headers.get("content-type")).toContain("text/html");
    const spaHtml = await spaRouteRes.text();
    expect(spaHtml.length).toBeGreaterThan(0);
  });

  it("connects via Socket.io, receives events, and acknowledges requests", async () => {
    // Arrange
    instance = await startServer(createOptions());

    // Act: Establish client Socket.io connection to ephemeral server
    const client: ClientSocket = ioClient(instance.url, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Socket connection timed out")),
        5000,
      );
      client.on("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      client.on("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    expect(client.connected).toBe(true);

    // Act: Emit room:create and verify structured acknowledgement with private sessionToken
    interface CreateRoomAck {
      success: boolean;
      room?: {
        roomCode: string;
        status: string;
      };
      sessionToken?: string;
      error?: unknown;
    }

    const ack = await new Promise<CreateRoomAck>((resolve) => {
      client.emit(
        "room:create",
        {
          playerName: "BootstrapTester",
          preferredColor: "w",
          avatar: "🦁",
        },
        (response: CreateRoomAck) => resolve(response),
      );
    });

    // Assert: Ingress validation passed and room was created
    expect(ack.success).toBe(true);
    expect(ack.room).toBeDefined();
    expect(ack.room?.roomCode).toMatch(/^[A-Z0-9]{4}$/);
    expect(ack.sessionToken).toBeDefined();
    expect(typeof ack.sessionToken).toBe("string");

    client.disconnect();
  });

  it("terminates cleanly via instance.close() and releases ports and sockets", async () => {
    // Arrange
    instance = await startServer(createOptions());
    const targetUrl = instance.url;

    // Verify it is responding
    const probeRes = await fetch(`${targetUrl}/health`);
    expect(probeRes.status).toBe(200);

    // Act: Terminate server cleanly
    await instance.close();
    instance = undefined; // Avoid double close in afterEach

    // Assert: Subsequent requests are rejected (connection refused)
    await expect(
      fetch(`${targetUrl}/health`, { signal: AbortSignal.timeout(1000) }),
    ).rejects.toThrow();
  });

  it("rejects invalid programmatic options by validating configuration (MAJ-001)", async () => {
    // Assert invalid port throws
    await expect(
      startServer(
        createOptions({
          port: -1,
        }),
      ),
    ).rejects.toThrow();

    // Assert invalid log level throws
    await expect(
      startServer({
        port: 0,
        logger: undefined,
        config: {
          LOG_LEVEL: "invalid_log_level" as any,
        },
      }),
    ).rejects.toThrow();
  });

  it("merges raw config dictionaries before validateServerConfig (SEC-RT-003)", async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalCors = process.env.CORS_ORIGIN;
    const originalPublic = process.env.PUBLIC_URL;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.CORS_ORIGIN;
      delete process.env.PUBLIC_URL;

      // With options.config supplying CORS_ORIGIN, validation succeeds without throwing on process.env
      instance = await startServer({
        port: 0,
        logger: new NullLogger(),
        config: {
          NODE_ENV: "production",
          CORS_ORIGIN: "https://valid.example.com",
        },
      });

      expect(instance).toBeDefined();
      expect(instance.config.NODE_ENV).toBe("production");
      expect(instance.config.CORS_ORIGIN).toBe("https://valid.example.com");
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalCors !== undefined) {
        process.env.CORS_ORIGIN = originalCors;
      } else {
        delete process.env.CORS_ORIGIN;
      }
      if (originalPublic !== undefined) {
        process.env.PUBLIC_URL = originalPublic;
      } else {
        delete process.env.PUBLIC_URL;
      }
    }
  });
});
