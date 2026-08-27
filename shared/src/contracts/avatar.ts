/**
 * Curated kid-friendly player avatars available across Fun Chess.
 */
export const PLAYER_AVATARS = ['🦁', '🚀', '🦄', '⚡', '👑', '🐼'] as const;

/**
 * Avatar emoji literal type derived from PLAYER_AVATARS.
 */
export type PlayerAvatar = (typeof PLAYER_AVATARS)[number];

/**
 * Default fallback avatar for Player 1 / Self.
 */
export const DEFAULT_PLAYER_AVATAR: PlayerAvatar = '🦁';

/**
 * Default fallback avatar for Player 2 / Opponent.
 */
export const DEFAULT_OPPONENT_AVATAR: PlayerAvatar = '🐼';
