# Visual Design & UX Specification
## PWA Offline Experience, Device-Adaptive Install & Deflate-QR Progress Synchronization

**Specification Identifier:** `DESIGN-UX-PWA-SYNC-002`  
**Document Target:** `.agentwork/design-ux.md`  
**Author:** `@ux-craftsman` (UI/UX Excellence Authority)  
**Target Workspace:** `apps/client/`  
**Status:** **FROZEN DESIGN CONTRACT** (Mandatory implementation reference for frontend builders)  

---

## Executive Summary & Design Vision

Fun Chess is evolving into an installable, 100% kid-safe, zero-database Progressive Web Application (PWA). Players can play single-player puzzles, lessons in the Chess Academy, and matches against AI mascots completely offline without an internet connection or user account. Progress is seamlessly synchronized between devices (e.g., from a desktop computer to a tablet or smartphone) using compressed Version 12 QR codes (~560 bytes) and 1-click JSON files.

### Core UX Principles:
1. **Reassuring & Kid-Friendly Offline Experience:** Clear, non-intrusive status messaging that assures kids and parents that single-player features work 100% offline (e.g., in airplane mode or on road trips).
2. **Device-Adaptive PWA Installation:** Tailored, illustrated install guides for iOS Safari (3-step visual instructions), Android Chrome, and Desktop browsers.
3. **Frictionless QR Code Progress Sync:** High-contrast QR codes, an animated laser-reticle camera scanner, and drag-and-drop file import with a manual fallback.
4. **Transparent & Safe Conflict Resolution:** Side-by-side stats comparison card with prominent **Smart Merge (Recommended)** to ensure no progress is ever lost.
5. **Zero-CLS Layout Stability:** All floating indicators, banners, and modals render as isolated overlays with fixed anchors, preventing sudden jumps in the underlying chessboard or UI elements.

---

## Table of Contents

