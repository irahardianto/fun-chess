import { test, expect } from '@playwright/test';
import { LobbyPage, GamePage } from '../src/index.js';

test.describe('Multiplayer LAN / Online Journey', () => {
  test('creates room, joins via 4-character code, executes moves, and completes via resignation', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      const hostLobby = new LobbyPage(hostPage);
      const guestLobby = new LobbyPage(guestPage);
      const hostGame = new GamePage(hostPage);
      const guestGame = new GamePage(guestPage);

      // 1. Host opens lobby, enters nickname, selects White, clicks Host Game
      await hostLobby.goto();
      await hostLobby.hostGame('WhiteMaster', 'w');

      // 2. Host retrieves 4-character room code from QR modal
      const roomCode = await hostLobby.getRoomCode();
      expect(roomCode).toMatch(/^[A-Z0-9]{4}$/);

      // 3. Guest opens lobby, enters nickname, enters room code, clicks Join Game
      await guestLobby.goto();
      await guestLobby.joinGame('BlackDefender', roomCode);

      // 4. Both clients transition to [data-testid="game-arena-container"] and status becomes 'playing'
      await Promise.all([
        hostGame.waitForArena(),
        guestGame.waitForArena(),
      ]);

      await expect(hostPage.locator('[data-testid="game-arena-container"]')).toBeVisible();
      await expect(guestPage.locator('[data-testid="game-arena-container"]')).toBeVisible();

      // Wait for match status to become 'playing' (arena turn indicator mounts only when status === 'playing')
      await expect(hostPage.locator('.arena-turn-indicator')).toBeVisible({ timeout: 15_000 });
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });

      // 5. Host plays e2 -> e4
      await hostGame.makeMove('e2', 'e4');

      // 6. Guest verifies board reflects e2 -> e4 and it is Black's turn
      await expect(guestPage.locator('[data-square="e4"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });

      // 7. Guest plays e7 -> e5
      await guestGame.makeMove('e7', 'e5');

      // 8. Host verifies board reflects e7 -> e5 and turn transfers back to White
      await expect(hostPage.locator('[data-square="e5"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });

      // 9. Resignation/completion: Host resigns, verify game over state on both clients
      await hostGame.resign();

      await Promise.all([
        hostGame.expectGameOver(),
        guestGame.expectGameOver(),
      ]);

      await expect(hostPage.locator('[data-testid="request-rematch-btn"]')).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('[data-testid="request-rematch-btn"]')).toBeVisible({ timeout: 10_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
