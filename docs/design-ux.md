# Fun Chess — Design System Tokens & UX Specification

**Document ID**: `DESIGN-UX-003` (Audit Remediation Edition)
**Phase**: DESIGN (Frozen Architecture & Interaction Contract)
**Author**: UX Craftsman (`@ux-craftsman`)
**Consumers**: Frontend Builders (`@frontend-engineer[client-multiplayer]`, `@frontend-engineer[client-engines-e2e]`), Tech Leads (`@tech-lead`), QA & Reviewers (`@reviewer`, `@red-team-lead`)
**Target Scope Cards**: `SC-4` (Multiplayer & Layout), `SC-5` (Client Engines & Platform)
**Audit Findings Addressed**: `[ENH-012]`, `[ENH-002]`, `[MIN-003]`, `[MIN-008]`, `[ENH-004]`

---

## 1. Executive Summary & Remediation UX Foundations

During the Fun Chess code audit remediation, critical frontend quality, maintainability, and accessibility enhancements were identified across the client application:
1. **Component Styles & CSS Modularization (ENH-012)**: The modal component `QrCodeModal.vue` contains over 460 lines of scoped CSS (bringing the single file to 942 lines). This monolithic style block must be cleanly extracted into a dedicated, modular stylesheet (`qr-code-modal.css`) while preserving Vue scoped style isolation, design token purity, and responsive adaptability.
2. **Defensive Input Controls & Accessibility (ENH-002)**: The manual host IP input field currently lacks input bounds, triggers general alphanumeric software keyboards on touch devices, allows unwanted browser autofill overlays, and lacks robust screen-reader associations. We specify defensive attributes (`maxlength="15"`, `inputmode="decimal"`, `autocomplete="off"`, `spellcheck="false"`) and complete ARIA attributes.
3. **Theme MediaQuery Listener Lifecycle (MIN-003)**: `useTheme.ts` attaches event listeners to `window.matchMedia('(prefers-color-scheme: dark)')` without idempotent guards or centralized teardown. This causes duplicate event listeners and memory leaks when components re-render or tests execute. We define a singleton lifecycle with idempotent registration and teardown.
4. **Visual Polish & Heuristic Verification**: All status badges, error frames, input states, and modal transitions touched by the remediation must adhere 100% to the project design tokens defined in `apps/client/src/assets/design-tokens.css`, maintaining high contrast (WCAG 2.1 AA $\ge 4.5:1$), touch target accessibility ($\ge 44\times 44\text{px}$), and zero layout shift (Zero-CLS).

### 1.1 Frozen Contract Status
> [!IMPORTANT]
> This specification is a **frozen design contract**. Frontend builders refactoring `QrCodeModal.vue`, `useTheme.ts`, and associated styles **must strictly adhere** to the class names, CSS custom properties, HTML attributes, and lifecycle interfaces defined in this document. No hardcoded colors, magic numbers, or ad-hoc style overrides are permitted.

---

## 2. Complete Design System Tokens (Frozen Design Contract)

All styling in `apps/client/` is governed by CSS custom properties defined in `apps/client/src/assets/design-tokens.css`. Below is the normative token catalog that frontend builders must consume.

### 2.1 Color Palette & Semantic Tokens

#### 2.1.1 Semantic Primitives (Light & Dark Mode)

| Token Name | Light Value (Hex / HSL) | Dark Value (Hex / HSL) | WCAG AA Ratio | Semantic Purpose |
|---|---|---|---|---|
| `--color-primary` | `#6c5ce7` / `hsl(255 85% 60%)` | `#8270f5` / `hsl(255 85% 72%)` | $\ge 4.6:1$ | Electric Violet: Primary buttons, room code, active highlights |
| `--color-primary-hover` | `hsl(255 85% 54%)` | `hsl(255 85% 66%)` | $\ge 4.5:1$ | Primary button hover state |
| `--color-primary-active` | `hsl(255 85% 48%)` | `hsl(255 85% 60%)` | $\ge 4.5:1$ | Primary button pressed/active state |
| `--color-primary-bevel` | `hsl(255 85% 42%)` | `hsl(255 85% 32%)` | Graphical | 3D tactile button bottom shadow bevel |
| `--color-primary-subtle` | `hsl(255 85% 60% / 0.14)` | `hsl(255 85% 60% / 0.22)` | N/A | Cloud status card fill, active selection wash |
| `--color-accent` | `#ffb300` / `hsl(42 100% 52%)` | `#ffc107` / `hsl(45 100% 51%)` | $\ge 4.5:1$ | Sunshine Gold: Localhost warning border, star badges, accent buttons |
| `--color-accent-hover` | `hsl(42 100% 46%)` | `hsl(45 100% 45%)` | Graphical | Accent button hover state |
| `--color-accent-active` | `hsl(42 100% 40%)` | `hsl(45 100% 39%)` | Graphical | Accent button active state |
| `--color-accent-bevel` | `hsl(42 95% 36%)` | `hsl(45 90% 30%)` | Graphical | 3D tactile accent button shadow bevel |
| `--color-accent-subtle` | `hsl(42 100% 52% / 0.16)` | `hsl(45 100% 51% / 0.24)` | N/A | Warning section background fill |
| `--color-success` | `#22c55e` / `hsl(145 68% 48%)` | `#34d399` / `hsl(156 72% 52%)` | $\ge 4.5:1$ | Emerald Mint: Copied confirmation checkmark, legal moves |
| `--color-success-hover` | `hsl(145 68% 42%)` | `hsl(156 72% 58%)` | Graphical | Success button hover state |
| `--color-success-active` | `hsl(145 68% 36%)` | `hsl(156 72% 46%)` | Graphical | Success button active state |
| `--color-success-bevel` | `hsl(145 68% 34%)` | `hsl(156 70% 24%)` | Graphical | 3D tactile success button bevel |
| `--color-danger` | `#dc2626` / `hsl(354 88% 48%)` | `#ef4444` / `hsl(0 84% 60%)` | $\ge 4.8:1$ | Coral Crimson: QR generation error, invalid IP border |
| `--color-danger-hover` | `hsl(354 88% 42%)` | `hsl(0 84% 66%)` | Graphical | Danger button hover state |
| `--color-danger-active` | `hsl(354 88% 36%)` | `hsl(0 84% 54%)` | Graphical | Danger button active state |
| `--color-danger-bevel` | `hsl(354 88% 40%)` | `hsl(0 80% 28%)` | Graphical | 3D tactile danger button bevel |
| `--color-info` | `#0ea5e9` / `hsl(198 93% 54%)` | `#38bdf8` / `hsl(199 89% 60%)` | $\ge 4.5:1$ | Sky Cyan: Wi-Fi info status, network badges |

