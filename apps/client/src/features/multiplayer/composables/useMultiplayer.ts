/**
 * Unified Multiplayer facade composable for Fun Chess.
 * Combines useSocketTransport, useRoomSession, and useGameActions into a single,
 * fully backwards-compatible API maintaining module-singleton state (MAJ-013).
 *
 * Adheres to Architectural Patterns Rule 1 (I/O Isolation) and Finding CRIT-005.
 */

import type { TypedSocket } from '@/platform/socket/socket_client';
import {
  useSocketTransport,
  resetTransportState,
  attachSocketListeners,
  detachSocketListeners,
} from './useSocketTransport';
import {
  useRoomSession,
  resetRoomSessionState,
} from './useRoomSession';
import {
  useGameActions,
  resetGameActionsState,
} from './useGameActions';

/**
 * Resets all multiplayer state: transport, room session, game actions,
 * and clears session storage credentials.
 */
export function resetSocketState(): void {
  resetTransportState();
  resetRoomSessionState();
  resetGameActionsState(false);
}

/**
 * Unified multiplayer composable.
 * All instances share identical module-singleton state (MAJ-013).
 *
 * @param injectedSocket - Optional pre-existing socket instance (primarily for testing)
 */
export function useMultiplayer(injectedSocket?: TypedSocket) {
  const existingSocket = useSocketTransport().socket.value;
  if (injectedSocket && existingSocket && existingSocket !== injectedSocket) {
    detachSocketListeners(existingSocket);
    resetTransportState();
    resetRoomSessionState(false);
    resetGameActionsState(false);
  }
  const transport = useSocketTransport(injectedSocket);
  const session = useRoomSession();
  const game = useGameActions();

  if (injectedSocket) {
    transport.socket.value = injectedSocket;
    attachSocketListeners(injectedSocket);
    transport.isConnected.value = injectedSocket.connected;
    transport.socketId.value = injectedSocket.id || '';
    if (injectedSocket.connected) {
      session.checkAndAutoReconnect();
    }
  }

  return {
    // ------------------------------------------------------------------------
    // Transport Reactive State
    // ------------------------------------------------------------------------
    socket: transport.socket,
    isConnected: transport.isConnected,
    socketId: transport.socketId,
    isReconnecting: transport.isReconnecting,
    connectionError: transport.connectionError,
    lastError: transport.lastError,
    latencyMs: transport.latencyMs,

    // ------------------------------------------------------------------------
    // Room Session Reactive State
    // ------------------------------------------------------------------------
    currentRoom: session.currentRoom,
    currentPlayer: session.currentPlayer,
    sessionToken: session.sessionToken,
    isHost: session.isHost,
    isSpectator: session.isSpectator,

    // ------------------------------------------------------------------------
    // In-Game Reactive State
    // ------------------------------------------------------------------------
    gameState: game.gameState,
    turn: game.turn,
    isCheck: game.isCheck,
    isCheckmate: game.isCheckmate,
    drawOfferedBy: game.drawOfferedBy,
    rematchRequestedBy: game.rematchRequestedBy,
    lastGameOver: game.lastGameOver,
    kingInCheck: game.kingInCheck,
    lastMoveEvent: game.lastMoveEvent,

    // ------------------------------------------------------------------------
    // Domain Events
    // ------------------------------------------------------------------------
    onOpponentMove: game.onOpponentMove,

    // ------------------------------------------------------------------------
    // Session Utilities
    // ------------------------------------------------------------------------
    getSavedSession: session.getSavedSession,
    saveSession: session.saveSession,
    clearSession: session.clearSession,
    checkAndAutoReconnect: session.checkAndAutoReconnect,
    resetSocketState,

    // ------------------------------------------------------------------------
    // Transport Actions
    // ------------------------------------------------------------------------
    initSocket: transport.initSocket,
    connect: transport.connect,
    disconnect: transport.disconnect,

    // ------------------------------------------------------------------------
    // Room Lifecycle Actions
    // ------------------------------------------------------------------------
    createRoom: session.createRoom,
    joinRoom: session.joinRoom,
    leaveRoom: session.leaveRoom,
    reconnect: session.reconnect,

    // ------------------------------------------------------------------------
    // Game Negotiation & Move Actions
    // ------------------------------------------------------------------------
    makeMove: game.makeMove,
    resign: game.resign,
    offerDraw: game.offerDraw,
    respondDraw: game.respondDraw,
    acceptDraw: game.acceptDraw,
    declineDraw: game.declineDraw,
    requestRematch: game.requestRematch,
    respondRematch: game.respondRematch,
    acceptRematch: game.acceptRematch,
    declineRematch: game.declineRematch,
  };
}
