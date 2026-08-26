import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import fs from 'fs';
import path from 'path';

// Import components for mounting verification
import AiMascotBadge from '../features/ai/components/AiMascotBadge.vue';
import ScenarioGuideOverlay from '../features/scenarios/components/ScenarioGuideOverlay.vue';
import { peanutPup, grandmasterOwl } from '../features/ai/data/index';
import type { TutorialStep } from '@fun-chess/shared';

describe('Zero-CLS Layout Stability & Visual Layering Invariants', () => {
  // File paths for static CSS and DOM contract inspection
  const aiMascotBadgePath = path.resolve(__dirname, '../features/ai/components/AiMascotBadge.vue');
  const soloAiArenaPath = path.resolve(__dirname, '../features/ai/SoloAiArena.vue');
  const scenarioGuideOverlayPath = path.resolve(__dirname, '../features/scenarios/components/ScenarioGuideOverlay.vue');
  const scenarioArenaPath = path.resolve(__dirname, '../features/scenarios/ScenarioArena.vue');
  const puzzleArenaPath = path.resolve(__dirname, '../features/puzzles/PuzzleArena.vue');
  const puzzleRushArenaPath = path.resolve(__dirname, '../features/puzzles/components/PuzzleRushArena.vue');
  const appVuePath = path.resolve(__dirname, '../App.vue');
  const lobbyViewPath = path.resolve(__dirname, '../features/lobby/LobbyView.vue');
  const lobbyModeSelectorPath = path.resolve(__dirname, '../features/lobby/LobbyModeSelector.vue');
  const aiOpponentSelectPath = path.resolve(__dirname, '../features/ai/components/AiOpponentSelect.vue');
  const scenarioCategoryListPath = path.resolve(__dirname, '../features/scenarios/components/ScenarioCategoryList.vue');
  const puzzleHubViewPath = path.resolve(__dirname, '../features/puzzles/components/PuzzleHubView.vue');
  const designTokensPath = path.resolve(__dirname, '../assets/design-tokens.css');

  const aiMascotBadgeSrc = fs.readFileSync(aiMascotBadgePath, 'utf-8');
  const soloAiArenaSrc = fs.readFileSync(soloAiArenaPath, 'utf-8');
  const scenarioGuideOverlaySrc = fs.readFileSync(scenarioGuideOverlayPath, 'utf-8');
  const scenarioArenaSrc = fs.readFileSync(scenarioArenaPath, 'utf-8');
  const puzzleArenaSrc = fs.readFileSync(puzzleArenaPath, 'utf-8');
  const puzzleRushArenaSrc = fs.readFileSync(puzzleRushArenaPath, 'utf-8');
  const appVueSrc = fs.readFileSync(appVuePath, 'utf-8');
  const lobbyViewSrc = fs.readFileSync(lobbyViewPath, 'utf-8');
  const lobbyModeSelectorSrc = fs.readFileSync(lobbyModeSelectorPath, 'utf-8');
  const aiOpponentSelectSrc = fs.readFileSync(aiOpponentSelectPath, 'utf-8');
  const scenarioCategoryListSrc = fs.readFileSync(scenarioCategoryListPath, 'utf-8');
  const puzzleHubViewSrc = fs.readFileSync(puzzleHubViewPath, 'utf-8');
  const designTokensSrc = fs.readFileSync(designTokensPath, 'utf-8');

  describe('1. Solo AI Arena Layout Stability & Positioning', () => {
    it('AiMascotBadge.vue has a relative container and absolutely positioned speech bubble overlay', () => {
      // Relative container anchor
      expect(aiMascotBadgeSrc).toMatch(/\.ai-mascot-badge-container\s*\{[^}]*position:\s*relative/s);
      
      // Absolute floating speech bubble positioned below badge
      expect(aiMascotBadgeSrc).toMatch(/\.mascot-speech-bubble\s*\{[^}]*position:\s*absolute/s);
      expect(aiMascotBadgeSrc).toMatch(/\.mascot-speech-bubble\s*\{[^}]*top:\s*calc\(100%\s*\+\s*4px\)/s);
      expect(aiMascotBadgeSrc).toMatch(/\.mascot-speech-bubble\s*\{[^}]*z-index:\s*var\(--z-overlay-dialogue,\s*20\)/s);
      expect(aiMascotBadgeSrc).toMatch(/\.mascot-speech-bubble\s*\{[^}]*pointer-events:\s*auto/s);
    });

    it('SoloAiArena.vue has relative playfield anchor and absolute floating tactical hint overlay', () => {
      // Relative playfield anchor
      expect(soloAiArenaSrc).toMatch(/\.arena-playfield\s*\{[^}]*position:\s*relative/s);

      // Absolute floating hint card overlay
      expect(soloAiArenaSrc).toMatch(/\.active-hint-banner\s*\{[^}]*position:\s*absolute/s);
      expect(soloAiArenaSrc).toMatch(/\.active-hint-banner\s*\{[^}]*top:\s*8px/s);
      expect(soloAiArenaSrc).toMatch(/\.active-hint-banner\s*\{[^}]*left:\s*50%/s);
      expect(soloAiArenaSrc).toMatch(/\.active-hint-banner\s*\{[^}]*transform:\s*translateX\(-50%\)/s);
      expect(soloAiArenaSrc).toMatch(/\.active-hint-banner\s*\{[^}]*z-index:\s*var\(--z-overlay-dialogue,\s*20\)/s);
      expect(soloAiArenaSrc).toMatch(/\.active-hint-banner\s*\{[^}]*max-width:\s*540px/s);
    });

    it('Preserves data-testid attributes for Solo AI components', () => {
      expect(aiMascotBadgeSrc).toContain('data-testid="mascot-dialogue-bubble"');
      expect(soloAiArenaSrc).toContain('data-testid="active-hint-banner"');
    });

    it('AiMascotBadge mounts without layout shift when dialogue changes', async () => {
      const wrapper = mount(AiMascotBadge, {
        props: {
          mascot: peanutPup,
          dialogue: null,
        },
      });

      expect(wrapper.find('.ai-mascot-badge-container').exists()).toBe(true);
      expect(wrapper.find('[data-testid="mascot-dialogue-bubble"]').exists()).toBe(false);

      await wrapper.setProps({ dialogue: 'Woof! Let us play chess! 🐾' });
      const speechBubble = wrapper.find('[data-testid="mascot-dialogue-bubble"]');
      expect(speechBubble.exists()).toBe(true);
      expect(speechBubble.classes()).toContain('mascot-speech-bubble');
      expect(speechBubble.text()).toContain('Woof! Let us play chess! 🐾');
    });

    it('AiMascotBadge maintains avatar and badge dimensions regardless of thinking state', async () => {
      const wrapper = mount(AiMascotBadge, {
        props: {
          mascot: grandmasterOwl,
          isCurrentTurn: true,
          isThinking: false,
        },
      });

      expect(wrapper.find('.badge-card').exists()).toBe(true);
      expect(wrapper.find('.badge-card').classes()).toContain('is-active-turn');
      expect(wrapper.find('.badge-card').classes()).not.toContain('is-thinking');

      await wrapper.setProps({ isThinking: true });
      expect(wrapper.find('.badge-card').classes()).toContain('is-thinking');
      expect(wrapper.find('.thinking-indicator-dot').exists()).toBe(true);
    });
  });

  describe('2. Academy / Scenario Arena Layout Stability & Positioning', () => {
    it('ScenarioGuideOverlay.vue has a relative container and floating overlay banners', () => {
      // Relative container anchor
      expect(scenarioGuideOverlaySrc).toMatch(/\.scenario-guide-container\s*\{[^}]*position:\s*relative/s);

      // Absolute floating hint bubble overlay
      expect(scenarioGuideOverlaySrc).toMatch(/\.guide-hint-bubble\s*\{[^}]*position:\s*absolute/s);
      expect(scenarioGuideOverlaySrc).toMatch(/\.guide-hint-bubble\s*\{[^}]*top:\s*calc\(100%\s*\+\s*8px\)/s);
      expect(scenarioGuideOverlaySrc).toMatch(/\.guide-hint-bubble\s*\{[^}]*left:\s*50%/s);
      expect(scenarioGuideOverlaySrc).toMatch(/\.guide-hint-bubble\s*\{[^}]*transform:\s*translateX\(-50%\)/s);
      expect(scenarioGuideOverlaySrc).toMatch(/\.guide-hint-bubble\s*\{[^}]*z-index:\s*var\(--z-overlay-dialogue,\s*20\)/s);

      // Absolute floating step feedback banner
      expect(scenarioGuideOverlaySrc).toMatch(/\.guide-feedback-banner\s*\{[^}]*position:\s*absolute/s);
      expect(scenarioGuideOverlaySrc).toMatch(/\.guide-feedback-banner\s*\{[^}]*bottom:\s*-16px/s);
      expect(scenarioGuideOverlaySrc).toMatch(/\.guide-feedback-banner\s*\{[^}]*left:\s*50%/s);
      expect(scenarioGuideOverlaySrc).toMatch(/\.guide-feedback-banner\s*\{[^}]*transform:\s*translateX\(-50%\)/s);
      expect(scenarioGuideOverlaySrc).toMatch(/\.guide-feedback-banner\s*\{[^}]*z-index:\s*var\(--z-overlay-guide,\s*15\)/s);
      expect(scenarioGuideOverlaySrc).toMatch(/\.guide-feedback-banner\s*\{[^}]*pointer-events:\s*none/s);
    });

    it('ScenarioArena.vue provides a stable relative frame for the chessboard', () => {
      expect(scenarioArenaSrc).toMatch(/\.scenario-board-relative-frame\s*\{[^}]*position:\s*relative/s);
    });

    it('ScenarioGuideOverlay mounts hints and feedback as overlay elements', async () => {
      const mockStep: TutorialStep = {
        id: 'test-step',
        stepNumber: 1,
        instruction: 'Move pawn to e4',
        conceptExplanation: 'Center control',
        hint: 'Push e2 pawn forward',
        setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        playerColor: 'w',
        allowedMoves: [{ from: 'e2', to: 'e4' }],
        explanationOnSuccess: 'Well done!',
      };

      const wrapper = mount(ScenarioGuideOverlay, {
        props: {
          step: mockStep,
          currentStepIndex: 0,
          totalSteps: 3,
          activeHint: null,
          feedbackMessage: null,
        },
      });

      expect(wrapper.find('.guide-hint-bubble').exists()).toBe(false);
      expect(wrapper.find('.guide-feedback-banner').exists()).toBe(false);

      // Trigger hint
      await wrapper.setProps({ activeHint: 'Push e2 pawn to e4' });
      const hintBubble = wrapper.find('.guide-hint-bubble');
      expect(hintBubble.exists()).toBe(true);
      expect(hintBubble.text()).toContain('Push e2 pawn to e4');

      // Trigger feedback toast (positive)
      await wrapper.setProps({ feedbackMessage: '✨ Correct move!', isStepSuccess: true });
      const feedbackBanner = wrapper.find('.guide-feedback-banner');
      expect(feedbackBanner.exists()).toBe(true);
      expect(feedbackBanner.classes()).toContain('is-positive');
      expect(feedbackBanner.text()).toContain('✨ Correct move!');

      // Trigger warning feedback
      await wrapper.setProps({ feedbackMessage: '💡 Try another move!', isStepSuccess: false });
      expect(wrapper.find('.guide-feedback-banner').classes()).toContain('is-warning');
    });
  });

  describe('3. Tactical Drills & Puzzle Arena Layout Stability & Positioning', () => {
    it('PuzzleArena.vue adopts the floating toast pattern aligned with PuzzleRushArena benchmark', () => {
      // PuzzleRushArena benchmark toast
      expect(puzzleRushArenaSrc).toMatch(/\.rush-feedback-toast\s*\{[^}]*position:\s*absolute/s);
      expect(puzzleRushArenaSrc).toMatch(/\.rush-feedback-toast\s*\{[^}]*top:\s*-12px/s);

      // PuzzleArena feedback toast in .arena-board-slot
      expect(puzzleArenaSrc).toMatch(/\.arena-board-slot\s*\{[^}]*position:\s*relative/s);
      expect(puzzleArenaSrc).toMatch(/\.puzzle-feedback-banner\s*\{[^}]*position:\s*absolute/s);
      expect(puzzleArenaSrc).toMatch(/\.puzzle-feedback-banner\s*\{[^}]*top:\s*-12px/s);
      expect(puzzleArenaSrc).toMatch(/\.puzzle-feedback-banner\s*\{[^}]*left:\s*50%/s);
      expect(puzzleArenaSrc).toMatch(/\.puzzle-feedback-banner\s*\{[^}]*transform:\s*translateX\(-50%\)/s);
      expect(puzzleArenaSrc).toMatch(/\.puzzle-feedback-banner\s*\{[^}]*z-index:\s*var\(--z-overlay-toast,\s*10\)/s);
      expect(puzzleArenaSrc).toMatch(/\.puzzle-feedback-banner\s*\{[^}]*pointer-events:\s*none/s);
      expect(puzzleArenaSrc).toContain('data-testid="puzzle-feedback-banner"');
    });

    it('PuzzleArena template places feedback toast in arena-board-slot instead of puzzle-info-card', () => {
      // In template, .puzzle-feedback-banner should be inside .arena-board-slot
      const templateSection = puzzleArenaSrc.substring(0, puzzleArenaSrc.indexOf('<style'));
      const infoCardIndex = templateSection.indexOf('puzzle-info-card');
      const boardSlotIndex = templateSection.indexOf('arena-board-slot');
      const feedbackBannerIndex = templateSection.indexOf('data-testid="puzzle-feedback-banner"');

      expect(boardSlotIndex).toBeGreaterThan(infoCardIndex);
      expect(feedbackBannerIndex).toBeGreaterThan(boardSlotIndex);
    });
  });

  describe('4. Multiplayer & App Shell Layout Stability & Positioning', () => {
    it('App.vue has a fixed global notification banner positioned below navbar', () => {
      expect(appVueSrc).toMatch(/\.app-notification-banner\s*\{[^}]*position:\s*fixed/s);
      expect(appVueSrc).toMatch(/\.app-notification-banner\s*\{[^}]*top:\s*68px/s);
      expect(appVueSrc).toMatch(/\.app-notification-banner\s*\{[^}]*left:\s*50%/s);
      expect(appVueSrc).toMatch(/\.app-notification-banner\s*\{[^}]*transform:\s*translateX\(-50%\)/s);
      expect(appVueSrc).toMatch(/\.app-notification-banner\s*\{[^}]*z-index:\s*var\(--z-global-notification,\s*100\)/s);
      expect(appVueSrc).toContain('data-testid="app-notification-banner"');
    });

    it('App.vue has a relative arena container and absolute disconnect/draw offer overlay banners', () => {
      // Relative container
      expect(appVueSrc).toMatch(/\.game-arena-container\s*\{[^}]*position:\s*relative/s);

      // Disconnect warning banner
      expect(appVueSrc).toMatch(/\.disconnect-warning-banner\s*\{[^}]*position:\s*absolute/s);
      expect(appVueSrc).toMatch(/\.disconnect-warning-banner\s*\{[^}]*top:\s*8px/s);
      expect(appVueSrc).toMatch(/\.disconnect-warning-banner\s*\{[^}]*left:\s*50%/s);
      expect(appVueSrc).toMatch(/\.disconnect-warning-banner\s*\{[^}]*transform:\s*translateX\(-50%\)/s);
      expect(appVueSrc).toMatch(/\.disconnect-warning-banner\s*\{[^}]*z-index:\s*var\(--z-overlay-alert,\s*30\)/s);

      // Draw offer banner
      expect(appVueSrc).toMatch(/\.draw-offer-banner\s*\{[^}]*position:\s*absolute/s);
      expect(appVueSrc).toMatch(/\.draw-offer-banner\s*\{[^}]*top:\s*8px/s);
      expect(appVueSrc).toMatch(/\.draw-offer-banner\s*\{[^}]*left:\s*50%/s);
      expect(appVueSrc).toMatch(/\.draw-offer-banner\s*\{[^}]*transform:\s*translateX\(-50%\)/s);
      expect(appVueSrc).toMatch(/\.draw-offer-banner\s*\{[^}]*z-index:\s*var\(--z-overlay-alert,\s*30\)/s);
    });
  });

  describe('5. Z-Index Layering Elevation Scale Invariants', () => {
    it('maintains strict z-index ordering across overlay categories', () => {
      const zToast = 10;
      const zGuide = 15;
      const zDialogue = 20;
      const zAlert = 30;
      const zModalBackdrop = 50;
      const zModalContent = 51;
      const zNavbar = 90;
      const zGlobalNotification = 100;

      expect(zToast).toBeLessThan(zGuide);
      expect(zGuide).toBeLessThan(zDialogue);
      expect(zDialogue).toBeLessThan(zAlert);
      expect(zAlert).toBeLessThan(zModalBackdrop);
      expect(zModalBackdrop).toBeLessThan(zModalContent);
      expect(zModalContent).toBeLessThan(zNavbar);
      expect(zNavbar).toBeLessThan(zGlobalNotification);
    });
  });

  describe('6. Responsive Breakpoint Overlay Rules', () => {
    it('defines responsive styles for compact mobile viewports', () => {
      // Check responsive rules in App.vue, ScenarioGuideOverlay.vue, and AiMascotBadge.vue
      expect(appVueSrc).toContain('@media (max-width: 640px)');
      expect(appVueSrc).toContain('@media (max-width: 380px)');
      expect(scenarioGuideOverlaySrc).toContain('@media (max-width: 480px)');
      expect(scenarioGuideOverlaySrc).toContain('@media (max-width: 320px)');
      expect(aiMascotBadgeSrc).toContain('@media (max-width: 480px)');
    });
  });

  describe('7. Homepage Layout Stability & Container Width Unification (SC-1/SC-2 Invariants)', () => {
    it('App.vue sets app-viewport to top-aligned flex-start with 880px max-width to eliminate vertical tab jitter', () => {
      // .app-viewport flex alignment and container width constraints
      expect(appVueSrc).toMatch(/\.app-viewport\s*\{[^}]*justify-content:\s*flex-start/s);
      expect(appVueSrc).toMatch(/\.app-viewport\s*\{[^}]*max-width:\s*880px/s);
      expect(appVueSrc).toMatch(/\.app-viewport\s*\{[^}]*width:\s*100%/s);
      expect(appVueSrc).toMatch(/\.app-viewport\s*\{[^}]*margin:\s*0\s+auto/s);
      expect(appVueSrc).toMatch(/\.app-viewport\s*\{[^}]*box-sizing:\s*border-box/s);
      expect(appVueSrc).toMatch(/\.app-viewport\s*\{[^}]*overflow-x:\s*hidden/s);
      expect(appVueSrc).toMatch(/\.app-viewport\s*\{[^}]*padding:\s*var\(--space-4\)\s+var\(--space-4\)\s+var\(--space-8\)/s);
    });

    it('LobbyModeSelector.vue aligns mode-switcher-container to unified 880px max-width', () => {
      expect(lobbyModeSelectorSrc).toMatch(/\.mode-switcher-container\s*\{[^}]*max-width:\s*880px/s);
      expect(lobbyModeSelectorSrc).toMatch(/\.mode-switcher-container\s*\{[^}]*width:\s*100%/s);
    });

    it('LobbyView.vue unifies lobby-view-container and LAN mode panel to fill 100% of viewport width', () => {
      expect(lobbyViewSrc).toMatch(/\.lobby-view-container\s*\{[^}]*max-width:\s*100%/s);
      expect(lobbyViewSrc).toMatch(/\.lobby-view-container\s*\{[^}]*padding:\s*0/s);
      expect(lobbyViewSrc).toMatch(/\.lan-mode-panel\s*\{[^}]*width:\s*100%/s);
      expect(lobbyViewSrc).toMatch(/\.lan-mode-panel\s*\{[^}]*max-width:\s*100%/s);
    });

    it('LobbyView.vue centers avatar picker group and emoji options symmetrically above cards', () => {
      expect(lobbyViewSrc).toMatch(/\.avatar-picker-group\s*\{[^}]*align-items:\s*center/s);
      expect(lobbyViewSrc).toMatch(/\.avatar-picker-group\s*\{[^}]*text-align:\s*center/s);
      expect(lobbyViewSrc).toMatch(/\.section-label\s*\{[^}]*text-align:\s*center/s);
      expect(lobbyViewSrc).toMatch(/\.avatar-options\s*\{[^}]*justify-content:\s*center/s);
    });

    it('Child views remove conflicting nested max-widths and double-padding to fit 880px viewport container', () => {
      // AiOpponentSelect
      expect(aiOpponentSelectSrc).toMatch(/\.ai-opponent-select\s*\{[^}]*max-width:\s*100%/s);
      expect(aiOpponentSelectSrc).toMatch(/\.ai-opponent-select\s*\{[^}]*padding:\s*0/s);

      // ScenarioCategoryList (Academy Browser)
      expect(scenarioCategoryListSrc).toMatch(/\.academy-browser-container\s*\{[^}]*max-width:\s*100%/s);
      expect(scenarioCategoryListSrc).toMatch(/\.academy-browser-container\s*\{[^}]*padding:\s*0/s);

      // PuzzleHubView
      expect(puzzleHubViewSrc).toMatch(/\.puzzle-hub-view\s*\{[^}]*max-width:\s*100%/s);
      expect(puzzleHubViewSrc).toMatch(/\.puzzle-hub-view\s*\{[^}]*padding:\s*0/s);
    });

    it('enforces scrollbar-gutter: stable across design-tokens.css (:root and html) and App.vue (.app-shell) to permanently eliminate horizontal tab shift', () => {
      expect(designTokensSrc).toMatch(/:root\s*\{[^}]*scrollbar-gutter:\s*stable/s);
      expect(designTokensSrc).toMatch(/html\s*\{[^}]*scrollbar-gutter:\s*stable/s);
      expect(appVueSrc).toMatch(/\.app-shell\s*\{[^}]*scrollbar-gutter:\s*stable/s);
    });

    it('LobbyView.vue ensures academy-panel has width 100% and max-width 100% identical to solo-ai-panel and puzzle-hub-panel', () => {
      expect(lobbyViewSrc).toMatch(/\.solo-ai-panel,\s*\n\s*\.academy-panel,\s*\n\s*\.puzzle-hub-panel\s*\{[^}]*width:\s*100%/s);
      expect(lobbyViewSrc).toMatch(/\.solo-ai-panel,\s*\n\s*\.academy-panel,\s*\n\s*\.puzzle-hub-panel\s*\{[^}]*max-width:\s*100%/s);
    });

    it('ScenarioCategoryList.vue harmonizes academy-browser-container and all children width and box-sizing invariants', () => {
      expect(scenarioCategoryListSrc).toMatch(/\.academy-browser-container\s*\{[^}]*gap:\s*var\(--space-5\)/s);
      expect(scenarioCategoryListSrc).toMatch(/\.academy-browser-container\s*\{[^}]*width:\s*100%/s);
      expect(scenarioCategoryListSrc).toMatch(/\.academy-browser-container\s*\{[^}]*max-width:\s*100%/s);
      expect(scenarioCategoryListSrc).toMatch(/\.academy-browser-container\s*\{[^}]*padding:\s*0/s);
      expect(scenarioCategoryListSrc).toMatch(/\.academy-browser-container\s*\{[^}]*box-sizing:\s*border-box/s);

      // Hero banner
      expect(scenarioCategoryListSrc).toMatch(/\.academy-hero-banner\s*\{[^}]*width:\s*100%/s);
      expect(scenarioCategoryListSrc).toMatch(/\.academy-hero-banner\s*\{[^}]*box-sizing:\s*border-box/s);

      // Category tabs
      expect(scenarioCategoryListSrc).toMatch(/\.academy-category-tabs\s*\{[^}]*width:\s*100%/s);
      expect(scenarioCategoryListSrc).toMatch(/\.academy-category-tabs\s*\{[^}]*box-sizing:\s*border-box/s);

      // Sections list
      expect(scenarioCategoryListSrc).toMatch(/\.academy-sections-list\s*\{[^}]*width:\s*100%/s);
      expect(scenarioCategoryListSrc).toMatch(/\.academy-sections-list\s*\{[^}]*box-sizing:\s*border-box/s);

      // Curriculum section block
      expect(scenarioCategoryListSrc).toMatch(/\.curriculum-section-block\s*\{[^}]*width:\s*100%/s);
      expect(scenarioCategoryListSrc).toMatch(/\.curriculum-section-block\s*\{[^}]*box-sizing:\s*border-box/s);

      // Scenario grid
      expect(scenarioCategoryListSrc).toMatch(/\.scenario-grid\s*\{[^}]*width:\s*100%/s);
      expect(scenarioCategoryListSrc).toMatch(/\.scenario-grid\s*\{[^}]*box-sizing:\s*border-box/s);
    });
  });
});
