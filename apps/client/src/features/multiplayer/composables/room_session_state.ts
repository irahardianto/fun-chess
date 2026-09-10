/**
 * Module-singleton reactive room session state and persistence for Fun Chess multiplayer.
 * Extracted to break circular dependencies between useRoomSession and useGameActions.
 *
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Finding MAJ-002.
 */

import {
  ref,
  computed,
  getCurrentInstance,
  hasInjectionContext,
  inject,
  type ComputedRef,
  type Ref,
  type InjectionKey,
} from 'vue';
import type {
  Player,
  RoomState,
  RoomStatus,
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

export type SessionResetHook = (clearStorage?: boolean) => void;
const sessionResetHooks = new Set<SessionResetHook>();

/**
 * Registers a hook to be invoked when a room session departs or resets (MAJ-009).
 * Decouples useRoomSession from direct static dependencies on useGameActions.
 */
export function registerSessionResetHook(hook: SessionResetHook): () => void {
  sessionResetHooks.add(hook);
  return () => {
    sessionResetHooks.delete(hook);
  };
}

/**
 * Notifies all registered reset subscribers that the active session has been torn down.
 */
export function notifySessionReset(clearStorage = true): void {
  sessionResetHooks.forEach((hook) => {
    try {
      hook(clearStorage);
    } catch (err) {
      logger.warn('Error executing session reset hook', {
        operation: 'session_reset_hook',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

export type RoomReconnectedHook = (payload: { room: RoomState; player: Player; roomStatus?: RoomStatus }) => void;
const roomReconnectedHooks = new Set<RoomReconnectedHook>();

/**
 * Registers a hook to be invoked when a room session successfully reconnects (MAJ-003).
 * Decouples useRoomSession from direct static dependencies on useGameActions.
 */
export function registerRoomReconnectedHook(hook: RoomReconnectedHook): () => void {
  roomReconnectedHooks.add(hook);
  return () => {
    roomReconnectedHooks.delete(hook);
  };
}

/**
 * Notifies all registered subscribers of room reconnection for state rehydration (MAJ-003).
 */
export function notifyRoomReconnected(payload: { room: RoomState; player: Player; roomStatus?: RoomStatus }): void {
  roomReconnectedHooks.forEach((hook) => {
    try {
      hook(payload);
    } catch (err) {
      logger.warn('Error executing room reconnected hook', {
        operation: 'room_reconnected_hook',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
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
// Room Session State Factory & DI (MAJ-020)
// ----------------------------------------------------------------------------
export interface RoomSessionState {
  currentRoom: Ref<RoomState | null>;
  currentPlayer: Ref<Player | null>;
  sessionToken: Ref<string | null>;
  isHost: ComputedRef<boolean>;
  isSpectator: ComputedRef<boolean>;
  reset: (clearStorage?: boolean) => void;
}

export const ROOM_SESSION_STATE_KEY: InjectionKey<RoomSessionState> = Symbol('ROOM_SESSION_STATE_KEY');

export function createRoomSessionState(): RoomSessionState {
  const room = ref<RoomState | null>(null);
  const player = ref<Player | null>(null);
  const token = ref<string | null>(null);

  const host: ComputedRef<boolean> = computed(() => {
    if (!room.value || !player.value) return false;
    return room.value.hostId === player.value.id;
  });

  const spectator: ComputedRef<boolean> = computed(() => {
    if (!room.value || !player.value) return false;
    return room.value.spectators?.some((s) => s.id === player.value?.id) ?? false;
  });

  function reset(clearStorage = true): void {
    room.value = null;
    player.value = null;
    token.value = null;
    if (clearStorage) {
      clearSession();
    }
  }

  return {
    currentRoom: room,
    currentPlayer: player,
    sessionToken: token,
    isHost: host,
    isSpectator: spectator,
    reset,
  };
}

export const defaultRoomSessionState = createRoomSessionState();

export function useRoomSessionState(): RoomSessionState {
  if (hasInjectionContext()) {
    const injected = inject(ROOM_SESSION_STATE_KEY, null);
    if (injected) return injected;
  }
  return defaultRoomSessionState;
}

export const currentRoom = defaultRoomSessionState.currentRoom;
export const currentPlayer = defaultRoomSessionState.currentPlayer;
export const sessionToken = defaultRoomSessionState.sessionToken;
export const isHost = defaultRoomSessionState.isHost;
export const isSpectator = defaultRoomSessionState.isSpectator;

export function resetRoomSessionState(clearStorage = true): void {
  defaultRoomSessionState.reset(clearStorage);
}
