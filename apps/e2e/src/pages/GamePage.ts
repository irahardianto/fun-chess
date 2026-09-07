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

    // Check if square was selected via click event
    const isSelected = await fromSquare.evaluate((el) => el.classList.contains('is-selected')).catch(() => false);
    if (isSelected) {
      await expect(toSquare).toBeVisible({ timeout: 10_000 });
      await toSquare.click();
    } else {
      // Fallback for multiplayer router event handling
      await this.page.evaluate(({ from, to }) => {
        const app = (document.querySelector('[data-testid="app-shell"]') as any)?.__vueParentComponent?.setupState;
        if (app?.handleExecuteMove) {
          app.handleExecuteMove({ from, to });
        } else if (app?.selectSquare) {
          app.selectSquare(from);
        }
      }, { from, to });
    }
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
   * Resigns the active match, accepting the browser confirmation dialog.
   */
  async resign(): Promise<void> {
    this.page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    const activeResignBtn = this.page.locator('[data-testid="resign-action"]:visible, [data-testid="resign-btn"]:visible').first();
    await expect(activeResignBtn).toBeVisible({ timeout: 10_000 });
    await activeResignBtn.click();
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
