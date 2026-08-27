# ♞ Fun Chess! ✨

A modern, playful, and responsive web-based chess application designed for kids, parents, and friends. Featuring local LAN multiplayer, kid-friendly AI mascots, interactive tactic puzzles, progressive drills, step-by-step curriculum scenarios, and seamless offline PWA support.

Zero database, zero accounts, zero public internet required — 100% private, accessible, and fast!

---

## ✨ Features & Game Modes

### 🌐 1. Local LAN Multiplayer
- **Zero-Config LAN Play:** Host a match on your home Wi-Fi and share a 4-letter room code or instant QR code.
- **Cross-Device Ready:** Play seamlessly between smartphones, tablets, iPads, Chromebooks, and PCs.
- **Dual Input Model:** Fully supports intuitive **tap-to-move** with target indicators and smooth **pointer drag-and-drop** with piece lift physics.
- **Instant Rematches:** 1-click rematch with automatic piece color swaps for fair play.

### 🤖 2. Solo AI Mascots
- **Distinct AI Personalities:** Play against friendly animal personas (Sparky ⚡, Barnaby 🐻, Pip 🐥, Celeste 🦉) tailored to different skill levels.
- **Tactical Engine:** Powered by Minimax with Alpha-Beta pruning, Piece-Square Table evaluations, intentional blunder generation, and dynamic difficulty scaling.

### 🧩 3. Tactical Puzzles & Training Hub
- **Adaptive Ladder:** Dynamic Elo-rated tactical puzzles that adapt to your personal learning curve.
- **Themed Drills:** Targeted practice across major tactical motifs (Forks, Pins, Skewers, Back Ranks, Discovered Attacks, Double Checks, Deflection, Overloading, Mate in 1/2/3) with interactive concept primers.
- **Puzzle Rush Arena:** 3-minute and 5-minute timed tactical sprints with streak multipliers (Spark 🔥, Blaze 🔥🔥, Inferno 🔥🔥🔥).
- **Progressive Hint Engine:** 3-tier progressive assistance (Tier 1: Piece Nudge → Tier 2: Target Beacon → Tier 3: Tactical Arrow & Ghost Piece).

### 🎓 4. Interactive Scenarios & Curriculum
- **Guided Lesson Practice:** Step-by-step interactive scenarios covering fundamentals, tactics, checkmating patterns, and endgame techniques.
- **Star Mastery System:** Earn stars and track completion progress across curriculum categories.

### 📲 5. Offline-First PWA & Progress Portability
- **Installable PWA:** Install Fun Chess to your home screen or desktop with offline caching and background service workers.
- **Device Sync & Portability:** Export and import progress across devices via QR code scanner or JSON backups without needing a cloud account.

### ♿ 6. Accessible & Inclusive Design
- **WCAG AA Compliance:** High-contrast design tokens across both Light and Dark themes.
- **Keyboard Navigation:** Full 2D board navigation, APG Roving Tabindex across all composite radiogroups and button bars.
- **Standardized Visual Hints:** High-visibility red rounded square indicators for all valid moves and capture targets.
- **Zero-Asset Web Audio Synthesizer:** Procedural Web Audio API sound effects (move thuds, capture pops, check chimes, victory fanfare) with 0ms latency and zero asset downloads.
- **Celebrations:** Responsive canvas confetti cannons on victory and milestones!

---

## 🚀 Quick Start

### Prerequisites
- **Node.js:** `v20+` or `v24+` LTS
- **pnpm:** `v9+` (or `npm`)

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Run in Development Mode
```bash
# Start both backend server and client dev servers concurrently
pnpm dev
```

### 3. Production Build & Start Local LAN Server
```bash
# Build shared library, server, and client bundles
pnpm build

# Start the LAN-accessible server
pnpm start
```

When started, Fun Chess automatically binds to `0.0.0.0` and prints your local Wi-Fi IP address in the console:

```text
============================================================
  ♞ FUN CHESS LOCAL LAN SERVER IS RUNNING!
  
  Localhost: http://localhost:3000
  LAN Host:  http://192.168.1.105:3000
  
  Share this URL or scan the QR code on any device on Wi-Fi!
============================================================
```

---

## 🧪 Testing & Verification

Fun Chess enforces high test coverage and strict automated quality checks:

```bash
# Run all unit, component, engine, and integration test suites
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run TypeScript typechecks across packages
pnpm run typecheck
```

- **Client Tests:** 107 test suites with 1,220+ unit and integration tests.
- **Server & Integration Tests:** Multi-client socket flows, room lifecycle, and engine validation.

---

## 📂 Project Structure

```text
fun-chess/
├── shared/                   # @fun-chess/shared: Models, types, and socket event contracts
├── apps/
│   ├── server/               # Node.js + TypeScript + Socket.io backend
│   │   └── src/
│   │       ├── platform/     # Structured logging (Pino), HTTP & socket middleware
│   │       └── features/     # LAN network detection, room lifecycle, match coordinator
│   └── client/               # Vue 3 (Composition API) + Vite + TypeScript frontend
│       └── src/
│           ├── assets/       # Design tokens (design-tokens.css), piece SVG icons
│           ├── components/   # Atomic base components (BaseButton, BaseInput, BaseModal, BaseCard)
│           ├── platform/     # Web Audio synthesizer, canvas-confetti, socket client
│           ├── features/     # Vertical slices (board, ai, puzzles, scenarios, lobby, pwa, portability)
│           └── App.vue       # Main responsive game shell
└── docs/                     # Architectural decision records, UX specs, and conventions
```

---

## 📄 License
MIT — Built with care for family fun! ♟️❤️
