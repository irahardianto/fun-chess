import { test, expect } from '@playwright/test';
import { encodeProgressToEnvelope, encodeProgressToQr } from '@fun-chess/shared';
import { LobbyPage, GamePage } from '../src/index.js';

test.describe('Progress Sync & Data Portability Journey', () => {
  test('exports QR and JSON backup, allows manual code paste import without error banner', async ({ page, context }) => {
    // Grant clipboard permissions for browser clipboard interaction
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});

    const lobbyPage = new LobbyPage(page);

    // 1. Open lobby
    await lobbyPage.goto();

    // 2. Click "Save & Sync"
    await lobbyPage.openProgressSync();

    // 3. Verify Progress Sync modal opens with Export tab: QR code canvas is present, download & copy buttons visible
    const qrCanvas = page.locator('.qr-canvas-element, .qr-canvas-frame canvas');
    await expect(qrCanvas).toBeVisible({ timeout: 10_000 });

    const downloadJsonBtn = page.locator('button:has-text("Download funchess-save.json")');
    await expect(downloadJsonBtn).toBeVisible({ timeout: 10_000 });

    const copyQrBtn = page.locator('button:has-text("Copy QR Code Text / Data")');
    await expect(copyQrBtn).toBeVisible({ timeout: 10_000 });

    // 4. Click copy button and verify feedback
    await copyQrBtn.click();
    await expect(page.locator('button:has-text("Copied QR Code Data")')).toBeVisible({ timeout: 10_000 });

    // Retrieve exported QR code data from clipboard
    const exportedCode = await page.evaluate(async () => {
      try {
        return await navigator.clipboard.readText();
      } catch {
        return '';
      }
    });

    // 5. Switch to Import tab (#tab-import)
    const importTab = page.locator('#tab-import');
    await expect(importTab).toBeVisible({ timeout: 10_000 });
    await importTab.click();

    // 6. Open manual code input drawer
    const drawerToggle = page.locator('button:has-text("Paste Code / Manual Text Fallback"), .manual-drawer-toggle');
    await expect(drawerToggle).toBeVisible({ timeout: 10_000 });
    await drawerToggle.click();

    // 7. Paste valid progress payload into #manual-backup-input
    // If clipboard read succeeded with FC1:, use it; otherwise fallback to valid backup envelope JSON
    const payloadToImport = exportedCode.startsWith('FC1:')
      ? exportedCode
      : encodeProgressToEnvelope({
          version: 1,
          exportedAt: Date.now(),
          clientVersion: '1.0.0',
          scenarios: {},
          puzzles: {
            ratingProfile: {
              rating: 800,
              ratingDeviation: 350,
              peakRating: 800,
              totalAttempted: 0,
              totalSolved: 0,
              bestStreak: 0,
              ratingHistory: [],
            },
            themeMastery: {},
            arcadeStats: {
              puzzleRushHighScore: 0,
              puzzleRushBestStreak: 0,
              streakSurvivorHighScore: 0,
              totalRushRuns: 0,
            },
            solvedPuzzles: {},
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
          },
        });

    const manualInput = page.locator('#manual-backup-input');
    await expect(manualInput).toBeVisible({ timeout: 10_000 });
    await manualInput.fill(payloadToImport);

    // 8. Click "Load Progress" button
    const loadProgressBtn = page.locator('button:has-text("Load Progress")');
    await expect(loadProgressBtn).toBeVisible({ timeout: 10_000 });
    await loadProgressBtn.click();

    // 9. Verify progress loads cleanly without error banner
    await expect(page.locator('.sync-error-banner')).not.toBeVisible({ timeout: 10_000 });
  });

  test('displays 3-way conflict resolution modal on divergent save import and completes smart merge', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);

    await lobbyPage.goto();
    await lobbyPage.openProgressSync();

    // 1. Switch to Import tab
    const importTab = page.locator('#tab-import');
    await expect(importTab).toBeVisible({ timeout: 10_000 });
    await importTab.click();

    // 2. Open manual code input drawer
    const drawerToggle = page.locator('button:has-text("Paste Code / Manual Text Fallback"), .manual-drawer-toggle');
    await expect(drawerToggle).toBeVisible({ timeout: 10_000 });
    await drawerToggle.click();

    // 3. Prepare divergent payload with different rating, stars, and future timestamp
    const divergentQr = await encodeProgressToQr({
      version: 1,
      exportedAt: Date.now() + 86400000,
      clientVersion: '1.0.0',
      scenarios: {
        rook_maze: {
          scenarioId: 'rook_maze',
          starsEarned: 3,
          firstCompletedAt: Date.now() + 86400000,
          lastCompletedAt: Date.now() + 86400000,
          attemptsCount: 1,
          hintsUsedTotal: 0,
        },
      },
      puzzles: {
        ratingProfile: {
          rating: 1250,
          ratingDeviation: 120,
          peakRating: 1250,
          totalAttempted: 25,
          totalSolved: 20,
          bestStreak: 8,
          ratingHistory: [],
        },
        themeMastery: {},
        arcadeStats: {
          puzzleRushHighScore: 15,
          puzzleRushBestStreak: 12,
          streakSurvivorHighScore: 18,
          totalRushRuns: 5,
        },
        solvedPuzzles: {},
        createdAt: Date.now(),
        lastActiveAt: Date.now() + 86400000,
      },
    });

    const manualInput = page.locator('#manual-backup-input');
    await expect(manualInput).toBeVisible({ timeout: 10_000 });
    await manualInput.fill(divergentQr);

    // 4. Click "Load Progress"
    const loadProgressBtn = page.locator('button:has-text("Load Progress")');
    await expect(loadProgressBtn).toBeVisible({ timeout: 10_000 });
    await loadProgressBtn.click();

    // 5. Verify ProgressConflictModal opens displaying conflict diff
    const conflictModal = page.locator('.conflict-modal-content');
    await expect(conflictModal).toBeVisible({ timeout: 10_000 });

    // 6. Verify 3 conflict resolution actions: Smart Merge, Replace Device, Keep Local
    const smartMergeBtn = page.locator('button:has-text("Smart Merge (Recommended)")');
    const replaceBtn = page.locator('button:has-text("Replace Device Progress")');
    const keepLocalBtn = page.locator('button:has-text("Keep current progress")');

    await expect(smartMergeBtn).toBeVisible({ timeout: 5_000 });
    await expect(replaceBtn).toBeVisible({ timeout: 5_000 });
    await expect(keepLocalBtn).toBeVisible({ timeout: 5_000 });

    // 7. Verify Projected Smart Merge preview card is present
    await expect(page.locator('[data-testid="projected-merge-outcome"]')).toBeVisible({ timeout: 5_000 });

    // 8. Click Smart Merge to safely unify progress
    await smartMergeBtn.click();

    // 9. Conflict modal dismisses after resolving
    await expect(conflictModal).not.toBeVisible({ timeout: 10_000 });
  });

  test('displays corrupted save rejection banner when importing invalid or malformed JSON payload', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);

    await lobbyPage.goto();
    await lobbyPage.openProgressSync();

    // 1. Switch to Import tab
    const importTab = page.locator('#tab-import');
    await expect(importTab).toBeVisible({ timeout: 10_000 });
    await importTab.click();

    // 2. Open manual code input drawer
    const drawerToggle = page.locator('button:has-text("Paste Code / Manual Text Fallback"), .manual-drawer-toggle');
    await expect(drawerToggle).toBeVisible({ timeout: 10_000 });
    await drawerToggle.click();

    // 3. Fill with corrupted / malformed save payload
    const manualInput = page.locator('#manual-backup-input');
    await expect(manualInput).toBeVisible({ timeout: 10_000 });
    await manualInput.fill('{"invalid_save_data": true, "corrupted": [unclosed');

    // 4. Click "Load Progress"
    const loadProgressBtn = page.locator('button:has-text("Load Progress")');
    await expect(loadProgressBtn).toBeVisible({ timeout: 10_000 });
    await loadProgressBtn.click();

    // 5. Verify .sync-error-banner appears with rejection message
    const errorBanner = page.locator('.sync-error-banner');
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });
    await expect(errorBanner).toContainText(/invalid|unrecognized|validation|format/i);
  });

  test('persists dark mode theme toggle selection in local storage and across page reload', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    await lobbyPage.goto();

    const themeToggleBtn = page.locator('[data-testid="theme-toggle-btn"]');
    await expect(themeToggleBtn).toBeVisible({ timeout: 10_000 });

    const htmlEl = page.locator('html');

    // 1. Toggle to dark mode if currently light
    const currentTheme = await htmlEl.getAttribute('data-theme');
    if (currentTheme !== 'dark') {
      await themeToggleBtn.click();
    }
    await expect(htmlEl).toHaveAttribute('data-theme', 'dark', { timeout: 5_000 });

    // 2. Verify localStorage has 'dark'
    const storedDark = await page.evaluate(() => localStorage.getItem('fun_chess_theme'));
    expect(storedDark).toBe('dark');

    // 3. Reload page and verify dark mode is maintained
    await page.reload();
    await expect(page.locator('[data-testid="lobby-view"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 5_000 });

    // 4. Toggle back to light mode
    const reloadedToggleBtn = page.locator('[data-testid="theme-toggle-btn"]');
    await expect(reloadedToggleBtn).toBeVisible({ timeout: 10_000 });
    await reloadedToggleBtn.click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark', { timeout: 5_000 });

    // 5. Verify localStorage has 'light'
    const storedLight = await page.evaluate(() => localStorage.getItem('fun_chess_theme'));
    expect(storedLight).toBe('light');

    // 6. Reload page and verify light mode persists
    await page.reload();
    await expect(page.locator('[data-testid="lobby-view"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark', { timeout: 5_000 });
  });

  test('supports accessible keyboard navigation and move execution across the chessboard grid', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    const gamePage = new GamePage(page);

    await lobbyPage.goto();
    // Launch a Solo AI match as White to interact with chessboard
    await lobbyPage.startSoloAi('peanut', 'w');
    await gamePage.waitForArena();

    const board = page.locator('[role="grid"]');
    await expect(board).toBeVisible({ timeout: 15_000 });

    // Focus on initial square e2 (White King's Pawn)
    const e2Square = page.locator('[data-square="e2"]');
    await expect(e2Square).toBeVisible({ timeout: 10_000 });
    await e2Square.focus();

    // Verify e2 is focused
    await expect(e2Square).toBeFocused();

    // 1. Navigate upward via ArrowUp to e3
    await page.keyboard.press('ArrowUp');
    const e3Square = page.locator('[data-square="e3"]');
    await expect(e3Square).toBeFocused();

    // 2. Navigate right via ArrowRight to f3
    await page.keyboard.press('ArrowRight');
    const f3Square = page.locator('[data-square="f3"]');
    await expect(f3Square).toBeFocused();

    // 3. Navigate left via ArrowLeft back to e3
    await page.keyboard.press('ArrowLeft');
    await expect(e3Square).toBeFocused();

    // 4. Navigate down via ArrowDown back to e2
    await page.keyboard.press('ArrowDown');
    await expect(e2Square).toBeFocused();

    // 5. Select e2 using Enter key
    await page.keyboard.press('Enter');
    await expect(e2Square).toHaveClass(/is-selected/, { timeout: 5_000 });

    // 6. Navigate up to e4 (valid move destination for White's opening)
    await page.keyboard.press('ArrowUp'); // moves to e3
    await page.keyboard.press('ArrowUp'); // moves to e4
    const e4Square = page.locator('[data-square="e4"]');
    await expect(e4Square).toBeFocused();
    await expect(e4Square).toHaveClass(/has-valid-move/, { timeout: 5_000 });

    // 7. Execute move e2 -> e4 by pressing Enter
    await page.keyboard.press('Enter');

    // 8. Verify the piece moved to e4
    await expect(e4Square.locator('[data-testid="chess-piece"]')).toBeVisible({ timeout: 10_000 });
  });

  test('supports accessible keyboard-only navigation, focus trapping, and escape dismissal across multiplayer modal interactions', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);

    // 1. Open lobby and ensure multiplayer LAN mode
    await lobbyPage.goto();
    await lobbyPage.selectMode('multiplayer_lan');

    // 2. Host a game to create room
    await lobbyPage.hostGame('KeyHost', 'w');

    // 3. Verify multiplayer QR code / room modal opens
    const modal = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(lobbyPage.roomCodeDisplay).toBeVisible({ timeout: 10_000 });

    // 4. Verify initial focus is trapped inside modal on the close button
    const closeBtn = modal.locator('.base-modal-close-btn');
    await expect(closeBtn).toBeFocused();

    // 5. Close initial modal via Escape
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 5_000 });

    // 6. Focus room code chip in navbar and open multiplayer modal via keyboard Enter
    const roomCodeChip = page.locator('[data-testid="room-code-chip"]');
    await expect(roomCodeChip).toBeVisible({ timeout: 5_000 });
    await roomCodeChip.focus();
    await expect(roomCodeChip).toBeFocused();
    await page.keyboard.press('Enter');

    // 7. Verify modal re-opens and focus is placed on close button
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(closeBtn).toBeFocused();

    // Verify focus ring styling on close button
    const closeBtnHasRing = await closeBtn.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return cs.outlineStyle !== 'none' || (cs.boxShadow !== 'none' && cs.boxShadow !== '');
    });
    expect(closeBtnHasRing).toBe(true);

    // 8. Navigate through interactive elements inside modal using Tab
    await page.keyboard.press('Tab');
    const currentFocused = page.locator(':focus');
    await expect(modal.locator(':focus')).toHaveCount(1);
    await expect(currentFocused).toBeVisible();

    // Verify focused element has visible focus ring or styling
    const focusedStyle = await currentFocused.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return cs.outlineStyle !== 'none' || (cs.boxShadow !== 'none' && cs.boxShadow !== '');
    });
    expect(focusedStyle).toBe(true);

    // Continue tabbing through controls and verify focus remains within modal
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      await expect(modal.locator(':focus')).toHaveCount(1);
    }

    // Verify copy link button can be focused and has focus ring
    const copyBtn = modal.locator('[data-testid="copy-link-btn"]');
    await copyBtn.focus();
    await expect(copyBtn).toBeFocused();
    const copyBtnHasRing = await copyBtn.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return cs.outlineStyle !== 'none' || (cs.boxShadow !== 'none' && cs.boxShadow !== '');
    });
    expect(copyBtnHasRing).toBe(true);

    // 9. Press Escape to close/dismiss the modal
    await page.keyboard.press('Escape');

    // 10. Verify modal closes and focus returns to the room code chip
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
    await expect(roomCodeChip).toBeFocused();

    // 11. Re-open modal via Enter on room code chip and close via Enter on focused close button
    await page.keyboard.press('Enter');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(closeBtn).toBeFocused();

    // Press Enter on focused close button to trigger action
    await page.keyboard.press('Enter');
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
    await expect(roomCodeChip).toBeFocused();
  });

  test('supports keyboard-only navigation and dismissal on match confirmation dialogs', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    const gamePage = new GamePage(page);

    await lobbyPage.goto();
    // Launch a match to verify in-game confirmation dialog
    await lobbyPage.startSoloAi('peanut', 'w');
    await gamePage.waitForArena();

    // 1. Focus visible resign button and trigger modal via keyboard Enter
    const resignBtn = page.locator('[data-testid="resign-btn"]:visible');
    await expect(resignBtn).toBeVisible({ timeout: 10_000 });
    await resignBtn.focus();
    await expect(resignBtn).toBeFocused();
    await page.keyboard.press('Enter');

    // 2. Verify confirmation modal is displayed
    const confirmModal = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(confirmModal).toBeVisible({ timeout: 10_000 });

    // 3. Verify initial focus on close button
    const closeBtn = confirmModal.locator('.base-modal-close-btn');
    await expect(closeBtn).toBeFocused();

    // 4. Tab to navigate through interactive buttons
    await page.keyboard.press('Tab');
    const keepPlayingBtn = confirmModal.locator('button:has-text("Keep Playing")');
    await expect(keepPlayingBtn).toBeFocused();

    const keepPlayingHasRing = await keepPlayingBtn.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return cs.outlineStyle !== 'none' || (cs.boxShadow !== 'none' && cs.boxShadow !== '');
    });
    expect(keepPlayingHasRing).toBe(true);

    await page.keyboard.press('Tab');
    const confirmResignBtn = confirmModal.locator('[data-testid="confirm-resign-btn"]');
    await expect(confirmResignBtn).toBeFocused();

    // 5. Press Escape to dismiss dialog without resigning
    await page.keyboard.press('Escape');
    await expect(confirmModal).not.toBeVisible({ timeout: 5_000 });
    await expect(resignBtn).toBeFocused();

    // 6. Reopen dialog via Enter, tab to Keep Playing, and activate via Enter
    await page.keyboard.press('Enter');
    await expect(confirmModal).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Tab');
    await expect(keepPlayingBtn).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(confirmModal).not.toBeVisible({ timeout: 5_000 });
    await expect(resignBtn).toBeFocused();
  });
});
