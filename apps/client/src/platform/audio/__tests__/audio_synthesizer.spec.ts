import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioSynthesizer } from '../audio_synthesizer';
import { NullAudioService } from '../null_audio_service';
import type { IAudioService } from '../audio.interface';

describe('AudioSynthesizer', () => {
  let synth: AudioSynthesizer;

  beforeEach(() => {
    synth = new AudioSynthesizer({ muted: false });
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
    vi.stubGlobal('AudioContext', vi.fn(() => mockAudioContext));

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

    vi.stubGlobal('AudioContext', vi.fn(() => mockAudioContext));

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

    vi.stubGlobal('AudioContext', vi.fn(() => mockAudioContext));

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
