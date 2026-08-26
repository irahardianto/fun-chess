import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('UI/UX Remediation Token & Asset Conformance (WCAG AA)', () => {
  const indexHtmlPath = path.resolve(__dirname, '../../index.html');
  const designTokensPath = path.resolve(__dirname, '../assets/design-tokens.css');
  const baseButtonPath = path.resolve(__dirname, '../components/base/BaseButton.vue');

  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
  const designTokens = fs.readFileSync(designTokensPath, 'utf-8');
  const baseButton = fs.readFileSync(baseButtonPath, 'utf-8');

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
    expect(designTokens).toContain('--turn-waiting-bg:         #64748b;');
    expect(designTokens).toContain('--color-accent-text:  #92400e;');
    expect(designTokens).toContain('--color-primary-text: hsl(var(--color-primary-h) 65% 38%);');

    // Dark theme contrast tokens (>= 4.5:1)
    expect(designTokens).toContain('--color-primary-text: hsl(255 95% 78%);');
    expect(designTokens).toContain('--color-accent-text:  hsl(42 100% 75%);');
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
});