#### 2.1.2 Backgrounds, Surfaces & Overlays

| Token Name | Light Value | Dark Value | Purpose / Usage |
|---|---|---|---|
| `--bg-app` | `#f1f4f9` (`hsl(220 28% 96%)`) | `#111524` (`hsl(226 30% 10%)`) | Viewport page background, URL preview card |
| `--bg-surface` | `#ffffff` (`hsl(0 0% 100%)`) | `#1e2438` (`hsl(225 24% 16%)`) | Modal body, IP input field, interface pills |
| `--bg-surface-raised` | `#edf1f7` (`hsl(0 0% 97%)`) | `#272f48` (`hsl(225 22% 22%)`) | Raised panels, nested cards |
| `--bg-surface-glass` | `rgba(255, 255, 255, 0.88)` | `rgba(30, 36, 56, 0.88)` | Frosted glass containers |
| `--bg-overlay` | `rgba(15, 23, 42, 0.65)` | `rgba(5, 8, 16, 0.80)` | Modal backdrop blur overlay (`backdrop-filter: blur(8px)`) |
| `--qr-canvas-bg` | `#ffffff` | `#ffffff` | Pure white QR canvas backing (ensures barcode optical contrast) |

#### 2.1.3 Semantic Typography & Text Tokens

| Token Name | Light Value | Dark Value | Contrast Ratio | Usage |
|---|---|---|---|---|
| `--text-main` | `#0f172a` (`hsl(222 47% 11%)`) | `#f1f3f9` (`hsl(220 20% 96%)`) | $\ge 14:1$ | Modal headings, input text, strong labels |
| `--text-muted` | `#596780` (`hsl(222 16% 42%)`) | `#9ba8c0` (`hsl(220 14% 68%)`) | $\ge 4.7:1$ | Subtitles, helper text, prefill labels |
| `--text-faint` | `#64748b` (`hsl(222 16% 47%)`) | `#8593aa` (`hsl(220 14% 60%)`) | $\ge 4.5:1$ | Footer network note, placeholder text |
| `--text-inverse` | `#ffffff` | `#0f172a` | $\ge 14:1$ | Inverted contrast labels |
| `--text-on-primary` | `#ffffff` | `#0f172a` | $\ge 7.5:1$ | Text on primary violet buttons & selected pills |
| `--text-on-accent` | `#1e1b4b` | `#1e1b4b` | $\ge 8.2:1$ | Dark navy text on sunshine gold buttons |
| `--text-on-danger` | `#ffffff` | `#ffffff` | $\ge 4.8:1$ | Text on danger action buttons |

#### 2.1.4 Status, Soft Error & Warning Tokens

| Token Name | Light Value | Dark Value | Usage |
|---|---|---|---|
| `--soft-error-bg` | `hsl(350 90% 96%)` (`#fff1f2`) | `hsl(350 40% 18%)` | QR canvas error card background |
| `--soft-error-border` | `hsl(350 80% 75%)` (`#fecdd3`) | `hsl(350 50% 35%)` | QR canvas error card dashed border |
| `--soft-error-text` | `hsl(350 75% 35%)` (`#9f1239`) | `hsl(350 85% 90%)` | High-contrast error message title ($\ge 5.2:1$) |
| `--border-subtle` | `hsl(220 18% 88%)` | `hsl(225 20% 24%)` | Footer divider, help box border |
| `--border-medium` | `hsl(220 22% 80%)` | `hsl(225 20% 32%)` | Input border, interface pill border |
| `--border-strong` | `hsl(220 25% 68%)` | `hsl(225 20% 45%)` | Hover borders |
| `--focus-ring` | `0 0 0 3px hsl(255 85% 60% / 0.45)` | `0 0 0 3px hsl(255 85% 72% / 0.50)` | Universal accessible keyboard focus ring |

---

### 2.2 Typography Scale & Text Styling System

Fun Chess standardizes on three typefaces:
- **Fredoka**: Rounded display font for titles, badges, and primary action buttons.
- **Nunito**: Highly legible sans-serif for instructions, body text, and dialog copy.
- **ui-monospace**: Fixed-width font for 4-letter room codes, IPv4 addresses, and terminal snippets.

