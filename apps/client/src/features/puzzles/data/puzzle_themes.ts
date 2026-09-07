import type {
  PuzzleTheme,
  PuzzleThemeCategory,
  PuzzleThemeDescriptor,
} from "@fun-chess/shared";

/**
 * Curated theme descriptors for the Tactical Drills browser and UI cards.
 */
export const ALL_PUZZLE_THEMES: readonly PuzzleThemeDescriptor[] = [
  // --- Domain 1: Basic Tactics ---
  {
    id: "fork",
    category: "basic_tactics",
    name: "Royal Forks 🍴",
    icon: "🍴",
    description:
      "Attack two or more enemy pieces at the same time with one clever move!",
    kidFriendlyTip:
      "Knights and Pawns love jumping into squares that attack King and Queen at once!",
    estimatedRatingRange: [600, 1950],
  },
  {
    id: "pin",
    category: "basic_tactics",
    name: "Sneaky Pins 📌",
    icon: "📌",
    description:
      "Freeze an enemy piece in place because moving it exposes a higher value target!",
    kidFriendlyTip:
      "If a piece is pinned to the King, it cannot move at all — attack it again!",
    estimatedRatingRange: [650, 1900],
  },
  {
    id: "skewer",
    category: "basic_tactics",
    name: "Laser Skewers ⚡",
    icon: "⚡",
    description:
      "Attack a high-value piece in front, forcing it to run and leaving the piece behind it vulnerable!",
    kidFriendlyTip:
      "Like a tasty shish-kebab! Hit the King or Queen first to capture what is behind.",
    estimatedRatingRange: [650, 1950],
  },
  {
    id: "discovered_check",
    category: "basic_tactics",
    name: "Discovered Checks 💥",
    icon: "💥",
    description:
      "Move one piece out of the way to unleash a surprise check from the piece behind it!",
    kidFriendlyTip:
      "Double danger! Move with tempo while your back piece fires laser check.",
    estimatedRatingRange: [650, 2100],
  },
  {
    id: "discovered_attack",
    category: "basic_tactics",
    name: "Discovered Attacks 🎯",
    icon: "🎯",
    description: "Unmask an attack by jumping a piece out of the line of fire.",
    kidFriendlyTip:
      "The jumping piece can capture something while the back piece attacks too!",
    estimatedRatingRange: [650, 2100],
  },
  {
    id: "hanging_piece",
    category: "basic_tactics",
    name: "Hanging Pieces 🎁",
    icon: "🎁",
    description: "Spot unprotected enemy pieces and snatch them cleanly!",
    kidFriendlyTip:
      "Always check if any enemy piece is without a defender before you move.",
    estimatedRatingRange: [600, 2050],
  },
  {
    id: "trapped_piece",
    category: "basic_tactics",
    name: "Trapped Pieces 🪤",
    icon: "🪤",
    description: "Cut off all escape squares and bag a high-value piece!",
    kidFriendlyTip:
      "Queens and Bishops can get trapped on the edge if you close their exit diagonals.",
    estimatedRatingRange: [650, 2000],
  },

  // --- Domain 2: Advanced & Intermediate Tactics ---
  {
    id: "deflection",
    category: "advanced_tactics",
    name: "Deflection Tricks 🔄",
    icon: "🔄",
    description:
      "Lure or force a key defender away from its crucial guard duty!",
    kidFriendlyTip:
      "Distract the guard piece so you can strike the undefended treasure square!",
    estimatedRatingRange: [650, 2100],
  },
  {
    id: "decoy",
    category: "advanced_tactics",
    name: "Decoy Traps 🪤",
    icon: "🪤",
    description:
      "Bait an enemy King or Queen onto a poisonous square with a tactical sacrifice!",
    kidFriendlyTip:
      "Offer a juicy piece as bait to set up an unstoppable fork or skewer.",
    estimatedRatingRange: [650, 2100],
  },
  {
    id: "greek_gift",
    category: "advanced_tactics",
    name: "Greek Gift Sacrifices 🎁",
    icon: "🎁",
    description:
      "Sacrifice a Bishop on h7/h2 to rip open the enemy King shield for a devastating assault!",
    kidFriendlyTip:
      "Bxh7+ followed by Ng5+ and Qh5 delivers an unstoppable checkmating storm!",
    estimatedRatingRange: [1225, 1950],
  },
  {
    id: "windmill",
    category: "advanced_tactics",
    name: "Windmill Carousels 🌪️",
    icon: "🌪️",
    description:
      "Use repeated discovered checks with Rook and Bishop to sweep all enemy pieces!",
    kidFriendlyTip:
      "Check, take a piece, discover check again, repeat — unstoppable!",
    estimatedRatingRange: [1325, 2050],
  },
  {
    id: "clearance",
    category: "advanced_tactics",
    name: "Clearance Sacrifices 🧹",
    icon: "🧹",
    description:
      "Clear a blocked square or diagonal for your most dangerous attacking piece.",
    kidFriendlyTip:
      "Move your own piece out of the way — even sacrificing it — to open the winning path.",
    estimatedRatingRange: [1050, 1950],
  },
  {
    id: "battery",
    category: "advanced_tactics",
    name: "Double Batteries 🔋",
    icon: "🔋",
    description:
      "Stack Queen and Bishop or two Rooks on the same line for maximum firepower!",
    kidFriendlyTip:
      "Two rooks on the 7th rank act like pigs in a clover patch!",
    estimatedRatingRange: [1050, 2050],
  },
  {
    id: "captures_checks_threats",
    category: "advanced_tactics",
    name: "CCT Discipline 🥋",
    icon: "🥋",
    description:
      "Master the master calculation method: Checks, Captures, and Threats on every move.",
    kidFriendlyTip:
      "Always calculate every check first, then every capture, then your strongest threats!",
    estimatedRatingRange: [650, 2100],
  },

  // --- Domain 3: Checkmate Patterns ---
  {
    id: "back_rank_mate",
    category: "checkmate_patterns",
    name: "Back-Rank Mates 🛡️",
    icon: "🛡️",
    description:
      "Checkmate a King trapped on the 8th or 1st rank behind their own pawn wall!",
    kidFriendlyTip:
      "When pawns trap their own King, slide your Rook or Queen to the back rank!",
    estimatedRatingRange: [600, 1800],
  },
  {
    id: "mate_in_1",
    category: "checkmate_patterns",
    name: "Mate in 1 Checkmates 🎯",
    icon: "🎯",
    description: "Deliver checkmate in a single decisive strike!",
    kidFriendlyTip:
      "Look for checks where the enemy King has zero escape squares and no defender can block!",
    estimatedRatingRange: [500, 1050],
  },
  {
    id: "smothered_mate",
    category: "checkmate_patterns",
    name: "Smothered Mates 💨",
    icon: "💨",
    description:
      "Checkmate the King with a single Knight leap when he's completely surrounded by his own troops!",
    kidFriendlyTip:
      "The King is boxed in by his own pieces — a single Knight jump seals checkmate!",
    estimatedRatingRange: [1300, 2000],
  },
  {
    id: "anastasia_mate",
    category: "checkmate_patterns",
    name: "Anastasia's Mate 🐴",
    icon: "🐴",
    description:
      "Knight walls off escape squares while Rook checks down the open h-file!",
    kidFriendlyTip:
      "Knight on e7 covers g8 & g6; Rook crashes down the open h-file for mate.",
    estimatedRatingRange: [1200, 1900],
  },
  {
    id: "hook_mate",
    category: "checkmate_patterns",
    name: "Hook Mates 🪝",
    icon: "🪝",
    description:
      "Knight, Rook, and Pawn interlock in a deadly hook formation around the enemy King.",
    kidFriendlyTip:
      "The pawn protects the knight, the knight protects the rook, and the King is caught!",
    estimatedRatingRange: [1200, 1900],
  },

  // --- Domain 4: Endgame Technique ---
  {
    id: "pawn_endgame",
    category: "endgame_technique",
    name: "Pawn Races & Promotions 🏃",
    icon: "🏃",
    description:
      "Escort passed pawns safely across the board to crown new Queens!",
    kidFriendlyTip:
      "Use your King to clear the road in front of your passed pawns!",
    estimatedRatingRange: [1200, 2100],
  },
  {
    id: "rook_endgame",
    category: "endgame_technique",
    name: "Active Rook Endgames 🏰",
    icon: "🏰",
    description:
      "Keep your rooks active behind passed pawns and cut off the enemy King!",
    kidFriendlyTip:
      "Rooks belong behind passed pawns, whether they are yours or your opponent’s!",
    estimatedRatingRange: [1200, 2150],
  },

  // --- Domain 5: Opening Traps & Defenses ---
  {
    id: "scholars_mate",
    category: "opening_traps",
    name: "Scholar's Mate 👑",
    icon: "👑",
    description:
      "Queen and Bishop target the weak f7 or f2 square for an early checkmate!",
    kidFriendlyTip:
      "The f7 square is only guarded by the King — defend it or attack it with Queen + Bishop!",
    estimatedRatingRange: [500, 2000],
  },
  {
    id: "fried_liver",
    category: "opening_traps",
    name: "Fried Liver Attack ⚔️",
    icon: "⚔️",
    description:
      "Sacrifice a Knight on f7 in the Two Knights Defense to draw the enemy King into the open center!",
    kidFriendlyTip:
      "Nxf7 forces the Black King into the danger zone where your Queen and Bishop strike!",
    estimatedRatingRange: [650, 2000],
  },
  {
    id: "legals_trap",
    category: "opening_traps",
    name: "Légal's Trap 🎩",
    icon: "🎩",
    description:
      "A dazzling Queen sacrifice leading to a checkmate with two Knights and a Bishop!",
    kidFriendlyTip:
      "Pretend your Queen is pinned to let the opponent take it, then checkmate with minor pieces!",
    estimatedRatingRange: [650, 1950],
  },
];

