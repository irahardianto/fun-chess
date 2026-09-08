/**
 * Reactive sound hook with state and triggers.
 */
import { ref } from 'vue';
import type { MoveResult, GameState } from '@fun-chess/shared';
import {
  type IAudioService,
  audioSynthesizer as defaultSynth,
} from '../platform/audio/index.js';
import {
  type IHapticsService,
  defaultHapticsService,
} from '../platform/hardware/index.js';
import { logger } from '../platform/telemetry/index.js';

export interface GameDomainEventSource {
  onOpponentMove?: (cb: (data: { move: MoveResult; gameState: GameState }) => void) => (() => void);
  onGameCheck?: (cb: () => void) => (() => void);
  onGameOver?: (cb: (payload: { winner?: string }) => void) => (() => void);
}

export type GameDomainEvent =
  | { type: 'move'; captured?: boolean }
  | { type: 'opponentMove'; move: { captured?: unknown } }
  | { type: 'check' }
  | { type: 'checkmate' }
  | { type: 'victory' }
  | { type: 'defeat' }
  | { type: 'draw' };

export function useAudio(injectedSynth?: IAudioService, injectedHaptics?: IHapticsService) {
  const synth: IAudioService = injectedSynth || defaultSynth;
  const haptics: IHapticsService = injectedHaptics || defaultHapticsService;
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
    try {
      haptics.vibrate(pattern);
    } catch (err) {
      logger.debug('Haptic vibration failed', {
        operation: 'audio_trigger_haptic',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function playMove(): void {
    synth.playMove();
    triggerHaptic(12);
  }

  function playCapture(): void {
    synth.playCapture();
    triggerHaptic([20, 30, 20]);
  }

  function playCheck(): void {
    synth.playCheck();
    triggerHaptic([40, 40, 40]);
  }

  function playCheckmate(): void {
    synth.playCheckmate();
    triggerHaptic([60, 60, 120]);
  }

  function playVictory(): void {
    synth.playVictory();
    triggerHaptic([50, 50, 100, 50, 150]);
  }

  function playDefeat(): void {
    synth.playDefeat();
  }

  function playDraw(): void {
    synth.playDraw();
  }

  function playError(): void {
    synth.playError();
    triggerHaptic(50);
  }

  function playClick(): void {
    synth.playClick();
  }

  function playPickup(): void {
    synth.playPickup();
  }

  function playTurnNotification(): void {
    synth.playTurnNotification();
    triggerHaptic([30, 50, 30]);
  }

  function playStart(): void {
    synth.playStart();
  }

  function playHint(): void {
    synth.playHint();
  }

  function playStarEarned(): void {
    synth.playStarEarned();
    triggerHaptic([30, 40, 60]);
  }

  function playMascotHappy(): void {
    synth.playMascotHappy();
  }

  function playMascotBlunder(): void {
    synth.playMascotBlunder();
  }

  function playStepComplete(): void {
    synth.playStepComplete();
    triggerHaptic([25, 35, 50]);
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
  };
}
