import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAudio } from '../useAudio';
import { AudioSynthesizer } from '@/platform/audio/audio_synthesizer';

describe('useAudio composable', () => {
  let mockSynth: AudioSynthesizer;

  beforeEach(() => {
    mockSynth = new AudioSynthesizer();
    vi.spyOn(mockSynth, 'playMove').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playCapture').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playCheck').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playVictory').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playDraw').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playError').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playClick').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playPickup').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playTurnNotification').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playStart').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playHint').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playStarEarned').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playMascotHappy').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playMascotBlunder').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playStepComplete').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playCheckmate').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'playDefeat').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'resumeContext').mockImplementation(() => {});
    vi.spyOn(mockSynth, 'initContext').mockImplementation(() => null);
  });

  it('should toggle and set mute reactively', () => {
    const { isMuted, toggleMute, setMuted } = useAudio(mockSynth);

    setMuted(false);
    expect(isMuted.value).toBe(false);

    toggleMute();
    expect(isMuted.value).toBe(true);

    setMuted(false);
    expect(isMuted.value).toBe(false);
  });

  it('should toggle and set sound enabled reactively', () => {
    const { isSoundEnabled, isMuted, toggleSound, setSoundEnabled } = useAudio(mockSynth);

    setSoundEnabled(true);
    expect(isSoundEnabled.value).toBe(true);
    expect(isMuted.value).toBe(false);

    toggleSound();
    expect(isSoundEnabled.value).toBe(false);
    expect(isMuted.value).toBe(true);

    setSoundEnabled(true);
    expect(isSoundEnabled.value).toBe(true);
    expect(isMuted.value).toBe(false);
  });

  it('triggers haptic vibration when navigator.vibrate is available', () => {
    const vibrateMock = vi.fn();
    vi.stubGlobal('navigator', {
      vibrate: vibrateMock,
    });

    const { playMove, playCapture, playCheck, playVictory, playError } = useAudio(mockSynth);

    playMove();
    expect(vibrateMock).toHaveBeenCalledWith(12);

    playCapture();
    expect(vibrateMock).toHaveBeenCalledWith([20, 30, 20]);

    playCheck();
    expect(vibrateMock).toHaveBeenCalledWith([40, 40, 40]);

    playVictory();
    expect(vibrateMock).toHaveBeenCalledWith([50, 50, 100, 50, 150]);

    playError();
    expect(vibrateMock).toHaveBeenCalledWith(50);
  });

  it('should delegate sound triggers to synthesizer methods', () => {
    const {
      playMove,
      playCapture,
      playCheck,
      playVictory,
      playDraw,
      playError,
      playClick,
      playPickup,
      playTurnNotification,
      playStart,
      playHint,
      playStarEarned,
      playMascotHappy,
      playMascotBlunder,
      playStepComplete,
    } = useAudio(mockSynth);

    playMove();
    expect(mockSynth.playMove).toHaveBeenCalledTimes(1);

    playCapture();
    expect(mockSynth.playCapture).toHaveBeenCalledTimes(1);

    playCheck();
    expect(mockSynth.playCheck).toHaveBeenCalledTimes(1);

    playVictory();
    expect(mockSynth.playVictory).toHaveBeenCalledTimes(1);

    playDraw();
    expect(mockSynth.playDraw).toHaveBeenCalledTimes(1);

    playError();
    expect(mockSynth.playError).toHaveBeenCalledTimes(1);

    playClick();
    expect(mockSynth.playClick).toHaveBeenCalledTimes(1);

    playPickup();
    expect(mockSynth.playPickup).toHaveBeenCalledTimes(1);

    playTurnNotification();
    expect(mockSynth.playTurnNotification).toHaveBeenCalledTimes(1);

    playStart();
    expect(mockSynth.playStart).toHaveBeenCalledTimes(1);

    playHint();
    expect(mockSynth.playHint).toHaveBeenCalledTimes(1);

    playStarEarned();
    expect(mockSynth.playStarEarned).toHaveBeenCalledTimes(1);

    playMascotHappy();
    expect(mockSynth.playMascotHappy).toHaveBeenCalledTimes(1);

    playMascotBlunder();
    expect(mockSynth.playMascotBlunder).toHaveBeenCalledTimes(1);

    playStepComplete();
    expect(mockSynth.playStepComplete).toHaveBeenCalledTimes(1);

    const { resumeAudio, initAudio } = useAudio(mockSynth);
    resumeAudio();
    expect(mockSynth.resumeContext).toHaveBeenCalledTimes(1);

    initAudio();
    expect(mockSynth.initContext).toHaveBeenCalledTimes(1);
  });

  describe('Game domain events audio handling (ENH-006)', () => {
    it('should route handleGameEvent to appropriate audio playback', () => {
      const { handleGameEvent } = useAudio(mockSynth);

      handleGameEvent({ type: 'move', captured: false });
      expect(mockSynth.playMove).toHaveBeenCalledTimes(1);

      handleGameEvent({ type: 'move', captured: true });
      expect(mockSynth.playCapture).toHaveBeenCalledTimes(1);

      handleGameEvent({ type: 'opponentMove', move: { captured: false } as any });
      expect(mockSynth.playMove).toHaveBeenCalledTimes(2);

      handleGameEvent({ type: 'opponentMove', move: { captured: true } as any });
      expect(mockSynth.playCapture).toHaveBeenCalledTimes(2);

      handleGameEvent({ type: 'check' });
      expect(mockSynth.playCheck).toHaveBeenCalledTimes(1);

      handleGameEvent({ type: 'checkmate' });
      expect(mockSynth.playCheckmate).toHaveBeenCalledTimes(1);

      handleGameEvent({ type: 'victory' });
      expect(mockSynth.playVictory).toHaveBeenCalledTimes(1);

      handleGameEvent({ type: 'defeat' });
      expect(mockSynth.playDefeat).toHaveBeenCalledTimes(1);

      handleGameEvent({ type: 'draw' });
      expect(mockSynth.playDraw).toHaveBeenCalledTimes(1);
    });

    it('should attach listeners to game domain event source and unsubscribe cleanly', () => {
      const { attachGameEventListeners } = useAudio(mockSynth);

      let opponentMoveCb: ((data: any) => void) | undefined;
      let checkCb: (() => void) | undefined;
      let gameOverCb: ((payload: any) => void) | undefined;

      const unsubOpponentMove = vi.fn();
      const unsubCheck = vi.fn();
      const unsubGameOver = vi.fn();

      const mockSource = {
        onOpponentMove: vi.fn((cb: any) => {
          opponentMoveCb = cb;
          return unsubOpponentMove;
        }),
        onGameCheck: vi.fn((cb: any) => {
          checkCb = cb;
          return unsubCheck;
        }),
        onGameOver: vi.fn((cb: any) => {
          gameOverCb = cb;
          return unsubGameOver;
        }),
      };

      const cleanup = attachGameEventListeners(mockSource);

      expect(mockSource.onOpponentMove).toHaveBeenCalledTimes(1);
      expect(mockSource.onGameCheck).toHaveBeenCalledTimes(1);
      expect(mockSource.onGameOver).toHaveBeenCalledTimes(1);

      // Trigger opponentMove event
      opponentMoveCb!({ move: { captured: false } });
      expect(mockSynth.playMove).toHaveBeenCalledTimes(1);

      opponentMoveCb!({ move: { captured: true } });
      expect(mockSynth.playCapture).toHaveBeenCalledTimes(1);

      // Trigger gameCheck event
      checkCb!();
      expect(mockSynth.playCheck).toHaveBeenCalledTimes(1);

      // Trigger gameOver event (draw)
      gameOverCb!({ winner: 'draw' });
      expect(mockSynth.playDraw).toHaveBeenCalledTimes(1);

      // Trigger gameOver event (victory)
      gameOverCb!({ winner: 'w' });
      expect(mockSynth.playVictory).toHaveBeenCalledTimes(1);

      // Cleanup
      cleanup();
      expect(unsubOpponentMove).toHaveBeenCalledTimes(1);
      expect(unsubCheck).toHaveBeenCalledTimes(1);
      expect(unsubGameOver).toHaveBeenCalledTimes(1);
    });

    it('executes all unsubscribe callbacks even if one throws an error [MIN-007]', () => {
      const { attachGameEventListeners } = useAudio(mockSynth);

      const faultyUnsub = vi.fn(() => {
        throw new Error('Listener cleanup exploded');
      });
      const healthyUnsub1 = vi.fn();
      const healthyUnsub2 = vi.fn();

      const mockSource = {
        onOpponentMove: vi.fn(() => faultyUnsub),
        onGameCheck: vi.fn(() => healthyUnsub1),
        onGameOver: vi.fn(() => healthyUnsub2),
      };

      const cleanup = attachGameEventListeners(mockSource);

      expect(() => cleanup()).not.toThrow();
      expect(faultyUnsub).toHaveBeenCalledTimes(1);
      expect(healthyUnsub1).toHaveBeenCalledTimes(1);
      expect(healthyUnsub2).toHaveBeenCalledTimes(1);
    });
  });
});
