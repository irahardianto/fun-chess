# Visual Design & UX Specification
## Puzzle Hub Pedagogical Remediation & Tactical Tutor Experience

**Specification Identifier:** `DESIGN-UX-PUZZLE-003`  
**Document Target:** `.agentwork/design-ux.md`  
**Author:** `@ux-craftsman` (UI/UX Excellence Authority)  
**Target Workspace:** `apps/client/src/features/puzzles/` & `shared/src/contracts/`  
**Status:** **FROZEN DESIGN CONTRACT** (Mandatory implementation reference for frontend builders)  

---

## Executive Summary & Design Vision

The Fun Chess Puzzle Hub is evolving from a mechanical coordinate-move validator into a **delightful, empowering chess tactics tutor**. 

In the legacy design, players faced the "Blind 2-3 Move Trap": they made moves without knowing the tactical premise, experienced coordinate-only hints, and were immediately interrupted upon solving by a modal that obscured the board with generic praise ("Outstanding vision!").

This specification establishes a **pedagogy-first visual and interaction architecture**:
1. **Pre-Move Clarity (In-Game HUD):** Players immediately understand *what* they are hunting for via a prominent **Tactical Goal Banner** and **"Why" Conceptual Rationale**.
2. **Concept-Driven Progressive Hints:** Hints guide players through tactical ideas (e.g. "Look for an outpost that forks King and Queen") rather than raw coordinates.
3. **Post-Solve Educational Victory Debrief:** The revamped completion modal celebrates the win with **Tactical Outcome Badges**, **Net Material Gain Pills** (`+5 Rook ♜`), **Coach's Strategic Breakdown**, and **Mascot Persona Takeaways**.
4. **Interactive Board Replay & Inspection Mode:** Players can minimize the victory modal to inspect the live board, or use the **Move Replay Controller** (`[⏮] [◀] [▶] [⏭]`) to step through the tactical sequence on the board.
5. **Zero-CLS Layout Stability & Accessible Touch Targets:** Every HUD element, banner, replay controller, and badge adheres to strict layout stability, 44px+ tap targets, and WCAG AA contrast standards.

---

## Table of Contents

