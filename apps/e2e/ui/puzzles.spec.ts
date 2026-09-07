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
});
