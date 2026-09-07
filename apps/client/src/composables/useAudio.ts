/**
 * Reactive sound hook with state and triggers.
 */
import { ref } from 'vue';
import {
  type IAudioService,
  AudioSynthesizer,
  audioSynthesizer as defaultSynth,
} from '../platform/audio/index.js';

export function useAudio(injectedSynth?: IAudioService | AudioSynthesizer) {
  const synth = (injectedSynth || defaultSynth) as AudioSynthesizer;
  const isMuted = ref(synth.isMuted());
  const isSoundEnabled = ref(!synth.isMuted());

  function setMuted(muted: boolean): void {
    if ('setMuted' in synth && typeof synth.setMuted === 'function') {
      synth.setMuted(muted);
    } else if (synth.isMuted() !== muted) {
      synth.toggleMute();
    }
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
      } catch (err) {
        console.warn('[useAudio] Haptic vibration failed:', err);
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
    playDraw: () => {
      if ('playDraw' in synth && typeof synth.playDraw === 'function') {
        synth.playDraw();
      }
    },
    playError: () => {
      if ('playError' in synth && typeof synth.playError === 'function') {
        synth.playError();
      }
      triggerHaptic(50);
    },
    playClick: () => {
      if ('playClick' in synth && typeof synth.playClick === 'function') {
        synth.playClick();
      }
    },
    playPickup: () => {
      if ('playPickup' in synth && typeof synth.playPickup === 'function') {
        synth.playPickup();
      }
    },
    playTurnNotification: () => {
      if ('playTurnNotification' in synth && typeof synth.playTurnNotification === 'function') {
        synth.playTurnNotification();
      }
      triggerHaptic([30, 50, 30]);
    },
    playStart: () => {
      if ('playStart' in synth && typeof synth.playStart === 'function') {
        synth.playStart();
      }
    },
    playHint: () => {
      if ('playHint' in synth && typeof synth.playHint === 'function') {
        synth.playHint();
      }
    },
    playStarEarned: () => {
      if ('playStarEarned' in synth && typeof synth.playStarEarned === 'function') {
        synth.playStarEarned();
      }
      triggerHaptic([30, 40, 60]);
    },
    playMascotHappy: () => {
      if ('playMascotHappy' in synth && typeof synth.playMascotHappy === 'function') {
        synth.playMascotHappy();
      }
    },
    playMascotBlunder: () => {
      if ('playMascotBlunder' in synth && typeof synth.playMascotBlunder === 'function') {
        synth.playMascotBlunder();
      }
    },
    playStepComplete: () => {
      if ('playStepComplete' in synth && typeof synth.playStepComplete === 'function') {
        synth.playStepComplete();
      }
      triggerHaptic([25, 35, 50]);
    },
    resumeAudio: () => {
      if ('resumeContext' in synth && typeof synth.resumeContext === 'function') {
        synth.resumeContext();
      }
    },
    initAudio: () => {
      if ('initContext' in synth && typeof synth.initContext === 'function') {
        synth.initContext();
      }
    },
  };
}