export const PUZZLE_THEME_DESCRIPTORS: readonly PuzzleThemeDescriptor[] =
  ALL_PUZZLE_THEMES;

export const THEME_DESCRIPTORS_MAP: ReadonlyMap<
  PuzzleTheme,
  PuzzleThemeDescriptor
> = new Map(ALL_PUZZLE_THEMES.map((t) => [t.id, t]));

export const THEME_MAP: ReadonlyMap<PuzzleTheme, PuzzleThemeDescriptor> =
  THEME_DESCRIPTORS_MAP;

export const THEMES_BY_CATEGORY: Record<
  PuzzleThemeCategory,
  PuzzleThemeDescriptor[]
> = {
  basic_tactics: ALL_PUZZLE_THEMES.filter(
    (t) => t.category === "basic_tactics",
  ),
  advanced_tactics: ALL_PUZZLE_THEMES.filter(
    (t) => t.category === "advanced_tactics",
  ),
  checkmate_patterns: ALL_PUZZLE_THEMES.filter(
    (t) => t.category === "checkmate_patterns",
  ),
  endgame_technique: ALL_PUZZLE_THEMES.filter(
    (t) => t.category === "endgame_technique",
  ),
  opening_traps: ALL_PUZZLE_THEMES.filter(
    (t) => t.category === "opening_traps",
  ),
};

