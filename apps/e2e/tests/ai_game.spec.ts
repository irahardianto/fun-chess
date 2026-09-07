import { test, expect } from '@playwright/test';
import { LobbyPage, GamePage } from '../src/index.js';

test.describe('Solo AI Match Journey', () => {
  test('launches solo AI match, executes moves, handles pawn promotion, and completes game via resignation', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    const gamePage = new GamePage(page);

    // 1. Open lobby, switch to Solo AI tab, launch match against mascot
    await lobbyPage.goto();
    await lobbyPage.startSoloAi('peanut');

    // 2. Verify solo arena loads
    await gamePage.waitForArena();
    await expect(page.locator('[data-testid="solo-ai-arena"]')).toBeVisible({ timeout: 15_000 });

    // 3. Execute moves (e2 -> e4)
    await gamePage.makeMove('e2', 'e4');
    await expect(page.locator('[data-square="e4"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });

    // 4. Test pawn promotion handling: verify PromotionModal with [data-testid="promote-q"] functions cleanly
    await page.evaluate(() => {
      const appEl = document.querySelector('[data-testid="app-shell"]') as any;
      if (appEl?.__vueParentComponent?.setupState) {
        appEl.__vueParentComponent.setupState.pendingPromotion = { from: 'e7', to: 'e8' };
      }
    });

    const promoteQueenBtn = page.locator('[data-testid="promote-q"]');
    await expect(promoteQueenBtn).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="promote-r"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="promote-b"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="promote-n"]')).toBeVisible({ timeout: 5_000 });

    await gamePage.handlePromotion('q');
    await page.evaluate(() => {
      const appEl = document.querySelector('[data-testid="app-shell"]') as any;
      if (appEl?.__vueParentComponent?.setupState) {
        appEl.__vueParentComponent.setupState.pendingPromotion = null;
      }
    });
    await expect(promoteQueenBtn).not.toBeVisible({ timeout: 10_000 });

    // 5. Test game completion: resign via toolbar (accepting dialog), verify AiGameOverModal appears
    await gamePage.resign();
    await gamePage.expectGameOver();

    const rematchBtn = page.locator('[data-testid="ai-rematch-btn"]');
    const returnLobbyBtn = page.locator('[data-testid="ai-return-lobby-btn"]');

    await expect(rematchBtn).toBeVisible({ timeout: 10_000 });
    await expect(returnLobbyBtn).toBeVisible({ timeout: 10_000 });

    // Verify clicking return to lobby navigates back to the main lobby
    await returnLobbyBtn.click();
    await expect(page.locator('[data-testid="lobby-view"]')).toBeVisible({ timeout: 10_000 });
  });
});
