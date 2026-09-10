import {
  type GameOverPayload,
  type RoomState,
  type IClock,
  GameNotActiveError,
  PlayerNotInRoomError,
  InvalidPayloadError,
  createGameOverPayload,
  normalizeRoomCode,
} from "@fun-chess/shared";
import type { IRoomStore } from "./room.store.js";
import {
  updateDrawOfferTransition,
  finalizeGameTransition,
} from "./room.logic.js";
import { SystemClock } from "../../platform/time/index.js";

/**
 * Contract for managing draw offer negotiations and state transitions (MAJ-017).
 */
export interface IDrawCoordinator {
  /**
   * Records a draw offer proposed by a player in the active room.
   */
  offerDraw(
    roomCode: string,
    playerId: string,
    correlationId?: string,
  ): Promise<RoomState>;

  /**
   * Accepts a pending draw offer, ending the match by agreement.
   */
  acceptDraw(
    roomCode: string,
    playerId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; gameOver: GameOverPayload }>;

  /**
   * Declines a pending draw offer, resetting draw offer state.
   */
  declineDraw(
    roomCode: string,
    playerId: string,
    correlationId?: string,
  ): Promise<RoomState>;

  /**
   * Purely clears any pending draw offer upon move submission.
   */
  cancelDrawOnMove(room: RoomState): RoomState;
}

/**
 * Coordinates draw negotiations under exclusive room store locks (MAJ-017).
 */
export class DrawCoordinator implements IDrawCoordinator {
  constructor(
    private readonly store: IRoomStore,
    private readonly clock: IClock = new SystemClock(),
  ) {}

  public async offerDraw(
    roomCode: string,
    playerId: string,
    correlationId?: string,
  ): Promise<RoomState> {
    const code = normalizeRoomCode(roomCode);

    return this.store.mutate(
      code,
      async (room) => {
        if (room.status !== "playing") {
          throw new GameNotActiveError(room.status);
        }

        const isParticipant =
          room.whitePlayer?.id === playerId || room.blackPlayer?.id === playerId;
        if (!isParticipant) {
          throw new PlayerNotInRoomError();
        }

        const now = this.clock.now();
        const updated = updateDrawOfferTransition(
          room,
          { offeredBy: playerId, offeredAt: now },
          now,
        );

        return { updatedRoom: updated, result: updated };
      },
      correlationId,
    );
  }

  public async acceptDraw(
    roomCode: string,
    playerId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; gameOver: GameOverPayload }> {
    const code = normalizeRoomCode(roomCode);

    return this.store.mutate(
      code,
      async (room) => {
        if (room.status !== "playing") {
          throw new GameNotActiveError(room.status);
        }

        const isParticipant =
          room.whitePlayer?.id === playerId || room.blackPlayer?.id === playerId;
        if (!isParticipant) {
          throw new PlayerNotInRoomError();
        }

        if (!room.drawOffer) {
          throw new GameNotActiveError("No draw offer is currently pending");
        }

        if (room.drawOffer.offeredBy === playerId) {
          throw new InvalidPayloadError(
            "draw",
            "Cannot accept or decline your own draw offer",
          );
        }

        const gameOverPayload: GameOverPayload = createGameOverPayload({
          winner: "draw",
          reason: "draw_agreement",
          finalFen: room.game.fen,
          totalMoves: room.game.moveCount,
          startTimeMs: room.createdAt,
        });

        const now = this.clock.now();
        const updated = finalizeGameTransition(room, gameOverPayload, now);

        return {
          updatedRoom: updated,
          result: { room: updated, gameOver: gameOverPayload },
        };
      },
      correlationId,
    );
  }

  public async declineDraw(
    roomCode: string,
    playerId: string,
    correlationId?: string,
  ): Promise<RoomState> {
    const code = normalizeRoomCode(roomCode);

    return this.store.mutate(
      code,
      async (room) => {
        if (room.status !== "playing") {
          throw new GameNotActiveError(room.status);
        }

        const isParticipant =
          room.whitePlayer?.id === playerId || room.blackPlayer?.id === playerId;
        if (!isParticipant) {
          throw new PlayerNotInRoomError();
        }

        if (!room.drawOffer) {
          throw new GameNotActiveError("No draw offer is currently pending");
        }

        if (room.drawOffer.offeredBy === playerId) {
          throw new InvalidPayloadError(
            "draw",
            "Cannot accept or decline your own draw offer",
          );
        }

        const now = this.clock.now();
        const updated = updateDrawOfferTransition(room, null, now);

        return { updatedRoom: updated, result: updated };
      },
      correlationId,
    );
  }

  public cancelDrawOnMove(room: RoomState): RoomState {
    if (!room.drawOffer) {
      return room;
    }
    return {
      ...room,
      drawOffer: null,
    };
  }
}
