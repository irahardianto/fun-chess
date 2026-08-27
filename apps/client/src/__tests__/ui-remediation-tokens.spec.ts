import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('UI/UX Remediation Token & Asset Conformance (WCAG AA)', () => {
  const indexHtmlPath = path.resolve(__dirname, '../../index.html');
  const designTokensPath = path.resolve(__dirname, '../assets/design-tokens.css');
  const baseButtonPath = path.resolve(__dirname, '../components/base/BaseButton.vue');
  const baseInputPath = path.resolve(__dirname, '../components/base/BaseInput.vue');
  const baseModalPath = path.resolve(__dirname, '../components/base/BaseModal.vue');
  const gameOverModalPath = path.resolve(__dirname, '../features/modals/GameOverModal.vue');
  const aiGameOverModalPath = path.resolve(__dirname, '../features/ai/components/AiGameOverModal.vue');
  const joinCardPath = path.resolve(__dirname, '../features/lobby/JoinCard.vue');
  const hostCardPath = path.resolve(__dirname, '../features/lobby/HostCard.vue');
  const appVuePath = path.resolve(__dirname, '../App.vue');

  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
  const designTokens = fs.readFileSync(designTokensPath, 'utf-8');
  const baseButton = fs.readFileSync(baseButtonPath, 'utf-8');
  const baseInput = fs.readFileSync(baseInputPath, 'utf-8');
  const baseModal = fs.readFileSync(baseModalPath, 'utf-8');
  const gameOverModal = fs.readFileSync(gameOverModalPath, 'utf-8');
  const aiGameOverModal = fs.readFileSync(aiGameOverModalPath, 'utf-8');
  const joinCard = fs.readFileSync(joinCardPath, 'utf-8');
  const hostCard = fs.readFileSync(hostCardPath, 'utf-8');
  const appVue = fs.readFileSync(appVuePath, 'utf-8');

  it('Finding 1 & WCAG 1.4.4: index.html has zoom enabled with viewport-fit=cover and no max-scale/user-scalable restrictions', () => {
    expect(indexHtml).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />');
    expect(indexHtml).not.toContain('maximum-scale');
    expect(indexHtml).not.toContain('user-scalable=no');
  });

  it('Finding 12: index.html loads Fredoka, JetBrains Mono, and Nunito fonts with correct weights', () => {
    expect(indexHtml).toContain('family=Fredoka:wght@400;500;600;700');
    expect(indexHtml).toContain('family=JetBrains+Mono:wght@600;700');
    expect(indexHtml).toContain('family=Nunito');
    expect(designTokens).toMatch(/--weight-heavy:\s+700;/);
  });

  it('Finding 2: design-tokens.css defines semantic focus ring token and components use :focus-visible', () => {
    expect(designTokens).toContain('--focus-ring:');
    expect(designTokens).toContain('--border-focus:');
    expect(baseButton).toContain(':focus-visible');
    expect(baseButton).toContain('box-shadow: var(--focus-ring);');
  });

  it('Finding 5 & 6: design-tokens.css specifies accessible color contrast tokens for light and dark themes', () => {
    // Light theme contrast tokens (>= 4.5:1)
    expect(designTokens).toContain('--board-coord-light:       #7d5538;');
    expect(designTokens).toContain('--board-coord-dark:        #3d220f;');
    expect(designTokens).toContain('--turn-waiting-bg:         #64748b;');
    expect(designTokens).toContain('--turn-active-text:        #0f172a;');
    expect(designTokens).toContain('--text-on-success:    #0f172a;');
    expect(designTokens).toContain('--color-accent-text:  #92400e;');
    expect(designTokens).toContain('--color-success-text: #166534;');
    expect(designTokens).toContain('--color-primary-text: hsl(var(--color-primary-h) 65% 38%);');

    // Dark theme contrast tokens (>= 4.5:1)
    expect(designTokens).toContain('--color-primary-text: hsl(255 95% 78%);');
    expect(designTokens).toContain('--color-accent-text:  hsl(42 100% 75%);');
    expect(designTokens).toContain('--color-success-text: #34d399;');
    expect(designTokens).toContain('--mode-ladder-bg:        hsl(271, 85%, 97%);');
    expect(designTokens).toContain('--mode-drills-bg:        hsl(244, 85%, 97%);');
    expect(designTokens).toContain('--mode-rush-bg:          hsl(24, 100%, 97%);');
  });

  it('Finding 13: BaseButton.vue defines tactile active transform squish feedback', () => {
    expect(baseButton).toContain('transform: translateY(4px) scale(0.96);');
  });

  it('Chessboard Color Immunity: prevents mobile OS dark modes from auto-inverting chess pieces', () => {
    expect(designTokens).toContain('forced-color-adjust: none !important;');
    expect(designTokens).toContain('color-scheme: only light !important;');
  });

  it('SC-1 Findings 6, 7, 8, 9, 15: Conformance for App shell, Base components, and theme switching', () => {
    // Persistent Live Region in App.vue
    expect(appVue).toContain('role="status"');
    expect(appVue).toContain('aria-live="polite"');
    expect(designTokens).toContain('.sr-only');

    // Focus-visible explicit outline in App.vue
    expect(appVue).toContain('.navbar-brand:focus-visible');
    expect(appVue).toContain('outline: 2px solid var(--color-primary);');

    // Logical directional properties in BaseInput and BaseModal
    expect(baseInput).toContain('padding: var(--space-2-5) var(--space-4);');
    expect(baseModal).toContain('margin-inline-start: auto;');
    expect(baseModal).toContain('padding-inline:');

    // Safe area insets & 100dvh
    expect(baseModal).toContain('100dvh');
    expect(baseModal).toContain('env(safe-area-inset-top');
    expect(baseModal).toContain('env(safe-area-inset-bottom');
    expect(appVue).toContain('100dvh');

    // Double requestAnimationFrame / transition suppression for theme switch
    expect(appVue).toContain('theme-transition-suppress');
    expect(appVue).toContain('transition: none !important;');
    expect(appVue).toContain('requestAnimationFrame');
  });

  it('BaseInput.vue enforces 16px font size to prevent iOS Safari auto-zoom', () => {
    expect(baseInput).toMatch(/font-size:\s*16px;/);
  });

  it('Victory text colors adhere to accent text contrast color and glowing shadow in GameOver modals', () => {
    expect(gameOverModal).toMatch(/\.banner-headline\.is-victory\s*\{[^}]*color:\s*var\(--color-accent-text\)/s);
    expect(aiGameOverModal).toMatch(/\.banner-headline\.is-victory\s*\{[^}]*color:\s*var\(--color-accent-text\)/s);
  });

  it('Enforces verb-first copy on primary action buttons across views', () => {
    expect(joinCard).toContain('Join Game');
    expect(hostCard).toContain('Host Game');
    expect(gameOverModal).toContain('Request Rematch');
    expect(gameOverModal).toContain('Return to Lobby');
    expect(aiGameOverModal).toContain('Play Again with');
    expect(aiGameOverModal).toContain('Choose Another Mascot');
    expect(aiGameOverModal).toContain('Return to Main Menu');
  });
});
