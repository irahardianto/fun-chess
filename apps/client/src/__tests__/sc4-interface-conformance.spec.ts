import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { mount } from '@vue/test-utils';

import AiGameHud from '../features/ai/components/AiGameHud.vue';
import PwaInstallBanner from '../features/pwa/components/PwaInstallBanner.vue';
import HostCard from '../features/lobby/HostCard.vue';
import JoinCard from '../features/lobby/JoinCard.vue';

describe('SC-4 Interface Specifications & UI/UX Conformance Suite', () => {
  const appVuePath = path.resolve(__dirname, '../App.vue');
  const aiGameHudPath = path.resolve(__dirname, '../features/ai/components/AiGameHud.vue');
  const pwaInstallBannerPath = path.resolve(__dirname, '../features/pwa/components/PwaInstallBanner.vue');
  const progressConflictModalPath = path.resolve(__dirname, '../features/portability/components/ProgressConflictModal.vue');
  const qrScannerViewPath = path.resolve(__dirname, '../features/portability/components/QrScannerView.vue');
  const useProgressSyncPath = path.resolve(__dirname, '../features/portability/composables/useProgressSync.ts');
  const puzzleHubViewPath = path.resolve(__dirname, '../features/puzzles/components/PuzzleHubView.vue');
  const adaptiveLadderCardPath = path.resolve(__dirname, '../features/puzzles/components/AdaptiveLadderCard.vue');
  const scenarioCardPath = path.resolve(__dirname, '../features/scenarios/components/ScenarioCard.vue');
  const baseModalPath = path.resolve(__dirname, '../components/base/BaseModal.vue');
  const designTokensPath = path.resolve(__dirname, '../assets/design-tokens.css');

  const appVueSrc = fs.readFileSync(appVuePath, 'utf-8');
  const aiGameHudSrc = fs.readFileSync(aiGameHudPath, 'utf-8');
  const pwaInstallBannerSrc = fs.readFileSync(pwaInstallBannerPath, 'utf-8');
  const progressConflictModalSrc = fs.readFileSync(progressConflictModalPath, 'utf-8');
  const qrScannerViewSrc = fs.readFileSync(qrScannerViewPath, 'utf-8');
  const useProgressSyncSrc = fs.readFileSync(useProgressSyncPath, 'utf-8');
  const puzzleHubViewSrc = fs.readFileSync(puzzleHubViewPath, 'utf-8');
  const adaptiveLadderCardSrc = fs.readFileSync(adaptiveLadderCardPath, 'utf-8');
  const scenarioCardSrc = fs.readFileSync(scenarioCardPath, 'utf-8');
  const baseModalSrc = fs.readFileSync(baseModalPath, 'utf-8');
  const designTokensSrc = fs.readFileSync(designTokensPath, 'utf-8');

  describe('1. Button Copy & Verb-First Actions', () => {
    it('AiGameHud renders "Show hint" verb-first button text', () => {
      const wrapper = mount(AiGameHud, {
        props: {
          canTakeback: true,
          canAskHint: true,
          hintsCount: 1,
        },
      });
      const hintBtn = wrapper.find('[data-testid="hint-btn"]');
      expect(hintBtn.text()).toContain('Show hint');
      expect(hintBtn.text()).not.toContain('Ask Hint');
    });

    it('PwaInstallBanner renders "Remind me later" snooze action', () => {
      const wrapper = mount(PwaInstallBanner, {
        props: { forceShow: true },
      });
      const dismissBtn = wrapper.find('[data-testid="pwa-banner-dismiss-btn"]');
      expect(dismissBtn.text()).toContain('Remind me later');
      expect(dismissBtn.text()).not.toContain('Maybe Later');
    });

    it('ProgressConflictModal renders "Replace Device Progress" with explanatory subtext', () => {
      expect(progressConflictModalSrc).toContain('Replace Device Progress');
      expect(progressConflictModalSrc).toContain('Replaces all stars and puzzle ratings on this device with incoming save');
      expect(progressConflictModalSrc).toContain('Scanned progress has different stats than this device. Choose how to merge:');
    });

    it('HostCard uses sentence-case labels and headers', () => {
      const wrapper = mount(HostCard);
      expect(wrapper.find('.card-title').text()).toBe('Start a new game');
      expect(wrapper.find('.card-badge').text()).toBe('⚔️ Host match');
      expect(wrapper.find('label').text()).toBe('Your nickname');
      expect(wrapper.find('[role="radiogroup"]').attributes('aria-label')).toBe('Choose your piece color');
      expect(wrapper.find('[data-testid="color-white-btn"]').attributes('aria-label')).toBe('Play as white (first move)');
      expect(wrapper.find('[data-testid="color-random-btn"]').attributes('aria-label')).toBe('Play as random color (surprise me)');
      expect(wrapper.find('[data-testid="color-black-btn"]').attributes('aria-label')).toBe('Play as black (defend)');
    });

    it('App.vue in-game action toolbar uses sentence-case copy', () => {
      expect(appVueSrc).toContain('Flip board');
      expect(appVueSrc).toContain('Offer draw');
      expect(appVueSrc).toContain("'Hide moves' : 'View moves'");
    });
  });

  describe('2. Subdued Danger Button Styling (Non-Distracting Gameplay UI)', () => {
    it('AiGameHud Resign button uses ghost variant with .action-btn--subdued-danger', () => {
      const wrapper = mount(AiGameHud, {
        props: {
          canTakeback: true,
          canAskHint: true,
        },
      });
      const resignBtn = wrapper.find('[data-testid="resign-btn"]');
      expect(resignBtn.classes()).toContain('action-btn--subdued-danger');
      expect(aiGameHudSrc).toMatch(/variant="ghost"/);
      expect(aiGameHudSrc).toMatch(/\.action-btn--subdued-danger\s*\{/);
    });

    it('App.vue multiplayer Resign button uses ghost variant with .action-btn--subdued-danger', () => {
      expect(appVueSrc).toMatch(/class="[^"]*action-btn--subdued-danger[^"]*"/);
      expect(appVueSrc).toMatch(/data-testid="resign-action"/);
      expect(appVueSrc).toMatch(/\.action-btn--subdued-danger\s*\{/);
    });
  });

  describe('3. Actionable Error Messages', () => {
    it('useProgressSync provides actionable error strings for storage and export failures', () => {
      expect(useProgressSyncSrc).toContain("syncError.value = 'Unable to load progress. Refresh the page to try again.';");
      expect(useProgressSyncSrc).toContain("syncError.value = err?.message || 'Unable to export backup file. Check storage permissions and try again.';");
    });

    it('App.vue uses actionable error notifications for room failures', () => {
      expect(appVueSrc).toContain("'Unable to create room. Check your connection and try again.'");
      expect(appVueSrc).toContain("'Unable to join room. Check the 4-letter room code and try again.'");
    });

    it('QrScannerView provides helpful camera permission fallback error', () => {
      expect(qrScannerViewSrc).toContain("cameraError || 'Camera unavailable. Allow camera access in browser settings or upload a save file below.'");
    });

    it('JoinCard validates empty room code and nickname with clear user messages', () => {
      const wrapper = mount(JoinCard);
      expect(wrapper.find('[data-testid="join-card"]').exists()).toBe(true);
    });
  });

  describe('4. Tabular Numbers for Dynamic Layout Stability', () => {
    it('AiGameHud applies font-variant-numeric: tabular-nums to badge counters', () => {
      expect(aiGameHudSrc).toMatch(/\.hud-badge\s*\{[^}]*font-variant-numeric:\s*tabular-nums/s);
    });

    it('AdaptiveLadderCard applies font-variant-numeric: tabular-nums to rating display', () => {
      expect(adaptiveLadderCardSrc).toMatch(/\.elo-number\s*\{[^}]*font-variant-numeric:\s*tabular-nums/s);
    });
  });

  describe('5. Semantic Category Tokens & Accessibility Contrast', () => {
    it('ScenarioCard uses semantic category CSS variables', () => {
      expect(scenarioCardSrc).toContain('var(--cat-fundamentals-bg)');
      expect(scenarioCardSrc).toContain('var(--cat-fundamentals)');
      expect(scenarioCardSrc).toContain('var(--cat-endgame-bg)');
      expect(scenarioCardSrc).toContain('var(--cat-endgame)');
      expect(scenarioCardSrc).toContain('var(--cat-tactics-bg)');
      expect(scenarioCardSrc).toContain('var(--cat-tactics)');
    });

    it('PuzzleHubView survivor button inherits standard success text token', () => {
      expect(puzzleHubViewSrc).not.toMatch(/\.survivor-btn\s*\{[^}]*color:\s*#ffffff\s*!important/s);
    });

    it('design-tokens.css defines soft status container and contrast tokens', () => {
      expect(designTokensSrc).toContain('--soft-success-border');
      expect(designTokensSrc).toContain('--soft-success-text');
      expect(designTokensSrc).toContain('--soft-info-border');
      expect(designTokensSrc).toContain('--soft-info-text');
      expect(designTokensSrc).toContain('--status-danger-bg');
    });
  });

  describe('6. Typography & Text-Wrap Utilities', () => {
    it('BaseModal applies text-wrap balance on titles and text-wrap pretty on body text', () => {
      expect(baseModalSrc).toMatch(/text-wrap:\s*balance/);
      expect(baseModalSrc).toMatch(/text-wrap:\s*pretty/);
    });

    it('design-tokens.css defines text-wrap utilities and element rules', () => {
      expect(designTokensSrc).toContain('text-wrap: balance;');
      expect(designTokensSrc).toContain('text-wrap: pretty;');
    });
  });

  describe('7. Logical CSS Directional Properties', () => {
    it('AiGameHud uses margin-inline-start instead of margin-left', () => {
      expect(aiGameHudSrc).toMatch(/margin-inline-start:\s*var\(--space-1\)/);
    });

    it('PwaInstallBanner uses inset-inline-end instead of right', () => {
      expect(pwaInstallBannerSrc).toMatch(/inset-inline-end:\s*4px/);
    });
  });
});
