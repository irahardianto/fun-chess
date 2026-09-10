import { test, expect } from '@playwright/test';
import { LobbyPage, GamePage, AcademyPage, PuzzlesPage } from '../src/index.js';

test.describe('PWA Offline Capabilities and Transitions', () => {
  test.afterEach(async ({ context }) => {
    // Guaranteed teardown: ensure network is restored to online for subsequent tests
    await context.setOffline(false);
  });

  test('displays offline indicator on network drop, toggles compact and expanded modes, and hides upon reconnection', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);

    // 1. Load app while online
    await lobbyPage.goto();

    const indicator = page.locator('[data-testid="offline-indicator"]');
    const expandedPill = page.locator('[data-testid="offline-expanded-pill"]');
    const compactChip = page.locator('[data-testid="offline-compact-chip"]');
    const dismissBtn = page.locator('[data-testid="offline-dismiss-btn"]');

    // Indicator should initially be hidden while online
    await expect(indicator).toBeHidden();

    try {
      // 2. Simulate offline network transition
      await page.context().setOffline(true);

      // 3. Assert offline indicator and expanded pill become visible
      await expect(indicator).toBeVisible({ timeout: 10_000 });
      await expect(expandedPill).toBeVisible({ timeout: 10_000 });

      // Verify headline and subtext reassurance copy
      const headline = expandedPill.locator('.offline-headline');
      const subtext = expandedPill.locator('.offline-subtext');
      await expect(headline).toBeVisible();
      await expect(headline).toHaveText('Playing 100% Offline! ✨');
      await expect(subtext).toBeVisible();
      await expect(subtext).toHaveText('Puzzles, Academy & AI Bots work anywhere!');

      // 4. Test clicking the minimize/dismiss button transitions to compact chip
      await expect(dismissBtn).toBeVisible({ timeout: 5_000 });
      await dismissBtn.click();

      await expect(compactChip).toBeVisible({ timeout: 5_000 });
      await expect(compactChip).toContainText('Offline Ready');
      await expect(expandedPill).toBeHidden();

      // 5. Test clicking compact chip expands back to expanded pill
      await compactChip.click();

      await expect(expandedPill).toBeVisible({ timeout: 5_000 });
      await expect(headline).toHaveText('Playing 100% Offline! ✨');
      await expect(compactChip).toBeHidden();

      // 6. Restore online status
      await page.context().setOffline(false);

      // 7. Assert offline indicator becomes hidden
      await expect(indicator).toBeHidden({ timeout: 10_000 });
    } finally {
      await page.context().setOffline(false);
    }
  });

  test('maintains full offline navigation and gameplay across Solo AI, Academy, and Puzzles without crashing', async ({ page }) => {
    const unhandledErrors: Error[] = [];
    page.on('pageerror', (err) => {
      unhandledErrors.push(err);
    });

    const lobbyPage = new LobbyPage(page);
    const academyPage = new AcademyPage(page);
    const puzzlesPage = new PuzzlesPage(page);
    const gamePage = new GamePage(page);

    // 1. Open lobby and verify initial readiness
    await lobbyPage.goto();

    try {
      // 2. Simulate offline network transition
      await page.context().setOffline(true);

      // Verify offline indicator is visible
      const indicator = page.locator('[data-testid="offline-indicator"]');
      await expect(indicator).toBeVisible({ timeout: 10_000 });

      // Verify app shell remains responsive and navigator reports offline
      const appShell = page.locator('[data-testid="app-shell"]');
      await expect(appShell).toBeVisible();
      const isOnline = await page.evaluate(() => navigator.onLine);
      expect(isOnline).toBe(false);

      // 3. Navigate to Solo AI mascot selection
      await lobbyPage.selectMode('solo_ai');
      const soloAiPanel = page.locator('[data-testid="solo-ai-panel"]');
      await expect(soloAiPanel).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-testid="mascot-card-peanut"]')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-testid="mascot-card-sparky"]')).toBeVisible({ timeout: 10_000 });

      // 4. Navigate to Chess Academy
      await lobbyPage.openAcademy();
      await academyPage.waitForPanel();
      await expect(academyPage.academyPanel).toBeVisible({ timeout: 10_000 });
      await expect(academyPage.continueLearningHero).toBeVisible({ timeout: 10_000 });

      // 5. Navigate to Tactical Puzzles
      await lobbyPage.openPuzzles();
      await puzzlesPage.waitForHub();
      await expect(puzzlesPage.puzzleHubView).toBeVisible({ timeout: 10_000 });
      await expect(puzzlesPage.drillsCard).toBeVisible({ timeout: 10_000 });
      await expect(puzzlesPage.ladderCard).toBeVisible({ timeout: 10_000 });
      await expect(puzzlesPage.rushCard).toBeVisible({ timeout: 10_000 });

      // 6. Return to Solo AI and launch an offline match vs Peanut
      await lobbyPage.selectMode('solo_ai');
      await expect(soloAiPanel).toBeVisible({ timeout: 10_000 });
      await lobbyPage.startSoloAi('peanut', 'w');

      // Verify solo AI arena loads and board is responsive offline
      await gamePage.waitForArena();
      await expect(page.locator('[data-testid="solo-ai-arena"]')).toBeVisible({ timeout: 15_000 });

      const myTurn = page.locator('.bottom-player-section [data-testid="turn-badge-active"], .bottom-player-section .player-badge.is-active-turn').first();
      await expect(myTurn).toBeVisible({ timeout: 15_000 });

      // Play move 1. e2 -> e4 offline
      await gamePage.makeMove('e2', 'e4');
      await expect(page.locator('[data-square="e4"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });

      // Exit back to lobby via navbar exit button
      const exitBtn = page.locator('[data-testid="exit-solo-ai-btn"]');
      await expect(exitBtn).toBeVisible({ timeout: 10_000 });
      await exitBtn.click();
      await expect(lobbyPage.lobbyView).toBeVisible({ timeout: 10_000 });

      // 7. Verify zero unhandled runtime page errors occurred throughout the offline journey
      expect(unhandledErrors).toEqual([]);
    } finally {
      // 8. Restore online mode
      await page.context().setOffline(false);
      await expect(page.locator('[data-testid="offline-indicator"]')).toBeHidden({ timeout: 10_000 });
    }
  });

  test('verifies service worker platform compatibility and cached shell stability across online/offline cycles', async ({ page }) => {
    const unhandledErrors: Error[] = [];
    page.on('pageerror', (err) => {
      unhandledErrors.push(err);
    });

    const lobbyPage = new LobbyPage(page);
    await lobbyPage.goto();

    // Verify Service Worker API exists on window navigator
    const hasServiceWorkerSupport = await page.evaluate(() => 'serviceWorker' in navigator);
    expect(hasServiceWorkerSupport).toBe(true);

    const indicator = page.locator('[data-testid="offline-indicator"]');
    const dismissBtn = page.locator('[data-testid="offline-dismiss-btn"]');
    const compactChip = page.locator('[data-testid="offline-compact-chip"]');

    try {
      // Cycle 1: Go offline
      await page.context().setOffline(true);
      await expect(indicator).toBeVisible({ timeout: 10_000 });

      // Minimize to compact chip
      await dismissBtn.click();
      await expect(compactChip).toBeVisible({ timeout: 5_000 });

      // Cycle 1: Restore online
      await page.context().setOffline(false);
      await expect(indicator).toBeHidden({ timeout: 10_000 });

      // Cycle 2: Go offline again and assert expanded pill restores cleanly
      await page.context().setOffline(true);
      await expect(indicator).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-testid="offline-expanded-pill"]')).toBeVisible({ timeout: 10_000 });

      // App shell should remain intact and interactive
      await expect(page.locator('[data-testid="app-shell"]')).toBeVisible();

      // Cycle 2: Restore online
      await page.context().setOffline(false);
      await expect(indicator).toBeHidden({ timeout: 10_000 });

      // Confirm no unhandled crashes
      expect(unhandledErrors).toEqual([]);
    } finally {
      await page.context().setOffline(false);
    }
  });

  test('triggers PWA install prompt, displays floating banner, snoozes prompt, and opens install modal guide', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    await lobbyPage.goto();

    // 1. Dispatch beforeinstallprompt event with mock prompt() and userChoice
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
      });
      window.dispatchEvent(event);
    });

    // 2. Assert floating install banner becomes visible
    const banner = page.locator('[data-testid="app-modal-container"] [data-testid="pwa-install-banner"]');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner.locator('.banner-title')).toContainText('Install Fun Chess');

    // 3. Click "Remind me later" to snooze install prompt
    const dismissBtn = banner.locator('[data-testid="pwa-banner-dismiss-btn"]');
    await expect(dismissBtn).toBeVisible({ timeout: 5_000 });
    await dismissBtn.click();

    // 4. Assert banner disappears and snooze timestamp is persisted
    await expect(banner).not.toBeVisible({ timeout: 5_000 });
    const snoozedUntil = await page.evaluate(() =>
      localStorage.getItem('fun_chess_pwa_install_snoozed_until'),
    );
    expect(Number(snoozedUntil)).toBeGreaterThan(Date.now());

    // 5. Open PWA install guide modal via lobby header button
    const lobbyInstallBtn = page.locator('[data-testid="lobby-install-btn"]');
    await expect(lobbyInstallBtn).toBeVisible({ timeout: 5_000 });
    // First click consumes deferred prompt event
    await lobbyInstallBtn.click();

    // Second click triggers fallback modal guide
    const modal = page.locator('[data-testid="pwa-install-modal"]');
    if (!(await modal.isVisible())) {
      await lobbyInstallBtn.click();
    }

    // 6. Assert install modal opens with platform guidance cards
    await expect(modal).toBeVisible({ timeout: 5_000 });
    await expect(modal.locator('.platform-tips-list')).toBeVisible();
    await expect(modal.locator('.platform-tip-card')).toHaveCount(2);

    // 7. Close modal via footer action button
    const closeBtn = modal.locator('[data-testid="install-modal-close-btn"]');
    await expect(closeBtn).toBeVisible({ timeout: 5_000 });
    await closeBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
  });
});
