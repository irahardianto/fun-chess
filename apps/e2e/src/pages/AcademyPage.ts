import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model representing the Fun Chess Academy and Lesson Arena.
 */
export class AcademyPage {
  readonly page: Page;
  readonly academyPanel: Locator;
  readonly continueLearningHero: Locator;
  readonly resumeLessonBtn: Locator;
  readonly continueLearningTitle: Locator;
  readonly scenarioArena: Locator;
  readonly scenarioHeaderTitle: Locator;
  readonly stepPill: Locator;
  readonly instructionMainText: Locator;
  readonly askHintBtn: Locator;
  readonly guideHintBubble: Locator;
  readonly bubbleSpeaker: Locator;
  readonly bubbleText: Locator;
  readonly resetBtn: Locator;
  readonly feedbackBanner: Locator;
  readonly board: Locator;
  readonly returnToAcademyBtn: Locator;
  readonly completionModal: Locator;
  readonly completionNextLessonBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.academyPanel = page.locator('[data-testid="academy-panel"]');
    this.continueLearningHero = page.locator('[data-testid="continue-learning-hero"]');
    this.resumeLessonBtn = page.locator('[data-testid="resume-lesson-btn"]');
    this.continueLearningTitle = page.locator('.continue-learning-title');
    this.scenarioArena = page.locator('.scenario-arena-layout');
    this.scenarioHeaderTitle = page.locator('.scenario-header-title');
    this.stepPill = page.locator('.guide-step-pill');
    this.instructionMainText = page.locator('.instruction-main-text');
    this.askHintBtn = page.locator('button:has-text("Hint")');
    this.guideHintBubble = page.locator('.guide-hint-bubble');
    this.bubbleSpeaker = page.locator('.bubble-speaker');
    this.bubbleText = page.locator('.bubble-text');
    this.resetBtn = page.locator('button:has-text("Reset")');
    this.feedbackBanner = page.locator('.guide-feedback-banner');
    this.board = page.locator('.chess-board-container, [role="grid"]');
    this.returnToAcademyBtn = page.locator('button:has-text("Return to Academy")');
    this.completionModal = page.locator('.base-modal-container[role="dialog"]').filter({ hasText: 'Lesson Complete' });
    this.completionNextLessonBtn = page.locator('button:has-text("Next Lesson"), [data-testid="next-lesson-btn"]');
  }

  /**
   * Waits for the Academy browser panel to be visible.
   */
  async waitForPanel(): Promise<void> {
    await expect(this.academyPanel).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Resumes the next uncompleted lesson via the hero card.
   */
  async resumeNextLesson(): Promise<void> {
    await expect(this.resumeLessonBtn).toBeVisible({ timeout: 10_000 });
    await this.resumeLessonBtn.click();
    await this.waitForArena();
  }

  /**
   * Selects a category tab in the curriculum browser.
   */
  async selectCategory(categoryId: string): Promise<void> {
    const tab = this.page.locator(`#academy-tab-${categoryId}`);
    await expect(tab).toBeVisible({ timeout: 10_000 });
    await tab.click();
  }

  /**
   * Selects and launches a specific scenario card by matching its title.
   */
  async selectScenarioByTitle(titlePattern: string | RegExp): Promise<void> {
    const card = this.page.locator('.scenario-card').filter({ hasText: titlePattern }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    const playBtn = card.locator('.scenario-play-btn');
    await expect(playBtn).toBeVisible({ timeout: 10_000 });
    await playBtn.click();
    await this.waitForArena();
  }

  /**
   * Waits for the scenario arena to mount and display interactive controls.
   */
  async waitForArena(): Promise<void> {
    await expect(this.scenarioArena).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Clicks the source square, then the destination square to execute a move.
   */
  async makeMove(from: string, to: string): Promise<void> {
    const fromSquare = this.page.locator(`[data-square="${from}"]`);
    const toSquare = this.page.locator(`[data-square="${to}"]`);

    await expect(fromSquare).toBeVisible({ timeout: 10_000 });
    await fromSquare.click();

    await expect(toSquare).toBeVisible({ timeout: 10_000 });
    await toSquare.click();
  }

  /**
   * Requests a pedagogical hint from the active coach.
   */
  async askForHint(): Promise<void> {
    await expect(this.askHintBtn).toBeVisible({ timeout: 10_000 });
    await this.askHintBtn.click();
    await expect(this.guideHintBubble).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Returns from the active lesson arena back to the academy curriculum list.
   */
  async returnToAcademy(): Promise<void> {
    const modalBtn = this.completionModal.locator('button:has-text("Return to Academy")');
    if (await modalBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await modalBtn.click();
    } else {
      await expect(this.returnToAcademyBtn).toBeVisible({ timeout: 10_000 });
      await this.returnToAcademyBtn.click();
    }
    await this.waitForPanel();
  }
}
