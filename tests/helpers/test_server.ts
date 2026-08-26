import http from 'http';
import os from 'os';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Chess } from 'chess.js';
import { randomUUID } from 'crypto';
import {
  CreateRoomRequest,
  GameOverPayload,
  GameState,
  HealthCheckResponse,
  JoinRoomRequest,
  LanInfoResponse,
  MakeMoveRequest,
  MovePayload,
  MoveResult,
  OfferDrawRequest,
  PieceColor,
  PieceType,
  Player,
  ReconnectRequest,
  RequestRematchRequest,
  RespondDrawRequest,
  RespondRematchRequest,
  ResignRequest,
  LeaveRoomRequest,
  RoomState,
  SocketErrorPayload,
  Square,
} from '@fun-chess/shared';

export interface TestServerInstance {
  server: http.Server;
  io: SocketIOServer;
  port: number;
  url: string;
  roomStore: InMemoryRoomStore;
  close: () => Promise<void>;
}

export class InMemoryRoomStore {
  private readonly rooms = new Map<string, RoomState>();

  public async save(room: RoomState): Promise<void> {
    this.rooms.set(room.roomCode.toUpperCase(), { ...room });
  }

  public async findByCode(roomCode: string): Promise<RoomState | null> {
    const room = this.rooms.get(roomCode.toUpperCase());
    return room ? { ...room } : null;
  }

  public async findBySocketId(socketId: string): Promise<{ room: RoomState; player: Player } | null> {
    for (const room of this.rooms.values()) {
      if (room.whitePlayer?.socketId === socketId) {
        return { room: { ...room }, player: room.whitePlayer };
      }
      if (room.blackPlayer?.socketId === socketId) {
        return { room: { ...room }, player: room.blackPlayer };
      }
    }
    return null;
  }

  public async delete(roomCode: string): Promise<boolean> {
    return this.rooms.delete(roomCode.toUpperCase());
  }

  public async listActiveRooms(): Promise<RoomState[]> {
    return Array.from(this.rooms.values()).map((r) => ({ ...r }));
  }

  public async count(): Promise<number> {
    return this.rooms.size;
  }

  public clear(): void {
    this.rooms.clear();
  }
}

export class ChessEngine {
  public static extractGameState(chess: Chess, lastMove: { from: string; to: string } | null = null): GameState {
    const board = chess.board();
    const capturedWhite: PieceType[] = [];
    const capturedBlack: PieceType[] = [];

    // Count current pieces on board
    const currentCounts: Record<string, number> = {
      wp: 0, wn: 0, wb: 0, wr: 0, wq: 0,
      bp: 0, bn: 0, bb: 0, br: 0, bq: 0,
    };

    for (const row of board) {
      for (const square of row) {
        if (square && square.type !== 'k') {
          currentCounts[`${square.color}${square.type}`]++;
        }
      }
    }

    const startingCounts: Record<string, number> = {
      wp: 8, wn: 2, wb: 2, wr: 2, wq: 1,
      bp: 8, bn: 2, bb: 2, br: 2, bq: 1,
    };

    for (const [key, initial] of Object.entries(startingCounts)) {
      const current = currentCounts[key] || 0;
      const diff = initial - current;
      const color = key[0] as PieceColor;
      const piece = key[1] as PieceType;
      for (let i = 0; i < diff; i++) {
        if (color === 'w') {
          capturedWhite.push(piece);
        } else {
          capturedBlack.push(piece);
        }
      }
    }

    const pieceValues: Record<PieceType, number> = {
      p: 1,
      n: 3,
      b: 3,
      r: 5,
      q: 9,
      k: 0,
    };

    let whiteMaterial = 0;
    let blackMaterial = 0;

    for (const row of board) {
      for (const sq of row) {
        if (sq) {
          if (sq.color === 'w') whiteMaterial += pieceValues[sq.type];
          else blackMaterial += pieceValues[sq.type];
        }
      }
    }

    const isCheckmate = chess.isGameOver() && chess.inCheck();
    const isStalemate = chess.isStalemate();
    const isThreefold = chess.isThreefoldRepetition();
    const isInsufficient = chess.isInsufficientMaterial();
    const isDraw = chess.isDraw();
    const isFiftyMove = isDraw && !isStalemate && !isThreefold && !isInsufficient;

    return {
      fen: chess.fen(),
      turn: chess.turn() as PieceColor,
      isCheck: chess.inCheck(),
      isCheckmate,
      isDraw,
      isStalemate,
      isThreefoldRepetition: isThreefold,
      isInsufficientMaterial: isInsufficient,
      isFiftyMoveRule: isFiftyMove,
      moveHistory: [],
      capturedWhite,
      capturedBlack,
      materialAdvantage: {
        white: Math.max(0, whiteMaterial - blackMaterial),
        black: Math.max(0, blackMaterial - whiteMaterial),
      },
      lastMove,
      moveCount: chess.history().length,
    };
  }

