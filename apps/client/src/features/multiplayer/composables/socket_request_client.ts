/**
 * Typed socket request/response RPC client with timeout handling and error mapping for Fun Chess multiplayer.
 * Encapsulates emitWithTimeout, acknowledgment callbacks, latency tracking, mid-flight disconnect abort,
 * and 3-point structured telemetry logging.
 *
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Findings MAJ-017, ENH-013.
 */

import type { Ref } from 'vue';
import type { SocketErrorPayload } from '@fun-chess/shared';
import type { TypedSocket } from '@/platform/socket/socket_client';
import { resolveLogger } from '@/platform/di';
import { generateCorrelationId, type ILogger } from '@/platform/telemetry';
import {
  latencyMs as defaultLatencyMs,
  lastError as defaultLastError,
  socket as defaultSocket,
} from './socket_connection_manager';

export interface EmitWithTimeoutOptions<TRes extends { success: boolean; error?: SocketErrorPayload }> {
  timeoutMs?: number;
  timeoutMessage: string;
  operation: string;
  correlationId?: string;
  rejectOnError?: boolean; // MIN-003: Optional flag allowing caller to reject promise
  callback?: (res: TRes) => void;
  onSuccess?: (res: Extract<TRes, { success: true }>) => void;
  onError?: (err: SocketErrorPayload) => void;
}

function getActiveLogger(custom?: ILogger | null): ILogger {
  return resolveLogger(custom);
}

const logger: ILogger = {
  debug: (msg, meta) => getActiveLogger().debug(msg, meta),
  info: (msg, meta) => getActiveLogger().info(msg, meta),
  warn: (msg, meta) => getActiveLogger().warn(msg, meta),
  error: (msg, meta) => getActiveLogger().error(msg, meta),
  fatal: (msg, meta) => getActiveLogger().fatal(msg, meta),
  child: (context) => getActiveLogger().child(context),
};

/**
 * Standard socket emit with timeout handling, latency measurement, and 3-point structured logging.
 * Handles mid-flight disconnect abort (ENH-013).
 */
export function emitWithTimeout<TReq, TRes extends { success: boolean; error?: SocketErrorPayload }>(
  targetSocket: TypedSocket,
  event: string,
  payload: TReq,
  options: EmitWithTimeoutOptions<TRes>,
  stateRefs?: {
    latencyMs?: Ref<number>;
    lastError?: Ref<SocketErrorPayload | null>;
  }
): Promise<TRes> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const startTime = Date.now();
  const correlationId = options.correlationId || generateCorrelationId();
  const { operation, callback } = options;
  const latencyRef = stateRefs?.latencyMs ?? defaultLatencyMs;
  const lastErrorRef = stateRefs?.lastError ?? defaultLastError;

  logger.info('Socket emit dispatched', {
    operation,
    correlationId,
    event,
  });

  return new Promise<TRes>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      if (typeof (targetSocket as unknown as { off?: (e: string, fn: (...args: unknown[]) => void) => void }).off === 'function') {
        (targetSocket as unknown as { off: (e: string, fn: (...args: unknown[]) => void) => void }).off('disconnect', onDisconnect);
      }
    };

    const onDisconnect = (reason?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      const duration = Date.now() - startTime;
      latencyRef.value = duration;

      const err: SocketErrorPayload = {
        code: 'ERR_SOCKET_DISCONNECTED',
        message: 'Socket disconnected while operation was in flight',
        correlationId,
      };
      lastErrorRef.value = err;

      logger.warn('Socket operation aborted due to unexpected disconnect', {
        operation,
        correlationId,
        duration,
        durationMs: duration,
        event,
        error: err,
        reason,
      });

      options.onError?.(err);
      const res = { success: false, error: err } as unknown as TRes;
      if (callback) {
        callback(res);
      }
      if (options.rejectOnError) {
        reject(err);
      } else {
        resolve(res);
      }
    };

    if (typeof (targetSocket as unknown as { once?: (e: string, fn: (...args: unknown[]) => void) => void }).once === 'function') {
      (targetSocket as unknown as { once: (e: string, fn: (...args: unknown[]) => void) => void }).once('disconnect', onDisconnect);
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      const duration = Date.now() - startTime;
      latencyRef.value = duration;

      const err: SocketErrorPayload = {
        code: 'ERR_SOCKET_TIMEOUT',
        message: options.timeoutMessage,
        correlationId,
      };
      lastErrorRef.value = err;

      logger.warn('Socket operation timed out', {
        operation,
        correlationId,
        duration,
        durationMs: duration,
        event,
        error: err,
      });

      options.onError?.(err);
      const res = { success: false, error: err } as unknown as TRes;
      if (callback) {
        callback(res);
      }
      if (options.rejectOnError) {
        reject(err);
      } else {
        resolve(res);
      }
    }, timeoutMs);

    (targetSocket as unknown as { emit: (e: string, p: unknown, cb: (r: TRes) => void) => void }).emit(event, payload, (res: TRes) => {
      if (settled) return;
      settled = true;
      cleanup();
      const duration = Date.now() - startTime;
      latencyRef.value = duration;

      if (res && res.success) {
        logger.info('Socket operation succeeded successfully', {
          operation,
          correlationId,
          duration,
          durationMs: duration,
          event,
        });
        options.onSuccess?.(res as Extract<TRes, { success: true }>);
        if (callback) {
          callback(res);
        }
        resolve(res);
      } else {
        const errPayload: SocketErrorPayload = res?.error ?? {
          code: 'ERR_INTERNAL_SERVER',
          message: 'Socket operation failed',
          correlationId,
        };
        lastErrorRef.value = errPayload;

        if (errPayload.code === 'ERR_INTERNAL_SERVER') {
          logger.error('Socket operation failed with failure', {
            operation,
            correlationId,
            duration,
            durationMs: duration,
            event,
            error: errPayload,
          });
        } else {
          logger.warn('Socket operation failed with failure', {
            operation,
            correlationId,
            duration,
            durationMs: duration,
            event,
            error: errPayload,
          });
        }
        options.onError?.(errPayload);
        if (callback) {
          callback(res);
        }
        if (options.rejectOnError) {
          reject(errPayload);
        } else {
          resolve(res);
        }
      }
    });
  });
}

export interface UseSocketRequestClientOptions {
  logger?: ILogger;
}

/**
 * Composable providing typed request/response RPC emission over a socket.
 */
export function useSocketRequestClient(
  targetSocket?: TypedSocket,
  _options?: UseSocketRequestClientOptions
) {
  return {
    emitWithTimeout: <TReq, TRes extends { success: boolean; error?: SocketErrorPayload }>(
      event: string,
      payload: TReq,
      opts: EmitWithTimeoutOptions<TRes>
    ) => {
      const sock = targetSocket || defaultSocket.value;
      if (!sock) {
        throw new Error('No socket available for request client emission');
      }
      return emitWithTimeout(sock, event, payload, opts);
    },
    emit: emitWithTimeout,
  };
}
