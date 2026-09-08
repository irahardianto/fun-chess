import type {
  GameState,
  GameOverPayload,
  Player,
  RoomState,
} from "@fun-chess/shared";
import type { IRoomGameAdapter } from "../../rooms/index.js";
import { RoomNotFoundError } from "../../rooms/index.js";

/**
 * Unit test double for IRoomGameAdapter.
 * Emulates in-memory room mutations and exposes call-tracking spies.
 */
export class MockRoomGameAdapter implements IRoomGameAdapter {
  public rooms = new Map<string, RoomState>();

  public applyGameMoveCalls: Array<{
    roomCode: string;
    nextGameState: GameState;
    gameOverPayload?: GameOverPayload;
  }> = [];

  public finalizeGameCalls: Array<{
    roomCode: string;
    gameOverPayload: GameOverPayload;
  }> = [];

  public updateDrawOfferCalls: Array<{
    roomCode: string;
    drawOffer: RoomState["drawOffer"];
  }> = [];

  public updateRematchCalls: Array<{
    roomCode: string;
    rematch: RoomState["rematch"];
    nextGameState?: GameState;
    players?: { whitePlayer: Player | null; blackPlayer: Player | null };
  }> = [];

  public async save(room: RoomState): Promise<void> {
    this.rooms.set(room.roomCode.toUpperCase(), structuredClone(room));
  }

  public async findByCode(roomCode: string): Promise<RoomState | null> {
    return this.getRoom(roomCode);
  }

  public async getRoom(roomCode: string): Promise<RoomState | null> {
    const room = this.rooms.get(roomCode.toUpperCase());
    return room ? structuredClone(room) : null;
  }

  public async applyGameMove(
    roomCode: string,
    nextGameState: GameState,
    gameOverPayload?: GameOverPayload,
  ): Promise<RoomState> {
    const code = roomCode.toUpperCase();
    const existing = this.rooms.get(code);
    if (!existing) {
      throw new RoomNotFoundError(code);
    }
    this.applyGameMoveCalls.push({
      roomCode: code,
      nextGameState,
      gameOverPayload,
    });

    const updated: RoomState = {
      ...structuredClone(existing),
      game: structuredClone(nextGameState),
      drawOffer: null,
      lastActivityAt: Date.now(),
      status: gameOverPayload ? "game_over" : existing.status,
    };
    this.rooms.set(code, updated);
    return structuredClone(updated);
  }

  public async finalizeGame(
    roomCode: string,
    gameOverPayload: GameOverPayload,
  ): Promise<RoomState> {
    const code = roomCode.toUpperCase();
    const existing = this.rooms.get(code);
    if (!existing) {
      throw new RoomNotFoundError(code);
    }
    this.finalizeGameCalls.push({ roomCode: code, gameOverPayload });

    const updated: RoomState = {
      ...structuredClone(existing),
      status: "game_over",
      drawOffer: null,
      lastActivityAt: Date.now(),
    };
    this.rooms.set(code, updated);
    return structuredClone(updated);
  }

  public async updateDrawOffer(
    roomCode: string,
    drawOffer: RoomState["drawOffer"],
  ): Promise<RoomState> {
    const code = roomCode.toUpperCase();
    const existing = this.rooms.get(code);
    if (!existing) {
      throw new RoomNotFoundError(code);
    }
    this.updateDrawOfferCalls.push({ roomCode: code, drawOffer });

    const updated: RoomState = {
      ...structuredClone(existing),
      drawOffer: drawOffer ? structuredClone(drawOffer) : null,
      lastActivityAt: Date.now(),
    };
    this.rooms.set(code, updated);
    return structuredClone(updated);
  }

  public async updateRematch(
    roomCode: string,
    rematch: RoomState["rematch"],
    nextGameState?: GameState,
    players?: { whitePlayer: Player | null; blackPlayer: Player | null },
  ): Promise<RoomState> {
    const code = roomCode.toUpperCase();
    const existing = this.rooms.get(code);
    if (!existing) {
      throw new RoomNotFoundError(code);
    }
    this.updateRematchCalls.push({
      roomCode: code,
      rematch,
      nextGameState,
      players,
    });

    let nextStatus = existing.status;
    if (rematch?.status === "pending") {
      nextStatus = "rematch_pending";
    } else if (rematch?.status === "declined") {
      nextStatus = "game_over";
    } else if (rematch?.status === "accepted") {
      nextStatus = "playing";
    }

    const updated: RoomState = {
      ...structuredClone(existing),
      status: nextStatus,
      rematch: rematch ? structuredClone(rematch) : null,
      drawOffer: null,
      lastActivityAt: Date.now(),
      game:
        nextGameState !== undefined
          ? structuredClone(nextGameState)
          : rematch?.status === "accepted"
            ? { ...existing.game, moveCount: 0, turn: "w" }
            : existing.game,
      whitePlayer: players
        ? players.whitePlayer
        : rematch?.status === "accepted"
          ? existing.blackPlayer
          : existing.whitePlayer,
      blackPlayer: players
        ? players.blackPlayer
        : rematch?.status === "accepted"
          ? existing.whitePlayer
          : existing.blackPlayer,
    };
    this.rooms.set(code, updated);
    return structuredClone(updated);
  }

  public clear(): void {
    this.rooms.clear();
    this.applyGameMoveCalls = [];
    this.finalizeGameCalls = [];
    this.updateDrawOfferCalls = [];
    this.updateRematchCalls = [];
  }
}