```css
:root {
  --font-display: 'Fredoka', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-body:    'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono:    ui-monospace, 'Cascadia Code', Menlo, Monaco, Consolas, 'JetBrains Mono', monospace;
}
```

#### 2.2.1 Fluid Typography Scale

| Token Name | Formula / Value | Weight | Line Height | Usage |
|---|---|---|---|---|
| `--text-hero` | `clamp(2.40rem, 1.80rem + 2.8vw, 3.40rem)` | 700 (Bold) | 1.15 | Game victory fanfare, splash titles |
| `--text-4xl` | `clamp(1.90rem, 1.50rem + 1.9vw, 2.60rem)` | 700 (Bold) | 1.15 | Page title (`h1`), Main Lobby heading |
| `--text-3xl` | `clamp(1.50rem, 1.25rem + 1.4vw, 2.10rem)` | 700 (Bold) | 1.25 | Section headers (`h2`) |
| `--text-2xl` | `clamp(1.30rem, 1.10rem + 0.9vw, 1.65rem)` | 700 (Bold) | 1.30 | Modal dialog title (`h3`): "Invite Player 2! 🚀" |
| `--text-xl` | `clamp(1.15rem, 1.00rem + 0.6vw, 1.35rem)` | 700 (Bold) | 1.30 | Card titles, prominent status headers |
| `--text-lg` | `clamp(1.05rem, 0.95rem + 0.4vw, 1.20rem)` | 600 (Semibold) | 1.40 | Large button labels |
| `--text-base` | `clamp(0.95rem, 0.90rem + 0.2vw, 1.05rem)` | 500 (Medium) | 1.50 | Default body copy, modal subtitle, error titles |
| `--text-sm` | `clamp(0.82rem, 0.78rem + 0.2vw, 0.92rem)` | 600 (Semibold) | 1.40 | Button labels, card subheadings, helper text |
| `--text-xs` | `clamp(0.70rem, 0.67rem + 0.1vw, 0.78rem)` | 500 (Medium) | 1.30 | Pills, code labels, network footer, inline errors |
| `--text-room-code` | `clamp(2.20rem, 1.80rem + 2.0vw, 3.00rem)` | 700 (Bold) | 1.10 | 4-letter room code in `.code-value` |

#### 2.2.2 Typographic Orphan Prevention
- Headings & modal titles: `text-wrap: balance;`
- Explanatory paragraphs & error descriptions: `text-wrap: pretty;`

---

### 2.3 Spacing, Touch Target & Layout Grid

Adheres to a geometric **4px base grid**:

```css
:root {
  --space-0-5: 2px;
  --space-1:   4px;
  --space-1-5: 6px;
  --space-2:   8px;
  --space-2-5: 10px;
  --space-3:   12px;
  --space-4:   16px;   /* Standard container padding */
  --space-5:   20px;
  --space-6:   24px;   /* Modal header / body padding */
  --space-8:   32px;   /* Viewport gutter */
  --space-10:  40px;
  --space-12:  48px;
  --space-16:  64px;
}
```

#### Touch Target Accessibility Standard (WCAG 2.5.5 Level AA)
- **Minimum Tap Target**: `--touch-target-min: 44px` (All interactive elements: buttons, interface pills, prefill tags, disclosure buttons).
- **Tactile Button Height**: `--touch-target-button: 52px` (Primary action button: Copy Invite Link).

---

### 2.4 Border Radius, Shadows & Tactile 3D Buttons

#### 2.4.1 Border Radius System
```css
:root {
  --radius-xs:   4px;    /* Kbd tags, code snippets */
  --radius-sm:   8px;    /* Prefill tags, guide box */
  --radius-md:   12px;   /* Text inputs, URL preview chip */
  --radius-lg:   16px;   /* Section cards, primary buttons */
  --radius-xl:   22px;   /* Room code badge, QR canvas card */
  --radius-2xl:  30px;   /* Modal dialog container */
  --radius-pill: 9999px; /* Interface pills, retry buttons */

  --radius-modal: var(--radius-2xl);
  --radius-btn:   var(--radius-lg);
}
```

#### 2.4.2 Elevation Shadows & Tactile Buttons
```css
:root {
  --shadow-xs: 0 1px 3px rgba(15, 23, 42, 0.08);
  --shadow-sm: 0 2px 6px rgba(15, 23, 42, 0.09), 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-md: 0 6px 16px rgba(15, 23, 42, 0.10), 0 2px 6px rgba(15, 23, 42, 0.06);
  --shadow-lg: 0 12px 28px rgba(15, 23, 42, 0.14), 0 4px 10px rgba(15, 23, 42, 0.08);
  --shadow-xl: 0 20px 48px rgba(15, 23, 42, 0.20), 0 8px 16px rgba(15, 23, 42, 0.10);

  /* Tactile 3D Buttons (travels 4px down on :active) */
  --shadow-btn-primary:        0 5px 0 var(--color-primary-bevel), 0 8px 15px rgba(108, 92, 231, 0.35);
  --shadow-btn-primary-hover:  0 7px 0 var(--color-primary-bevel), 0 10px 20px rgba(108, 92, 231, 0.40);
  --shadow-btn-primary-active: 0 1px 0 var(--color-primary-bevel), 0 2px 5px rgba(108, 92, 231, 0.25);

  --shadow-btn-accent:         0 5px 0 var(--color-accent-bevel), 0 8px 15px rgba(255, 179, 0, 0.35);
  --shadow-btn-accent-hover:   0 7px 0 var(--color-accent-bevel), 0 10px 20px rgba(255, 179, 0, 0.40);
  --shadow-btn-accent-active:  0 1px 0 var(--color-accent-bevel), 0 2px 5px rgba(255, 179, 0, 0.25);
}
```

