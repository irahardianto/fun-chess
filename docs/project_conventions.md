# Project Conventions & Architectural Standards: Puzzle Hub Remediation

**Document Version:** 1.0.0  
**Status:** FROZEN CONTRACT  
**Target Scope:** `apps/client/src/features/puzzles/**`, `shared/src/contracts/**`  
**Governing Rules:** `architectural-pattern.md`, `project-structure.md`, `code-idioms-and-conventions.md`, `rugged-software-constitution.md`, `logging-and-observability-mandate.md`

---

## 1. Feature Directory Layout Conventions

Following the **Feature-First Vertical Slice Architecture** mandated in `project-structure.md` and `code-organization-principles.md`:

```text
apps/client/src/features/puzzles/
├── components/                     # Pure Vue 3 presentation components
│   ├── AdaptiveLadderCard.vue     # Rating climb card
│   ├── MascotFeedbackModal.vue    # Mascot coaching tips modal
│   ├── ProgressiveHintLayer.vue   # 3-tier visual hint overlay
│   ├── PuzzleBoardWrapper.vue     # Board + overlay integration
│   ├── PuzzleCompletionModal.vue  # Post-solve tactical debrief & replay
│   ├── PuzzleHubView.vue          # Mode selector / lobby
│   ├── PuzzleRushArena.vue        # Blitz & survivor arcade HUD
│   ├── RatingClimbHud.vue         # Real-time Elo adjustment badge
│   ├── StreakHud.vue              # Streak tracker
│   ├── ThemeDrillSelector.vue     # Themed drill selector
│   └── index.ts                   # Exported component barrel
├── composables/                    # Vue 3 reactive state machines & wiring
│   ├── useAdaptiveLadder.ts       # Ladder progression state
│   ├── useProgressiveHint.ts      # 3-tier progressive hint state
│   ├── usePuzzleProgress.ts      # Persistent progress bridge
│   ├── usePuzzleRunner.ts        # Active puzzle play session state machine
│   ├── usePuzzleRush.ts          # Arcade timer & scoring state
│   ├── useThemedDrills.ts        # Themed drill category state
│   └── index.ts                   # Composable barrel
├── data/                          # Curated CC0 static JSON puzzle packs
│   ├── anastasia_hook.json        # Anastasia & Hook mate puzzles
│   ├── back_rank.json             # Back-rank mate puzzles
│   ├── deflection_decoy.json      # Deflection & decoy tactics
│   ├── discovered_checks.json     # Discovered attack/check tactics
│   ├── endgame_conversion.json    # Theoretical endgame conversions
│   ├── forks.json                 # Knight/Pawn/Queen fork tactics
│   ├── greek_gift.json            # Genuine Greek Gift (Bxh7+) tactics
│   ├── pins.json                  # Absolute & relative pin tactics
│   ├── skewers.json               # Skewer tactics
│   ├── smothered.json             # Smothered mate tactics
│   ├── windmill.json              # Windmill tactics
│   ├── puzzle_catalog.ts          # Catalog loader & indexed lookups
│   ├── puzzle_themes.ts           # Theme metadata & icons
│   └── index.ts                   # Data barrel
├── engine/                        # Pure TypeScript domain logic (Rule 2: Zero I/O)
│   ├── adaptive_rating.ts         # Kid-calibrated Elo calculations
│   ├── hint_generator.ts          # 3-tier pedagogical hint generator
│   ├── puzzle_analysis_engine.ts  # Material delta, motif & explanation engine
│   ├── puzzle_validator.ts        # Ply move validation & bot responses
│   ├── rush_engine.ts             # Arcade rules, timers, and scoring
│   ├── star_calculator.ts         # 1-3 star performance evaluation
│   └── index.ts                   # Engine barrel
├── store/                         # Persistence adapters (Rule 1: I/O Isolation)
│   ├── puzzle_progress_store.ts   # LocalStorage & IndexedDB production adapter
│   └── puzzle_progress_mock.ts    # In-memory test adapter for unit tests
├── __tests__/                     # Feature-level unit & integration tests
│   ├── pack_pedagogy.spec.ts      # 100% dataset pedagogical integrity test
│   ├── puzzle_analysis.spec.ts    # Material delta & motif engine tests
│   ├── puzzle_validator.spec.ts   # Move validator tests
│   └── adaptive_rating.spec.ts    # Elo rating adjustment tests
├── PuzzleArena.vue                # Main puzzle execution view
└── index.ts                       # Public API barrel (Vertical slice boundary)
```

---

## 2. File Naming & Module Export Conventions

1. **Pure Engine Logic**: `snake_case.ts` (e.g. `puzzle_analysis_engine.ts`, `puzzle_validator.ts`, `adaptive_rating.ts`).
2. **Vue Composables**: `useCamelCase.ts` (e.g. `usePuzzleRunner.ts`, `useProgressiveHint.ts`).
3. **Vue Components**: `PascalCase.vue` (e.g. `PuzzleArena.vue`, `PuzzleCompletionModal.vue`).
4. **Data Bundles**: `snake_case.json` (e.g. `forks.json`, `pins.json`).
5. **Tests**: Co-located in `__tests__/` with `*.spec.ts` matching the target file name (e.g. `puzzle_analysis.spec.ts`, `PuzzleArena.spec.ts`).
6. **Public Boundary**: Every subdirectory has an `index.ts` re-exporting only public symbols. Other features import from `@/features/puzzles` and NEVER reach into private internal files (e.g. `@/features/puzzles/engine/adaptive_rating.ts` is private; import via barrel).