export const THEME_VISUAL_CLUES: Record<string, string> = {
  fork: "Look for two high-value enemy pieces on squares that a Knight, Pawn, or Queen can hit simultaneously (e.g. King and Rook aligned for a knight fork).",
  pin: "Look for enemy pieces lined up in front of their King or Queen along an open file, rank, or diagonal.",
  skewer:
    "Look for the enemy King or Queen standing directly in front of a Rook, Bishop, or Knight along a straight line.",
  discovered_check:
    "Look for your Bishop or Rook lined up with the enemy King, with one of your pieces blocking the view.",
  discovered_attack:
    "Look for your back piece lined up with a valuable target, with a forward piece that can jump away with tempo.",
  hanging_piece:
    "Scan the enemy camp for pieces that have zero friendly defenders protecting them.",
  trapped_piece:
    "Check if an enemy Queen, Bishop, or Knight has limited squares and can be enclosed by your pawns or minor pieces.",
  deflection:
    "Identify the key defender guarding against checkmate or piece capture, and find a forcing move that lures it away.",
  decoy:
    "Look for a sacrifice that pulls the enemy King or Queen onto a fatal square where they get forked or checkmated.",
  greek_gift:
    "Look for enemy King castled kingside with pawn on g7/h7, a dark-square Bishop aiming at h7, and a Knight ready to jump to g5.",
  windmill:
    "Look for an unblockable discovered check cycle where your Rook captures enemy pieces along the 7th rank while your Bishop provides continuous discovered check.",
  clearance:
    "Look for a powerful square or line blocked by one of your own pieces that can be vacated with check or threat.",
  battery:
    "Look for Queen + Bishop or Rook + Rook lined up on the same diagonal or file pointing straight at the enemy King.",
  captures_checks_threats:
    "Systematically scan every single Check first, then every Capture, then every forcing Threat before moving.",
  back_rank_mate:
    "Look for an enemy King trapped behind a wall of f7, g7, h7 pawns with no escape flight square (luft).",
  mate_in_1:
    "Check all available check moves and verify if the King has zero legal moves, no interposing blocks, and cannot capture the checking piece.",
  smothered_mate:
    "Look for an enemy King completely boxed in by its own friendly pieces, vulnerable to a single unblockable Knight check.",
  anastasia_mate:
    "Look for a Knight covering the escape squares (e.g. e7 covering g8/g6) while a Rook or Queen crashes down the open h-file.",
  hook_mate:
    "Look for a Knight supported by a Pawn pinning the enemy King against the board edge while a Rook delivers mate.",
  pawn_endgame:
    "Calculate king opposition and identify passed pawns that can race safely to the 8th rank to promote.",
  rook_endgame:
    "Position your Rook behind the passed pawn to support its march while cutting off the opponent king.",
  scholars_mate:
    "Look for Queen and Bishop converging on the vulnerable f7/f2 square guarded only by the King.",
  fried_liver:
    "Look for Two Knights Defense setup with an undefended f7 square vulnerable to Nxf7 sacrifice.",
  legals_trap:
    "Look for an overconfident pin on your f3 knight that can be broken by Nxe5, allowing Bxf7+ and Nd5#.",
};

