import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import type { AppGameMode, MascotId } from '@fun-chess/shared';

/**
 * Page Object Model representing the main Fun Chess Lobby.
 */
export class LobbyPage {
  readonly page: Page;
  readonly lobbyView: Locator;
  readonly hostCard: Locator;
  readonly joinCard: Locator;
  readonly hostNicknameInput: Locator;
  readonly joinNicknameInput: Locator;
  readonly joinRoomCodeInput: Locator;
  readonly hostGameBtn: Locator;
  readonly joinGameBtn: Locator;
  readonly colorWhiteBtn: Locator;
  readonly colorRandomBtn: Locator;
  readonly colorBlackBtn: Locator;
  readonly roomCodeDisplay: Locator;
  readonly quickSyncBtn: Locator;
  readonly startHereBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.lobbyView = page.locator('[data-testid="lobby-view"]');
    this.hostCard = page.locator('[data-testid="host-card"]');
    this.joinCard = page.locator('[data-testid="join-card"]');
    this.hostNicknameInput = page.locator('[data-testid="host-nickname-input"] input');
    this.joinNicknameInput = page.locator('[data-testid="join-nickname-input"] input');
    this.joinRoomCodeInput = page.locator('[data-testid="join-room-code-input"] input');
    this.hostGameBtn = page.locator('[data-testid="host-game-btn"]');
    this.joinGameBtn = page.locator('[data-testid="join-game-btn"]');
    this.colorWhiteBtn = page.locator('[data-testid="color-white-btn"]');
    this.colorRandomBtn = page.locator('[data-testid="color-random-btn"]');
    this.colorBlackBtn = page.locator('[data-testid="color-black-btn"]');
    this.roomCodeDisplay = page.locator('[data-testid="room-code-display"]');
    this.quickSyncBtn = page.locator('[data-testid="lobby-quick-sync-btn"]');
    this.startHereBadge = page.locator('[data-testid="start-here-badge"]');
  }

  /**
   * Navigates to the lobby root view and verifies readiness.
   */
  async goto(path = '/'): Promise<void> {
    await this.page.goto(path);
    await expect(this.lobbyView).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Selects an avatar emoji from the avatar radio group.
   */
  async selectAvatar(emoji: string): Promise<void> {
    const avatarBtn = this.page.locator(`[data-testid="lobby-avatar-option-${emoji}"]`);
    if (!(await avatarBtn.isVisible())) {
      await this.selectMode('multiplayer_lan');
    }
    await expect(avatarBtn).toBeVisible({ timeout: 10_000 });
    await avatarBtn.click();
  }

  /**
   * Retrieves the currently selected avatar emoji.
   */
  async getSelectedAvatar(): Promise<string | null> {
    const selectedBtn = this.page.locator('.avatar-option-btn.is-selected');
    if (!(await selectedBtn.isVisible())) {
      await this.selectMode('multiplayer_lan');
    }
    await expect(selectedBtn).toBeVisible({ timeout: 10_000 });
    if ((await selectedBtn.count()) > 0) {
      return (await selectedBtn.innerText()).trim();
    }
    return null;
  }

  /**
   * Fills host credentials, selects preferred side, and initiates room creation.
   */
  async hostGame(nickname: string, color?: 'w' | 'random' | 'b'): Promise<void> {
    if (!(await this.hostNicknameInput.isVisible())) {
      await this.selectMode('multiplayer_lan');
    }
    await expect(this.hostNicknameInput).toBeVisible({ timeout: 10_000 });
    await this.hostNicknameInput.fill(nickname);

    if (color === 'w') {
      await this.colorWhiteBtn.click();
    } else if (color === 'b') {
      await this.colorBlackBtn.click();
    } else if (color === 'random') {
      await this.colorRandomBtn.click();
    }

    await expect(this.hostGameBtn).toBeEnabled({ timeout: 5_000 });
    await this.hostGameBtn.click();
  }

  /**
   * Retrieves the 4-character room code from the host QR Code modal.
   */
  async getRoomCode(): Promise<string> {
    await expect(this.roomCodeDisplay).toBeVisible({ timeout: 15_000 });

    const codeValueLocator = this.roomCodeDisplay.locator('.code-value');
    if (await codeValueLocator.count() > 0 && await codeValueLocator.isVisible()) {
      const code = (await codeValueLocator.innerText()).trim();
      if (code) return code;
    }

    const rawText = (await this.roomCodeDisplay.innerText()).trim();
    const match = rawText.match(/[A-Z0-9]{4}/);
    if (!match) {
      throw new Error(`Failed to extract 4-character room code from text: "${rawText}"`);
    }
    return match[0];
  }

  /**
   * Fills guest credentials, enters room code, and joins the game room.
   */
  async joinGame(nickname: string, roomCode: string): Promise<void> {
    if (!(await this.joinNicknameInput.isVisible())) {
      await this.selectMode('multiplayer_lan');
    }
    await expect(this.joinNicknameInput).toBeVisible({ timeout: 10_000 });
    await this.joinNicknameInput.fill(nickname);
    await this.joinRoomCodeInput.fill(roomCode);
    await expect(this.joinGameBtn).toBeEnabled({ timeout: 5_000 });
    await this.joinGameBtn.click();
  }

  /**
   * Selects one of the 4 lobby mode tabs in the navigation bar.
   */
  async selectMode(mode: AppGameMode): Promise<void> {
    const tabLocator = this.page.locator(`[data-testid="mode-tab-${mode}"]`);
    await expect(tabLocator).toBeVisible({ timeout: 10_000 });
    await tabLocator.click();
  }

  /**
   * Switches to Solo AI mode and starts a match against the selected mascot.
   */
  async startSoloAi(mascotId: MascotId = 'peanut', color: 'w' | 'b' | 'random' = 'w'): Promise<void> {
    await this.selectMode('solo_ai');

    if (color !== 'w') {
      const colorBtn = this.page.locator(`[data-testid="color-option-${color}"]`);
      await expect(colorBtn).toBeVisible({ timeout: 10_000 });
      await colorBtn.click();
    }

    const mascotCard = this.page.locator(`[data-testid="mascot-card-${mascotId}"]`);
    await expect(mascotCard).toBeVisible({ timeout: 10_000 });

    const challengeBtn = this.page.locator(`[data-testid="challenge-btn-${mascotId}"]`);
    await expect(challengeBtn).toBeVisible({ timeout: 10_000 });
    await challengeBtn.click();
  }

  /**
   * Clicks the quick sync button in the lobby header to open Progress Sync modal.
   */
  async openProgressSync(): Promise<void> {
    await expect(this.quickSyncBtn).toBeVisible({ timeout: 10_000 });
    await this.quickSyncBtn.click();
  }

  /**
   * Switches to Chess Academy mode tab.
   */
  async openAcademy(): Promise<void> {
    await this.selectMode('academy');
  }

  /**
   * Switches to Tactical Puzzle Hub mode tab.
   */
  async openPuzzles(): Promise<void> {
    await this.selectMode('puzzle_hub');
  }
}
