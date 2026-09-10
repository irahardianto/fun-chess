import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { mount } from '@vue/test-utils';
import BaseModal from '../components/base/BaseModal.vue';
import BaseButton from '../components/base/BaseButton.vue';
import AiGameHud from '../features/ai/components/AiGameHud.vue';
import HostCard from '../features/lobby/HostCard.vue';
import JoinCard from '../features/lobby/JoinCard.vue';

describe('SC-5 Accessibility (a11y) & Touch Target Verification', () => {
  const baseModalPath = path.resolve(__dirname, '../components/base/BaseModal.vue');
  const baseButtonPath = path.resolve(__dirname, '../components/base/BaseButton.vue');
  const appVuePath = path.resolve(__dirname, '../App.vue');
  const appNavbarPath = path.resolve(__dirname, '../components/layout/AppNavbar.vue');
  const appToastManagerPath = path.resolve(__dirname, '../components/layout/AppToastManager.vue');
  const aiGameHudPath = path.resolve(__dirname, '../features/ai/components/AiGameHud.vue');
  const offlineIndicatorPath = path.resolve(__dirname, '../features/pwa/components/OfflineIndicator.vue');
  const pwaInstallBannerPath = path.resolve(__dirname, '../features/pwa/components/PwaInstallBanner.vue');
  const qrCodeModalPath = path.resolve(__dirname, '../features/lobby/QrCodeModal.vue');
  const qrExportViewPath = path.resolve(__dirname, '../features/portability/components/QrExportView.vue');
  const soloAiArenaPath = path.resolve(__dirname, '../features/ai/SoloAiArena.vue');
  const aiMascotBadgePath = path.resolve(__dirname, '../features/ai/components/AiMascotBadge.vue');
  const scenarioCategoryListPath = path.resolve(__dirname, '../features/scenarios/components/ScenarioCategoryList.vue');
  const scenarioCardPath = path.resolve(__dirname, '../features/scenarios/components/ScenarioCard.vue');

  const baseModalSrc = fs.readFileSync(baseModalPath, 'utf-8');
  const baseButtonSrc = fs.readFileSync(baseButtonPath, 'utf-8');
  const appVueSrc = fs.readFileSync(appVuePath, 'utf-8');
  const appNavbarSrc = fs.existsSync(appNavbarPath) ? fs.readFileSync(appNavbarPath, 'utf-8') : '';
  const appToastManagerSrc = fs.existsSync(appToastManagerPath) ? fs.readFileSync(appToastManagerPath, 'utf-8') : '';
  const appFullSrc = [appVueSrc, appNavbarSrc, appToastManagerSrc].join('\n');
  const aiGameHudSrc = fs.readFileSync(aiGameHudPath, 'utf-8');
  const offlineIndicatorSrc = fs.readFileSync(offlineIndicatorPath, 'utf-8');
  const pwaInstallBannerSrc = fs.readFileSync(pwaInstallBannerPath, 'utf-8');
  const lanConfigSectionPath = path.resolve(__dirname, '../features/lobby/components/LanConfigSection.vue');
  const lanConfigSectionSrc = fs.existsSync(lanConfigSectionPath) ? fs.readFileSync(lanConfigSectionPath, 'utf-8') : '';
  const qrCodeModalSrc = [fs.readFileSync(qrCodeModalPath, 'utf-8'), lanConfigSectionSrc].join('\n');
  const qrExportViewSrc = fs.readFileSync(qrExportViewPath, 'utf-8');
  const soloAiArenaSrc = fs.readFileSync(soloAiArenaPath, 'utf-8');
  const aiMascotBadgeSrc = fs.readFileSync(aiMascotBadgePath, 'utf-8');
  const scenarioCategoryListSrc = fs.readFileSync(scenarioCategoryListPath, 'utf-8');
  const scenarioCardSrc = fs.readFileSync(scenarioCardPath, 'utf-8');

  describe('1. WCAG 2.5.5 Touch Target Sizing (>= 44x44px)', () => {
    it('BaseModal close button enforces 44px minimum touch target', () => {
      expect(baseModalSrc).toMatch(/\.base-modal-close-btn\s*\{[^}]*min-width:\s*44px/s);
      expect(baseModalSrc).toMatch(/\.base-modal-close-btn\s*\{[^}]*min-height:\s*44px/s);
      expect(baseModalSrc).toMatch(/\.base-modal-close-btn\s*\{[^}]*width:\s*44px/s);
      expect(baseModalSrc).toMatch(/\.base-modal-close-btn\s*\{[^}]*height:\s*44px/s);
    });

    it('BaseButton small tactile button enforces 44px min-height on mobile/coarse pointers', () => {
      expect(baseButtonSrc).toMatch(/@media\s*\(\s*pointer:\s*coarse\s*\)\s*,\s*\(\s*max-width:\s*640px\s*\)\s*\{[^}]*\.btn-tactile--sm\s*\{[^}]*min-height:\s*var\(--touch-target-min,\s*44px\)/s);
    });

    it('App.vue navbar icon buttons enforce 44px minimum touch target across viewports', () => {
      expect(appFullSrc).toMatch(/\.nav-icon-btn\s*\{[^}]*min-width:\s*44px/s);
      expect(appFullSrc).toMatch(/\.nav-icon-btn\s*\{[^}]*min-height:\s*44px/s);
      expect(appFullSrc).toMatch(/\.nav-icon-btn\s*\{[^}]*height:\s*44px/s);
    });

    it('AiGameHud action buttons enforce 44px min-width and min-height in base and mobile media query', () => {
      expect(aiGameHudSrc).toMatch(/\.hud-btn\s*\{[^}]*min-height:\s*44px/s);
      expect(aiGameHudSrc).toMatch(/\.hud-btn\s*\{[^}]*min-width:\s*44px/s);
      expect(aiGameHudSrc).toMatch(/@media\s*\(max-width:\s*580px\)\s*\{[^}]*\.hud-btn\s*\{[^}]*min-height:\s*44px/s);
      expect(aiGameHudSrc).toMatch(/@media\s*\(max-width:\s*580px\)\s*\{[^}]*\.hud-btn\s*\{[^}]*min-width:\s*44px/s);
    });

    it('OfflineIndicator dismiss button enforces 44px minimum touch target', () => {
      expect(offlineIndicatorSrc).toMatch(/\.offline-dismiss-btn\s*\{[^}]*min-width:\s*44px/s);
      expect(offlineIndicatorSrc).toMatch(/\.offline-dismiss-btn\s*\{[^}]*min-height:\s*44px/s);
      expect(offlineIndicatorSrc).toMatch(/\.offline-dismiss-btn\s*\{[^}]*width:\s*44px/s);
      expect(offlineIndicatorSrc).toMatch(/\.offline-dismiss-btn\s*\{[^}]*height:\s*44px/s);
    });

    it('PwaInstallBanner close button enforces 44px minimum touch target', () => {
      expect(pwaInstallBannerSrc).toMatch(/\.banner-close-btn\s*\{[^}]*min-width:\s*44px/s);
      expect(pwaInstallBannerSrc).toMatch(/\.banner-close-btn\s*\{[^}]*min-height:\s*44px/s);
      expect(pwaInstallBannerSrc).toMatch(/\.banner-close-btn\s*\{[^}]*width:\s*44px/s);
      expect(pwaInstallBannerSrc).toMatch(/\.banner-close-btn\s*\{[^}]*height:\s*44px/s);
    });

    it('PwaInstallBanner action buttons enforce 44px minimum touch target', () => {
      expect(pwaInstallBannerSrc).toMatch(/\.banner-btn-secondary,\s*\.banner-btn-primary\s*\{[^}]*min-height:\s*44px/s);
      expect(pwaInstallBannerSrc).toMatch(/\.banner-btn-secondary,\s*\.banner-btn-primary\s*\{[^}]*min-width:\s*44px/s);
    });

    it('ScenarioCard action button enforces 44px minimum touch target', () => {
      expect(scenarioCardSrc).toMatch(/\.scenario-play-btn\s*\{[^}]*min-height:\s*44px/s);
      expect(scenarioCardSrc).toMatch(/\.scenario-play-btn\s*\{[^}]*min-width:\s*80px/s);
    });

    it('QrCodeModal LAN config quick prefill chips have accessible target height', () => {
      expect(qrCodeModalSrc).toMatch(/\.prefill-tag\s*\{[^}]*min-height:\s*36px/s);
    });

    it('LobbyView hero action pills and buttons enforce 44px minimum touch target', () => {
      const lobbyViewPath = path.resolve(__dirname, '../features/lobby/LobbyView.vue');
      const lobbyViewSrc = fs.readFileSync(lobbyViewPath, 'utf-8');

      expect(lobbyViewSrc).toMatch(/\.quick-install-btn\s*\{[^}]*min-height:\s*44px/s);
      expect(lobbyViewSrc).toMatch(/\.quick-install-btn\s*\{[^}]*min-width:\s*44px/s);
      expect(lobbyViewSrc).toMatch(/\.quick-sync-btn\s*\{[^}]*min-height:\s*44px/s);
      expect(lobbyViewSrc).toMatch(/\.quick-sync-btn\s*\{[^}]*min-width:\s*44px/s);
      expect(lobbyViewSrc).toMatch(/\.offline-badge-pill\s*\{[^}]*min-height:\s*44px/s);
      expect(lobbyViewSrc).toMatch(/\.offline-badge-pill\s*\{[^}]*min-width:\s*44px/s);
      expect(lobbyViewSrc).toMatch(/\.avatar-option-btn\s*\{[^}]*width:\s*44px/s);
      expect(lobbyViewSrc).toMatch(/\.avatar-option-btn\s*\{[^}]*height:\s*44px/s);
    });

    it('App.vue interactive pills and action buttons enforce 44px minimum touch target', () => {
      expect(appFullSrc).toMatch(/\.navbar-brand\s*\{[^}]*min-height:\s*44px/s);
      expect(appFullSrc).toMatch(/\.navbar-brand\s*\{[^}]*min-width:\s*44px/s);
      expect(appFullSrc).toMatch(/\.room-code-chip\s*\{[^}]*min-height:\s*44px/s);
      expect(appFullSrc).toMatch(/\.room-code-chip\s*\{[^}]*min-width:\s*44px/s);
      expect(appFullSrc).toMatch(/\.nav-install-btn\s*\{[^}]*min-height:\s*44px/s);
      expect(appFullSrc).toMatch(/\.nav-install-btn\s*\{[^}]*min-width:\s*44px/s);
      expect(appFullSrc).toMatch(/\.notification-dismiss-btn\s*\{[^}]*min-width:\s*44px/s);
      expect(appFullSrc).toMatch(/\.notification-dismiss-btn\s*\{[^}]*min-height:\s*44px/s);
    });

    it('ScenarioCategoryList category tab buttons enforce 44px min-height on mobile', () => {
      expect(scenarioCategoryListSrc).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*?\.category-tab-btn\s*\{[\s\S]*?min-height:\s*44px/);
    });

    it('SoloAiArena hint close button enforces 44x44px touch target with flex centering (UX-002)', () => {
      expect(soloAiArenaSrc).toMatch(/\.hint-close-btn\s*\{[^}]*min-width:\s*44px/s);
      expect(soloAiArenaSrc).toMatch(/\.hint-close-btn\s*\{[^}]*min-height:\s*44px/s);
      expect(soloAiArenaSrc).toMatch(/\.hint-close-btn\s*\{[^}]*display:\s*inline-flex/s);
      expect(soloAiArenaSrc).toMatch(/\.hint-close-btn\s*\{[^}]*align-items:\s*center/s);
      expect(soloAiArenaSrc).toMatch(/\.hint-close-btn\s*\{[^}]*justify-content:\s*center/s);
    });

    it('QrScannerView manual drawer toggle enforces 44px minimum touch target with flex centering (UX-002)', () => {
      const qrScannerViewPath = path.resolve(__dirname, '../features/portability/components/QrScannerView.vue');
      const qrScannerViewSrc = fs.readFileSync(qrScannerViewPath, 'utf-8');

      expect(qrScannerViewSrc).toMatch(/\.manual-drawer-toggle\s*\{[^}]*min-height:\s*44px/s);
      expect(qrScannerViewSrc).toMatch(/\.manual-drawer-toggle\s*\{[^}]*display:\s*inline-flex/s);
      expect(qrScannerViewSrc).toMatch(/\.manual-drawer-toggle\s*\{[^}]*align-items:\s*center/s);
      expect(qrScannerViewSrc).toMatch(/\.manual-drawer-toggle\s*\{[^}]*justify-content:\s*center/s);
    });
  });

  describe('2. ARIA Roles, Labels, and Semantic Hierarchy', () => {
    it('BaseModal has proper dialog role, aria-modal, and close button aria-label', () => {
      const wrapper = mount(BaseModal, {
        props: {
          modelValue: true,
          title: 'A11y Test Modal',
        },
        global: {
          stubs: { Teleport: true },
        },
      });

      const dialog = wrapper.find('[role="dialog"]');
      expect(dialog.exists()).toBe(true);
      expect(dialog.attributes('aria-modal')).toBe('true');
      expect(dialog.attributes('aria-labelledby')).toContain('modal-title-');

      const closeBtn = wrapper.find('.base-modal-close-btn');
      expect(closeBtn.exists()).toBe(true);
      expect(closeBtn.attributes('aria-label')).toBe('Close dialog');
    });

    it('BaseButton passes through ariaLabel to aria-label attribute', () => {
      const wrapper = mount(BaseButton, {
        props: {
          ariaLabel: 'Accessible Action',
        },
        slots: {
          default: 'Action',
        },
      });

      expect(wrapper.find('button').attributes('aria-label')).toBe('Accessible Action');
    });

    it('AiGameHud sets toolbar role and informative accessible labels', () => {
      const wrapper = mount(AiGameHud, {
        props: {
          canTakeback: true,
          takebackCount: 2,
          canAskHint: true,
          hintsCount: 1,
          movesCount: 14,
        },
      });

      const toolbar = wrapper.find('[role="toolbar"]');
      expect(toolbar.exists()).toBe(true);
      expect(toolbar.attributes('aria-label')).toBe('Solo Game Actions');

      const takebackBtn = wrapper.find('[data-testid="takeback-btn"]');
      expect(takebackBtn.attributes('aria-label')).toBe('Takeback move, used 2 times');

      const hintBtn = wrapper.find('[data-testid="hint-btn"]');
      expect(hintBtn.attributes('aria-label')).toBe('Ask for a hint, used 1 times');

      const flipBtn = wrapper.find('[data-testid="flip-btn"]');
      expect(flipBtn.attributes('aria-label')).toBe('Flip board perspective');

      const historyBtn = wrapper.find('[data-testid="history-btn"]');
      expect(historyBtn.attributes('aria-label')).toBe('Toggle move history, 14 plies played');

      const resignBtn = wrapper.find('[data-testid="resign-btn"]');
      expect(resignBtn.attributes('aria-label')).toBe('Resign match');
    });

    it('HostCard and JoinCard enforce radiogroup roles, checked states, and error alerts', async () => {
      const hostWrapper = mount(HostCard);
      expect(hostWrapper.find('[role="radiogroup"]').exists()).toBe(true);
      expect(hostWrapper.find('[data-testid="color-random-btn"]').attributes('aria-checked')).toBe('true');

      const joinWrapper = mount(JoinCard, {
        props: {
          errorMessage: 'Room not found.',
        },
      });
      const errorMsg = joinWrapper.find('.base-input-error');
      expect(errorMsg.attributes('role')).toBe('alert');
      expect(joinWrapper.find('[data-testid="join-room-code-input"] input').attributes('aria-invalid')).toBe('true');
    });

    it('QrExportView sets role="img" and accessible aria-label on QR canvas container', () => {
      expect(qrExportViewSrc).toMatch(/class="qr-canvas-frame"\s+role="img"\s+aria-label="QR Code containing user game progress"/);
    });

    it('QrCodeModal includes aria-expanded on IP guide toggle and dynamic aria-labels on prefill buttons', () => {
      expect(qrCodeModalSrc).toMatch(/:aria-expanded="showIpGuide"/);
      expect(qrCodeModalSrc).toMatch(/:aria-label="'Prefill subnet prefix/);
    });

    it('PwaInstallBanner sets role="banner" and aria-label', () => {
      expect(pwaInstallBannerSrc).toMatch(/role="banner"/);
      expect(pwaInstallBannerSrc).toMatch(/aria-label="PWA Installation Offer"/);
      expect(pwaInstallBannerSrc).toMatch(/aria-label="Dismiss install banner"/);
    });

    it('Live regions exist for screen reader announcements across dynamic views', () => {
      expect(appVueSrc).toMatch(/<div[^>]*class="sr-only"[^>]*role="status"[^>]*aria-live="polite"/);
      expect(soloAiArenaSrc).toMatch(/<div[^>]*class="sr-only"[^>]*role="status"[^>]*aria-live="polite"/);
      expect(aiMascotBadgeSrc).toMatch(/<div[^>]*class="sr-only"[^>]*role="status"[^>]*aria-live="polite"/);
      expect(offlineIndicatorSrc).toMatch(/<div[^>]*class="sr-only"[^>]*role="status"[^>]*aria-live="polite"/);
    });
  });
});
