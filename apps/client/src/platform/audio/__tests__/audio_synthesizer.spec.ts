import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioSynthesizer } from '../audio_synthesizer';
import { NullAudioService } from '../null_audio_service';
import type { IAudioService } from '../audio.interface';
import { logger } from '../../telemetry';

describe('AudioSynthesizer', () => {
  let synth: AudioSynthesizer;

  beforeEach(() => {
    synth = new AudioSynthesizer({ muted: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('implements IAudioService contract', () => {
    const audioService: IAudioService = synth;
    expect(audioService).toBeDefined();
    expect(typeof audioService.playMove).toBe('function');
    expect(typeof audioService.playCapture).toBe('function');
    expect(typeof audioService.playCheck).toBe('function');
    expect(typeof audioService.playVictory).toBe('function');
    expect(typeof audioService.playDefeat).toBe('function');
    expect(typeof audioService.toggleMute).toBe('function');
    expect(typeof audioService.isMuted).toBe('function');
  });

  it('should initialize with provided muted option', () => {
    const mutedSynth = new AudioSynthesizer({ muted: true });
    expect(mutedSynth.isMuted()).toBe(true);

    const unmutedSynth = new AudioSynthesizer({ muted: false });
    expect(unmutedSynth.isMuted()).toBe(false);
  });

  it('should toggle and set mute status correctly', () => {
    expect(synth.isMuted()).toBe(false);
    expect(synth.toggleMute()).toBe(true);
    expect(synth.isMuted()).toBe(true);
    expect(synth.toggleMute()).toBe(false);
    expect(synth.isMuted()).toBe(false);

    synth.setMuted(true);
    expect(synth.isMuted()).toBe(true);
  });

  it('should not throw when playing sound effects in headless environment without Web Audio', () => {
    expect(() => {
      synth.playMove();
      synth.playCapture();
      synth.playCheck();
      synth.playCheckmate();
      synth.playVictory();
      synth.playDefeat();
      synth.playDraw();
      synth.playError();
      synth.playClick();
      synth.playPickup();
      synth.playTurnNotification();
      synth.playStart();
      synth.playHint();
      synth.playStarEarned();
      synth.playMascotHappy();
      synth.playMascotBlunder();
      synth.playStepComplete();
    }).not.toThrow();
  });

  it('should synthesize audio nodes when Web Audio API is available', () => {
    const mockOscillator = {
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    const mockAudioContext = {
      currentTime: 100,
      state: 'running',
      destination: {},
      createOscillator: vi.fn(() => mockOscillator),
      createGain: vi.fn(() => mockGain),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    // Attach mock to window
    vi.stubGlobal('AudioContext', vi.fn(function() { return mockAudioContext; }));

    const audioSynth = new AudioSynthesizer();
    audioSynth.playMove();

    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();
    expect(mockOscillator.start).toHaveBeenCalled();
    expect(mockOscillator.stop).toHaveBeenCalled();

    audioSynth.playCapture(); // 2 oscillators (total 1 + 2 = 3)
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(3);

    audioSynth.playCheck(); // 2 oscillators (total 3 + 2 = 5)
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(5);

    audioSynth.playVictory(); // 4 notes (total 5 + 4 = 9)
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(9);

    audioSynth.playDefeat(); // 3 notes (total 9 + 3 = 12)
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(12);

    audioSynth.playDraw(); // 1 oscillator (total 12 + 1 = 13)
    audioSynth.playError(); // 1 oscillator (total 13 + 1 = 14)
    audioSynth.playClick(); // 1 oscillator (total 14 + 1 = 15)
    audioSynth.playTurnNotification(); // 1 oscillator (total 15 + 1 = 16)
    audioSynth.playStart(); // 4 oscillators (total 16 + 4 = 20)
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(20);

    audioSynth.playHint(); // 3 oscillators (total 20 + 3 = 23)
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(23);

    audioSynth.playStarEarned(); // 3 oscillators (total 23 + 3 = 26)
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(26);

    audioSynth.playMascotHappy(); // 1 oscillator (total 26 + 1 = 27)
    audioSynth.playMascotBlunder(); // 1 oscillator (total 27 + 1 = 28)
    audioSynth.playStepComplete(); // 2 oscillators (total 28 + 2 = 30)
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(30);

    // When muted, no audio nodes should be created
    const callCountBeforeMute = mockAudioContext.createOscillator.mock.calls.length;
    audioSynth.setMuted(true);
    audioSynth.playMove();
    expect(mockAudioContext.createOscillator.mock.calls.length).toBe(callCountBeforeMute);

    vi.unstubAllGlobals();
  });

  it('schedules Web Audio oscillators and gains for checkmate fanfare [MIN-030]', () => {
    const mockOscillator = {
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    const mockAudioContext = {
      currentTime: 10,
      state: 'running',
      destination: {},
      createOscillator: vi.fn(() => ({
        ...mockOscillator,
        frequency: { setValueAtTime: vi.fn() },
      })),
      createGain: vi.fn(() => ({
        ...mockGain,
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      })),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    vi.stubGlobal('AudioContext', vi.fn(function() { return mockAudioContext; }));

    const audioSynth = new AudioSynthesizer({ muted: false });
    audioSynth.initContext();
    mockAudioContext.createOscillator.mockClear();
    mockAudioContext.createGain.mockClear();

    audioSynth.playCheckmate();

    // 4 notes in checkmate fanfare: A4 (440), C#5 (554.37), E5 (659.25), A5 (880)
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(4);
    expect(mockAudioContext.createGain).toHaveBeenCalledTimes(4);
    expect(mockOscillator.start).toHaveBeenCalledTimes(4);
    expect(mockOscillator.stop).toHaveBeenCalledTimes(4);

    vi.unstubAllGlobals();
  });

  it('supports initContext, resumeContext, and explicit bootstrap methods without DOM side-effects', () => {
    const mockAudioContext = {
      currentTime: 0,
      state: 'suspended',
      destination: {},
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    vi.stubGlobal('AudioContext', vi.fn(function() { return mockAudioContext; }));

    const audioSynth = new AudioSynthesizer();
    const ctx = audioSynth.initContext();
    expect(ctx).toBeDefined();
    expect(mockAudioContext.resume).toHaveBeenCalled();

    audioSynth.resumeContext();
    expect(mockAudioContext.resume).toHaveBeenCalledTimes(2);

    expect(() => audioSynth.bootstrap()).not.toThrow();

    vi.unstubAllGlobals();
  });

  it('closes AudioContext and removes event listeners when disposed (MIN-005)', async () => {
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockAudioContext = {
      currentTime: 0,
      state: 'running',
      destination: {},
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
      close: mockClose,
    };

    vi.stubGlobal('AudioContext', vi.fn(function() { return mockAudioContext; }));

    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    const audioSynth = new AudioSynthesizer();
    audioSynth.bootstrap();
    audioSynth.initContext();

    await audioSynth.dispose();

    expect(mockClose).toHaveBeenCalled();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    // Calling dispose again should be safe and idempotent
    await expect(audioSynth.dispose()).resolves.toBeUndefined();

    removeEventListenerSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('should return null and log warning when AudioContext constructor throws [MIN-033]', () => {
    // Arrange
    const warnSpy = vi.spyOn(logger, 'warn');
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        throw new Error('Web Audio initialization error');
      }),
    );
    const audioSynth = new AudioSynthesizer();

    // Act
    const ctx = audioSynth.initContext();

    // Assert
    expect(ctx).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to initialize AudioContext',
      expect.objectContaining({
        operation: 'audio_init_context',
        error: 'Web Audio initialization error',
      }),
    );
  });

  it('should log warning when autoplay policy suspends AudioContext and resume rejects [MIN-033]', async () => {
    // Arrange
    const warnSpy = vi.spyOn(logger, 'warn');
    const resumeRejection = new Error('Autoplay policy prevented playback');
    const mockAudioContext = {
      currentTime: 0,
      state: 'suspended',
      destination: {},
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
      resume: vi.fn().mockRejectedValue(resumeRejection),
    };
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return mockAudioContext;
      }),
    );
    const audioSynth = new AudioSynthesizer();

    // Act
    const ctx = audioSynth.initContext();
    expect(ctx).toBe(mockAudioContext);
    await Promise.resolve();

    // Assert
    expect(warnSpy).toHaveBeenCalledWith(
      'Autoplay policy suspended AudioContext',
      expect.objectContaining({
        operation: 'audio_resume_autoplay',
        error: 'Autoplay policy prevented playback',
      }),
    );
  });

  it('should log warning when resumeContext fails to resume suspended context [MIN-033]', async () => {
    // Arrange
    const warnSpy = vi.spyOn(logger, 'warn');
    const resumeRejection = new Error('Failed to resume context');
    const mockAudioContext = {
      currentTime: 0,
      state: 'suspended',
      destination: {},
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
      resume: vi.fn().mockRejectedValue(resumeRejection),
    };
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function () {
        return mockAudioContext;
      }),
    );
    const audioSynth = new AudioSynthesizer();
    audioSynth.initContext();
    await Promise.resolve();
    warnSpy.mockClear();

    // Act
    audioSynth.resumeContext();
    await Promise.resolve();

    // Assert
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to resume suspended AudioContext',
      expect.objectContaining({
        operation: 'audio_resume_context',
        error: 'Failed to resume context',
      }),
    );
  });

  it('safely skips all 17 sound effect methods when muted is true', () => {
    const mockAudioContext = {
      currentTime: 0,
      state: 'running',
      destination: {},
      createOscillator: vi.fn(),
      createGain: vi.fn(),
      resume: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal('AudioContext', vi.fn(function() { return mockAudioContext; }));

    const audioSynth = new AudioSynthesizer({ muted: true });
    expect(audioSynth.isMuted()).toBe(true);

    audioSynth.playMove();
    audioSynth.playCapture();
    audioSynth.playCheck();
    audioSynth.playCheckmate();
    audioSynth.playVictory();
    audioSynth.playDefeat();
    audioSynth.playDraw();
    audioSynth.playError();
    audioSynth.playClick();
    audioSynth.playPickup();
    audioSynth.playTurnNotification();
    audioSynth.playStart();
    audioSynth.playHint();
    audioSynth.playStarEarned();
    audioSynth.playMascotHappy();
    audioSynth.playMascotBlunder();
    audioSynth.playStepComplete();

    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('safely handles audio synthesis error catches across all sound methods when Web Audio throws', () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    const mockAudioContext = {
      currentTime: 10,
      state: 'running',
      destination: {},
      createGain: vi.fn(() => mockGain),
      createOscillator: vi.fn(() => {
        throw new Error('Hardware audio node allocation failure');
      }),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    vi.stubGlobal('AudioContext', vi.fn(function() { return mockAudioContext; }));

    const audioSynth = new AudioSynthesizer({ muted: false });
    audioSynth.initContext();

    audioSynth.playMove();
    audioSynth.playCapture();
    audioSynth.playCheck();
    audioSynth.playCheckmate();
    audioSynth.playVictory();
    audioSynth.playDefeat();
    audioSynth.playDraw();
    audioSynth.playError();
    audioSynth.playClick();
    audioSynth.playPickup();
    audioSynth.playTurnNotification();
    audioSynth.playStart();
    audioSynth.playHint();
    audioSynth.playStarEarned();
    audioSynth.playMascotHappy();
    audioSynth.playMascotBlunder();
    audioSynth.playStepComplete();

    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to play move sound',
      expect.objectContaining({ operation: 'audio_play_move' }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to play capture sound',
      expect.objectContaining({ operation: 'audio_play_capture' }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to play check sound',
      expect.objectContaining({ operation: 'audio_play_check' }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to play checkmate sound',
      expect.objectContaining({ operation: 'audio_play_checkmate' }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to play victory sound',
      expect.objectContaining({ operation: 'audio_play_victory' }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to play defeat sound',
      expect.objectContaining({ operation: 'audio_play_defeat' }),
    );

    warnSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('triggers user gesture unlock and document visibility change events via bootstrap()', () => {
    const resumeSpy = vi.fn().mockResolvedValue(undefined);
    const mockAudioContext = {
      currentTime: 0,
      state: 'suspended',
      destination: {},
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
      resume: resumeSpy,
    };
    vi.stubGlobal('AudioContext', vi.fn(function() { return mockAudioContext; }));

    const audioSynth = new AudioSynthesizer();
    audioSynth.bootstrap();

    // Trigger unlock event
    window.dispatchEvent(new Event('pointerdown'));

    // Trigger visibilitychange when document is visible
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Trigger visibilitychange when document is hidden
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Trigger pagehide
    window.dispatchEvent(new Event('pagehide'));

    expect(resumeSpy).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('safely handles all 17 sound effects when WebAudio is unsupported or masterGain is null', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const audioSynth = new AudioSynthesizer();
    expect(audioSynth.initContext()).toBeNull();

    expect(() => {
      audioSynth.playClick();
      audioSynth.playPickup();
      audioSynth.playMove();
      audioSynth.playCapture();
      audioSynth.playCheck();
      audioSynth.playCheckmate();
      audioSynth.playVictory();
      audioSynth.playDefeat();
      audioSynth.playDraw();
      audioSynth.playError();
      audioSynth.playTurnNotification();
      audioSynth.playStart();
      audioSynth.playHint();
      audioSynth.playStarEarned();
      audioSynth.playMascotHappy();
      audioSynth.playMascotBlunder();
      audioSynth.playStepComplete();
    }).not.toThrow();
    vi.unstubAllGlobals();
  });

  it('safely catches errors and non-Error rejections during sound synthesis', () => {
    const mockAudioContext = {
      currentTime: 100,
      state: 'running',
      destination: {},
      createOscillator: vi.fn(() => {
        throw new Error('Oscillator hardware failure');
      }),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      })),
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal('AudioContext', vi.fn(function () {
      return mockAudioContext;
    }));

    const s = new AudioSynthesizer({ muted: false });
    expect(() => {
      s.playClick();
      s.playMove();
      s.playCapture();
      s.playCheck();
      s.playCheckmate();
      s.playVictory();
      s.playDefeat();
      s.playDraw();
      s.playError();
      s.playTurnNotification();
      s.playStart();
      s.playHint();
      s.playStarEarned();
      s.playMascotHappy();
      s.playMascotBlunder();
      s.playStepComplete();
    }).not.toThrow();

    // Throw raw non-Error string
    mockAudioContext.createOscillator = vi.fn(() => {
      throw 'Raw string oscillator error';
    });
    expect(() => {
      s.playClick();
      s.playMove();
      s.playCapture();
    }).not.toThrow();

    vi.unstubAllGlobals();
  });

  it('handles visibilitychange when hidden and visible, and pagehide lifecycle event', async () => {
    const s = new AudioSynthesizer({ muted: false });
    s.bootstrap();
    const resumeSpy = vi.spyOn(s, 'resumeContext').mockResolvedValue(undefined);

    // Trigger visibilitychange when hidden
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(resumeSpy).not.toHaveBeenCalled();

    // Trigger visibilitychange when visible
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(resumeSpy).toHaveBeenCalled();

    // Trigger pagehide
    const disposeSpy = vi.spyOn(s, 'dispose');
    window.dispatchEvent(new Event('pagehide'));
    expect(disposeSpy).toHaveBeenCalled();

    await s.dispose();
  });

  it('handles exceptions during dispose event listener removal gracefully', async () => {
    const s = new AudioSynthesizer({ muted: false });
    s.bootstrap();
    const warnSpy = vi.spyOn(logger, 'warn');

    vi.spyOn(document, 'removeEventListener').mockImplementation(() => {
      throw new Error('document removeEventListener failure');
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation(() => {
      throw new Error('window removeEventListener failure');
    });

    await expect(s.dispose()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to remove visibilitychange listener',
      expect.objectContaining({ operation: 'audio_dispose' })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to remove pagehide listener',
      expect.objectContaining({ operation: 'audio_dispose' })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to remove unlock listener',
      expect.objectContaining({ operation: 'audio_dispose' })
    );

    warnSpy.mockRestore();
  });

  it('logs warning when window.addEventListener throws during unlock attachment', () => {
    const s = new AudioSynthesizer({ muted: false });
    const warnSpy = vi.spyOn(logger, 'warn');
    vi.spyOn(window, 'addEventListener').mockImplementationOnce(() => {
      throw new Error('addEventListener blocked by policy');
    });

    s.bootstrap();
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to attach unlock listener',
      expect.objectContaining({ operation: 'audio_attach_unlock_listener' })
    );
    warnSpy.mockRestore();
  });

  it('logs warning when window.removeEventListener throws during user gesture unlock', () => {
    const s = new AudioSynthesizer({ muted: false });
    const warnSpy = vi.spyOn(logger, 'warn');
    s.bootstrap();

    vi.spyOn(window, 'removeEventListener').mockImplementation(() => {
      throw new Error('removeEventListener blocked');
    });

    window.dispatchEvent(new Event('pointerdown'));
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to remove unlock listener',
      expect.objectContaining({ operation: 'audio_remove_unlock_listener' })
    );
    warnSpy.mockRestore();
  });
});

describe('NullAudioService', () => {
  it('conforms to IAudioService as a no-op test double', async () => {
    const nullAudio: IAudioService = new NullAudioService();
    expect(nullAudio.isMuted()).toBe(true);
    expect(nullAudio.toggleMute()).toBe(false);

    expect(() => {
      nullAudio.playMove();
      nullAudio.playCapture();
      nullAudio.playCheck();
      nullAudio.playVictory();
      nullAudio.playDefeat();
    }).not.toThrow();

    await expect(nullAudio.dispose?.()).resolves.toBeUndefined();
  });
});
