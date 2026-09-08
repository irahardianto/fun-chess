import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NullAudioService } from '../null_audio_service.js';
import { AudioSynthesizer } from '../audio_synthesizer.js';
import type { IAudioService } from '../audio.interface.js';
import { useAudio, type GameDomainEventSource } from '../../../composables/useAudio.js';

describe('NullAudioService Implementation', () => {
  let nullAudio: NullAudioService;

  beforeEach(() => {
    nullAudio = new NullAudioService();
  });

  it('provides complete no-op implementation of all IAudioService methods', async () => {
    // Verify default muted state
    expect(nullAudio.isMuted()).toBe(true);
    expect(nullAudio.toggleMute()).toBe(false);
    expect(() => nullAudio.setMuted(true)).not.toThrow();
    expect(() => nullAudio.setMuted(false)).not.toThrow();

    // Verify all sound methods execute without errors
    expect(() => {
      nullAudio.playMove();
      nullAudio.playCapture();
      nullAudio.playCheck();
      nullAudio.playCheckmate();
      nullAudio.playVictory();
      nullAudio.playDefeat();
      nullAudio.playDraw();
      nullAudio.playError();
      nullAudio.playClick();
      nullAudio.playPickup();
      nullAudio.playTurnNotification();
      nullAudio.playStart();
      nullAudio.playHint();
      nullAudio.playStarEarned();
      nullAudio.playMascotHappy();
      nullAudio.playMascotBlunder();
      nullAudio.playStepComplete();
    }).not.toThrow();

    // Context management methods
    expect(nullAudio.initContext()).toBeNull();
    expect(() => nullAudio.resumeContext()).not.toThrow();
    await expect(nullAudio.dispose()).resolves.toBeUndefined();
  });
});