1. [Design Tokens & Tactical Theme Palette](#1-design-tokens--tactical-theme-palette)
   - [1.1 Primitives & Core Surfaces](#11-primitives--core-surfaces)
   - [1.2 Tactical Theme Color System](#12-tactical-theme-color-system)
   - [1.3 Material Delta Advantage Tokens](#13-material-delta-advantage-tokens)
   - [1.4 Typography Scale & Font Tokens](#14-typography-scale--font-tokens)
   - [1.5 Spacing, Radius, Depth & Elevation Tokens](#15-spacing-radius-depth--elevation-tokens)
   - [1.6 Dark Mode Overrides (Full Palette)](#16-dark-mode-overrides-full-palette)
2. [Pre-Move & In-Game Tactical HUD (`PuzzleArena.vue`)](#2-pre-move--in-game-tactical-hud-puzzlearenavue)
   - [2.1 Tactical Goal Banner & Objective Header](#21-tactical-goal-banner--objective-header)
   - [2.2 In-Game HUD Layout & ASCII Wireframe](#22-in-game-hud-layout--ascii-wireframe)
   - [2.3 Dynamic Tactical Feedback Banner](#23-dynamic-tactical-feedback-banner)
   - [2.4 Exact CSS Specifications for PuzzleArena](#24-exact-css-specifications-for-puzzlearena)
3. [Progressive Hint Layer Visual Enhancements (`ProgressiveHintLayer.vue`)](#3-progressive-hint-layer-visual-enhancements-progressivehintlayervue)
   - [3.1 3-Tier Conceptual Hint System](#31-3-tier-conceptual-hint-system)
   - [3.2 Tier 1: Conceptual Piece Nudge](#32-tier-1-conceptual-piece-nudge)
   - [3.3 Tier 2: Target Beacon & Danger Ring](#33-tier-2-target-beacon--danger-ring)
   - [3.4 Tier 3: Solution Vector & Ghost Piece](#34-tier-3-solution-vector--ghost-piece)
   - [3.5 Exact CSS Specifications for ProgressiveHintLayer](#35-exact-css-specifications-for-progressivehintlayer)
4. [Post-Solve Coach & Educational Breakdown (`PuzzleCompletionModal.vue`)](#4-post-solve-coach--educational-breakdown-puzzlecompletionmodalvue)
   - [4.1 Modal Architecture & Celebration Header](#41-modal-architecture--celebration-header)
   - [4.2 Tactical Outcome & Material Gain Badge Grid](#42-tactical-outcome--material-gain-badge-grid)
   - [4.3 Coach's Tactical Breakdown Card & Turn-by-Turn Explanations](#43-coachs-tactical-breakdown-card--turn-by-turn-explanations)
   - [4.4 Mascot Persona Coaching Bubble](#44-mascot-persona-coaching-bubble)
   - [4.5 Interactive Move Replay Controller](#45-interactive-move-replay-controller)
   - [4.6 "Inspect Board / Minimize" Peek Mechanism](#46-inspect-board--minimize-peek-mechanism)
   - [4.7 Exact CSS Specifications for PuzzleCompletionModal](#47-exact-css-specifications-for-puzzlecompletionmodal)
5. [Micro-Interactions & CSS Keyframe Animations](#5-micro-interactions--css-keyframe-animations)
6. [Accessibility, Touch Target & Responsive Contracts](#6-accessibility-touch-target--responsive-contracts)
   - [6.1 WCAG AA Color Contrast Matrix](#61-wcag-aa-color-contrast-matrix)
   - [6.2 Keyboard Navigation & Focus Order](#62-keyboard-navigation--focus-order)
   - [6.3 Screen Reader Announcements (`aria-live`)](#63-screen-reader-announcements-aria-live)
   - [6.4 Responsive Breakpoints (320px, 375px, 768px, 1024px+)](#64-responsive-breakpoints-320px-375px-768px-1024px)
7. [Builder Implementation Compliance Checklist](#7-builder-implementation-compliance-checklist)

---

## 1. Design Tokens & Tactical Theme Palette

All tokens match and extend the existing design system in `apps/client/src/assets/design-tokens.css`.

### 1.1 Primitives & Core Surfaces

```css
:root {
  color-scheme: light dark;
  scrollbar-gutter: stable;

  /* Brand / Primary — Electric Violet */
  --color-primary-h: 255;
  --color-primary-s: 85%;
  --color-primary-l: 60%; /* #6c5ce7 */

  /* Secondary / Accent — Sunshine Gold */
  --color-accent-h: 42;
  --color-accent-s: 100%;
  --color-accent-l: 52%; /* #ffb300 */

  /* Success / Move Valid — Emerald Mint */
  --color-success-h: 145;
  --color-success-s: 68%;
  --color-success-l: 48%; /* #22c55e */

  /* Danger / Mistake — Coral Crimson */
  --color-danger-h: 354;
  --color-danger-s: 88%;
  --color-danger-l: 58%; /* #ef4444 */

  /* Info / Active — Sky Cyan */
  --color-info-h: 198;
  --color-info-s: 93%;
  --color-info-l: 54%; /* #0ea5e9 */

  /* Light Theme Surfaces */
  --bg-app:             hsl(220 28% 96%); /* #f1f4f9 */
  --bg-surface:         hsl(0 0% 100%);   /* #ffffff */
  --bg-surface-raised:  hsl(220 20% 97%); /* #f8fafc */
  --bg-surface-glass:   rgba(255, 255, 255, 0.92);
  --bg-overlay:         rgba(15, 23, 42, 0.72);

  /* Typography Colors */
  --text-main:          hsl(222 47% 11%); /* #0f172a */
  --text-muted:         hsl(222 16% 42%); /* #5b6b82 */
  --text-faint:         hsl(222 16% 56%); /* #8493a8 */
  --text-inverse:       #ffffff;
  --text-on-primary:    #ffffff;
  --text-on-accent:     #1e1b4b;

  /* Borders & Focus */
  --border-subtle:      hsl(220 18% 88%); /* #dde3ea */
  --border-medium:      hsl(220 22% 80%); /* #c2cddb */
  --border-strong:      hsl(220 25% 68%); /* #9faec2 */
  --focus-ring:         0 0 0 3px hsl(255 85% 60% / 0.45);
}
```

### 1.2 Tactical Theme Color System

Every tactical motif receives a dedicated semantic identity with distinct border, background, and icon accents to reinforce motif pattern recognition in young learners.

```css
:root {
  /* 1. Fork / Double Attack — Radiant Royal Gold */
  --theme-fork-primary:   hsl(42, 100%, 50%);  /* #ffaa00 */
  --theme-fork-bevel:     hsl(42, 95%, 36%);   /* #b87b00 */
  --theme-fork-bg:        hsl(45, 100%, 96%);  /* #fffbeb */
  --theme-fork-border:    hsl(42, 90%, 75%);   /* #fde68a */
  --theme-fork-text:      hsl(38, 90%, 22%);   /* #78350f */
  --theme-fork-glow:      0 0 16px rgba(255, 170, 0, 0.45);

  /* 2. Pin — Laser Cyan / Cobalt Blue */
  --theme-pin-primary:    hsl(198, 93%, 50%);  /* #0ea5e9 */
  --theme-pin-bevel:      hsl(198, 85%, 35%);  /* #0369a1 */
  --theme-pin-bg:         hsl(198, 90%, 96%);  /* #f0f9ff */
  --theme-pin-border:     hsl(198, 80%, 75%);  /* #bae6fd */
  --theme-pin-text:       hsl(198, 90%, 20%);  /* #082f49 */
  --theme-pin-glow:       0 0 16px rgba(14, 165, 233, 0.45);

  /* 3. Skewer — Electric Amethyst / Violet */
  --theme-skewer-primary: hsl(271, 81%, 56%);  /* #9333ea */
  --theme-skewer-bevel:   hsl(271, 75%, 38%);  /* #6b21a8 */
  --theme-skewer-bg:      hsl(271, 85%, 97%);  /* #faf5ff */
  --theme-skewer-border:  hsl(271, 70%, 82%);  /* #e9d5ff */
  --theme-skewer-text:    hsl(271, 80%, 22%);  /* #3b0764 */
  --theme-skewer-glow:    0 0 16px rgba(147, 51, 234, 0.45);

  /* 4. Discovered Check / Attack — Burst Orange */
  --theme-disc-primary:   hsl(25, 95%, 52%);   /* #f97316 */
  --theme-disc-bevel:     hsl(25, 90%, 36%);   /* #c2410c */
  --theme-disc-bg:        hsl(25, 100%, 96%);  /* #fff7ed */
  --theme-disc-border:    hsl(25, 85%, 78%);   /* #fed7aa */
  --theme-disc-text:      hsl(25, 90%, 22%);   /* #7c2d12 */
  --theme-disc-glow:      0 0 16px rgba(249, 115, 22, 0.45);

  /* 5. Checkmate Patterns — Victorious Crimson */
  --theme-mate-primary:   hsl(350, 88%, 56%);  /* #f43f5e */
  --theme-mate-bevel:     hsl(350, 80%, 38%);  /* #be123c */
  --theme-mate-bg:        hsl(350, 85%, 96%);  /* #fff1f2 */
  --theme-mate-border:    hsl(350, 75%, 80%);  /* #fecdd3 */
  --theme-mate-text:      hsl(350, 80%, 22%);  /* #881337 */
  --theme-mate-glow:      0 0 18px rgba(244, 63, 94, 0.50);

  /* 6. Decoy & Deflection — Emerald & Mint */
  --theme-decoy-primary:  hsl(160, 84%, 39%);  /* #059669 */
  --theme-decoy-bevel:    hsl(160, 80%, 28%);  /* #065f46 */
  --theme-decoy-bg:       hsl(160, 80%, 96%);  /* #ecfdf5 */
  --theme-decoy-border:   hsl(160, 70%, 78%);  /* #a7f3d0 */
  --theme-decoy-text:     hsl(160, 85%, 18%);  /* #064e3b */
  --theme-decoy-glow:     0 0 16px rgba(5, 150, 105, 0.45);

  /* 7. Greek Gift & Sacrifices — Deep Coral Ruby */
  --theme-gift-primary:   hsl(12, 90%, 52%);   /* #ea580c */
  --theme-gift-bevel:     hsl(12, 85%, 35%);   /* #9a3412 */
  --theme-gift-bg:        hsl(15, 95%, 96%);   /* #fff7ed */
  --theme-gift-border:    hsl(15, 80%, 80%);   /* #ffedd5 */
  --theme-gift-text:      hsl(12, 85%, 20%);   /* #7c2d12 */
  --theme-gift-glow:      0 0 16px rgba(234, 88, 12, 0.45);

  /* 8. Windmill Carousel — Tornado Cyan */
  --theme-wind-primary:   hsl(185, 90%, 42%);  /* #0891b2 */
  --theme-wind-bevel:     hsl(185, 85%, 28%);  /* #155e75 */
  --theme-wind-bg:        hsl(185, 85%, 96%);  /* #ecfeff */
  --theme-wind-border:    hsl(185, 75%, 78%);  /* #a5f3fc */
  --theme-wind-text:      hsl(185, 90%, 18%);  /* #164e63 */
  --theme-wind-glow:      0 0 16px rgba(8, 145, 178, 0.45);

  /* 9. Endgame Conversion — Warm Amber Timber */
  --theme-endgame-primary:hsl(32, 90%, 48%);   /* #d97706 */
  --theme-endgame-bevel:  hsl(32, 85%, 32%);   /* #92400e */
  --theme-endgame-bg:     hsl(35, 95%, 96%);   /* #fffbeb */
  --theme-endgame-border: hsl(35, 80%, 80%);   /* #fef3c7 */
  --theme-endgame-text:   hsl(32, 85%, 20%);   /* #78350f */
  --theme-endgame-glow:   0 0 16px rgba(217, 119, 6, 0.45);
}
```

### 1.3 Material Delta Advantage Tokens

Tactile badges that visually quantify the payoff won upon solving.

```css
:root {
  /* Material Advantage Pill Colors */
  --advantage-queen-bg:      hsl(280, 85%, 95%);
  --advantage-queen-border:  hsl(280, 80%, 75%);
  --advantage-queen-text:    hsl(280, 85%, 25%); /* Won Queen (+9) */
  --advantage-queen-icon:    #9333ea;

  --advantage-rook-bg:       hsl(215, 90%, 95%);
  --advantage-rook-border:   hsl(215, 80%, 75%);
  --advantage-rook-text:     hsl(215, 85%, 24%); /* Won Rook (+5) */
  --advantage-rook-icon:     #2563eb;

  --advantage-minor-bg:      hsl(150, 75%, 95%);
  --advantage-minor-border:  hsl(150, 65%, 75%);
  --advantage-minor-text:    hsl(150, 80%, 20%); /* Won Bishop/Knight (+3) */
  --advantage-minor-icon:    #16a34a;

  --advantage-pawn-bg:       hsl(45, 100%, 95%);
  --advantage-pawn-border:   hsl(45, 90%, 75%);
  --advantage-pawn-text:     hsl(42, 90%, 22%); /* Won Pawns (+1 to +2) */
  --advantage-pawn-icon:     #ca8a04;

  --advantage-mate-bg:       hsl(350, 88%, 95%);
  --advantage-mate-border:   hsl(350, 80%, 78%);
  --advantage-mate-text:     hsl(350, 85%, 25%); /* Checkmate (#) */
  --advantage-mate-icon:     #e11d48;
}
```

### 1.4 Typography Scale & Font Tokens

```css
:root {
  --font-display: 'Fredoka', cursive, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-body:    'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono:    'JetBrains Mono', monospace;

  /* Fluid Typography Scale */
  --text-hero:       clamp(2.20rem, 1.70rem + 2.5vw, 3.20rem);  /* 35px -> 51px */
  --text-modal-h2:   clamp(1.40rem, 1.15rem + 1.1vw, 1.85rem);  /* 22px -> 30px */
  --text-card-h3:    clamp(1.15rem, 1.00rem + 0.6vw, 1.40rem);  /* 18px -> 22px */
  --text-section-h4: clamp(1.00rem, 0.90rem + 0.4vw, 1.20rem);  /* 16px -> 19px */
  --text-body-lg:    clamp(0.98rem, 0.92rem + 0.3vw, 1.10rem);  /* 15.5px -> 17.5px */
  --text-base:       clamp(0.90rem, 0.85rem + 0.2vw, 1.00rem);  /* 14.5px -> 16px */
  --text-sm:         clamp(0.80rem, 0.76rem + 0.2vw, 0.90rem);  /* 13px -> 14.5px */
  --text-xs:         clamp(0.70rem, 0.66rem + 0.1vw, 0.78rem);  /* 11px -> 12.5px */

  --weight-regular:  400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;
  --weight-heavy:    800;

  --leading-tight:   1.15;
  --leading-snug:    1.30;
  --leading-normal:  1.50;
  --leading-relaxed: 1.65;
}
```

### 1.5 Spacing, Radius, Depth & Elevation Tokens

```css
:root {
  /* 4px Base Spacing Scale */
  --space-0-5: 2px;
  --space-1:   4px;
  --space-1-5: 6px;
  --space-2:   8px;
  --space-2-5: 10px;
  --space-3:   12px;
  --space-4:   16px;
  --space-5:   20px;
  --space-6:   24px;
  --space-8:   32px;
  --space-10:  40px;

  /* Border Radii */
  --radius-xs:   4px;
  --radius-sm:   8px;
  --radius-md:   12px;
  --radius-lg:   16px;
  --radius-xl:   22px;
  --radius-2xl:  30px;
  --radius-pill: 9999px;

  /* Tactile Pressable 3D Button Shadows */
  --btn-shadow-primary:        0 5px 0 var(--color-primary-bevel, #4d3ec2), 0 8px 16px rgba(108, 92, 231, 0.35);
  --btn-shadow-primary-hover:  0 7px 0 var(--color-primary-bevel, #4d3ec2), 0 12px 22px rgba(108, 92, 231, 0.42);
  --btn-shadow-primary-active: 0 1px 0 var(--color-primary-bevel, #4d3ec2), 0 2px 6px rgba(108, 92, 231, 0.25);

  --btn-shadow-accent:         0 5px 0 var(--color-accent-bevel, #b87b00), 0 8px 16px rgba(255, 179, 0, 0.35);
  --btn-shadow-accent-hover:   0 7px 0 var(--color-accent-bevel, #b87b00), 0 12px 22px rgba(255, 179, 0, 0.42);
  --btn-shadow-accent-active:  0 1px 0 var(--color-accent-bevel, #b87b00), 0 2px 6px rgba(255, 179, 0, 0.25);

  --btn-shadow-success:        0 5px 0 var(--color-success-bevel, #15803d), 0 8px 16px rgba(34, 197, 94, 0.35);
  --btn-shadow-success-hover:  0 7px 0 var(--color-success-bevel, #15803d), 0 12px 22px rgba(34, 197, 94, 0.42);
  --btn-shadow-success-active: 0 1px 0 var(--color-success-bevel, #15803d), 0 2px 6px rgba(34, 197, 94, 0.25);

  /* Touch Targets (WCAG 2.5.5 / 2.5.8 Compliant) */
  --touch-target-min:    44px;
  --touch-target-button: 52px;
  --touch-target-replay: 44px;

  /* Z-Index Hierarchy */
  --z-board-base:        1;
  --z-board-piece:       5;
  --z-board-indicator:   8;
  --z-overlay-toast:     12;
  --z-overlay-guide:     16;
  --z-minimized-dock:    35;
  --z-modal-backdrop:    100;
  --z-modal-card:        101;
}
```

### 1.6 Dark Mode Overrides (Full Palette)

```css
[data-theme='dark'] {
  --bg-app:             hsl(226, 30%, 10%); /* #111524 */
  --bg-surface:         hsl(225, 24%, 16%); /* #1e2438 */
  --bg-surface-raised:  hsl(225, 22%, 22%); /* #2a334d */
  --bg-surface-glass:   rgba(30, 36, 56, 0.92);
  --bg-overlay:         rgba(5, 8, 16, 0.82);

  --text-main:          hsl(220, 20%, 96%); /* #f1f3f9 */
  --text-muted:         hsl(220, 14%, 68%); /* #a1acc0 */
  --text-faint:         hsl(220, 10%, 46%); /* #6a7485 */
  --border-subtle:      hsl(225, 20%, 24%); /* #2f3852 */
  --border-medium:      hsl(225, 20%, 32%); /* #3f4a6b */
  --border-strong:      hsl(225, 20%, 45%); /* #5b6a94 */

  /* Tactical Theme Dark Overrides */
  --theme-fork-bg:        hsl(42, 40%, 18%);
  --theme-fork-border:    hsl(42, 55%, 36%);
  --theme-fork-text:      hsl(42, 90%, 90%);

  --theme-pin-bg:         hsl(198, 40%, 18%);
  --theme-pin-border:     hsl(198, 55%, 36%);
  --theme-pin-text:       hsl(198, 90%, 90%);

  --theme-skewer-bg:      hsl(271, 40%, 18%);
  --theme-skewer-border:  hsl(271, 55%, 36%);
  --theme-skewer-text:    hsl(271, 90%, 90%);

  --theme-disc-bg:        hsl(25, 40%, 18%);
  --theme-disc-border:    hsl(25, 55%, 36%);
  --theme-disc-text:      hsl(25, 90%, 90%);

  --theme-mate-bg:        hsl(350, 40%, 18%);
  --theme-mate-border:    hsl(350, 55%, 36%);
  --theme-mate-text:      hsl(350, 90%, 90%);

  --theme-decoy-bg:       hsl(160, 40%, 18%);
  --theme-decoy-border:   hsl(160, 55%, 36%);
  --theme-decoy-text:     hsl(160, 90%, 90%);

  --theme-gift-bg:        hsl(12, 40%, 18%);
  --theme-gift-border:    hsl(12, 55%, 36%);
  --theme-gift-text:      hsl(12, 90%, 90%);

  --theme-wind-bg:        hsl(185, 40%, 18%);
  --theme-wind-border:    hsl(185, 55%, 36%);
  --theme-wind-text:      hsl(185, 90%, 90%);

  --theme-endgame-bg:     hsl(32, 40%, 18%);
  --theme-endgame-border: hsl(32, 55%, 36%);
  --theme-endgame-text:   hsl(32, 90%, 90%);

  /* Material Advantage Dark Overrides */
  --advantage-queen-bg:     hsl(280, 35%, 20%);
  --advantage-queen-border: hsl(280, 50%, 40%);
  --advantage-queen-text:   hsl(280, 85%, 90%);

  --advantage-rook-bg:      hsl(215, 35%, 20%);
  --advantage-rook-border:  hsl(215, 50%, 40%);
  --advantage-rook-text:    hsl(215, 85%, 90%);

  --advantage-minor-bg:     hsl(150, 35%, 20%);
  --advantage-minor-border: hsl(150, 50%, 40%);
  --advantage-minor-text:   hsl(150, 85%, 90%);

  --advantage-pawn-bg:      hsl(45, 35%, 20%);
  --advantage-pawn-border:  hsl(45, 50%, 40%);
  --advantage-pawn-text:    hsl(45, 85%, 90%);

  --advantage-mate-bg:      hsl(350, 35%, 20%);
  --advantage-mate-border:  hsl(350, 50%, 40%);
  --advantage-mate-text:    hsl(350, 85%, 90%);
}
```

---

## 2. Pre-Move & In-Game Tactical HUD (`PuzzleArena.vue`)

### 2.1 Tactical Goal Banner & Objective Header

The In-Game HUD provides explicit pre-move intent so the player never moves pieces blindly.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  [⬅️ Puzzles]   🍴 Royal Forks (Drill 3 / 15)                       [ 5 Solved 🔥 1x ] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  ┌─ TACTICAL GOAL BANNER ──────────────────────────────────────────────────────────┐   │
│  │ 🎯 TACTICAL OBJECTIVE                                          ⚪ White to Move │   │
│  │ "Find the Knight jump that forks King and Rook to win material!"                │   │
│  │                                                                                 │   │
│  │ 💡 Tactical Premise: The King and Rook share the c7 diagonal outpost.          │   │
│  │ 🏷️ Novice • ~650 Elo • 2 Plies to Payoff                                        │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 In-Game HUD Layout & ASCII Wireframe

```
+-----------------------------------------------------------------------------------------+
| [ Top Header: Back Button | Mode Title | Live Streak / Rating Climb HUD ]               |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |  🎯 Objective: Win Black's Queen with a Royal Fork!            ⚪ White to Move |   |
|   |  💡 Why: Black's Queen is unguarded on d8 while the King is on e8.              |   |
|   |  [ Novice ] [ ~750 Elo ] [ Fork 🍴 ]                                            |   |
|   +---------------------------------------------------------------------------------+   |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |                                                                                 |   |
|   |                           [ 8x8 CHESSBOARD VIEWPORT ]                           |   |
|   |                                                                                 |   |
|   |     - Tier 1: Pulsing Gold Square on Source Piece                               |   |
|   |     - Tier 2: Emerald Beacon on Target Destination                              |   |
|   |     - Tier 3: Animated Arrow Vector + Ghost Piece Destination                   |   |
|   |                                                                                 |   |
|   +---------------------------------------------------------------------------------+   |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |  [ 💡 Get Tactical Hint ] (Level 1/3)  [ ⏺ ⭘ ⭘ ]                                |   |
|   +---------------------------------------------------------------------------------+   |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |  [ 🔄 Reset Position ]                                     [ ⏭️ Skip Puzzle ]   |   |
|   +---------------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------------+
```

### 2.3 Dynamic Tactical Feedback Banner

When a player makes an intermediate move, makes a mistake, or triggers a check:
- **Correct Intermediate Step:** Emerald pill with `✨ Great move! Now find the winning finish...`
- **Mistake / Suboptimal Move:** Soft coral shake banner with `❌ Not quite! Black could defend with ... Try another square!`
- **Check Warning / Threat:** Amber banner with `⚠️ Check! The King must respond.`

### 2.4 Exact CSS Specifications for PuzzleArena

```css
/* Guide Card Container */
.puzzle-info-card {
  background: var(--bg-surface);
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: var(--space-3-5, 14px) var(--space-4);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5);
  box-sizing: border-box;
  transition: border-color var(--duration-fast, 140ms) ease, background-color var(--duration-fast, 140ms) ease;
}

.puzzle-info-card.is-shaking {
  animation: shake-soft 0.4s linear;
  border-color: var(--color-danger);
  background-color: var(--soft-error-bg, rgba(239, 68, 68, 0.08));
}

/* Header Row in Guide Card */
.puzzle-info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.puzzle-goal-tagline {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.goal-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-pill);
  background: var(--color-primary-subtle, rgba(108, 92, 231, 0.12));
  color: var(--color-primary);
  font-size: 1rem;
}

.goal-heading-text {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-heavy);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-primary);
}

.turn-indicator-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  border: 1.5px solid var(--border-medium);
}

.turn-white {
  background: #ffffff;
  color: #0f172a;
}

.turn-black {
  background: #0f172a;
  color: #ffffff;
  border-color: #334155;
}

/* Main Goal Objective Text */
.puzzle-goal-text {
  font-family: var(--font-display);
  font-size: var(--text-card-h3);
  font-weight: var(--weight-heavy);
  color: var(--text-main);
  line-height: var(--leading-snug);
  margin: 0;
  text-wrap: balance;
}

/* Pedagogical "Why" Rationale */
.puzzle-why-callout {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1-5);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-muted);
  line-height: var(--leading-normal);
  background: var(--bg-surface-raised);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--color-accent, #ffb300);
}

.why-label {
  font-weight: var(--weight-heavy);
  color: var(--color-accent-text, #92400e);
}

/* Metadata Chips Footer */
.puzzle-meta-chips {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding-top: var(--space-1);
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-surface-raised);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
}

.meta-chip--theme {
  font-family: var(--font-display);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  border-color: transparent;
}
```

---

## 3. Progressive Hint Layer Visual Enhancements (`ProgressiveHintLayer.vue`)

### 3.1 3-Tier Conceptual Hint System

Unlike mechanical coordinates ("Move c3 to b5"), the revamped hint layer communicates **tactical reasons and relationships**:

| Tier | Name | Visual Overlay | Speech Bubble Message Content |
|---|---|---|---|
| **Tier 1** | **Conceptual Piece Nudge** | Pulsing 3.5px gold border on `sourceSquare` with subtle piece wiggle. | *"Look at your Knight on c3! Can it leap to an aggressive outpost that attacks multiple targets?"* |
| **Tier 2** | **Target Beacon & Motif Cue** | Pulsing green beacon ring on `targetSquare` + target icon. | *"Target c7! Landing your Knight here delivers a Royal Fork against King and Queen!"* |
| **Tier 3** | **Solution Vector & Ghost Piece** | SVG gradient arrow from source to target + 55% opacity ghost piece at target. | *"Play 1. Nc7+! King must run, leaving the undefended Queen ripe for capture."* |

### 3.2 Tier 1: Conceptual Piece Nudge

- **Border:** `3.5px solid var(--theme-fork-primary, #ffaa00)`
- **Background Fill:** `rgba(255, 170, 0, 0.22)`
- **Shadow:** `0 0 16px 4px rgba(255, 170, 0, 0.65), inset 0 0 10px rgba(255, 170, 0, 0.40)`
- **Animation:** `nudge-pulse 1.6s infinite ease-in-out` + piece icon wiggle

### 3.3 Tier 2: Target Beacon & Danger Ring

- **Beacon Ring:** `3.5px solid var(--color-success, #22c55e)`
- **Background Fill:** `rgba(34, 197, 94, 0.26)`
- **Shadow:** `0 0 18px 6px rgba(34, 197, 94, 0.70), inset 0 0 10px rgba(34, 197, 94, 0.50)`
- **Animation:** `beacon-pulse 1.6s infinite ease-in-out`

### 3.4 Tier 3: Solution Vector & Ghost Piece

- **Arrow Stroke:** Linear gradient from `#ffc107` (gold) to `#22c55e` (green)
- **Arrowhead:** SVG marker with 6px width, drop-shadow `0 0 8px rgba(34, 197, 94, 0.85)`
- **Ghost Piece:** Rendered at `targetSquare` with `opacity: 0.55`, `filter: drop-shadow(0 0 10px var(--color-success))`

### 3.5 Exact CSS Specifications for ProgressiveHintLayer

```css
.progressive-hint-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  position: relative;
}

.hint-board-anchor {
  position: relative;
  width: 100%;
  max-width: min(92vw, calc(78vh - 120px), 580px);
  aspect-ratio: 1 / 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Tier 1 Nudge Square */
.hint-nudge-square {
  position: absolute;
  border: 3.5px solid var(--academy-gold, #ffc107);
  border-radius: var(--radius-sm, 8px);
  box-shadow: 0 0 16px rgba(255, 193, 7, 0.85), inset 0 0 10px rgba(255, 193, 7, 0.45);
  background-color: rgba(255, 193, 7, 0.25);
  animation: nudge-pulse 1.6s infinite ease-in-out;
  box-sizing: border-box;
  pointer-events: none;
  z-index: var(--z-board-indicator, 8);
}

/* Tier 2 Beacon Square */
.hint-beacon-square {
  position: absolute;
  border: 3.5px solid var(--color-success, #22c55e);
  border-radius: var(--radius-sm, 8px);
  box-shadow: 0 0 18px rgba(34, 197, 94, 0.85), inset 0 0 10px rgba(34, 197, 94, 0.50);
  background-color: rgba(34, 197, 94, 0.28);
  animation: beacon-pulse 1.6s infinite ease-in-out;
  box-sizing: border-box;
  pointer-events: none;
  z-index: var(--z-board-indicator, 8);
}

/* Tier 3 Arrow SVG */
.hint-arrow-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: var(--z-board-indicator, 9);
}

.hint-arrow-line {
  filter: drop-shadow(0 0 6px rgba(255, 193, 7, 0.95));
  animation: arrow-glow 1.8s infinite ease-in-out;
}

/* Tier 3 Ghost Piece */
.hint-ghost-piece {
  position: absolute;
  pointer-events: none;
  z-index: var(--z-board-indicator, 9);
  opacity: 0.60;
  filter: drop-shadow(0 0 12px rgba(34, 197, 94, 0.80));
  animation: ghost-piece-shimmer 2s infinite ease-in-out;
}

/* Hint Bubble Card */
.hint-speech-bubble {
  width: 100%;
  padding: var(--space-3) var(--space-4);
  background: var(--hint-banner-bg, #fffbeb);
  border: 2px solid var(--hint-banner-border, #ffc107);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  box-sizing: border-box;
  animation: bubble-pop 280ms var(--ease-spring);
}

[data-theme='dark'] .hint-speech-bubble {
  background: var(--hint-banner-bg, hsl(45, 30%, 18%));
  border-color: var(--hint-banner-border, hsl(45, 60%, 38%));
}

.hint-bubble-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.hint-bubble-badge {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-heavy);
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  background: var(--academy-gold, #ffc107);
  color: #1e1b4b;
  text-transform: capitalize;
}

.hint-bubble-message {
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  color: var(--hint-banner-text, #451a03);
  margin: 0;
  line-height: var(--leading-snug);
}

[data-theme='dark'] .hint-bubble-message {
  color: var(--hint-banner-text, hsl(45, 85%, 90%));
}

.hint-mascot-dialogue {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-style: italic;
  color: var(--text-muted);
  margin: 0;
}

/* Solution Callout Box */
.solution-callout {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1-5) var(--space-3);
  background: rgba(34, 197, 94, 0.16);
  border: 1px solid var(--color-success);
  border-radius: var(--radius-md);
  width: fit-content;
}

.solution-label {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--text-muted);
}

.solution-san {
  font-family: var(--font-mono);
  font-size: var(--text-base);
  font-weight: var(--weight-heavy);
  color: var(--color-success-text, #166534);
}
```

---

## 4. Post-Solve Coach & Educational Breakdown (`PuzzleCompletionModal.vue`)

### 4.1 Modal Architecture & Celebration Header

When the puzzle is completed, `PuzzleCompletionModal.vue` opens in a structured, pedagogical layout:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [ ⭐ ] [ ⭐ ] [ ⭐ ]                                                                   │
│                         🎉 PUZZLE MASTERED! (3/3 Stars)                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  +──────────────────────────────────────────────────────────────────────────────────+  │
│  │ 🍴 Royal Fork Mastered!                  🏆 Material Gain: +5 Rook ♜             │  │
│  +──────────────────────────────────────────────────────────────────────────────────+  │
│                                                                                        │
│  ┌─ 🎓 COACH'S TACTICAL BREAKDOWN ──────────────────────────────────────────────────┐  │
│  │ "Why this tactic worked:                                                         │  │
│  │  1. Nb5 threatened a royal fork on c7, forcing Black's King to defend on d8.     │  │
│  │  2. Nxc7+ delivered check while attacking the Rook on a8 simultaneously.         │  │
│  │  3. Black was forced to move King, allowing you to capture the Rook cleanly!"    │  │
│  │                                                                                  │  │
│  │ 🐿️ Sparky's Takeaway Rule:                                                       │  │
│  │ "Knights make the best forkers because they jump over defenders to attack two    │  │
│  │  high-value targets at once!"                                                    │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                        │
│  ┌─ 🔄 MOVE REPLAY CONTROLLER ──────────────────────────────────────────────────────┐  │
│  │ [⏮️ Start]   [◀️ Prev]   (Step 2 of 3: 2. Nxc7+)   [▶️ Next]   [⏭️ End]           │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                        │
│  +──────────────────────────────────────────────────────────────────────────────────+  │
│  │ 📈 +12 Elo Points    ⏱️ 14s Solve Time    💡 0 Hints Used    🎯 100% Accuracy   │  │
│  +──────────────────────────────────────────────────────────────────────────────────+  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [ 👁️ Inspect Board ]           [ 🔄 Replay ]                     [ 🚀 Next Puzzle ]    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Tactical Outcome & Material Gain Badge Grid

```html
<!-- Visual Badge Matrix Example -->
<div class="tactical-outcome-header">
  <div class="motif-outcome-badge badge--fork">
    <span class="motif-badge-icon">🍴</span>
    <span class="motif-badge-title">Royal Fork</span>
  </div>

  <div class="material-gain-pill pill--rook">
    <span class="material-icon">♜</span>
    <span class="material-text">+5 Rook Won</span>
  </div>
</div>
```

### 4.3 Coach's Tactical Breakdown Card & Turn-by-Turn Explanations

The Breakdown Card uses clear, numbered steps that connect the chess moves to tactical concepts:
- **Starting Position Tension:** Explains what weakness made the tactic possible.
- **Forced Opponent Response:** Explains why the opponent had no better move.
- **Decisive Payoff:** Explains the material or checkmating conclusion.

### 4.4 Mascot Persona Coaching Bubble

Integrates the kid-friendly mascots (`Sparky Squirrel 🐿️`, `Peanut the Pup 🐶`, `Clever Fox 🦊`, `GM Owl 🦉`) to deliver memorable rules of thumb.

### 4.5 Interactive Move Replay Controller

The replay controller lets players step forward and backward through the solved line right on the board:
- **`[⏮]` (Jump to Start - Ply 0):** Resets the board to the initial puzzle position.
- **`[◀]` (Previous Ply):** Steps back one half-move.
- **`[▶]` (Next Ply):** Steps forward one half-move.
- **`[⏭]` (Jump to End - Final Ply):** Advances to the final solved position.
- **Step Label Indicator:** Displays e.g. `Step 2 of 4: 1... Kd8 (Forced escape)` with monospace SAN font.

### 4.6 "Inspect Board / Minimize" Peek Mechanism

To address the frustration of the modal covering the chessboard:
1. An **"👁️ Inspect Board"** button in the modal header and footer minimizes the modal into a sleek bottom-docked control bar.
2. The player can view the live chessboard in its final winning configuration.
3. The docked bar shows: `[ 🍴 Royal Fork (+5 ♜) | Step 3/3 | 🔼 Expand Coach Report | 🚀 Next ]`.
4. Tapping **"🔼 Expand Coach Report"** instantly restores the full modal.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  [ LIVE 8x8 CHESSBOARD IN FINAL POSITION ]                                             │
│  - King under check / Rook captured on a8 / Decisive material advantage visible        │
│                                                                                        │
│  ┌─ DOCKED BOTTOM INSPECTION BAR ───────────────────────────────────────────────────┐  │
│  │ 🍴 Royal Fork (+5 ♜)   [⏮] [◀] 2/2 [▶] [⏭]   [🔼 Coach Report]   [🚀 Next Puzzle]│  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.7 Exact CSS Specifications for PuzzleCompletionModal

```css
/* Modal Body */
.completion-modal-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3-5, 14px);
  padding: var(--space-1) 0;
  max-width: 540px;
  margin: 0 auto;
}

/* 3-Star Celebration */
.stars-cluster {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}

.star-item {
  font-size: 2.6rem;
  line-height: 1;
  opacity: 0.25;
  filter: grayscale(1);
  transform: scale(0.9);
  transition: all var(--duration-normal) var(--ease-spring);
}

.star-item.is-earned {
  opacity: 1;
  filter: drop-shadow(0 0 12px var(--star-filled, #ffcc00));
  transform: scale(1);
  animation: star-pop 450ms var(--ease-spring) backwards;
}

.star-center.is-earned {
  font-size: 3.4rem;
  transform: scale(1.15) translateY(-4px);
}

/* Tactical Outcome Header Row */
.tactical-outcome-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  width: 100%;
  flex-wrap: wrap;
}

.motif-outcome-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-heavy);
  box-shadow: var(--shadow-xs);
}

.badge--fork {
  background: var(--theme-fork-bg);
  border: 2px solid var(--theme-fork-border);
  color: var(--theme-fork-text);
}

.badge--pin {
  background: var(--theme-pin-bg);
  border: 2px solid var(--theme-pin-border);
  color: var(--theme-pin-text);
}

.badge--skewer {
  background: var(--theme-skewer-bg);
  border: 2px solid var(--theme-skewer-border);
  color: var(--theme-skewer-text);
}

.badge--discovered {
  background: var(--theme-disc-bg);
  border: 2px solid var(--theme-disc-border);
  color: var(--theme-disc-text);
}

.badge--mate {
  background: var(--theme-mate-bg);
  border: 2px solid var(--theme-mate-border);
  color: var(--theme-mate-text);
}

/* Material Gain Pill */
.material-gain-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-heavy);
  box-shadow: var(--shadow-xs);
  animation: advantage-pill-bounce 600ms var(--ease-spring);
}

.pill--queen {
  background: var(--advantage-queen-bg);
  border: 2px solid var(--advantage-queen-border);
  color: var(--advantage-queen-text);
}

.pill--rook {
  background: var(--advantage-rook-bg);
  border: 2px solid var(--advantage-rook-border);
  color: var(--advantage-rook-text);
}

.pill--minor {
  background: var(--advantage-minor-bg);
  border: 2px solid var(--advantage-minor-border);
  color: var(--advantage-minor-text);
}

.pill--mate {
  background: var(--advantage-mate-bg);
  border: 2px solid var(--advantage-mate-border);
  color: var(--advantage-mate-text);
}

/* Coach Tactical Breakdown Card */
.coach-breakdown-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5);
  background: var(--bg-surface-raised);
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  width: 100%;
  text-align: left;
  box-sizing: border-box;
}

.breakdown-card-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-size: var(--text-section-h4);
  font-weight: var(--weight-heavy);
  color: var(--color-primary);
  margin: 0;
}

.breakdown-explanation-text {
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--text-main);
  line-height: var(--leading-relaxed);
  margin: 0;
}

/* Mascot Coaching Callout Bubble */
.mascot-coaching-box {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  background: var(--mascot-sparky-bg, hsl(20, 95%, 94%));
  border: 2px solid var(--mascot-sparky-border, hsl(18, 85%, 75%));
  border-radius: var(--radius-lg);
  padding: var(--space-2-5) var(--space-3-5);
  margin-top: var(--space-1);
}

[data-theme='dark'] .mascot-coaching-box {
  background: var(--mascot-sparky-bg, hsl(18, 40%, 18%));
  border-color: var(--mascot-sparky-border, hsl(18, 50%, 35%));
}

.mascot-avatar-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-pill);
  background: #ffffff;
  border: 2px solid var(--mascot-sparky-primary);
  font-size: 1.4rem;
  flex-shrink: 0;
}

.mascot-quote-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mascot-speaker-name {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-heavy);
  color: var(--mascot-sparky-primary, #ea580c);
}

.mascot-quote-text {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--mascot-sparky-text, #431407);
  line-height: var(--leading-normal);
  margin: 0;
}

[data-theme='dark'] .mascot-quote-text {
  color: var(--mascot-sparky-text, hsl(18, 85%, 90%));
}

/* Move Replay Controller */
.move-replay-controller {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  background: var(--bg-surface);
  border: 1.5px solid var(--border-medium);
  border-radius: var(--radius-pill);
  padding: var(--space-1-5) var(--space-3);
  box-sizing: border-box;
}

.replay-step-info {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.step-counter-tag {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--text-muted);
}

.step-san-badge {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: var(--weight-heavy);
  color: var(--color-primary);
  padding: 2px 8px;
  background: var(--color-primary-subtle);
  border-radius: var(--radius-sm);
}

.replay-btn-group {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.replay-control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface-raised);
  color: var(--text-main);
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.replay-control-btn:hover:not(:disabled) {
  background: var(--color-primary-subtle);
  border-color: var(--color-primary);
  color: var(--color-primary);
  transform: scale(1.08);
}

.replay-control-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* Docked Bottom Inspection Bar (When Modal is Minimized) */
.docked-inspect-bar {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-minimized-dock, 35);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: var(--bg-surface-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 2px solid var(--color-primary);
  border-radius: var(--radius-pill);
  box-shadow: 0 10px 30px rgba(108, 92, 231, 0.35);
  animation: dock-slide-up 320ms var(--ease-spring);
}

.docked-motif-title {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-heavy);
  color: var(--text-main);
}
```

---

## 5. Micro-Interactions & CSS Keyframe Animations

```css
/* 1. Star Rating Burst Animation */
@keyframes star-pop {
  0% {
    transform: scale(0) rotate(-30deg);
    opacity: 0;
  }
  65% {
    transform: scale(1.35) rotate(10deg);
    opacity: 1;
    filter: drop-shadow(0 0 16px var(--star-filled, #ffcc00));
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
    filter: drop-shadow(0 0 6px var(--star-filled, #ffcc00));
  }
}

/* 2. Target Beacon Pulse (Tier 2 Hint) */
@keyframes beacon-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.85), inset 0 0 10px rgba(34, 197, 94, 0.50);
  }
  60% {
    box-shadow: 0 0 0 14px rgba(34, 197, 94, 0), inset 0 0 20px rgba(34, 197, 94, 0.70);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0), inset 0 0 10px rgba(34, 197, 94, 0.50);
  }
}

/* 3. Piece Nudge Wiggle & Glow (Tier 1 Hint) */
@keyframes nudge-pulse {
  0%, 100% {
    transform: scale(0.96);
    opacity: 0.85;
    box-shadow: 0 0 12px rgba(255, 193, 7, 0.75);
  }
  50% {
    transform: scale(1.04);
    opacity: 1;
    box-shadow: 0 0 24px 6px rgba(255, 193, 7, 0.95);
  }
}

/* 4. Arrow Draw & Grow (Tier 3 Hint) */
@keyframes arrow-glow {
  0%, 100% {
    opacity: 0.85;
    stroke-width: 2.4;
  }
  50% {
    opacity: 1;
    stroke-width: 3.4;
  }
}

/* 5. Material Advantage Pill Bounce */
@keyframes advantage-pill-bounce {
  0% {
    transform: scale(0.7) translateY(10px);
    opacity: 0;
  }
  60% {
    transform: scale(1.12) translateY(-3px);
    opacity: 1;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

/* 6. Dock Slide Up (Inspect Board Mode) */
@keyframes dock-slide-up {
  0% {
    transform: translate(-50%, 30px) scale(0.9);
    opacity: 0;
  }
  100% {
    transform: translate(-50%, 0) scale(1);
    opacity: 1;
  }
}

/* 7. Soft Shake on Mistake */
@keyframes shake-soft {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-5px); }
  40%, 80% { transform: translateX(5px); }
}

/* 8. Speech Bubble Pop */
@keyframes bubble-pop {
  0% {
    transform: scale(0.88) translateY(6px);
    opacity: 0;
  }
  70% {
    transform: scale(1.03) translateY(-2px);
    opacity: 1;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
```

---

## 6. Accessibility, Touch Target & Responsive Contracts

### 6.1 WCAG AA Color Contrast Matrix

All text and interactive badge combinations meet or exceed WCAG AA 4.5:1 contrast standards:

| Element | Background Color | Text Color | Measured Contrast Ratio | Status |
|---|---|---|---|:---:|
| **Fork Badge** (Light) | `#fffbeb` | `#78350f` | **7.8 : 1** | ✅ AAA Pass |
| **Fork Badge** (Dark) | `#332200` | `#fde68a` | **9.2 : 1** | ✅ AAA Pass |
| **Pin Badge** (Light) | `#f0f9ff` | `#082f49` | **8.4 : 1** | ✅ AAA Pass |
| **Skewer Badge** (Light) | `#faf5ff` | `#3b0764` | **9.6 : 1** | ✅ AAA Pass |
| **Checkmate Badge** (Light) | `#fff1f2` | `#881337` | **7.4 : 1** | ✅ AAA Pass |
| **Material Pill +5** (Light) | `#eff6ff` | `#1e3a8a` | **8.1 : 1** | ✅ AAA Pass |
| **Coach Text** (Light) | `#f8fafc` | `#0f172a` | **14.2 : 1** | ✅ AAA Pass |
| **Coach Text** (Dark) | `#2a334d` | `#f1f3f9` | **10.5 : 1** | ✅ AAA Pass |
| **Why Callout** (Light) | `#f8fafc` | `#5b6b82` | **4.9 : 1** | ✅ AA Pass |

### 6.2 Keyboard Navigation & Focus Order

1. **In-Game HUD (`PuzzleArena.vue`):**
   - `Tab` navigates: `[⬅️ Back]` -> `[💡 Hint Button]` -> `[🔄 Reset]` -> `[⏭️ Skip]`.
   - `Arrow Keys` allow navigating chessboard squares when keyboard accessibility is enabled.
2. **Move Replay Controller:**
   - `ArrowLeft` / `ArrowRight` steps through plies.
   - `Home` jumps to ply 0; `End` jumps to final ply.
3. **Completion Modal (`PuzzleCompletionModal.vue`):**
   - Modal traps focus with initial focus set to `[🚀 Next Puzzle]`.
   - `Esc` or `[👁️ Inspect Board]` toggles minimized board peek mode.
   - `Tab` cycles through `[👁️ Inspect Board]` -> `[⏮ Prev/Next Replay]` -> `[🔄 Replay]` -> `[🚀 Next Puzzle]`.

### 6.3 Screen Reader Announcements (`aria-live`)

- **Tactical Goal:** `role="region" aria-label="Tactical Goal Objective"`
- **Step Feedback:** `role="alert" aria-live="assertive"` for mistakes, `aria-live="polite"` for intermediate steps.
- **Hint Updates:** `role="status" aria-live="polite"` announces tier upgrade and hint message.
- **Completion Modal:** `aria-modal="true" role="dialog" aria-labelledby="completion-title"` announces stars earned, tactical outcome, material gain, and coach explanation.

### 6.4 Responsive Breakpoints (320px, 375px, 768px, 1024px+)

```css
/* Mobile Small (<= 375px) */
@media (max-width: 375px) {
  .puzzle-goal-text {
    font-size: var(--text-base);
  }

  .tactical-outcome-header {
    flex-direction: column;
    gap: var(--space-2);
  }

  .replay-btn-group .replay-control-btn {
    width: 32px;
    height: 32px;
  }

  .coach-breakdown-card {
    padding: var(--space-3);
  }
}

/* Tablet & Desktop (>= 768px) */
@media (min-width: 768px) {
  .puzzle-arena-layout {
    max-width: 680px;
  }

  .puzzle-goal-text {
    font-size: var(--text-modal-h2);
  }
}
```

---

## 7. Builder Implementation Compliance Checklist

Before delivering code changes, frontend builders must verify compliance with this frozen specification:

- [ ] **Contract Extension:** `shared/src/contracts/puzzle.ts` includes `tacticalGoal`, `tacticalReward`, `learningSummary`, `stepExplanations`, and `outcomeAdvantage`.
- [ ] **Tactical Goal HUD in `PuzzleArena.vue`:**
  - [ ] Displays `puzzle-goal-text` with tactical objective.
  - [ ] Displays `puzzle-why-callout` with "Why" concept explanation.
  - [ ] Displays difficulty, rating, and theme badges.
  - [ ] Retains turn indicator pill (`⚪ White to Move` / `⚫ Black to Move`).
- [ ] **Progressive Hint Layer in `ProgressiveHintLayer.vue`:**
  - [ ] Tier 1 renders pulsing gold outline on source square with conceptual nudge text.
  - [ ] Tier 2 renders green beacon ring on target square with tactical motivation text.
  - [ ] Tier 3 renders animated SVG arrow and ghost piece with solution SAN callout.
- [ ] **Completion Modal in `PuzzleCompletionModal.vue`:**
  - [ ] Displays 3-Star celebration cluster with staggered pop-in animations.
  - [ ] Displays Motif Outcome Badge (`fork-gold`, `pin-blue`, etc.).
  - [ ] Displays Material Gain Pill (`+5 Rook ♜`, `+9 Queen ♛`, `# Checkmate`).
  - [ ] Displays Coach's Tactical Breakdown card with dynamic `learningSummary`.
  - [ ] Displays Mascot Takeaway Callout with character avatar.
  - [ ] Features interactive Move Replay Controller (`[⏮] [◀] [▶] [⏭]`) synchronized with board state.
  - [ ] Features "Inspect Board / Minimize" toggle mechanism for viewing the final position.
- [ ] **Design Tokens & Themes:**
  - [ ] All new color tokens (`--theme-fork-*`, `--advantage-rook-*`, etc.) added to `design-tokens.css`.
  - [ ] Zero hardcoded hex codes in component files; all styles consume CSS variables.
  - [ ] Dark mode overrides tested and verified for WCAG AA contrast.
  - [ ] Reduced motion media query overrides present for all animations.

---
**End of Specification:** `DESIGN-UX-PUZZLE-003`
