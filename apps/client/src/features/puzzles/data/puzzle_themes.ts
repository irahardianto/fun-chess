import type {
  PuzzleTheme,
  PuzzleThemeCategory,
  PuzzleThemeDescriptor,
} from '@fun-chess/shared';

/**
 * Curated theme descriptors for the Tactical Drills browser and UI cards.
 */
export const ALL_PUZZLE_THEMES: readonly PuzzleThemeDescriptor[] = [
  // --- Domain 1: Basic Tactics ---
  {
    id: 'fork',
    category: 'basic_tactics',
    name: 'Royal Forks 🍴',
    icon: '🍴',
    description: 'Attack two or more enemy pieces at the same time with one clever move!',
    kidFriendlyTip: 'Knights and Pawns love jumping into squares that attack King and Queen at once!',
    estimatedRatingRange: [600, 1400],
  },
  {
    id: 'pin',
    category: 'basic_tactics',
    name: 'Sneaky Pins 📌',
    icon: '📌',
    description: 'Freeze an enemy piece in place because moving it exposes a higher value target!',
    kidFriendlyTip: 'If a piece is pinned to the King, it cannot move at all — attack it again!',
    estimatedRatingRange: [700, 1500],
  },
  {
    id: 'skewer',
    category: 'basic_tactics',
    name: 'Laser Skewers ⚡',
    icon: '⚡',
    description: 'Attack a high-value piece in front, forcing it to run and leaving the piece behind it vulnerable!',
    kidFriendlyTip: 'Like a tasty shish-kebab! Hit the King or Queen first to capture what is behind.',
    estimatedRatingRange: [800, 1500],
  },
  {
    id: 'discovered_check',
    category: 'basic_tactics',
    name: 'Discovered Checks 💥',
    icon: '💥',
    description: 'Move one piece out of the way to unleash a surprise check from the piece behind it!',
    kidFriendlyTip: 'Double danger! Move with tempo while your back piece fires laser check.',
    estimatedRatingRange: [850, 1600],
  },
  {
    id: 'discovered_attack',
    category: 'basic_tactics',
    name: 'Discovered Attacks 🎯',
    icon: '🎯',
    description: 'Unmask an attack by jumping a piece out of the line of fire.',
    kidFriendlyTip: 'The jumping piece can capture something while the back piece attacks too!',
    estimatedRatingRange: [850, 1600],
  },
  {
    id: 'hanging_piece',
    category: 'basic_tactics',
    name: 'Hanging Pieces 🎁',
    icon: '🎁',
    description: 'Spot unprotected enemy pieces and snatch them cleanly!',
    kidFriendlyTip: 'Always check if any enemy piece is without a defender before you move.',
    estimatedRatingRange: [600, 1100],
  },
  {
    id: 'trapped_piece',
    category: 'basic_tactics',
    name: 'Trapped Pieces 🪤',
    icon: '🪤',
    description: 'Cut off all escape squares and bag a high-value piece!',
    kidFriendlyTip: 'Queens and Bishops can get trapped on the edge if you close their exit diagonals.',
    estimatedRatingRange: [900, 1500],
  },

  // --- Domain 2: Advanced & Intermediate Tactics ---
  {
    id: 'deflection',
    category: 'advanced_tactics',
    name: 'Deflection Tricks 🔄',
    icon: '🔄',
    description: 'Lure or force a key defender away from its crucial guard duty!',
    kidFriendlyTip: 'Distract the guard piece so you can strike the undefended treasure square!',
    estimatedRatingRange: [1100, 1700],
  },
  {
    id: 'decoy',
    category: 'advanced_tactics',
    name: 'Decoy Traps 🪤',
    icon: '🪤',
    description: 'Bait an enemy King or Queen onto a poisonous square with a tactical sacrifice!',
    kidFriendlyTip: 'Offer a juicy piece as bait to set up an unstoppable fork or skewer.',
    estimatedRatingRange: [1150, 1750],
  },
  {
    id: 'greek_gift',
    category: 'advanced_tactics',
    name: 'Greek Gift Sacrifices 🎁',
    icon: '🎁',
    description: 'Sacrifice a Bishop on h7/h2 to rip open the enemy King shield for a devastating assault!',
    kidFriendlyTip: 'Bxh7+ followed by Ng5+ and Qh5 delivers an unstoppable checkmating storm!',
    estimatedRatingRange: [1200, 1800],
  },
  {
    id: 'windmill',
    category: 'advanced_tactics',
    name: 'Windmill Carousels 🌪️',
    icon: '🌪️',
    description: 'Use repeated discovered checks with Rook and Bishop to sweep all enemy pieces!',
    kidFriendlyTip: 'Check, take a piece, discover check again, repeat — unstoppable!',
    estimatedRatingRange: [1250, 1850],
  },
  {
    id: 'clearance',
    category: 'advanced_tactics',
    name: 'Clearance Sacrifices 🧹',
    icon: '🧹',
    description: 'Clear a blocked square or diagonal for your most dangerous attacking piece.',
    kidFriendlyTip: 'Move your own piece out of the way — even sacrificing it — to open the winning path.',
    estimatedRatingRange: [1200, 1750],
  },
  {
    id: 'battery',
    category: 'advanced_tactics',
    name: 'Double Batteries 🔋',
    icon: '🔋',
    description: 'Stack Queen and Bishop or two Rooks on the same line for maximum firepower!',
    kidFriendlyTip: 'Two rooks on the 7th rank act like pigs in a clover patch!',
    estimatedRatingRange: [1100, 1650],
  },
  {
    id: 'captures_checks_threats',
    category: 'advanced_tactics',
    name: 'CCT Discipline 🥋',
    icon: '🥋',
    description: 'Master the master calculation method: Checks, Captures, and Threats on every move.',
    kidFriendlyTip: 'Always calculate every check first, then every capture, then your strongest threats!',
    estimatedRatingRange: [1000, 1600],
  },

  // --- Domain 3: Checkmate Patterns ---
  {
    id: 'back_rank_mate',
    category: 'checkmate_patterns',
    name: 'Back-Rank Mates 🛡️',
    icon: '🛡️',
    description: 'Checkmate a King trapped on the 8th or 1st rank behind their own pawn wall!',
    kidFriendlyTip: 'When pawns trap their own King, slide your Rook or Queen to the back rank!',
    estimatedRatingRange: [600, 1300],
  },
  {
    id: 'mate_in_1',
    category: 'checkmate_patterns',
    name: 'Mate in 1 Checkmates 🎯',
    icon: '🎯',
    description: 'Deliver checkmate in a single decisive strike!',
    kidFriendlyTip: 'Look for checks where the enemy King has zero escape squares and no defender can block!',
    estimatedRatingRange: [500, 1000],
  },
  {
    id: 'smothered_mate',
    category: 'checkmate_patterns',
    name: 'Smothered Mates 💨',
    icon: '💨',
    description: "Checkmate the King with a single Knight leap when he's completely surrounded by his own troops!",
    kidFriendlyTip: 'The King is boxed in by his own pieces — a single Knight jump seals checkmate!',
    estimatedRatingRange: [750, 1500],
  },
  {
    id: 'anastasia_mate',
    category: 'checkmate_patterns',
    name: "Anastasia's Mate 🐴",
    icon: '🐴',
    description: 'Knight walls off escape squares while Rook checks down the open h-file!',
    kidFriendlyTip: 'Knight on e7 covers g8 & g6; Rook crashes down the open h-file for mate.',
    estimatedRatingRange: [800, 1550],
  },
  {
    id: 'hook_mate',
    category: 'checkmate_patterns',
    name: 'Hook Mates 🪝',
    icon: '🪝',
    description: 'Knight, Rook, and Pawn interlock in a deadly hook formation around the enemy King.',
    kidFriendlyTip: 'The pawn protects the knight, the knight protects the rook, and the King is caught!',
    estimatedRatingRange: [850, 1500],
  },

  // --- Domain 4: Endgame Technique ---
  {
    id: 'pawn_endgame',
    category: 'endgame_technique',
    name: 'Pawn Races & Promotions 🏃',
    icon: '🏃',
    description: 'Escort passed pawns safely across the board to crown new Queens!',
    kidFriendlyTip: 'Use your King to clear the road in front of your passed pawns!',
    estimatedRatingRange: [700, 1400],
  },
  {
    id: 'rook_endgame',
    category: 'endgame_technique',
    name: 'Active Rook Endgames 🏰',
    icon: '🏰',
    description: 'Keep your rooks active behind passed pawns and cut off the enemy King!',
    kidFriendlyTip: 'Rooks belong behind passed pawns, whether they are yours or your opponent’s!',
    estimatedRatingRange: [800, 1600],
  },

  // --- Domain 5: Opening Traps & Defenses ---
  {
    id: 'scholars_mate',
    category: 'opening_traps',
    name: "Scholar's Mate 👑",
    icon: '👑',
    description: 'Queen and Bishop target the weak f7 or f2 square for an early checkmate!',
    kidFriendlyTip: 'The f7 square is only guarded by the King — defend it or attack it with Queen + Bishop!',
    estimatedRatingRange: [500, 1000],
  },
  {
    id: 'fried_liver',
    category: 'opening_traps',
    name: 'Fried Liver Attack ⚔️',
    icon: '⚔️',
    description: 'Sacrifice a Knight on f7 in the Two Knights Defense to draw the enemy King into the open center!',
    kidFriendlyTip: 'Nxf7 forces the Black King into the danger zone where your Queen and Bishop strike!',
    estimatedRatingRange: [850, 1450],
  },
  {
    id: 'legals_trap',
    category: 'opening_traps',
    name: "Légal's Trap 🎩",
    icon: '🎩',
    description: 'A dazzling Queen sacrifice leading to a checkmate with two Knights and a Bishop!',
    kidFriendlyTip: 'Pretend your Queen is pinned to let the opponent take it, then checkmate with minor pieces!',
    estimatedRatingRange: [900, 1500],
  },
];

