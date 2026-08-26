# Fun Chess — Project Conventions & Architectural Standards

**Document Version:** `2.0.0`  
**Status:** `FROZEN CONTRACT`  
**Target Applications:** `apps/client/src/features/puzzles/`, `apps/client/src/features/scenarios/`, and `@fun-chess/shared`  
**Author:** `@architect` (System Architecture Authority)  

---

## 1. Architectural Mandates & Dependency Inversion

All features in Fun Chess must adhere to the three foundational architecture rules defined in `.agents/rules/architectural-pattern.md`:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DEPENDENCY DIRECTION                             │
│                                                                         │
│   UI Components (.vue) ──► Composables ──► Pure Engines (Business Logic) │
│                                  │                                      │
│                                  ▼                                      │
│                        Store Interfaces (Contracts)                     │
│                                  ▲                                      │
│                                  │                                      │
│                      ┌───────────┴───────────┐                          │
│                      │                       │                          │
│            LocalStorage Store       InMemory Store                      │
│            (Production Adapter)     (Test Adapter)                      │
└─────────────────────────────────────────────────────────────────────────┘
```

1. **Rule 1 (I/O Isolation):** All side effects (browser `localStorage`, network requests, audio, timers) must be abstracted behind explicit interfaces defined in `@fun-chess/shared`. Every I/O boundary must supply:
   - A **Production Adapter** (e.g., `LocalStoragePuzzleProgressStore`) with defensive JSON parsing, runtime validation, and fallback mechanisms.
   - A **Test Adapter** (e.g., `InMemoryPuzzleProgressStore`) for zero-dependency unit tests.
2. **Rule 2 (Pure Business Logic):** All move validation, rating calculations (Elo/Glicko), puzzle progression rules, star calculations, and hint generations reside in pure, stateless functions located in `engine/`. These functions must NOT import Vue reactivity (`ref`, `computed`), DOM APIs, audio composables, or storage adapters.
3. **Rule 3 (Dependency Direction):** UI components and composables depend on shared interfaces, never on concrete storage implementations. Dependencies are injected with default fallbacks.

---

## 2. Directory Layout Conventions

The project follows a strict **vertical-slice feature architecture** (`project-structure.md`). Each feature is self-contained under `apps/client/src/features/<feature-name>/`.

### 2.1 Complete Skeleton: `features/puzzles/`

```
apps/client/src/features/puzzles/
├── index.ts                               # Public feature API export (exports PuzzleArena, usePuzzleProgress, etc.)
├── PuzzleArena.vue                        # Root container view for Puzzle Hub (switcher between modes)
├── components/                            # Feature-specific UI components
│   ├── index.ts                           # Components public barrier
│   ├── PuzzleBoardWrapper.vue             # Board wrapper integrating interactive feedback & hints
│   ├── PuzzleCategoryCard.vue             # Theme selection drill card
│   ├── PuzzleCompletionModal.vue          # Solved celebration & star modal
│   ├── PuzzleHintOverlay.vue              # 3-tier visual hint renderer (nudges, glow, arrows)
│   ├── PuzzleModeSelector.vue             # Segmented tab bar (Drills, Ladder, Rush, Survivor)
│   ├── PuzzleRushHud.vue                  # Rapid-fire timer, combo multiplier, strikes display
│   ├── PuzzleThemeBrowser.vue             # Grid of tactical motifs with filter tabs
│   ├── RatingClimbHud.vue                 # Adaptive Elo indicator, streak flames, rank badge
│   └── __tests__/                         # Component tests (Vitest + Vue Test Utils)
│       ├── PuzzleCompletionModal.spec.ts
│       ├── PuzzleHintOverlay.spec.ts
│       ├── PuzzleModeSelector.spec.ts
│       ├── PuzzleRushHud.spec.ts
│       └── RatingClimbHud.spec.ts
├── composables/                           # Reactive state orchestration & hooks
│   ├── index.ts                           # Composables public barrier
│   ├── useAdaptiveLadder.ts               # State & runner for Adaptive Rating Ladder
│   ├── useProgressiveHint.ts              # 3-tier progressive hint state machine
│   ├── usePuzzleProgress.ts               # Persistence sync with injected store
│   ├── usePuzzleRunner.ts                 # Core interactive move runner & validation loop
│   ├── usePuzzleRush.ts                   # 3-minute blitz sprint & streak survivor timer
│   ├── useThemedDrills.ts                 # Filtered theme drill playlist runner
│   └── __tests__/                         # Composable unit tests
│       ├── useAdaptiveLadder.spec.ts
│       ├── useProgressiveHint.spec.ts
│       ├── usePuzzleProgress.spec.ts
│       ├── usePuzzleRunner.spec.ts
│       └── usePuzzleRush.spec.ts
├── data/                                  # Curated offline puzzle library & themes
│   ├── index.ts                           # Data pack aggregator & search indexes
│   ├── puzzle_themes.ts                   # Theme descriptors, icons, kid-friendly hints
│   ├── packs/                             # Curated CC0 puzzle packs by rating band
│   │   ├── novice_puzzles.ts              # 600 - 900 ELO (mate-in-1, simple free pieces)
│   │   ├── easy_puzzles.ts                # 900 - 1200 ELO (forks, pins, basic mates)
│   │   ├── medium_puzzles.ts              # 1200 - 1500 ELO (intermediate tactics, checkmate families)
│   │   ├── hard_puzzles.ts                # 1500 - 1800 ELO (conversions, multi-step combinations)
│   │   └── expert_puzzles.ts              # 1800+ ELO (subtle sacrifices, endgame accuracy)
│   └── __tests__/                         # Pack integrity & validation tests
│       ├── pack_integrity.spec.ts         # Validates all FENs, UCI moves, and solutions via chess.js
│       └── puzzle_themes.spec.ts
├── engine/                                # Pure business logic engines (zero I/O, zero Vue)
│   ├── index.ts                           # Engine public barrier
│   ├── adaptive_rating.ts                 # Elo delta, K-factor scaling, floor protection
│   ├── hint_generator.ts                  # 3-tier hint generation from puzzle solution
│   ├── puzzle_validator.ts                # Pure move checking & bot auto-reply advance
│   ├── rush_engine.ts                     # Time ticks, combo multipliers, strike rules
│   ├── star_calculator.ts                 # Star scoring (1-3) & accuracy calculation
│   └── __tests__/                         # Pure engine unit tests (100% coverage)
│       ├── adaptive_rating.spec.ts
│       ├── hint_generator.spec.ts
│       ├── puzzle_validator.spec.ts
│       ├── rush_engine.spec.ts
│       └── star_calculator.spec.ts
└── store/                                 # Storage adapters adhering to Rule 1
    ├── index.ts                           # Store factory & default singleton export
    ├── in_memory_puzzle_progress.store.ts # Test adapter (in-memory Map)
    ├── local_storage_puzzle_progress.store.ts # Production adapter (defensive localStorage)
    ├── puzzle_progress.store.ts           # Re-export of shared store contract
    └── __tests__/                         # Store adapter unit tests
        ├── in_memory_puzzle_progress.spec.ts
        └── local_storage_puzzle_progress.spec.ts
