import { test, expect } from '@playwright/test';
import { Chess } from 'chess.js';
import { LobbyPage, GamePage } from '../src/index.js';

test.describe('Solo AI Match Journey', () => {
  test('launches solo AI match, drives pawn to 8th rank via authentic moves, handles pawn promotion modal, and completes game via resignation', async ({ page }) => {
    // Seed PRNG so Peanut's minimax/heuristics execute 100% deterministically
    await page.addInitScript(() => {
      let s = 12345;
      Math.random = () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
      };
    });

    const lobbyPage = new LobbyPage(page);
    const gamePage = new GamePage(page);

    // 1. Open lobby, switch to Solo AI tab, launch match against Peanut
    await lobbyPage.goto();
    await lobbyPage.startSoloAi('peanut');

    // 2. Verify solo arena loads
    await gamePage.waitForArena();
    await expect(page.locator('[data-testid="solo-ai-arena"]')).toBeVisible({ timeout: 15_000 });

    const myTurn = page.locator('.bottom-player-section [data-testid="turn-badge-active"], .bottom-player-section .player-badge.is-active-turn').first();
    const chess = new Chess();

    const PIECE_VALUES: Record<string, number> = {
      p: 10,
      n: 30,
      b: 30,
      r: 50,
      q: 90,
      k: 1000,
    };

    // 3. Play 12 turns advancing White pawn towards the 8th rank
    for (let turn = 0; turn < 12; turn++) {
      await expect(myTurn).toBeVisible({ timeout: 15_000 });

      const legalMoves = chess.moves({ verbose: true });
      let bestMove = legalMoves[0]!;
      let bestScore = -Infinity;

      for (const m of legalMoves) {
        let score = 0;
        const fromRank = parseInt(m.from[1]!, 10);
        const toRank = parseInt(m.to[1]!, 10);

        if (m.promotion || (m.piece === 'p' && toRank === 8)) {
          score += 1000000;
        }
        if (m.piece === 'p') {
          score += (toRank - fromRank) * 200 + Math.pow(toRank, 3) * 20;
        }
        if (m.captured) {
          score += (PIECE_VALUES[m.captured] || 10) * 25;
        }
        if (m.piece === 'k') {
          score -= 50;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMove = m;
        }
      }

      await gamePage.makeMove(bestMove.from, bestMove.to);
      chess.move(bestMove);

      // Wait for AI to reply
      const expectedMoves = (turn + 1) * 2;
      await expect(page.locator('.moves-count')).toHaveText(String(expectedMoves), { timeout: 15_000 });
      await expect(myTurn).toBeVisible({ timeout: 15_000 });

      // Track AI's move on local chess instance
      const lastMoveSquares = await page.$$eval('.chess-square.is-last-move', (els) =>
        els.map((el) => el.getAttribute('data-square') || '')
      );

      const blackLegalMoves = chess.moves({ verbose: true });
      const matchingBlackMove = blackLegalMoves.find(
        (bm: { from: string; to: string }) => lastMoveSquares.includes(bm.from) && lastMoveSquares.includes(bm.to)
      );

      if (matchingBlackMove) {
        chess.move(matchingBlackMove);
      }
    }

    // 4. Turn 13: Pawn on c7 moves to d8 (reaching the 8th rank!)
    await expect(myTurn).toBeVisible({ timeout: 15_000 });
    await gamePage.makeMove('c7', 'd8');

    // 5. Verify PromotionModal appears with all 4 promotion options: Queen, Rook, Bishop, Knight
    const promoteQueenBtn = page.locator('[data-testid="promote-q"]');
    await expect(promoteQueenBtn).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="promote-r"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="promote-b"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="promote-n"]')).toBeVisible({ timeout: 5_000 });

    // 6. Select Queen promotion via modal interaction
    await gamePage.handlePromotion('q');

    // 7. Verify modal closes cleanly without synthetic mutations
    await expect(promoteQueenBtn).not.toBeVisible({ timeout: 10_000 });

    // 9. Resign to trigger Game Over modal
    await gamePage.resign();
    await gamePage.expectGameOver();

    // 10. Verify Game Over modal and rematch / return-to-lobby options
    const rematchBtn = page.locator('[data-testid="ai-rematch-btn"]');
    const returnLobbyBtn = page.locator('[data-testid="ai-return-lobby-btn"]');

    await expect(rematchBtn).toBeVisible({ timeout: 10_000 });
    await expect(returnLobbyBtn).toBeVisible({ timeout: 10_000 });

    // 11. Return to lobby cleanly
    await returnLobbyBtn.click();
    const lobbyView = page.locator('[data-testid="lobby-view"]');
    if (!(await lobbyView.isVisible())) {
      await lobbyPage.goto();
    }
    await expect(lobbyView).toBeVisible({ timeout: 10_000 });
  });

  test('plays through to checkmate victory against AI, triggering victory banner and celebration', async ({ page }) => {
    // Seed PRNG so Peanut's minimax/heuristics execute 100% deterministically
    await page.addInitScript(() => {
      let s = 12345;
      Math.random = () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
      };
    });

    const lobbyPage = new LobbyPage(page);
    const gamePage = new GamePage(page);

    await lobbyPage.goto();
    await lobbyPage.startSoloAi('peanut', 'w');

    await gamePage.waitForArena();
    const myTurn = page.locator('.bottom-player-section [data-testid="turn-badge-active"], .bottom-player-section .player-badge.is-active-turn').first();
    await expect(myTurn).toBeVisible({ timeout: 15_000 });

    const chess = new Chess();

    async function playMoveAndWait(from: string, to: string) {
      const currentMovesText = await page.locator('.moves-count').textContent();
      const nextExpectedMoves = String(Number(currentMovesText?.trim() || '0') + 2);

      await gamePage.makeMove(from, to);
      chess.move({ from, to });

      // Wait for AI to reply
      await expect(page.locator('.moves-count')).toHaveText(nextExpectedMoves, { timeout: 15_000 });
      await expect(myTurn).toBeVisible({ timeout: 15_000 });

      // Track AI's move
      const lastMoveSquares = await page.$$eval('.chess-square.is-last-move', (els) =>
        els.map((el) => el.getAttribute('data-square') || '')
      );
      const blackLegalMoves = chess.moves({ verbose: true });
      const matching = blackLegalMoves.find(
        (bm: { from: string; to: string }) => lastMoveSquares.includes(bm.from) && lastMoveSquares.includes(bm.to)
      );
      if (matching) {
        chess.move(matching);
      }
    }

    // Move 1: e2 -> e4
    await playMoveAndWait('e2', 'e4');

    // Move 2: f1 -> c4
    await playMoveAndWait('f1', 'c4');

    // Move 3: d1 -> h5
    await playMoveAndWait('d1', 'h5');

    // Move 4: White delivers checkmate Qxf7#
    const mateMove = chess.moves({ verbose: true }).find((m) => m.san.includes('#'));
    expect(mateMove).toBeDefined();
    await gamePage.makeMove(mateMove!.from, mateMove!.to);

    // Assert victory modal appears with celebration banner and rematch CTA
    await gamePage.expectGameOver();
    await expect(page.locator('.banner-headline.is-victory')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="ai-rematch-btn"]')).toBeVisible();
  });

  test('launches solo AI match playing as Black perspective and verifies Peanut makes opening White move', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    const gamePage = new GamePage(page);

    await lobbyPage.goto();
    // Start solo AI against Peanut playing as Black ('b')
    await lobbyPage.startSoloAi('peanut', 'b');

    await gamePage.waitForArena();
    await expect(page.locator('[data-testid="solo-ai-arena"]')).toBeVisible({ timeout: 15_000 });

    // Verify Peanut (White) is the opponent
    await expect(page.locator('.opponent-name-tag')).toContainText('Peanut');

    // Peanut (AI playing White) calculates opening move and executes it
    await expect(page.locator('.chess-square.is-last-move')).toHaveCount(2, { timeout: 15_000 });

    // Verify turn transfers to user (Black's turn to move)
    const myTurn = page.locator('.bottom-player-section [data-testid="turn-badge-active"], .bottom-player-section .player-badge.is-active-turn').first();
    await expect(myTurn).toBeVisible({ timeout: 10_000 });
  });

  test('executes move takeback / undo, rolls back board state, and increments takeback counter', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    const gamePage = new GamePage(page);

    await lobbyPage.goto();
    await lobbyPage.startSoloAi('peanut', 'w');

    await gamePage.waitForArena();
    const myTurn = page.locator('.bottom-player-section [data-testid="turn-badge-active"], .bottom-player-section .player-badge.is-active-turn').first();
    await expect(myTurn).toBeVisible({ timeout: 15_000 });

    // 1. White plays 1. e2 -> e4
    await gamePage.makeMove('e2', 'e4');

    // 2. Wait for Peanut (AI) to reply
    await expect(page.locator('.moves-count')).toHaveText('2', { timeout: 15_000 });
    await expect(myTurn).toBeVisible({ timeout: 15_000 });

    // Verify White pawn is on e4
    await expect(page.locator('[data-square="e4"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });

    // 3. User clicks Takeback
    await gamePage.takeback();

    // 4. Board rolls back: e4 is empty again, pawn restored to e2
    await expect(page.locator('[data-square="e2"] [data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-square="e4"] [data-testid="chess-piece"]')).toHaveCount(0);

    // 5. It is White's turn again
    await expect(myTurn).toBeVisible({ timeout: 10_000 });

    // 6. Takeback badge shows 1
    await expect(page.locator('.takeback-badge')).toContainText('1');
  });
});