export const THEME_CONCEPT_DEFINITIONS: Record<string, string> = {
  fork: "A double attack where one piece strikes two or more targets simultaneously, making it impossible for the opponent to defend both.",
  pin: "A tactical immobilizing move where a defender cannot move without exposing a more valuable target behind it.",
  skewer:
    "A linear attack against a valuable piece in front, which when forced to move, allows the capture of a piece behind it.",
  discovered_check:
    "An attack unleashed on the opponent King by moving a piece that was obstructing a friendly line of fire.",
  discovered_attack:
    "An unmasking move where jumping one piece reveals an attack from another piece behind it.",
  hanging_piece:
    "An undefended piece that can be captured with zero material loss.",
  trapped_piece:
    "A piece that has no safe squares to retreat to and will be captured on the following moves.",
  deflection:
    "A forcing tactical move that drives a key defending piece away from the square or piece it is guarding.",
  decoy:
    "A sacrifice that lures an enemy piece onto a specific square where it becomes vulnerable to a winning tactic.",
  greek_gift:
    "A classic tactical bishop sacrifice on h7 (or h2) aimed at shattering the enemy castled king fortress.",
  windmill:
    "A devastating cyclic combination of regular checks and discovered checks with a Rook and Bishop.",
  clearance:
    "A tactical sacrifice or move whose primary purpose is to free a critical square or line for another attacking piece.",
  battery:
    "Two or more pieces of the same color lined up along the same rank, file, or diagonal to multiply tactical firepower.",
  captures_checks_threats:
    "The universal calculation protocol in chess tactics: always analyze forcing moves in strict order of Checks, Captures, and Threats.",
  back_rank_mate:
    "A checkmate delivered by a Rook or Queen along the opponent back rank because the enemy King is blocked by friendly pawns.",
  mate_in_1:
    "A single, definitive move that places the enemy King in check with zero legal evasions, ending the game immediately.",
  smothered_mate:
    "A checkmate delivered by a Knight against a King that cannot escape because it is suffocated by its own friendly pieces.",
  anastasia_mate:
    "A mating pattern where a Knight cuts off flight squares on the g-file while a Rook delivers checkmate on the open h-file.",
  hook_mate:
    "A mating net involving a Rook, Knight, and Pawn working together to trap the enemy King against the edge of the board.",
  pawn_endgame:
    "The transition phase of chess where king activity and passed pawn advancement determine victory.",
  rook_endgame:
    "Endgame positions featuring rooks and pawns where rook activity behind passed pawns is paramount.",
  scholars_mate:
    "A four-move checkmate targeting the weak f7/f2 square with Queen and Bishop coordination.",
  fried_liver:
    "An aggressive opening attack sacrificing a knight on f7 to draw the enemy king into a lethal pin and attack.",
  legals_trap:
    "An opening trap where White allows a queen capture to deliver a quick checkmate with minor pieces.",
};

