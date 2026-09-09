import { describe, it, expect } from 'vitest';
import {
  ALL_PUZZLE_THEMES,
  PUZZLE_THEME_DESCRIPTORS,
  THEME_DESCRIPTORS_MAP,
  THEME_MAP,
  THEMES_BY_CATEGORY,
  getThemeDescriptor,
  getThemesByCategory,
  getThemeVisualClues,
  getThemeConceptDefinition,
} from '../puzzle_themes';
import type { PuzzleTheme, PuzzleThemeCategory } from '@fun-chess/shared';

describe('puzzle_themes data access & lookup helpers', () => {
  it('exposes curated themes and valid mapping constants', () => {
    expect(ALL_PUZZLE_THEMES.length).toBeGreaterThan(0);
    expect(PUZZLE_THEME_DESCRIPTORS).toBe(ALL_PUZZLE_THEMES);
    expect(THEME_DESCRIPTORS_MAP.size).toBe(ALL_PUZZLE_THEMES.length);
    expect(THEME_MAP).toBe(THEME_DESCRIPTORS_MAP);
    expect(THEMES_BY_CATEGORY.basic_tactics.length).toBeGreaterThan(0);
    expect(THEMES_BY_CATEGORY.checkmate_patterns.length).toBeGreaterThan(0);
  });

  describe('getThemeDescriptor', () => {
    it('returns direct descriptor when theme matches ID directly', () => {
      const fork = getThemeDescriptor('fork');
      expect(fork).toBeDefined();
      expect(fork?.id).toBe('fork');
      expect(fork?.name).toContain('Royal Fork');
    });

    it('resolves aliased themes correctly', () => {
      const smothered = getThemeDescriptor('smothered' as PuzzleTheme);
      expect(smothered).toBeDefined();
      expect(smothered?.id).toBe('smothered_mate');

      const anastasia = getThemeDescriptor('anastasia_hook' as PuzzleTheme);
      expect(anastasia).toBeDefined();
      expect(anastasia?.id).toBe('anastasia_mate');

      const endgame = getThemeDescriptor('endgame_conversion' as PuzzleTheme);
      expect(endgame).toBeDefined();
      expect(endgame?.id).toBe('pawn_endgame');
    });

    it('returns undefined for non-existent theme', () => {
      const unknown = getThemeDescriptor('unknown_theme_xyz' as PuzzleTheme);
      expect(unknown).toBeUndefined();
    });
  });

  describe('getThemesByCategory', () => {
    it('returns themes filtered by known category', () => {
      const tactics = getThemesByCategory('basic_tactics');
      expect(tactics.length).toBeGreaterThan(0);
      expect(tactics.every((t) => t.category === 'basic_tactics')).toBe(true);

      const checkmates = getThemesByCategory('checkmate_patterns');
      expect(checkmates.length).toBeGreaterThan(0);
      expect(checkmates.every((t) => t.category === 'checkmate_patterns')).toBe(true);
    });

    it('returns empty array for invalid or unknown category', () => {
      const result = getThemesByCategory('nonexistent_cat' as PuzzleThemeCategory);
      expect(result).toEqual([]);
    });
  });

  describe('getThemeVisualClues', () => {
    it('returns specific visual clue for known theme', () => {
      const forkClue = getThemeVisualClues('fork');
      expect(forkClue).toContain('Look for two high-value enemy pieces');

      const pinClue = getThemeVisualClues('pin');
      expect(pinClue).toContain('Look for enemy pieces lined up');
    });

    it('resolves visual clues for aliases', () => {
      expect(getThemeVisualClues('smothered')).toContain('boxed in');
      expect(getThemeVisualClues('anastasia_hook')).toContain('Knight covering the escape squares');
      expect(getThemeVisualClues('endgame_conversion')).toContain('passed pawn');
    });

    it('returns fallback visual clue for unknown theme', () => {
      const fallback = getThemeVisualClues('unknown_special_theme');
      expect(fallback).toBe('Look for tactical imbalances and vulnerable pieces in the position.');
    });
  });

  describe('getThemeConceptDefinition', () => {
    it('returns concept definition for known theme', () => {
      const forkDef = getThemeConceptDefinition('fork');
      expect(forkDef).toContain('double attack');

      const skewerDef = getThemeConceptDefinition('skewer');
      expect(skewerDef).toContain('linear attack');
    });

    it('resolves concept definitions for aliases', () => {
      expect(getThemeConceptDefinition('smothered')).toContain('suffocated by its own friendly pieces');
      expect(getThemeConceptDefinition('anastasia_hook')).toContain('Knight cuts off flight squares');
      expect(getThemeConceptDefinition('endgame_conversion')).toContain('king activity and passed pawn');
    });

    it('returns fallback concept definition for unknown theme', () => {
      const fallback = getThemeConceptDefinition('unknown_motif');
      expect(fallback).toBe('Master this tactical motif to spot winning opportunities in your games.');
    });
  });
});
