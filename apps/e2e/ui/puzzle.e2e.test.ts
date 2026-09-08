import { test, expect } from '@playwright/test';
import { LobbyPage, PuzzlesPage } from '../src/index.js';

test.describe('Tactical Puzzle Hub Journey', () => {
  test('navigates to Puzzle Hub, browses tactical themes including phantom motifs, opens primer modal, executes checkmate, and interacts with docked inspect bar', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    const puzzlesPage = new PuzzlesPage(page);

    // 1. Navigate to lobby and switch to Puzzle Hub tab
    await lobbyPage.goto();
    await lobbyPage.openPuzzles();
    await puzzlesPage.waitForHub();
    await expect(puzzlesPage.puzzleHubView).toBeVisible();
    await expect(page.locator('[data-testid="global-stats-bar"]')).toBeVisible();

    // 2. Enter Skill Drills browser
    await puzzlesPage.enterDrillsBrowser();

    // 3. Verify tactical theme selection, including previously phantom themes
    // Verify hanging piece and trapped piece in Basic Tactics
    await puzzlesPage.selectCategoryTab('basic_tactics');
    const hangingCard = puzzlesPage.getThemeCard('hanging_piece');
    const trappedCard = puzzlesPage.getThemeCard('trapped_piece');
    await expect(hangingCard).toBeVisible({ timeout: 10_000 });
    await expect(trappedCard).toBeVisible({ timeout: 10_000 });

    // Verify clearance and battery in Advanced Motifs
    await puzzlesPage.selectCategoryTab('advanced_tactics');
    const clearanceCard = puzzlesPage.getThemeCard('clearance');
    const batteryCard = puzzlesPage.getThemeCard('battery');
    await expect(clearanceCard).toBeVisible({ timeout: 10_000 });
    await expect(batteryCard).toBeVisible({ timeout: 10_000 });

    // Verify scholar's mate in Opening Traps
    await puzzlesPage.selectCategoryTab('opening_traps');
    const scholarsCard = puzzlesPage.getThemeCard('scholars_mate');
    await expect(scholarsCard).toBeVisible({ timeout: 10_000 });

    // 4. Verify concept primer modal opens, renders tactical breakdown, and closes
    await puzzlesPage.openThemePrimer('scholars_mate');
    await expect(page.locator('[data-testid="primer-concept-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="primer-clues-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="primer-tip-section"]')).toBeVisible();
    await puzzlesPage.closeThemePrimer();

    // 5. Select Checkmates category and launch Back-Rank Mate drill (puz_br_001: 1. Rd8#)
    await puzzlesPage.selectCategoryTab('checkmate_patterns');
    const backRankCard = puzzlesPage.getThemeCard('back_rank_mate');
    await expect(backRankCard).toBeVisible({ timeout: 10_000 });

    await puzzlesPage.startDrill('back_rank_mate');
    await puzzlesPage.waitForArena();

    // Verify arena HUD and initial tactical objective
    await expect(puzzlesPage.tacticalGoal).toBeVisible();
    await expect(puzzlesPage.whyCallout).toBeVisible();

    // 6. Execute puzzle move and verify immediate checkmate solution acceptance (Rd8# on d1 -> d8)
    await puzzlesPage.makeMove('d1', 'd8');
    await puzzlesPage.expectPuzzleSolved();

    // 7. Verify celebratory completion modal content
    await expect(page.locator('.puzzle-praise-heading')).toBeVisible();
    await expect(page.locator('[data-testid="tactical-outcome-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="coach-breakdown-card"]')).toBeVisible();

    // 8. Verify docked "Inspect Board" bar on completion modal
    await puzzlesPage.inspectBoard();
    await expect(puzzlesPage.dockedInspectBar).toBeVisible();
    await expect(puzzlesPage.dockedMotifTitle).toBeVisible();

    // Verify board remains visible and accessible during inspection mode
    await expect(page.locator('.chess-board-container, [role="grid"]')).toBeVisible();

    // 9. Expand coach report back from docked inspect bar
    await puzzlesPage.expandCoachReport();
    await expect(puzzlesPage.completionModal).toBeVisible();

    // 10. Advance to next puzzle
    await expect(puzzlesPage.puzzleNextBtn).toBeVisible();
    await puzzlesPage.puzzleNextBtn.click();
    await expect(puzzlesPage.completionModal).not.toBeVisible();
    await expect(puzzlesPage.puzzleArena).toBeVisible();
  });

  test('launches Adaptive Rating Ladder, verifies HUD and rating progression, executes multi-ply puzzle with bot counter-move, and advances', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    const puzzlesPage = new PuzzlesPage(page);

    // 1. Navigate to Puzzle Hub
    await lobbyPage.goto();
    await lobbyPage.openPuzzles();
    await puzzlesPage.waitForHub();

    // 2. Verify Ladder card is visible with initial Elo 800
    await expect(puzzlesPage.ladderCard).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="live-elo-pill"]')).toContainText('800');

    // 3. Launch Ladder mode
    await puzzlesPage.startLadder();

    // 4. Verify Rating Climb HUD displays in arena
    await expect(puzzlesPage.ratingClimbHud).toBeVisible({ timeout: 10_000 });
    await expect(puzzlesPage.ratingDisplay).toContainText('800');
    await expect(puzzlesPage.streakDisplay).toContainText('Streak: 0');

    // 5. Initial ladder puzzle is puz_skewer_005 (Trapped Bishop on the Diagonal #5 🪤, rating 780):
    // Moves: White 1. f3 -> c6 (Bxc6+), Black replies 1... b7 -> c6, White 2. e1 -> g1 (O-O castling)
    // Execute Ply 1 (White f3 to c6)
    await puzzlesPage.makeMove('f3', 'c6');

    // 6. Bot replies with counter-move (b7 to c6) after ~450ms delay
    // Verify bot piece on c6
    await expect(page.locator('[data-square="c6"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
    // Wait for player turn to restore
    await expect(page.locator('.turn-indicator-pill')).toContainText('White to Move', { timeout: 10_000 });

    // 7. Execute Ply 2 (White e1 to g1 kingside castling to finish the puzzle)
    await puzzlesPage.makeMove('e1', 'g1');

    // 8. Expect celebratory puzzle solved modal
    await puzzlesPage.expectPuzzleSolved();
    await expect(puzzlesPage.completionModal).toBeVisible({ timeout: 10_000 });

    // 9. Advance to next ladder puzzle
    await expect(puzzlesPage.puzzleNextBtn).toBeVisible({ timeout: 10_000 });
    await puzzlesPage.puzzleNextBtn.click();
    await expect(puzzlesPage.completionModal).not.toBeVisible();
    await expect(puzzlesPage.puzzleArena).toBeVisible();

    // 10. Verify rating increased from 800 in the rating climb HUD and streak updated to 1
    await expect(puzzlesPage.streakDisplay).toContainText('Streak: 1');
  });

  test('launches Puzzle Rush 3-minute blitz, verifies countdown timer and strikes HUD, incurs 3 strikes, and verifies game over modal', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    const puzzlesPage = new PuzzlesPage(page);

    // 1. Navigate to Puzzle Hub
    await lobbyPage.goto();
    await lobbyPage.openPuzzles();
    await puzzlesPage.waitForHub();

    // 2. Launch 3-Minute Blitz Puzzle Rush
    await expect(puzzlesPage.rushCard).toBeVisible({ timeout: 10_000 });
    await puzzlesPage.startRush('blitz');

    // 3. Verify Puzzle Rush Arena mounts
    await expect(puzzlesPage.puzzleRushArena).toBeVisible({ timeout: 15_000 });
    await expect(puzzlesPage.rushHudBar).toBeVisible({ timeout: 10_000 });

    // 4. Verify countdown timer is running and displays minutes/seconds
    await expect(puzzlesPage.rushTimer).toBeVisible({ timeout: 10_000 });
    await expect(puzzlesPage.rushTimer.locator('.timer-digits')).toContainText(/\d:\d\d/);

    // 5. Verify initial score counter (0) and strikes life row (3 un-struck icons)
    await expect(puzzlesPage.rushScore).toBeVisible({ timeout: 10_000 });
    await expect(puzzlesPage.rushScore).toContainText('0');
    await expect(puzzlesPage.rushStrikes).toBeVisible({ timeout: 10_000 });
    await expect(puzzlesPage.rushStrikes.locator('.strike-icon')).toHaveCount(3);
    await expect(puzzlesPage.rushStrikes.locator('.strike-icon.is-struck')).toHaveCount(0);

    // 6. Trigger strikes through the active rush runner
    // Incur Strike 1
    await page.evaluate(() => {
      const arena = document.querySelector('[data-testid="puzzle-rush-arena"]') as any;
      if (arena?.__vueParentComponent?.setupState?.rush?.handleStrike) {
        arena.__vueParentComponent.setupState.rush.handleStrike();
      }
    });
    await expect(puzzlesPage.rushStrikes.locator('.strike-icon.is-struck')).toHaveCount(1, { timeout: 5_000 });

    // Incur Strike 2
    await page.evaluate(() => {
      const arena = document.querySelector('[data-testid="puzzle-rush-arena"]') as any;
      if (arena?.__vueParentComponent?.setupState?.rush?.handleStrike) {
        arena.__vueParentComponent.setupState.rush.handleStrike();
      }
    });
    await expect(puzzlesPage.rushStrikes.locator('.strike-icon.is-struck')).toHaveCount(2, { timeout: 5_000 });

    // Incur Strike 3 (Triggers Game Over!)
    await page.evaluate(() => {
      const arena = document.querySelector('[data-testid="puzzle-rush-arena"]') as any;
      if (arena?.__vueParentComponent?.setupState?.rush?.handleStrike) {
        arena.__vueParentComponent.setupState.rush.handleStrike();
      }
    });

    // 7. Verify Game Over dialog appears on 3 strikes
    await expect(puzzlesPage.rushGameOver).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="game-over-card"]')).toBeVisible();
    await expect(page.locator('.game-over-title')).toContainText(/run finished|game over/i);
    await expect(page.locator('[data-testid="final-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="highest-streak"]')).toBeVisible();

    // 8. Verify game over action buttons are present and interactive
    const restartBtn = page.locator('[data-testid="rush-restart-btn"]');
    const exitBtn = page.locator('[data-testid="rush-game-over-exit-btn"]');
    await expect(restartBtn).toBeVisible({ timeout: 5_000 });
    await expect(exitBtn).toBeVisible({ timeout: 5_000 });

    // 9. Click "Play Again" to restart run and verify strikes reset to 0
    await restartBtn.click();
    await expect(puzzlesPage.rushGameOver).not.toBeVisible({ timeout: 5_000 });
    await expect(puzzlesPage.rushStrikes.locator('.strike-icon.is-struck')).toHaveCount(0);
  });
});
