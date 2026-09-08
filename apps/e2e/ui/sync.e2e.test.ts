import { test, expect } from '@playwright/test';
import { encodeProgressToEnvelope, encodeProgressToQr } from '@fun-chess/shared';
import { LobbyPage } from '../src/index.js';

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
});
