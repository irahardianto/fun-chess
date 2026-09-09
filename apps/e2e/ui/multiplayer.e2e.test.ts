import { test, expect, type Browser, type BrowserContext } from '@playwright/test';
import { LobbyPage, GamePage } from '../src/index.js';

let clientIpCounter = 1;
function newIsolatedContext(browser: Browser): Promise<BrowserContext> {
  const ip = `10.42.${Math.floor(clientIpCounter / 250)}.${(clientIpCounter % 250) + 1}`;
  clientIpCounter++;
  return browser.newContext({
    extraHTTPHeaders: {
      'x-forwarded-for': ip,
    },
  });
}

test.describe('Multiplayer LAN / Online Journey', () => {
  test('creates room, joins via 4-character code, executes moves, and completes via resignation', async ({ browser }) => {
    const hostContext = await newIsolatedContext(browser);
    const guestContext = await newIsolatedContext(browser);

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
    const hostContext = await newIsolatedContext(browser);
    const guestContext = await newIsolatedContext(browser);

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
    const hostContext = await newIsolatedContext(browser);
    const guestContext = await newIsolatedContext(browser);

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
    const hostContext = await newIsolatedContext(browser);
    const guestContext = await newIsolatedContext(browser);

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
    const hostContext = await newIsolatedContext(browser);
    const guestContext = await newIsolatedContext(browser);
    const spectatorContext = await newIsolatedContext(browser);

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
    const hostContext = await newIsolatedContext(browser);
    const guestContext = await newIsolatedContext(browser);

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

  test('handles pawn promotion flow synchronized across Host and Guest', async ({ browser }) => {
    const hostContext = await newIsolatedContext(browser);
    const guestContext = await newIsolatedContext(browser);

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      const hostLobby = new LobbyPage(hostPage);
      const guestLobby = new LobbyPage(guestPage);
      const hostGame = new GamePage(hostPage);
      const guestGame = new GamePage(guestPage);

      // 1. Host creates room and Guest joins
      await hostLobby.goto();
      await hostLobby.hostGame('PromoteHost', 'w');
      const roomCode = await hostLobby.getRoomCode();

      await guestLobby.goto();
      await guestLobby.joinGame('PromoteGuest', roomCode);

      await Promise.all([
        hostGame.waitForArena(),
        guestGame.waitForArena(),
      ]);

      // Move 1: White a2 -> a4, Black b7 -> b5
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 15_000 });
      await hostGame.makeMove('a2', 'a4');
      await expect(guestPage.locator('[data-square="a4"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
      await guestGame.makeMove('b7', 'b5');

      // Move 2: White a4 -> b5 (capture), Black h7 -> h6
      await expect(hostPage.locator('[data-square="b5"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
      await hostGame.makeMove('a4', 'b5');
      await expect(guestPage.locator('[data-square="b5"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
      await guestGame.makeMove('h7', 'h6');

      // Move 3: White b5 -> b6, Black h6 -> h5
      await expect(hostPage.locator('[data-square="h6"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
      await hostGame.makeMove('b5', 'b6');
      await expect(guestPage.locator('[data-square="b6"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
      await guestGame.makeMove('h6', 'h5');

      // Move 4: White b6 -> c7 (capture), Black h5 -> h4
      await expect(hostPage.locator('[data-square="h5"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
      await hostGame.makeMove('b6', 'c7');
      await expect(guestPage.locator('[data-square="c7"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
      await guestGame.makeMove('h5', 'h4');

      // Move 5: White c7 -> b8 (capture knight, pawn advances to 8th rank)
      await expect(hostPage.locator('[data-square="h4"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
      await hostGame.makeMove('c7', 'b8');

      // 2. Host sees PromotionModal dialog with choices (Queen, Knight, Rook, Bishop); Guest does not
      const promoteQueenBtn = hostPage.locator('[data-testid="promote-q"]');
      await expect(promoteQueenBtn).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('[data-testid="promote-q"]')).not.toBeVisible();

      // 3. Host selects Queen
      await promoteQueenBtn.click();

      // 4. Modal dismisses and both clients observe promoted White Queen on b8
      await expect(promoteQueenBtn).not.toBeVisible({ timeout: 5_000 });
      await expect(hostPage.locator('[data-square="b8"] [data-testid="chess-piece"][data-piece="wQ"]')).toBeVisible({ timeout: 10_000 });
      await expect(guestPage.locator('[data-square="b8"] [data-testid="chess-piece"][data-piece="wQ"]')).toBeVisible({ timeout: 10_000 });

      // 5. Turn transfers to Guest (Black)
      await expect(guestPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 10_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('handles rematch decline flow with dialog dismissal and exit to lobby', async ({ browser }) => {
    const hostContext = await newIsolatedContext(browser);
    const guestContext = await newIsolatedContext(browser);

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      const hostLobby = new LobbyPage(hostPage);
      const guestLobby = new LobbyPage(guestPage);
      const hostGame = new GamePage(hostPage);
      const guestGame = new GamePage(guestPage);

      // 1. Host creates room and Guest joins
      await hostLobby.goto();
      await hostLobby.hostGame('DeclineHost', 'w');
      const roomCode = await hostLobby.getRoomCode();

      await guestLobby.goto();
      await guestLobby.joinGame('DeclineGuest', roomCode);

      await Promise.all([
        hostGame.waitForArena(),
        guestGame.waitForArena(),
      ]);

      // 2. Complete game via resignation
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 15_000 });
      await hostGame.resign();

      await Promise.all([
        hostGame.expectGameOver(),
        guestGame.expectGameOver(),
      ]);

      // 3. Host requests rematch
      const hostRematchBtn = hostPage.locator('[data-testid="request-rematch-btn"]');
      await expect(hostRematchBtn).toBeVisible({ timeout: 10_000 });
      await hostRematchBtn.click();

      // 4. Guest receives RematchModal challenge dialog
      const rematchModal = guestPage.locator('[data-testid="rematch-modal"]');
      await expect(rematchModal).toBeVisible({ timeout: 10_000 });

      // 5. Guest declines rematch
      const declineRematchBtn = guestPage.locator('[data-testid="decline-rematch-btn"]');
      await expect(declineRematchBtn).toBeVisible({ timeout: 5_000 });
      await declineRematchBtn.click();

      // 6. Guest's RematchModal dismisses
      await expect(rematchModal).not.toBeVisible({ timeout: 10_000 });

      // 7. Both players can safely return to lobby
      const guestLobbyBtn = guestPage.locator('[data-testid="return-lobby-btn"]');
      await expect(guestLobbyBtn).toBeVisible({ timeout: 10_000 });
      await guestLobbyBtn.click();
      await expect(guestPage.locator('[data-testid="lobby-view"]')).toBeVisible({ timeout: 10_000 });

      const hostLobbyBtn = hostPage.locator('[data-testid="return-lobby-btn"]');
      await expect(hostLobbyBtn).toBeVisible({ timeout: 10_000 });
      await hostLobbyBtn.click();
      await expect(hostPage.locator('[data-testid="lobby-view"]')).toBeVisible({ timeout: 10_000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('handles player disconnect with countdown banner and forfeiture on grace period expiry', async ({ browser }) => {
    test.setTimeout(90_000);

    const hostContext = await newIsolatedContext(browser);
    const guestContext = await newIsolatedContext(browser);

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
      const hostLobby = new LobbyPage(hostPage);
      const guestLobby = new LobbyPage(guestPage);
      const hostGame = new GamePage(hostPage);
      const guestGame = new GamePage(guestPage);

      // 1. Host creates room and Guest joins
      await hostLobby.goto();
      await hostLobby.hostGame('ForfeitHost', 'w');
      const roomCode = await hostLobby.getRoomCode();

      await guestLobby.goto();
      await guestLobby.joinGame('ForfeitGuest', roomCode);

      await Promise.all([
        hostGame.waitForArena(),
        guestGame.waitForArena(),
      ]);

      // 2. Host plays opening move e2 -> e4
      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 15_000 });
      await hostGame.makeMove('e2', 'e4');

      await expect(guestPage.locator('[data-square="e4"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });

      // 3. Guest closes browser window (disconnecting socket)
      await guestContext.close();

      // 4. Host observes disconnect warning banner
      const disconnectBanner = hostPage.locator('.disconnect-warning-banner');
      await expect(disconnectBanner).toBeVisible({ timeout: 10_000 });
      await expect(disconnectBanner).toContainText(/Opponent disconnected.*Waiting for reconnection/i);

      // 5. Host waits for the 60-second grace period to expire, leading to forfeit victory
      await hostGame.expectGameOver(75_000);

      // 6. Host sees victory headline and abandonment game over message
      await expect(hostPage.locator('.banner-headline.is-victory')).toBeVisible({ timeout: 10_000 });
      await expect(hostPage.locator('[data-testid="game-over-message"]')).toContainText(/abandonment|forfeit/i);
    } finally {
      await hostContext.close();
    }
  });

  test('rejects room join with invalid room code format and displays client-side validation error', async ({ browser }) => {
    const guestContext = await newIsolatedContext(browser);
    const guestPage = await guestContext.newPage();

    try {
      const guestLobby = new LobbyPage(guestPage);

      // 1. Guest opens lobby
      await guestLobby.goto();

      // 2. Guest fills nickname and enters invalid 3-character room code
      await guestLobby.joinGame('InvalidCodeGuest', 'ABC');

      // 3. Asserts client-side error appears on join room code input
      const codeInputError = guestPage.locator('[data-testid="join-room-code-input"] .base-input-error');
      await expect(codeInputError).toBeVisible({ timeout: 5_000 });
      await expect(codeInputError).toContainText('Room code must be 4 characters.');

      // 4. Asserts no transition to arena occurs and user remains on lobby
      await expect(guestPage.locator('[data-testid="lobby-view"]')).toBeVisible({ timeout: 5_000 });
      await expect(guestPage.locator('[data-testid="game-arena-container"]')).not.toBeVisible();
    } finally {
      await guestContext.close();
    }
  });

  test('rejects room join with non-existent room code and displays error notification while remaining on lobby', async ({ browser }) => {
    const guestContext = await newIsolatedContext(browser);
    const guestPage = await guestContext.newPage();

    try {
      const guestLobby = new LobbyPage(guestPage);

      // 1. Guest opens lobby
      await guestLobby.goto();

      // 2. Guest enters a non-existent 4-character room code and submits
      await guestLobby.joinGame('GhostGuest', 'ZZZZ');

      // 3. Asserts error notification banner appears
      const errorBanner = guestPage.locator('[data-testid="app-notification-banner"].is-error');
      await expect(errorBanner).toBeVisible({ timeout: 10_000 });
      await expect(errorBanner).toContainText(/does not exist|Unable to join room/i);

      // 4. Asserts user remains on lobby and can edit the code
      await expect(guestPage.locator('[data-testid="lobby-view"]')).toBeVisible({ timeout: 5_000 });
      await expect(guestPage.locator('[data-testid="game-arena-container"]')).not.toBeVisible();
      await expect(guestLobby.joinRoomCodeInput).toBeEnabled();
      await guestLobby.joinRoomCodeInput.fill('YYYY');
      await expect(guestLobby.joinRoomCodeInput).toHaveValue('YYYY');
    } finally {
      await guestContext.close();
    }
  });

  test('rejects third player attempting to join full room with capacity error notification and remains on lobby', async ({ browser }) => {
    const hostContext = await newIsolatedContext(browser);
    const guestContext = await newIsolatedContext(browser);
    const thirdContext = await newIsolatedContext(browser);

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();
    const thirdPage = await thirdContext.newPage();

    try {
      const hostLobby = new LobbyPage(hostPage);
      const guestLobby = new LobbyPage(guestPage);
      const hostGame = new GamePage(hostPage);
      const guestGame = new GamePage(guestPage);
      const thirdLobby = new LobbyPage(thirdPage);

      // 1. Host creates a room (Player 1)
      await hostLobby.goto();
      await hostLobby.hostGame('PlayerOne', 'w');
      const roomCode = await hostLobby.getRoomCode();

      // 2. Guest joins room (Player 2), room enters playing/ready state
      await guestLobby.goto();
      await guestLobby.joinGame('PlayerTwo', roomCode);

      await Promise.all([
        hostGame.waitForArena(),
        guestGame.waitForArena(),
      ]);

      await expect(hostPage.locator('.arena-turn-indicator')).toHaveClass(/is-my-turn/, { timeout: 15_000 });

      // 3. Third player (Player 3) in a 3rd browser context opens lobby and attempts to join the same room code
      await thirdLobby.goto();
      await thirdLobby.joinGame('PlayerThree', roomCode);

      // 4. Asserts Player 3 receives full room rejection error
      const errorBanner = thirdPage.locator('[data-testid="app-notification-banner"].is-error');
      await expect(errorBanner).toBeVisible({ timeout: 10_000 });
      await expect(errorBanner).toContainText(/already has 2|full/i);

      // 5. Asserts Player 3 remains on lobby and does not enter game arena
      await expect(thirdPage.locator('[data-testid="lobby-view"]')).toBeVisible({ timeout: 5_000 });
      await expect(thirdPage.locator('[data-testid="game-arena-container"]')).not.toBeVisible();
    } finally {
      await hostContext.close();
      await guestContext.close();
      await thirdContext.close();
    }
  });
});

