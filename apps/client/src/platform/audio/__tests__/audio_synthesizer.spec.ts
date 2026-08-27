import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioSynthesizer } from '../audio_synthesizer';

describe('AudioSynthesizer', () => {
  let synth: AudioSynthesizer;

  beforeEach(() => {
    synth = new AudioSynthesizer({ muted: false });
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

    audioSynth.playDraw(); // 1 oscillator (total 9 + 1 = 10)
    audioSynth.playError(); // 1 oscillator (total 10 + 1 = 11)
    audioSynth.playClick(); // 1 oscillator (total 11 + 1 = 12)
    audioSynth.playTurnNotification(); // 1 oscillator (total 12 + 1 = 13)
    audioSynth.playStart(); // 4 oscillators (total 13 + 4 = 17)
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(17);

    audioSynth.playHint(); // 3 oscillators (total 17 + 3 = 20)
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(20);

    audioSynth.playStarEarned(); // 3 oscillators (total 20 + 3 = 23)
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(23);

    audioSynth.playMascotHappy(); // 1 oscillator (total 23 + 1 = 24)
    audioSynth.playMascotBlunder(); // 1 oscillator (total 24 + 1 = 25)
    audioSynth.playStepComplete(); // 2 oscillators (total 25 + 2 = 27)
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(27);

    // When muted, no audio nodes should be created
    const callCountBeforeMute = mockAudioContext.createOscillator.mock.calls.length;
    audioSynth.setMuted(true);
    audioSynth.playMove();
    expect(mockAudioContext.createOscillator.mock.calls.length).toBe(callCountBeforeMute);

    vi.unstubAllGlobals();
  });

  it('supports initContext and resumeContext lifecycle methods', () => {
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

    vi.unstubAllGlobals();
  });
});
