/**
 * Module-singleton reactive room session state and persistence for Fun Chess multiplayer.
 * Extracted to break circular dependencies between useRoomSession and useGameActions.
 *
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Finding MAJ-002.
 */

import { ref, computed, getCurrentInstance, type ComputedRef } from 'vue';
import type {
  Player,
  RoomState,
  SavedSession,
  SocketErrorPayload,
} from '@fun-chess/shared';
import { useInjectSessionStorage, resolveLogger } from '@/platform/di';
import { safeSessionStorage, type KeyValueStorage, STORAGE_KEYS } from '@/platform/storage';
import { generateCorrelationId, type ILogger } from '@/platform/telemetry';

/** Session storage key for persisting fun-chess multiplayer sessions */
export const SESSION_STORAGE_KEY = STORAGE_KEYS.SESSION_TOKEN;

export type { SavedSession };

export interface UseRoomSessionOptions {
  storage?: KeyValueStorage;
  logger?: ILogger;
  onRoomClosed?: () => void;
  navigate?: (path: string) => void;
}

let customSessionStorage: KeyValueStorage | null = null;
let customLogger: ILogger | null = null;
let customNavigation: {
  onRoomClosed?: () => void;
  navigate?: (path: string) => void;
} | null = null;

export function setRoomSessionStorage(storage: KeyValueStorage | null): void {
  customSessionStorage = storage;
}

export function setRoomSessionLogger(logger: ILogger | null): void {
  customLogger = logger;
}

export function setRoomSessionNavigation(
  nav: { onRoomClosed?: () => void; navigate?: (path: string) => void } | null
): void {
  customNavigation = nav;
}

export function getCustomNavigation() {
  return customNavigation;
}

/**
 * Dynamically resolves session storage adapter (safe in browser & test environments).
 */
export function getSessionStorage(custom?: KeyValueStorage): KeyValueStorage {
  if (custom) return custom;
  if (customSessionStorage) return customSessionStorage;
  if (getCurrentInstance()) {
    return useInjectSessionStorage();
  }
  return safeSessionStorage;
}

export function getActiveLogger(): ILogger {
  return resolveLogger(customLogger);
}

export const logger: ILogger = {
  debug: (msg, meta) => getActiveLogger().debug(msg, meta),
  info: (msg, meta) => getActiveLogger().info(msg, meta),
  warn: (msg, meta) => getActiveLogger().warn(msg, meta),
  error: (msg, meta) => getActiveLogger().error(msg, meta),
  fatal: (msg, meta) => getActiveLogger().fatal(msg, meta),
  child: (context) => getActiveLogger().child(context),
};

export interface ZodValidationErrorLike {
  errors?: Array<{ path: Array<string | number>; message: string }>;
}

/**
 * Formats a Zod validation error into a readable message.
 */
export function formatZodError(error: ZodValidationErrorLike): string {
  if (Array.isArray(error.errors)) {
    return error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
  }
  return 'Validation error';
}

/**
 * Creates a standard SocketErrorPayload for client validation rejections.
 */
export function createValidationError(error: unknown): SocketErrorPayload {
  return {
    code: 'ERR_INVALID_PAYLOAD',
    message: formatZodError(error as ZodValidationErrorLike),
    correlationId: generateCorrelationId(),
  };
}

/**
 * Retrieves the saved session from sessionStorage if available.
 */
export function getSavedSession(): SavedSession | null {
  const storage = getSessionStorage();
  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.roomCode === 'string' &&
      typeof parsed.playerId === 'string' &&
      typeof parsed.sessionToken === 'string'
    ) {
      return parsed as SavedSession;
    }
    return null;
  } catch (err) {
    logger.warn('Failed to parse saved session from storage', {
      operation: 'socket_get_saved_session',
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Persists active session credentials into sessionStorage.
 *
 * Security Rationale & Accepted Risk (MIN-006):
 * Session tokens for multiplayer rooms are persisted in browser `sessionStorage`
 * to support page reloads and transient disconnect recovery within the same browser tab.
 *
 * Accepted Risk Assessment:
 * 1. Scope: sessionStorage is sandboxed to the origin and cleared when the browser tab closes.
 *    Tokens are transient and scoped only to active match sessions (max 24h room TTL).
 * 2. Defense in Depth: Fun Chess enforces a strict Content Security Policy (CSP) with no untrusted
 *    scripts allowed, mitigating Cross-Site Scripting (XSS) vectors that could read sessionStorage.
 * 3. Architecture Constraints: As a client-side SPA communicating over WebSockets, HTTP-only cookies
 *    are not automatically dispatched on socket events across decoupled origins/LAN environments.
 * 4. Token Invalidation: Tokens are strictly transient session credentials invalidated immediately
 *    upon room teardown, explicit leave, or disconnect grace-period forfeiture on the server.
 */
export function saveSession(session: SavedSession): void {
  const storage = getSessionStorage();
  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    logger.warn('Failed to save session to storage', {
      operation: 'socket_save_session',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Removes the active session credentials from sessionStorage.
 */
export function clearSession(): void {
  const storage = getSessionStorage();
  try {
    storage.removeItem(SESSION_STORAGE_KEY);
  } catch (err) {
    logger.warn('Failed to clear session from storage', {
      operation: 'socket_clear_session',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ----------------------------------------------------------------------------
// Module-Singleton Reactive Room Session State (MAJ-013)
// ----------------------------------------------------------------------------
export const currentRoom = ref<RoomState | null>(null);
export const currentPlayer = ref<Player | null>(null);
export const sessionToken = ref<string | null>(null);

export const isHost: ComputedRef<boolean> = computed(() => {
  if (!currentRoom.value || !currentPlayer.value) return false;
  return currentRoom.value.hostId === currentPlayer.value.id;
});

export const isSpectator: ComputedRef<boolean> = computed(() => {
  if (!currentRoom.value || !currentPlayer.value) return false;
  return currentRoom.value.spectators?.some((s) => s.id === currentPlayer.value?.id) ?? false;
});