  public static findKingSquare(chess: Chess, color: PieceColor): string {
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === color) {
          const file = String.fromCharCode('a'.charCodeAt(0) + c);
          const rank = (8 - r).toString();
          return `${file}${rank}`;
        }
      }
    }
    return '';
  }
}

export function getLanInterfaces(): { lanIp: string; interfaces: string[] } {
  const nets = os.networkInterfaces();
  const interfaces: string[] = [];

  for (const name of Object.keys(nets)) {
    const netList = nets[name];
    if (!netList) continue;
    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal) {
        interfaces.push(net.address);
      }
    }
  }

  const lanIp = interfaces.length > 0 ? interfaces[0] : '127.0.0.1';
  return { lanIp, interfaces };
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createTestServer(customPort = 0): Promise<TestServerInstance> {
  const startTime = Date.now();
  const roomStore = new InMemoryRoomStore();
  let activeSocketCount = 0;

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/api/lan-info' && req.method === 'GET') {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 3000;
      const { lanIp, interfaces } = getLanInterfaces();

      const response: LanInfoResponse = {
        lanIp,
        port,
        localUrl: `http://localhost:${port}`,
        joinUrl: `http://${lanIp}:${port}`,
        interfaces,
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      return;
    }

    if (pathname === '/api/health' && req.method === 'GET') {
      const activeRooms = await roomStore.count();
      const mem = process.memoryUsage();

      const response: HealthCheckResponse = {
        status: 'ok',
        uptimeSeconds: Math.round(((Date.now() - startTime) / 1000) * 10) / 10,
        timestamp: new Date().toISOString(),
        activeRooms,
        activeSockets: activeSocketCount,
        memoryUsageMb: {
          rss: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
          heapTotal: Math.round((mem.heapTotal / (1024 * 1024)) * 10) / 10,
          heapUsed: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
        },
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  const io = new SocketIOServer(server, {
    cors: { origin: '*' },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  io.on('connection', (socket: Socket) => {
    activeSocketCount++;

    socket.on('disconnect', () => {
      activeSocketCount = Math.max(0, activeSocketCount - 1);
    });

    // 1. room:create
    socket.on('room:create', async (payload: CreateRoomRequest, callback) => {
      const correlationId = randomUUID();
      try {
        if (!payload || !payload.playerName || typeof payload.playerName !== 'string') {
          const err: SocketErrorPayload = {
            code: 'ERR_INVALID_PAYLOAD',
            message: 'Player name is required',
            correlationId,
          };
          if (callback) callback({ success: false, error: err });
          socket.emit('error', err);
          return;
        }

        const roomCode = generateRoomCode();
        const playerId = randomUUID();
        const sessionToken = randomUUID();

        let hostColor: PieceColor;
        if (payload.preferredColor === 'b') {
          hostColor = 'b';
        } else if (payload.preferredColor === 'w') {
          hostColor = 'w';
        } else {
          hostColor = Math.random() < 0.5 ? 'w' : 'b';
        }

        const hostPlayer: Player = {
          id: playerId,
          socketId: socket.id,
          name: payload.playerName.trim() || 'Host',
          color: hostColor,
          isHost: true,
          isConnected: true,
          sessionToken,
          connectedAt: Date.now(),
        };

        const initialGameState = ChessEngine.extractGameState(new Chess());

        const newRoom: RoomState = {
          roomCode,
          status: 'lobby',
          hostId: playerId,
          whitePlayer: hostColor === 'w' ? hostPlayer : null,
          blackPlayer: hostColor === 'b' ? hostPlayer : null,
          spectators: [],
          game: initialGameState,
          rematch: null,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
        };

        await roomStore.save(newRoom);
        socket.join(roomCode);

        if (callback) {
          callback({ success: true, room: newRoom, sessionToken });
        }
        socket.emit('room:created', newRoom);
      } catch (err: unknown) {
        const errorPayload: SocketErrorPayload = {
          code: 'ERR_INTERNAL_SERVER',
          message: (err as Error).message || 'Failed to create room',
          correlationId,
        };
        if (callback) callback({ success: false, error: errorPayload });
        socket.emit('error', errorPayload);
      }
    });

    // 2. room:join
    socket.on('room:join', async (payload: JoinRoomRequest, callback) => {
      const correlationId = randomUUID();
      try {
        if (!payload || !payload.roomCode || !payload.playerName) {
          const err: SocketErrorPayload = {
            code: 'ERR_INVALID_PAYLOAD',
            message: 'Room code and player name are required',
            correlationId,
          };
          if (callback) callback({ success: false, error: err });
          socket.emit('error', err);
          return;
        }

        const room = await roomStore.findByCode(payload.roomCode);
        if (!room) {
          const err: SocketErrorPayload = {
            code: 'ERR_ROOM_NOT_FOUND',
            message: `Room with code '${payload.roomCode}' not found`,
            roomCode: payload.roomCode,
            correlationId,
          };
          if (callback) callback({ success: false, error: err });
          socket.emit('error', err);
          return;
        }

        if (room.whitePlayer && room.blackPlayer) {
          const err: SocketErrorPayload = {
            code: 'ERR_ROOM_FULL',
            message: `Room '${payload.roomCode}' is already full`,
            roomCode: payload.roomCode,
            correlationId,
          };
          if (callback) callback({ success: false, error: err });
          socket.emit('error', err);
          return;
        }

        const playerId = randomUUID();
        const sessionToken = randomUUID();
        const assignedColor: PieceColor = room.whitePlayer ? 'b' : 'w';

        const joinerPlayer: Player = {
          id: playerId,
          socketId: socket.id,
          name: payload.playerName.trim() || 'Player 2',
          color: assignedColor,
          isHost: false,
          isConnected: true,
          sessionToken,
          connectedAt: Date.now(),
        };

        if (assignedColor === 'w') {
          room.whitePlayer = joinerPlayer;
        } else {
          room.blackPlayer = joinerPlayer;
        }

        room.status = 'playing';
        room.lastActivityAt = Date.now();
        await roomStore.save(room);

        socket.join(room.roomCode);

        if (callback) {
          callback({ success: true, room, player: joinerPlayer, sessionToken });
        }
        socket.emit('room:joined', room);
        socket.to(room.roomCode).emit('room:player_joined', { player: joinerPlayer, room });
        io.to(room.roomCode).emit('game:started', room.game);
      } catch (err: unknown) {
        const errorPayload: SocketErrorPayload = {
          code: 'ERR_INTERNAL_SERVER',
          message: (err as Error).message || 'Failed to join room',
          correlationId,
        };
        if (callback) callback({ success: false, error: errorPayload });
        socket.emit('error', errorPayload);
      }
    });

    // 3. game:move
    socket.on('game:move', async (payload: MakeMoveRequest, callback) => {
      const correlationId = randomUUID();
      try {
        if (!payload || !payload.roomCode || !payload.move) {
          const err: SocketErrorPayload = {
            code: 'ERR_INVALID_PAYLOAD',
            message: 'Room code and move payload required',
            correlationId,
          };
          if (callback) callback({ success: false, error: err });
          socket.emit('error', err);
          return;
        }

        const room = await roomStore.findByCode(payload.roomCode);
        if (!room) {
          const err: SocketErrorPayload = {
            code: 'ERR_ROOM_NOT_FOUND',
            message: `Room '${payload.roomCode}' not found`,
            correlationId,
          };
          if (callback) callback({ success: false, error: err });
          socket.emit('error', err);
          return;
        }

        if (room.status !== 'playing') {
          const err: SocketErrorPayload = {
            code: 'ERR_GAME_NOT_ACTIVE',
            message: `Game is not currently active (status: ${room.status})`,
            roomCode: payload.roomCode,
            correlationId,
          };
          if (callback) callback({ success: false, error: err });
          socket.emit('error', err);
          return;
        }

        // Determine player color
        let playerColor: PieceColor | null = null;
        if (room.whitePlayer?.socketId === socket.id) playerColor = 'w';
        else if (room.blackPlayer?.socketId === socket.id) playerColor = 'b';

        if (!playerColor) {
          const err: SocketErrorPayload = {
            code: 'ERR_PLAYER_NOT_IN_ROOM',
            message: 'You are not an active player in this room',
            roomCode: payload.roomCode,
            correlationId,
          };
          if (callback) callback({ success: false, error: err });
          socket.emit('error', err);
          return;
        }

        const chess = new Chess(room.game.fen);
        if (chess.turn() !== playerColor) {
          const err: SocketErrorPayload = {
            code: 'ERR_NOT_YOUR_TURN',
            message: `Not your turn. Turn is for ${chess.turn() === 'w' ? 'White' : 'Black'}`,
            roomCode: payload.roomCode,
            correlationId,
          };
          if (callback) callback({ success: false, error: err });
          socket.emit('error', err);
          return;
        }

        let result;
        try {
          result = chess.move({
            from: payload.move.from,
            to: payload.move.to,
            promotion: payload.move.promotion,
          });
        } catch {
          result = null;
        }

        if (!result) {
          const err: SocketErrorPayload = {
            code: 'ERR_INVALID_MOVE',
            message: `Illegal move: ${payload.move.from}->${payload.move.to}`,
            roomCode: payload.roomCode,
            correlationId,
          };
          if (callback) callback({ success: false, error: err });
          socket.emit('error', err);
          return;
        }

        const lastMove = { from: result.from, to: result.to };
        const nextGameState = ChessEngine.extractGameState(chess, lastMove);

        const nextMoveCount = room.game.moveHistory.length + 1;
        const moveResult: MoveResult = {
          from: result.from,
          to: result.to,
          san: result.san,
          piece: result.piece as PieceType,
          color: result.color as PieceColor,
          captured: result.captured ? (result.captured as PieceType) : undefined,
          promotion: result.promotion ? (result.promotion as PieceType) : undefined,
          flags: result.flags,
          fen: chess.fen(),
          moveNumber: Math.ceil(nextMoveCount / 2),
          timestamp: Date.now(),
        };

        nextGameState.moveHistory = [...room.game.moveHistory, moveResult];
        nextGameState.moveCount = nextMoveCount;
        room.game = nextGameState;
        room.lastActivityAt = Date.now();

        // Check if game is over
        if (nextGameState.isCheckmate) {
          room.status = 'game_over';
          const winner: PieceColor = playerColor;
          const winnerPlayer = winner === 'w' ? room.whitePlayer : room.blackPlayer;
          const gameOverPayload: GameOverPayload = {
            winner,
            winnerName: winnerPlayer?.name,
            reason: 'checkmate',
            message: `Checkmate! ${winnerPlayer?.name || (winner === 'w' ? 'White' : 'Black')} wins!`,
            finalFen: nextGameState.fen,
            totalMoves: nextGameState.moveCount,
            durationSeconds: Math.round((Date.now() - room.createdAt) / 1000),
          };
          await roomStore.save(room);

          if (callback) callback({ success: true, moveResult });
          io.to(room.roomCode).emit('game:moved', { move: moveResult, gameState: nextGameState });
          io.to(room.roomCode).emit('game:over', gameOverPayload);
          return;
        }

        if (nextGameState.isDraw) {
          room.status = 'game_over';
          let reason: GameOverPayload['reason'] = 'stalemate';
          let message = 'Game drawn!';
          if (nextGameState.isStalemate) {
            reason = 'stalemate';
            message = 'Stalemate! Game is a draw.';
          } else if (nextGameState.isThreefoldRepetition) {
            reason = 'threefold_repetition';
            message = 'Draw by threefold repetition.';
          } else if (nextGameState.isInsufficientMaterial) {
            reason = 'insufficient_material';
            message = 'Draw by insufficient material.';
          } else if (nextGameState.isFiftyMoveRule) {
            reason = 'fifty_move_rule';
            message = 'Draw by 50-move rule.';
          }

          const gameOverPayload: GameOverPayload = {
            winner: 'draw',
            reason,
            message,
            finalFen: nextGameState.fen,
            totalMoves: nextGameState.moveCount,
            durationSeconds: Math.round((Date.now() - room.createdAt) / 1000),
          };
          await roomStore.save(room);

          if (callback) callback({ success: true, moveResult });
          io.to(room.roomCode).emit('game:moved', { move: moveResult, gameState: nextGameState });
          io.to(room.roomCode).emit('game:over', gameOverPayload);
          return;
        }

        await roomStore.save(room);

        if (callback) callback({ success: true, moveResult });
        io.to(room.roomCode).emit('game:moved', { move: moveResult, gameState: nextGameState });

        if (nextGameState.isCheck) {
          const sideInCheck = nextGameState.turn;
          const kingSquare = ChessEngine.findKingSquare(chess, sideInCheck);
          io.to(room.roomCode).emit('game:check', { inCheck: sideInCheck, kingSquare });
        }
      } catch (err: unknown) {
        const errorPayload: SocketErrorPayload = {
          code: 'ERR_INTERNAL_SERVER',
          message: (err as Error).message || 'Move failed',
          correlationId,
        };
        if (callback) callback({ success: false, error: errorPayload });
        socket.emit('error', errorPayload);
      }
    });

    // 4. game:resign
    socket.on('game:resign', async (payload: ResignRequest) => {
      const room = await roomStore.findByCode(payload.roomCode);
      if (!room || room.status !== 'playing') return;

      let resigningColor: PieceColor | null = null;
      if (room.whitePlayer?.socketId === socket.id) resigningColor = 'w';
      else if (room.blackPlayer?.socketId === socket.id) resigningColor = 'b';
      if (!resigningColor) return;

      const winner: PieceColor = resigningColor === 'w' ? 'b' : 'w';
      const winnerPlayer = winner === 'w' ? room.whitePlayer : room.blackPlayer;
      const resigningPlayer = resigningColor === 'w' ? room.whitePlayer : room.blackPlayer;

      room.status = 'game_over';
      const gameOverPayload: GameOverPayload = {
        winner,
        winnerName: winnerPlayer?.name,
        reason: 'resignation',
        message: `${resigningPlayer?.name} resigned. ${winnerPlayer?.name} wins!`,
        finalFen: room.game.fen,
        totalMoves: room.game.moveCount,
        durationSeconds: Math.round((Date.now() - room.createdAt) / 1000),
      };

      await roomStore.save(room);
      io.to(room.roomCode).emit('game:over', gameOverPayload);
    });

    // 5. game:offer_draw & game:respond_draw
    socket.on('game:offer_draw', async (payload: OfferDrawRequest) => {
      const room = await roomStore.findByCode(payload.roomCode);
      if (!room || room.status !== 'playing') return;

      let player: Player | null = null;
      if (room.whitePlayer?.socketId === socket.id) player = room.whitePlayer;
      else if (room.blackPlayer?.socketId === socket.id) player = room.blackPlayer;
      if (!player) return;

      socket.to(room.roomCode).emit('game:draw_offered', {
        fromPlayerId: player.id,
        fromPlayerName: player.name,
      });
    });

    socket.on('game:respond_draw', async (payload: RespondDrawRequest) => {
      const room = await roomStore.findByCode(payload.roomCode);
      if (!room || room.status !== 'playing') return;

      let player: Player | null = null;
      if (room.whitePlayer?.socketId === socket.id) player = room.whitePlayer;
      else if (room.blackPlayer?.socketId === socket.id) player = room.blackPlayer;
      if (!player) return;

      if (payload.accept) {
        room.status = 'game_over';
        const gameOverPayload: GameOverPayload = {
          winner: 'draw',
          reason: 'draw_agreement',
          message: 'Game drawn by mutual agreement.',
          finalFen: room.game.fen,
          totalMoves: room.game.moveCount,
          durationSeconds: Math.round((Date.now() - room.createdAt) / 1000),
        };
        await roomStore.save(room);
        io.to(room.roomCode).emit('game:over', gameOverPayload);
      } else {
        io.to(room.roomCode).emit('game:draw_declined', { byPlayerId: player.id });
      }
    });

    // 6. game:request_rematch & game:respond_rematch
    socket.on('game:request_rematch', async (payload: RequestRematchRequest) => {
      const room = await roomStore.findByCode(payload.roomCode);
      if (!room || room.status !== 'game_over') return;

      let player: Player | null = null;
      if (room.whitePlayer?.socketId === socket.id) player = room.whitePlayer;
      else if (room.blackPlayer?.socketId === socket.id) player = room.blackPlayer;
      if (!player) return;

      room.rematch = {
        requestedBy: player.id,
        requestedAt: Date.now(),
        status: 'pending',
      };
      await roomStore.save(room);

      io.to(room.roomCode).emit('game:rematch_requested', {
        requestedBy: player.id,
        requesterName: player.name,
      });
    });

    socket.on('game:respond_rematch', async (payload: RespondRematchRequest) => {
      const room = await roomStore.findByCode(payload.roomCode);
      if (!room || room.status !== 'game_over' || !room.rematch) return;

      let player: Player | null = null;
      if (room.whitePlayer?.socketId === socket.id) player = room.whitePlayer;
      else if (room.blackPlayer?.socketId === socket.id) player = room.blackPlayer;
      if (!player) return;

      if (payload.accept) {
        // Swap colors
        const oldWhite = room.whitePlayer;
        const oldBlack = room.blackPlayer;

        if (oldWhite) oldWhite.color = 'b';
        if (oldBlack) oldBlack.color = 'w';

        room.whitePlayer = oldBlack;
        room.blackPlayer = oldWhite;

        const freshGameState = ChessEngine.extractGameState(new Chess());
        room.game = freshGameState;
        room.status = 'playing';
        room.rematch = null;
        room.lastActivityAt = Date.now();

        await roomStore.save(room);
        io.to(room.roomCode).emit('game:rematch_started', freshGameState);
      } else {
        room.rematch.status = 'declined';
        await roomStore.save(room);
        io.to(room.roomCode).emit('game:rematch_declined', { byPlayerId: player.id });
      }
    });

    // 7. room:reconnect
    socket.on('room:reconnect', async (payload: ReconnectRequest, callback) => {
      const correlationId = randomUUID();
      try {
        if (!payload || !payload.roomCode || !payload.playerId || !payload.sessionToken) {
          const err: SocketErrorPayload = {
            code: 'ERR_INVALID_PAYLOAD',
            message: 'roomCode, playerId, and sessionToken required',
            correlationId,
          };
          if (callback) callback({ success: false, error: err });
          socket.emit('error', err);
          return;
        }

        const room = await roomStore.findByCode(payload.roomCode);
        if (!room) {
          const err: SocketErrorPayload = {
            code: 'ERR_ROOM_NOT_FOUND',
            message: 'Room not found',
            correlationId,
          };
          if (callback) callback({ success: false, error: err });
          socket.emit('error', err);
          return;
        }

        let player: Player | null = null;
        if (room.whitePlayer?.id === payload.playerId && room.whitePlayer.sessionToken === payload.sessionToken) {
          room.whitePlayer.socketId = socket.id;
          room.whitePlayer.isConnected = true;
          player = room.whitePlayer;
        } else if (room.blackPlayer?.id === payload.playerId && room.blackPlayer.sessionToken === payload.sessionToken) {
          room.blackPlayer.socketId = socket.id;
          room.blackPlayer.isConnected = true;
          player = room.blackPlayer;
        }

        if (!player) {
          const err: SocketErrorPayload = {
            code: 'ERR_UNAUTHORIZED',
            message: 'Invalid playerId or sessionToken',
            correlationId,
          };
          if (callback) callback({ success: false, error: err });
          socket.emit('error', err);
          return;
        }

        socket.join(room.roomCode);
        await roomStore.save(room);

        if (callback) callback({ success: true, room, player });
        socket.to(room.roomCode).emit('room:player_reconnected', {
          playerId: player.id,
          playerName: player.name,
        });
      } catch (err: unknown) {
        const errorPayload: SocketErrorPayload = {
          code: 'ERR_INTERNAL_SERVER',
          message: (err as Error).message || 'Reconnect failed',
          correlationId,
        };
        if (callback) callback({ success: false, error: errorPayload });
        socket.emit('error', errorPayload);
      }
    });

    // 8. room:leave
    socket.on('room:leave', async (payload: LeaveRoomRequest) => {
      const room = await roomStore.findByCode(payload.roomCode);
      if (!room) return;

      let leavingPlayer: Player | null = null;
      if (room.whitePlayer?.socketId === socket.id) leavingPlayer = room.whitePlayer;
      else if (room.blackPlayer?.socketId === socket.id) leavingPlayer = room.blackPlayer;

      if (leavingPlayer) {
        socket.to(room.roomCode).emit('room:player_left', {
          playerId: leavingPlayer.id,
          playerName: leavingPlayer.name,
          reason: 'Left game',
        });
        socket.leave(room.roomCode);
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(customPort, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  const assignedPort = typeof address === 'object' && address ? address.port : customPort;
  const url = `http://127.0.0.1:${assignedPort}`;

  const close = async () => {
    // Disconnect all sockets
    const sockets = await io.fetchSockets();
    for (const s of sockets) {
      s.disconnect(true);
    }
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return {
    server,
    io,
    port: assignedPort,
    url,
    roomStore,
    close,
  };
}