---

## 3. Typing & Immutability Rules

1. **Strict TypeScript**: `noImplicitAny: true`, `strictNullChecks: true`, `exactOptionalPropertyTypes: true`.
2. **Immutability by Default**: All domain contracts in `@fun-chess/shared` use `readonly` properties and `readonly T[]` for arrays.
   ```typescript
   // ✅ Correct:
   export interface Puzzle {
     readonly id: string;
     readonly moves: readonly string[];
     readonly tacticalGoal: string;
   }

   // ❌ Rejected:
   export interface Puzzle {
     id: string;
     moves: string[];
   }
   ```
3. **No `any` or Cast Abuse**: Never use `as any` or `@ts-ignore`. If narrowing unknown inputs, use discriminated unions or user-defined type predicates (`isPuzzle(val)`).

---

## 4. Architectural Rules Compliance

### 4.1 Rule 1: I/O Isolation
- All storage I/O (e.g. LocalStorage, IndexedDB, WebSocket sync) is abstracted behind `PuzzleProgressStore` interface in `@fun-chess/shared`.
- Production implementation: `LocalStoragePuzzleProgressStore` in `puzzle_progress_store.ts`.
- Test implementation: `InMemoryPuzzleProgressStore` in `puzzle_progress_mock.ts`.
- Components and composables NEVER call `localStorage.getItem()` or `localStorage.setItem()` directly.

### 4.2 Rule 2: Pure Business Logic
- The Three-Step Pattern: **Fetch state $\rightarrow$ Pure calculation $\rightarrow$ Persist result**.
- `PuzzleAnalysisEngine`, `puzzle_validator.ts`, and `adaptive_rating.ts` are 100% pure functions:
  - Input arguments $\rightarrow$ Output value.
  - Zero side effects.
  - Zero imports from `vue` (`ref`, `reactive`, `watch`).
  - Zero async network/disk calls.

### 4.3 Rule 3: Dependency Direction
- `shared/src/contracts/` $\leftarrow$ `apps/client/src/features/puzzles/engine/` $\leftarrow$ `apps/client/src/features/puzzles/composables/` $\leftarrow$ `apps/client/src/features/puzzles/components/`.
- Business logic never imports from UI layers or network libraries.

---

## 5. Error Handling Conventions

1. **Sentinel Errors & Error Codes**: Use defined error codes from `shared/src/contracts/errors.ts` (`ERR_PUZZLE_NOT_FOUND`, `ERR_INVALID_PUZZLE_FEN`, `ERR_MALFORMED_SOLUTION_LINE`).
2. **Fail Securely & Gracefully**: If a puzzle fails to parse or chess state is corrupted, log structured warning, render friendly fallback message, and do not crash the app.
3. **Result Pattern**: Prefer returning structured status objects (e.g. `MoveValidationOutcome`, `PlayerMistakeRefutation`) rather than throwing raw exceptions in normal gameplay loops.

---

## 6. Logging & Observability Mandate

Following `logging-and-observability-mandate.md`:
- Entry points (starting a puzzle session, submitting a move, completing a puzzle, requesting a hint) include structured operation logging.
- Logging payload format:
  ```typescript
  console.info('[PuzzleSession:MoveValidated]', {
    correlationId,
    puzzleId: puzzle.id,
    moveIndex: currentMoveIndex,
    isCorrect: outcome.isCorrect,
    durationMs,
  });
  ```
- Pure engine functions do not perform logging directly; composables and controllers handle logging at operation boundaries.

---

## 7. Testing Strategy & Pyramid

### 7.1 Test Pyramid Distribution
- **Unit Tests (70%)**: Pure engine calculations (`puzzle_analysis_engine.ts`, `puzzle_validator.ts`, `hint_generator.ts`, `star_calculator.ts`, `adaptive_rating.ts`). Must run in <500ms.
- **Data Integrity Tests (15%)**: `pack_pedagogy.spec.ts` scanning 100% of curated puzzle packs to verify non-empty goals, positive material delta, non-blunder endings, and valid themes.
- **Component & Integration Tests (15%)**: Vitest with `@vue/test-utils` testing modal rendering, board inspection toggle, replay slider, and HUD display.

### 7.2 Arrange-Act-Assert (AAA) Standard
All test cases must follow explicit AAA blocks:
```typescript
describe('PuzzleAnalysisEngine', () => {
  it('calculates net material gain for Queen sacrifice into mate', () => {
    // Arrange
    const puzzle = getPuzzleById('puz_smothered_001')!;

    // Act
    const analysis = analyzePuzzleSolution(puzzle);

    // Assert
    expect(analysis.isCheckmate).toBe(true);
    expect(analysis.advantageSummary.formattedAdvantage).toBe('Checkmate 👑');
    expect(analysis.detectedTheme).toBe('smothered_mate');
  });
});
```

---

## 8. Backward Compatibility Guarantees

1. **User Progress Preservation**: Existing user LocalStorage keys (`fun_chess_puzzle_progress_v1`) MUST parse cleanly. Missing fields in historical records will be automatically backfilled with default novice ratings (Elo 800) without data loss.
2. **Theme Filter Compatibility**: Theme IDs are stable and backward compatible with existing theme drill routes.
3. **Offline PWA Integrity**: All puzzle packs remain static JSON assets bundled at build time; zero network fetches required for offline gameplay.
