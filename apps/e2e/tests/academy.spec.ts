import { test, expect } from '@playwright/test';
import { LobbyPage, AcademyPage } from '../src/index.js';

test.describe('Chess Academy Journey', () => {
  test('navigates to Academy, validates onboarding badge, hero card, 2-mistake auto-hint, lesson playthrough, alternative checkmate, and mobile hint layout', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    const academyPage = new AcademyPage(page);

    // 1. Verify "⭐ Start Here!" badge for first-time onboarding on Lobby when completedCount is 0
    await lobbyPage.goto();
    await expect(lobbyPage.startHereBadge).toBeVisible();
    await expect(lobbyPage.startHereBadge).toHaveText(/Start Here!/);

    // 2. Navigate to Chess Academy via lobby mode selector
    await lobbyPage.openAcademy();
    await academyPage.waitForPanel();

    // 3. Verify "Continue Learning" hero card in lesson category list
    await expect(academyPage.continueLearningHero).toBeVisible();
    await expect(academyPage.resumeLessonBtn).toBeVisible();
    await expect(academyPage.continueLearningTitle).toContainText('Board Coordinates');

    // 4. Interactive lesson playthrough: Launch first lesson via "Resume Lesson ➡️"
    await academyPage.resumeNextLesson();
    await expect(academyPage.scenarioHeaderTitle).toContainText('Board Coordinates');
    await expect(academyPage.stepPill).toHaveText('Step 1 of 2');

    // Verify auto-hint trigger after 2 mistakes in Academy mode:
    // Mistake 1: Move Rook to a2 instead of e1
    await academyPage.makeMove('a1', 'a2');
    await expect(academyPage.feedbackBanner).toBeVisible({ timeout: 5_000 });
    await expect(academyPage.feedbackBanner).toContainText(/Not quite/);
    await expect(academyPage.guideHintBubble).toBeHidden();

    // Mistake 2: Move Rook to a3 instead of e1
    await academyPage.makeMove('a1', 'a3');
    await expect(academyPage.feedbackBanner).toBeVisible({ timeout: 5_000 });
    await expect(academyPage.feedbackBanner).toContainText(/Not quite/);

    // On the 2nd mistake, verify that the auto-hint bubble ("Peanut’s Hint") appears automatically!
    await expect(academyPage.guideHintBubble).toBeVisible({ timeout: 5_000 });
    await expect(academyPage.bubbleSpeaker).toHaveText(/Peanut’s Hint/);
    await expect(academyPage.bubbleText).toContainText(/Slide your Rook from a1 sideways across the 1st rank to e1/);

    // Execute step 1 correct move: a1 -> e1
    await academyPage.makeMove('a1', 'e1');
    await expect(academyPage.stepPill).toHaveText('Step 2 of 2', { timeout: 10_000 });

    // Execute step 2 move: e1 -> e4
    await academyPage.makeMove('e1', 'e4');

    // Verify lesson completion modal appears
    await expect(academyPage.completionModal).toBeVisible({ timeout: 10_000 });

    // Return to Academy curriculum list via completion modal
    await academyPage.returnToAcademy();

    // Verify "⭐ Start Here!" badge behavior:
    // After completing a lesson and returning to the lobby/academy, verify that the "⭐ Start Here!" badge is hidden!
    await expect(lobbyPage.startHereBadge).toBeHidden();

    // Switch to another tab and verify badge remains hidden
    await lobbyPage.selectMode('multiplayer_lan');
    await expect(lobbyPage.startHereBadge).toBeHidden();

    // Return to Academy
    await lobbyPage.openAcademy();
    await academyPage.waitForPanel();
    await expect(lobbyPage.startHereBadge).toBeHidden();

    // 5. Test sound alternative checkmate acceptance:
    // Switch to Endgames category and launch King + Queen Mate lesson
    await academyPage.selectCategory('endgame_basics');
    await academyPage.selectScenarioByTitle(/King \+ Queen Checkmate/);
    await expect(academyPage.scenarioHeaderTitle).toContainText('King + Queen Checkmate');
    await expect(academyPage.stepPill).toHaveText('Step 1 of 2');

    // On Step 1 (setup: 7k/Q7/5K2/8/8/8/8/8 w - - 0 1), playing a7 -> g7 delivers Qg7# checkmate!
    // Verify validator immediately accepts sound checkmate even though canonical step move is f6 -> g6
    await academyPage.makeMove('a7', 'g7');

    // Immediate checkmate acceptance feedback
    await expect(academyPage.feedbackBanner).toBeVisible({ timeout: 10_000 });
    await expect(academyPage.feedbackBanner).toContainText(/Checkmate!/);

    // Return to Academy to verify mobile layout
    await academyPage.returnToAcademy();

    // 6. Verify mobile hint overlay positioning on 375x667 viewport:
    // Ensure .guide-hint-bubble is in-flow and does NOT occlude squares on ranks 7 and 8
    await page.setViewportSize({ width: 375, height: 667 });

    // Launch Board Coordinates lesson on mobile viewport
    await academyPage.selectCategory('all');
    await academyPage.selectScenarioByTitle(/Board Coordinates/);
    await academyPage.waitForArena();

    // Request hint
    await academyPage.askForHint();
    await expect(academyPage.guideHintBubble).toBeVisible();
    await expect(academyPage.bubbleSpeaker).toHaveText(/Peanut’s Hint/);
    await expect(academyPage.bubbleText).toBeVisible();

    // Verify .guide-hint-bubble is in-flow (not absolute)
    const bubblePosition = await academyPage.guideHintBubble.evaluate(
      (el) => window.getComputedStyle(el).position
    );
    expect(bubblePosition).not.toBe('absolute');

    // Verify hint bubble does NOT occlude squares on ranks 7 and 8 (e.g., e8, h8, a7, h7)
    const squareE8 = page.locator('[data-square="e8"]');
    const squareH8 = page.locator('[data-square="h8"]');
    const squareA7 = page.locator('[data-square="a7"]');
    const squareH7 = page.locator('[data-square="h7"]');
    const squareA1 = page.locator('[data-square="a1"]');
    const squareE1 = page.locator('[data-square="e1"]');

    await expect(squareE8).toBeVisible();
    await expect(squareH8).toBeVisible();
    await expect(squareA7).toBeVisible();
    await expect(squareH7).toBeVisible();
    await expect(squareA1).toBeVisible();
    await expect(squareE1).toBeVisible();

    const hintBox = await academyPage.guideHintBubble.boundingBox();
    const squareE8Box = await squareE8.boundingBox();
    const squareH8Box = await squareH8.boundingBox();
    const squareA7Box = await squareA7.boundingBox();
    const squareH7Box = await squareH7.boundingBox();

    expect(hintBox).not.toBeNull();
    expect(squareE8Box).not.toBeNull();
    expect(squareH8Box).not.toBeNull();
    expect(squareA7Box).not.toBeNull();
    expect(squareH7Box).not.toBeNull();

    // Bounding box of hint bubble is strictly above the chessboard squares
    expect(hintBox!.y + hintBox!.height).toBeLessThanOrEqual(squareE8Box!.y);
    expect(hintBox!.y + hintBox!.height).toBeLessThanOrEqual(squareH8Box!.y);
    expect(hintBox!.y + hintBox!.height).toBeLessThanOrEqual(squareA7Box!.y);
    expect(hintBox!.y + hintBox!.height).toBeLessThanOrEqual(squareH7Box!.y);

    // Explicit geometric overlap check confirming 0 intersection with rank 7 and 8 squares
    const boxesIntersect = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number }
    ) =>
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;

    expect(boxesIntersect(hintBox!, squareE8Box!)).toBe(false);
    expect(boxesIntersect(hintBox!, squareH8Box!)).toBe(false);
    expect(boxesIntersect(hintBox!, squareA7Box!)).toBe(false);
    expect(boxesIntersect(hintBox!, squareH7Box!)).toBe(false);

    // Execute move on mobile while hint overlay is active
    await academyPage.makeMove('a1', 'e1');
    await expect(academyPage.stepPill).toHaveText('Step 2 of 2', { timeout: 10_000 });
  });
});
