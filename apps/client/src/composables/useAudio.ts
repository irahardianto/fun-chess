/**
 * Reactive sound hook with state, triggers, and decoupled device haptics (MIN-017).
 */
import { ref, computed, inject, getCurrentInstance, type Ref } from 'vue';
import type { MoveResult, GameState, GameOverPayload } from '@fun-chess/shared';
import {
  type IAudioService,
  audioSynthesizer as defaultSynth,
} from '../platform/audio/index.js';
import type { IHapticsService } from '../platform/hardware/index.js';
import { logger } from '../platform/telemetry/index.js';
import { AUDIO_CONTEXT_KEY, type AudioContextValue } from '../platform/di/tokens.js';

export function useAudioContext(fallback?: AudioContextValue | null): AudioContextValue | null {
  if (getCurrentInstance()) {
    return inject(AUDIO_CONTEXT_KEY, fallback ?? null);
  }
  return fallback ?? null;
}

export interface GameDomainEventSource {
  onOpponentMove?: (cb: (data: { move: MoveResult; gameState: GameState }) => void) => (() => void);
  onGameCheck?: (cb: () => void) => (() => void);
  onGameOver?: (cb: (payload: GameOverPayload | { winner?: string }) => void) => (() => void);
}

export type GameDomainEvent =
  | { type: 'move'; captured?: boolean }
  | { type: 'opponentMove'; move: { captured?: unknown } }
  | { type: 'check' }
  | { type: 'checkmate' }
  | { type: 'victory' }
  | { type: 'defeat' }
  | { type: 'draw' };

import { useHaptics, type UseHapticsReturn } from './useHaptics';
export { useHaptics, type UseHapticsReturn };

/**
 * Reactive audio composable with state, sound effects, and decoupled haptic triggers.
 */
export function useAudio(injectedSynth?: IAudioService, injectedHaptics?: IHapticsService) {
  const audioContext = getCurrentInstance() ? inject(AUDIO_CONTEXT_KEY, null) : null;
  const synth: IAudioService = injectedSynth || defaultSynth;
  const hapticController = useHaptics(injectedHaptics);
  const localMuted = ref(synth.isMuted());
  const isMuted: Ref<boolean> = audioContext ? audioContext.isMuted : localMuted;
  const isSoundEnabled = computed<boolean>({
    get: () => !isMuted.value,
    set: (enabled: boolean) => setMuted(!enabled),
  });

  function setMuted(muted: boolean): void {
    synth.setMuted(muted);
    if (audioContext) {
      audioContext.setMuted(muted);
    } else {
      localMuted.value = muted;
    }
  }

  function toggleMute(): boolean {
    if (audioContext) {
      const newState = audioContext.toggleMute();
      synth.setMuted(newState);
      return newState;
    }
    const newState = synth.toggleMute();
    localMuted.value = newState;
    return newState;
  }

  function toggleSound(): boolean {
    return !toggleMute();
  }

  function setSoundEnabled(enabled: boolean): void {
    setMuted(!enabled);
  }

  function playMove(): void {
    synth.playMove();
    hapticController.triggerMove();
  }

  function playCapture(): void {
    synth.playCapture();
    hapticController.triggerCapture();
  }

  function playCheck(): void {
    synth.playCheck();
    hapticController.triggerCheck();
  }

  function playCheckmate(): void {
    synth.playCheckmate();
    hapticController.triggerCheckmate();
  }

  function playVictory(): void {
    synth.playVictory();
    hapticController.triggerVictory();
  }

  function playDefeat(): void {
    synth.playDefeat();
  }

  function playDraw(): void {
    synth.playDraw();
  }

  function playError(): void {
    synth.playError();
    hapticController.triggerError();
  }

  function playClick(): void {
    synth.playClick();
  }

  function playPickup(): void {
    synth.playPickup();
  }

  function playTurnNotification(): void {
    synth.playTurnNotification();
    hapticController.triggerTurnNotification();
  }

  function playStart(): void {
    synth.playStart();
  }

  function playHint(): void {
    synth.playHint();
  }

  function playStarEarned(): void {
    synth.playStarEarned();
    hapticController.triggerStarEarned();
  }

  function playMascotHappy(): void {
    synth.playMascotHappy();
  }

  function playMascotBlunder(): void {
    synth.playMascotBlunder();
  }

  function playStepComplete(): void {
    synth.playStepComplete();
    hapticController.triggerStepComplete();
  }

  function resumeAudio(): void {
    synth.resumeContext();
  }

  function initAudio(): void {
    synth.initContext();
  }

  /**
   * Dispatches audio playback for game domain events (ENH-006).
   */
  function handleGameEvent(event: GameDomainEvent): void {
    switch (event.type) {
      case 'move':
        if (event.captured) {
          playCapture();
        } else {
          playMove();
        }
        break;
      case 'opponentMove':
        if (event.move?.captured) {
          playCapture();
        } else {
          playMove();
        }
        break;
      case 'check':
        playCheck();
        break;
      case 'checkmate':
        playCheckmate();
        break;
      case 'victory':
        playVictory();
        break;
      case 'defeat':
        playDefeat();
        break;
      case 'draw':
        playDraw();
        break;
    }
  }

  /**
   * Subscribes audio playback to game domain event emitters (ENH-006).
   * Returns an unsubscribe cleanup function.
   */
  function attachGameEventListeners(source: GameDomainEventSource): () => void {
    const unsubs: Array<() => void> = [];

    if (source && typeof source.onOpponentMove === 'function') {
      const unsub = source.onOpponentMove((data) => {
        handleGameEvent({ type: 'opponentMove', move: data.move });
      });
      if (typeof unsub === 'function') {
        unsubs.push(unsub);
      }
    }

    if (source && typeof source.onGameCheck === 'function') {
      const unsub = source.onGameCheck(() => {
        handleGameEvent({ type: 'check' });
      });
      if (typeof unsub === 'function') {
        unsubs.push(unsub);
      }
    }

    if (source && typeof source.onGameOver === 'function') {
      const unsub = source.onGameOver((payload) => {
        if (payload?.winner === 'draw') {
          handleGameEvent({ type: 'draw' });
        } else if (payload?.winner) {
          handleGameEvent({ type: 'victory' });
        }
      });
      if (typeof unsub === 'function') {
        unsubs.push(unsub);
      }
    }

    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch (err) {
          logger.debug('Failed to unsubscribe audio listener', {
            operation: 'audio_unsubscribe_listener',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    };
  }

  return {
    isMuted,
    isSoundEnabled,
    toggleMute,
    setMuted,
    toggleSound,
    setSoundEnabled,
    playMove,
    playCapture,
    playCheck,
    playCheckmate,
    playVictory,
    playDefeat,
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
    resumeAudio,
    initAudio,
    handleGameEvent,
    attachGameEventListeners,
    triggerHaptic: hapticController.triggerHaptic,
  };
}
