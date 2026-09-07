import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model representing the Fun Chess Game Arena (Multiplayer and Solo AI).
 */
export class GamePage {
  readonly page: Page;
  readonly arenaContainer: Locator;
  readonly soloAiArena: Locator;
  readonly resignAction: Locator;
  readonly offerDrawAction: Locator;
  readonly flipBoardAction: Locator;
  readonly turnIndicator: Locator;

  constructor(page: Page) {
    this.page = page;
    this.arenaContainer = page.locator('[data-testid="game-arena-container"]');
    this.soloAiArena = page.locator('[data-testid="solo-ai-arena"]');
    this.resignAction = page.locator('[data-testid="resign-action"], [data-testid="resign-btn"]');
    this.offerDrawAction = page.locator('[data-testid="offer-draw-action"]');
    this.flipBoardAction = page.locator('[data-testid="flip-board-action"], [data-testid="flip-btn"]');
    this.turnIndicator = page.locator('.arena-turn-indicator, .ai-turn-indicator, [role="status"]');
  }

  /**
   * Waits for either the multiplayer or solo AI arena container to mount and become visible.
   */
  async waitForArena(): Promise<void> {
    const arena = this.page.locator('[data-testid="game-arena-container"], [data-testid="solo-ai-arena"]').first();
    await expect(arena).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Selects the source square, waits for actionability/selection, then clicks the destination square.
   */
  async makeMove(from: string, to: string): Promise<void> {
    const fromSquare = this.page.locator(`[data-square="${from}"]`);
    const toSquare = this.page.locator(`[data-square="${to}"]`);

    await expect(fromSquare).toBeVisible({ timeout: 10_000 });
    await fromSquare.click();

    // Wait for square to be selected via Vue reactivity
    await expect(fromSquare).toHaveClass(/is-selected/, { timeout: 5_000 });
    await expect(toSquare).toBeVisible({ timeout: 10_000 });
    await toSquare.click();
  }

  /**
   * Selects a piece type from the pawn promotion modal.
   */
  async handlePromotion(piece: 'q' | 'r' | 'b' | 'n'): Promise<void> {
    const optionBtn = this.page.locator(`[data-testid="promote-${piece}"]`);
    await expect(optionBtn).toBeVisible({ timeout: 10_000 });
    await optionBtn.click();
  }

  /**
   * Resigns the active match, accepting either browser confirmation dialog or in-app modal.
   */
  async resign(): Promise<void> {
    this.page.once('dialog', async (dialog) => {
      await dialog.accept().catch(() => {});
    });

    const activeResignBtn = this.page.locator('[data-testid="resign-action"]:visible, [data-testid="resign-btn"]:visible').first();
    await expect(activeResignBtn).toBeVisible({ timeout: 10_000 });
    await activeResignBtn.click();

    // Check for in-app confirmation modal (AI arena or Multiplayer arena)
    const confirmBtn = this.page.locator(
      '[data-testid="confirm-resign-btn"]:visible, [data-testid="confirm-proceed-btn"]:visible, button:has-text("Resign"):visible'
    ).last();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }
  }

  /**
   * Offers a draw to the multiplayer opponent.
   */
  async offerDraw(): Promise<void> {
    await expect(this.offerDrawAction).toBeVisible({ timeout: 10_000 });
    await this.offerDrawAction.click();
  }

  /**
   * Waits for the game over modal / rematch dialog to appear on screen.
   */
  async expectGameOver(): Promise<void> {
    const gameOverLocator = this.page.locator(
      '[data-testid="ai-rematch-btn"], [data-testid="request-rematch-btn"], [data-testid="game-over-message"], .ai-game-over-content, .game-over-content'
    ).first();

    await expect(gameOverLocator).toBeVisible({ timeout: 15_000 });
  }
}