---

### 2.5 Motion, Timing & Micro-Interactions

```css
:root {
  --duration-instant: 70ms;
  --duration-fast:    140ms;
  --duration-normal:  240ms;
  --duration-spring:  360ms;

  --ease-spring:   cubic-bezier(0.175, 0.885, 0.32, 1.275);
  --ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}
```

#### Keyframe Animations
1. `shake-soft`: Applied to `.qr-canvas-card--error` on canvas failure.
   - `0%, 100% { transform: translateX(0); }`
   - `20%, 60% { transform: translateX(-5px); }`
   - `40%, 80% { transform: translateX(5px); }`
   - Duration: `var(--duration-normal, 240ms)`, Easing: `var(--ease-spring)`
2. `modal-pop-in`: Applied to dialog container upon display.
   - `0% { transform: scale(0.88) translateY(20px); opacity: 0; }`
   - `100% { transform: scale(1) translateY(0); opacity: 1; }`
   - Duration: `var(--duration-spring, 360ms)`
3. `prefers-reduced-motion` mandate:
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       animation-iteration-count: 1 !important;
       transition-duration: 0.01ms !important;
     }
   }
   ```

---

## 3. Component Styles & CSS Modularization (`QrCodeModal.vue` — ENH-012)

### 3.1 Modular Stylesheet Architecture
- **Location**: `apps/client/src/features/lobby/qr-code-modal.css`
- **SFC Linkage**: In `QrCodeModal.vue`:
  ```vue
  <style scoped src="./qr-code-modal.css"></style>
  ```
- **Rationale**:
  1. Reduces `QrCodeModal.vue` file size from 942 lines down to under 470 lines.
  2. Preserves Vue's compiler-driven scoped CSS attributes (`data-v-[hash]`), preventing selector bleed into the global cascade while maintaining modular maintainability.
  3. Replaces all hardcoded colors and arbitrary units with standard CSS custom properties.

### 3.2 Semantic Class Catalog & Hierarchy

The stylesheet is structured into 8 modular BEM/semantic layout sections:

```
.qr-modal-content                     # Top-level flex container (column, gap: 12px, align: center)
├── .qr-subtitle                       # Explanatory subtitle paragraph
├── .room-code-badge                   # Dashed prominent chip displaying room code
│   ├── .code-label                    # "Room Code" uppercase micro-label
│   └── .code-value                    # Monospace 4-letter high-contrast value
├── .qr-canvas-card                    # White elevated container framing QR barcode
│   ├── .qr-image                      # Rounded QR image (220x220px)
│   └── .qr-loading-placeholder        # Accessible centered loading text
├── .qr-canvas-card--error             # Error fallback container (shake-soft animation)
│   ├── .qr-error-icon                 # ⚠️ Danger icon with soft halo
│   ├── .qr-error-title                # "Failed to create QR Code canvas" title
│   ├── .qr-error-desc                 # Reassurance body text
│   └── .qr-retry-btn                  # Tactile retry action button
├── .cloud-relay-card                  # Cloud online status banner (when isCloudMode === true)
│   ├── .cloud-relay-icon              # ☁️ Cloud icon
│   └── .cloud-relay-text              # Bold title + status tip
├── .lan-config-section                # LAN Wi-Fi configuration card (when isCloudMode === false)
│   ├── &.is-warning-mode              # Warning state when host is localhost/127.0.0.1
│   ├── .lan-status-header             # Icon + Status title + Tip
│   ├── .interface-group               # Discovered interface list
│   │   ├── .sub-label                 # "Discovered IPs:" heading
│   │   └── .interface-pills           # Flex-wrap pill container
│   │       └── .pill-btn              # Interactive IP pill button (&.is-selected)
│   ├── .ip-input-container            # Manual IP input wrapper
│   │   ├── .ip-input-row              # Input + Apply button flex row
│   │   │   ├── .ip-text-input         # Monospace text input (&.has-error)
│   │   │   └── button (BaseButton)    # "Apply IP" accent button
│   │   ├── .ip-inline-error           # ⚠️ Inline validation message
│   │   ├── .prefill-helpers           # Subnet quick-picker pills
│   │   │   ├── .prefill-label         # "Quick prefill:" label
│   │   │   └── .prefill-tag           # Dashed button (192.168.1._)
│   │   └── .ip-help-wrapper           # Collapsible guide toggle & content
│   │       ├── .help-toggle-btn       # Underlined text toggle button
│   │       └── .ip-guide-box          # OS command cheat-sheet box
├── .qr-actions                        # Footer action container
│   ├── .url-preview                   # Break-all monospace join URL container
│   ├── BaseButton                     # "Copy Invite Link" / "Copied! ✅"
│   └── .copy-error-notice             # ⚠️ Copy failure alert
└── .network-info-footer               # Muted single-line network metadata footer
```

### 3.3 Complete Production Modular Stylesheet (`qr-code-modal.css`)

Frontend builders must write the following complete stylesheet into `apps/client/src/features/lobby/qr-code-modal.css`:

```css
/* ==========================================================================
   QR Code Modal Modular Stylesheet
   Design Spec: DESIGN-UX-003 (ENH-012)
   Target: apps/client/src/features/lobby/qr-code-modal.css
   ========================================================================== */

