import { Socket } from 'socket.io';
import {
  MakeMoveRequest,
  MoveResult,
  OfferDrawRequest,
  RequestRematchRequest,
  ResignRequest,
  RespondDrawRequest,
  RespondRematchRequest,
} from '@fun-chess/shared';
import { Logger } from '../../platform/logger/logger.interface.js';
import { wrapSocketHandler } from '../../platform/socket/socket_logging_middleware.js';
import { GameService } from './game.service.js';
import { TypedSocketServer } from '../../platform/socket/socket_server.js';
import { cancelAllDisconnectTimersForRoom } from '../rooms/room.socket_handler.js';

/**
 * Registers gameplay Socket.io event listeners.
 */
export function registerGameSocketHandlers(
  io: TypedSocketServer,
  socket: Socket,
  gameService: GameService,
  logger: Logger
): void {
  // 1. game:move
  socket.on(
    'game:move',
    wrapSocketHandler<MakeMoveRequest, { success: true; moveResult: MoveResult }>(
      logger,
      'game:move',
      socket.id,
      async (req) => {
        const roomCode = req.roomCode.toUpperCase();
        const result = await gameService.makeMove(req, socket.id);

        io.to(roomCode).emit('game:moved', {
          move: result.moveResult,
          gameState: result.gameState,
        });

        if (result.checkInfo) {
          io.to(roomCode).emit('game:check', result.checkInfo);
        }

        if (result.gameOverPayload) {
          cancelAllDisconnectTimersForRoom(roomCode);
          io.to(roomCode).emit('game:over', result.gameOverPayload);
        }

        return {
          success: true,
          moveResult: result.moveResult,
        };
      }
    )
  );

  // 2. game:resign
  socket.on(
    'game:resign',
    wrapSocketHandler<ResignRequest, { success: true }>(
      logger,
      'game:resign',
      socket.id,
      async (req) => {
        const roomCode = req.roomCode.toUpperCase();
        const result = await gameService.resign(req.roomCode, socket.id);
        cancelAllDisconnectTimersForRoom(roomCode);
        io.to(roomCode).emit('game:over', result.gameOverPayload);
        return { success: true };
      }
    )
  );

  // 3. game:offer_draw
  socket.on(
    'game:offer_draw',
    wrapSocketHandler<OfferDrawRequest, { success: true }>(
      logger,
      'game:offer_draw',
      socket.id,
      async (req) => {
        const result = await gameService.offerDraw(req.roomCode, socket.id);
        if (result.opponentPlayer?.socketId) {
          io.to(result.opponentPlayer.socketId).emit('game:draw_offered', {
            fromPlayerId: result.fromPlayer.id,
            fromPlayerName: result.fromPlayer.name,
          });
        }
        return { success: true };
      }
    )
  );

  // 4. game:respond_draw
  socket.on(
    'game:respond_draw',
    wrapSocketHandler<RespondDrawRequest, { success: true }>(
      logger,
      'game:respond_draw',
      socket.id,
      async (req) => {
        const roomCode = req.roomCode.toUpperCase();
        const result = await gameService.respondDraw(req.roomCode, socket.id, req.accept);

        if (result.accept && result.gameOverPayload) {
          cancelAllDisconnectTimersForRoom(roomCode);
          io.to(roomCode).emit('game:over', result.gameOverPayload);
        } else {
          io.to(roomCode).emit('game:draw_declined', {
            byPlayerId: result.byPlayerId,
          });
        }

        return { success: true };
      }
    )
  );

  // 5. game:request_rematch
  socket.on(
    'game:request_rematch',
    wrapSocketHandler<RequestRematchRequest, { success: true }>(
      logger,
      'game:request_rematch',
      socket.id,
      async (req) => {
        const roomCode = req.roomCode.toUpperCase();
        const result = await gameService.requestRematch(req.roomCode, socket.id);

        io.to(roomCode).emit('game:rematch_requested', {
          requestedBy: result.requestedBy,
          requesterName: result.requesterName,
        });

        return { success: true };
      }
    )
  );

  // 6. game:respond_rematch
  socket.on(
    'game:respond_rematch',
    wrapSocketHandler<RespondRematchRequest, { success: true }>(
      logger,
      'game:respond_rematch',
      socket.id,
      async (req) => {
        const roomCode = req.roomCode.toUpperCase();
        const result = await gameService.respondRematch(req.roomCode, socket.id, req.accept);

        if (result.accept && result.nextGameState) {
          io.to(roomCode).emit('game:rematch_started', result.nextGameState);
        } else {
          io.to(roomCode).emit('game:rematch_declined', {
            byPlayerId: result.byPlayerId,
          });
        }

        return { success: true };
      }
    )
  );
}
