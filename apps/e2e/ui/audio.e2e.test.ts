import { test, expect } from "@playwright/test";
import { LobbyPage, GamePage } from "../src/index.js";

test.describe("Audio Synthesis & Volume/Mute Settings Persistence", () => {
  test.beforeEach(async ({ page }) => {
    // Suppress PWA install banner from intercepting pointer interactions
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "fun_chess_pwa_install_snoozed_until",
        String(Date.now() + 86400000),
      );
    });
  });

  test("navbar audio mute toggle updates aria-label, icon, and persists state to localStorage", async ({
    page,
  }) => {
    const lobbyPage = new LobbyPage(page);

    // 1. Open lobby
    await lobbyPage.goto();

    // 2. Locate mute toggle button
    const muteBtn = page.locator('[data-testid="mute-toggle-btn"]');
    await expect(muteBtn).toBeVisible({ timeout: 10_000 });

    // 3. Assert initial unmuted state: aria-label="Mute audio" and icon 🔊
    await expect(muteBtn).toHaveAttribute("aria-label", "Mute audio");
    await expect(muteBtn).toContainText("🔊");

    // 4. Click mute toggle button
    await muteBtn.click();

    // 5. Assert button updates to muted state: aria-label="Unmute audio" and icon 🔇
    await expect(muteBtn).toHaveAttribute("aria-label", "Unmute audio");
    await expect(muteBtn).toContainText("🔇");

    // 6. Verify localStorage key 'fun_chess_audio_muted' contains 'true'
    await expect
      .poll(
        async () => {
          return await page.evaluate(() =>
            window.localStorage.getItem("fun_chess_audio_muted"),
          );
        },
        { timeout: 5000 },
      )
      .toBe("true");
  });

  test("mute state persists across page reloads and toggles back to unmuted cleanly", async ({
    page,
  }) => {
    const lobbyPage = new LobbyPage(page);

    // 1. Open lobby
    await lobbyPage.goto();

    const muteBtn = page.locator('[data-testid="mute-toggle-btn"]');
    await expect(muteBtn).toBeVisible({ timeout: 10_000 });

    // 2. Toggle to muted state
    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute("aria-label", "Unmute audio");
    await expect
      .poll(async () => {
        return await page.evaluate(() =>
          window.localStorage.getItem("fun_chess_audio_muted"),
        );
      })
      .toBe("true");

    // 3. While muted, reload page
    await page.reload();
    await expect(page.locator('[data-testid="lobby-view"]')).toBeVisible({
      timeout: 15_000,
    });

    // 4. Assert mute state is preserved after reload: button still has aria-label="Unmute audio", localStorage still has 'true'
    const muteBtnAfterReload = page.locator('[data-testid="mute-toggle-btn"]');
    await expect(muteBtnAfterReload).toBeVisible({ timeout: 10_000 });
    await expect(muteBtnAfterReload).toHaveAttribute(
      "aria-label",
      "Unmute audio",
    );
    await expect(muteBtnAfterReload).toContainText("🔇");

    const storedMuted = await page.evaluate(() =>
      window.localStorage.getItem("fun_chess_audio_muted"),
    );
    expect(storedMuted).toBe("true");

    // 5. Click mute toggle button again
    await muteBtnAfterReload.click();

    // 6. Assert button updates back to unmuted state: aria-label="Mute audio"
    await expect(muteBtnAfterReload).toHaveAttribute(
      "aria-label",
      "Mute audio",
    );
    await expect(muteBtnAfterReload).toContainText("🔊");

    // 7. Verify localStorage key 'fun_chess_audio_muted' contains 'false'
    await expect
      .poll(async () => {
        return await page.evaluate(() =>
          window.localStorage.getItem("fun_chess_audio_muted"),
        );
      })
      .toBe("false");

    // 8. Reload page again
    await page.reload();
    await expect(page.locator('[data-testid="lobby-view"]')).toBeVisible({
      timeout: 15_000,
    });

    // 9. Assert unmuted state persists across reload
    const muteBtnSecondReload = page.locator('[data-testid="mute-toggle-btn"]');
    await expect(muteBtnSecondReload).toBeVisible({ timeout: 10_000 });
    await expect(muteBtnSecondReload).toHaveAttribute(
      "aria-label",
      "Mute audio",
    );
    await expect(muteBtnSecondReload).toContainText("🔊");

    const storedUnmuted = await page.evaluate(() =>
      window.localStorage.getItem("fun_chess_audio_muted"),
    );
    expect(storedUnmuted).toBe("false");
  });

  test("audio synthesis interactions during gameplay execute without audio errors in both unmuted and muted states", async ({
    page,
  }) => {
    const unhandledErrors: Error[] = [];
    const audioConsoleErrors: string[] = [];

    page.on("pageerror", (err) => {
      unhandledErrors.push(err);
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (
          text.toLowerCase().includes("audio") ||
          text.toLowerCase().includes("sound")
        ) {
          audioConsoleErrors.push(text);
        }
      }
    });

    const lobbyPage = new LobbyPage(page);
    const gamePage = new GamePage(page);

    // 1. Open lobby
    await lobbyPage.goto();

    const muteBtn = page.locator('[data-testid="mute-toggle-btn"]');
    await expect(muteBtn).toBeVisible({ timeout: 10_000 });

    // 2. Start Solo AI game in unmuted state
    await lobbyPage.startSoloAi("peanut", "w");
    await gamePage.waitForArena();
    await expect(page.locator('[data-testid="solo-ai-arena"]')).toBeVisible({
      timeout: 15_000,
    });

    const myTurn = page.locator(
      '.bottom-player-section [data-testid="turn-badge-active"]',
    );
    await expect(myTurn).toBeVisible({ timeout: 15_000 });

    // 3. Make move in unmuted state (should trigger move audio synthesis)
    await gamePage.makeMove("e2", "e4");
    await expect(
      page.locator('[data-square="e4"] [data-testid="chess-piece"]'),
    ).toBeVisible({ timeout: 10_000 });

    // 4. Toggle mute while inside game arena
    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute("aria-label", "Unmute audio");

    // 5. Wait for Peanut (AI) to respond and turn to return to White
    await expect(myTurn).toBeVisible({ timeout: 15_000 });

    // 6. Make another move in muted state (should execute silently without error)
    await gamePage.makeMove("g1", "f3");
    await expect(
      page.locator('[data-square="f3"] [data-testid="chess-piece"]'),
    ).toBeVisible({ timeout: 10_000 });

    // 7. Toggle back to unmuted
    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute("aria-label", "Mute audio");

    // 8. Verify game controls (flip board) execute cleanly
    await gamePage.flipBoardAction.click();

    // 9. Verify resignation audio / game over triggers without audio errors
    await gamePage.resign();
    await gamePage.expectGameOver();

    // 10. Assert no unhandled page errors and no audio console errors occurred
    expect(unhandledErrors).toEqual([]);
    expect(audioConsoleErrors).toEqual([]);
  });
});
