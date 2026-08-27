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

  function triggerHaptic(pattern: number | number[]): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore environment vibration errors
      }
    }
  }

  return {
    isMuted,
    isSoundEnabled,
    toggleMute,
    setMuted,
    toggleSound,
    setSoundEnabled,
    playMove: () => {
      synth.playMove();
      triggerHaptic(12);
    },
    playCapture: () => {
      synth.playCapture();
      triggerHaptic([20, 30, 20]);
    },
    playCheck: () => {
      synth.playCheck();
      triggerHaptic([40, 40, 40]);
    },
    playVictory: () => {
      synth.playVictory();
      triggerHaptic([50, 50, 100, 50, 150]);
    },
    playDraw: () => synth.playDraw(),
    playError: () => {
      synth.playError();
      triggerHaptic(50);
    },
    playClick: () => synth.playClick(),
    playPickup: () => synth.playPickup(),
    playTurnNotification: () => {
      synth.playTurnNotification();
      triggerHaptic([30, 50, 30]);
    },
    playStart: () => synth.playStart(),
    playHint: () => synth.playHint(),
    playStarEarned: () => {
      synth.playStarEarned();
      triggerHaptic([30, 40, 60]);
    },
    playMascotHappy: () => synth.playMascotHappy(),
    playMascotBlunder: () => synth.playMascotBlunder(),
    playStepComplete: () => {
      synth.playStepComplete();
      triggerHaptic([25, 35, 50]);
    },
    resumeAudio: () => synth.resumeContext(),
    initAudio: () => synth.initContext(),
  };
}
