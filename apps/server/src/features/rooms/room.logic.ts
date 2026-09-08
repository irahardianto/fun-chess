import {
  RoomState,
  Player,
  PieceColor,
  GameOverPayload,
  GameState,
  createInitialGameState,
  createGameOverPayload,
  RoomFullError,
  PlayerNotInRoomError,
} from "@fun-chess/shared";

/**
 * Creates initial RoomState for a new host player.
 */
export function createInitialRoomState(params: {
  roomCode: string;
  hostPlayer: Player;
  createdAt: number;
}): RoomState {
  return {
    roomCode: params.roomCode,
    status: "lobby",
    hostId: params.hostPlayer.id,
    createdAt: params.createdAt,
    lastActivityAt: params.createdAt,
    version: 1,
    whitePlayer: params.hostPlayer.color === "w" ? params.hostPlayer : null,
    blackPlayer: params.hostPlayer.color === "b" ? params.hostPlayer : null,
    spectators: [],
    game: createInitialGameState(),
    drawOffer: null,
    rematch: null,
  };
}

/**
 * Evaluates player color preference and assigns colors for a new room.
 */
export function assignPlayerColors(
  preferredColor?: PieceColor | "random",
  randomInt?: number,
): {
  hostColor: PieceColor;
  guestColor: PieceColor;
} {
  if (preferredColor === "w") return { hostColor: "w", guestColor: "b" };
  if (preferredColor === "b") return { hostColor: "b", guestColor: "w" };

  const isWhite = (randomInt ?? 0) % 2 === 0;
  return isWhite
    ? { hostColor: "w", guestColor: "b" }
    : { hostColor: "b", guestColor: "w" };
}

/**
 * Pure transition adding a player or spectator to an existing room.
 */
export function addPlayerToRoom(
  room: RoomState,
  player: Player,
  asSpectator: boolean,
  now: number,
): { nextRoom: RoomState; assignedColor?: PieceColor; isSpectator: boolean } {
  if (asSpectator) {
    return {
      nextRoom: {
        ...room,
        spectators: [...room.spectators, player],
        lastActivityAt: now,
      },
      isSpectator: true,
    };
  }

  // Active player joining
  if (room.whitePlayer && room.blackPlayer) {
    throw new RoomFullError(room.roomCode);
  }

  let assignedColor: PieceColor;
  let nextWhite = room.whitePlayer;
  let nextBlack = room.blackPlayer;

  if (!nextWhite) {
    assignedColor = "w";
    nextWhite = { ...player, color: "w" };
  } else {
    assignedColor = "b";
    nextBlack = { ...player, color: "b" };
  }

  const bothPlayersPresent = nextWhite !== null && nextBlack !== null;
  const nextStatus = bothPlayersPresent && room.status === "lobby" ? "playing" : room.status;

  return {
    nextRoom: {
      ...room,
      status: nextStatus,
      whitePlayer: nextWhite,
      blackPlayer: nextBlack,
      lastActivityAt: now,
    },
    assignedColor,
    isSpectator: false,
  };
}

/**
 * Pure transition updating room state when a player disconnects.
 */
export function disconnectPlayerTransition(
  room: RoomState,
  playerId: string,
  now: number,
): { nextRoom: RoomState; paused: boolean; droppedPlayer: Player | null } {
  let paused = false;
  let nextStatus = room.status;
  let nextWhite = room.whitePlayer;
  let nextBlack = room.blackPlayer;
  let droppedPlayer: Player | null = null;
  let spectators = room.spectators;

  if (nextWhite?.id === playerId) {
    nextWhite = { ...nextWhite, isConnected: false };
    droppedPlayer = nextWhite;
    if (room.status === "playing" || room.status === "paused_disconnect") {
      nextStatus = "paused_disconnect";
      paused = true;
    }
  } else if (nextBlack?.id === playerId) {
    nextBlack = { ...nextBlack, isConnected: false };
    droppedPlayer = nextBlack;
    if (room.status === "playing" || room.status === "paused_disconnect") {
      nextStatus = "paused_disconnect";
      paused = true;
    }
  } else {
    const spectator = room.spectators.find((s) => s.id === playerId);
    if (spectator) {
      droppedPlayer = { ...spectator, isConnected: false };
      spectators = room.spectators.map((s) =>
        s.id === playerId ? { ...s, isConnected: false } : s,
      );
    }
  }

  return {
    nextRoom: {
      ...room,
      status: nextStatus,
      whitePlayer: nextWhite,
      blackPlayer: nextBlack,
      spectators,
      lastActivityAt: now,
    },
    paused,
    droppedPlayer,
  };
}

/**
 * Pure transition reconnecting an authenticated player with a new socket ID.
 */
export function reconnectPlayerTransition(
  room: RoomState,
  playerId: string,
  newSocketId: string,
  now: number,
): { nextRoom: RoomState; unpaused: boolean; player: Player } {
  let unpaused = false;
  let nextWhite = room.whitePlayer;
  let nextBlack = room.blackPlayer;
  let reconnectedPlayer: Player | null = null;
  let spectators = room.spectators;

  if (nextWhite?.id === playerId) {
    nextWhite = { ...nextWhite, socketId: newSocketId, isConnected: true };
    reconnectedPlayer = nextWhite;
  } else if (nextBlack?.id === playerId) {
    nextBlack = { ...nextBlack, socketId: newSocketId, isConnected: true };
    reconnectedPlayer = nextBlack;
  } else {
    const spectator = room.spectators.find((s) => s.id === playerId);
    if (spectator) {
      const updated = { ...spectator, socketId: newSocketId, isConnected: true };
      reconnectedPlayer = updated;
      spectators = room.spectators.map((s) => (s.id === playerId ? updated : s));
    } else {
      throw new PlayerNotInRoomError(newSocketId);
    }
  }

  let nextStatus = room.status;
  if (
    room.status === "paused_disconnect" &&
    nextWhite?.isConnected &&
    nextBlack?.isConnected
  ) {
    nextStatus = "playing";
    unpaused = true;
  }

  return {
    nextRoom: {
      ...room,
      status: nextStatus,
      whitePlayer: nextWhite,
      blackPlayer: nextBlack,
      spectators,
      lastActivityAt: now,
    },
    unpaused,
    player: reconnectedPlayer,
  };
}

