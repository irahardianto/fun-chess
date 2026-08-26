# Zero-CLS Layout Stability & Visual Design Specification
## Frozen Design Contract for All Game Screens in Fun Chess Client

**Specification Identifier:** `DESIGN-UX-ZERO-CLS-001`  
**Document Target:** `.agentwork/design-ux.md`  
**Author:** `@ux-craftsman` (UI/UX Excellence Authority)  
**Target Workspace:** `apps/client/`  
**Status:** **FROZEN DESIGN CONTRACT** (Mandatory implementation reference for builders)  

---

## Executive Summary & Core Mandate

In interactive games like chess, **Cumulative Layout Shift (CLS) is a critical UX defect**. Any sudden vertical shift of the $8 \times 8$ board, piece coordinate grid, or action buttons when dialogues, hints, feedback messages, or connection warnings trigger causes:
1. **Misclicks & Accidental Move Dispatches:** Players clicking/tapping a square as an element renders can select the wrong square or blunder a piece.
2. **Visual Jarring & Cognitive Disruption:** Abrupt layout jumping disrupts focus during tactical calculation and time-scramble puzzle rush.
3. **Degraded Performance & Reflow Penalty:** Browser engine reflows across complex SVG piece trees during document-flow DOM mutations.

### The Zero-CLS Architectural Rule:
> **All transient visual feedback (speech bubbles, tactical hints, guide instructions, correctness toasts, disconnect alerts, and draw offers) MUST be rendered as non-displacing absolute floating overlays or fixed toasts.**  
> The underlying gameplay stage—including player HUD badges, captured piece trays, chessboard frames, and in-game toolbars—MUST maintain **$0\text{px}$ vertical displacement** throughout all dynamic state transitions.

---

## Table of Contents