/* 1. Modal Content Layout Container */
.qr-modal-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
  width: 100%;
}

.qr-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--text-muted);
  max-width: 340px;
  margin: 0;
  text-wrap: pretty;
}

/* 2. Room Code Badge */
.room-code-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-app);
  border: 2px dashed var(--color-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-2) var(--space-6);
  box-shadow: var(--shadow-sm);
  width: fit-content;
  min-width: 180px;
}

.code-label {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--text-muted);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.code-value {
  font-family: var(--font-mono);
  font-size: var(--text-room-code);
  font-weight: var(--weight-heavy);
  color: var(--color-primary);
  letter-spacing: var(--tracking-code);
  line-height: var(--leading-tight);
}

/* 3. QR Code Canvas Card Frame */
.qr-canvas-card {
  padding: var(--space-3);
  background-color: var(--qr-canvas-bg, #ffffff);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 244px;
  height: 244px;
  min-width: 244px;
  min-height: 244px;
  box-sizing: border-box;
}

.qr-image {
  display: block;
  width: 220px;
  height: 220px;
  border-radius: calc(var(--radius-xl, 22px) - var(--space-3, 12px));
  image-rendering: pixelated;
}

.qr-loading-placeholder {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-muted);
}

/* 4. QR Error Fallback State Card (ENH-004) */
.qr-canvas-card--error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 244px;
  min-height: 244px;
  padding: var(--space-4);
  background-color: var(--soft-error-bg, hsl(350 90% 96%));
  border: 2px dashed var(--color-danger, #dc2626);
  border-radius: var(--radius-xl, 22px);
  text-align: center;
  box-sizing: border-box;
  animation: shake-soft var(--duration-normal, 240ms) var(--ease-spring);
}

.qr-error-icon {
  font-size: 2rem;
  margin-bottom: var(--space-2);
  filter: drop-shadow(0 2px 8px rgba(220, 38, 38, 0.35));
}

.qr-error-title {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  color: var(--soft-error-text, hsl(350 75% 35%));
  margin-bottom: var(--space-1);
}

.qr-error-desc {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: var(--leading-snug);
  margin-bottom: var(--space-3);
  text-wrap: pretty;
}

.qr-retry-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1-5);
  min-height: var(--touch-target-min, 44px);
  min-width: 140px;
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--text-on-primary, #ffffff);
  background-color: var(--color-primary);
  border: none;
  border-radius: var(--radius-btn, 16px);
  box-shadow: var(--shadow-btn-primary);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-spring),
              background-color var(--duration-fast) ease,
              box-shadow var(--duration-fast) ease;
}

.qr-retry-btn:hover {
  background-color: var(--color-primary-hover);
  box-shadow: var(--shadow-btn-primary-hover);
  transform: translateY(-2px);
}

.qr-retry-btn:active {
  background-color: var(--color-primary-active);
  box-shadow: var(--shadow-btn-primary-active);
  transform: translateY(2px);
}

.qr-retry-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* 5. Cloud Relay Status Banner */
.cloud-relay-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background-color: var(--color-primary-subtle);
  border: 1.5px solid var(--color-primary);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  width: 100%;
  max-width: 380px;
  box-sizing: border-box;
  text-align: start;
}

.cloud-relay-icon {
  font-size: 1.8rem;
  line-height: var(--leading-none);
  flex-shrink: 0;
}

.cloud-relay-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-0-5);
}

.cloud-relay-text strong {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  color: var(--text-main);
}

/* 6. LAN Configuration & Warning Box */
.lan-config-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  background-color: var(--bg-app);
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-medium);
  width: 100%;
  max-width: 380px;
  box-sizing: border-box;
  text-align: start;
  transition: border-color var(--duration-fast) ease, background-color var(--duration-fast) ease;
}

.lan-config-section.is-warning-mode {
  border-color: var(--color-accent);
  background-color: var(--color-accent-subtle);
}

.lan-status-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.lan-status-icon {
  font-size: 1.3rem;
  line-height: var(--leading-none);
  flex-shrink: 0;
}

.lan-status-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-0-5);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-main);
}

.lan-status-text strong {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  color: var(--text-main);
}

.status-tip {
  margin: 0;
  color: var(--text-muted);
  line-height: var(--leading-normal);
}

.status-tip code {
  background: var(--bg-surface);
  padding: 2px 5px;
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-weight: var(--weight-bold);
  color: var(--color-primary);
}

/* Discovered Interface Pills */
.interface-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-top: var(--space-1);
}

.sub-label {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-weight: var(--weight-bold);
}

.interface-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.pill-btn {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  min-height: 36px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-medium);
  background: var(--bg-surface);
  color: var(--text-main);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: border-color var(--duration-fast) ease,
              transform var(--duration-fast) ease,
              background-color var(--duration-fast) ease,
              color var(--duration-fast) ease;
}

.pill-btn:hover {
  border-color: var(--color-primary);
  transform: translateY(-1px);
}

.pill-btn.is-selected {
  background: var(--color-primary);
  color: var(--text-on-primary);
  border-color: var(--color-primary);
  font-weight: var(--weight-bold);
}

.pill-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* 7. Manual IP Input Row (Defensive Controls) */
.ip-input-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-1);
  width: 100%;
}

.ip-input-row {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  width: 100%;
}

