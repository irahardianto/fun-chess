import {
  type GameState,
  type Player,
  type RoomState,
  type IClock,
  GameNotActiveError,
  PlayerNotInRoomError,
  InvalidPayloadError,
  createInitialGameState,
  normalizeRoomCode,
} from "@fun-chess/shared";
import type { IRoomStore } from "./room.store.js";
import type { ISessionRegistry } from "./session_registry.js";
import { updateRematchTransition } from "./room.logic.js";
import { SystemClock } from "../../platform/time/index.js";

/**
 * Contract for managing rematch proposals, acceptances, and color swaps (MAJ-017).
 */
export interface IRematchCoordinator {
  /**
   * Initiates a rematch request following match completion.
   */
  requestRematch(
    roomCode: string,
    playerId: string,
    correlationId?: string,
  ): Promise<RoomState>;

  /**
   * Accepts a rematch proposal, swaps player piece colors, and resets game state.
   */
  acceptRematch(
    roomCode: string,
    playerId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; newGame: GameState }>;

  /**
   * Declines a rematch proposal.
   */
  declineRematch(
    roomCode: string,
    playerId: string,
    correlationId?: string,
  ): Promise<RoomState>;
}

/**
 * Coordinates rematch negotiation lifecycle, atomic piece color swapping,
 * and session registry updates under room store locks (MAJ-017).
 */
export class RematchCoordinator implements IRematchCoordinator {
  constructor(
    private readonly store: IRoomStore,
    private readonly sessionRegistry: ISessionRegistry,
    private readonly clock: IClock = new SystemClock(),
  ) {}

  public async requestRematch(
    roomCode: string,
    playerId: string,
    correlationId?: string,
  ): Promise<RoomState> {
    const code = normalizeRoomCode(roomCode);

    return this.store.mutate(
      code,
      async (room) => {
        if (room.status !== "game_over" && room.status !== "rematch_pending") {
          throw new GameNotActiveError(
            "Rematches can only be requested after game over",
          );
        }

        const isParticipant =
          room.whitePlayer?.id === playerId || room.blackPlayer?.id === playerId;
        if (!isParticipant) {
          throw new PlayerNotInRoomError();
        }

        const now = this.clock.now();
        const updated = updateRematchTransition(
          room,
          {
            requestedBy: playerId,
            requestedAt: now,
            status: "pending",
          },
          undefined,
          now,
        );

        return { updatedRoom: updated, result: updated };
      },
      correlationId,
    );
  }

  public async acceptRematch(
    roomCode: string,
    playerId: string,
    correlationId?: string,
  ): Promise<{ room: RoomState; newGame: GameState }> {
    const code = normalizeRoomCode(roomCode);

    const result = await this.store.mutate(
      code,
      async (room) => {
        if (!room.rematch || room.rematch.status !== "pending") {
          throw new GameNotActiveError(
            "No pending rematch request found for this room",
          );
        }

        const isParticipant =
          room.whitePlayer?.id === playerId || room.blackPlayer?.id === playerId;
        if (!isParticipant) {
          throw new PlayerNotInRoomError();
        }

        if (room.rematch.requestedBy === playerId) {
          throw new InvalidPayloadError(
            "rematch",
            "Cannot accept or decline your own rematch request",
          );
        }

        const whitePlayer = room.whitePlayer;
        const blackPlayer = room.blackPlayer;

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
        const now = this.clock.now();

        const updated = updateRematchTransition(
          room,
          {
            ...room.rematch,
            status: "accepted",
          },
          nextGameState,
          now,
          { whitePlayer: swappedWhite, blackPlayer: swappedBlack },
        );

        return {
          updatedRoom: updated,
          result: {
            room: updated,
            newGame: nextGameState,
            swappedWhite,
            swappedBlack,
          },
        };
      },
      correlationId,
    );

    // Synchronize session registry player colors following color swap
    if (result.swappedWhite) {
      await this.sessionRegistry.updateSessionColor(
        code,
        result.swappedWhite.id,
        "w",
        { correlationId },
      );
    }
    if (result.swappedBlack) {
      await this.sessionRegistry.updateSessionColor(
        code,
        result.swappedBlack.id,
        "b",
        { correlationId },
      );
    }

    return { room: result.room, newGame: result.newGame };
  }

  public async declineRematch(
    roomCode: string,
    playerId: string,
    correlationId?: string,
  ): Promise<RoomState> {
    const code = normalizeRoomCode(roomCode);

    return this.store.mutate(
      code,
      async (room) => {
        if (!room.rematch || room.rematch.status !== "pending") {
          throw new GameNotActiveError(
            "No pending rematch request found for this room",
          );
        }

        const isParticipant =
          room.whitePlayer?.id === playerId || room.blackPlayer?.id === playerId;
        if (!isParticipant) {
          throw new PlayerNotInRoomError();
        }

        if (room.rematch.requestedBy === playerId) {
          throw new InvalidPayloadError(
            "rematch",
            "Cannot accept or decline your own rematch request",
          );
        }

        const now = this.clock.now();
        const updated = updateRematchTransition(
          room,
          {
            ...room.rematch,
            status: "declined",
          },
          undefined,
          now,
        );

        return { updatedRoom: updated, result: updated };
      },
      correlationId,
    );
  }
}
