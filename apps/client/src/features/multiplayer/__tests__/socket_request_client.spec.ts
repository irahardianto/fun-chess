import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  emitWithTimeout,
  useSocketRequestClient,
} from '../composables/socket_request_client';
import {
  resetTransportState,
  socket as globalSocket,
  lastError,
  latencyMs,
} from '../composables/socket_connection_manager';
import type { SocketErrorPayload } from '@fun-chess/shared';

describe('socket_request_client composable', () => {
  let mockSocket: any;
  let disconnectListener: ((reason?: unknown) => void) | null;

  function createMockSocket(overrides: Record<string, any> = {}) {
    disconnectListener = null;
    const s = {
      id: 'mock_sock_req_456',
      connected: true,
      on: vi.fn(),
      once: vi.fn((event: string, handler: (reason?: unknown) => void) => {
        if (event === 'disconnect') {
          disconnectListener = handler;
        }
      }),
      off: vi.fn((event: string, handler: (reason?: unknown) => void) => {
        if (event === 'disconnect' && disconnectListener === handler) {
          disconnectListener = null;
        }
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
      ...overrides,
    };
    return s;
  }

  beforeEach(() => {
    resetTransportState();
    vi.clearAllMocks();
    mockSocket = createMockSocket();
  });

  afterEach(() => {
    resetTransportState();
    vi.restoreAllMocks();
  });

  describe('emitWithTimeout - Basic RPC Operations', () => {
    it('resolves on successful acknowledgment and calls onSuccess and callback', async () => {
      mockSocket.emit.mockImplementation((_event: string, _payload: unknown, cb: Function) => {
        cb({ success: true, room: { code: 'ABCDEF' } });
      });

      const onSuccess = vi.fn();
      const callback = vi.fn();

      const result = await emitWithTimeout(
        mockSocket,
        'room:create',
        { playerName: 'Player1' },
        {
          operation: 'socket_room_create',
          timeoutMessage: 'Timed out creating room',
          onSuccess,
          callback,
        }
      );

      expect(result.success).toBe(true);
      expect((result as any).room.code).toBe('ABCDEF');
      expect(onSuccess).toHaveBeenCalledWith(result);
      expect(callback).toHaveBeenCalledWith(result);
      expect(latencyMs.value).toBeGreaterThanOrEqual(0);
    });

    it('resolves with success: false on server failure response and sets lastError', async () => {
      const serverErr: SocketErrorPayload = {
        code: 'ERR_ROOM_NOT_FOUND',
        message: 'Room does not exist',
      };
      mockSocket.emit.mockImplementation((_event: string, _payload: unknown, cb: Function) => {
        cb({ success: false, error: serverErr });
      });

      const onError = vi.fn();
      const result = await emitWithTimeout(
        mockSocket,
        'room:join',
        { roomCode: 'BAD123' },
        {
          operation: 'socket_room_join',
          timeoutMessage: 'Timed out joining room',
          onError,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toEqual(serverErr);
      expect(lastError.value).toEqual(serverErr);
      expect(onError).toHaveBeenCalledWith(serverErr);
    });

    it('rejects promise if rejectOnError is true on server error', async () => {
      const serverErr: SocketErrorPayload = {
        code: 'ERR_ROOM_NOT_FOUND',
        message: 'Game not found',
      };
      mockSocket.emit.mockImplementation((_event: string, _payload: unknown, cb: Function) => {
        cb({ success: false, error: serverErr });
      });

      await expect(
        emitWithTimeout(
          mockSocket,
          'game:move',
          {},
          {
            operation: 'socket_game_move',
            timeoutMessage: 'Timed out moving',
            rejectOnError: true,
          }
        )
      ).rejects.toEqual(serverErr);
    });
  });

  describe('emitWithTimeout - Timeout and Disconnect Handling (ENH-013)', () => {
    it('times out and resolves with ERR_SOCKET_TIMEOUT when server never responds', async () => {
      vi.useFakeTimers();
      // Socket emit does not invoke callback
      mockSocket.emit.mockImplementation(() => {});

      const onError = vi.fn();
      const promise = emitWithTimeout(
        mockSocket,
        'game:move',
        {},
        {
          timeoutMs: 3000,
          timeoutMessage: 'Move timeout',
          operation: 'socket_game_move',
          onError,
        }
      );

      vi.advanceTimersByTime(3000);
      const res = await promise;

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('ERR_SOCKET_TIMEOUT');
      expect(res.error?.message).toBe('Move timeout');
      expect(lastError.value?.code).toBe('ERR_SOCKET_TIMEOUT');
      expect(onError).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('aborts immediately with ERR_SOCKET_DISCONNECTED when socket disconnects mid-flight (ENH-013)', async () => {
      mockSocket.emit.mockImplementation(() => {
        // Simulation: in-flight request, server hasn't answered yet, but disconnect fires
        if (disconnectListener) {
          disconnectListener('transport error');
        }
      });

      const onError = vi.fn();
      const res = await emitWithTimeout(
        mockSocket,
        'game:move',
        { move: 'e2e4' },
        {
          operation: 'socket_game_move',
          timeoutMessage: 'Move timeout',
          onError,
        }
      );

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('ERR_SOCKET_DISCONNECTED');
      expect(res.error?.message).toBe('Socket disconnected while operation was in flight');
      expect(lastError.value?.code).toBe('ERR_SOCKET_DISCONNECTED');
      expect(onError).toHaveBeenCalledWith(res.error);
    });

    it('rejects with ERR_SOCKET_DISCONNECTED when rejectOnError is true during mid-flight disconnect (ENH-013)', async () => {
      mockSocket.emit.mockImplementation(() => {
        if (disconnectListener) {
          disconnectListener('ping timeout');
        }
      });

      await expect(
        emitWithTimeout(
          mockSocket,
          'room:leave',
          {},
          {
            operation: 'socket_room_leave',
            timeoutMessage: 'Leave timeout',
            rejectOnError: true,
          }
        )
      ).rejects.toMatchObject({
        code: 'ERR_SOCKET_DISCONNECTED',
      });
    });
  });

  describe('useSocketRequestClient composable', () => {
    it('uses injected targetSocket if provided', async () => {
      const client = useSocketRequestClient(mockSocket);
      mockSocket.emit.mockImplementation((_event: string, _payload: unknown, cb: Function) => {
        cb({ success: true });
      });

      const res = await client.emitWithTimeout('test:event', {}, {
        operation: 'test_op',
        timeoutMessage: 'test timeout',
      });

      expect(res.success).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith('test:event', {}, expect.any(Function));
    });

    it('falls back to defaultSocket from socket_connection_manager', async () => {
      globalSocket.value = mockSocket;
      const client = useSocketRequestClient();
      mockSocket.emit.mockImplementation((_event: string, _payload: unknown, cb: Function) => {
        cb({ success: true });
      });

      const res = await client.emitWithTimeout('test:event', {}, {
        operation: 'test_op',
        timeoutMessage: 'test timeout',
      });

      expect(res.success).toBe(true);
    });

    it('throws error when emitWithTimeout is called with no active socket', () => {
      globalSocket.value = null;
      const client = useSocketRequestClient();

      expect(() => {
        client.emitWithTimeout('test:event', {}, {
          operation: 'test_op',
          timeoutMessage: 'test timeout',
        });
      }).toThrow('No socket available for request client emission');
    });
  });
});