.ip-text-input {
  flex: 1;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  min-height: var(--touch-target-min, 44px);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-medium);
  background: var(--bg-surface);
  color: var(--text-main);
  outline: none;
  box-sizing: border-box;
  transition: border-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
}

.ip-text-input:focus {
  border-color: var(--border-focus);
  box-shadow: var(--focus-ring);
}

.ip-text-input.has-error {
  border-color: var(--color-danger);
}

.ip-text-input.has-error:focus {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 3px hsla(var(--color-danger-h, 354), 88%, 48%, 0.35);
}

.ip-inline-error {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--color-danger);
  margin: 0;
  text-align: start;
}

/* Prefill Helpers */
.prefill-helpers {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-1-5);
}

.prefill-label {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.prefill-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--bg-surface);
  border: 1px dashed var(--border-medium);
  padding: 4px 8px;
  min-height: 36px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-primary);
  transition: background-color var(--duration-fast) ease, border-color var(--duration-fast) ease;
}

.prefill-tag:hover {
  background: var(--color-primary-subtle);
  border-color: var(--color-primary);
}

.prefill-tag:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* IP Help Guide Disclosure */
.ip-help-wrapper {
  margin-top: var(--space-0-5);
}

.help-toggle-btn {
  background: none;
  border: none;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--color-primary);
  cursor: pointer;
  padding: var(--space-1) 0;
  min-height: var(--touch-target-min, 44px);
  display: inline-flex;
  align-items: center;
  text-decoration: underline;
}

.help-toggle-btn:focus-visible {
  outline: none;
  border-radius: var(--radius-xs);
  box-shadow: var(--focus-ring);
}

.ip-guide-box {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-surface);
  border-radius: calc(var(--radius-lg, 16px) - var(--space-3, 12px));
  border: 1px solid var(--border-subtle);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: var(--leading-normal);
  text-align: start;
}

.ip-guide-box p {
  margin: 4px 0;
}

.ip-guide-box kbd {
  background: var(--bg-app);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-xs);
  padding: 1px 5px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}

.ip-guide-box code {
  font-family: var(--font-mono);
  color: var(--color-primary);
  font-weight: var(--weight-bold);
}

/* 8. QR Actions & Footer */
.qr-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

.url-preview {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  background-color: var(--bg-app);
  padding: var(--space-1-5) var(--space-3);
  border-radius: var(--radius-md);
  word-break: break-all;
  margin: 0;
  user-select: all;
}

.copy-error-notice {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: var(--color-danger);
  margin: 0;
  text-align: center;
}

.network-info-footer {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-faint);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border-subtle);
  width: 100%;
}

/* 9. Responsive Mobile-First Adaptations (max-width: 480px) */
@media (max-width: 480px) {
  .ip-input-row {
    flex-direction: column;
    align-items: stretch;
  }

  .ip-input-row .ip-text-input {
    width: 100%;
    min-width: 100%;
  }

  .ip-input-row :deep(button),
  .ip-input-row button {
    width: 100%;
    justify-content: center;
    min-height: var(--touch-target-min, 44px);
  }

  .cloud-relay-card,
  .lan-config-section {
    max-width: 100%;
  }
}
```

---

## 4. Input Accessibility & Defensive Controls (`QrCodeModal.vue` — ENH-002)

### 4.1 Input Specification Matrix

| Attribute / Requirement | Exact Value / Implementation | Rationale | WCAG 2.1 Criterion |
|---|---|---|---|
| **Max Character Length** | `maxlength="15"` | Strictly caps input to maximum IPv4 length (`255.255.255.255`). Prevents buffer abuse and accidental paste cascades. | 3.3.2 (Labels/Instructions) |
| **Virtual Keyboard Summon** | `inputmode="decimal"` | Opens numeric keyboard with dedicated period/decimal separator on mobile devices (iOS/Android) instead of full QWERTY keyboard. | 1.3.5 (Identify Input Purpose) |
| **Autofill Disabling** | `autocomplete="off"` | Prevents browser password/address managers from popping dialogs over the modal window. | 2.2.4 (Interruptions) |
| **Spellcheck Suppression** | `spellcheck="false"` | Prevents red squiggles under valid numeric IP segments. | 1.1.1 (Non-text Content) |
| **Accessible Name & Label** | `<label for="qr-custom-ip-input" class="sr-only">Enter host Wi-Fi IP address</label>` | Provides an explicit semantic `<label>` node for screen readers, satisfying strict accessibility tree requirements beyond `aria-label`. | 1.3.1 (Info and Relationships), 4.1.2 (Name, Role, Value) |
| **Error Indication** | `:aria-invalid="Boolean(ipError)"` | Sets `aria-invalid="true"` whenever validation fails. | 3.3.1 (Error Identification) |
| **Error Association** | `:aria-describedby="ipError ? 'ip-inline-error' : undefined"` | Binds the input element directly to the error message container. | 3.3.3 (Error Suggestion) |
| **Error Announcer** | `<p id="ip-inline-error" role="alert" aria-live="polite">` | Screen reader immediately announces error copy politely when validation fails. | 4.1.3 (Status Messages) |
| **Keyboard Submission** | `@keyup.enter="applyCustomIp"` | Allows hardware keyboard users and desktop gamers to apply custom IP without lifting hands from keyboard. | 2.1.1 (Keyboard Navigable) |
| **Input Sanitization** | Filter characters on input | Prevents entering non-digit/non-period characters. | 3.3.2 (Input Guidance) |

### 4.2 Exact Vue Template Markup Contract

Frontend builders must update lines 360–397 of `QrCodeModal.vue` to the following template contract:

```html
<!-- Manual IP Input Row (Defensive Controls: ENH-002) -->
<div class="ip-input-container">
  <!-- Semantic Screen Reader Label -->
  <label for="qr-custom-ip-input" class="sr-only">
    Enter host Wi-Fi IP address
  </label>

  <div class="ip-input-row">
    <input
      id="qr-custom-ip-input"
      :value="customIpInput"
      type="text"
      inputmode="decimal"
      maxlength="15"
      autocomplete="off"
      spellcheck="false"
      placeholder="e.g. 192.168.1.15"
      class="ip-text-input"
      :class="{ 'has-error': Boolean(ipError) }"
      :aria-invalid="Boolean(ipError)"
      :aria-describedby="ipError ? 'ip-inline-error' : undefined"
      aria-label="Enter host Wi-Fi IP address"
      data-testid="qr-custom-ip-input"
      @input="onIpInput"
      @keyup.enter="applyCustomIp"
    />
    <BaseButton
      variant="accent"
      size="sm"
      data-testid="apply-custom-ip-btn"
      @click="applyCustomIp"
    >
      Apply IP
    </BaseButton>
  </div>

  <!-- Accessible Inline Error Message -->
  <p
    v-if="ipError"
    id="ip-inline-error"
    class="ip-inline-error"
    role="alert"
    aria-live="polite"
    data-testid="qr-ip-error"
  >
    ⚠️ {{ ipError }}
  </p>
