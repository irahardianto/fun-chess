import { describe, it, expect } from "vitest";
import {
  createInitialRoomState,
  assignPlayerColors,
  addPlayerToRoom,
  disconnectPlayerTransition,
  reconnectPlayerTransition,
  leaveRoomTransition,
  applyGameMoveTransition,
  finalizeGameTransition,
  updateDrawOfferTransition,
  updateRematchTransition,
  sanitizePublicPlayer,
  sanitizePublicRoom,
  abandonmentForfeitTransition,
} from "../room.logic.js";
import {
  Player,
  RoomState,
  createInitialGameState,
  createGameOverPayload,
  RoomFullError,
  PlayerNotInRoomError,
  GameNotActiveError,
} from "@fun-chess/shared";

describe("room.logic pure functions", () => {
  const basePlayer: Player = {
    id: "p_host_1",
    socketId: "sock_host_1",
    name: "Host Player",
    color: "w",
    isHost: true,
    isConnected: true,
    connectedAt: 1000,
  };

  describe("createInitialRoomState", () => {
    it("creates initial room state with white host", () => {
      const room = createInitialRoomState({
        roomCode: "ABCD",
        hostPlayer: basePlayer,
        createdAt: 1000,
      });

      expect(room.roomCode).toBe("ABCD");
      expect(room.status).toBe("lobby");
      expect(room.hostId).toBe("p_host_1");
      expect(room.whitePlayer).toEqual(basePlayer);
      expect(room.blackPlayer).toBeNull();
      expect(room.spectators).toEqual([]);
      expect(room.version).toBe(1);
      expect(room.createdAt).toBe(1000);
      expect(room.lastActivityAt).toBe(1000);
      expect(room.drawOffer).toBeNull();
      expect(room.rematch).toBeNull();
    });

    it("creates initial room state with black host", () => {
      const blackHost: Player = { ...basePlayer, color: "b" };
      const room = createInitialRoomState({
        roomCode: "BCDE",
        hostPlayer: blackHost,
        createdAt: 2000,
      });

      expect(room.whitePlayer).toBeNull();
      expect(room.blackPlayer).toEqual(blackHost);
    });
  });

  describe("assignPlayerColors", () => {
    it("returns white host and black guest when preferredColor is w", () => {
      const colors = assignPlayerColors("w");
      expect(colors).toEqual({ hostColor: "w", guestColor: "b" });
    });

    it("returns black host and white guest when preferredColor is b", () => {
      const colors = assignPlayerColors("b");
      expect(colors).toEqual({ hostColor: "b", guestColor: "w" });
    });

    it("assigns white host when randomInt is even", () => {
      const colors = assignPlayerColors("random", 4);
      expect(colors).toEqual({ hostColor: "w", guestColor: "b" });
    });

    it("assigns black host when randomInt is odd", () => {
      const colors = assignPlayerColors("random", 7);
      expect(colors).toEqual({ hostColor: "b", guestColor: "w" });
    });
  });

  describe("addPlayerToRoom", () => {
    const initialRoom = createInitialRoomState({
      roomCode: "TEST",
      hostPlayer: basePlayer,
      createdAt: 1000,
    });

    const guestPlayer: Player = {
      id: "p_guest_2",
      socketId: "sock_guest_2",
      name: "Guest Player",
      color: "b",
      isHost: false,
      isConnected: true,
      connectedAt: 2000,
    };



    it("assigns black color to second player using 3-argument signature (MIN-021)", () => {
      const { nextRoom, assignedColor, isSpectator } = addPlayerToRoom(
        initialRoom,
        guestPlayer,
        2500,
      );

      expect(isSpectator).toBe(false);
      expect(assignedColor).toBe("b");
      expect(nextRoom.whitePlayer).toEqual(basePlayer);
      expect(nextRoom.blackPlayer).toEqual({ ...guestPlayer, color: "b" });
      expect(nextRoom.status).toBe("playing");
      expect(nextRoom.lastActivityAt).toBe(2500);
    });

    it("assigns black color to second player and transitions room status to playing (4-argument signature)", () => {
      const { nextRoom, assignedColor, isSpectator } = addPlayerToRoom(
        initialRoom,
        guestPlayer,
        false,
        2500,
      );

      expect(isSpectator).toBe(false);
      expect(assignedColor).toBe("b");
      expect(nextRoom.whitePlayer).toEqual(basePlayer);
      expect(nextRoom.blackPlayer).toEqual({ ...guestPlayer, color: "b" });
      expect(nextRoom.status).toBe("playing");
      expect(nextRoom.lastActivityAt).toBe(2500);
    });

    it("assigns white color if room only had black player", () => {
      const blackOnlyRoom: RoomState = {
        ...initialRoom,
        whitePlayer: null,
        blackPlayer: { ...basePlayer, color: "b" },
      };

      const { nextRoom, assignedColor } = addPlayerToRoom(
        blackOnlyRoom,
        guestPlayer,
        false,
        3000,
      );

      expect(assignedColor).toBe("w");
      expect(nextRoom.whitePlayer).toEqual({ ...guestPlayer, color: "w" });
      expect(nextRoom.status).toBe("playing");
    });

    it("throws RoomFullError if both player slots are filled", () => {
      const fullRoom: RoomState = {
        ...initialRoom,
        blackPlayer: guestPlayer,
        status: "playing",
      };

      const thirdPlayer: Player = {
        id: "p_third",
        socketId: "sock_third",
        name: "Third",
        color: "w",
        isHost: false,
        isConnected: true,
        connectedAt: 3000,
      };

      expect(() => addPlayerToRoom(fullRoom, thirdPlayer, false, 3500)).toThrow(
        RoomFullError,
      );
    });

    it("throws GameNotActiveError when player joins a non-lobby room (CRIT-004)", () => {
      const statuses = ["playing", "paused_disconnect", "game_over"] as const;

      for (const status of statuses) {
        const nonLobbyRoom: RoomState = {
          ...createInitialRoomState({
            roomCode: "TEST",
            hostPlayer: basePlayer,
            createdAt: 1000,
          }),
          status,
        };

        const joiningPlayer: Player = {
          id: "p_joiner",
          socketId: "sock_joiner",
          name: "Joiner",
          color: "b",
          isHost: false,
          isConnected: true,
          connectedAt: 2000,
        };

        expect(() =>
          addPlayerToRoom(nonLobbyRoom, joiningPlayer, false, 2500),
        ).toThrow(GameNotActiveError);
      }
    });

    it("throws an error if now is omitted (MAJ-016)", () => {
      expect(() =>
        // @ts-expect-error testing runtime missing parameter
        addPlayerToRoom(initialRoom, guestPlayer),
      ).toThrow("Missing required 'now' parameter in addPlayerToRoom");
    });
  });

  describe("disconnectPlayerTransition", () => {
    const playingRoom: RoomState = {
      ...createInitialRoomState({
        roomCode: "PLAY",
        hostPlayer: basePlayer,
        createdAt: 1000,
      }),
      blackPlayer: {
        id: "p_guest_2",
        socketId: "sock_guest_2",
        name: "Guest Player",
        color: "b",
        isHost: false,
        isConnected: true,
        connectedAt: 2000,
      },
      status: "playing",
    };

    it("pauses active game when white player disconnects", () => {
      const { nextRoom, paused, droppedPlayer } = disconnectPlayerTransition(
        playingRoom,
        basePlayer.id,
        3000,
      );

      expect(paused).toBe(true);
      expect(droppedPlayer?.id).toBe(basePlayer.id);
      expect(nextRoom.whitePlayer?.isConnected).toBe(false);
      expect(nextRoom.status).toBe("paused_disconnect");
      expect(nextRoom.lastActivityAt).toBe(3000);
    });

    it("pauses active game when black player disconnects", () => {
      const { nextRoom, paused, droppedPlayer } = disconnectPlayerTransition(
        playingRoom,
        "p_guest_2",
        3000,
      );

      expect(paused).toBe(true);
      expect(droppedPlayer?.id).toBe("p_guest_2");
      expect(nextRoom.blackPlayer?.isConnected).toBe(false);
      expect(nextRoom.status).toBe("paused_disconnect");
    });

    it("marks spectator disconnected without pausing match", () => {
      const spectator: Player = {
        id: "p_spec",
        socketId: "sock_spec",
        name: "Spec",
        color: "w",
        isHost: false,
        isConnected: true,
        connectedAt: 2500,
      };

      const roomWithSpec: RoomState = {
        ...playingRoom,
        spectators: [spectator],
      };

      const { nextRoom, paused, droppedPlayer } = disconnectPlayerTransition(
        roomWithSpec,
        "p_spec",
        4000,
      );

      expect(paused).toBe(false);
      expect(droppedPlayer?.id).toBe("p_spec");
      expect(nextRoom.spectators[0]?.isConnected).toBe(false);
      expect(nextRoom.status).toBe("playing");
    });
  });

  describe("reconnectPlayerTransition", () => {
    const pausedRoom: RoomState = {
      ...createInitialRoomState({
        roomCode: "RECN",
        hostPlayer: { ...basePlayer, isConnected: false },
        createdAt: 1000,
      }),
      blackPlayer: {
        id: "p_guest_2",
        socketId: "sock_guest_2",
        name: "Guest Player",
        color: "b",
        isHost: false,
        isConnected: true,
        connectedAt: 2000,
      },
      status: "paused_disconnect",
    };

    it("reconnects white player and resumes game to playing", () => {
      const { nextRoom, unpaused, player } = reconnectPlayerTransition(
        pausedRoom,
        basePlayer.id,
        "sock_host_reconnected",
        5000,
      );

      expect(unpaused).toBe(true);
      expect(player.id).toBe(basePlayer.id);
      expect(player.socketId).toBe("sock_host_reconnected");
      expect(player.isConnected).toBe(true);
      expect(nextRoom.whitePlayer?.socketId).toBe("sock_host_reconnected");
      expect(nextRoom.whitePlayer?.isConnected).toBe(true);
      expect(nextRoom.status).toBe("playing");
      expect(nextRoom.lastActivityAt).toBe(5000);
    });

    it("throws PlayerNotInRoomError if playerId does not match any participant", () => {
      expect(() =>
        reconnectPlayerTransition(
          pausedRoom,
          "unknown_player",
          "new_sock",
          5000,
        ),
      ).toThrow(PlayerNotInRoomError);
    });
  });

  describe("leaveRoomTransition", () => {
    const playingRoom: RoomState = {
      ...createInitialRoomState({
        roomCode: "LEAV",
        hostPlayer: basePlayer,
        createdAt: 1000,
      }),
      blackPlayer: {
        id: "p_guest_2",
        socketId: "sock_guest_2",
        name: "Guest Player",
        color: "b",
        isHost: false,
        isConnected: true,
        connectedAt: 2000,
      },
      status: "playing",
    };

    it("awards abandonment victory to white when black player leaves active match", () => {
      const { nextRoom, shouldDelete, gameOverPayload } = leaveRoomTransition(
        playingRoom,
        "p_guest_2",
        6000,
      );

      expect(shouldDelete).toBe(false);
      expect(nextRoom.status).toBe("game_over");
      expect(nextRoom.blackPlayer).toBeNull();
      expect(nextRoom.whitePlayer).toEqual(basePlayer);
      expect(gameOverPayload).toBeDefined();
      expect(gameOverPayload?.winner).toBe("w");
      expect(gameOverPayload?.winnerName).toBe("Host Player");
      expect(gameOverPayload?.reason).toBe("abandonment");
      expect(gameOverPayload?.message).toContain("won by abandonment!");
    });

    it("awards abandonment victory to black when white player leaves active match", () => {
      const { nextRoom, shouldDelete, gameOverPayload } = leaveRoomTransition(
        playingRoom,
        basePlayer.id,
        6000,
      );

      expect(shouldDelete).toBe(false);
      expect(nextRoom.status).toBe("game_over");
      expect(nextRoom.whitePlayer).toBeNull();
      expect(nextRoom.blackPlayer).toEqual(playingRoom.blackPlayer);
      expect(gameOverPayload?.winner).toBe("b");
      expect(gameOverPayload?.winnerName).toBe("Guest Player");
    });

    it("sets shouldDelete: true when host leaves lobby", () => {
      const lobbyRoom = createInitialRoomState({
        roomCode: "LOBB",
        hostPlayer: basePlayer,
        createdAt: 1000,
      });

      const { shouldDelete } = leaveRoomTransition(
        lobbyRoom,
        basePlayer.id,
        2000,
      );

      expect(shouldDelete).toBe(true);
    });

    it("removes spectator on leave without ending match", () => {
      const spectator: Player = {
        id: "p_spec",
        socketId: "sock_spec",
        name: "Spec",
        color: "w",
        isHost: false,
        isConnected: true,
        connectedAt: 2500,
      };

      const roomWithSpec: RoomState = {
        ...playingRoom,
        spectators: [spectator],
      };

      const { nextRoom, shouldDelete, gameOverPayload } = leaveRoomTransition(
        roomWithSpec,
        "p_spec",
        7000,
      );

      expect(shouldDelete).toBe(false);
      expect(gameOverPayload).toBeUndefined();
      expect(nextRoom.spectators).toEqual([]);
      expect(nextRoom.status).toBe("playing");
    });
  });

  describe("applyGameMoveTransition & finalizeGameTransition", () => {
    const baseRoom = createInitialRoomState({
      roomCode: "MOVE",
      hostPlayer: basePlayer,
      createdAt: 1000,
    });

    it("applies move and clears pending draw offer", () => {
      const roomWithDraw: RoomState = {
        ...baseRoom,
        drawOffer: { offeredBy: basePlayer.id, offeredAt: 1500 },
      };

      const nextGame = { ...createInitialGameState(), turn: "b" as const };
      const updated = applyGameMoveTransition(
        roomWithDraw,
        nextGame,
        undefined,
        2000,
      );

      expect(updated.game.turn).toBe("b");
      expect(updated.drawOffer).toBeNull();
      expect(updated.lastActivityAt).toBe(2000);
    });

    it("applies game over move and updates status to game_over", () => {
      const nextGame = { ...createInitialGameState(), isCheckmate: true };
      const gameOverPayload = createGameOverPayload({
        winner: "w",
        winnerName: "Host Player",
        reason: "checkmate",
        finalFen: nextGame.fen,
        totalMoves: 1,
        startTimeMs: 1000,
      });

      const updated = applyGameMoveTransition(
        baseRoom,
        nextGame,
        gameOverPayload,
        2500,
      );

      expect(updated.status).toBe("game_over");
    });

    it("finalizes match with finalizeGameTransition", () => {
      const gameOverPayload = createGameOverPayload({
        winner: "draw",
        reason: "draw_agreement",
        finalFen: baseRoom.game.fen,
        totalMoves: 10,
        startTimeMs: 1000,
      });

      const updated = finalizeGameTransition(baseRoom, gameOverPayload, 3000);
      expect(updated.status).toBe("game_over");
      expect(updated.drawOffer).toBeNull();
      expect(updated.lastActivityAt).toBe(3000);
    });
  });

  describe("updateDrawOfferTransition & updateRematchTransition", () => {
    const baseRoom = createInitialRoomState({
      roomCode: "OFFR",
      hostPlayer: basePlayer,
      createdAt: 1000,
    });

    it("updates draw offer state", () => {
      const offer = { offeredBy: basePlayer.id, offeredAt: 1500 };
      const updated = updateDrawOfferTransition(baseRoom, offer, 1500);
      expect(updated.drawOffer).toEqual(offer);
      expect(updated.lastActivityAt).toBe(1500);
    });

    it("updates rematch state to accepted and swaps players", () => {
      const guestPlayer: Player = {
        id: "p_guest",
        socketId: "sock_guest",
        name: "Guest",
        color: "b",
        isHost: false,
        isConnected: true,
        connectedAt: 2000,
      };

      const roomWithBoth: RoomState = {
        ...baseRoom,
        status: "game_over",
        blackPlayer: guestPlayer,
      };

      const updated = updateRematchTransition(
        roomWithBoth,
        { requestedBy: guestPlayer.id, requestedAt: 3000, status: "accepted" },
        undefined,
        3500,
      );

      expect(updated.status).toBe("playing");
      expect(updated.whitePlayer?.id).toBe(guestPlayer.id);
      expect(updated.blackPlayer?.id).toBe(basePlayer.id);
      expect(updated.rematch?.status).toBe("accepted");
      expect(updated.lastActivityAt).toBe(3500);
    });
  });

  describe("sanitizePublicPlayer & sanitizePublicRoom (F-01)", () => {
    const playerWithSocket: Player = {
      id: "p_test_1",
      socketId: "sock_secret_123",
      name: "Magnus",
      avatar: "avatar_1",
      color: "w",
      isHost: true,
      isConnected: true,
      connectedAt: 123456,
    };

    it("sanitizePublicPlayer completely strips socketId while preserving all other fields", () => {
      const sanitized = sanitizePublicPlayer(playerWithSocket);

      expect(sanitized.socketId).toBeUndefined();
      expect("socketId" in sanitized).toBe(false);
      expect(sanitized.id).toBe("p_test_1");
      expect(sanitized.name).toBe("Magnus");
      expect(sanitized.avatar).toBe("avatar_1");
      expect(sanitized.color).toBe("w");
      expect(sanitized.isHost).toBe(true);
      expect(sanitized.isConnected).toBe(true);
      expect(sanitized.connectedAt).toBe(123456);
    });

    it("sanitizePublicRoom completely strips socketId from whitePlayer, blackPlayer, and spectators", () => {
      const guestWithSocket: Player = {
        id: "p_guest_2",
        socketId: "sock_secret_456",
        name: "Hikaru",
        avatar: "avatar_2",
        color: "b",
        isHost: false,
        isConnected: true,
        connectedAt: 234567,
      };

      const spectatorWithSocket: Player = {
        id: "p_spec_3",
        socketId: "sock_secret_789",
        name: "Spectator",
        color: "w",
        isHost: false,
        isConnected: true,
        connectedAt: 345678,
      };

      const rawRoom: RoomState = {
        roomCode: "PRIV",
        status: "playing",
        hostId: playerWithSocket.id,
        createdAt: 1000,
        lastActivityAt: 1500,
        version: 2,
        whitePlayer: playerWithSocket,
        blackPlayer: guestWithSocket,
        spectators: [spectatorWithSocket],
        game: createInitialGameState(),
        drawOffer: null,
        rematch: null,
      };

      const publicRoom = sanitizePublicRoom(rawRoom);

      // Room metadata preserved
      expect(publicRoom.roomCode).toBe("PRIV");
      expect(publicRoom.status).toBe("playing");
      expect(publicRoom.hostId).toBe(playerWithSocket.id);

      // whitePlayer sanitized
      expect(publicRoom.whitePlayer).not.toBeNull();
      expect(publicRoom.whitePlayer?.socketId).toBeUndefined();
      expect("socketId" in (publicRoom.whitePlayer ?? {})).toBe(false);
      expect(publicRoom.whitePlayer?.id).toBe("p_test_1");
      expect(publicRoom.whitePlayer?.name).toBe("Magnus");
      expect(publicRoom.whitePlayer?.avatar).toBe("avatar_1");
      expect(publicRoom.whitePlayer?.color).toBe("w");
      expect(publicRoom.whitePlayer?.isHost).toBe(true);
      expect(publicRoom.whitePlayer?.isConnected).toBe(true);
      expect(publicRoom.whitePlayer?.connectedAt).toBe(123456);

      // blackPlayer sanitized
      expect(publicRoom.blackPlayer).not.toBeNull();
      expect(publicRoom.blackPlayer?.socketId).toBeUndefined();
      expect("socketId" in (publicRoom.blackPlayer ?? {})).toBe(false);
      expect(publicRoom.blackPlayer?.id).toBe("p_guest_2");
      expect(publicRoom.blackPlayer?.name).toBe("Hikaru");
      expect(publicRoom.blackPlayer?.avatar).toBe("avatar_2");
      expect(publicRoom.blackPlayer?.color).toBe("b");
      expect(publicRoom.blackPlayer?.isHost).toBe(false);
      expect(publicRoom.blackPlayer?.isConnected).toBe(true);
      expect(publicRoom.blackPlayer?.connectedAt).toBe(234567);

      // spectators sanitized
      expect(publicRoom.spectators).toHaveLength(1);
      const publicSpec = publicRoom.spectators[0]!;
      expect(publicSpec.socketId).toBeUndefined();
      expect("socketId" in publicSpec).toBe(false);
      expect(publicSpec.id).toBe("p_spec_3");
      expect(publicSpec.name).toBe("Spectator");
      expect(publicSpec.color).toBe("w");
      expect(publicSpec.isHost).toBe(false);
      expect(publicSpec.isConnected).toBe(true);
      expect(publicSpec.connectedAt).toBe(345678);
    });

    it("sanitizePublicRoom handles null players and non-array spectators gracefully", () => {
      const emptyRoom: RoomState = {
        roomCode: "EMPT",
        status: "lobby",
        hostId: "none",
        createdAt: 1000,
        lastActivityAt: 1000,
        version: 1,
        whitePlayer: null,
        blackPlayer: null,
        spectators: [] as any,
        game: createInitialGameState(),
        drawOffer: null,
        rematch: null,
      };

      const sanitized = sanitizePublicRoom(emptyRoom);
      expect(sanitized.whitePlayer).toBeNull();
      expect(sanitized.blackPlayer).toBeNull();
      expect(sanitized.spectators).toEqual([]);

      // Non-array spectators fallback
      const nonArraySpectatorsRoom = {
        ...emptyRoom,
        spectators: null as unknown as Player[],
      };
      const sanitizedFallback = sanitizePublicRoom(nonArraySpectatorsRoom);
      expect(sanitizedFallback.spectators).toEqual([]);
    });
  });

  describe("abandonmentForfeitTransition", () => {
    const whitePlayer: Player = {
      id: "p_white",
      socketId: "sock_white",
      name: "WhitePlayer",
      color: "w",
      isHost: true,
      isConnected: false,
      connectedAt: 1000,
    };

    const blackPlayer: Player = {
      id: "p_black",
      socketId: "sock_black",
      name: "BlackPlayer",
      color: "b",
      isHost: false,
      isConnected: true,
      connectedAt: 1000,
    };

    const pausedRoom: RoomState = {
      roomCode: "FORF",
      status: "paused_disconnect",
      hostId: "p_white",
      createdAt: 1000,
      lastActivityAt: 2000,
      version: 3,
      whitePlayer,
      blackPlayer,
      spectators: [],
      game: createInitialGameState(),
      drawOffer: "w",
      rematch: null,
    };

    it("returns null if room status is not paused_disconnect", () => {
      const playingRoom: RoomState = { ...pausedRoom, status: "playing" };
      expect(abandonmentForfeitTransition(playingRoom, "p_white", 3000)).toBeNull();

      const lobbyRoom: RoomState = { ...pausedRoom, status: "lobby" };
      expect(abandonmentForfeitTransition(lobbyRoom, "p_white", 3000)).toBeNull();

      const gameOverRoom: RoomState = { ...pausedRoom, status: "game_over" };
      expect(abandonmentForfeitTransition(gameOverRoom, "p_white", 3000)).toBeNull();
    });

    it("returns null if disconnectedPlayerId does not match any player in room", () => {
      expect(abandonmentForfeitTransition(pausedRoom, "unknown_player", 3000)).toBeNull();
    });

    it("returns null if player has reconnected in the interim (isConnected: true)", () => {
      const reconnectedRoom: RoomState = {
        ...pausedRoom,
        whitePlayer: { ...whitePlayer, isConnected: true },
      };
      expect(abandonmentForfeitTransition(reconnectedRoom, "p_white", 3000)).toBeNull();
    });

    it("awards victory to black when white disconnects and forfeits", () => {
      const result = abandonmentForfeitTransition(pausedRoom, "p_white", 3500);
      expect(result).not.toBeNull();
      expect(result?.nextRoom.status).toBe("game_over");
      expect(result?.nextRoom.drawOffer).toBeNull();
      expect(result?.nextRoom.lastActivityAt).toBe(3500);
      expect(result?.gameOverPayload.winner).toBe("b");
      expect(result?.gameOverPayload.winnerName).toBe("BlackPlayer");
      expect(result?.gameOverPayload.reason).toBe("abandonment");
      expect(result?.gameOverPayload.message).toContain("WhitePlayer disconnected");
      expect(result?.gameOverPayload.message).toContain("BlackPlayer won by abandonment");
    });

    it("awards victory to white when black disconnects and forfeits", () => {
      const roomWithBlackDisconnected: RoomState = {
        ...pausedRoom,
        whitePlayer: { ...whitePlayer, isConnected: true },
        blackPlayer: { ...blackPlayer, isConnected: false },
      };

      const result = abandonmentForfeitTransition(roomWithBlackDisconnected, "p_black", 4000);
      expect(result).not.toBeNull();
      expect(result?.nextRoom.status).toBe("game_over");
      expect(result?.gameOverPayload.winner).toBe("w");
      expect(result?.gameOverPayload.winnerName).toBe("WhitePlayer");
      expect(result?.gameOverPayload.reason).toBe("abandonment");
      expect(result?.gameOverPayload.message).toContain("BlackPlayer disconnected");
      expect(result?.gameOverPayload.message).toContain("WhitePlayer won by abandonment");
    });

    it("awards draw when both players are disconnected upon timer expiration", () => {
      const bothDisconnectedRoom: RoomState = {
        ...pausedRoom,
        whitePlayer: { ...whitePlayer, isConnected: false },
        blackPlayer: { ...blackPlayer, isConnected: false },
      };

      const result = abandonmentForfeitTransition(bothDisconnectedRoom, "p_white", 5000);
      expect(result).not.toBeNull();
      expect(result?.nextRoom.status).toBe("game_over");
      expect(result?.gameOverPayload.winner).toBe("draw");
      expect(result?.gameOverPayload.reason).toBe("abandonment");
    });
  });
});
