# ♞ Fun Chess! ✨

A fast, playful, and responsive web-based 1v1 chess game designed for kids, parents, and friends to play seamlessly together over a Local Area Network (LAN) across smartphones, tablets, laptops, and desktop computers.

Zero database, zero accounts, zero public internet required — 100% private, ephemeral, and foolproof!

---

## ✨ Features

- 🎮 **Local LAN Multiplayer:** Anyone on your home Wi-Fi can host a game and share a 4-letter room code or instant QR code.
- 📱 **Cross-Device & Responsive:** Flawless touch support for phones, tablets, iPads, Chromebooks, and PCs.
- 🖐️ **Dual Input Model:** Seamlessly supports both intuitive **tap-to-move** with target indicators and smooth **pointer drag-and-drop** with piece lift physics.
- 🏆 **Full Chess Rules:** Server-authoritative engine powered by `chess.js` supporting castling, en passant, checkmate, stalemate, draws, and kid-friendly 4-choice pawn promotions (Queen, Knight, Rook, Bishop).
- 🔊 **Zero-Asset Web Audio Synthesizer:** Tactile sound effects synthesized live in the browser (wooden move thuds, capture pops, check chimes, victory fanfare, and start chords) — 0ms latency, zero audio asset downloads.
- 🎉 **Celebrations:** Full-screen multi-color confetti cannons on checkmate and victory!
- 📊 **Live HUD:** Captured piece trays with real-time material advantage badges (`+3`, `+5`), active turn highlights, and SAN move history.
- 🔄 **Rematch & Color Swap:** Instant 1-click rematch requests that automatically swap piece colors for the next round.
- 🛡️ **Zero Database:** 100% in-memory ephemeral state. Completely private within your LAN.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js:** `v20+` or `v24+` LTS
- **npm:** `v9+` or `v11+`

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the Application
```bash
npm run build
```

### 3. Start the Local LAN Server
```bash
npm start
```

On startup, Fun Chess binds to `0.0.0.0` and prints your local Wi-Fi IP address in the console:

```
============================================================
  ♞ FUN CHESS LOCAL LAN SERVER IS RUNNING!
  
  Localhost: http://localhost:3000
  LAN Host:  http://192.168.1.105:3000
  
  Share this URL or scan QR code on any device on Wi-Fi!
============================================================
```

---

## 👨‍👩‍👧‍👦 How to Play

1. **Host a Game:**
   - Open `http://localhost:3000` (or `http://<LAN_IP>:3000`) on your computer, laptop, or tablet.
   - Enter your nickname, choose your preferred piece color (White, Random, or Black), and click **"Host New Game ⚔️"**.
   - A 4-letter Room Code (e.g. `STAR`) and a scannable **QR code** will appear.

2. **Join the Game:**
   - From any phone, tablet, or laptop connected to the same Wi-Fi:
     - **Option A:** Open your phone's Camera app and scan the QR code on the host's screen.
     - **Option B:** Open `http://<LAN_IP>:3000`, enter your nickname, type the 4-letter room code, and tap **"Join Game 🚀"**.
   - The game starts immediately!

---

## 🧪 Running Automated Tests

Fun Chess includes an extensive test suite covering server logic, Vue components, audio synthesizers, and real-time dual-client socket flows:

```bash
# Run all 200+ unit, component, composable, and integration tests
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 🏛️ Monorepo Architecture

```
fun-chess/
├── shared/              # @fun-chess/shared: Shared TypeScript interfaces, models & Socket contracts
├── apps/
│   ├── server/          # Node.js + TypeScript + Socket.io backend server
│   │   └── src/
│   │       ├── platform/# Structured logging (Pino with correlation IDs), HTTP & Socket middleware
│   │       └── features/# Vertical feature slices: lan/, rooms/, game/
│   └── client/          # Vue 3 (Composition API) + Vite + TypeScript frontend
│       └── src/
│           ├── assets/  # Design tokens (design-tokens.css) & SVG chess pieces
│           ├── platform/# Web Audio API synthesizer, canvas-confetti, Socket client
│           ├── features/# board/, hud/, lobby/, modals/
│           └── App.vue  # Main interactive game shell
└── tests/               # Multi-client socket integration & contract test suites
```

---

## 📄 License
MIT — Built for family fun! ♟️❤️
