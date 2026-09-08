/**
 * Backwards-compatible useSocket adapter facade.
 * Re-exports and delegates directly to useMultiplayer() from @/features/multiplayer (CRIT-005).
 *
 * All existing views, composables, and test suites continue to function seamlessly.
 */

import type { TypedSocket } from '../platform/socket/socket_client';
import {
  useMultiplayer,
  resetSocketState,
  onOpponentMove,
  SESSION_STORAGE_KEY,
  type OpponentMoveCallback,
} from '../features/multiplayer';
import type { SavedSession } from '@fun-chess/shared';

export { SESSION_STORAGE_KEY, resetSocketState, onOpponentMove };
export type { SavedSession, OpponentMoveCallback };

/**
 * Primary Vue 3 composable for managing WebSocket connection, room lifecycle,
 * move synchronization, chat/draw/rematch offers, and session persistence.
 *
 * All instances share module-singleton reactive state (MAJ-013).
 * Delegates to useMultiplayer() feature composable (CRIT-005).
 *
 * @param injectedSocket - Optional pre-existing socket instance (primarily for testing)
 */
export function useSocket(injectedSocket?: TypedSocket) {
  return useMultiplayer(injectedSocket);
}
