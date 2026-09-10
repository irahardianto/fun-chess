import { describe, it, expect, beforeEach, vi } from "vitest";
import { GamePlayerResolver } from "../game_player_resolver.js";
import { MockRoomGameAdapter } from "./mock_room_adapter.js";
import { MockSessionRegistry } from "../../rooms/index.js";
import { type RoomState, PlayerNotInRoomError } from "@fun-chess/shared";
import { ChessEngine } from "../chess_engine.js";
import { Chess } from "chess.js";
import { NullLogger } from "../../../platform/logger/null_logger.js";

describe("GamePlayerResolver", () => {
  let roomAdapter: MockRoomGameAdapter;
  let sessionRegistry: MockSessionRegistry;
  let logger: NullLogger;
  let resolver: GamePlayerResolver;

  const createRoom = (code = "RESOLVE"): RoomState => {
    const chess = new Chess();
    const now = Date.now();
    return {
      roomCode: code,
      status: "playing",
      hostId: "white_p1",
      whitePlayer: {
        id: "white_p1",
        socketId: "sock_white_1",
        name: "Alice",
        color: "w",
        isHost: true,
        isConnected: true,
        connectedAt: now,
        createdAt: now - 30000,
        updatedAt: now - 5000,
      },
      blackPlayer: {
        id: "black_p2",
        socketId: "sock_black_1",
        name: "Bob",
        color: "b",
        isHost: false,
        isConnected: true,
        connectedAt: now,
        createdAt: now - 30000,
        updatedAt: now - 5000,
      },
      spectators: [],
      game: ChessEngine.extractGameState(chess, null),
      rematch: null,
      drawOffer: null,
      createdAt: now - 30000,
      lastActivityAt: now - 5000,
    };
  };

  beforeEach(() => {
    roomAdapter = new MockRoomGameAdapter();
    sessionRegistry = new MockSessionRegistry();
    logger = new NullLogger();
    resolver = new GamePlayerResolver(roomAdapter, sessionRegistry, logger);
  });

  describe("resolveAuthenticatedPlayer", () => {
    it("resolves player by socketId when no sessionToken is provided", async () => {
      const room = createRoom();
      const { player, room: resolvedRoom } =
        await resolver.resolveAuthenticatedPlayer(room, "sock_white_1");

      expect(player.id).toBe("white_p1");
      expect(player.color).toBe("w");
      expect(resolvedRoom.roomCode).toBe("RESOLVE");
    });

    it("resolves black player by socketId when no sessionToken is provided", async () => {
      const room = createRoom();
      const { player } = await resolver.resolveAuthenticatedPlayer(
        room,
        "sock_black_1",
      );

      expect(player.id).toBe("black_p2");
      expect(player.color).toBe("b");
    });

    it("throws PlayerNotInRoomError when socketId does not match any player", async () => {
      const room = createRoom();
      await expect(
        resolver.resolveAuthenticatedPlayer(room, "sock_unknown"),
      ).rejects.toThrow(PlayerNotInRoomError);
    });

    it("resolves player using valid session token with matching socket", async () => {
      const room = createRoom();
      const session = await sessionRegistry.createSession({
        roomCode: "RESOLVE",
        playerId: "white_p1",
        socketId: "sock_white_1",
        color: "w",
        isHost: true,
      });

      const { player } = await resolver.resolveAuthenticatedPlayer(
        room,
        "sock_white_1",
        session.sessionToken,
      );

      expect(player.id).toBe("white_p1");
    });

    it("auto-heals socket ID when valid session token is provided with a new socket", async () => {
      const room = createRoom();
      await roomAdapter.save(room);

      const session = await sessionRegistry.createSession({
        roomCode: "RESOLVE",
        playerId: "white_p1",
        socketId: "sock_white_1",
        color: "w",
        isHost: true,
      });

      const infoSpy = vi.spyOn(logger, "info");
      const touchSpy = vi.spyOn(sessionRegistry, "touchSession");

      const { player, room: updatedRoom } =
        await resolver.resolveAuthenticatedPlayer(
          room,
          "sock_white_reconnected",
          session.sessionToken,
          "corr-heal-1",
        );

      expect(player.id).toBe("white_p1");
      expect(player.socketId).toBe("sock_white_reconnected");
      expect(updatedRoom.whitePlayer?.socketId).toBe("sock_white_reconnected");

      expect(touchSpy).toHaveBeenCalledWith(
        session.sessionToken,
        "sock_white_reconnected",
        undefined,
        { correlationId: "corr-heal-1" },
      );

      expect(infoSpy).toHaveBeenCalledWith(
        "Player socket auto-healed",
        expect.objectContaining({
          operation: "player_socket_auto_healed",
          roomCode: "RESOLVE",
          playerId: "white_p1",
          oldSocketId: "sock_white_1",
          newSocketId: "sock_white_reconnected",
          correlationId: "corr-heal-1",
        }),
      );
    });

    it("falls back to socket lookup when session verification fails", async () => {
      const room = createRoom();
      vi.spyOn(sessionRegistry, "getSessionByToken").mockRejectedValueOnce(
        new Error("Redis connection dropped"),
      );
      const warnSpy = vi.spyOn(logger, "warn");

      const { player } = await resolver.resolveAuthenticatedPlayer(
        room,
        "sock_white_1",
        "invalid_token",
        "corr-fail-1",
      );

      expect(player.id).toBe("white_p1");
      expect(warnSpy).toHaveBeenCalledWith(
        "Session validation failed during player resolution",
        expect.objectContaining({
          operation: "session_validation_fallback",
          roomCode: "RESOLVE",
          socketId: "sock_white_1",
          correlationId: "corr-fail-1",
        }),
      );
    });
  });

  describe("getPlayerBySocketId", () => {
    it("returns white player when socketId matches", () => {
      const room = createRoom();
      expect(resolver.getPlayerBySocketId(room, "sock_white_1")?.id).toBe(
        "white_p1",
      );
    });

    it("returns black player when socketId matches", () => {
      const room = createRoom();
      expect(resolver.getPlayerBySocketId(room, "sock_black_1")?.id).toBe(
        "black_p2",
      );
    });

    it("returns null when socketId does not match", () => {
      const room = createRoom();
      expect(resolver.getPlayerBySocketId(room, "non_existent")).toBeNull();
    });
  });
});
