import { serializeError, AppError, type IClock } from "@fun-chess/shared";
import type { Logger } from "../../platform/logger/index.js";

export interface ServiceOperationContext {
  /** Operation identifier in snake_case (e.g. "room_create", "game_move") */
  readonly operation: string;
  /** Injected logger instance */
  readonly logger: Logger;
  /** Injected system clock for precise duration measurement */
  readonly clock: IClock;
  /** UUID correlation tracing identifier */
  readonly correlationId?: string;
  /** Structured metadata contextual to the operation (e.g. roomCode, playerId) */
  readonly metadata?: Record<string, unknown>;
  /** Set to true for mutators requiring an operation start log (default: false) */
  readonly logStart?: boolean;
}

/**
 * Standardized service-layer operation executor (MAJ-012).
 * Wraps domain logic with duration measurement, correlation tracing,
 * and semantic error demotion (4xx -> WARN, 500/unexpected -> ERROR).
 */
export async function executeServiceOperation<T>(
  context: ServiceOperationContext,
  action: () => Promise<T>,
): Promise<T> {
  const { operation, logger, clock, correlationId, metadata, logStart } = context;
  const startTime = clock.now();

  if (logStart) {
    logger.info(`Operation started: ${operation}`, {
      operation: `${operation}_started`,
      ...(correlationId ? { correlationId } : {}),
      ...(metadata ? metadata : {}),
    });
  }

  try {
    const result = await action();
    const duration = clock.now() - startTime;

    logger.info(`Operation completed: ${operation}`, {
      operation: `${operation}_success`,
      duration,
      durationMs: duration,
      ...(correlationId ? { correlationId } : {}),
      ...(metadata ? metadata : {}),
    });

    return result;
  } catch (err: unknown) {
    const duration = clock.now() - startTime;
    const isDomainRejection = err instanceof AppError && err.statusCode < 500;

    const logPayload = {
      operation: `${operation}_failed`,
      duration,
      durationMs: duration,
      error: serializeError(err),
      ...(correlationId ? { correlationId } : {}),
      ...(metadata ? metadata : {}),
      ...(err instanceof AppError
        ? { statusCode: err.statusCode, errorCode: err.code }
        : {}),
    };

    if (isDomainRejection) {
      logger.warn(`Operation rejected by domain policy: ${operation}`, logPayload);
    } else {
      logger.error(`Operation failed with internal error: ${operation}`, logPayload);
    }

    throw err;
  }
}
