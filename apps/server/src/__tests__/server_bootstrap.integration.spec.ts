import { describe, it, expect, afterEach, vi } from "vitest";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import {
  startServer,
  setupDomainServices,
  setupSocketGateway,
  setupBackgroundJobs,
  type ServerInstance,
} from "../index.js";
import { NullLogger } from "../platform/logger/null_logger.js";
import type {
  LanInfoResponse,
  LivenessHealthResponse,
  DetailedHealthResponse,
} from "@fun-chess/shared";
import type { ServerEnv } from "../platform/config/index.js";
import { createSocketRateLimiter } from "../platform/socket/index.js";

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
    const untypedData = data as unknown as Record<string, unknown>;
    expect(untypedData.activeRooms).toBeUndefined();
    expect(untypedData.activeSockets).toBeUndefined();
    expect(untypedData.memoryUsageMb).toBeUndefined();

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
          LOG_LEVEL: "invalid_log_level" as unknown as ServerEnv["LOG_LEVEL"],
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

  it("decomposes server setup into modular helper functions (MAJ-031)", () => {
    const env = {
      PORT: 3000,
      HOST: "127.0.0.1",
      NODE_ENV: "test" as const,
      LOG_LEVEL: "info" as const,
      TRUST_PROXY: false,
    };
    const services = setupDomainServices({}, env as unknown as ServerEnv, 3000);
    expect(services.roomStore).toBeDefined();
    expect(services.roomService).toBeDefined();
    expect(services.gameService).toBeDefined();
    expect(services.relayAddressService).toBeDefined();
    expect(services.timerRegistry).toBeDefined();

    const interval = setupBackgroundJobs(services.roomService, new NullLogger());
    expect(interval).toBeDefined();
    clearInterval(interval);
  });

  it("propagates error when server.close yields an error during close() (MAJ-008)", async () => {
    instance = await startServer(createOptions());

    // Mock server.close to simulate an error callback
    instance.server.close = vi.fn((cb?: (err?: Error | null) => void) => {
      if (cb) cb(new Error("Simulated close failure"));
      return instance!.server;
    });

    await expect(instance.close()).rejects.toThrow("Simulated close failure");
    instance = undefined;
  });

  it("cleans up resources when server startup listen fails (MAJ-009)", async () => {
    // Attempting to listen on an invalid address or privileged port should fail
    await expect(
      startServer({
        port: -1, // Invalid port causes server.listen to error immediately
        host: "invalid-host-name-that-cannot-bind",
        logger: new NullLogger(),
      }),
    ).rejects.toThrow();
  });

  it("logs structured error when socket experiences a transport error event (MAJ-042)", async () => {
    const logger = new NullLogger();
    instance = await startServer(createOptions({ logger }));

    const client: ClientSocket = ioClient(instance.url, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Connect timeout")), 5000);
      client.on("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      client.on("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    // Obtain the server-side socket representation
    const serverSockets = await instance.io.fetchSockets();
    expect(serverSockets.length).toBeGreaterThan(0);
    const serverSocket = instance.io.sockets.sockets.get(serverSockets[0]!.id);
    expect(serverSocket).toBeDefined();

    // Trigger transport error on the server socket local listeners
    for (const listener of serverSocket!.listeners("error")) {
      (listener as (err: Error) => void)(
        new Error("Simulated transport socket error"),
      );
    }

    // Verify error was logged with mandatory 3-point context (MAJ-042)
    const errorLog = logger.errorLogs.find(
      (l) => l.context?.operation === "socket_error",
    );
    expect(errorLog).toBeDefined();
    expect(errorLog?.message).toBe("Client socket transport error");
    expect(errorLog?.context?.socketId).toBe(serverSocket!.id);
    expect(errorLog?.context?.correlationId).toBeDefined();
    expect((errorLog?.context?.error as { message?: string })?.message).toBe(
      "Simulated transport socket error",
    );

    client.disconnect();
  });

  it("catches and logs exception when socket disconnect handler fails (MAJ-042)", async () => {
    const logger = new NullLogger();
    instance = await startServer(createOptions({ logger }));

    const client: ClientSocket = ioClient(instance.url, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Connect timeout")), 5000);
      client.on("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      client.on("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const serverSockets = await instance.io.fetchSockets();
    expect(serverSockets.length).toBeGreaterThan(0);
    const socketId = serverSockets[0]!.id;

    // Simulate unexpected failure inside roomService.handleDisconnect
    vi.spyOn(instance.roomService, "handleDisconnect").mockRejectedValueOnce(
      new Error("Simulated disconnect exception"),
    );

    // Disconnect client to trigger disconnect event
    client.disconnect();

    // Allow async disconnect handler catch block to run
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const found = logger.errorLogs.some(
          (l) => l.context?.operation === "socket_disconnect_error",
        );
        if (found) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 20);
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 2000);
    });

    const disconnectErrorLog = logger.errorLogs.find(
      (l) => l.context?.operation === "socket_disconnect_error",
    );
    expect(disconnectErrorLog).toBeDefined();
    expect(disconnectErrorLog?.message).toBe(
      "Client socket disconnect handler failed",
    );
    expect(disconnectErrorLog?.context?.socketId).toBe(socketId);
    expect(disconnectErrorLog?.context?.correlationId).toBeDefined();
    expect(
      (disconnectErrorLog?.context?.error as { message?: string })?.message,
    ).toBe("Simulated disconnect exception");
  });

  it("registers socket gateway handlers via setupSocketGateway (MAJ-031, MAJ-042)", () => {
    const env: ServerEnv = {
      PORT: 3000,
      HOST: "127.0.0.1",
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      TRUST_PROXY: false,
    };
    const logger = new NullLogger();
    const services = setupDomainServices({}, env, 3000);
    const rateLimiter = createSocketRateLimiter({ logger });

    expect(typeof setupSocketGateway).toBe("function");
    const mockIo = {
      on: vi.fn(),
    };
    setupSocketGateway(
      mockIo as unknown as ServerInstance["io"],
      services,
      rateLimiter,
      env,
      logger,
    );
    expect(mockIo.on).toHaveBeenCalledWith("connection", expect.any(Function));
    rateLimiter.destroy();
  });

  it("wires sessionRegistry with clock and idGenerator into GameService and returns on ServerInstance (CRIT-002)", async () => {
    instance = await startServer(createOptions());
    expect(instance.sessionRegistry).toBeDefined();
    expect(instance.gameService).toBeDefined();
    expect(typeof instance.sessionRegistry.touchSession).toBe("function");
    expect(typeof instance.sessionRegistry.createSession).toBe("function");
  });

  it("instantiates roomCreateRateLimiter and rateLimiter dynamically in startServer (CRIT-003)", async () => {
    instance = await startServer(createOptions({
      config: {
        RATE_LIMIT_ROOM_CREATE_MAX: 5,
      },
    }));
    expect(instance.rateLimiter).toBeDefined();
    expect(instance.roomCreateRateLimiter).toBeDefined();
    expect(instance.config.RATE_LIMIT_ROOM_CREATE_MAX).toBe(5);
  });

  it("logs structured error when server bootstrap fails (MAJ-014)", async () => {
    const logger = new NullLogger();
    await expect(
      startServer({
        port: 0,
        host: "256.256.256.256",
        logger,
      }),
    ).rejects.toThrow();

    const failureLog = logger.errorLogs.find(
      (l) => l.context?.operation === "server_bootstrap",
    );
    expect(failureLog).toBeDefined();
    expect(failureLog?.message).toBe("Fun Chess server bootstrap failed");
    expect(failureLog?.context?.status).toBe("failed");
    expect(failureLog?.context?.correlationId).toBeDefined();
    expect(typeof failureLog?.context?.duration).toBe("number");
    expect(typeof failureLog?.context?.durationMs).toBe("number");
  });
});

