/**
 * Reactive sound hook with state and triggers.
 */
import { ref } from 'vue';
import { AudioSynthesizer, audioSynthesizer as defaultSynth } from '../platform/audio/audio_synthesizer';

export function useAudio(injectedSynth?: AudioSynthesizer) {
  const synth = injectedSynth || defaultSynth;
  const isMuted = ref(synth.isMuted());
  const isSoundEnabled = ref(!synth.isMuted());

  function setMuted(muted: boolean): void {
    synth.setMuted(muted);
    isMuted.value = muted;
    isSoundEnabled.value = !muted;
  }

  function toggleMute(): boolean {
    const newState = synth.toggleMute();
    isMuted.value = newState;
    isSoundEnabled.value = !newState;
    return newState;
  }

  function toggleSound(): boolean {
    return !toggleMute();
  }

  function setSoundEnabled(enabled: boolean): void {
    setMuted(!enabled);
  }

  return {
    isMuted,
    isSoundEnabled,
    toggleMute,
    setMuted,
    toggleSound,
    setSoundEnabled,
    playMove: () => synth.playMove(),
    playCapture: () => synth.playCapture(),
    playCheck: () => synth.playCheck(),
    playVictory: () => synth.playVictory(),
    playDraw: () => synth.playDraw(),
    playError: () => synth.playError(),
    playClick: () => synth.playClick(),
    playPickup: () => synth.playPickup(),
    playTurnNotification: () => synth.playTurnNotification(),
    playStart: () => synth.playStart(),
    playHint: () => synth.playHint(),
    playStarEarned: () => synth.playStarEarned(),
    playMascotHappy: () => synth.playMascotHappy(),
    playMascotBlunder: () => synth.playMascotBlunder(),
    playStepComplete: () => synth.playStepComplete(),
  };
}
