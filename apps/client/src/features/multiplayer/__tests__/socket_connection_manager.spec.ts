import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useSocketConnectionManager,
  initSocket,
  connect,
  disconnect,
  resetTransportState,
  resetSocketTransportState,
  socket,
  isConnected,
  socketId,
  isReconnecting,
  connectionError,
  lastError,
  connectionCorrelationId,
  lifecycleHandlers,
  managerHandlers,
} from '../composables/socket_connection_manager';
import { registerSocketEventListener } from '../composables/socket_event_dispatcher';

describe('socket_connection_manager composable', () => {
  let mockSocket: any;
  let eventHandlers: Record<string, any>;
  let managerHandlersMap: Record<string, any>;

  function createMockSocket(overrides: Record<string, any> = {}) {
    eventHandlers = {};
    managerHandlersMap = {};
    const s = {
      id: 'mock_sock_conn_123',
      connected: true,
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      }),
      once: vi.fn((event: string, handler: Function) => {
        eventHandlers[event] = handler;
      }),
      off: vi.fn((event: string, handler: Function) => {
        if (eventHandlers[event] === handler) {
          delete eventHandlers[event];
        }
      }),
      emit: vi.fn(),
      connect: vi.fn(function (this: any) {
        this.connected = true;
        if (eventHandlers['connect']) eventHandlers['connect']();
      }),
      disconnect: vi.fn(function (this: any) {
        this.connected = false;
        if (eventHandlers['disconnect']) eventHandlers['disconnect']();
      }),
      io: {
        on: vi.fn((event: string, handler: Function) => {
          managerHandlersMap[event] = handler;
        }),
        off: vi.fn((event: string, handler: Function) => {
          if (managerHandlersMap[event] === handler) {
            delete managerHandlersMap[event];
          }
        }),
      },
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

  describe('Lifecycle and Initialization', () => {
    it('initializes socket and sets initial reactive state', () => {
      const manager = useSocketConnectionManager(mockSocket);

      expect(manager.socket.value).toBe(mockSocket);
      expect(manager.isConnected.value).toBe(true);
      expect(manager.socketId.value).toBe('mock_sock_conn_123');
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
      expect(mockSocket.io.on).toHaveBeenCalledWith('reconnect_attempt', expect.any(Function));
      expect(mockSocket.io.on).toHaveBeenCalledWith('reconnect_failed', expect.any(Function));
    });

    it('creates or reuses connectionCorrelationId on initSocket (MIN-014)', () => {
      const customCid = 'test-corr-id-999';
      const s = initSocket('http://localhost:3000', customCid, mockSocket);

      expect(s).toBe(mockSocket);
      expect(connectionCorrelationId.value).toBe(customCid);
    });

    it('generates a session correlationId if none provided (MIN-014)', () => {
      initSocket('http://localhost:3000', undefined, mockSocket);
      expect(connectionCorrelationId.value).toBeTruthy();
      expect(typeof connectionCorrelationId.value).toBe('string');
    });

    it('detaches listeners from prior socket when switching injected sockets', () => {
      const socket1 = createMockSocket({ id: 'sock1' });
      const socket2 = createMockSocket({ id: 'sock2' });

      useSocketConnectionManager(socket1 as any);
      expect(socket.value).toBe(socket1);

      useSocketConnectionManager(socket2 as any);
      expect(socket1.off).toHaveBeenCalled();
      expect(socket.value).toBe(socket2);
      expect(socketId.value).toBe('sock2');
    });
  });

  describe('Connection & Disconnection controls', () => {
    it('connect() initiates socket.connect() when disconnected', () => {
      mockSocket.connected = false;
      useSocketConnectionManager(mockSocket);
      expect(isConnected.value).toBe(false);

      connect();
      expect(mockSocket.connect).toHaveBeenCalled();
      expect(isConnected.value).toBe(true);
    });

    it('connect() does not re-invoke connect() if already connected', () => {
      mockSocket.connected = true;
      useSocketConnectionManager(mockSocket);

      connect();
      expect(mockSocket.connect).not.toHaveBeenCalled();
    });

    it('disconnect() disconnects without resetting state if reset is false', () => {
      useSocketConnectionManager(mockSocket);
      expect(isConnected.value).toBe(true);

      disconnect(false);
      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(isConnected.value).toBe(false);
      expect(socket.value).toBe(mockSocket);
    });

    it('disconnect(true) resets full transport state (MIN-015)', () => {
      useSocketConnectionManager(mockSocket);

      disconnect(true);
      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(socket.value).toBeNull();
      expect(isConnected.value).toBe(false);
      expect(socketId.value).toBe('');
      expect(connectionCorrelationId.value).toBe('');
    });

    it('resetTransportState resets all reactive properties and clears subscribers', () => {
      useSocketConnectionManager(mockSocket);
      const listener = vi.fn();
      registerSocketEventListener('custom:event', listener);

      isConnected.value = true;
      socketId.value = 'test_id';
      isReconnecting.value = true;
      connectionError.value = 'some error';

      resetTransportState();

      expect(socket.value).toBeNull();
      expect(isConnected.value).toBe(false);
      expect(socketId.value).toBe('');
      expect(isReconnecting.value).toBe(false);
      expect(connectionError.value).toBeNull();
      expect(lastError.value).toBeNull();
      expect(connectionCorrelationId.value).toBe('');
    });

    it('aliases resetSocketTransportState to resetTransportState', () => {
      expect(resetSocketTransportState).toBe(resetTransportState);
    });
  });

  describe('Lifecycle Handlers & Reconnection Backoff', () => {
    it('handles connect event', () => {
      useSocketConnectionManager(mockSocket);
      isReconnecting.value = true;
      connectionError.value = 'prev error';

      lifecycleHandlers.connect!();

      expect(isConnected.value).toBe(true);
      expect(isReconnecting.value).toBe(false);
      expect(connectionError.value).toBeNull();
      expect(socketId.value).toBe('mock_sock_conn_123');
    });

    it('handles disconnect event', () => {
      useSocketConnectionManager(mockSocket);
      isConnected.value = true;

      lifecycleHandlers.disconnect!('transport close');

      expect(isConnected.value).toBe(false);
    });

    it('handles connect_error event with error message extraction', () => {
      useSocketConnectionManager(mockSocket);

      lifecycleHandlers.connect_error!(new Error('Connection refused'));

      expect(isConnected.value).toBe(false);
      expect(isReconnecting.value).toBe(false);
      expect(connectionError.value).toBe('Connection refused');
      expect(lastError.value).toEqual({
        code: 'ERR_SOCKET_TIMEOUT',
        message: 'Connection refused',
      });
    });

    it('handles reconnect_attempt event and updates isReconnecting', () => {
      useSocketConnectionManager(mockSocket);
      expect(isReconnecting.value).toBe(false);

      managerHandlers.reconnect_attempt!(2);

      expect(isReconnecting.value).toBe(true);
    });

    it('handles reconnect_failed event and marks connection error', () => {
      useSocketConnectionManager(mockSocket);
      isReconnecting.value = true;

      managerHandlers.reconnect_failed!();

      expect(isConnected.value).toBe(false);
      expect(isReconnecting.value).toBe(false);
      expect(connectionError.value).toBe('Reconnection failed after maximum attempts');
      expect(lastError.value).toEqual({
        code: 'ERR_SOCKET_TIMEOUT',
        message: 'Reconnection failed after maximum attempts',
      });
    });
  });
});
