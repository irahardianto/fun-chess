import { test, expect } from '@playwright/test';
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
      : JSON.stringify({
          magic: 'FC_PROGRESS_V1',
          schemaVersion: 1,
          exportedAt: new Date().toISOString(),
          checksum: '00000000',
          payload: {
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
});
