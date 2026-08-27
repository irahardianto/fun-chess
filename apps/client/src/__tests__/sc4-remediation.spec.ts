import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { mount } from '@vue/test-utils';
import AiMascotBadge from '../features/ai/components/AiMascotBadge.vue';
import { peanutPup } from '../features/ai/data/index';

describe('Scope Card SC-4 Remediation Conformance', () => {
  const puzzleRushArenaPath = path.resolve(__dirname, '../features/puzzles/components/PuzzleRushArena.vue');
  const gameOverModalPath = path.resolve(__dirname, '../features/modals/GameOverModal.vue');
  const aiGameOverModalPath = path.resolve(__dirname, '../features/ai/components/AiGameOverModal.vue');
  const soloAiArenaPath = path.resolve(__dirname, '../features/ai/SoloAiArena.vue');
  const aiMascotBadgePath = path.resolve(__dirname, '../features/ai/components/AiMascotBadge.vue');
  const offlineIndicatorPath = path.resolve(__dirname, '../features/pwa/components/OfflineIndicator.vue');
  const pwaInstallBannerPath = path.resolve(__dirname, '../features/pwa/components/PwaInstallBanner.vue');
  const pwaInstallModalPath = path.resolve(__dirname, '../features/pwa/components/PwaInstallModal.vue');
  const mascotFeedbackModalPath = path.resolve(__dirname, '../features/puzzles/components/MascotFeedbackModal.vue');

  const puzzleRushArenaSrc = fs.readFileSync(puzzleRushArenaPath, 'utf-8');
  const gameOverModalSrc = fs.readFileSync(gameOverModalPath, 'utf-8');
  const aiGameOverModalSrc = fs.readFileSync(aiGameOverModalPath, 'utf-8');
  const soloAiArenaSrc = fs.readFileSync(soloAiArenaPath, 'utf-8');
  const aiMascotBadgeSrc = fs.readFileSync(aiMascotBadgePath, 'utf-8');
  const offlineIndicatorSrc = fs.readFileSync(offlineIndicatorPath, 'utf-8');
  const pwaInstallBannerSrc = fs.readFileSync(pwaInstallBannerPath, 'utf-8');
  const pwaInstallModalSrc = fs.readFileSync(pwaInstallModalPath, 'utf-8');
  const mascotFeedbackModalSrc = fs.readFileSync(mascotFeedbackModalPath, 'utf-8');

  it('1. [Colors - Finding 2]: PuzzleRushArena uses var(--text-on-success) for time-bonus-notification', () => {
    expect(puzzleRushArenaSrc).toMatch(/\.time-bonus-notification\s*\{[^}]*color:\s*var\(--text-on-success/s);
  });

  it('2. [Colors - Finding 3]: GameOverModal and AiGameOverModal use var(--color-accent-text) for victory headlines', () => {
    expect(gameOverModalSrc).toMatch(/\.banner-headline\.is-victory\s*\{[^}]*color:\s*var\(--color-accent-text\)/s);
    expect(aiGameOverModalSrc).toMatch(/\.banner-headline\.is-victory\s*\{[^}]*color:\s*var\(--color-accent-text\)/s);
  });

  it('3. [Accessibility - Finding 6]: SoloAiArena, AiMascotBadge, and OfflineIndicator contain persistent live regions', () => {
    // SoloAiArena has persistent role="status" and aria-live="polite"
    expect(soloAiArenaSrc).toMatch(/<div[^>]*class="sr-only"[^>]*role="status"[^>]*aria-live="polite"/);

    // AiMascotBadge has persistent live region
    expect(aiMascotBadgeSrc).toMatch(/<div[^>]*class="sr-only"[^>]*role="status"[^>]*aria-live="polite"/);

    // OfflineIndicator has persistent live region
    expect(offlineIndicatorSrc).toMatch(/<div[^>]*class="sr-only"[^>]*role="status"[^>]*aria-live="polite"/);
  });

  it('4. [Layout - Finding 8]: AiMascotBadge uses logical directional CSS properties', () => {
    expect(aiMascotBadgeSrc).toMatch(/\.turn-status-pill\s*\{[^}]*margin-inline-start:\s*auto/s);
    expect(aiMascotBadgeSrc).toMatch(/inset-inline-start:\s*24px/);
    expect(aiMascotBadgeSrc).toMatch(/border-inline-start:\s*2px\s+solid/);
  });

  it('5. [Layout - Finding 9]: PwaInstallBanner and OfflineIndicator apply env(safe-area-inset-*) calculations', () => {
    expect(pwaInstallBannerSrc).toContain('env(safe-area-inset-bottom');
    expect(pwaInstallBannerSrc).toContain('env(safe-area-inset-left');
    expect(pwaInstallBannerSrc).toContain('env(safe-area-inset-right');

    expect(offlineIndicatorSrc).toContain('env(safe-area-inset-top');
    expect(offlineIndicatorSrc).toContain('env(safe-area-inset-left');
    expect(offlineIndicatorSrc).toContain('env(safe-area-inset-right');
  });

  it('6. [Writing - Finding 11]: MascotFeedbackModal default confirmText is "Continue" and PwaInstallModal has "Start playing"', () => {
    expect(mascotFeedbackModalSrc).toContain("confirmText: 'Continue'");
    expect(pwaInstallModalSrc).toContain('Start playing');
    expect(pwaInstallModalSrc).not.toContain("Got it, Let's Play!");
  });

  it('7. [Typography - Finding 14]: AiMascotBadge includes :title on mascot-name for accessible truncation', () => {
    expect(aiMascotBadgeSrc).toMatch(/<span[^>]*class="mascot-name"[^>]*:title="props\.mascot\.name"/);

    const wrapper = mount(AiMascotBadge, {
      props: {
        mascot: peanutPup,
      },
    });
    const mascotName = wrapper.find('.mascot-name');
    expect(mascotName.attributes('title')).toBe('Peanut the Pup');
  });
});