/**
 * Pure transition removing a leaving player from the room.
 */
export function leaveRoomTransition(
  room: RoomState,
  playerId: string,
  now: number,
): {
  nextRoom: RoomState;
  shouldDelete: boolean;
  player: Player;
  gameOverPayload?: GameOverPayload;
} {
  const isWhite = room.whitePlayer?.id === playerId;
  const isBlack = room.blackPlayer?.id === playerId;

  if (!isWhite && !isBlack) {
    const spectator = room.spectators.find((s) => s.id === playerId);
    if (!spectator) {
      throw new PlayerNotInRoomError(playerId);
    }

    return {
      nextRoom: {
        ...room,
        spectators: room.spectators.filter((s) => s.id !== playerId),
        lastActivityAt: now,
      },
      shouldDelete: false,
      player: spectator,
    };
  }

  const leavingPlayer = isWhite ? room.whitePlayer! : room.blackPlayer!;

  // Active game in progress: resigning player forfeits match by abandonment
  if (room.status === "playing" || room.status === "paused_disconnect") {
    const remainingPlayer = isWhite ? room.blackPlayer : room.whitePlayer;

    if (remainingPlayer) {
      const winnerColor: PieceColor = remainingPlayer.color;
      const gameOverPayload = createGameOverPayload({
        winner: winnerColor,
        winnerName: remainingPlayer.name,
        loserName: leavingPlayer.name,
        reason: "abandonment",
        message: `${leavingPlayer.name} left the game. ${remainingPlayer.name} won by abandonment!`,
        finalFen: room.game.fen,
        totalMoves: room.game.moveCount,
        startTimeMs: room.createdAt,
      });

      return {
        nextRoom: {
          ...room,
          status: "game_over",
          whitePlayer: null,
          blackPlayer: null,
          lastActivityAt: now,
        },
        shouldDelete: false,
        player: leavingPlayer,
        gameOverPayload,
      };
    }
  }

  // In lobby or game over: check if room is completely empty or host left
  const nextWhite = isWhite ? null : room.whitePlayer;
  const nextBlack = isBlack ? null : room.blackPlayer;
  const shouldDelete =
    leavingPlayer.isHost || (!nextWhite && !nextBlack);

  return {
    nextRoom: {
      ...room,
      whitePlayer: nextWhite,
      blackPlayer: nextBlack,
      lastActivityAt: now,
    },
    shouldDelete,
    player: leavingPlayer,
  };
}

/**
 * Pure transition applying an executed chess move to the room state.
 */
export function applyGameMoveTransition(
  room: RoomState,
  nextGameState: GameState,
  gameOverPayload?: GameOverPayload,
  now: number = Date.now(),
): RoomState {
  const nextStatus = gameOverPayload ? "game_over" : room.status;
  return {
    ...room,
    game: nextGameState,
    status: nextStatus,
    drawOffer: null, // Any move invalidates pending draw offer
    lastActivityAt: now,
  };
}

/**
 * Pure transition finalizing match completion (resignation, timeout, draw).
 */
export function finalizeGameTransition(
  room: RoomState,
  _gameOverPayload: GameOverPayload,
  now: number = Date.now(),
): RoomState {
  return {
    ...room,
    status: "game_over",
    drawOffer: null,
    lastActivityAt: now,
  };
}

/**
 * Pure transition updating draw offer state.
 */
export function updateDrawOfferTransition(
  room: RoomState,
  drawOffer: RoomState["drawOffer"],
  now: number = Date.now(),
): RoomState {
  return {
    ...room,
    drawOffer,
    lastActivityAt: now,
  };
}

/**
 * Pure transition updating rematch state and optionally swapping colors if accepted.
 */
export function updateRematchTransition(
  room: RoomState,
  rematch: RoomState["rematch"],
  newGameState?: GameState,
  now: number = Date.now(),
  players?: { whitePlayer: Player | null; blackPlayer: Player | null },
): RoomState {
  let nextStatus = room.status;
  if (rematch?.status === "pending") {
    nextStatus = "rematch_pending";
  } else if (rematch?.status === "declined") {
    nextStatus = "game_over";
  } else if (rematch?.status === "accepted") {
    nextStatus = "playing";
  }

  return {
    ...room,
    status: nextStatus,
    rematch,
    drawOffer: null,
    game:
      newGameState ??
      (rematch?.status === "accepted" ? createInitialGameState() : room.game),
    whitePlayer: players
      ? players.whitePlayer
      : rematch?.status === "accepted"
        ? room.blackPlayer
        : room.whitePlayer,
    blackPlayer: players
      ? players.blackPlayer
      : rematch?.status === "accepted"
        ? room.whitePlayer
        : room.blackPlayer,
    lastActivityAt: now,
  };
}