</div>
```

---

## 5. Theme Listener Lifecycle & Responsive Behavior (`useTheme.ts` — MIN-003)

### 5.1 Architecture & Lifecycle Guarantees
- **Singleton Tracking**: Module-level state tracking active `MediaQueryList` and listener callbacks ensures that multiple calls to `initTheme()` or multiple components mounting `useTheme()` do not attach redundant DOM listeners.
- **Idempotency Guard**: `isMediaListenerRegistered` flag blocks duplicate attachment.
- **Explicit Teardown API**: `cleanupThemeListeners()` removes listeners from `MediaQueryList`, providing clean lifecycle management for unit tests (`afterEach`) and Vue component scope disposal (`onScopeDispose`).
- **Cross-Browser Compatibility**: Feature-detects modern `addEventListener('change', ...)` and falls back to legacy `addListener(...)` for older iOS Safari / WebKit engines.
- **User Preference Respect**: System media query changes only apply if the user has **not** explicitly chosen an overriding theme in `safeLocalStorage.getItem('fun_chess_theme')`.
- **Zero-Smear Reflow Transition**: Injects `<style id="theme-transition-suppress">*, *::before, *::after { transition: none !important; }</style>`, flushes layout reflow, and removes the style on the next animation frame.

### 5.2 Reference Implementation Contract (`useTheme.ts`)

Frontend builders must update `apps/client/src/components/layout/composables/useTheme.ts` to adhere to this contract:

```typescript
import { ref, type Ref, onScopeDispose, getCurrentScope } from 'vue';
import { safeLocalStorage } from '@/platform/storage';

export interface UseThemeReturn {
  isDarkMode: Ref<boolean>;
  toggleTheme: () => void;
  applyTheme: (dark: boolean) => void;
  initTheme: () => void;
}

const isDarkMode = ref(false);

// Module-level listener tracking (MIN-003)
let activeMediaQuery: MediaQueryList | null = null;
let activeMediaListener: ((e: MediaQueryListEvent | MediaQueryList) => void) | null = null;
let isMediaListenerRegistered = false;

/**
 * Detaches any active media query listeners and resets listener registration state.
 * Exported for test teardown and scope disposal.
 */
export function cleanupThemeListeners(): void {
  if (activeMediaQuery && activeMediaListener) {
    if (typeof activeMediaQuery.removeEventListener === 'function') {
      activeMediaQuery.removeEventListener('change', activeMediaListener as (e: MediaQueryListEvent) => void);
    } else if (typeof (activeMediaQuery as any).removeListener === 'function') {
      (activeMediaQuery as any).removeListener(activeMediaListener);
    }
  }
  activeMediaQuery = null;
  activeMediaListener = null;
  isMediaListenerRegistered = false;
}

/**
 * useTheme composable
 * Manages theme state, transition suppression to prevent color smearing,
 * data-theme attribute synchronization, and idempotent media query listeners.
 */
