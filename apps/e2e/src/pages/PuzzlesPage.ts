import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model representing the Tactical Puzzle Hub, Drill Browser, and Arena.
 */
export class PuzzlesPage {
  readonly page: Page;
  readonly puzzleHubView: Locator;
  readonly drillsCard: Locator;
  readonly drillsExploreBtn: Locator;
  readonly drillsBrowserSection: Locator;
  readonly themeDrillSelector: Locator;
  readonly backToHubBtn: Locator;
  readonly primerModal: Locator;
  readonly closePrimerBtn: Locator;
  readonly startDrillFromPrimerBtn: Locator;
  readonly puzzleArena: Locator;
  readonly tacticalGoal: Locator;
  readonly whyCallout: Locator;
  readonly completionModal: Locator;
  readonly inspectBoardBtn: Locator;
  readonly dockedInspectBar: Locator;
  readonly dockedMotifTitle: Locator;
  readonly dockedStepExplanation: Locator;
  readonly expandModalBtn: Locator;
  readonly puzzleNextBtn: Locator;
  readonly dockedNextBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.puzzleHubView = page.locator('[data-testid="puzzle-hub-view"]');
    this.drillsCard = page.locator('[data-testid="mode-card-drills"]');
    this.drillsExploreBtn = page.locator('[data-testid="drills-explore-btn"]');
    this.drillsBrowserSection = page.locator('[data-testid="drills-browser-section"]');
    this.themeDrillSelector = page.locator('[data-testid="theme-drill-selector"]');
    this.backToHubBtn = page.locator('[data-testid="back-to-hub-btn"]');
    this.primerModal = page.locator('[data-testid="theme-primer-modal"]');
    this.closePrimerBtn = page.locator('[data-testid="close-primer-btn"]');
    this.startDrillFromPrimerBtn = page.locator('[data-testid="start-drill-btn"]');
    this.puzzleArena = page.locator('[data-testid="puzzle-arena"]');
    this.tacticalGoal = page.locator('[data-testid="puzzle-tactical-goal"]');
    this.whyCallout = page.locator('[data-testid="puzzle-why-callout"]');
    this.completionModal = page.locator('[data-testid="puzzle-completion-modal"]');
    this.inspectBoardBtn = page.locator('[data-testid="inspect-board-btn"]');
    this.dockedInspectBar = page.locator('[data-testid="docked-inspect-bar"]');
    this.dockedMotifTitle = page.locator('[data-testid="docked-motif-title"]');
    this.dockedStepExplanation = page.locator('[data-testid="docked-step-explanation"]');
    this.expandModalBtn = page.locator('[data-testid="expand-modal-btn"]');
    this.puzzleNextBtn = page.locator('[data-testid="puzzle-next-btn"]');
    this.dockedNextBtn = page.locator('[data-testid="docked-next-btn"]');
  }

  /**
   * Waits for the Puzzle Hub root view to mount.
   */
  async waitForHub(): Promise<void> {
    await expect(this.puzzleHubView).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Enters the Skill Drills browser view from the hub.
   */
  async enterDrillsBrowser(): Promise<void> {
    await expect(this.drillsExploreBtn).toBeVisible({ timeout: 10_000 });
    await this.drillsExploreBtn.click();
    await expect(this.drillsBrowserSection).toBeVisible({ timeout: 10_000 });
    await expect(this.themeDrillSelector).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Selects a category tab in the theme drill browser (e.g. 'all', 'basic_tactics', 'advanced_tactics', 'opening_traps').
   */
  async selectCategoryTab(categoryId: string): Promise<void> {
    const tab = this.page.locator(`[data-testid="filter-tab-${categoryId}"]`);
    await expect(tab).toBeVisible({ timeout: 10_000 });
    await tab.click();
  }

  /**
   * Returns a locator for the theme card of the specified theme ID.
   */
  getThemeCard(themeId: string): Locator {
    return this.page.locator(`[data-testid="theme-card-${themeId}"]`);
  }

  /**
   * Opens the Concept Primer modal for a specific theme.
   */
  async openThemePrimer(themeId: string): Promise<void> {
    const primerBtn = this.page.locator(`[data-testid="theme-primer-btn-${themeId}"]`);
    await expect(primerBtn).toBeVisible({ timeout: 10_000 });
    await primerBtn.click();
    await expect(this.primerModal).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Closes the active Concept Primer modal.
   */
  async closeThemePrimer(): Promise<void> {
    await expect(this.closePrimerBtn).toBeVisible({ timeout: 10_000 });
    await this.closePrimerBtn.click();
    await expect(this.primerModal).not.toBeVisible({ timeout: 10_000 });
  }

  /**
   * Launches a practice drill directly from its theme card.
   */
  async startDrill(themeId: string): Promise<void> {
    const practiceBtn = this.page.locator(`[data-testid="practice-drill-btn-${themeId}"]`);
    await expect(practiceBtn).toBeVisible({ timeout: 10_000 });
    await practiceBtn.click();
    await this.waitForArena();
  }

  /**
   * Waits for the Puzzle Arena to mount and display the chessboard.
   */
  async waitForArena(): Promise<void> {
    await expect(this.puzzleArena).toBeVisible({ timeout: 15_000 });
    await expect(this.page.locator('.chess-board-container, [role="grid"]')).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Executes a chess move on the puzzle board.
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
   * Expects the celebratory Puzzle Completion Modal to appear.
   */
  async expectPuzzleSolved(): Promise<void> {
    await expect(this.completionModal).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Minimizes the completion modal into the docked "Inspect Board" bottom bar.
   */
  async inspectBoard(): Promise<void> {
    await expect(this.inspectBoardBtn).toBeVisible({ timeout: 10_000 });
    await this.inspectBoardBtn.click();
    await expect(this.dockedInspectBar).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Expands the docked bar back into the full completion modal.
   */
  async expandCoachReport(): Promise<void> {
    await expect(this.expandModalBtn).toBeVisible({ timeout: 10_000 });
    await this.expandModalBtn.click();
    await expect(this.completionModal).toBeVisible({ timeout: 10_000 });
  }
}