```

---

### 2.2 Complete Skeleton: `features/scenarios/` (Expanded)

```
apps/client/src/features/scenarios/
├── index.ts
├── ScenarioArena.vue
├── components/
│   ├── index.ts
│   ├── ScenarioCard.vue
│   ├── ScenarioCategoryList.vue
│   ├── ScenarioCompletionModal.vue
│   ├── ScenarioGuideOverlay.vue
│   └── __tests__/
├── composables/
│   ├── index.ts
│   ├── useScenarioProgress.ts
│   ├── useScenarioRunner.ts
│   └── __tests__/
├── data/
│   ├── index.ts                           # Aggregator of all curriculum sections
│   ├── checkmates/                        # Basic checkmate patterns
│   ├── checkmate_families/                # Expanded: Anastasia, Arabian, Hook, Vukovic, Boden, etc.
│   ├── endgame/                           # Basic endgames (KQ vs K, KR vs K)
│   ├── endgame_conversions/               # Expanded: Lucena, Philidor, Two Bishops
│   ├── fundamentals/                      # Piece movements & rules
│   ├── intermediate_tactics/              # Expanded: CCT, deflection, decoy, windmill, etc.
│   ├── opening_traps/                     # Expanded: Legal's Trap, Fried Liver
│   ├── special_moves/                     # Castling, en passant, promotion
│   ├── tactics/                           # Basic tactics (fork, pin, skewer)
│   └── __tests__/
│       └── scenarios_integrity.spec.ts
├── engine/
│   ├── index.ts
│   ├── scenario_validator.ts
│   ├── star_calculator.ts
│   └── __tests__/
└── store/
    ├── index.ts
    ├── in_memory_progress.store.ts
    ├── local_storage_progress.store.ts
    ├── scenario_progress.store.ts
    └── __tests__/