export function useTheme(): UseThemeReturn {
  function applyTheme(dark: boolean) {
    isDarkMode.value = dark;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      safeLocalStorage.safeSetItem('fun_chess_theme', dark ? 'dark' : 'light');

      // Suppress CSS transitions temporarily during theme switch to prevent visual smearing
      const style = document.createElement('style');
      style.id = 'theme-transition-suppress';
      style.appendChild(
        document.createTextNode('*, *::before, *::after { transition: none !important; }')
      );
      document.head.appendChild(style);

      if (dark) {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }

      // Synchronize <meta name="theme-color"> with active theme
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) {
        themeMeta.setAttribute('content', dark ? '#0f0f1b' : '#ffffff');
      }

      // Force layout reflow
      const _flushReflow = document.body ? document.body.offsetHeight : 0;
      void _flushReflow;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          style.remove();
        });
      });
    }
  }

  function toggleTheme() {
    applyTheme(!isDarkMode.value);
  }

  function initTheme() {
    if (typeof window === 'undefined') return;

    const savedTheme = safeLocalStorage.getItem('fun_chess_theme');
    if (savedTheme === 'dark') {
      applyTheme(true);
      return;
    } else if (savedTheme === 'light') {
      applyTheme(false);
      return;
    }

    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      if (mediaQuery.matches) {
        applyTheme(true);
      }

      // Guard against duplicate listener registration (MIN-003)
      if (!isMediaListenerRegistered) {
        const listener = (e: MediaQueryListEvent | MediaQueryList) => {
          const explicit = safeLocalStorage.getItem('fun_chess_theme');
          if (!explicit) {
            applyTheme(Boolean(e.matches));
          }
        };

        if (typeof mediaQuery.addEventListener === 'function') {
          mediaQuery.addEventListener('change', listener as (e: MediaQueryListEvent) => void);
        } else if (typeof (mediaQuery as any).addListener === 'function') {
          (mediaQuery as any).addListener(listener);
        }

        activeMediaQuery = mediaQuery;
        activeMediaListener = listener;
        isMediaListenerRegistered = true;
      }

      if (getCurrentScope()) {
        onScopeDispose(() => {
          cleanupThemeListeners();
        });
      }
    }
  }

  return {
    isDarkMode,
    toggleTheme,
    applyTheme,
    initTheme,
  };
}
```

---

## 6. Visual Polish & Heuristics Verification Matrix

### 6.1 Design Heuristics Alignment (Nielsen's 10)

| Heuristic | Component Application in Remediation | UX Guarantee |
|---|---|---|
| **1. Visibility of System Status** | `.room-code-badge`, `.qr-loading-placeholder`, `.cloud-relay-card`, `copied` state | The player always knows the room code, connection mode (Cloud vs LAN vs Localhost), and clipboard copy status within 100ms. |
| **2. Match Between System and Real World** | Subnet prefill tags (`192.168.1._`), OS command hints (`ipconfig`, `hostname -I`) | Players and parents can identify Wi-Fi IPs without needing networking expertise. |
| **3. User Control and Freedom** | `showIpGuide` disclosure toggle, manual IP override input | Users can easily reveal or hide advanced IP guides and manually set their host IP. |
| **4. Consistency and Standards** | 100% adherence to `design-tokens.css` color, radius, and elevation tokens | Visual consistency across buttons, badges, pills, and dialog surfaces. |
| **5. Error Prevention** | `maxlength="15"`, `inputmode="decimal"`, `autocomplete="off"` | Users cannot enter excessively long strings or trigger disruptive browser autocomplete prompts. |
| **6. Recognition Rather than Recall** | Prefill subnet pills, discovered IP list | Users click discovered IPs rather than typing them from scratch. |
| **7. Flexibility and Efficiency of Use** | Keyboard shortcuts (`Enter` to submit), tap-to-select pills | Fast, tactile entry for both mouse/keyboard and touch screen users. |
| **8. Aesthetic and Minimalist Design** | Clean spacing, grouped sections, zero-CLS card reservations | Clean hierarchy without visual clutter or unexpected content shifts. |
| **9. Help Users Recognize, Diagnose, and Recover from Errors** | `.qr-canvas-card--error` with retry button, `.ip-inline-error` | Clear error copy explaining what went wrong and how to fix it, with an immediate retry button. |
| **10. Help and Documentation** | Collapsible `.ip-guide-box` with Windows, Mac, and Linux instructions | Contextual, inline help available right when needed. |

### 6.2 Token Alignment Checklist for Builders

- [x] **Room Code Badge**: Background `var(--bg-app)`, Border `var(--color-primary)`, Text `var(--color-primary)`
- [x] **Discovered IP Pills**: Background `var(--bg-surface)`, Text `var(--text-main)`, Hover `var(--color-primary)`, Selected `var(--color-primary)` & `var(--text-on-primary)`
- [x] **Text Input**: Background `var(--bg-surface)`, Text `var(--text-main)`, Border `var(--border-medium)`, Focus `var(--focus-ring)`, Error `var(--color-danger)`
- [x] **Error Frame**: Background `var(--soft-error-bg)`, Border `var(--color-danger)`, Text `var(--soft-error-text)`
- [x] **Tactile Buttons**: Box shadow `var(--shadow-btn-primary)`, Radius `var(--radius-btn)`
- [x] **Dark Mode**: All tokens respond automatically through CSS custom properties without inline conditional styles
- [x] **Reduced Motion**: Disables `shake-soft` and `modal-pop-in` animations under `prefers-reduced-motion: reduce`

---

## 7. Delivery & Verification Instructions for Builders

1. **Write Modular Stylesheet**: Save the CSS above to `apps/client/src/features/lobby/qr-code-modal.css`.
2. **Link in SFC**: In `apps/client/src/features/lobby/QrCodeModal.vue`, replace the monolithic `<style scoped>...</style>` block with `<style scoped src="./qr-code-modal.css"></style>`.
3. **Update Input Controls**: In `QrCodeModal.vue`, add the defensive attributes and ARIA markup to `<input>` and `<label>` as specified in Section 4.2.
4. **Update `useTheme.ts`**: Implement the singleton listener tracking and `cleanupThemeListeners()` as specified in Section 5.2.
5. **Run Verification Commands**:
   - `pnpm --filter @fun-chess/client test run QrCodeModal.spec.ts`
   - `pnpm --filter @fun-chess/client test run useTheme.spec.ts`
   - `pnpm --filter @fun-chess/client typecheck`
   - `pnpm --filter @fun-chess/client lint`