export const PUZZLE_THEME_DESCRIPTORS: readonly PuzzleThemeDescriptor[] = ALL_PUZZLE_THEMES;

export const THEME_DESCRIPTORS_MAP: ReadonlyMap<PuzzleTheme, PuzzleThemeDescriptor> = new Map(
  ALL_PUZZLE_THEMES.map((t) => [t.id, t])
);

export const THEME_MAP: ReadonlyMap<PuzzleTheme, PuzzleThemeDescriptor> = THEME_DESCRIPTORS_MAP;

export const THEMES_BY_CATEGORY: Record<PuzzleThemeCategory, PuzzleThemeDescriptor[]> = {
  basic_tactics: ALL_PUZZLE_THEMES.filter((t) => t.category === 'basic_tactics'),
  advanced_tactics: ALL_PUZZLE_THEMES.filter((t) => t.category === 'advanced_tactics'),
  checkmate_patterns: ALL_PUZZLE_THEMES.filter((t) => t.category === 'checkmate_patterns'),
  endgame_technique: ALL_PUZZLE_THEMES.filter((t) => t.category === 'endgame_technique'),
  opening_traps: ALL_PUZZLE_THEMES.filter((t) => t.category === 'opening_traps'),
};

/**
 * Retrieves a theme descriptor by theme ID.
 */
export function getThemeDescriptor(theme: PuzzleTheme): PuzzleThemeDescriptor | undefined {
  return THEME_DESCRIPTORS_MAP.get(theme);
}

/**
 * Filters theme descriptors by category.
 */
export function getThemesByCategory(category: PuzzleThemeCategory): readonly PuzzleThemeDescriptor[] {
  return THEMES_BY_CATEGORY[category] || [];
}
