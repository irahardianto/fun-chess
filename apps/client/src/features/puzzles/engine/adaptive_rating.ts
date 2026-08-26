import type {
  RatingAdjustmentParams,
  RatingAdjustmentResult,
} from '@fun-chess/shared';

export const MIN_ELO_FLOOR = 500;
export const BASE_K_FACTOR = 32;

export type KidRankTierId =
  | 'pawn_novice'
  | 'knight_scout'
  | 'bishop_tactician'
  | 'rook_guardian'
  | 'queen_champion'
  | 'grandmaster_legend';

export interface KidRankTier {
  readonly id: KidRankTierId;
  readonly name: string;
  readonly icon: string;
  readonly minElo: number;
  readonly maxElo: number;
  readonly badgeGradient: string;
  readonly description: string;
}

export type RankTierInfo = KidRankTier;

export const KID_RANK_TIERS: readonly KidRankTier[] = [
  {
    id: 'pawn_novice',
    name: 'Pawn Novice',
    icon: '♙',
    minElo: 500,
    maxElo: 999,
    badgeGradient: 'linear-gradient(135deg, #22c55e, #16a34a)',
    description: 'Learning foundational piece attacks, free snacks, and mate-in-1s!',
  },
  {
    id: 'knight_scout',
    name: 'Knight Scout',
    icon: '♘',
    minElo: 1000,
    maxElo: 1199,
    badgeGradient: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
    description: 'Mastering royal knight forks, sneaky pins, and back-rank checkmates!',
  },
  {
    id: 'bishop_tactician',
    name: 'Bishop Tactician',
    icon: '♗',
    minElo: 1200,
    maxElo: 1399,
    badgeGradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    description: 'Executing skewers, discovered attacks, and deflection tactics!',
  },
  {
    id: 'rook_guardian',
    name: 'Rook Guardian',
    icon: '♖',
    minElo: 1400,
    maxElo: 1599,
    badgeGradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
    description: 'Commanding windmills, Greek gift sacrifices, and rook endgames!',
  },
  {
    id: 'queen_champion',
    name: 'Queen Champion',
    icon: '♕',
    minElo: 1600,
    maxElo: 1799,
    badgeGradient: 'linear-gradient(135deg, #ec4899, #be185d)',
    description: 'Unstoppable tactical intuition, smothered mates, and deep combinations!',
  },
  {
    id: 'grandmaster_legend',
    name: 'Grandmaster Legend',
    icon: '👑',
    minElo: 1800,
    maxElo: 3000,
    badgeGradient: 'linear-gradient(135deg, #f43f5e, #ffb300)',
    description: 'Scholastic tournament champion! Legendary calculation speed and accuracy!',
  },
];

export const RANK_TIERS: readonly KidRankTier[] = KID_RANK_TIERS;

/**
 * Pure calculation for child-calibrated Elo progression.
 * Applies floor protection (500 Elo), non-punitive hint damping,
 * and streak bonuses for consecutive clean solves.
 * Adheres to Rule 2 (Pure Business Logic — zero framework, zero I/O).
 */
export function calculateAdaptiveRatingAdjustment(
  params: RatingAdjustmentParams
): RatingAdjustmentResult {
  const { playerRating, puzzleRating, isSuccess, hintsUsed, currentStreak } = params;

  // Expected win probability (logistic curve)
  const exponent = (puzzleRating - playerRating) / 400;
  const expectedOutcome = 1 / (1 + Math.pow(10, exponent));
  const actualOutcome = isSuccess ? 1 : 0;

  // Raw Elo delta
  let rawDelta = Math.round(BASE_K_FACTOR * (actualOutcome - expectedOutcome));

  // Non-punitive hint damping for young learners
  if (isSuccess && hintsUsed > 0) {
    const hintPenalty = hintsUsed === 1 ? 0.75 : hintsUsed === 2 ? 0.5 : 0.25;
    rawDelta = Math.max(2, Math.round(rawDelta * hintPenalty));
  } else if (!isSuccess) {
    // Reduce loss penalty when child was exploring / learning
    rawDelta = Math.max(-12, Math.round(rawDelta * 0.6));
  }

  // Streak bonus on consecutive clean solves (0 hints)
  let streakBonus = 0;
  if (isSuccess && hintsUsed === 0 && currentStreak >= 3) {
    streakBonus = Math.min(10, currentStreak * 2);
  }

  const finalDelta = isSuccess ? rawDelta + streakBonus : rawDelta;
  const targetRating = playerRating + finalDelta;

  const isProtectedByFloor = targetRating <= MIN_ELO_FLOOR;
  const newRating = Math.max(MIN_ELO_FLOOR, targetRating);

  // Volatility decay
  const newRd = Math.max(80, Math.round(params.playerRd * 0.95));

  return {
    newRating,
    newRd,
    delta: newRating - playerRating,
    streakBonus,
    isProtectedByFloor,
  };
}

/**
 * Selects optimal puzzle target rating aiming for ~70% win-rate for positive reinforcement.
 */
export function selectTargetPuzzleRating(currentRating: number, streak: number): number {
  if (streak >= 4) {
    // Challenge child when on a hot streak (+50 to +100 ELO)
    return currentRating + 50 + Math.min(50, (streak - 3) * 15);
  }
  if (streak <= -2) {
    // Confidence builder when struggling (-50 to -100 ELO)
    return Math.max(MIN_ELO_FLOOR, currentRating - 60);
  }
  // Standard comfort zone (-30 to +20 ELO)
  return Math.max(MIN_ELO_FLOOR, currentRating - 20);
}

/**
 * Returns the player's current Rank Tier descriptor.
 */
export function getRankTier(rating: number): KidRankTier {
  const safeRating = Math.max(MIN_ELO_FLOOR, rating);
  for (const tier of KID_RANK_TIERS) {
    if (safeRating >= tier.minElo && safeRating <= tier.maxElo) {
      return tier;
    }
  }
  return KID_RANK_TIERS[KID_RANK_TIERS.length - 1] ?? KID_RANK_TIERS[0];
}

export function getRankTierForElo(rating: number): KidRankTier {
  return getRankTier(rating);
}

/**
 * Calculates progress percentage toward the next rank tier.
 */
export function getRankProgress(rating: number): {
  currentTier: KidRankTier;
  nextTier: KidRankTier | null;
  percent: number;
  pointsToNext: number;
} {
  const currentTier = getRankTier(rating);
  const tierIndex = KID_RANK_TIERS.findIndex((t) => t.id === currentTier.id);
  const nextTier =
    tierIndex >= 0 && tierIndex + 1 < KID_RANK_TIERS.length
      ? KID_RANK_TIERS[tierIndex + 1]
      : null;

  if (!nextTier) {
    return {
      currentTier,
      nextTier: null,
      percent: 100,
      pointsToNext: 0,
    };
  }

  const range = currentTier.maxElo - currentTier.minElo + 1;
  const progressInTier = Math.max(0, rating - currentTier.minElo);
  const percent = Math.min(100, Math.max(0, Math.round((progressInTier / range) * 100)));
  const pointsToNext = Math.max(0, nextTier.minElo - rating);

  return {
    currentTier,
    nextTier,
    percent,
    pointsToNext,
  };
}
