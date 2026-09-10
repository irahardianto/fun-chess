import http from 'node:http';
import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createSocketClient, type TypedSocket } from '../socket_client';
import type { RoomState, Player } from '@fun-chess/shared';

// Dynamically resolve Socket.io Server from server workspace without polluting client dependencies
const serverRequire = createRequire(new URL('../../../../../server/package.json', import.meta.url).pathname);
const { Server: SocketIoServer } = serverRequire('socket.io');

describe('SocketClient Live Loopback Integration Tests (MAJ-022)', () => {
  let httpServer: http.Server;
  let ioServer: any;
  let serverPort: number;
  let loopbackUrl: string;
  let clientSocket: TypedSocket | null = null;

  const mockPlayer: Player = {
    id: 'p-integration-1',
    socketId: 'sock-integration-1',
    name: 'Alice Integrator',
    color: 'w',
    isConnected: true,
    isHost: true,
    avatar: '🦁',
    connectedAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const mockRoom: RoomState = {
    roomCode: 'INTG',
    status: 'lobby',
    hostId: mockPlayer.id,
    whitePlayer: mockPlayer,
    blackPlayer: null,
    spectators: [],
    game: {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      turn: 'w',
      isCheck: false,
      isCheckmate: false,
      isDraw: false,
      isStalemate: false,
      isThreefoldRepetition: false,
      isInsufficientMaterial: false,
      isFiftyMoveRule: false,
      moveHistory: [],
      capturedWhite: [],
      capturedBlack: [],
      materialAdvantage: { white: 0, black: 0 },
      lastMove: null,
      moveCount: 0,
    },
    rematch: null,
    drawOffer: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  beforeAll(async () => {
    httpServer = http.createServer();
    ioServer = new SocketIoServer(httpServer, {
      cors: { origin: '*' },
      transports: ['websocket', 'polling'],
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
          loopbackUrl = `http://127.0.0.1:${serverPort}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    if (ioServer) {
      await new Promise<void>((resolve) => ioServer.close(() => resolve()));
    }
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  beforeEach(() => {
    // Clean slate before each test
  });

  afterEach(() => {
    if (clientSocket) {
      clientSocket.disconnect();
      clientSocket = null;
    }
  });

  it('successfully completes real TCP handshake and connects to loopback Socket.io server', async () => {
    const correlationId = 'corr-handshake-test-123';
    let serverReceivedAuthCorrelation = '';

    const serverConnectionPromise = new Promise<void>((resolve) => {
      ioServer.once('connection', (socket: any) => {
        serverReceivedAuthCorrelation =
          socket.handshake.auth?.correlationId || socket.handshake.query?.correlationId || '';
        resolve();
      });
    });

    clientSocket = createSocketClient({
      url: loopbackUrl,
      correlationId,
    });

    const clientConnectPromise = new Promise<void>((resolve) => {
      clientSocket!.once('connect', () => {
        resolve();
      });
    });

    clientSocket.connect();

    await Promise.all([serverConnectionPromise, clientConnectPromise]);

    expect(clientSocket.connected).toBe(true);
    expect(clientSocket.id).toBeDefined();
    expect(serverReceivedAuthCorrelation).toBe(correlationId);
  });

  it('delivers client-to-server events and handles server acknowledgment callbacks over real sockets', async () => {
    ioServer.once('connection', (socket: any) => {
      socket.on('room:join', (payload: any, ackCallback: any) => {
        expect(payload.roomCode).toBe('INTG');
        expect(payload.playerName).toBe('Alice');

        if (typeof ackCallback === 'function') {
          ackCallback({
            success: true,
            room: mockRoom,
            player: mockPlayer,
            sessionToken: 'hmac-signed-session-token-456',
          });
        }
      });
    });

    clientSocket = createSocketClient({ url: loopbackUrl });
    clientSocket.connect();

    await new Promise<void>((resolve) => {
      clientSocket!.once('connect', () => resolve());
    });

    const ackResult = await new Promise<any>((resolve) => {
      clientSocket!.emit(
        'room:join',
        { roomCode: 'INTG', playerName: 'Alice', avatar: '🦁' },
        (response) => {
          resolve(response);
        }
      );
    });

    expect(ackResult).toBeDefined();
    expect(ackResult.success).toBe(true);
    expect(ackResult.room.roomCode).toBe('INTG');
    expect(ackResult.player.name).toBe('Alice Integrator');
    expect(ackResult.sessionToken).toBe('hmac-signed-session-token-456');
  });

  it('delivers server-to-client push events across live socket channel', async () => {
    let connectedServerSocket: any = null;

    ioServer.once('connection', (socket: any) => {
      connectedServerSocket = socket;
    });

    clientSocket = createSocketClient({ url: loopbackUrl });
    clientSocket.connect();

    await new Promise<void>((resolve) => {
      clientSocket!.once('connect', () => resolve());
    });

    expect(connectedServerSocket).not.toBeNull();

    const clientReceivedPromise = new Promise<{ player: Player; room: RoomState }>((resolve) => {
      clientSocket!.on('room:player_joined', (data) => {
        resolve(data);
      });
    });

    // Server pushes event to client
    connectedServerSocket.emit('room:player_joined', {
      player: mockPlayer,
      room: mockRoom,
    });

    const receivedPayload = await clientReceivedPromise;
    expect(receivedPayload.player.id).toBe('p-integration-1');
    expect(receivedPayload.room.roomCode).toBe('INTG');
    expect(receivedPayload.player.avatar).toBe('🦁');
  });

  it('gracefully handles client-initiated disconnect and notifies server', async () => {
    let serverDisconnected = false;

    const serverDisconnectPromise = new Promise<void>((resolve) => {
      ioServer.once('connection', (socket: any) => {
        socket.once('disconnect', () => {
          serverDisconnected = true;
          resolve();
        });
      });
    });

    clientSocket = createSocketClient({ url: loopbackUrl });
    clientSocket.connect();

    await new Promise<void>((resolve) => {
      clientSocket!.once('connect', () => resolve());
    });
    expect(clientSocket.connected).toBe(true);

    const clientDisconnectPromise = new Promise<void>((resolve) => {
      clientSocket!.once('disconnect', () => resolve());
    });

    clientSocket.disconnect();

    await Promise.all([serverDisconnectPromise, clientDisconnectPromise]);

    expect(clientSocket.connected).toBe(false);
    expect(serverDisconnected).toBe(true);
  });
});
