import { describe, it, expect } from 'vitest';
import {
  PUZZLE_THEME_DESCRIPTORS,
  THEMES_BY_CATEGORY,
  getThemeDescriptor,
} from '../puzzle_themes';

describe('Puzzle Themes Catalog (puzzle_themes.spec.ts)', () => {
  it('contains descriptors with valid kid-friendly tips and rating estimates', () => {
    expect(PUZZLE_THEME_DESCRIPTORS.length).toBeGreaterThanOrEqual(15);

    for (const desc of PUZZLE_THEME_DESCRIPTORS) {
      expect(desc.id).toBeTruthy();
      expect(desc.category).toBeTruthy();
      expect(desc.name).toBeTruthy();
      expect(desc.icon).toBeTruthy();
      expect(desc.description).toBeTruthy();
      expect(desc.kidFriendlyTip).toBeTruthy();
      expect(desc.estimatedRatingRange[0]).toBeGreaterThanOrEqual(500);
      expect(desc.estimatedRatingRange[1]).toBeGreaterThan(desc.estimatedRatingRange[0]);
    }
  });

  it('categorizes themes into 5 pedagogical domains', () => {
    expect(THEMES_BY_CATEGORY.basic_tactics.length).toBeGreaterThan(0);
    expect(THEMES_BY_CATEGORY.advanced_tactics.length).toBeGreaterThan(0);
    expect(THEMES_BY_CATEGORY.checkmate_patterns.length).toBeGreaterThan(0);
    expect(THEMES_BY_CATEGORY.endgame_technique.length).toBeGreaterThan(0);
    expect(THEMES_BY_CATEGORY.opening_traps.length).toBeGreaterThan(0);
  });

  it('retrieves descriptor by theme id using getThemeDescriptor', () => {
    const forkDesc = getThemeDescriptor('fork');
    expect(forkDesc).toBeDefined();
    expect(forkDesc?.name).toContain('Fork');

    const nonExistent = getThemeDescriptor('invalid_theme' as any);
    expect(nonExistent).toBeUndefined();
  });
});