describe('useAudio Composable with AudioService and Synthesizer', () => {
  let mockSynth: IAudioService;

  beforeEach(() => {
    mockSynth = {
      playMove: vi.fn(),
      playCapture: vi.fn(),
      playCheck: vi.fn(),
      playCheckmate: vi.fn(),
      playVictory: vi.fn(),
      playDefeat: vi.fn(),
      playDraw: vi.fn(),
      playError: vi.fn(),
      playClick: vi.fn(),
      playPickup: vi.fn(),
      playTurnNotification: vi.fn(),
      playStart: vi.fn(),
      playHint: vi.fn(),
      playStarEarned: vi.fn(),
      playMascotHappy: vi.fn(),
      playMascotBlunder: vi.fn(),
      playStepComplete: vi.fn(),
      toggleMute: vi.fn().mockReturnValue(true),
      isMuted: vi.fn().mockReturnValue(false),
      setMuted: vi.fn(),
      initContext: vi.fn().mockReturnValue(null),
      resumeContext: vi.fn(),
      dispose: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with synthesizer state and supports toggleMute and toggleSound', () => {
    const audio = useAudio(mockSynth);

    expect(audio.isMuted.value).toBe(false);
    expect(audio.isSoundEnabled.value).toBe(true);

    const toggled = audio.toggleMute();
    expect(mockSynth.toggleMute).toHaveBeenCalled();
    expect(toggled).toBe(true);
    expect(audio.isMuted.value).toBe(true);
    expect(audio.isSoundEnabled.value).toBe(false);

    audio.setMuted(false);
    expect(mockSynth.setMuted).toHaveBeenCalledWith(false);
    expect(audio.isMuted.value).toBe(false);
    expect(audio.isSoundEnabled.value).toBe(true);

    audio.setSoundEnabled(false);
    expect(mockSynth.setMuted).toHaveBeenCalledWith(true);
    expect(audio.isMuted.value).toBe(true);
    expect(audio.isSoundEnabled.value).toBe(false);

    (mockSynth.toggleMute as any).mockReturnValue(false);
    const soundToggled = audio.toggleSound();
    expect(soundToggled).toBe(true);
  });

  it('delegates all sound effect triggers to the synthesizer', () => {
    const audio = useAudio(mockSynth);

    audio.playMove();
    expect(mockSynth.playMove).toHaveBeenCalledTimes(1);

    audio.playCapture();
    expect(mockSynth.playCapture).toHaveBeenCalledTimes(1);

    audio.playCheck();
    expect(mockSynth.playCheck).toHaveBeenCalledTimes(1);

    audio.playCheckmate();
    expect(mockSynth.playCheckmate).toHaveBeenCalledTimes(1);

    audio.playVictory();
    expect(mockSynth.playVictory).toHaveBeenCalledTimes(1);

    audio.playDefeat();
    expect(mockSynth.playDefeat).toHaveBeenCalledTimes(1);

    audio.playDraw();
    expect(mockSynth.playDraw).toHaveBeenCalledTimes(1);

    audio.playError();
    expect(mockSynth.playError).toHaveBeenCalledTimes(1);

    audio.playClick();
    expect(mockSynth.playClick).toHaveBeenCalledTimes(1);

    audio.playPickup();
    expect(mockSynth.playPickup).toHaveBeenCalledTimes(1);

    audio.playTurnNotification();
    expect(mockSynth.playTurnNotification).toHaveBeenCalledTimes(1);

    audio.playStart();
    expect(mockSynth.playStart).toHaveBeenCalledTimes(1);

    audio.playHint();
    expect(mockSynth.playHint).toHaveBeenCalledTimes(1);

    audio.playStarEarned();
    expect(mockSynth.playStarEarned).toHaveBeenCalledTimes(1);

    audio.playMascotHappy();
    expect(mockSynth.playMascotHappy).toHaveBeenCalledTimes(1);

    audio.playMascotBlunder();
    expect(mockSynth.playMascotBlunder).toHaveBeenCalledTimes(1);

    audio.playStepComplete();
    expect(mockSynth.playStepComplete).toHaveBeenCalledTimes(1);

    audio.resumeAudio();
    expect(mockSynth.resumeContext).toHaveBeenCalledTimes(1);

    audio.initAudio();
    expect(mockSynth.initContext).toHaveBeenCalledTimes(1);
  });

  it('triggers haptic vibrations safely when navigator.vibrate is available', () => {
    const vibrateMock = vi.fn();
    vi.stubGlobal('navigator', {
      vibrate: vibrateMock,
    });

    const audio = useAudio(mockSynth);

    audio.playMove();
    expect(vibrateMock).toHaveBeenCalledWith(12);

    audio.playCapture();
    expect(vibrateMock).toHaveBeenCalledWith([20, 30, 20]);

    audio.playCheck();
    expect(vibrateMock).toHaveBeenCalledWith([40, 40, 40]);

    audio.playCheckmate();
    expect(vibrateMock).toHaveBeenCalledWith([60, 60, 120]);

    audio.playVictory();
    expect(vibrateMock).toHaveBeenCalledWith([50, 50, 100, 50, 150]);

    audio.playError();
    expect(vibrateMock).toHaveBeenCalledWith(50);

    audio.playTurnNotification();
    expect(vibrateMock).toHaveBeenCalledWith([30, 50, 30]);

    audio.playStarEarned();
    expect(vibrateMock).toHaveBeenCalledWith([30, 40, 60]);

    audio.playStepComplete();
    expect(vibrateMock).toHaveBeenCalledWith([25, 35, 50]);

    vi.unstubAllGlobals();
  });

  it('safely catches and logs errors when haptic vibration fails', () => {
    vi.stubGlobal('navigator', {
      vibrate: vi.fn(() => {
        throw new Error('Haptic device error');
      }),
    });

    const audio = useAudio(mockSynth);
    expect(() => audio.playMove()).not.toThrow();

    vi.unstubAllGlobals();
  });

  it('dispatches appropriate sounds on domain game events', () => {
    const audio = useAudio(mockSynth);

    audio.handleGameEvent({ type: 'move' });
    expect(mockSynth.playMove).toHaveBeenCalledTimes(1);

    audio.handleGameEvent({ type: 'move', captured: true });
    expect(mockSynth.playCapture).toHaveBeenCalledTimes(1);

    audio.handleGameEvent({ type: 'opponentMove', move: {} });
    expect(mockSynth.playMove).toHaveBeenCalledTimes(2);

    audio.handleGameEvent({ type: 'opponentMove', move: { captured: true } });
    expect(mockSynth.playCapture).toHaveBeenCalledTimes(2);

    audio.handleGameEvent({ type: 'check' });
    expect(mockSynth.playCheck).toHaveBeenCalledTimes(1);

    audio.handleGameEvent({ type: 'checkmate' });
    expect(mockSynth.playCheckmate).toHaveBeenCalledTimes(1);

    audio.handleGameEvent({ type: 'victory' });
    expect(mockSynth.playVictory).toHaveBeenCalledTimes(1);

    audio.handleGameEvent({ type: 'defeat' });
    expect(mockSynth.playDefeat).toHaveBeenCalledTimes(1);

    audio.handleGameEvent({ type: 'draw' });
    expect(mockSynth.playDraw).toHaveBeenCalledTimes(1);
  });

  it('attaches and cleans up game domain event listeners', () => {
    const audio = useAudio(mockSynth);

    let opponentMoveCb: any;
    let checkCb: any;
    let gameOverCb: any;

    const source: GameDomainEventSource = {
      onOpponentMove: vi.fn((cb) => {
        opponentMoveCb = cb;
        return vi.fn();
      }),
      onGameCheck: vi.fn((cb) => {
        checkCb = cb;
        return vi.fn();
      }),
      onGameOver: vi.fn((cb) => {
        gameOverCb = cb;
        return vi.fn();
      }),
    };

    const unsubscribe = audio.attachGameEventListeners(source);

    expect(source.onOpponentMove).toHaveBeenCalled();
    expect(source.onGameCheck).toHaveBeenCalled();
    expect(source.onGameOver).toHaveBeenCalled();

    // Trigger opponent move with capture
    opponentMoveCb({ move: { captured: true }, gameState: {} });
    expect(mockSynth.playCapture).toHaveBeenCalled();

    // Trigger check
    checkCb();
    expect(mockSynth.playCheck).toHaveBeenCalled();

    // Trigger draw
    gameOverCb({ winner: 'draw' });
    expect(mockSynth.playDraw).toHaveBeenCalled();

    // Trigger victory
    gameOverCb({ winner: 'w' });
    expect(mockSynth.playVictory).toHaveBeenCalled();

    // Unsubscribe cleanly
    expect(() => unsubscribe()).not.toThrow();
  });

  it('executes all unsubscribe callbacks even if one throws an error [MIN-007]', () => {
    const audio = useAudio(mockSynth);

    const faultyUnsub = vi.fn(() => {
      throw new Error('Listener cleanup exploded');
    });
    const healthyUnsub1 = vi.fn();
    const healthyUnsub2 = vi.fn();

    const mockSource: GameDomainEventSource = {
      onOpponentMove: vi.fn(() => faultyUnsub),
      onGameCheck: vi.fn(() => healthyUnsub1),
      onGameOver: vi.fn(() => healthyUnsub2),
    };

    const cleanup = audio.attachGameEventListeners(mockSource);

    expect(() => cleanup()).not.toThrow();
    expect(faultyUnsub).toHaveBeenCalledTimes(1);
    expect(healthyUnsub1).toHaveBeenCalledTimes(1);
    expect(healthyUnsub2).toHaveBeenCalledTimes(1);
  });

  it('works with real AudioSynthesizer instance in unmuted and muted modes', () => {
    const realSynth = new AudioSynthesizer({ muted: false });
    const audio = useAudio(realSynth);

    expect(audio.isMuted.value).toBe(false);
    expect(() => {
      audio.playMove();
      audio.playCapture();
      audio.playCheck();
      audio.playVictory();
      audio.playDefeat();
    }).not.toThrow();

    audio.setMuted(true);
    expect(audio.isMuted.value).toBe(true);

    expect(() => {
      audio.playMove();
      audio.playCapture();
    }).not.toThrow();
  });

  it('handles AudioSynthesizer audio failure gracefully without throwing', () => {
    const mockAudioContext = {
      currentTime: 10,
      state: 'running',
      destination: {},
      createOscillator: vi.fn(() => {
        throw new Error('AudioContext failed to create oscillator');
      }),
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
      resume: vi.fn().mockRejectedValue(new Error('AudioContext resume rejected')),
    };

    vi.stubGlobal('AudioContext', vi.fn(() => mockAudioContext));

    const brokenSynth = new AudioSynthesizer({ muted: false });
    const audio = useAudio(brokenSynth);

    expect(() => {
      audio.playMove();
      audio.playCapture();
      audio.playCheck();
      audio.playVictory();
      audio.playDefeat();
    }).not.toThrow();

    vi.unstubAllGlobals();
  });
});
