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

    it("adds spectator without occupying player slots", () => {
      const { nextRoom, isSpectator } = addPlayerToRoom(
        initialRoom,
        guestPlayer,
        true,
        2500,
      );

      expect(isSpectator).toBe(true);
      expect(nextRoom.spectators).toHaveLength(1);
      expect(nextRoom.spectators[0]?.id).toBe("p_guest_2");
      expect(nextRoom.blackPlayer).toBeNull();
      expect(nextRoom.lastActivityAt).toBe(2500);
      expect(nextRoom.status).toBe("lobby");
    });

    it("assigns black color to second player and transitions room status to playing", () => {
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

    it("throws GameNotActiveError when non-spectator joins a non-lobby room (CRIT-004)", () => {
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

    it("allows spectator to join even when room is not in lobby status (CRIT-004)", () => {
      const playingRoom: RoomState = {
        ...createInitialRoomState({
          roomCode: "TEST",
          hostPlayer: basePlayer,
          createdAt: 1000,
        }),
        status: "playing",
      };

      const spectator: Player = {
        id: "p_spec",
        socketId: "sock_spec",
        name: "Spectator",
        color: "w",
        isHost: false,
        isConnected: true,
        connectedAt: 2000,
      };

      const result = addPlayerToRoom(playingRoom, spectator, true, 2500);
      expect(result.isSpectator).toBe(true);
      expect(result.nextRoom.spectators).toHaveLength(1);
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
});
