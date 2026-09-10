import { describe, it, expect, afterEach, vi } from "vitest";
import {
  setupDomainServices,
  resolveServerBootstrapConfig,
  setupHttpLayer,
  setupSocketGateway,
  setupSocketLayer,
  setupBackgroundJobs,
  setupLifecycle,
  parseFallbackLogLevel,
  startServer,
  type ServerInstance,
} from "../index.js";
import { NullLogger } from "../../platform/logger/null_logger.js";
import http from "node:http";
import { createSocketServer } from "../../platform/socket/index.js";
import {
  MockTimerService,
  type IRoomService,
} from "../../features/rooms/index.js";

describe("Modular Server Bootstrap Architecture (MAJ-027)", () => {
  let instance: ServerInstance | undefined;

  afterEach(async () => {
    if (instance) {
      await instance.close();
      instance = undefined;
    }
  });

  describe("setupDomainServices", () => {
    it("instantiates and wires all domain service dependencies cleanly", () => {
      const logger = new NullLogger();
      const config = resolveServerBootstrapConfig({
        port: 0,
        logger,
        config: { SESSION_SECRET: ["test", "secret", "at", "least", "16", "chars", "long"].join("-") },
      });

      const services = setupDomainServices({}, config.env, 8080, logger);

      expect(services.clock).toBeDefined();
      expect(services.idGenerator).toBeDefined();
      expect(services.timerRegistry).toBeDefined();
      expect(services.timerService).toBeDefined();
      expect(services.sessionRegistry).toBeDefined();
      expect(services.roomStore).toBeDefined();
      expect(services.roomService).toBeDefined();
      expect(services.gameService).toBeDefined();
      expect(services.relayAddressService).toBeDefined();
    });

    it("accepts custom timerService via options (AC-16 / MAJ-014)", () => {
      const logger = new NullLogger();
      const config = resolveServerBootstrapConfig({ port: 0, logger });
      const mockTimerService = new MockTimerService();
      const services = setupDomainServices(
        { timerService: mockTimerService },
        config.env,
        8080,
        logger,
      );

      expect(services.timerService).toBe(mockTimerService);
    });
  });

  describe("setupHttpLayer", () => {
    it("configures server timeout limits (30s request, 31s headers, 5s keepAlive)", () => {
      const logger = new NullLogger();
      const config = resolveServerBootstrapConfig({ port: 0, logger });
      const domainServices = setupDomainServices({}, config.env, 0, logger);

      const server = setupHttpLayer({
        domainServices,
        bootstrapConfig: config,
        getActiveSocketCount: () => 0,
      });

      expect(server).toBeInstanceOf(http.Server);
      expect(server.requestTimeout).toBe(30_000);
      expect(server.headersTimeout).toBe(31_000);
      expect(server.keepAliveTimeout).toBe(5_000);
    });
  });

  describe("setupSocketLayer and setupSocketGateway", () => {
    it("initializes Socket.io server and rate limiters", () => {
      const logger = new NullLogger();
      const config = resolveServerBootstrapConfig({ port: 0, logger });
      const domainServices = setupDomainServices({}, config.env, 0, logger);
      const server = http.createServer();

      const socketLayer = setupSocketLayer({
        server,
        domainServices,
        bootstrapConfig: config,
      });

      expect(socketLayer.io).toBeDefined();
      expect(socketLayer.rateLimiter).toBeDefined();
      expect(socketLayer.roomCreateRateLimiter).toBeDefined();
    });

    it("registers socket gateway handlers via setupSocketGateway", () => {
      const logger = new NullLogger();
      const config = resolveServerBootstrapConfig({ port: 0, logger });
      const domainServices = setupDomainServices({}, config.env, 0, logger);
      const server = http.createServer();
      const io = createSocketServer(server, { logger });

      expect(() =>
        setupSocketGateway(io, domainServices, {} as any, config.env, logger),
      ).not.toThrow();
    });
  });

  describe("parseFallbackLogLevel", () => {
    it("parses fallback log levels correctly", () => {
      expect(parseFallbackLogLevel("debug")).toBe("debug");
      expect(parseFallbackLogLevel("UNKNOWN")).toBe("info");
    });
  });

  describe("setupLifecycle and setupBackgroundJobs", () => {
    it("sets up cleanup intervals and graceful shutdown coordinator", () => {
      const logger = new NullLogger();
      const config = resolveServerBootstrapConfig({ port: 0, logger });
      const domainServices = setupDomainServices({}, config.env, 0, logger);
      const server = http.createServer();
      const io = createSocketServer(server, { logger });

      const cleanupInterval = setupBackgroundJobs(
        domainServices.roomService,
        logger,
        domainServices.timerService,
      );
      expect(cleanupInterval).toBeDefined();
      domainServices.timerService.clearInterval(cleanupInterval);

      const lifecycle = setupLifecycle({
        server,
        io,
        bootstrapConfig: config,
        domainServices,
        rateLimiter: {} as any,
        roomCreateRateLimiter: {} as any,
      });

      expect(lifecycle.shutdownCoordinator).toBeDefined();
      expect(lifecycle.cleanupInterval).toBeDefined();
      domainServices.timerService.clearInterval(lifecycle.cleanupInterval);
    });

    it("propagates jobCorrelationId from runLoggedJob callback to cleanupAbandonedRooms (AC-13 / MAJ-010)", async () => {
      const logger = new NullLogger();
      const mockTimer = new MockTimerService();
      let capturedCorrelationId: string | undefined;

      const mockRoomService = {
        cleanupAbandonedRooms: vi.fn(
          async (_maxAgeMs?: number, jobCorrelationId?: string) => {
            capturedCorrelationId = jobCorrelationId;
            return 0;
          },
        ),
      } as unknown as IRoomService;

      setupBackgroundJobs(mockRoomService, logger, mockTimer);

      expect(mockTimer.getPendingCount()).toBe(1);
      await mockTimer.advance(5 * 60 * 1000);

      expect(mockRoomService.cleanupAbandonedRooms).toHaveBeenCalledTimes(1);
      expect(capturedCorrelationId).toBeDefined();
      expect(typeof capturedCorrelationId).toBe("string");
      expect(capturedCorrelationId?.length).toBeGreaterThan(0);
    });

    it("wires injected timerService in setupBackgroundJobs and setupDomainServices (AC-16 / MAJ-014)", () => {
      const logger = new NullLogger();
      const mockTimer = new MockTimerService();
      const mockRoomService = {
        cleanupAbandonedRooms: vi.fn(async () => 0),
      } as unknown as IRoomService;

      const handle = setupBackgroundJobs(mockRoomService, logger, mockTimer);
      expect(mockTimer.getPendingCount()).toBe(1);

      mockTimer.clearInterval(handle);
      expect(mockTimer.getPendingCount()).toBe(0);
    });
  });

  describe("startServer composition root", () => {
    it("boots server and exposes all expected public instance handles", async () => {
      instance = await startServer({
        port: 0,
        logger: new NullLogger(),
        autoListen: true,
      });

      expect(instance.port).toBeGreaterThan(0);
      expect(instance.url).toContain(`:${instance.port}`);
      expect(instance.server).toBeDefined();
      expect(instance.io).toBeDefined();
      expect(instance.roomStore).toBeDefined();
      expect(instance.roomService).toBeDefined();
      expect(instance.gameService).toBeDefined();
      expect(instance.sessionRegistry).toBeDefined();
      expect(instance.relayAddressService).toBeDefined();
      expect(instance.timerRegistry).toBeDefined();
      expect(instance.timerService).toBeDefined();
      expect(instance.shutdownCoordinator).toBeDefined();
      expect(typeof instance.close).toBe("function");
    });
  });
});