1. [Design Tokens & Color Palette](#1-design-tokens--color-palette)
   - [1.1 Primitives & Semantic Color Bridges](#11-primitives--semantic-color-bridges)
   - [1.2 PWA & Sync Specific Tokens](#12-pwa--sync-specific-tokens)
   - [1.3 Typography Scale & Font Tokens](#13-typography-scale--font-tokens)
   - [1.4 Spacing, Radius & Tactile Elevation](#14-spacing-radius--tactile-elevation)
   - [1.5 Z-Index Elevation Hierarchy](#15-z-index-elevation-hierarchy)
2. [Offline Indicator Component Specification (`OfflineIndicator.vue`)](#2-offline-indicator-component-specification-offlineindicatorvue)
   - [2.1 Visual States & Mascot Reassurance](#21-visual-states--mascot-reassurance)
   - [2.2 Layout & ASCII Wireframe](#22-layout--ascii-wireframe)
   - [2.3 Exact CSS Specification](#23-exact-css-specification)
3. [PWA Install Flow Specifications (`PwaInstallBanner.vue` & `PwaInstallModal.vue`)](#3-pwa-install-flow-specifications-pwainstallbannervue--pwainstallmodalvue)
   - [3.1 Kid-Friendly Install Banner (`PwaInstallBanner.vue`)](#31-kid-friendly-install-banner-pwainstallbannervue)
   - [3.2 Device-Adaptive Install Guide Modal (`PwaInstallModal.vue`)](#32-device-adaptive-install-guide-modal-pwainstallmodalvue)
   - [3.3 iOS Safari 3-Step Illustrated Guide](#33-ios-safari-3-step-illustrated-guide)
   - [3.4 Desktop & Android Native Prompt States](#34-desktop--android-native-prompt-states)
4. [Progress Sync 2-Tab Modal Specification (`ProgressSyncModal.vue`)](#4-progress-sync-2-tab-modal-specification-progresssyncmodalvue)
   - [4.1 Modal Header & Tab Switcher Architecture](#41-modal-header--tab-switcher-architecture)
   - [4.2 Tab 1: Export Progress (QR Canvas & JSON Download)](#42-tab-1-export-progress-qr-canvas--json-download)
   - [4.3 Tab 2: Import Progress (Drag-and-Drop Dropzone & Live Camera QR Scanner)](#43-tab-2-import-progress-drag-and-drop-dropzone--live-camera-qr-scanner)
   - [4.4 Glowing Laser Reticle Scanline & Camera Viewfinder](#44-glowing-laser-reticle-scanline--camera-viewfinder)
   - [4.5 Manual Text Fallback Drawer](#45-manual-text-fallback-drawer)
5. [Progress Conflict Resolution Modal (`ProgressConflictModal.vue`)](#5-progress-conflict-resolution-modal-progressconflictmodalvue)
   - [5.1 Side-by-Side Stat Comparison Card Matrix](#51-side-by-side-stat-comparison-card-matrix)
   - [5.2 Action Hierarchy: Smart Merge vs Overwrite vs Cancel](#52-action-hierarchy-smart-merge-vs-overwrite-vs-cancel)
   - [5.3 ASCII Layout & Visual Flow](#53-ascii-layout--visual-flow)
6. [Micro-Interactions & CSS Keyframe Animations](#6-micro-interactions--css-keyframe-animations)
7. [Accessibility, Touch Target & Responsive Contracts](#7-accessibility-touch-target--responsive-contracts)
8. [Builder Implementation Compliance Checklist](#8-builder-implementation-compliance-checklist)

---

## 1. Design Tokens & Color Palette

All tokens match and extend the existing `apps/client/src/assets/design-tokens.css` system.

### 1.1 Primitives & Semantic Color Bridges

```css
:root {
  /* Core Theme Colors */
  --bg-primary:         #0f0f1b; /* Deep Cosmic Navy (Default Dark/App Background) */
  --bg-surface:         #1e1e38; /* Elevated Card Surface */
  --bg-surface-raised:  #28284e; /* Raised Containers & Modals */
  --bg-surface-glass:   rgba(30, 30, 56, 0.90); /* Glassmorphism Overlay */
  --bg-overlay:         rgba(10, 10, 22, 0.75); /* Dimmed Modal Backdrop */

  /* Brand Accents */
  --accent-primary:       #7c3aed; /* Electric Purple Primary */
  --accent-primary-hover: #6d28d9;
  --accent-primary-bevel: #5b21b6;
  --accent-primary-glow:  rgba(124, 58, 237, 0.45);

  --accent-fun:           #f59e0b; /* Sunshine Gold / Gamification Accent */
  --accent-fun-hover:     #d97706;
  --accent-fun-bevel:     #b45309;
  --accent-fun-glow:      rgba(245, 158, 11, 0.45);

  /* Status Colors */
  --status-offline:       #f59e0b; /* Warm Amber Reassurance */
  --status-offline-bg:    rgba(245, 158, 11, 0.14);
  --status-offline-border:#f59e0b;
  --status-offline-text:  #fef3c7;

  --status-online:        #10b981; /* Emerald Green */
  --status-online-glow:   rgba(16, 185, 129, 0.40);

  --status-danger:        #ef4444; /* Coral Crimson */
  --status-danger-bg:     rgba(239, 68, 68, 0.15);

  /* Text Tokens */
  --text-primary:         #f8fafc; /* Crisp White/Slate */
  --text-secondary:       #94a3b8; /* Muted Slate */
  --text-faint:           #64748b; /* Faint Subtitles */
  --text-on-accent:       #ffffff;
  --text-on-gold:         #1e1b4b;

  /* Borders & Focus */
  --border-subtle:        rgba(255, 255, 255, 0.08);
  --border-medium:        rgba(255, 255, 255, 0.16);
  --border-strong:        rgba(255, 255, 255, 0.28);
  --focus-ring:           0 0 0 3px rgba(124, 58, 237, 0.50);
}

/* Light Theme Adaptations (When toggled via [data-theme='light'] or default light mode) */
:root:not([data-theme='dark']) {
  --bg-primary:         #f1f4f9;
  --bg-surface:         #ffffff;
  --bg-surface-raised:  #f8fafc;
  --bg-surface-glass:   rgba(255, 255, 255, 0.92);
  --bg-overlay:         rgba(15, 23, 42, 0.65);

  --text-primary:       #0f172a;
  --text-secondary:     #475569;
  --text-faint:         #94a3b8;

  --border-subtle:      #e2e8f0;
  --border-medium:      #cbd5e1;
  --border-strong:      #94a3b8;

  --status-offline-bg:  #fef3c7;
  --status-offline-border: #f59e0b;
  --status-offline-text:#78350f;
}

[data-theme='dark'] {
  --bg-primary:         #0f0f1b;
  --bg-surface:         #1e1e38;
  --bg-surface-raised:  #28284e;
  --bg-surface-glass:   rgba(30, 30, 56, 0.90);
  --bg-overlay:         rgba(10, 10, 22, 0.80);

  --text-primary:       #f8fafc;
  --text-secondary:     #94a3b8;
  --text-faint:         #64748b;

  --border-subtle:      rgba(255, 255, 255, 0.08);
  --border-medium:      rgba(255, 255, 255, 0.16);
  --border-strong:      rgba(255, 255, 255, 0.28);

  --status-offline-bg:  rgba(245, 158, 11, 0.16);
  --status-offline-border: #f59e0b;
  --status-offline-text:#fef3c7;
}
```

### 1.2 PWA & Sync Specific Tokens

```css
:root {
  /* QR Scanner Viewport & Laser */
  --qr-scanner-bg:          #000000;
  --qr-reticle-color:       #10b981; /* Emerald Laser */
  --qr-reticle-glow:        0 0 16px rgba(16, 185, 129, 0.85);
  --qr-laser-line:          linear-gradient(90deg, transparent, #10b981 30%, #34d399 50%, #10b981 70%, transparent);
  --qr-corner-border:       3px solid #10b981;

  /* Sync Conflict Stats Highlight */
  --stat-better-bg:         rgba(16, 185, 129, 0.18);
  --stat-better-border:     #10b981;
  --stat-better-text:       #34d399;
  --stat-better-badge:      #059669;

  --stat-neutral-bg:        rgba(148, 163, 184, 0.10);
  --stat-neutral-border:    rgba(148, 163, 184, 0.25);
  --stat-neutral-text:      #94a3b8;

  /* Drag & Drop File Zone */
  --dropzone-bg:            rgba(124, 58, 237, 0.06);
  --dropzone-bg-active:     rgba(124, 58, 237, 0.16);
  --dropzone-border:        2px dashed var(--accent-primary);
  --dropzone-border-active: 2px dashed #a78bfa;

  /* QR Version 12 Canvas Frame */
  --qr-canvas-bg:           #ffffff; /* Must remain pure white for optical barcode contrast */
  --qr-canvas-border:       4px solid #1e1e38;
  --qr-canvas-shadow:       0 8px 24px rgba(0, 0, 0, 0.25);
}
```

### 1.3 Typography Scale & Font Tokens

```css
:root {
  --font-display: 'Fredoka', cursive, -apple-system, sans-serif;
  --font-body:    'Nunito', -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono:    'JetBrains Mono', monospace;

  /* Typography Scale */
  --text-title-hero: clamp(1.80rem, 1.40rem + 1.8vw, 2.50rem);  /* 28px -> 40px */
  --text-modal-h2:   clamp(1.35rem, 1.15rem + 1.0vw, 1.75rem);  /* 22px -> 28px */
  --text-section-h3: clamp(1.15rem, 1.00rem + 0.6vw, 1.40rem);  /* 18px -> 22px */
  --text-card-h4:    clamp(1.00rem, 0.90rem + 0.4vw, 1.15rem);  /* 16px -> 18px */
  --text-body-lg:    clamp(0.95rem, 0.88rem + 0.3vw, 1.05rem);  /* 15px -> 17px */
  --text-body-base:  clamp(0.88rem, 0.82rem + 0.2vw, 0.95rem);  /* 14px -> 15.5px */
  --text-caption:    clamp(0.75rem, 0.70rem + 0.15vw, 0.82rem); /* 12px -> 13px */
  --text-code-chip:  clamp(0.70rem, 0.65rem + 0.1vw, 0.78rem);  /* 11px -> 12.5px */

  --weight-regular:  400;
  --weight-medium:   500;
  --weight-semibold: 600;
  --weight-bold:     700;
}
```

### 1.4 Spacing, Radius & Tactile Elevation

```css
:root {
  /* 4px Base Spacing */
  --space-1:   4px;
  --space-2:   8px;
  --space-3:   12px;
  --space-4:   16px;
  --space-5:   20px;
  --space-6:   24px;
  --space-8:   32px;
  --space-10:  40px;

  /* Border Radii */
  --radius-sm:   8px;
  --radius-md:   12px;
  --radius-lg:   16px;
  --radius-xl:   22px;
  --radius-2xl:  30px;
  --radius-pill: 9999px;

  /* Tactile 3D Button Shadows (Playful Pressable Depth) */
  --btn-shadow-primary:        0 5px 0 var(--accent-primary-bevel), 0 8px 18px rgba(124, 58, 237, 0.35);
  --btn-shadow-primary-hover:  0 7px 0 var(--accent-primary-bevel), 0 12px 24px rgba(124, 58, 237, 0.45);
  --btn-shadow-primary-active: 0 1px 0 var(--accent-primary-bevel), 0 2px 6px rgba(124, 58, 237, 0.25);

  --btn-shadow-fun:            0 5px 0 var(--accent-fun-bevel), 0 8px 18px rgba(245, 158, 11, 0.35);
  --btn-shadow-fun-hover:      0 7px 0 var(--accent-fun-bevel), 0 12px 24px rgba(245, 158, 11, 0.45);
  --btn-shadow-fun-active:     0 1px 0 var(--accent-fun-bevel), 0 2px 6px rgba(245, 158, 11, 0.25);

  --btn-shadow-success:        0 5px 0 #047857, 0 8px 18px rgba(16, 185, 129, 0.35);
  --btn-shadow-success-hover:  0 7px 0 #047857, 0 12px 24px rgba(16, 185, 129, 0.45);
  --btn-shadow-success-active: 0 1px 0 #047857, 0 2px 6px rgba(16, 185, 129, 0.25);

  --btn-shadow-ghost:          0 3px 0 var(--border-medium);
  --btn-shadow-ghost-hover:    0 5px 0 var(--border-strong);
  --btn-shadow-ghost-active:   0 1px 0 var(--border-medium);

  /* Touch Targets (WCAG 2.5.5 / 2.5.8 Compliant) */
  --touch-min:                 44px;
  --touch-btn-lg:              52px;
  --touch-tab:                 48px;
}
```

### 1.5 Z-Index Elevation Hierarchy

```css
:root {
  --z-base:                1;
  --z-floating-indicator:  40;  /* OfflineIndicator pill */
  --z-pwa-banner:          45;  /* PwaInstallBanner */
  --z-modal-backdrop:      100; /* Modal Backdrop */
  --z-modal-container:     101; /* Modal Container (BaseModal, ProgressSyncModal, ConflictModal) */
  --z-toast-notification:  150; /* Global Toasts */
}
```

---

## 2. Offline Indicator Component Specification (`OfflineIndicator.vue`)

### 2.1 Visual States & Mascot Reassurance

The `OfflineIndicator.vue` provides **reassurance rather than alarm**. When the player loses network connectivity (or starts the app in airplane mode), it displays an amber reassurance pill:
- **Collapsed/Compact Mode (Auto after 5s or on mobile):** `✈️ Offline Ready` (small badge in navbar header).
- **Expanded/Hero Floating Mode (On disconnect transition):** Floating rounded pill anchored at the top of the viewport with Peanut the Dog wearing aviator goggles and the reassurance message:  
  `"Playing 100% Offline! Puzzles, Academy & AI Bots work anywhere ✈️"`
- **Interaction:** Tapping the compact badge toggles the full reassurance banner. Tapping the dismiss button `[✕]` collapses it to the compact pill.

### 2.2 Layout & ASCII Wireframe

```
+-----------------------------------------------------------------------------------------+
| [ Top Global App Bar: height: 56px ]                                                    |
+-----------------------------------------------------------------------------------------+
                                      ▼ (top: 68px; floating zero-displacement)
      +-----------------------------------------------------------------------------+
      |  [ 🐶✈️ ]   Playing 100% Offline! Puzzles, Academy & AI Bots work anywhere!   [✕]  |
      +-----------------------------------------------------------------------------+
                                      ▼
+-----------------------------------------------------------------------------------------+
| [ Main Page Viewport - 0px Shift Guaranteed ]                                           |
|   - Tactical Puzzles                                                                    |
|   - Chess Academy Curriculum                                                            |
|   - Solo AI Mascots                                                                     |
+-----------------------------------------------------------------------------------------+
```

### 2.3 Exact CSS Specification

```css
/* Container: Floating zero-CLS overlay */
.offline-indicator-wrapper {
  position: fixed;
  top: 68px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-floating-indicator, 40);
  width: calc(100% - 32px);
  max-width: 580px;
  pointer-events: none; /* Allows clicks through empty surrounding area */
}

/* Floating Pill Card */
.offline-reassurance-pill {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2-5) var(--space-4);
  background-color: var(--bg-surface-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 2px solid var(--status-offline-border);
  border-radius: var(--radius-pill);
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.28), 0 2px 6px rgba(0, 0, 0, 0.15);
  box-sizing: border-box;
  animation: float-pill-in 360ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.offline-avatar-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-pill);
  background-color: var(--status-offline-bg);
  border: 1.5px solid var(--status-offline);
  font-size: 1.35rem;
  flex-shrink: 0;
}

.offline-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.offline-headline {
  font-family: var(--font-display);
  font-size: var(--text-body-base);
  font-weight: var(--weight-bold);
  color: var(--status-offline-text);
  line-height: 1.2;
}

.offline-subtext {
  font-family: var(--font-body);
  font-size: var(--text-caption);
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
  line-height: 1.3;
}

.offline-dismiss-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-width: 32px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: all 140ms ease;
}

.offline-dismiss-btn:hover {
  background-color: var(--status-offline-bg);
  color: var(--status-offline-text);
  transform: scale(1.1);
}

/* Compact Chip (Shown in Navbar when collapsed) */
.offline-compact-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background-color: var(--status-offline-bg);
  border: 1.5px solid var(--status-offline);
  color: var(--status-offline-text);
  font-family: var(--font-display);
  font-size: var(--text-code-chip);
  font-weight: var(--weight-bold);
  cursor: pointer;
  transition: all 140ms ease;
}

.offline-compact-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.30);
}
```

---

## 3. PWA Install Flow Specifications (`PwaInstallBanner.vue` & `PwaInstallModal.vue`)

### 3.1 Kid-Friendly Install Banner (`PwaInstallBanner.vue`)

- **Placement:** Bottom-docked floating banner hovering $16\text{px}$ above the bottom viewport edge, or integrated into the Lobby header.
- **Trigger:** Shown when `usePwaInstall()` detects the app is installable and the user has not dismissed the prompt within the last 7 days.
- **Copy:**
  - Icon: `🎮 ✨`
  - Title: **"Install Fun Chess on your Device!"**
  - Subtitle: **"Play anywhere, even without Wi-Fi or internet!"**
  - Actions: Primary **"Install App 🚀"** (Tactile Fun Button) + Ghost **"Maybe Later"** (Dismiss).

```
+-----------------------------------------------------------------------------------------+
| [ 🎮✨ ]  Install Fun Chess on your Device!                                              |
|           Play anywhere, even without Wi-Fi or internet!                                |
|                                              [ Maybe Later ]   [ Install App 🚀 ]       |
+-----------------------------------------------------------------------------------------+
```

### 3.2 Device-Adaptive Install Guide Modal (`PwaInstallModal.vue`)

When the user clicks "Install App" on platforms that do not allow direct programmatic install triggers (specifically **iOS Safari** and certain mobile browsers), `PwaInstallModal.vue` opens with an illustrated step-by-step guide.

### 3.3 iOS Safari 3-Step Illustrated Guide

For iOS Safari (`/iPhone|iPad|iPod/.test(navigator.userAgent)`):

```
+-----------------------------------------------------------------------------------------+
|                               Install Fun Chess on iOS 🍎                                |
|          Follow these 3 easy steps to play offline on your Home Screen!                 |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |  Step 1: Tap the Share Button                                                   |   |
|   |  [ ⎋ ] Tap the Share icon located at the bottom of Safari.                     |   |
|   +---------------------------------------------------------------------------------+   |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |  Step 2: Scroll & Tap "Add to Home Screen"                                      |   |
|   |  [ ➕ ] Scroll down the menu options and tap "Add to Home Screen".              |   |
|   +---------------------------------------------------------------------------------+   |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |  Step 3: Tap "Add" in the Top Right Corner                                      |   |
|   |  [ ✅ ] Tap "Add" to complete installation. You're ready to play offline! 🎉     |   |
|   +---------------------------------------------------------------------------------+   |
|                                                                                         |
|                                     [ Got it, Let's Play! ♟️ ]                           |
+-----------------------------------------------------------------------------------------+
```

#### Step Card CSS:

```css
.ios-step-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: var(--space-4) 0;
}

.ios-step-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background-color: var(--bg-surface-raised);
  border: 1.5px solid var(--border-medium);
  border-radius: var(--radius-lg);
  transition: transform 180ms ease, border-color 180ms ease;
}

.ios-step-card:hover {
  transform: translateX(4px);
  border-color: var(--accent-primary);
}

.step-number-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-pill);
  background: var(--accent-primary);
  color: #ffffff;
  font-family: var(--font-display);
  font-size: var(--text-body-base);
  font-weight: var(--weight-bold);
  flex-shrink: 0;
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-title {
  font-family: var(--font-display);
  font-size: var(--text-card-h4);
  font-weight: var(--weight-bold);
  color: var(--text-primary);
}

.step-desc {
  font-family: var(--font-body);
  font-size: var(--text-body-base);
  color: var(--text-secondary);
  line-height: 1.4;
}

.step-icon-highlight {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  font-family: var(--font-mono);
  font-weight: bold;
  color: var(--accent-fun);
}
```

### 3.4 Desktop & Android Native Prompt States

- **Desktop (Chrome/Edge):** The modal provides a 1-click **"Install Fun Chess"** button that invokes `beforeinstallprompt.prompt()`, alongside an illustration showing the install icon `[ ⊕ ]` in the browser address bar.
- **Android:** Native prompt invoked directly on button click, with a secondary tip explaining Chrome Menu `[ ⋮ ]` -> "Add to Home screen".

---

## 4. Progress Sync 2-Tab Modal Specification (`ProgressSyncModal.vue`)

### 4.1 Modal Header & Tab Switcher Architecture

- **Trigger:** Accessible from the top navbar button (`🔄 Sync`) or Lobby settings card.
- **Size:** `BaseModal size="lg"` (680px max width).
- **Header:**
  - Title: **"Sync Progress Across Devices 🔄✨"**
  - Subtitle: **"Transfer your stars, ratings, and solved puzzles with Zero Accounts!"**
- **2-Tab Switcher:**
  1. `Export Tab 📤`: Generate high-density QR code + download `funchess-save.json`.
  2. `Import Tab 📥`: Scan QR via camera viewfinder + drag-and-drop file upload.

```
+-----------------------------------------------------------------------------------------+
| [ 🔄 ]  Sync Progress Across Devices                                               [✕]  |
|         Transfer your stars, ratings, and solved puzzles with Zero Accounts!            |
+-----------------------------------------------------------------------------------------+
|   [  📤 Export Progress  (Active)  ]      [  📥 Import Progress  (Inactive)  ]          |
+-----------------------------------------------------------------------------------------+
```

#### Tab Bar CSS:

```css
.sync-tab-bar {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  background-color: var(--bg-primary);
  padding: var(--space-1);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-subtle);
  margin-bottom: var(--space-5);
}

.sync-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--touch-tab, 48px);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-lg);
  border: none;
  background: transparent;
  font-family: var(--font-display);
  font-size: var(--text-card-h4);
  font-weight: var(--weight-bold);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 180ms ease;
}

.sync-tab-btn:hover {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.04);
}

.sync-tab-btn.is-active {
  background-color: var(--accent-primary);
  color: #ffffff;
  box-shadow: 0 4px 14px var(--accent-primary-glow);
}
```

---

### 4.2 Tab 1: Export Progress (QR Canvas & JSON Download)

The Export Tab renders a compact Version 12 QR Code (~560B) containing the full Deflate-compressed progress payload, accompanied by a 1-click JSON file download button.

```
+-----------------------------------------------------------------------------------------+
|                                     EXPORT TAB 📤                                       |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |                          [ HIGH CONTRAST QR CODE CANVAS ]                       |   |
|   |                                                                                 |   |
|   |                                  ▄▄▄▄▄ █▀▄ ▄▄▄▄▄                                |   |
|   |                                  █   █ █ █ █   █                                |   |
|   |                                  █▄▄▄█ █▀█ █▄▄▄█                                |   |
|   |                                  ▄▄ ▄▄ ▄▀▄ ▄▄ ▄▄                                |   |
|   |                                  █▄▄▄█ ▀▄▀ █▄▄▄█                                |   |
|   |                                                                                 |   |
|   |                               (QR Version 12 - 560B)                            |   |
|   +---------------------------------------------------------------------------------+   |
|                                                                                         |
|   📱 Instructions: Open Fun Chess on your other device, go to "Import", and scan!       |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |  [ 💾 Download funchess-save.json (1-Click Backup) ]                            |   |
|   |  [ 📋 Copy QR Code Text / Data ]                                                |   |
|   +---------------------------------------------------------------------------------+   |
|                                                                                         |
|   ℹ️ Stats summary: 48 ⭐ Stars • 1150 🎯 Elo • 72 🧩 Puzzles Solved                    |
+-----------------------------------------------------------------------------------------+
```

#### QR Frame CSS:

```css
.qr-export-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  text-align: center;
}

.qr-canvas-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background-color: #ffffff; /* Must remain white for scan contrast */
  border-radius: var(--radius-xl);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  border: 4px solid var(--accent-primary);
}

.qr-canvas-element {
  display: block;
  width: 240px;
  height: 240px;
  border-radius: calc(var(--radius-xl) - 12px);
}

.export-actions-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5);
  width: 100%;
  max-width: 420px;
}

.stats-preview-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 6px 14px;
  background-color: var(--bg-surface-raised);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: var(--text-caption);
  color: var(--text-secondary);
}
```

---

### 4.3 Tab 2: Import Progress (Drag-and-Drop Dropzone & Live Camera QR Scanner)

The Import Tab offers two intuitive ways to load saved data:
1. **Live Camera QR Viewport** (primary for mobile/tablet cross-device sync).
2. **Drag & Drop JSON Dropzone** (primary for desktop/backup file restore).

```
+-----------------------------------------------------------------------------------------+
|                                     IMPORT TAB 📥                                       |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   | [ LIVE CAMERA VIEWPORT ]                                                        |   |
|   | ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  |   |
|   | │  ╔══════════════════════════════════════════════════════════════════════╗    │  |   |
|   | │  ║  [ Laser Scanline Sweeping Downward ═════════════════════════════]  ║    │  |   |
|   | │  ║                                                                      ║    │  |   |
|   | │  ║                 Point camera at QR code on other screen              ║    │  |   |
|   | │  ║                                                                      ║    │  |   |
|   | │  ╚══════════════════════════════════════════════════════════════════════╝    │  |   |
|   | └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  |   |
|   +---------------------------------------------------------------------------------+   |
|                                                                                         |
|                                        — OR —                                           |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   | 📁 DRAG & DROP SAVE FILE HERE (.json)                                           |   |
|   |    or [ Browse File 📂 ]                                                        |   |
|   +---------------------------------------------------------------------------------+   |
|                                                                                         |
|   [ ▼ Paste Code / Manual Text Fallback ]                                               |
+-----------------------------------------------------------------------------------------+
```

---

### 4.4 Glowing Laser Reticle Scanline & Camera Viewfinder

#### Viewfinder & Laser CSS:

```css
.scanner-viewport-card {
  position: relative;
  width: 100%;
  max-width: 380px;
  height: 280px;
  background-color: var(--qr-scanner-bg, #000000);
  border-radius: var(--radius-xl);
  overflow: hidden;
  margin: 0 auto;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.40);
  border: 2px solid var(--border-medium);
}

.scanner-video-feed {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 4-Corner Reticle Overlay */
.scanner-reticle-overlay {
  position: absolute;
  inset: 24px;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reticle-corner {
  position: absolute;
  width: 28px;
  height: 28px;
  border-color: var(--qr-reticle-color, #10b981);
}

.reticle-corner.top-left {
  top: 0;
  left: 0;
  border-top: 3px solid var(--qr-reticle-color);
  border-left: 3px solid var(--qr-reticle-color);
  border-top-left-radius: 8px;
}

.reticle-corner.top-right {
  top: 0;
  right: 0;
  border-top: 3px solid var(--qr-reticle-color);
  border-right: 3px solid var(--qr-reticle-color);
  border-top-right-radius: 8px;
}

.reticle-corner.bottom-left {
  bottom: 0;
  left: 0;
  border-bottom: 3px solid var(--qr-reticle-color);
  border-left: 3px solid var(--qr-reticle-color);
  border-bottom-left-radius: 8px;
}

.reticle-corner.bottom-right {
  bottom: 0;
  right: 0;
  border-bottom: 3px solid var(--qr-reticle-color);
  border-right: 3px solid var(--qr-reticle-color);
  border-bottom-right-radius: 8px;
}

/* Sweeping Glowing Laser Scanline */
.scanner-laser-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--qr-laser-line);
  box-shadow: 0 0 12px 3px rgba(16, 185, 129, 0.90);
  animation: laser-sweep 2.2s ease-in-out infinite alternate;
}

/* Camera Permission / Error Fallback inside Viewport */
.scanner-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: var(--space-4);
  text-align: center;
  color: var(--text-secondary);
  gap: var(--space-2);
}

.scanner-empty-icon {
  font-size: 2.2rem;
}
```

---

### 4.5 Manual Text Fallback Drawer

When expanded, players can paste raw Deflate strings or JSON blobs directly:

```css
.manual-input-drawer {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.manual-textarea {
  width: 100%;
  min-height: 80px;
  padding: var(--space-3);
  background-color: var(--bg-primary);
  border: 1.5px solid var(--border-medium);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: var(--text-caption);
  color: var(--text-primary);
  resize: vertical;
  box-sizing: border-box;
}

.manual-textarea:focus {
  border-color: var(--accent-primary);
  outline: none;
  box-shadow: var(--focus-ring);
}
```

---

## 5. Progress Conflict Resolution Modal (`ProgressConflictModal.vue`)

### 5.1 Side-by-Side Stat Comparison Card Matrix

When incoming imported data contains conflicting progress with the current device, `ProgressConflictModal.vue` displays a clear, side-by-side comparison card matrix.

```
+-----------------------------------------------------------------------------------------+
| [ ⚠️ ]  Merge Progress or Overwrite?                                              [✕]  |
|         We found existing progress on this device and new progress in your save!        |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|       CURRENT DEVICE 📱                          IMPORTED SAVE 📥                       |
|   +-----------------------+                  +-----------------------+                  |
|   | ⭐ 42 Stars           |                  | ⭐ 58 Stars   [BEST]  |                  |
|   | 🎯 1,120 Elo          |                  | 🎯 1,250 Elo  [BEST]  |                  |
|   | 🧩 64 Solved          |                  | 🧩 91 Solved  [BEST]  |                  |
|   | 🔥 8 Best Streak      |                  | 🔥 14 Streak  [BEST]  |                  |
|   +-----------------------+                  +-----------------------+                  |
|                                                                                         |
|   ✨ SMART MERGE EXPLANATION:                                                           |
|   Smart Merge combines both saves safely! It keeps your highest Elo rating (1,250),     |
|   all 91 solved puzzles + 42 lessons, and maximum star records. No data is lost!        |
|                                                                                         |
|   +---------------------------------------------------------------------------------+   |
|   |  [ 🌟 Smart Merge (Recommended) ]                                               |   |
|   |  [ ⚠️ Overwrite (Replace This Device) ]         [ Cancel / Keep Current ]       |   |
|   +---------------------------------------------------------------------------------+   |
+-----------------------------------------------------------------------------------------+
```

### 5.2 Action Hierarchy: Smart Merge vs Overwrite vs Cancel

| Action | Button Style | Behavior | Rationale |
|---|---|---|---|
| **Smart Merge (Recommended)** | `variant="success"` (Emerald Tactile Depth) | Pure `Math.max` union of stars, Elo, streak, rush, and solved puzzle IDs | **Default primary action**. Guarantees zero progress loss. |
| **Overwrite (Replace)** | `variant="danger"` / `variant="ghost"` (Coral Red Subdued) | Replaces local storage completely with imported payload | Secondary fallback for when player explicitly wants clean replacement. |
| **Cancel / Keep Current** | `variant="ghost"` | Closes modal without touching local storage | Safe escape hatch. |

### 5.3 Exact CSS Specification

```css
.conflict-modal-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.conflict-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  width: 100%;
}

@media (max-width: 520px) {
  .conflict-grid {
    grid-template-columns: 1fr;
  }
}

.conflict-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background-color: var(--bg-surface-raised);
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-xl);
}

.conflict-card.is-imported {
  border-color: var(--accent-primary);
  background-color: rgba(124, 58, 237, 0.08);
}

.conflict-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-display);
  font-size: var(--text-card-h4);
  font-weight: var(--weight-bold);
  color: var(--text-primary);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--border-subtle);
}

.stat-diff-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background-color: var(--bg-surface);
  font-family: var(--font-body);
  font-size: var(--text-body-base);
}

.stat-diff-row.is-winner {
  background-color: var(--stat-better-bg);
  border: 1px solid var(--stat-better-border);
  color: var(--stat-better-text);
  font-weight: var(--weight-bold);
}

.stat-winner-badge {
  font-family: var(--font-display);
  font-size: 10px;
  font-weight: var(--weight-bold);
  background-color: var(--stat-better-badge);
  color: #ffffff;
  padding: 2px 6px;
  border-radius: var(--radius-pill);
  text-transform: uppercase;
}

.merge-info-callout {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2-5);
  padding: var(--space-3) var(--space-4);
  background-color: rgba(16, 185, 129, 0.12);
  border: 1.5px solid #10b981;
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-body-base);
  line-height: 1.4;
}

.conflict-actions-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5);
  width: 100%;
  margin-top: var(--space-2);
}

.secondary-actions-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}
```

---

## 6. Micro-Interactions & CSS Keyframe Animations

Add these keyframe definitions to `apps/client/src/assets/design-tokens.css`:

```css
/* 1. Laser Reticle Scanline Sweep */
@keyframes laser-sweep {
  0% {
    top: 15%;
    opacity: 0.85;
  }
  50% {
    opacity: 1.0;
    filter: drop-shadow(0 0 8px #10b981);
  }
  100% {
    top: 85%;
    opacity: 0.85;
  }
}

/* 2. Floating Pill Entry Animation */
@keyframes float-pill-in {
  0% {
    transform: translateY(-24px) scale(0.92);
    opacity: 0;
  }
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

/* 3. Sync Success Beacon & Pulse */
@keyframes sync-success-pulse {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }
  70% {
    transform: scale(1.03);
    box-shadow: 0 0 0 16px rgba(16, 185, 129, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

/* 4. Dropzone Active Drag Pulse */
@keyframes dropzone-glow {
  0%, 100% {
    border-color: var(--accent-primary);
    background-color: rgba(124, 58, 237, 0.08);
  }
  50% {
    border-color: #a78bfa;
    background-color: rgba(124, 58, 237, 0.20);
  }
}
```

---

## 7. Accessibility, Touch Target & Responsive Contracts

### 7.1 WCAG 2.1 AA Compliance Checklist
- **Color Contrast:** All body text on surfaces has a minimum contrast ratio of $\ge 4.5:1$ (Light: `#0f172a` on `#ffffff` = $16.5:1$; Dark: `#f8fafc` on `#1e1e38` = $13.2:1$). Amber status text uses `#78350f` on light background ($5.8:1$) and `#fef3c7` on dark ($12.1:1$).
- **Keyboard Navigation:**
  - `Escape` key closes all active modals (`ProgressSyncModal`, `ProgressConflictModal`, `PwaInstallModal`).
  - `Tab` key cycles through focusable elements inside open modals with active focus trapping via `BaseModal`.
  - Arrow keys navigate between `Export` and `Import` tabs in `ProgressSyncModal`.
- **ARIA Attributes:**
  - Modals include `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and `aria-describedby`.
  - Tabs include `role="tablist"`, `role="tab"`, `aria-selected="true|false"`, and `role="tabpanel"`.
  - Offline status pill includes `role="status"` and `aria-live="polite"`.

### 7.2 Minimum Touch Targets
- All primary buttons, action pills, modal close buttons, and tab switchers have minimum hit areas of **$44\text{px} \times 44\text{px}$** (desktop) and **$48\text{px} \times 48\text{px}$** (mobile/tablet).

### 7.3 Breakpoint Adaptations
- **Mobile ($\le 480\text{px}$):**
  - Modals adapt to full width with `padding: 12px`.
  - Conflict cards stack vertically in a single column.
  - QR Code canvas scales fluidly to $200\text{px} \times 200\text{px}$.
  - Camera scanner viewport adjusts height to $220\text{px}$.
- **Tablet & Desktop ($> 480\text{px}$):**
  - Modals centered with maximum widths (`580px` for Install/Conflict, `680px` for ProgressSync).
  - Conflict cards render side-by-side in a 2-column comparison grid.

---

## 8. Builder Implementation Compliance Checklist

When implementing the client features, frontend builders must adhere to this specification:

- [ ] **Exact Token Usage:** All colors, paddings, border radii, and font sizes must use the CSS custom properties defined in Section 1. No arbitrary hardcoded hex codes.
- [ ] **Offline Indicator (`OfflineIndicator.vue`):** Floating zero-displacement pill using `--status-offline` with Peanut the Dog reassurance copy.
- [ ] **PWA Install Guide (`PwaInstallBanner.vue` & `PwaInstallModal.vue`):** Adaptive 3-step illustrated guide for iOS Safari and 1-click trigger for Desktop Chrome.
- [ ] **Progress Sync Modal (`ProgressSyncModal.vue`):**
  - [ ] 2-Tab switcher with `Export` and `Import`.
  - [ ] High-contrast Version 12 QR code canvas with 1-click JSON download.
  - [ ] Camera scanner with glowing laser reticle scanline animation.
  - [ ] Drag-and-drop file dropzone + manual input fallback.
- [ ] **Progress Conflict Modal (`ProgressConflictModal.vue`):** Side-by-side stats comparison card with prominent **Smart Merge (Recommended)** primary action.
- [ ] **Celebration Confetti:** Trigger confetti on successful sync/merge completion via `useConfetti()`.
- [ ] **Accessibility:** Pass all keyboard navigation and contrast requirements.
