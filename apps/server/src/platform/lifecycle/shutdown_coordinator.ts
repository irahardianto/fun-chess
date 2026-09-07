import { Server as HttpServer } from "node:http";
import { TypedSocketServer } from "../socket/socket_server.js";
import { Logger } from "../logger/logger.interface.js";

export interface ShutdownCoordinatorOptions {
  server: HttpServer;
  io: TypedSocketServer;
  logger: Logger;
  cleanupInterval?: NodeJS.Timeout;
  timeoutMs?: number;
  onExit?: (code: number) => void;
  additionalCleanups?: Array<() => void | Promise<void>>;
}

/**
 * Coordinates graceful shutdown, timer disposal, socket draining,
 * and process crash guarding for the Fun Chess server.
 */
export class ShutdownCoordinator {
  private isShuttingDown = false;
  private readonly server: HttpServer;
  private readonly io: TypedSocketServer;
  private readonly logger: Logger;
  private cleanupInterval?: NodeJS.Timeout;
  private readonly timeoutMs: number;
  private readonly onExit: (code: number) => void;
  private readonly additionalCleanups: Array<() => void | Promise<void>>;
  private forceExitTimer?: NodeJS.Timeout;

  constructor(options: ShutdownCoordinatorOptions) {
    this.server = options.server;
    this.io = options.io;
    this.logger = options.logger;
    this.cleanupInterval = options.cleanupInterval;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.onExit = options.onExit ?? ((code: number) => process.exit(code));
    this.additionalCleanups = options.additionalCleanups ? [...options.additionalCleanups] : [];
  }

  private logFatal(message: string, context?: Record<string, unknown>): void {
    if (typeof (this.logger as any).fatal === "function") {
      (this.logger as any).fatal(message, context);
    } else {
      this.logger.error(message, context);
    }
  }

  public setCleanupInterval(interval: NodeJS.Timeout): void {
    this.cleanupInterval = interval;
  }

  public addCleanup(fn: () => void | Promise<void>): void {
    this.additionalCleanups.push(fn);
  }

  /**
   * Initiates graceful shutdown sequence.
   */
  public async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;

    this.logger.info(`Received ${signal}. Shutting down gracefully...`, {
      operation: "server_shutdown",
      signal,
    });

    // 1. Clear background interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    // 2. Run additional cleanup tasks (e.g. clear disconnect timers)
    for (const cleanup of this.additionalCleanups) {
      try {
        await cleanup();
      } catch (err) {
        this.logger.error("Error during shutdown cleanup task", {
          operation: "shutdown_cleanup_error",
          error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : { raw: err },
        });
      }
    }

    // 3. Set force exit timer in case sockets or server hang
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      this.forceExitTimer = setTimeout(() => {
        this.logFatal("Forced shutdown due to timeout waiting for connections to close.", {
          operation: "server_shutdown_timeout",
          timeoutMs: this.timeoutMs,
        });
        this.onExit(1);
        resolve("timeout");
      }, this.timeoutMs);

      if (typeof this.forceExitTimer.unref === "function") {
        this.forceExitTimer.unref();
      }
    });

    // 4. Close Socket.io server and HTTP server concurrently
    const closeServers = Promise.all([
      new Promise<void>((resolve) => {
        this.io.close(() => resolve());
      }),
      new Promise<void>((resolve) => {
        this.server.close(() => resolve());
      }),
    ]);

    try {
      const outcome = await Promise.race([closeServers.then(() => "ok" as const), timeoutPromise]);

      if (this.forceExitTimer) {
        clearTimeout(this.forceExitTimer);
      }

      if (outcome === "ok") {
        this.logger.info("Fun Chess server closed successfully.", {
          operation: "server_shutdown_complete",
        });
        this.onExit(0);
      }
    } catch (err) {
      if (this.forceExitTimer) {
        clearTimeout(this.forceExitTimer);
      }

      this.logFatal("Error closing server during shutdown", {
        operation: "server_shutdown_error",
        error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : { raw: err },
      });

      this.onExit(1);
    }
  }

  /**
   * Installs process-level signal listeners and crash guards.
   */
  public installProcessHandlers(): void {
    process.on("SIGINT", () => {
      void this.shutdown("SIGINT");
    });

    process.on("SIGTERM", () => {
      void this.shutdown("SIGTERM");
    });

    process.on("unhandledRejection", (reason: unknown) => {
      this.logger.error("Unhandled promise rejection", {
        operation: "unhandled_rejection",
        error: reason instanceof Error
          ? { name: reason.name, message: reason.message, stack: reason.stack }
          : { raw: reason },
      });
    });

    process.on("uncaughtException", (err: Error) => {
      this.logFatal("Uncaught exception, initiating emergency shutdown", {
        operation: "uncaught_exception",
        error: { name: err.name, message: err.message, stack: err.stack },
      });
      void this.shutdown("uncaughtException");
    });

    this.server.on("error", (err: Error) => {
      this.logFatal("HTTP server fatal socket error", {
        operation: "server_error",
        error: { name: err.name, message: err.message, stack: err.stack },
      });
      void this.shutdown("serverError");
    });
  }
}
