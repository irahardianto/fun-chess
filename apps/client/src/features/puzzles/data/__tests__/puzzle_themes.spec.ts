import { describe, it, expect } from "vitest";
import {
  ALL_PUZZLE_THEMES,
  PUZZLE_THEME_DESCRIPTORS,
  THEMES_BY_CATEGORY,
  getThemeDescriptor,
  getThemeVisualClues,
  getThemeConceptDefinition,
} from "../puzzle_themes";
import { getPuzzlesByTheme } from "../puzzle_catalog";

describe("Puzzle Themes Catalog (puzzle_themes.spec.ts)", () => {
  it("contains exactly 24 curated descriptors with valid kid-friendly tips and rating estimates", () => {
    expect(ALL_PUZZLE_THEMES.length).toBe(24);
    expect(PUZZLE_THEME_DESCRIPTORS.length).toBe(24);

    for (const desc of ALL_PUZZLE_THEMES) {
      expect(desc.id).toBeTruthy();
      expect(desc.category).toBeTruthy();
      expect(desc.name).toBeTruthy();
      expect(desc.icon).toBeTruthy();
      expect(desc.description).toBeTruthy();
      expect(desc.kidFriendlyTip).toBeTruthy();
      expect(desc.estimatedRatingRange[0]).toBeGreaterThanOrEqual(500);
      expect(desc.estimatedRatingRange[1]).toBeGreaterThan(
        desc.estimatedRatingRange[0],
      );
    }
  });

  it("categorizes themes into 5 pedagogical domains", () => {
    expect(THEMES_BY_CATEGORY.basic_tactics.length).toBe(7);
    expect(THEMES_BY_CATEGORY.advanced_tactics.length).toBe(7);
    expect(THEMES_BY_CATEGORY.checkmate_patterns.length).toBe(5);
    expect(THEMES_BY_CATEGORY.endgame_technique.length).toBe(2);
    expect(THEMES_BY_CATEGORY.opening_traps.length).toBe(3);
  });

  it("retrieves descriptor by theme id using getThemeDescriptor including aliases", () => {
    const forkDesc = getThemeDescriptor("fork");
    expect(forkDesc).toBeDefined();
    expect(forkDesc?.name).toContain("Fork");

    const smotheredAlias = getThemeDescriptor("smothered");
    expect(smotheredAlias).toBeDefined();
    expect(smotheredAlias?.id).toBe("smothered_mate");

    const anastasiaAlias = getThemeDescriptor("anastasia_hook");
    expect(anastasiaAlias).toBeDefined();
    expect(anastasiaAlias?.id).toBe("anastasia_mate");

    const endgameAlias = getThemeDescriptor("endgame_conversion");
    expect(endgameAlias).toBeDefined();
    expect(endgameAlias?.id).toBe("pawn_endgame");

    const nonExistent = getThemeDescriptor("invalid_theme" as unknown as Parameters<typeof getThemeDescriptor>[0]);
    expect(nonExistent).toBeUndefined();
  });

  it("provides visual clues and concept definitions for themes including aliases", () => {
    expect(getThemeVisualClues("fork")).toContain("Knight");
    expect(getThemeVisualClues("smothered")).toContain("Knight");
    expect(getThemeConceptDefinition("fork")).toContain("double attack");
    expect(getThemeConceptDefinition("smothered")).toContain("suffocated");
  });

  it("guarantees that ALL 24 theme cards in ALL_PUZZLE_THEMES have active matching puzzles in catalog", () => {
    for (const desc of ALL_PUZZLE_THEMES) {
      const puzzles = getPuzzlesByTheme(desc.id);
      expect(
        puzzles.length,
        `Theme card ${desc.id} must have > 0 puzzles`,
      ).toBeGreaterThan(0);
    }
  });

  it("resolves bidirectional theme mappings correctly", () => {
    // Smothered mapping
    expect(getPuzzlesByTheme("smothered_mate").length).toBeGreaterThanOrEqual(
      25,
    );
    expect(getPuzzlesByTheme("smothered").length).toBeGreaterThanOrEqual(25);

    // Anastasia and Hook mapping
    expect(getPuzzlesByTheme("anastasia_mate").length).toBeGreaterThanOrEqual(
      15,
    );
    expect(getPuzzlesByTheme("hook_mate").length).toBeGreaterThanOrEqual(15);
    expect(getPuzzlesByTheme("anastasia_hook").length).toBeGreaterThanOrEqual(
      25,
    );

    // Endgame mapping
    expect(getPuzzlesByTheme("pawn_endgame").length).toBeGreaterThanOrEqual(16);
    expect(getPuzzlesByTheme("rook_endgame").length).toBeGreaterThanOrEqual(16);
    expect(
      getPuzzlesByTheme("endgame_conversion").length,
    ).toBeGreaterThanOrEqual(30);

    // Deflection and Decoy mapping
    expect(getPuzzlesByTheme("deflection").length).toBeGreaterThanOrEqual(25);
    expect(getPuzzlesByTheme("decoy").length).toBeGreaterThanOrEqual(25);
  });
});
