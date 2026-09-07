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

      // 4. Both clients transition to game arena and status becomes 'playing'
      await Promise.all([
        hostGame.waitForArena(),
        guestGame.waitForArena(),
      ]);

      await expect(hostPage.locator('[data-testid="game-arena-container"]')).toBeVisible();
      await expect(guestPage.locator('[data-testid="game-arena-container"]')).toBeVisible();

      // Wait for match status to become 'playing'
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

  test('executes complete Fool\'s Mate checkmate flow between Host and Guest', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      const hostLobby = new LobbyPage(hostPage);
      const guestLobby = new LobbyPage(guestPage);
      const hostGame = new GamePage(hostPage);
      const guestGame = new GamePage(guestPage);

      // 1. Setup room
      await hostLobby.goto();
      await hostLobby.hostGame('FoolWhite', 'w');
      const roomCode = await hostLobby.getRoomCode();

      await guestLobby.goto();
      await guestLobby.joinGame('FoolBlack', roomCode);

      await Promise.all([
        hostGame.waitForArena(),
        guestGame.waitForArena(),
      ]);

      // Move 1: White 1. f3, Black 1... e5
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 15_000 });
      await hostGame.makeMove('f2', 'f3');

      await expect(guestPage.locator('[data-square="f3"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
      await guestGame.makeMove('e7', 'e5');

      // Move 2: White 2. g4, Black 2... Qh4# (Checkmate!)
      await expect(hostPage.locator('[data-square="e5"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
      await hostGame.makeMove('g2', 'g4');

      await expect(guestPage.locator('[data-square="g4"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
      await guestGame.makeMove('d8', 'h4');

      // Assert: Checkmate triggers game over modal on both clients
      await Promise.all([
        hostGame.expectGameOver(),
        guestGame.expectGameOver(),
      ]);

      // Guest (winner as Black) sees victory headline
      await expect(guestPage.locator('.banner-headline.is-victory')).toBeVisible({ timeout: 10_000 });

      // Host (loser as White) sees game over headline
      await expect(hostPage.locator('.banner-headline')).toBeVisible({ timeout: 10_000 });

      // Both see game over message with checkmate reason
      await expect(guestPage.locator('[data-testid="game-over-message"]')).toContainText(/checkmate/i);
      await expect(hostPage.locator('[data-testid="game-over-message"]')).toContainText(/checkmate/i);

      // Both see rematch CTA
      await expect(hostPage.locator('[data-testid="request-rematch-btn"]')).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('[data-testid="request-rematch-btn"]')).toBeVisible({ timeout: 10_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('executes peaceful draw offer and acceptance flow', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      const hostLobby = new LobbyPage(hostPage);
      const guestLobby = new LobbyPage(guestPage);
      const hostGame = new GamePage(hostPage);
      const guestGame = new GamePage(guestPage);

      await hostLobby.goto();
      await hostLobby.hostGame('PeaceHost', 'w');
      const roomCode = await hostLobby.getRoomCode();

      await guestLobby.goto();
      await guestLobby.joinGame('PeaceGuest', roomCode);

      await Promise.all([
        hostGame.waitForArena(),
        guestGame.waitForArena(),
      ]);

      // Host plays e2 -> e4
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 15_000 });
      await hostGame.makeMove('e2', 'e4');

      // Guest plays e7 -> e5
      await expect(guestPage.locator('[data-square="e4"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await guestGame.makeMove('e7', 'e5');

      // Host offers draw
      await expect(hostPage.locator('[data-square="e5"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await hostGame.offerDraw();

      // Guest receives draw offer banner and accepts
      const drawBanner = guestPage.locator('.draw-offer-banner');
      await expect(drawBanner).toBeVisible({ timeout: 10_000 });
      await expect(drawBanner).toContainText('offered a peaceful draw!');

      const acceptDrawBtn = guestPage.locator('.draw-offer-banner button:has-text("Accept draw")');
      await expect(acceptDrawBtn).toBeVisible({ timeout: 5_000 });
      await acceptDrawBtn.click();

      // Both see Game Over modal with Draw outcome
      await Promise.all([
        hostGame.expectGameOver(),
        guestGame.expectGameOver(),
      ]);

      await expect(hostPage.locator('.banner-headline')).toContainText('Draw');
      await expect(guestPage.locator('.banner-headline')).toContainText('Draw');
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('negotiates rematch flow with inverted colors and starts next match', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      const hostLobby = new LobbyPage(hostPage);
      const guestLobby = new LobbyPage(guestPage);
      const hostGame = new GamePage(hostPage);
      const guestGame = new GamePage(guestPage);

      // Match 1: Host is White, Guest is Black
      await hostLobby.goto();
      await hostLobby.hostGame('RematchWhite', 'w');
      const roomCode = await hostLobby.getRoomCode();

      await guestLobby.goto();
      await guestLobby.joinGame('RematchBlack', roomCode);

      await Promise.all([
        hostGame.waitForArena(),
        guestGame.waitForArena(),
      ]);

      // Complete game quickly via resignation to enter game over state
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 15_000 });
      await hostGame.resign();

      await Promise.all([
        hostGame.expectGameOver(),
        guestGame.expectGameOver(),
      ]);

      // Host requests rematch
      const requestRematchBtn = hostPage.locator('[data-testid="request-rematch-btn"]');
      await expect(requestRematchBtn).toBeVisible({ timeout: 10_000 });
      await requestRematchBtn.click();

      // Guest receives RematchModal challenge dialog and accepts
      const acceptRematchBtn = guestPage.locator('[data-testid="accept-rematch-btn"]');
      await expect(acceptRematchBtn).toBeVisible({ timeout: 10_000 });
      await acceptRematchBtn.click();

      // Rematch starts: Both clients return to arena in 'playing' status with inverted colors
      await Promise.all([
        hostGame.waitForArena(),
        guestGame.waitForArena(),
      ]);

      // Guest was Black in Match 1, now is White in Match 2 -> It is Guest's turn to move!
      await expect(guestPage.locator('.arena-turn-indicator')).toBeVisible({ timeout: 15_000 });
      await expect(guestPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });

      // Host was White in Match 1, now is Black in Match 2 -> Host is waiting for Guest's move
      await expect(hostPage.locator('.arena-turn-indicator')).not.toHaveClass(/is-my-turn/, { timeout: 10_000 });

      // Guest plays 1. e4 as White in Match 2
      await guestGame.makeMove('e2', 'e4');

      // Host observes e4 played and now has the active turn
      await expect(hostPage.locator('[data-square="e4"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('enforces room capacity and prevents spectator/third-party disruption of active game', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const spectatorContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();
    const spectatorPage = await spectatorContext.newPage();

    try {
      const hostLobby = new LobbyPage(hostPage);
      const guestLobby = new LobbyPage(guestPage);
      const hostGame = new GamePage(hostPage);
      const guestGame = new GamePage(guestPage);
      const spectatorLobby = new LobbyPage(spectatorPage);

      // 1. Host and Guest start active match
      await hostLobby.goto();
      await hostLobby.hostGame('MainPlayer1', 'w');
      const roomCode = await hostLobby.getRoomCode();

      await guestLobby.goto();
      await guestLobby.joinGame('MainPlayer2', roomCode);

      await Promise.all([
        hostGame.waitForArena(),
        guestGame.waitForArena(),
      ]);

      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 15_000 });

      // 2. Third non-participating client attempts to join active room
      await spectatorLobby.goto();
      await spectatorLobby.joinGame('SpectatorSam', roomCode);

      // 3. Verify room capacity error toast appears for the 3rd client
      const errorToast = spectatorPage.locator('[data-testid="app-notification-banner"].is-error, [role="alert"]');
      await expect(errorToast).toBeVisible({ timeout: 10_000 });
      await expect(errorToast).toContainText(/already has 2 active players|full/i);

      // 4. Verify spectator is not admitted to the arena, remaining on lobby
      await expect(spectatorPage.locator('[data-testid="lobby-view"]')).toBeVisible({ timeout: 10_000 });

      // 5. Verify the active game continues without disruption
      await hostGame.makeMove('e2', 'e4');
      await expect(guestPage.locator('[data-square="e4"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
      await spectatorContext.close();
    }
  });

  test('restores player session and active board state on network reconnect / page refresh', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      const hostLobby = new LobbyPage(hostPage);
      const guestLobby = new LobbyPage(guestPage);
      const hostGame = new GamePage(hostPage);
      const guestGame = new GamePage(guestPage);

      await hostLobby.goto();
      await hostLobby.hostGame('ReconHost', 'w');
      const roomCode = await hostLobby.getRoomCode();

      await guestLobby.goto();
      await guestLobby.joinGame('ReconGuest', roomCode);

      await Promise.all([
        hostGame.waitForArena(),
        guestGame.waitForArena(),
      ]);

      // Host plays e2 -> e4
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 15_000 });
      await hostGame.makeMove('e2', 'e4');

      // Guest verifies receiving move and turn is active
      await expect(guestPage.locator('[data-square="e4"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });

      // Guest refreshes page (simulating disconnect & session restore)
      await guestPage.reload();

      // Guest auto-reconnects via stored session credentials
      await guestGame.waitForArena();
      await expect(guestPage.locator('[data-testid="game-arena-container"]')).toBeVisible({ timeout: 15_000 });

      // Verify restored game state: pawn still on e4 and it is still Guest's turn
      await expect(guestPage.locator('[data-square="e4"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 15_000 });

      // Guest executes e7 -> e5 to prove full interactivity after reconnection
      await guestGame.makeMove('e7', 'e5');

      // Host receives move and turn transfers back to Host
      await expect(hostPage.locator('[data-square="e5"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
