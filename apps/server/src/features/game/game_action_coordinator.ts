import {
  AppError,
  type GameOverPayload,
  type GameState,
  type PieceColor,
  type Player,
  type RoomState,
  createGameOverPayload,
  createInitialGameState,
  RoomNotFoundError,
  GameNotActiveError,
  InvalidPayloadError,
  normalizeRoomCode,
  type IClock,
  serializeError,
} from "@fun-chess/shared";
import type { IRoomGameAdapter } from "../rooms/index.js";
import { type Logger } from "../../platform/logger/index.js";
import type { IGamePlayerResolver } from "./game_player_resolver.js";

/**
 * Interface contract for game lifecycle actions (resign, draw, rematch).
 */
export interface IGameActionCoordinator {
  resign(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{ room: RoomState; gameOverPayload: GameOverPayload }>;

  offerDraw(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{
    room: RoomState;
    fromPlayer: Player;
    opponentPlayer: Player | null;
  }>;

  respondDraw(
    roomCode: string,
    socketId: string,
    accept: boolean,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{
    room: RoomState;
    accept: boolean;
    byPlayerId: string;
    gameOverPayload?: GameOverPayload;
  }>;

  requestRematch(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{ room: RoomState; requestedBy: string; requesterName: string }>;

  respondRematch(
    roomCode: string,
    socketId: string,
    accept: boolean,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{
    room: RoomState;
    accept: boolean;
    byPlayerId: string;
    nextGameState?: GameState;
  }>;
}

/**
 * Coordinates game actions outside standard move execution: resignations,
 * draw offers and acceptances, and rematch requests and responses with color swapping.
 */
export class GameActionCoordinator implements IGameActionCoordinator {
  constructor(
    private readonly roomAdapter: IRoomGameAdapter,
    private readonly clock: IClock,
    private readonly logger: Logger,
    private readonly playerResolver: IGamePlayerResolver,
  ) {}

  /**
   * Helper standardizing service-layer error logging with semantic demotion (MAJ-012).
   */
  private logServiceFailure(
    operation: string,
    actionName: string,
    roomCode: string,
    startTime: number,
    correlationId: string | undefined,
    err: unknown,
  ): void {
    const duration = this.clock.now() - startTime;
    const isClientError = err instanceof AppError && err.statusCode < 500;
    const logContext = {
      operation,
      correlationId,
      roomCode,
      duration,
      durationMs: duration,
      error: serializeError(err),
    };
    if (isClientError) {
      this.logger.warn(`${actionName} rejected`, logContext);
    } else {
      this.logger.error(`${actionName} failed`, logContext);
    }
  }

  /**
   * Concedes active match to the opponent through roomAdapter.
   */
  public async resign(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{ room: RoomState; gameOverPayload: GameOverPayload }> {
    const startTime = this.clock.now();
    const code = normalizeRoomCode(roomCode);

    try {
      const room = await this.roomAdapter.getRoom(code, correlationId);

      if (!room) {
        throw new RoomNotFoundError(code);
      }

      if (room.status !== "playing") {
        throw new GameNotActiveError(room.status);
      }

      const { player, room: resolvedRoom } =
        await this.playerResolver.resolveAuthenticatedPlayer(
          room,
          socketId,
          sessionToken,
          correlationId,
        );

      this.logger.debug("Player resigning", {
        operation: "game_resign",
        correlationId,
        roomCode: code,
        playerId: player.id,
      });

      const winnerColor: PieceColor = player.color === "w" ? "b" : "w";
      const winnerPlayer =
        winnerColor === "w"
          ? resolvedRoom.whitePlayer
          : resolvedRoom.blackPlayer;
      const winnerName = winnerPlayer?.name || "Opponent";

      const gameOverPayload: GameOverPayload = createGameOverPayload({
        winner: winnerColor,
        winnerName,
        loserName: player.name,
        reason: "resignation",
        finalFen: resolvedRoom.game.fen,
        totalMoves: resolvedRoom.game.moveCount,
        startTimeMs: resolvedRoom.createdAt,
      });

      const updatedRoom = await this.roomAdapter.finalizeGame(
        code,
        gameOverPayload,
        correlationId,
      );

      const duration = this.clock.now() - startTime;
      this.logger.info("Player resigned", {
        operation: "game_resign",
        correlationId,
        roomCode: code,
        playerId: player.id,
        winnerColor,
        duration,
        durationMs: duration,
      });

      return { room: updatedRoom, gameOverPayload };
    } catch (err) {
      this.logServiceFailure(
        "game_resign",
        "Player resignation",
        code,
        startTime,
        correlationId,
        err,
      );
      throw err;
    }
  }

  /**
   * Proposes a peaceful draw to opponent through roomAdapter.
   */
  public async offerDraw(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{
    room: RoomState;
    fromPlayer: Player;
    opponentPlayer: Player | null;
  }> {
    const startTime = this.clock.now();
    const code = normalizeRoomCode(roomCode);

    try {
      const room = await this.roomAdapter.getRoom(code, correlationId);

      if (!room) {
        throw new RoomNotFoundError(code);
      }

      if (room.status !== "playing") {
        throw new GameNotActiveError(room.status);
      }

      const { player, room: resolvedRoom } =
        await this.playerResolver.resolveAuthenticatedPlayer(
          room,
          socketId,
          sessionToken,
          correlationId,
        );

      this.logger.debug("Player offering draw", {
        operation: "game_draw_action",
        correlationId,
        roomCode: code,
        playerId: player.id,
      });

      const opponent =
        player.color === "w"
          ? resolvedRoom.blackPlayer
          : resolvedRoom.whitePlayer;

      const updatedRoom = await this.roomAdapter.updateDrawOffer(
        code,
        {
          offeredBy: player.id,
          offeredAt: this.clock.now(),
        },
        correlationId,
      );

      const duration = this.clock.now() - startTime;
      this.logger.info("Draw offer processed", {
        operation: "game_draw_action",
        correlationId,
        roomCode: code,
        playerId: player.id,
        action: "offer",
        duration,
        durationMs: duration,
      });

      return {
        room: updatedRoom,
        fromPlayer: player,
        opponentPlayer: opponent,
      };
    } catch (err) {
      this.logServiceFailure(
        "game_draw_action",
        "Draw offer",
        code,
        startTime,
        correlationId,
        err,
      );
      throw err;
    }
  }

  /**
   * Responds to draw offer through roomAdapter.
   */
  public async respondDraw(
    roomCode: string,
    socketId: string,
    accept: boolean,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{
    room: RoomState;
    accept: boolean;
    byPlayerId: string;
    gameOverPayload?: GameOverPayload;
  }> {
    const startTime = this.clock.now();
    const code = normalizeRoomCode(roomCode);

    try {
      const room = await this.roomAdapter.getRoom(code, correlationId);

      if (!room) {
        throw new RoomNotFoundError(code);
      }

      if (room.status !== "playing") {
        throw new GameNotActiveError(room.status);
      }

      const { player, room: resolvedRoom } =
        await this.playerResolver.resolveAuthenticatedPlayer(
          room,
          socketId,
          sessionToken,
          correlationId,
        );

      if (!resolvedRoom.drawOffer) {
        throw new GameNotActiveError("No draw offer is currently pending");
      }

      if (resolvedRoom.drawOffer.offeredBy === player.id) {
        throw new InvalidPayloadError(
          "draw",
          "Cannot accept or decline your own draw offer",
        );
      }

      const action = accept ? "accept" : "decline";

      if (!accept) {
        const updatedRoom = await this.roomAdapter.updateDrawOffer(
          code,
          null,
          correlationId,
        );
        const duration = this.clock.now() - startTime;
        this.logger.info("Draw offer processed", {
          operation: "game_draw_action",
          correlationId,
          roomCode: code,
          playerId: player.id,
          action,
          duration,
          durationMs: duration,
        });

        return {
          room: updatedRoom,
          accept: false,
          byPlayerId: player.id,
        };
      }

      const gameOverPayload: GameOverPayload = createGameOverPayload({
        winner: "draw",
        reason: "draw_agreement",
        finalFen: resolvedRoom.game.fen,
        totalMoves: resolvedRoom.game.moveCount,
        startTimeMs: resolvedRoom.createdAt,
      });

      const updatedRoom = await this.roomAdapter.finalizeGame(
        code,
        gameOverPayload,
        correlationId,
      );

      const duration = this.clock.now() - startTime;
      this.logger.info("Draw offer processed", {
        operation: "game_draw_action",
        correlationId,
        roomCode: code,
        playerId: player.id,
        action,
        duration,
        durationMs: duration,
      });

      return {
        room: updatedRoom,
        accept: true,
        byPlayerId: player.id,
        gameOverPayload,
      };
    } catch (err) {
      this.logServiceFailure(
        "game_draw_action",
        "Draw response",
        code,
        startTime,
        correlationId,
        err,
      );
      throw err;
    }
  }

  /**
   * Initiates a rematch request following game over through roomAdapter.
   */
  public async requestRematch(
    roomCode: string,
    socketId: string,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{ room: RoomState; requestedBy: string; requesterName: string }> {
    const startTime = this.clock.now();
    const code = normalizeRoomCode(roomCode);

    try {
      const room = await this.roomAdapter.getRoom(code, correlationId);

      if (!room) {
        throw new RoomNotFoundError(code);
      }

      if (room.status !== "game_over" && room.status !== "rematch_pending") {
        throw new GameNotActiveError(
          "Rematches can only be requested after game over",
        );
      }

      const { player } = await this.playerResolver.resolveAuthenticatedPlayer(
        room,
        socketId,
        sessionToken,
        correlationId,
      );

      this.logger.debug("Player requesting rematch", {
        operation: "game_rematch_action",
        correlationId,
        roomCode: code,
        playerId: player.id,
      });

      const updatedRoom = await this.roomAdapter.updateRematch(
        code,
        {
          requestedBy: player.id,
          requestedAt: this.clock.now(),
          status: "pending",
        },
        undefined,
        undefined,
        correlationId,
      );

      const duration = this.clock.now() - startTime;
      this.logger.info("Rematch action processed", {
        operation: "game_rematch_action",
        correlationId,
        roomCode: code,
        playerId: player.id,
        status: "pending",
        duration,
        durationMs: duration,
      });

      return {
        room: updatedRoom,
        requestedBy: player.id,
        requesterName: player.name,
      };
    } catch (err) {
      this.logServiceFailure(
        "game_rematch_action",
        "Rematch request",
        code,
        startTime,
        correlationId,
        err,
      );
      throw err;
    }
  }

  /**
   * Accepts or declines rematch proposal through roomAdapter. If accepted, player piece colors are swapped.
   */
  public async respondRematch(
    roomCode: string,
    socketId: string,
    accept: boolean,
    correlationId?: string,
    sessionToken?: string,
  ): Promise<{
    room: RoomState;
    accept: boolean;
    byPlayerId: string;
    nextGameState?: GameState;
  }> {
    const startTime = this.clock.now();
    const code = normalizeRoomCode(roomCode);

    try {
      const room = await this.roomAdapter.getRoom(code, correlationId);

      if (!room) {
        throw new RoomNotFoundError(code);
      }

      const { player, room: resolvedRoom } =
        await this.playerResolver.resolveAuthenticatedPlayer(
          room,
          socketId,
          sessionToken,
          correlationId,
        );

      if (!resolvedRoom.rematch || resolvedRoom.rematch.status !== "pending") {
        throw new GameNotActiveError(
          "No pending rematch request found for this room",
        );
      }

      if (player.id === resolvedRoom.rematch.requestedBy) {
        throw new InvalidPayloadError(
          "rematch",
          "Cannot accept or decline your own rematch request",
        );
      }

      const status = accept ? "accepted" : "declined";

      if (!accept) {
        const updatedRoom = await this.roomAdapter.updateRematch(
          code,
          {
            ...resolvedRoom.rematch,
            status: "declined",
          },
          undefined,
          undefined,
          correlationId,
        );

        const duration = this.clock.now() - startTime;
        this.logger.info("Rematch action processed", {
          operation: "game_rematch_action",
          correlationId,
          roomCode: code,
          playerId: player.id,
          status,
          duration,
          durationMs: duration,
        });

        return {
          room: updatedRoom,
          accept: false,
          byPlayerId: player.id,
        };
      }

      // Accept rematch: swap piece colors
      const whitePlayer = resolvedRoom.whitePlayer;
      const blackPlayer = resolvedRoom.blackPlayer;

      if (
        !whitePlayer ||
        !blackPlayer ||
        !whitePlayer.isConnected ||
        !blackPlayer.isConnected
      ) {
        throw new GameNotActiveError(
          "Both players must be connected to start a rematch",
        );
      }

      const swappedWhite: Player = { ...blackPlayer, color: "w" };
      const swappedBlack: Player = { ...whitePlayer, color: "b" };
      const nextGameState = createInitialGameState();

      const updatedRoom = await this.roomAdapter.updateRematch(
        code,
        {
          ...resolvedRoom.rematch,
          status: "accepted",
        },
        nextGameState,
        { whitePlayer: swappedWhite, blackPlayer: swappedBlack },
        correlationId,
      );

      const duration = this.clock.now() - startTime;
      this.logger.info("Rematch action processed", {
        operation: "game_rematch_action",
        correlationId,
        roomCode: code,
        playerId: player.id,
        status,
        duration,
        durationMs: duration,
      });

      return {
        room: updatedRoom,
        accept: true,
        byPlayerId: player.id,
        nextGameState: updatedRoom.game,
      };
    } catch (err) {
      this.logServiceFailure(
        "game_rematch_action",
        "Rematch response",
        code,
        startTime,
        correlationId,
        err,
      );
      throw err;
    }
  }
}