```

---

## 3. Store Patterns & I/O Isolation Standards

### 3.1 Store Interface Definition
The storage contract is strictly declared in `@fun-chess/shared`:

```typescript
// @fun-chess/shared -> contracts/puzzle.ts
export interface PuzzleProgressStore {
  getProgress(): Promise<PuzzleProgress>;
  updateRating(newRatingState: AdaptiveRatingState): Promise<void>;
  recordPuzzleAttempt(
    puzzleId: string,
    theme: PuzzleTheme,
    result: PuzzleAttemptResult,
    stars: StarRating
  ): Promise<PuzzleProgress>;
  saveArcadeResult(
    mode: 'puzzle_rush' | 'streak_survivor',
    score: number,
    streak: number
  ): Promise<PuzzleProgress>;
  resetAll(): Promise<void>;
}
```

### 3.2 Production Adapter: `LocalStoragePuzzleProgressStore`
Requirements for the production adapter:
- **Defensive Parsing:** Must wrap `JSON.parse` in `try/catch` and return valid default structures on malformed data.
- **Runtime Type Narrowing:** Must sanitize each property (numeric ranges, enum validation) to prevent corruption from old localStorage versions.
- **Quota Exceeded Fallback:** Must catch quota/private mode errors and automatically mirror all state to an in-memory `Map`.
- **Storage Key Isolation:** Uses scoped storage key `fun_chess_puzzle_progress_v2`.

```typescript
// apps/client/src/features/puzzles/store/local_storage_puzzle_progress.store.ts
import type {
  PuzzleProgress,
  PuzzleProgressStore,
  AdaptiveRatingState,
  PuzzleTheme,
  PuzzleAttemptResult,
  StarRating,
} from '@fun-chess/shared';

export const PUZZLE_PROGRESS_STORAGE_KEY = 'fun_chess_puzzle_progress_v2';

export const DEFAULT_ADAPTIVE_RATING: AdaptiveRatingState = {
  rating: 800,
  ratingDeviation: 350,
  peakRating: 800,
  totalAttempted: 0,
  totalSolved: 0,
  bestStreak: 0,
  ratingHistory: [],
};

export const DEFAULT_PUZZLE_PROGRESS: PuzzleProgress = {
  ratingProfile: DEFAULT_ADAPTIVE_RATING,
  themeMastery: {} as any,
  arcadeStats: {
    puzzleRushHighScore: 0,
    puzzleRushBestStreak: 0,
    streakSurvivorHighScore: 0,
    totalRushRuns: 0,
  },
  solvedPuzzles: {},
  createdAt: Date.now(),
  lastActiveAt: Date.now(),
};

export class LocalStoragePuzzleProgressStore implements PuzzleProgressStore {
  private memoryCache: PuzzleProgress;
  private readonly storageKey: string;

  constructor(storageKey: string = PUZZLE_PROGRESS_STORAGE_KEY) {
    this.storageKey = storageKey;
    this.memoryCache = { ...DEFAULT_PUZZLE_PROGRESS };
  }

