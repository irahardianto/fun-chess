import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, type Ref } from 'vue';
import { useGameConfirmation } from '../useGameConfirmation';
import type { ConfirmationOptions } from '../useModalManager';

describe('useGameConfirmation', () => {
  let currentRoom: Ref<{ roomCode: string; status: string } | null>;
  let currentAppMode: Ref<string>;
  let showGameOverModal: Ref<boolean>;
  let leaveRoomMock: ReturnType<typeof vi.fn<(roomCode: string) => void>>;
  let resignMock: ReturnType<typeof vi.fn<(roomCode: string) => void>>;
  let offerDrawMock: ReturnType<typeof vi.fn<(roomCode: string) => void>>;
  let requestConfirmationMock: ReturnType<typeof vi.fn<(options: ConfirmationOptions) => void>>;
  let lastConfirmationOptions: ConfirmationOptions | null;

  beforeEach(() => {
    currentRoom = ref<{ roomCode: string; status: string } | null>({ roomCode: 'ROOM1', status: 'playing' });
    currentAppMode = ref<string>('multiplayer');
    showGameOverModal = ref<boolean>(true);
    leaveRoomMock = vi.fn<(roomCode: string) => void>();
    resignMock = vi.fn<(roomCode: string) => void>();
    offerDrawMock = vi.fn<(roomCode: string) => void>();
    lastConfirmationOptions = null;
    requestConfirmationMock = vi.fn<(options: ConfirmationOptions) => void>((opts: ConfirmationOptions) => {
      lastConfirmationOptions = opts;
    });
  });

  const createComposable = (extraOpts: Record<string, any> = {}) =>
    useGameConfirmation({
      currentRoom,
      currentAppMode,
      showGameOverModal,
      leaveRoom: leaveRoomMock,
      resign: resignMock,
      offerDraw: offerDrawMock,
      requestConfirmation: requestConfirmationMock,
      ...extraOpts,
    });

  describe('handleLeaveRoom', () => {
    it('does nothing if currentRoom is null', () => {
      currentRoom.value = null;
      const { handleLeaveRoom } = createComposable();
      handleLeaveRoom();
      expect(leaveRoomMock).not.toHaveBeenCalled();
      expect(requestConfirmationMock).not.toHaveBeenCalled();
    });

    it('leaves immediately without confirmation if status is not playing', () => {
      currentRoom.value = { roomCode: 'ROOM1', status: 'lobby' };
      const { handleLeaveRoom } = createComposable();
      handleLeaveRoom();
      expect(leaveRoomMock).toHaveBeenCalledWith('ROOM1');
      expect(showGameOverModal.value).toBe(false);
      expect(currentAppMode.value).toBe('lobby');
      expect(requestConfirmationMock).not.toHaveBeenCalled();
    });

    it('leaves immediately when force is true even if playing', () => {
      const { handleLeaveRoom } = createComposable();
      handleLeaveRoom(true);
      expect(leaveRoomMock).toHaveBeenCalledWith('ROOM1');
      expect(showGameOverModal.value).toBe(false);
      expect(currentAppMode.value).toBe('lobby');
      expect(requestConfirmationMock).not.toHaveBeenCalled();
    });

    it('requests confirmation when playing and force is false', () => {
      const { handleLeaveRoom } = createComposable();
      handleLeaveRoom(false);
      expect(requestConfirmationMock).toHaveBeenCalledTimes(1);
      expect(leaveRoomMock).not.toHaveBeenCalled();
      expect(lastConfirmationOptions).not.toBeNull();
      expect(lastConfirmationOptions?.title).toBe('Leave Match?');
      expect(lastConfirmationOptions?.variant).toBe('danger');

      // Execute onConfirm
      lastConfirmationOptions?.onConfirm();
      expect(leaveRoomMock).toHaveBeenCalledWith('ROOM1');
      expect(showGameOverModal.value).toBe(false);
      expect(currentAppMode.value).toBe('lobby');
    });

    it('handles onConfirm safely when currentRoom became null before confirm', () => {
      const { handleLeaveRoom } = createComposable();
      handleLeaveRoom(false);
      expect(lastConfirmationOptions).not.toBeNull();

      currentRoom.value = null;
      lastConfirmationOptions?.onConfirm();
      expect(leaveRoomMock).not.toHaveBeenCalled();
    });
  });

  describe('handleResign', () => {
    it('does nothing if currentRoom is null', () => {
      currentRoom.value = null;
      const { handleResign } = createComposable();
      handleResign();
      expect(resignMock).not.toHaveBeenCalled();
      expect(requestConfirmationMock).not.toHaveBeenCalled();
    });

    it('resigns immediately without confirmation if status is not playing', () => {
      currentRoom.value = { roomCode: 'ROOM1', status: 'lobby' };
      const { handleResign } = createComposable();
      handleResign();
      expect(resignMock).toHaveBeenCalledWith('ROOM1');
      expect(requestConfirmationMock).not.toHaveBeenCalled();
    });

    it('resigns immediately when force is true even if playing', () => {
      const { handleResign } = createComposable();
      handleResign(true);
      expect(resignMock).toHaveBeenCalledWith('ROOM1');
      expect(requestConfirmationMock).not.toHaveBeenCalled();
    });

    it('requests confirmation when playing and force is false', () => {
      const { handleResign } = createComposable();
      handleResign(false);
      expect(requestConfirmationMock).toHaveBeenCalledTimes(1);
      expect(resignMock).not.toHaveBeenCalled();
      expect(lastConfirmationOptions).not.toBeNull();
      expect(lastConfirmationOptions?.title).toBe('Resign Match?');
      expect(lastConfirmationOptions?.variant).toBe('danger');

      // Execute onConfirm
      lastConfirmationOptions?.onConfirm();
      expect(resignMock).toHaveBeenCalledWith('ROOM1');
    });

    it('handles onConfirm safely when currentRoom became null before confirm', () => {
      const { handleResign } = createComposable();
      handleResign(false);
      expect(lastConfirmationOptions).not.toBeNull();

      currentRoom.value = null;
      lastConfirmationOptions?.onConfirm();
      expect(resignMock).not.toHaveBeenCalled();
    });
  });

  describe('handleOfferDraw', () => {
    it('does nothing if currentRoom is null or offerDraw is not provided', () => {
      currentRoom.value = null;
      const { handleOfferDraw } = createComposable();
      handleOfferDraw();
      expect(offerDrawMock).not.toHaveBeenCalled();

      currentRoom.value = { roomCode: 'ROOM1', status: 'playing' };
      const { handleOfferDraw: noOfferDraw } = createComposable({ offerDraw: undefined });
      noOfferDraw();
      expect(offerDrawMock).not.toHaveBeenCalled();
    });

    it('offers draw immediately without confirmation if status is not playing', () => {
      currentRoom.value = { roomCode: 'ROOM1', status: 'lobby' };
      const { handleOfferDraw } = createComposable();
      handleOfferDraw();
      expect(offerDrawMock).toHaveBeenCalledWith('ROOM1');
      expect(requestConfirmationMock).not.toHaveBeenCalled();
    });

    it('offers draw immediately when force is true even if playing', () => {
      const { handleOfferDraw } = createComposable();
      handleOfferDraw(true);
      expect(offerDrawMock).toHaveBeenCalledWith('ROOM1');
      expect(requestConfirmationMock).not.toHaveBeenCalled();
    });

    it('requests confirmation when playing and force is false', () => {
      const { handleOfferDraw } = createComposable();
      handleOfferDraw(false);
      expect(requestConfirmationMock).toHaveBeenCalledTimes(1);
      expect(offerDrawMock).not.toHaveBeenCalled();
      expect(lastConfirmationOptions).not.toBeNull();
      expect(lastConfirmationOptions?.title).toBe('Offer Draw?');
      expect(lastConfirmationOptions?.variant).toBe('primary');

      // Execute onConfirm
      lastConfirmationOptions?.onConfirm();
      expect(offerDrawMock).toHaveBeenCalledWith('ROOM1');
    });

    it('handles onConfirm safely when currentRoom became null before confirm', () => {
      const { handleOfferDraw } = createComposable();
      handleOfferDraw(false);
      expect(lastConfirmationOptions).not.toBeNull();

      currentRoom.value = null;
      lastConfirmationOptions?.onConfirm();
      expect(offerDrawMock).not.toHaveBeenCalled();
    });
  });

  describe('direct confirmation handlers (handleConfirmResign, handleConfirmDrawOffer, handleConfirmLeaveRoom)', () => {
    it('executes handleConfirmResign directly', async () => {
      const { handleConfirmResign } = createComposable();
      await handleConfirmResign();
      expect(resignMock).toHaveBeenCalledWith('ROOM1');
    });

    it('executes handleConfirmDrawOffer directly', async () => {
      const { handleConfirmDrawOffer } = createComposable();
      await handleConfirmDrawOffer();
      expect(offerDrawMock).toHaveBeenCalledWith('ROOM1');
    });

    it('executes handleConfirmLeaveRoom directly', async () => {
      const { handleConfirmLeaveRoom } = createComposable();
      await handleConfirmLeaveRoom();
      expect(leaveRoomMock).toHaveBeenCalledWith('ROOM1');
      expect(showGameOverModal.value).toBe(false);
      expect(currentAppMode.value).toBe('lobby');
    });
  });

  describe('async rejection resilience (MAJ-003)', () => {
    it('safely handles async rejection in handleLeaveRoom without unhandled rejection', async () => {
      leaveRoomMock.mockImplementation(() => Promise.reject(new Error('Leave room failed')));
      const { handleLeaveRoom } = createComposable();

      // Non-playing immediate leave
      currentRoom.value = { roomCode: 'ROOM1', status: 'lobby' };
      expect(() => handleLeaveRoom()).not.toThrow();

      // Playing room with confirmation
      currentRoom.value = { roomCode: 'ROOM1', status: 'playing' };
      handleLeaveRoom(false);
      expect(lastConfirmationOptions).not.toBeNull();
      expect(async () => {
        await lastConfirmationOptions?.onConfirm();
      }).not.toThrow();
    });

    it('safely handles async rejection in handleResign without unhandled rejection', async () => {
      resignMock.mockImplementation(() => Promise.reject(new Error('Resign failed')));
      const { handleResign } = createComposable();

      // Non-playing immediate resign
      currentRoom.value = { roomCode: 'ROOM1', status: 'lobby' };
      expect(() => handleResign()).not.toThrow();

      // Playing room with confirmation
      currentRoom.value = { roomCode: 'ROOM1', status: 'playing' };
      handleResign(false);
      expect(lastConfirmationOptions).not.toBeNull();
      expect(async () => {
        await lastConfirmationOptions?.onConfirm();
      }).not.toThrow();
    });

    it('safely handles async rejection in handleOfferDraw without unhandled rejection', async () => {
      offerDrawMock.mockImplementation(() => Promise.reject(new Error('Draw offer failed')));
      const { handleOfferDraw } = createComposable();

      // Non-playing immediate draw offer
      currentRoom.value = { roomCode: 'ROOM1', status: 'lobby' };
      expect(() => handleOfferDraw()).not.toThrow();

      // Playing room with confirmation
      currentRoom.value = { roomCode: 'ROOM1', status: 'playing' };
      handleOfferDraw(false);
      expect(lastConfirmationOptions).not.toBeNull();
      expect(async () => {
        await lastConfirmationOptions?.onConfirm();
      }).not.toThrow();
    });
  });
});
