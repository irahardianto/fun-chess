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

### 4. Run with Docker Compose (Optional)
```bash
# Build and run containerized server locally
docker compose up --build
```

---

## ☁️ Optional Cloud Deployment (Google Cloud Run)

While Fun Chess is designed primarily for zero-config local LAN play, you can optionally deploy it to **Google Cloud Run** for serverless, publicly accessible multiplayer games with friends over the internet without needing port forwarding or VPNs.

### Why Google Cloud Run?
- **Serverless & Cost-Effective:** Scales to zero (`min-instances = 0`) when idle — costs $0 when no games are active.
- **WebSocket Native:** Fully supports Socket.io WebSockets with long-lived connection timeouts (`3600s`).
- **Zero Database Required:** The authoritative in-memory room store runs entirely inside the container with sub-millisecond move latency.

---

### Deployment Method A: `gcloud` CLI (Quick Deploy)

1. **Build and push container image:**
   ```bash
   export GCP_PROJECT_ID="your-gcp-project-id"
   export REGION="asia-southeast1" # or us-central1, europe-west1, etc.
   export IMAGE_NAME="gcr.io/${GCP_PROJECT_ID}/fun-chess:latest"

   # Submit build to Google Cloud Build
   gcloud builds submit --tag ${IMAGE_NAME}
   ```

2. **Deploy to Cloud Run with Session Affinity & WebSocket Tuning:**
   ```bash
   gcloud run deploy fun-chess \
     --image ${IMAGE_NAME} \
     --platform managed \
     --region ${REGION} \
     --allow-unauthenticated \
     --port 3000 \
     --timeout 3600 \
     --concurrency 100 \
     --session-affinity \
     --min-instances 0 \
     --max-instances 1 \
     --memory 512Mi \
     --cpu 1 \
     --set-env-vars NODE_ENV=production
   ```

> [!TIP]
> **Key Deployment Flags:**
> - `--session-affinity`: Routes WebSocket connections and HTTP requests stickily to ensure multiplayer pairs connect to the same in-memory room.
> - `--max-instances 1`: Recommended for the zero-database in-memory storage model.
> - `--timeout 3600`: Keeps WebSocket connections active during extended chess matches without proxy disconnects.

---

### Deployment Method B: Terraform (Infrastructure as Code)

Production-ready Terraform configurations are provided in [`infra/terraform/`](file:///home/irahardianto/works/projects/fun-chess/infra/terraform).

1. **Navigate to Terraform directory:**
   ```bash
   cd infra/terraform
   ```

2. **Configure your variables:**
   ```bash
   # Copy sample variable file (never commit terraform.tfvars!)
   cp terraform.tfvars.example terraform.tfvars
   ```
   Edit `terraform.tfvars` with your GCP project ID and container image URI:
   ```hcl
   gcp_project_id  = "your-gcp-project-id"
   container_image = "asia-southeast1-docker.pkg.dev/your-gcp-project-id/fun-chess-repo/fun-chess:latest"
   gcp_region      = "asia-southeast1"
   service_name    = "fun-chess"
   min_instances   = 0
   max_instances   = 1
   ```

3. **Initialize and Apply:**
   ```bash
   terraform init
   terraform apply
   ```

4. **Access your Service:**
   Terraform will output your public Cloud Run URL (`service_url`). Opening this URL will launch Fun Chess in Cloud Relay mode, automatically generating public invite and QR links for remote friends.

> [!NOTE]
> For in-depth architecture specifications, Redis scale-out blueprints, health probe contracts, and connection lifecycle details, see [docs/cloud-run-architecture.md](file:///home/irahardianto/works/projects/fun-chess/docs/cloud-run-architecture.md).

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