/**
 * Canonical theme alias mapping for descriptor lookups.
 */
const THEME_DESCRIPTOR_ALIASES: Partial<Record<PuzzleTheme, PuzzleTheme>> = {
  smothered: "smothered_mate",
  anastasia_hook: "anastasia_mate",
  endgame_conversion: "pawn_endgame",
};

/**
 * Retrieves a theme descriptor by theme ID, checking aliases if direct match is absent.
 */
export function getThemeDescriptor(
  theme: PuzzleTheme,
): PuzzleThemeDescriptor | undefined {
  const direct = THEME_DESCRIPTORS_MAP.get(theme);
  if (direct) return direct;
  const canonical = THEME_DESCRIPTOR_ALIASES[theme];
  if (canonical) return THEME_DESCRIPTORS_MAP.get(canonical);
  return undefined;
}

/**
 * Filters theme descriptors by category.
 */
export function getThemesByCategory(
  category: PuzzleThemeCategory,
): readonly PuzzleThemeDescriptor[] {
  return THEMES_BY_CATEGORY[category] || [];
}

/**
 * Retrieves visual clues to spot a tactical theme.
 */
export function getThemeVisualClues(theme: string): string {
  if (THEME_VISUAL_CLUES[theme]) return THEME_VISUAL_CLUES[theme];
  if (theme === "smothered") return THEME_VISUAL_CLUES["smothered_mate"] || "";
  if (theme === "anastasia_hook")
    return THEME_VISUAL_CLUES["anastasia_mate"] || "";
  if (theme === "endgame_conversion")
    return THEME_VISUAL_CLUES["pawn_endgame"] || "";
  return "Look for tactical imbalances and vulnerable pieces in the position.";
}

/**
 * Retrieves concept definition for a tactical theme.
 */
export function getThemeConceptDefinition(theme: string): string {
  if (THEME_CONCEPT_DEFINITIONS[theme]) return THEME_CONCEPT_DEFINITIONS[theme];
  if (theme === "smothered")
    return THEME_CONCEPT_DEFINITIONS["smothered_mate"] || "";
  if (theme === "anastasia_hook")
    return THEME_CONCEPT_DEFINITIONS["anastasia_mate"] || "";
  if (theme === "endgame_conversion")
    return THEME_CONCEPT_DEFINITIONS["pawn_endgame"] || "";
  return "Master this tactical motif to spot winning opportunities in your games.";
}
