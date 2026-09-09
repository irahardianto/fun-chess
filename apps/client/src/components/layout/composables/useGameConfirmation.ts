/**
 * Match confirmation dialog composable for Fun Chess app shell.
 * Encapsulates resign and leave match confirmation workflows (MAJ-019).
 */

import type { Ref } from 'vue';
import type { ConfirmationOptions } from './useModalManager';
import { logger } from '@/platform/telemetry';

export interface UseGameConfirmationOptions {
  currentRoom: Ref<{ roomCode: string; status: string } | null>;
  currentAppMode: Ref<string>;
  showGameOverModal: Ref<boolean>;
  leaveRoom: (roomCode: string) => unknown;
  resign: (roomCode: string) => unknown;
  offerDraw?: (roomCode: string) => unknown;
  requestConfirmation: (options: ConfirmationOptions) => void;
}

export function useGameConfirmation(options: UseGameConfirmationOptions) {
  const {
    currentRoom,
    currentAppMode,
    showGameOverModal,
    leaveRoom,
    resign,
    offerDraw,
    requestConfirmation,
  } = options;

  function executeLeave(roomCode: string): void {
    try {
      showGameOverModal.value = false;
      currentAppMode.value = 'lobby';
      const result = leaveRoom(roomCode);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((err: unknown) => {
          logger.warn('Async rejection in leaveRoom', {
            operation: 'match_confirmation_leave_room',
            roomCode,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err: unknown) {
      logger.warn('Synchronous error in leaveRoom', {
        operation: 'match_confirmation_leave_room',
        roomCode,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleConfirmLeaveRoom(): Promise<void> {
    const activeRoom = currentRoom.value;
    if (!activeRoom) return;
    try {
      showGameOverModal.value = false;
      currentAppMode.value = 'lobby';
      await leaveRoom(activeRoom.roomCode);
    } catch (err: unknown) {
      logger.warn('Error while confirming leave room', {
        operation: 'match_confirmation_leave_room',
        roomCode: activeRoom.roomCode,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function executeResign(roomCode: string): void {
    try {
      const result = resign(roomCode);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((err: unknown) => {
          logger.warn('Async rejection in resign', {
            operation: 'match_confirmation_resign',
            roomCode,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err: unknown) {
      logger.warn('Synchronous error in resign', {
        operation: 'match_confirmation_resign',
        roomCode,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleConfirmResign(): Promise<void> {
    const activeRoom = currentRoom.value;
    if (!activeRoom) return;
    try {
      await resign(activeRoom.roomCode);
    } catch (err: unknown) {
      logger.warn('Error while confirming resign', {
        operation: 'match_confirmation_resign',
        roomCode: activeRoom.roomCode,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function executeOfferDraw(roomCode: string): void {
    if (!offerDraw) return;
    try {
      const result = offerDraw(roomCode);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((err: unknown) => {
          logger.warn('Async rejection in offerDraw', {
            operation: 'match_confirmation_offer_draw',
            roomCode,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err: unknown) {
      logger.warn('Synchronous error in offerDraw', {
        operation: 'match_confirmation_offer_draw',
        roomCode,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleConfirmDrawOffer(): Promise<void> {
    const activeRoom = currentRoom.value;
    if (!activeRoom || !offerDraw) return;
    try {
      await offerDraw(activeRoom.roomCode);
    } catch (err: unknown) {
      logger.warn('Error while confirming draw offer', {
        operation: 'match_confirmation_offer_draw',
        roomCode: activeRoom.roomCode,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleLeaveRoom(force = false): void {
    if (!currentRoom.value) return;
    if (force || currentRoom.value.status !== 'playing') {
      executeLeave(currentRoom.value.roomCode);
      return;
    }
    requestConfirmation({
      title: 'Leave Match?',
      message: 'Leave match and return to lobby? Your active game will be forfeited.',
      confirmButtonText: 'Leave Match',
      cancelButtonText: 'Keep Playing',
      variant: 'danger',
      onConfirm: handleConfirmLeaveRoom,
    });
  }

  function handleResign(force = false): void {
    if (!currentRoom.value) return;
    if (force || currentRoom.value.status !== 'playing') {
      executeResign(currentRoom.value.roomCode);
      return;
    }
    requestConfirmation({
      title: 'Resign Match?',
      message: 'Resign this match and award victory to your opponent?',
      confirmButtonText: 'Resign',
      cancelButtonText: 'Keep Playing',
      variant: 'danger',
      onConfirm: handleConfirmResign,
    });
  }

  function handleOfferDraw(force = false): void {
    if (!currentRoom.value || !offerDraw) return;
    if (force || currentRoom.value.status !== 'playing') {
      executeOfferDraw(currentRoom.value.roomCode);
      return;
    }
    requestConfirmation({
      title: 'Offer Draw?',
      message: 'Offer a draw to your opponent?',
      confirmButtonText: 'Offer Draw',
      cancelButtonText: 'Keep Playing',
      variant: 'primary',
      onConfirm: handleConfirmDrawOffer,
    });
  }

  return {
    handleLeaveRoom,
    handleResign,
    handleOfferDraw,
    handleConfirmLeaveRoom,
    handleConfirmResign,
    handleConfirmDrawOffer,
  };
}