1. [Z-Index Layering System & Elevation Architecture](#1-z-index-layering-system--elevation-architecture)
2. [Complete Design System Tokens & Color Palette](#2-complete-design-system-tokens--color-palette)
   - [2.1 Primitives (Light & Dark HSL Channels)](#21-primitives-light--dark-hsl-channels)
   - [2.2 Semantic Surface & Text Tokens](#22-semantic-surface--text-tokens)
   - [2.3 Elevation Shadows, Borders & Focus Rings](#23-elevation-shadows-borders--focus-rings)
   - [2.4 Dark Theme Overrides](#24-dark-theme-overrides)
3. [Typography Scale & Spacing System](#3-typography-scale--spacing-system)
   - [3.1 Google Fonts Configuration](#31-google-fonts-configuration)
   - [3.2 Fluid Typography Hierarchy](#32-fluid-typography-hierarchy)
   - [3.3 4px Base Spacing Grid](#33-4px-base-spacing-grid)
   - [3.4 Border Radius Hierarchy](#34-border-radius-hierarchy)
4. [Solo AI Arena Overlay Specifications](#4-solo-ai-arena-overlay-specifications)
   - [4.1 Mascot Speech Bubble (`.mascot-speech-bubble`)](#41-mascot-speech-bubble-mascot-speech-bubble)
   - [4.2 Active Hint Banner (`.active-hint-banner`)](#42-active-hint-banner-active-hint-banner)
5. [Academy / Scenario Arena Overlay Specifications](#5-academy--scenario-arena-overlay-specifications)
   - [5.1 Guide Feedback Banner (`.guide-feedback-banner`)](#51-guide-feedback-banner-guide-feedback-banner)
   - [5.2 Active Hint Bubble (`.guide-hint-bubble`)](#52-active-hint-bubble-guide-hint-bubble)
6. [Tactical Drills & Puzzle Arena Overlay Specifications](#6-tactical-drills--puzzle-arena-overlay-specifications)
   - [6.1 Puzzle Feedback Banner (`.puzzle-feedback-banner`)](#61-puzzle-feedback-banner-puzzle-feedback-banner)
   - [6.2 Benchmark Reference: `.rush-feedback-toast` Alignment](#62-benchmark-reference-rush-feedback-toast-alignment)
7. [LAN Multiplayer & App Shell Overlay Specifications](#7-lan-multiplayer--app-shell-overlay-specifications)
   - [7.1 Global Notification Banner (`.app-notification-banner`)](#71-global-notification-banner-app-notification-banner)
   - [7.2 Disconnect Warning Banner (`.disconnect-warning-banner`)](#72-disconnect-warning-banner-disconnect-warning-banner)
   - [7.3 Draw Offer Banner (`.draw-offer-banner`)](#73-draw-offer-banner-draw-offer-banner)
8. [Animation & Micro-Interaction Specifications](#8-animation--micro-interaction-specifications)
9. [Responsive Rules & Breakpoint Matrix (320px, 480px, 768px, 1280px)](#9-responsive-rules--breakpoint-matrix-320px-480px-768px-1280px)
10. [Base Component Visual Specs](#10-base-component-visual-specs)
11. [Frozen Design Contract Compliance Checklist for Builders](#11-frozen-design-contract-compliance-checklist-for-builders)

---

## 1. Z-Index Layering System & Elevation Architecture

To ensure overlays never collide, clip, or obscure critical interactive controls inappropriately, Fun Chess adopts a strict **8-tier z-index scale**.

```
+-------------------------------------------------------------------------------+
|                        Z-INDEX ELEVATION HIERARCHY                            |
|                                                                               |
|  [Tier 7: z-index: 100]  Global System Notifications (.app-notification-banner)|
|  ---------------------------------------------------------------------------  |
|  [Tier 6: z-index: 90]   Fixed App Navigation Header (.app-navbar)            |
|  ---------------------------------------------------------------------------  |
|  [Tier 5: z-index: 51]   Modal Dialog Content (PromotionModal, GameOverModal) |
|  [Tier 4: z-index: 50]   Modal Backdrops (.rush-game-over-overlay, BaseModal) |
|  ---------------------------------------------------------------------------  |
|  [Tier 3: z-index: 30]   In-Game Critical Alerts (Disconnect / Draw Offer)    |
|  ---------------------------------------------------------------------------  |
|  [Tier 2: z-index: 20]   Mascot Speech Bubbles & Floating Tactical Cards      |
|  ---------------------------------------------------------------------------  |
|  [Tier 1: z-index: 10]   In-Arena Floating Feedback Pills & Toasts            |
|  ---------------------------------------------------------------------------  |
|  [Tier 0: z-index: 1-5]  Base Board, Pieces, Highlights, HUD Trays, In-flow   |
+-------------------------------------------------------------------------------+
```

### 1.1 CSS Z-Index Custom Properties

Add these tokens to `:root` in `apps/client/src/assets/design-tokens.css`:

```css
:root {
  /* Z-Index Elevation Hierarchy */
  --z-base:                1;    /* Base chessboard grid, captured trays, in-flow cards */
  --z-board-indicators:    5;    /* Move arrows, valid move dots, check glows */
  --z-overlay-toast:       10;   /* Floating puzzle feedback pills (.rush-feedback-toast, .puzzle-feedback-banner) */
  --z-overlay-guide:       15;   /* Scenario feedback toast (.guide-feedback-banner) */
  --z-overlay-dialogue:    20;   /* Mascot speech bubble (.mascot-speech-bubble) & active hint (.active-hint-banner) */
  --z-overlay-alert:       30;   /* Disconnect warning (.disconnect-warning-banner), Draw offer (.draw-offer-banner) */
  --z-modal-backdrop:      50;   /* Modal backdrop masks */
  --z-modal-content:       51;   /* Modal dialogue cards & promotion pickers */
  --z-navbar:              90;   /* Top global navigation bar */
  --z-global-notification: 100;  /* System-wide toasts (.app-notification-banner) */
}
```

---

## 2. Complete Design System Tokens & Color Palette

All color tokens use HSL primitive channels with semantic mapping for full theme fidelity.

### 2.1 Primitives (Light & Dark HSL Channels)

```css
:root {
  color-scheme: light dark;

  /* Brand / Primary — Energetic Electric Violet */
  --color-primary-h: 255;
  --color-primary-s: 85%;
  --color-primary-l: 60%; /* #6c5ce7 */

  /* Secondary / Accent — Sunshine Gold */
  --color-accent-h: 42;
  --color-accent-s: 100%;
  --color-accent-l: 52%; /* #ffb300 */

  /* Success — Emerald Mint */
  --color-success-h: 145;
  --color-success-s: 68%;
  --color-success-l: 48%; /* #22c55e */

  /* Warning / Orange Flame */
  --color-warning-h: 25;
  --color-warning-s: 95%;
  --color-warning-l: 52%; /* #f97316 */

  /* Danger / Alert — Coral Crimson */
  --color-danger-h: 354;
  --color-danger-s: 88%;
  --color-danger-l: 58%; /* #ef4444 */

  /* Info / Active — Sky Cyan */
  --color-info-h: 198;
  --color-info-s: 93%;
  --color-info-l: 54%; /* #0ea5e9 */

  /* Light Theme Surface Primitives */
  --color-bg-h: 220;
  --color-bg-s: 28%;
  --color-bg-l: 96%; /* #f1f4f9 */

  --color-surface-h: 0;
  --color-surface-s: 0%;
  --color-surface-l: 100%; /* #ffffff */

  --color-text-h: 222;
  --color-text-s: 47%;
  --color-text-l: 11%; /* #0f172a */
}
```

### 2.2 Semantic Surface & Text Tokens

```css
:root {
  /* Surfaces & Glass Overlays */
  --bg-app:             hsl(var(--color-bg-h) var(--color-bg-s) var(--color-bg-l));
  --bg-surface:         hsl(var(--color-surface-h) var(--color-surface-s) var(--color-surface-l));
  --bg-surface-raised:  hsl(var(--color-surface-h) var(--color-surface-s) calc(var(--color-surface-l) - 3%));
  --bg-surface-glass:   rgba(255, 255, 255, 0.92);
  --bg-surface-glass-subtle: rgba(255, 255, 255, 0.78);
  --bg-overlay:         rgba(15, 23, 42, 0.68);

  /* Typography */
  --text-main:          hsl(var(--color-text-h) var(--color-text-s) var(--color-text-l));
  --text-muted:         hsl(var(--color-text-h) 16% 42%);
  --text-faint:         hsl(var(--color-text-h) 12% 64%);
  --text-inverse:       #ffffff;
  --text-on-primary:    #ffffff;
  --text-on-accent:     #1e1b4b;
  --text-on-danger:     #ffffff;
  --text-on-success:    #ffffff;

  /* Tactical Hint & Error Banners */
  --hint-banner-bg:         hsl(48, 100%, 96%);
  --hint-banner-border:     hsl(45, 95%, 55%);
  --hint-banner-text:       hsl(42, 90%, 22%);
  --hint-banner-glass:      rgba(254, 249, 195, 0.94);

  --soft-error-bg:          hsl(350, 90%, 96%);
  --soft-error-border:      hsl(350, 80%, 75%);
  --soft-error-text:        hsl(350, 75%, 32%);
  --soft-error-glass:       rgba(255, 241, 242, 0.94);

  --soft-success-bg:        hsl(145, 68%, 94%);
  --soft-success-border:    hsl(145, 68%, 60%);
  --soft-success-text:      hsl(145, 80%, 22%);
  --soft-success-glass:     rgba(240, 253, 244, 0.94);

  --soft-info-bg:           hsl(198, 90%, 95%);
  --soft-info-border:       hsl(198, 80%, 75%);
  --soft-info-text:         hsl(198, 90%, 25%);
  --soft-info-glass:        rgba(240, 249, 255, 0.94);
}
```

### 2.3 Elevation Shadows, Borders & Focus Rings

```css
:root {
  /* Borders */
  --border-subtle:        hsl(var(--color-bg-h) 18% 88%);
  --border-medium:        hsl(var(--color-bg-h) 22% 80%);
  --border-strong:        hsl(var(--color-bg-h) 25% 68%);
  --border-focus:         var(--color-primary);
  --focus-ring:           0 0 0 3px hsl(var(--color-primary-h) 85% 60% / 0.45);

  /* Shadows */
  --shadow-xs: 0 1px 3px rgba(15, 23, 42, 0.08);
  --shadow-sm: 0 2px 6px rgba(15, 23, 42, 0.09), 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-md: 0 6px 16px rgba(15, 23, 42, 0.10), 0 2px 6px rgba(15, 23, 42, 0.06);
  --shadow-lg: 0 12px 28px rgba(15, 23, 42, 0.14), 0 4px 10px rgba(15, 23, 42, 0.08);
  --shadow-xl: 0 20px 48px rgba(15, 23, 42, 0.20), 0 8px 16px rgba(15, 23, 42, 0.10);

  /* Glow Halos */
  --glow-hint-banner:  0 0 20px 4px rgba(255, 193, 7, 0.38), var(--shadow-lg);
  --glow-danger-toast: 0 0 18px 3px rgba(239, 68, 68, 0.35), var(--shadow-md);
  --glow-toast-toast:  0 6px 20px rgba(108, 92, 231, 0.25), var(--shadow-md);
}
```

### 2.4 Dark Theme Overrides

```css
[data-theme='dark'] {
  color-scheme: dark;

  --color-bg-h: 226;
  --color-bg-s: 30%;
  --color-bg-l: 10%; /* #111524 */

  --color-surface-h: 225;
  --color-surface-s: 24%;
  --color-surface-l: 16%; /* #1e2438 */

  --color-text-h: 220;
  --color-text-s: 20%;
  --color-text-l: 96%; /* #f1f3f9 */

  --bg-app:             hsl(226, 30%, 10%);
  --bg-surface:         hsl(225, 24%, 16%);
  --bg-surface-raised:  hsl(225, 22%, 22%);
  --bg-surface-glass:   rgba(30, 36, 56, 0.92);
  --bg-surface-glass-subtle: rgba(30, 36, 56, 0.80);
  --bg-overlay:         rgba(5, 8, 16, 0.82);

  --text-main:          hsl(220, 20%, 96%);
  --text-muted:         hsl(220, 14%, 68%);
  --text-faint:         hsl(220, 10%, 46%);

  --border-subtle:      hsl(225, 20%, 24%);
  --border-medium:      hsl(225, 20%, 32%);
  --border-strong:      hsl(225, 20%, 45%);

  --hint-banner-bg:     hsl(45, 30%, 18%);
  --hint-banner-border: hsl(45, 60%, 38%);
  --hint-banner-text:   hsl(45, 85%, 90%);
  --hint-banner-glass:  rgba(40, 32, 20, 0.94);

  --soft-error-bg:      hsl(350, 40%, 18%);
  --soft-error-border:  hsl(350, 50%, 35%);
  --soft-error-text:    hsl(350, 85%, 90%);
  --soft-error-glass:   rgba(45, 20, 25, 0.94);

  --soft-success-bg:    hsl(145, 40%, 18%);
  --soft-success-border:hsl(145, 50%, 35%);
  --soft-success-text:  hsl(145, 85%, 90%);
  --soft-success-glass: rgba(20, 45, 30, 0.94);

  --soft-info-bg:       hsl(198, 40%, 18%);
  --soft-info-border:   hsl(198, 50%, 35%);
  --soft-info-text:     hsl(198, 85%, 90%);
  --soft-info-glass:    rgba(20, 38, 50, 0.94);
}
```

---

## 3. Typography Scale & Spacing System

### 3.1 Google Fonts Configuration

- **Display & Headings:** `'Fredoka', cursive, sans-serif` (`500, 600, 700, 800`)
- **Body & Explanations:** `'Nunito', sans-serif` (`500, 600, 700, 800`)
- **Mono / Tabular Numbers:** `'JetBrains Mono', monospace` (`600, 700, 800`)

### 3.2 Fluid Typography Hierarchy

| Token | Clamp Value | Approx 375px | Approx 1280px | Line Height | Usage |
|---|---|---|---|---|---|
| `--text-hero` | `clamp(2.40rem, 1.80rem + 2.8vw, 3.40rem)` | 38px | 54px | `1.05` | Victory announcements |
| `--text-3xl` | `clamp(1.50rem, 1.25rem + 1.4vw, 2.10rem)` | 24px | 34px | `1.20` | Section H2, Modal Titles |
| `--text-2xl` | `clamp(1.30rem, 1.10rem + 0.9vw, 1.65rem)` | 21px | 26px | `1.30` | Arena sub-headers |
| `--text-xl` | `clamp(1.15rem, 1.00rem + 0.6vw, 1.35rem)` | 18px | 22px | `1.35` | Card titles, Dialog bodies |
| `--text-lg` | `clamp(1.05rem, 0.95rem + 0.4vw, 1.20rem)` | 17px | 19px | `1.40` | Active tactical hint text |
| `--text-base` | `clamp(0.95rem, 0.90rem + 0.2vw, 1.05rem)` | 15px | 17px | `1.50` | Default body, Mascot chat |
| `--text-sm` | `clamp(0.82rem, 0.78rem + 0.2vw, 0.92rem)` | 13px | 15px | `1.40` | Feedback toast pills, Subtitles |
| `--text-xs` | `clamp(0.70rem, 0.67rem + 0.1vw, 0.78rem)` | 11px | 12.5px| `1.20` | Badges, coordinates, tags |

### 3.3 4px Base Spacing Grid

```css
:root {
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
  --space-12:  48px;
  --space-16:  64px;
}
```

### 3.4 Border Radius Hierarchy

```css
:root {
  --radius-xs:   4px;   /* Tag indicators */
  --radius-sm:   8px;   /* Small pills */
  --radius-md:   12px;  /* Input fields, alert banners */
  --radius-lg:   16px;  /* Buttons, hint cards, board outer rim */
  --radius-xl:   22px;  /* Speech bubbles, modal cards */
  --radius-2xl:  30px;  /* Hero dialogs */
  --radius-pill: 9999px;/* Feedback toasts, turn pills */
}
```

---

## 4. Solo AI Arena Overlay Specifications

### 4.1 Mascot Speech Bubble (`.mascot-speech-bubble`)

- **Component:** `apps/client/src/features/ai/components/AiMascotBadge.vue`
- **Layout Shift Problem:** Rendering in normal flex flow expanded `.ai-mascot-badge-container` by $+54\text{px}$, causing the chessboard below to jump downward during speech banter.
- **Zero-CLS Solution:** Position `.mascot-speech-bubble` as an absolute overlay anchored to `.ai-mascot-badge-container`, with pointer tail pointing to the mascot avatar medallion.

```
+-------------------------------------------------------------------------------+
| [.ai-mascot-badge-container (position: relative; width: 100%;)]               |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   | [ 🐶 ]  Peanut ~800  [AI]                   ⚪ White      [ Ready ]   |   |
|   +-----------------------------------------------------------------------+   |
|         ▲                                                                     |
|       /   \ (Pointer Tail: top: -7px; left: 24px;)                            |
|   +-----------------------------------------------------------------------+   |
|   | 💬 "Woof! You found a sneaky fork! Great job!" (position: absolute;)  |   |
|   +-----------------------------------------------------------------------+   |
+-------------------------------------------------------------------------------+
```

#### Exact CSS Specification:

```css
/* Container Anchor */
.ai-mascot-badge-container {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
}

/* Absolute Floating Speech Bubble */
.mascot-speech-bubble {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: var(--z-overlay-dialogue, 20);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background-color: var(--bg-surface-glass);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-xl);
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  box-shadow: var(--shadow-md);
  margin-top: 0;
  pointer-events: auto;
}

/* Speech Bubble Tail */
.mascot-speech-bubble::before {
  content: '';
  position: absolute;
  top: -7px;
  left: 24px;
  width: 12px;
  height: 12px;
  background-color: var(--bg-surface);
  border-left: 2px solid var(--border-medium);
  border-top: 2px solid var(--border-medium);
  transform: rotate(45deg);
}

/* Transition Invariants */
.bubble-pop-enter-active {
  animation: bubble-pop 280ms var(--ease-spring);
}

.bubble-pop-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.bubble-pop-leave-to {
  opacity: 0;
  transform: scale(0.92) translateY(4px);
}
```

---

### 4.2 Active Hint Banner (`.active-hint-banner`)

- **Component:** `apps/client/src/features/ai/SoloAiArena.vue`
- **Layout Shift Problem:** Mounting between top opponent HUD and chessboard shifted the board downward by $+75\text{px}$ to $+95\text{px}$.
- **Zero-CLS Solution:** Position `.active-hint-banner` as an absolute floating card overlay anchored above the top edge of the board area, with glowing border and dismiss button.

```
+-------------------------------------------------------------------------------+
| [.arena-playfield (position: relative; width: 100%;)]                         |
|                                                                               |
|   [ Top Opponent HUD ]                                                        |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   | 💡 TACTICAL HINT                                                  [✕] |   |
|   | Look for your Knight on f3 jumping to e5 to attack the Queen!         |   |
|   | (position: absolute; top: 8px; z-index: 20; max-width: 540px;)       |   |
|   +-----------------------------------------------------------------------+   |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   |                                                                       |   |
|   |                           CHESS BOARD (8x8)                           |   |
|   |                       (0px Shift Guaranteed)                          |   |
|   |                                                                       |   |
|   +-----------------------------------------------------------------------+   |
+-------------------------------------------------------------------------------+
```

#### Exact CSS Specification:

```css
/* Arena Playfield Anchor */
.arena-playfield {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  gap: var(--space-2);
}

/* Absolute Floating Hint Card */
.active-hint-banner {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 24px);
  max-width: 540px;
  z-index: var(--z-overlay-dialogue, 20);
  display: flex;
  flex-direction: column;
  gap: 4px;
  background-color: var(--hint-banner-glass);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 2px solid var(--hint-banner-border);
  border-radius: var(--radius-lg);
  padding: var(--space-2-5) var(--space-4);
  box-shadow: var(--glow-hint-banner);
  box-sizing: border-box;
}

.hint-banner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hint-badge {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-heavy);
  color: var(--text-on-accent);
  background-color: var(--color-accent);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}

.hint-close-btn {
  background: transparent;
  border: none;
  font-size: var(--text-sm);
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.hint-close-btn:hover {
  background-color: rgba(0, 0, 0, 0.08);
}

.hint-banner-text {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  color: var(--hint-banner-text);
  line-height: var(--leading-snug);
  margin: 0;
}

/* Transition */
.hint-slide-enter-active,
.hint-slide-leave-active {
  transition: opacity var(--duration-fast) ease, transform var(--duration-fast) var(--ease-spring);
}

.hint-slide-enter-from,
.hint-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px) scale(0.95);
}

.hint-slide-enter-to,
.hint-slide-leave-from {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}
```

---

## 5. Academy / Scenario Arena Overlay Specifications

### 5.1 Guide Feedback Banner (`.guide-feedback-banner`)

- **Component:** `apps/client/src/features/scenarios/components/ScenarioGuideOverlay.vue`
- **Layout Shift Problem:** Mounting within `.scenario-guide-container` expanded guide card height by $+40\text{px}$, displacing `.arena-board-slot` downward while the user was executing interactive exercises.
- **Zero-CLS Solution:** Position `.guide-feedback-banner` as an absolute floating pill toast hovering at the bottom margin of the guide slot / top edge of the board frame.

#### Exact CSS Specification:

```css
/* Scenario Guide Container Anchor */
.scenario-guide-container {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background-color: var(--academy-step-bg);
  border: 2px solid var(--academy-step-border);
  border-radius: var(--radius-xl);
  padding: var(--space-4) var(--space-5);
  box-shadow: var(--shadow-sm);
  box-sizing: border-box;
}

/* Absolute Floating Feedback Toast */
.guide-feedback-banner {
  position: absolute;
  bottom: -16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-overlay-guide, 15);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 18px;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  box-shadow: var(--shadow-md);
  white-space: nowrap;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  pointer-events: none;
}

.guide-feedback-banner.is-positive {
  background-color: var(--soft-success-glass);
  color: var(--soft-success-text);
  border: 1.5px solid var(--soft-success-border);
}

.guide-feedback-banner.is-warning {
  background-color: var(--soft-error-glass);
  color: var(--soft-error-text);
  border: 1.5px solid var(--soft-error-border);
}
```

---

### 5.2 Active Hint Bubble (`.guide-hint-bubble`)

- **Component:** `apps/client/src/features/scenarios/components/ScenarioGuideOverlay.vue`
- **Layout Shift Problem:** When requested, the hint bubble pushed guide height by $+70\text{px}$.
- **Zero-CLS Solution:** Float `.guide-hint-bubble` as an absolute floating card anchored below the guide container, or within a non-shifting overlay layer over `.scenario-board-relative-frame`.

#### Exact CSS Specification:

```css
.guide-hint-bubble {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 24px);
  max-width: 540px;
  z-index: var(--z-overlay-dialogue, 20);
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  background: var(--hint-banner-glass);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 2px solid var(--hint-banner-border);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  color: var(--hint-banner-text);
  box-shadow: var(--glow-hint-banner);
  box-sizing: border-box;
}

.mascot-avatar-small {
  font-size: 1.5rem;
  line-height: 1;
}

.bubble-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bubble-speaker {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  color: var(--color-accent-bevel);
}

.bubble-text {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  margin: 0;
  line-height: var(--leading-normal);
}
```

---

## 6. Tactical Drills & Puzzle Arena Overlay Specifications

### 6.1 Puzzle Feedback Banner (`.puzzle-feedback-banner`)

- **Component:** `apps/client/src/features/puzzles/PuzzleArena.vue`
- **Layout Shift Problem:** Rendering inside `.puzzle-info-card` expanded the card by $+40\text{px}$ on incorrect moves, displacing `.arena-board-slot` downward.
- **Zero-CLS Solution:** Adopt the `PuzzleRushArena.vue` established pattern (`.rush-feedback-toast`) by making `.puzzle-feedback-banner` an absolute floating toast positioned at `top: -12px` over the board wrapper.

```
+-------------------------------------------------------------------------------+
| [.arena-board-slot (position: relative; width: 100%;)]                        |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   | 💬 Incorrect move. Try again! (position: absolute; top: -12px; z: 10) |   |
|   +-----------------------------------------------------------------------+   |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   |                         PUZZLE CHESS BOARD                            |   |
|   |                       (0px Shift Guaranteed)                          |   |
|   +-----------------------------------------------------------------------+   |
+-------------------------------------------------------------------------------+
```

#### Exact CSS Specification:

```css
/* Board Slot Anchor */
.arena-board-slot {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
}

/* Absolute Floating Feedback Pill */
.puzzle-feedback-banner {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-overlay-toast, 10);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 4px 16px;
  background-color: var(--bg-surface-glass);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 2px solid var(--color-danger);
  border-radius: var(--radius-pill);
  color: var(--color-danger);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 700;
  box-shadow: var(--shadow-md);
  white-space: nowrap;
  pointer-events: none;
}

.puzzle-feedback-banner .feedback-icon {
  font-size: 1rem;
}

.puzzle-feedback-banner .feedback-text {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 700;
}

/* Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s var(--ease-spring);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -6px) scale(0.94);
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}
```

---

### 6.2 Benchmark Reference: `.rush-feedback-toast` Alignment

In `apps/client/src/features/puzzles/components/PuzzleRushArena.vue`, `.rush-feedback-toast` is already structured with zero layout shift:
- `position: absolute; top: -12px; z-index: 10;`
- `background: var(--bg-surface); border: 2px solid var(--color-primary); border-radius: var(--radius-pill);`
- `padding: 4px 16px; font-family: var(--font-display); font-size: 14px; font-weight: 700;`

The specification for `PuzzleArena.vue` (`.puzzle-feedback-banner`) aligns with this exact benchmark standard.

---

## 7. LAN Multiplayer & App Shell Overlay Specifications

### 7.1 Global Notification Banner (`.app-notification-banner`)

- **Component:** `apps/client/src/App.vue`
- **Layout Shift Problem:** Rendered in normal document flow at the top of `.app-viewport`, shifting every page view (Lobby, Solo AI, Academy, Puzzles, Multiplayer) down by $+48\text{px}$ on display, and jumping back up on auto-dismiss.
- **Zero-CLS Solution:** Position `.app-notification-banner` as a **fixed floating toast** pinned `top: 68px` (just below the $56\text{px}$ fixed navbar + $12\text{px}$ spacing) with `z-index: 100`.

```
+-------------------------------------------------------------------------------+
| [ Fixed Global App Navbar: height: 56px; z-index: 90 ]                        |
+-------------------------------------------------------------------------------+
                                 ▼ 12px gap
        +---------------------------------------------------------------+
        | [⚠️] Draw offer sent to opponent! 🤝                      [✕] |
        | (position: fixed; top: 68px; left: 50%; z-index: 100;)        |
        +---------------------------------------------------------------+
                                 ▼
+-------------------------------------------------------------------------------+
| [.app-viewport (Main page content starts here — 0px Shift Guaranteed)]        |
|                                                                               |
|   [ Game Arena / Lobby / Academy Screen ]                                     |
+-------------------------------------------------------------------------------+
```

#### Exact CSS Specification:

```css
.app-notification-banner {
  position: fixed;
  top: 68px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-global-notification, 100);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: calc(100% - 32px);
  max-width: 580px;
  padding: var(--space-2-5) var(--space-4);
  border-radius: var(--radius-lg);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  box-shadow: var(--shadow-xl);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-sizing: border-box;
  margin-bottom: 0;
}

.app-notification-banner.is-error {
  background-color: var(--soft-error-glass);
  border: 1.5px solid var(--soft-error-border);
  color: var(--soft-error-text);
}

.app-notification-banner.is-info {
  background-color: var(--soft-info-glass);
  border: 1.5px solid var(--soft-info-border);
  color: var(--soft-info-text);
}

.app-notification-banner.is-success {
  background-color: var(--soft-success-glass);
  border: 1.5px solid var(--soft-success-border);
  color: var(--soft-success-text);
}

.notification-icon {
  font-size: 1.1rem;
  line-height: 1;
  flex-shrink: 0;
}

.notification-message {
  flex: 1 1 auto;
  text-align: left;
}

.notification-dismiss-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 0.9rem;
  color: inherit;
  opacity: 0.75;
  border-radius: var(--radius-xs);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: opacity var(--duration-fast);
}

.notification-dismiss-btn:hover {
  opacity: 1;
}

.notification-dismiss-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* Transition */
.notification-slide-enter-active,
.notification-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s var(--ease-spring);
}

.notification-slide-enter-from,
.notification-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, -14px) scale(0.96);
}

.notification-slide-enter-to,
.notification-slide-leave-from {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}
```

---

### 7.2 Disconnect Warning Banner (`.disconnect-warning-banner`)

- **Component:** `apps/client/src/App.vue`
- **Layout Shift Problem:** Rendered in flex flow inside `.game-arena-container`, shifting the entire match layout down by $+42\text{px}$.
- **Zero-CLS Solution:** Position as an absolute overlay banner at `top: 8px` with `z-index: 30`.

#### Exact CSS Specification:

```css
.game-arena-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 580px;
  gap: var(--space-2);
  box-sizing: border-box;
}

.disconnect-warning-banner {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-overlay-alert, 30);
  width: calc(100% - 16px);
  max-width: 560px;
  background-color: var(--color-danger);
  color: var(--text-on-danger);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  text-align: center;
  box-shadow: var(--glow-danger-toast);
  box-sizing: border-box;
  animation: pulse-valid-dot 1.5s infinite ease-in-out;
}
```

---

### 7.3 Draw Offer Banner (`.draw-offer-banner`)

- **Component:** `apps/client/src/App.vue`
- **Layout Shift Problem:** Rendered in flex flow with interactive buttons, shifting board and HUD down by $+56\text{px}$ during live play.
- **Zero-CLS Solution:** Position as an absolute floating card overlay at `top: 8px` with `z-index: 30`.

#### Exact CSS Specification:

```css
.draw-offer-banner {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-overlay-alert, 30);
  width: calc(100% - 16px);
  max-width: 560px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--bg-surface-glass);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 2px solid var(--color-accent);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  color: var(--text-main);
  box-shadow: var(--shadow-lg);
  box-sizing: border-box;
}

.banner-buttons {
  display: flex;
  gap: var(--space-2);
}
```

---

## 8. Animation & Micro-Interaction Specifications

All floating overlays utilize hardware-accelerated transforms and spring physics to create a delightful, non-jarring feel.

| Animation Name | Trigger Event | Keyframe Transformation | Duration & Easing |
|---|---|---|---|
| `bubble-pop` | Mascot banter dialogue reveals | `scale(0.85) translateY(6px)` $\to$ `scale(1.04) translateY(-2px)` $\to$ `scale(1) translateY(0)` | 280ms `var(--ease-spring)` |
| `hint-slide` | Tactical hint requested | `translate(-50%, -10px) scale(0.95)` $\to$ `translate(-50%, 0) scale(1)` | 240ms `var(--ease-spring)` |
| `notification-slide` | Global alert dispatched | `translate(-50%, -14px) scale(0.96)` $\to$ `translate(-50%, 0) scale(1)` | 250ms `var(--ease-spring)` |
| `banner-pop` | Disconnect / Draw offer alert | `translate(-50%, -8px) scale(0.95)` $\to$ `translate(-50%, 0) scale(1)` | 240ms `var(--ease-spring)` |
| `fade-pop` | Feedback pill display | `translate(-50%, -6px) scale(0.94)` $\to$ `translate(-50%, 0) scale(1)` | 200ms `var(--ease-spring)` |

### CSS Keyframes:

```css
@keyframes bubble-pop {
  0% {
    transform: scale(0.85) translateY(6px);
    opacity: 0;
  }
  70% {
    transform: scale(1.04) translateY(-2px);
    opacity: 1;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

@keyframes banner-pop {
  0% {
    opacity: 0;
    transform: translate(-50%, -8px) scale(0.95);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, 0) scale(1);
  }
}
```

---

## 9. Responsive Rules & Breakpoint Matrix (320px, 480px, 768px, 1280px)

Every overlay must adapt gracefully across device form factors while preserving complete layout stillness.

```
+---------------------------------------------------------------------------------------+
|                               RESPONSIVE OVERLAY MATRIX                               |
|                                                                                       |
|  Viewport:       320px (SE)     |  480px (Mobile)  |  768px (Tablet)  | 1280px (Desktop) |
|  -----------------------------------------------------------------------------------  |
|  Notification:   width: calc(100% - 16px); max-w: 304px | max-w: 440px | max-w: 580px |
|  Speech Bubble:  width: 100%; top: calc(100% + 4px); tail: left: 18px (left: 24px)   |
|  Hint Banner:    width: calc(100% - 16px); top: 6px     | width: calc(100% - 24px)    |
|  Feedback Toast: padding: 3px 12px; font-size: 12px     | padding: 4px 16px; 14px     |
+---------------------------------------------------------------------------------------+
```

### 9.1 Exact Responsive Breakpoint Rules

#### A. 320px Viewport (Ultra-Compact Phone / iPhone SE):
- `.app-notification-banner`: `width: calc(100% - 16px); top: 58px; padding: 6px 10px; font-size: var(--text-xs);`
- `.mascot-speech-bubble`: `width: 100%; padding: 6px 10px; font-size: var(--text-xs);` Tail offset: `left: 16px;`
- `.active-hint-banner`: `width: calc(100% - 12px); top: 4px; padding: 6px 10px; font-size: var(--text-xs);`
- `.guide-feedback-banner`, `.puzzle-feedback-banner`: `padding: 3px 10px; font-size: 11px;`
- `.disconnect-warning-banner`, `.draw-offer-banner`: `width: calc(100% - 12px); top: 4px; padding: 6px 10px; font-size: var(--text-xs);`

#### B. 480px Viewport (Standard & Large Smartphone):
- `.app-notification-banner`: `width: calc(100% - 24px); max-width: 440px; top: 64px; padding: 8px 14px; font-size: var(--text-sm);`
- `.mascot-speech-bubble`: `padding: 8px 14px; font-size: var(--text-sm);` Tail offset: `left: 22px;`
- `.active-hint-banner`: `width: calc(100% - 20px); max-width: 440px; top: 8px; padding: 8px 14px;`
- `.guide-feedback-banner`, `.puzzle-feedback-banner`: `padding: 4px 14px; font-size: var(--text-xs);`
- `.disconnect-warning-banner`, `.draw-offer-banner`: `width: calc(100% - 16px); max-width: 440px; top: 8px;`

#### C. 768px Viewport (Tablet / iPad Portrait):
- `.app-notification-banner`: `width: calc(100% - 32px); max-width: 540px; top: 68px; padding: 10px 16px; font-size: var(--text-sm);`
- `.active-hint-banner`: `max-width: 520px; top: 8px; padding: 10px 16px;`
- `.guide-feedback-banner`, `.puzzle-feedback-banner`: `padding: 5px 16px; font-size: var(--text-sm);`

#### D. 1280px Viewport (Desktop / Full Width Screen):
- All arenas capped at `max-width: 580px` (Solo AI, LAN Multiplayer) or `max-width: 960px` (Academy, Puzzles layout slot).
- Overlays maintain centered alignment (`left: 50%; transform: translateX(-50%);`) with max-width limits preventing oversized expansion.

---

## 10. Base Component Visual Specs

### 10.1 Tactile 3D Buttons (`BaseButton.vue`)

- **Primary Button:** `background: var(--color-primary); box-shadow: var(--shadow-btn-primary); border-radius: var(--radius-btn);`
  - Active press: `transform: translateY(3px); box-shadow: var(--shadow-btn-primary-active);`
- **Accent Button:** `background: var(--color-accent); box-shadow: var(--shadow-btn-accent); color: var(--text-on-accent);`
- **Ghost Button:** `background: transparent; border: 1.5px solid var(--border-medium); box-shadow: var(--shadow-btn-ghost);`
- **Minimum Tap Target:** `height: 44px; min-width: 44px;` (WCAG 2.1 AA requirement).

### 10.2 Cards & Containers (`BaseCard.vue`)

- `background: var(--bg-surface); border: 2px solid var(--border-subtle); border-radius: var(--radius-card); box-shadow: var(--shadow-sm);`
- Dark mode: `background: var(--bg-surface); border-color: var(--border-subtle);`

### 10.3 Modal Dialogs (`BaseModal.vue`)

- **Backdrop:** `position: fixed; inset: 0; background: var(--bg-overlay); backdrop-filter: blur(6px); z-index: var(--z-modal-backdrop);`
- **Card Content:** `position: relative; z-index: var(--z-modal-content); background: var(--bg-surface); border-radius: var(--radius-modal); box-shadow: var(--shadow-xl);`

---

## 11. Frozen Design Contract Compliance Checklist for Builders

Frontend builders implementing tickets **SC-1**, **SC-2**, **SC-3**, and **SC-4** MUST strictly adhere to the following invariants:

| Screen / Feature | Component File | Required Selector | Required Positioning | Z-Index Token | Data-TestID to Retain |
|---|---|---|---|---|---|
| **Solo AI** | `AiMascotBadge.vue` | `.mascot-speech-bubble` | `position: absolute; top: calc(100% + 4px);` | `--z-overlay-dialogue` (20) | `mascot-dialogue-bubble` |
| **Solo AI** | `SoloAiArena.vue` | `.active-hint-banner` | `position: absolute; top: 8px; left: 50%; transform: translateX(-50%);` | `--z-overlay-dialogue` (20) | `active-hint-banner` |
| **Academy** | `ScenarioGuideOverlay.vue` | `.guide-feedback-banner` | `position: absolute; bottom: -16px; left: 50%; transform: translateX(-50%);` | `--z-overlay-guide` (15) | (Any existing testids) |
| **Academy** | `ScenarioGuideOverlay.vue` | `.guide-hint-bubble` | `position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%);` | `--z-overlay-dialogue` (20) | (Any existing testids) |
| **Puzzles** | `PuzzleArena.vue` | `.puzzle-feedback-banner` | `position: absolute; top: -12px; left: 50%; transform: translateX(-50%);` | `--z-overlay-toast` (10) | `puzzle-feedback-banner` |
| **Shell** | `App.vue` | `.app-notification-banner` | `position: fixed; top: 68px; left: 50%; transform: translateX(-50%);` | `--z-global-notification` (100) | `app-notification-banner` |
| **Multiplayer**| `App.vue` | `.disconnect-warning-banner` | `position: absolute; top: 8px; left: 50%; transform: translateX(-50%);` | `--z-overlay-alert` (30) | (Any existing testids) |
| **Multiplayer**| `App.vue` | `.draw-offer-banner` | `position: absolute; top: 8px; left: 50%; transform: translateX(-50%);` | `--z-overlay-alert` (30) | (Any existing testids) |

### Non-Negotiable Contract Invariants:
1. **$0\text{px}$ Displacement:** Chessboard, player HUDs, captured piece trays, and action bars must have $0\text{px}$ movement when any transient overlay mounts or unmounts.
2. **DOM TestID Preservation:** All existing `data-testid` attributes (`mascot-dialogue-bubble`, `active-hint-banner`, `puzzle-feedback-banner`, `app-notification-banner`) must remain on their respective elements.
3. **No Hardcoded Hex in Components:** All styles must reference the design tokens defined in this specification (`var(--z-*)`, `var(--color-*)`, `var(--shadow-*)`, `var(--radius-*)`).

---

*This document is authored and frozen by `@ux-craftsman`. Changes require design review approval.*
