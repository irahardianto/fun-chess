import { Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { TypedSocketServer } from "../socket/socket_server.js";
import { Logger } from "../logger/logger.interface.js";

export interface HttpServerWithConnectionControl {
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
}

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
 * Ensures active sockets are disconnected and idle connections closed (MAJ-010).
 * Measures and logs shutdown duration (MIN-013) with correlation IDs (MAJ-016).
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
  private sigintHandler?: () => void;
  private sigtermHandler?: () => void;
  private unhandledRejectionHandler?: (reason: unknown) => void;
  private uncaughtExceptionHandler?: (err: Error) => void;
  private serverErrorHandler?: (err: Error) => void;
  private isDisposed = false;

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
    if (typeof this.logger.fatal === "function") {
      this.logger.fatal(message, context);
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
   * Accepts optional correlationId, defaulting to randomUUID() (MAJ-016).
   */
  public async shutdown(signal: string, correlationId?: string): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;
    const corrId = correlationId ?? randomUUID();
    const startTime = performance.now();
    let exitCode = 0;
    let exitTriggered = false;

    const triggerExit = (code: number) => {
      if (!exitTriggered) {
        exitTriggered = true;
        this.onExit(code);
      }
    };

    this.logger.info("Shutdown signal received, initiating graceful shutdown", {
      operation: "server_shutdown",
      correlationId: corrId,
      signal,
      status: "started",
    });

    try {
      // 1. Clear background interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = undefined;
      }

      // 2. Run additional cleanup tasks in isolated try/catch blocks (MAJ-002)
      for (const cleanup of this.additionalCleanups) {
        try {
          await cleanup();
        } catch (err) {
          this.logger.error("Error during shutdown cleanup task", {
            operation: "server_shutdown",
            status: "cleanup_error",
            correlationId: corrId,
            error:
              err instanceof Error
                ? { name: err.name, message: err.message, stack: err.stack }
                : { raw: err },
          });
        }
      }

      // 3. Set force exit timer in case sockets or server hang
      const timeoutPromise = new Promise<"timeout">((resolve) => {
        this.forceExitTimer = setTimeout(() => {
          const duration = Math.round(performance.now() - startTime);
          this.logFatal("Forced shutdown due to timeout waiting for connections to close.", {
            operation: "server_shutdown",
            status: "timeout",
            correlationId: corrId,
            timeoutMs: this.timeoutMs,
            duration,
            durationMs: duration,
          });
          exitCode = 1;
          triggerExit(1);
          resolve("timeout");
        }, this.timeoutMs);

        if (typeof this.forceExitTimer.unref === "function") {
          this.forceExitTimer.unref();
        }
      });

      // 4. Disconnect all sockets and close idle/all connections before closing (MAJ-010)
      if (typeof this.io.disconnectSockets === "function") {
        this.io.disconnectSockets(true);
      }
      const serverWithControl = this.server as unknown as HttpServerWithConnectionControl;
      if (typeof serverWithControl.closeIdleConnections === "function") {
        serverWithControl.closeIdleConnections();
      }
      if (typeof serverWithControl.closeAllConnections === "function") {
        serverWithControl.closeAllConnections();
      }

      // 5. Close Socket.io server and HTTP server concurrently
      const closeServers = Promise.all([
        new Promise<void>((resolve, reject) => {
          this.io.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        }),
        new Promise<void>((resolve, reject) => {
          this.server.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        }),
      ]);

      const outcome = await Promise.race([closeServers.then(() => "ok" as const), timeoutPromise]);

      if (outcome === "ok") {
        const duration = Math.round(performance.now() - startTime);
        this.logger.info("Fun Chess server closed successfully.", {
          operation: "server_shutdown",
          status: "completed",
          correlationId: corrId,
          duration,
          durationMs: duration,
        });
        exitCode = 0;
      } else {
        exitCode = 1;
      }
    } catch (err) {
      exitCode = 1;
      const duration = Math.round(performance.now() - startTime);
      this.logFatal("Error closing server during shutdown", {
        operation: "server_shutdown",
        status: "error",
        correlationId: corrId,
        duration,
        durationMs: duration,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : { raw: err },
      });
    } finally {
      if (this.forceExitTimer) {
        clearTimeout(this.forceExitTimer);
        this.forceExitTimer = undefined;
      }
      triggerExit(exitCode);
    }
  }

  /**
   * Installs process-level signal listeners and crash guards.
   * Retains handler references to prevent listener leaks (MAJ-010).
   */
  public installProcessHandlers(): void {
    if (this.isDisposed) return;

    this.sigintHandler = () => {
      void this.shutdown("SIGINT");
    };

    this.sigtermHandler = () => {
      void this.shutdown("SIGTERM");
    };

    this.unhandledRejectionHandler = (reason: unknown) => {
      const correlationId = randomUUID();
      this.logger.error("Unhandled promise rejection", {
        operation: "unhandled_rejection",
        correlationId,
        error:
          reason instanceof Error
            ? { name: reason.name, message: reason.message, stack: reason.stack }
            : { raw: reason },
      });
      void this.shutdown("unhandledRejection", correlationId);
    };

    this.uncaughtExceptionHandler = (err: Error) => {
      const correlationId = randomUUID();
      this.logFatal("Uncaught exception, initiating emergency shutdown", {
        operation: "uncaught_exception",
        correlationId,
        error: { name: err.name, message: err.message, stack: err.stack },
      });
      void this.shutdown("uncaughtException", correlationId);
    };

    this.serverErrorHandler = (err: Error) => {
      const correlationId = randomUUID();
      this.logFatal("HTTP server fatal socket error", {
        operation: "server_error",
        correlationId,
        error: { name: err.name, message: err.message, stack: err.stack },
      });
      void this.shutdown("serverError", correlationId);
    };

    process.on("SIGINT", this.sigintHandler);
    process.on("SIGTERM", this.sigtermHandler);
    process.on("unhandledRejection", this.unhandledRejectionHandler);
    process.on("uncaughtException", this.uncaughtExceptionHandler);
    this.server.on("error", this.serverErrorHandler);
  }

  /**
   * Uninstalls all process-level and server event listeners (MAJ-010).
   */
  public uninstallProcessHandlers(): void {
    if (this.sigintHandler) {
      process.removeListener("SIGINT", this.sigintHandler);
      this.sigintHandler = undefined;
    }
    if (this.sigtermHandler) {
      process.removeListener("SIGTERM", this.sigtermHandler);
      this.sigtermHandler = undefined;
    }
    if (this.unhandledRejectionHandler) {
      process.removeListener("unhandledRejection", this.unhandledRejectionHandler);
      this.unhandledRejectionHandler = undefined;
    }
    if (this.uncaughtExceptionHandler) {
      process.removeListener("uncaughtException", this.uncaughtExceptionHandler);
      this.uncaughtExceptionHandler = undefined;
    }
    if (this.serverErrorHandler) {
      this.server.removeListener("error", this.serverErrorHandler);
      this.serverErrorHandler = undefined;
    }
  }

  /**
   * Uninstalls all process handlers, cancels pending timers, and disposes resources (MAJ-010).
   */
  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    this.uninstallProcessHandlers();

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    if (this.forceExitTimer) {
      clearTimeout(this.forceExitTimer);
      this.forceExitTimer = undefined;
    }
  }
}
