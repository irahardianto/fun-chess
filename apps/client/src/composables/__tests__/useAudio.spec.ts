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
  });
});
