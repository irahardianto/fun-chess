import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useMascotBanter } from '../useMascotBanter';
import {
  peanutPup,
  sparkySquirrel,
  cleverFox,
  grandmasterOwl,
  ALL_MASCOTS,
} from '../../data/index';
import type { MascotDialogueTrigger } from '@fun-chess/shared';

describe('useMascotBanter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('initializes with provided persona', () => {
      const { currentPersona, activeDialogue, isSpeaking, lastTrigger } = useMascotBanter({
        persona: peanutPup,
      });

      expect(currentPersona.value?.id).toBe('peanut');
      expect(currentPersona.value?.name).toBe('Peanut the Pup');
      expect(activeDialogue.value).toBeNull();
      expect(isSpeaking.value).toBe(false);
      expect(lastTrigger.value).toBeNull();
    });

    it('initializes with null persona when no options provided', () => {
      const { currentPersona, activeDialogue } = useMascotBanter();
      expect(currentPersona.value).toBeNull();
      expect(activeDialogue.value).toBeNull();
    });

    it('accepts direct persona object as first argument', () => {
      const { currentPersona } = useMascotBanter(sparkySquirrel);
      expect(currentPersona.value?.id).toBe('sparky');
    });
  });

  describe('Trigger-based Dialogue Selection for all 4 Mascots', () => {
    const allTriggers: MascotDialogueTrigger[] = [
      'game_start',
      'player_move',
      'ai_move',
      'player_check',
      'ai_check',
      'player_blunder',
      'ai_blunder',
      'player_win',
      'ai_win',
      'draw',
      'hint_requested',
      'takeback_used',
    ];

    ALL_MASCOTS.forEach((mascot) => {
      describe(`Mascot: ${mascot.name} (${mascot.id})`, () => {
        allTriggers.forEach((trigger) => {
          it(`selects valid dialogue line for trigger "${trigger}"`, () => {
            const { triggerBanter, activeDialogue, lastTrigger, isSpeaking } = useMascotBanter({
              persona: mascot,
            });

            const returnedLine = triggerBanter(trigger);

            expect(lastTrigger.value).toBe(trigger);
            expect(activeDialogue.value).toBe(returnedLine);
            expect(isSpeaking.value).toBe(true);

            const expectedLines = mascot.dialogues[trigger];
            expect(expectedLines).toBeDefined();
            expect(expectedLines.length).toBeGreaterThan(0);
            expect(expectedLines).toContain(returnedLine);
          });
        });
      });
    });
  });

  describe('Persona Switching & Custom Dialogues', () => {
    it('switches persona dynamically and uses new persona dialogues', () => {
      const { currentPersona, setPersona, triggerBanter, activeDialogue } = useMascotBanter({
        persona: peanutPup,
      });

      expect(currentPersona.value?.id).toBe('peanut');

      setPersona(grandmasterOwl);
      expect(currentPersona.value?.id).toBe('owl');

      triggerBanter('game_start');
      expect(grandmasterOwl.dialogues.game_start).toContain(activeDialogue.value);
    });

    it('sets custom speech text directly via setCustomDialogue', () => {
      const { setCustomDialogue, activeDialogue, isSpeaking } = useMascotBanter({
        persona: cleverFox,
      });

      setCustomDialogue('Special custom message! 🎉');

      expect(activeDialogue.value).toBe('Special custom message! 🎉');
      expect(isSpeaking.value).toBe(true);
    });

    it('allows triggerBanter with custom text override', () => {
      const { triggerBanter, activeDialogue, lastTrigger } = useMascotBanter({
        persona: sparkySquirrel,
      });

      const line = triggerBanter('player_win', 'Custom Victory Praise! 🌟');

      expect(line).toBe('Custom Victory Praise! 🌟');
      expect(activeDialogue.value).toBe('Custom Victory Praise! 🌟');
      expect(lastTrigger.value).toBe('player_win');
    });

    it('clears dialogue and speaking state via clearBanter', () => {
      const { triggerBanter, clearBanter, activeDialogue, isSpeaking } = useMascotBanter({
        persona: peanutPup,
      });

      triggerBanter('player_move');
      expect(activeDialogue.value).not.toBeNull();

      clearBanter();
      expect(activeDialogue.value).toBeNull();
      expect(isSpeaking.value).toBe(false);
    });
  });

  describe('Timing & Animation Behavior', () => {
    it('resets isSpeaking to false after 600ms speaking animation duration', () => {
      const { triggerBanter, isSpeaking } = useMascotBanter({
        persona: peanutPup,
      });

      triggerBanter('game_start');
      expect(isSpeaking.value).toBe(true);

      vi.advanceTimersByTime(300);
      expect(isSpeaking.value).toBe(true);

      vi.advanceTimersByTime(350);
      expect(isSpeaking.value).toBe(false);
    });

    it('auto-clears activeDialogue when autoClearMs is configured', () => {
      const { triggerBanter, activeDialogue } = useMascotBanter({
        persona: peanutPup,
        autoClearMs: 3000,
      });

      triggerBanter('ai_check');
      expect(activeDialogue.value).not.toBeNull();

      vi.advanceTimersByTime(2000);
      expect(activeDialogue.value).not.toBeNull();

      vi.advanceTimersByTime(1100);
      expect(activeDialogue.value).toBeNull();
    });
  });
});