  private isStorageAvailable(): boolean {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return false;
    }
    try {
      const testKey = `__fc_puz_test_${Date.now()}__`;
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  private sanitizeProgress(raw: unknown): PuzzleProgress {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_PUZZLE_PROGRESS };
    const data = raw as Record<string, any>;

    const ratingProfile: AdaptiveRatingState = {
      rating: typeof data.ratingProfile?.rating === 'number' ? Math.max(500, data.ratingProfile.rating) : 800,
      ratingDeviation: typeof data.ratingProfile?.ratingDeviation === 'number' ? data.ratingProfile.ratingDeviation : 350,
      peakRating: typeof data.ratingProfile?.peakRating === 'number' ? data.ratingProfile.peakRating : 800,
      totalAttempted: typeof data.ratingProfile?.totalAttempted === 'number' ? data.ratingProfile.totalAttempted : 0,
      totalSolved: typeof data.ratingProfile?.totalSolved === 'number' ? data.ratingProfile.totalSolved : 0,
      bestStreak: typeof data.ratingProfile?.bestStreak === 'number' ? data.ratingProfile.bestStreak : 0,
      ratingHistory: Array.isArray(data.ratingProfile?.ratingHistory) ? data.ratingProfile.ratingHistory : [],
    };

    return {
      ratingProfile,
      themeMastery: typeof data.themeMastery === 'object' && data.themeMastery !== null ? data.themeMastery : {},
      arcadeStats: {
        puzzleRushHighScore: Number(data.arcadeStats?.puzzleRushHighScore) || 0,
        puzzleRushBestStreak: Number(data.arcadeStats?.puzzleRushBestStreak) || 0,
        streakSurvivorHighScore: Number(data.arcadeStats?.streakSurvivorHighScore) || 0,
        totalRushRuns: Number(data.arcadeStats?.totalRushRuns) || 0,
      },
      solvedPuzzles: typeof data.solvedPuzzles === 'object' && data.solvedPuzzles !== null ? data.solvedPuzzles : {},
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
      lastActiveAt: Date.now(),
    };
  }

  public async getProgress(): Promise<PuzzleProgress> {
    if (!this.isStorageAvailable()) {
      return { ...this.memoryCache };
    }

    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return { ...DEFAULT_PUZZLE_PROGRESS };
      const parsed = JSON.parse(raw);
      this.memoryCache = this.sanitizeProgress(parsed);
      return { ...this.memoryCache };
    } catch {
      return { ...this.memoryCache };
    }
  }

  public async updateRating(newRatingState: AdaptiveRatingState): Promise<void> {
    const current = await this.getProgress();
    current.ratingProfile = newRatingState;
    current.lastActiveAt = Date.now();
    await this.persist(current);
  }

  public async recordPuzzleAttempt(
    puzzleId: string,
    theme: PuzzleTheme,
    result: PuzzleAttemptResult,
    stars: StarRating
  ): Promise<PuzzleProgress> {
    const current = await this.getProgress();
    const isSuccess = result.startsWith('solved');

    // Update solved records
    if (isSuccess) {
      const existing = current.solvedPuzzles[puzzleId];
      current.solvedPuzzles[puzzleId] = {
        stars: existing ? (Math.max(existing.stars, stars) as StarRating) : stars,
        solvedAt: Date.now(),
      };
    }

    // Update theme mastery
    const existingTheme = current.themeMastery[theme] || {
      theme,
      attempted: 0,
      solved: 0,
      starsEarned: 0,
      masteryLevel: 'novice',
      lastPracticedAt: Date.now(),
    };

    const newSolved = existingTheme.solved + (isSuccess ? 1 : 0);
    const newAttempted = existingTheme.attempted + 1;
    const masteryLevel = newSolved >= 20 ? 'master' : newSolved >= 8 ? 'apprentice' : 'novice';

    current.themeMastery[theme] = {
      theme,
      attempted: newAttempted,
      solved: newSolved,
      starsEarned: existingTheme.starsEarned + (isSuccess ? stars : 0),
      masteryLevel,
      lastPracticedAt: Date.now(),
    };

    current.lastActiveAt = Date.now();
    await this.persist(current);
    return { ...current };
  }

  public async saveArcadeResult(
    mode: 'puzzle_rush' | 'streak_survivor',
    score: number,
    streak: number
  ): Promise<PuzzleProgress> {
    const current = await this.getProgress();
    if (mode === 'puzzle_rush') {
      current.arcadeStats.puzzleRushHighScore = Math.max(current.arcadeStats.puzzleRushHighScore, score);
      current.arcadeStats.puzzleRushBestStreak = Math.max(current.arcadeStats.puzzleRushBestStreak, streak);
      current.arcadeStats.totalRushRuns += 1;
    } else {
      current.arcadeStats.streakSurvivorHighScore = Math.max(current.arcadeStats.streakSurvivorHighScore, score);
    }
    current.lastActiveAt = Date.now();
    await this.persist(current);
    return { ...current };
  }

  public async resetAll(): Promise<void> {
    this.memoryCache = { ...DEFAULT_PUZZLE_PROGRESS, createdAt: Date.now(), lastActiveAt: Date.now() };
    if (this.isStorageAvailable()) {
      try {
        window.localStorage.removeItem(this.storageKey);
      } catch {
        // Safe ignore
      }
    }
  }

  private async persist(data: PuzzleProgress): Promise<void> {
    this.memoryCache = { ...data };
    if (this.isStorageAvailable()) {
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(data));
      } catch {
        // Fallback safely preserved in memoryCache
      }
    }
  }
}

