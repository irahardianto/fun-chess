---
$schema: "https://raw.githubusercontent.com/irahardianto/awesome-agv/main/.agents/skills/structured-spec/spec-schema.json"
spec_id: "ADR-001-PINIA-STATE-MANAGEMENT-V1"
title: "Adopt Pinia Setup Stores for Client State Management"
doc_type: "adr"
status: "accepted"
version: "1.0.0"
owners: ["frontend-team", "architecture-team"]
created: "2026-09-10"
modified: "2026-09-10"
---

<!-- decision
  id: ADR-001
  title: Adopt Pinia Setup Stores for Client State Management
  status: accepted
  context: Finding MAJ-018 identified client state management architectural fragmentation (<80% consistency across features). Four competing paradigms existed: OO repository classes, module-singleton reactive variables with test backdoors, uncoordinated per-instance composable state, and custom Vue provide/inject tokens. Furthermore, MIN-010 identified non-deterministic module evaluation side effects (Date.now() at module load time) and eager storage migration.
  alternatives: ["Pinia Setup Stores", "Plain Reactive Composables with Module Singletons / Provide-Inject", "Vuex 4"]
  rationale: Pinia Setup Stores provide type-safe, reactive state with Vue Devtools support, SSR/hydration safety, clean test isolation via setActivePinia, and eliminate module-level mutable singletons.
  consequences: Standardizes client feature state on defineStore setup stores with pure createDefaultState(clock) factories. Eliminates mutable module singletons and test backdoors. Requires pinia dependency in @fun-chess/client.
  affects_requirements: [MAJ-018, MIN-010]
-->

## Context

During the codebase audit, finding **MAJ-018** revealed severe architectural fragmentation across client state management in `apps/client/src/features/`. Pattern consistency was well below the mandatory 80% threshold required by `architectural-pattern.md`. Specifically, four conflicting paradigms co-existed:
1. **Object-Oriented Storage Repositories:** Class-based stores (`LocalStoragePuzzleProgressStore`, `InMemoryPuzzleProgressStore`, `LocalStorageUnifiedStore`) managing their own internal in-memory caches and persistence logic.
2. **Module-Singleton Reactive Variables:** Global module-level `ref` / `reactive` singletons with exported setter functions used as test backdoors (`setPwaInstallStorage`, `setGameActionsLogger`, `setSocketTransportLogger`), violating DI isolation and causing test concurrency bleed.
3. **Per-Instance Composable State:** Composables declaring internal reactive refs that desynchronize when instantiated across multiple components (e.g., audio state, modal management).
4. **Custom Vue `provide` / `inject` Tokens:** Ad-hoc DI tokens attempting to coordinate state without a centralized reactive inspection or reset mechanism.

In addition, finding **MIN-010** identified non-deterministic module evaluation side effects and mutable top-level state:
- `DEFAULT_PUZZLE_PROGRESS` in `apps/client/src/features/puzzles/store/puzzle_progress.store.ts` called `Date.now()` during top-level module load time, exporting a shared mutable object and preventing deterministic time control in unit tests.
- `apps/client/src/main.ts` executed storage migration `migrateStorageV1ToV2(safeLocalStorage)` at top-level module evaluation time rather than during application bootstrap inside `createFunChessApp()`.

A unified, defensible architectural decision is required to standardize client state management, restore pattern consistency above 80%, and eliminate top-level module side effects.

## Decision

We formally adopt **Pinia Setup Stores** (`defineStore('id', () => { ... })`) as the canonical client state management solution for Fun Chess, in accordance with `.agentwork/project_conventions.md` §3 and the `vue-idioms` skill.

Key pillars of this decision:
1. **Pinia Core Registration:** Install `pinia` in `apps/client` and register `app.use(createPinia())` at the application composition root in `apps/client/src/main.ts` inside `createFunChessApp()`.
2. **Setup Store Pattern:** All Pinia stores must use the Setup Store syntax (`defineStore('id', () => { ... })`), declaring state with `ref()` / `shallowRef()`, getters with `computed()`, and actions as plain functions.
3. **Deterministic Pure Factories (MIN-010):** Stores must initialize default state through pure factory functions accepting an optional injected `IClock` (e.g., `createDefaultPuzzleProgress(clock?: IClock)`). Module-level top-level calls to `Date.now()` or `new Date()` are strictly banned.
4. **Lifecycle & Storage Hydration (MIN-010):** Storage migrations and initial state hydration must occur within application bootstrap inside `createFunChessApp()`, never at module import time.
5. **Clean Test Isolation:** Tests instantiate fresh Pinia instances via `setActivePinia(createPinia())` in `beforeEach()`, guaranteeing zero state leakage across test suites without needing module-level mutable backdoors.
6. **Explicit Teardown:** Every store exposes a `resetState(clock?: IClock)` method and aliases `$reset` to it, enabling deterministic reset between test runs.

## Alternatives Considered

### Option A: Pinia Setup Stores (Chosen)
- **Architecture:** Vue's official, recommended state management library. Uses Composition API syntax (`defineStore('id', () => { ... })`).
- **Pros:**
  - Full TypeScript type inference without complex generic wrappers.
  - Native integration with Vue Devtools for time-travel debugging and state inspection.
  - Eliminates global module singletons: stores are tied to the active Pinia instance.
  - Trivial test isolation using `setActivePinia(createPinia())` or `@pinia/testing`.
  - Extremely lightweight (~1.5 KB gzipped) with modular tree-shaking.
  - Seamless interoperability with composables and dependency injection.