export const defaultLocalStoragePuzzleProgressStore = new LocalStoragePuzzleProgressStore();
```

---

### 3.3 Composable Injection Pattern: `usePuzzleProgress`

```typescript
// apps/client/src/features/puzzles/composables/usePuzzleProgress.ts
import { ref, computed, readonly } from 'vue';
import type { PuzzleProgress, PuzzleProgressStore, PuzzleTheme, StarRating, PuzzleAttemptResult } from '@fun-chess/shared';
import { defaultLocalStoragePuzzleProgressStore } from '../store/local_storage_puzzle_progress.store';

export function usePuzzleProgress(customStore?: PuzzleProgressStore) {
  const store = customStore || defaultLocalStoragePuzzleProgressStore;

  const progress = ref<PuzzleProgress | null>(null);
  const isLoading = ref<boolean>(false);

  async function loadProgress(): Promise<void> {
    isLoading.value = true;
    try {
      progress.value = await store.getProgress();
    } finally {
      isLoading.value = false;
    }
  }

  const currentElo = computed<number>(() => progress.value?.ratingProfile.rating ?? 800);
  const totalSolvedCount = computed<number>(() => Object.keys(progress.value?.solvedPuzzles ?? {}).length);
  const rushHighScore = computed<number>(() => progress.value?.arcadeStats.puzzleRushHighScore ?? 0);

  function getThemeMastery(theme: PuzzleTheme) {
    return progress.value?.themeMastery[theme] ?? null;
  }

  async function recordAttempt(puzzleId: string, theme: PuzzleTheme, result: PuzzleAttemptResult, stars: StarRating) {
    const updated = await store.recordPuzzleAttempt(puzzleId, theme, result, stars);
    progress.value = updated;
    return updated;
  }

  // Auto-load on setup
  loadProgress();

  return {
    progress: readonly(progress),
    isLoading: readonly(isLoading),
    currentElo,
    totalSolvedCount,
    rushHighScore,
    loadProgress,
    getThemeMastery,
    recordAttempt,
    resetAll: async () => {
      await store.resetAll();
      await loadProgress();
    },
  };
}
```

---

## 4. Pure Business Logic Engine Conventions

Engines live in `features/puzzles/engine/` and must strictly follow these invariants:
1. **Zero External I/O:** No network, no localStorage, no timers inside calculations.
2. **Immutable Returns:** Functions return new objects, never mutating arguments in place.
3. **100% Coverage Target:** Every mathematical branch and edge case must be unit-tested.

### 4.1 Adaptive Elo Engine Implementation (`engine/adaptive_rating.ts`)

```typescript
import type { RatingAdjustmentParams, RatingAdjustmentResult } from '@fun-chess/shared';

const MIN_ELO_FLOOR = 500;
const BASE_K_FACTOR = 32;

/**
 * Pure calculation for child-calibrated Elo progression.
 */
export function calculateAdaptiveRatingAdjustment(params: RatingAdjustmentParams): RatingAdjustmentResult {
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

  const isProtectedByFloor = targetRating < MIN_ELO_FLOOR;
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
```

---

## 5. Component Organization & Visual Craft Conventions

All UI components must adhere to the **Playful Gamified Tactile Arcade Aesthetic** validated in `.agentwork/findings-ux-craftsman.md`.

### 5.1 Design Tokens & 3D Tactile Styling
1. **Buttons:** Must use 3D bevels with spring easing:
   ```css
   .btn-tactile {
     border-bottom: 5px solid var(--color-shadow);
     border-radius: var(--radius-lg);
     transition: transform var(--duration-fast) var(--ease-spring), box-shadow var(--duration-fast);
   }
   .btn-tactile:active {
     transform: translateY(3px);
     border-bottom-width: 2px;
   }
   ```
2. **Color Palette Mapping:**
   - **Tactical Drills:** Violet / Indigo Theme (`--color-primary`)
   - **Adaptive Ladder:** Sunshine Gold (`--academy-gold`, `#ffb300`)
   - **Puzzle Rush:** Flame Coral / Orange (`#ff5722`)
   - **Streak Survivor:** Emerald Mint (`#22c55e`)
3. **Touch Targets & Ergonomics:**
   - Minimum button height: **48px** (touch target compliance).
   - Board squares: Responsive CSS grid with minimum 40px dimensions on mobile.
4. **Accessibility (`aria-*`):**
   - Live announcements for strikes, time warnings, and streak combos using `role="status"` and `aria-live="polite"`.
   - Modals must support `Escape` key dismissal and focus trapping.

---

## 6. Offline Data Pack Standards

The offline library consists of ~300–500 curated CC0 puzzles organized into modular bundles:

```typescript
// apps/client/src/features/puzzles/data/packs/novice_puzzles.ts
import type { Puzzle } from '@fun-chess/shared';

export const NOVICE_PUZZLES: readonly Puzzle[] = [
  {
    id: 'nov_mate_001',
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 0 4',
    moves: ['f3f7'],
    rating: 700,
    ratingDeviation: 120,
    themes: ['mate_in_1', 'scholars_mate'],
    primaryTheme: 'mate_in_1',
    difficulty: 'novice',
    title: "Scholar's Mate Finish! 👑",
    subtitle: 'Deliver checkmate on the weak f7 square',
    playerColor: 'w',
    solutionPlies: 1,
  },
  // Additional curated positions...
];
```

### Pack Invariant Verification (`data/__tests__/pack_integrity.spec.ts`)
Every puzzle pack must be verified at test time:
1. `fen` must successfully load in `chess.js` without throwing.
2. Every move in `moves` array must be a valid, legal UCI move advancing the position.
3. Checkmate puzzles must result in `chess.isCheckmate() === true` on the final move.
4. All `themes` must be valid members of `PuzzleTheme` union.

---

## 7. Public API Barriers (`index.ts`)

To maintain clean module boundaries and avoid circular dependencies (`code-organization-principles.md`):
- `apps/client/src/features/puzzles/index.ts` exports ONLY:
  - `PuzzleArena` (Root component)
  - `usePuzzleProgress`, `usePuzzleRunner`, `useAdaptiveLadder`, `usePuzzleRush`
  - Selected public types from `@fun-chess/shared`
- Internal engine files and raw store adapters are NOT imported directly outside `features/puzzles/`.