- **Cons:**
  - Adds one direct production dependency (`pinia`).
- **Effort:** Low (Pinia is standard in modern Vue 3 ecosystems).

### Option B: Plain Reactive Composables (Module Singletons / Provide-Inject)
- **Architecture:** Keep state in module-scoped `ref()` / `reactive()` variables or pass reactive objects via Vue `provide()` / `inject()`.
- **Pros:**
  - Zero external dependencies beyond `vue`.
- **Cons:**
  - Module-scoped reactive variables are global singletons that leak state between unit tests, tempting developers to write setter backdoors (`setPwaInstallStorage`, violating MAJ-019).
  - Provide/inject requires an active Vue component tree, complicating non-component domain operations and headless unit tests.
  - Lacks built-in Devtools timeline tracing, state replacement, and action subscription hooks.
  - Fails to resolve the <80% architectural fragmentation identified in MAJ-018.
- **Effort:** Medium (requires complex custom harness to avoid test leakage).

### Option C: Vuex 4
- **Architecture:** Previous generation centralized state management with mutations, actions, getters, and modules.
- **Pros:**
  - Familiar to developers with Vue 2 / older Vue 3 background.
- **Cons:**
  - Officially in maintenance mode, superseded by Pinia.
  - Poor TypeScript DX: requires string-based mutation/action dispatching and cumbersome typing shims.
  - Verbose boilerplate (mutations vs actions separation) incompatible with Composition API idioms.
  - Monolithic single store tree instead of modular feature stores.
- **Effort:** High (high boilerplate, deprecated toolchain).

## Rationale

Pinia is the official, idiomatic state management standard for Vue 3. Pinia Setup Stores align 100% with the monorepo's architectural conventions (`project-structure.md`, `vue-idioms`, and `architectural-pattern.md`):
- **Testability First:** With `setActivePinia(createPinia())`, each test receives an isolated store sandbox. Combined with `createDefaultPuzzleProgress(clock)` (MIN-010), tests run deterministically with zero clock skew and zero shared state.
- **Simplicity and Maintainability (KISS):** Setup stores resemble standard composables but gain Devtools visibility, store-level subscriptions, and unified instance lifecycles.
- **Elimination of Bad Patterns:** Pinia adoption deprecates mutable module singletons, eliminates test backdoors (MAJ-019), and unifies storage adapters into coherent domain stores.

## Consequences

### Positive
- **Standardized Client State:** All client features follow a uniform state architecture, exceeding the 80% consistency threshold required by `architectural-pattern.md`.
- **Deterministic Testing:** Test suites use `setActivePinia(createPinia())` and injected `MockClock` instances, ending test pollution and flaky tests.
- **Zero Module Load Side Effects:** Eliminating top-level `Date.now()` and deferring storage migration to `createFunChessApp()` eliminates SSR/hydration traps and hidden boot overhead.
- **Developer Experience:** Full auto-completion, strict typing, and seamless Vue Devtools debugging for all domain state.

### Negative
- **Dependency Footprint:** Adds `pinia` (`^4.0.3` or `^3.0.0`) to `apps/client/package.json`.
- **Migration Effort:** Existing feature storage implementations (puzzles, scenarios, multiplayer, lobby) will be progressively migrated to Pinia Setup Stores across subsequent waves.

### Risks & Mitigations
- **Risk:** Accessing stores before `app.use(createPinia())` or `setActivePinia()` is called throws `"[🍍]: 'getActivePinia()' was called but there was no active Pinia"`.
  - **Mitigation:** Ensure `createPinia()` is registered in `createFunChessApp()` before store instantiation, and unit tests invoke `setActivePinia(createPinia())` in `beforeEach()`. Pure factories (like `createDefaultPuzzleProgress`) remain independent of Pinia and can be evaluated anywhere.
- **Risk:** Developers mutating store state directly from components instead of dispatching actions.
  - **Mitigation:** Enforce store action conventions in code reviews and static analysis as detailed in `vue-idioms`.

## Implementation Guidelines (per `project_conventions.md` §3)

1. **Setup Store Structure:**
   ```typescript
   export const usePuzzleProgressStore = defineStore('puzzle-progress', () => {
     // 1. Reactive State
     const progress = ref<PuzzleProgress>(createDefaultPuzzleProgress());
     const isLoaded = ref<boolean>(false);

     // 2. Computed Getters
     const currentRating = computed(() => progress.value.ratingProfile.rating);

     // 3. Actions
     function setProgress(newProgress: PuzzleProgress): void { ... }
     function resetState(clock: IClock = new SystemClock()): void { ... }

     return { progress, isLoaded, currentRating, setProgress, resetState, $reset: resetState };
   });
   ```

2. **Bootstrap Wiring (`apps/client/src/main.ts`):**
   ```typescript
   export function createFunChessApp() {
     migrateStorageV1ToV2(safeLocalStorage); // Storage migration inside bootstrap (MIN-010)
     const app = createApp(App);
     app.use(createPinia()); // Pinia registration (MAJ-018)
     ...
     return app;
   }
   ```

## Related
- Project Conventions & Architectural Standards @.agentwork/project_conventions.md §3
- Architectural Patterns — Testability-First Design @.agents/rules/architectural-pattern.md
- Code Idioms and Conventions @.agents/rules/code-idioms-and-conventions.md
- Vue Idioms Skill @.agents/skills/vue-idioms/SKILL.md
