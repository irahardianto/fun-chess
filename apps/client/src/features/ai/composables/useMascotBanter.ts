import { ref, computed, toValue, onUnmounted, getCurrentInstance, onScopeDispose, getCurrentScope, type MaybeRef } from 'vue';
import type { MascotPersona, MascotDialogueTrigger } from '@fun-chess/shared';

export interface UseMascotBanterOptions {
  /** Initial mascot persona */
  persona?: MaybeRef<MascotPersona>;
  /** Auto-clear dialogue duration in milliseconds (0 to keep until next event, default: 0) */
  autoClearMs?: number;
  /** Injected random number generator (default: Math.random) (MAJ-013) */
  randomFn?: () => number;
}

/**
 * Reactive speech bubble dialogue manager for AI mascot personas.
 * Triggers contextual banter responding to chess events (moves, captures, checks, hints, undos, game over).
 */
export function useMascotBanter(options?: UseMascotBanterOptions | MaybeRef<MascotPersona>) {
  const initialPersona = options && 'dialogues' in (toValue(options) as object)
    ? (options as MaybeRef<MascotPersona>)
    : (options as UseMascotBanterOptions)?.persona;

  const currentPersona = ref<MascotPersona | null>(
    initialPersona ? toValue(initialPersona) : null,
  );

  const activeDialogue = ref<string | null>(null);
  const lastTrigger = ref<MascotDialogueTrigger | null>(null);
  const isSpeaking = ref<boolean>(false);
  let clearTimer: ReturnType<typeof setTimeout> | null = null;
  let speakingTimer: ReturnType<typeof setTimeout> | null = null;

  const autoClearMs = (options && !('dialogues' in (toValue(options) as object)))
    ? (options as UseMascotBanterOptions).autoClearMs ?? 0
    : 0;

  const randomFn = (options && typeof options === 'object' && 'randomFn' in options && typeof options.randomFn === 'function')
    ? options.randomFn
    : Math.random;

  function clearTimers(): void {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    if (speakingTimer) {
      clearTimeout(speakingTimer);
      speakingTimer = null;
    }
  }

  function setPersona(persona: MascotPersona): void {
    currentPersona.value = persona;
  }

  /**
   * Triggers a speech bubble line based on the event trigger.
   */
  function triggerBanter(trigger: MascotDialogueTrigger, customText?: string): string {
    clearTimers();
    lastTrigger.value = trigger;

    let line: string;
    if (customText) {
      line = customText;
    } else {
      const persona = currentPersona.value;
      const lines = persona?.dialogues?.[trigger];
      if (lines && lines.length > 0) {
        const randomIndex = Math.floor(randomFn() * lines.length);
        line = lines[randomIndex] ?? lines[0]!;
      } else {
        line = 'Let’s play chess!';
      }
    }

    activeDialogue.value = line;
    isSpeaking.value = true;

    // Reset speaking burst animation state after 600ms
    speakingTimer = setTimeout(() => {
      isSpeaking.value = false;
    }, 600);

    if (autoClearMs > 0) {
      clearTimer = setTimeout(() => {
        activeDialogue.value = null;
      }, autoClearMs);
    }

    return line;
  }

  function setCustomDialogue(text: string): void {
    clearTimers();
    activeDialogue.value = text;
    isSpeaking.value = true;
    speakingTimer = setTimeout(() => {
      isSpeaking.value = false;
    }, 600);
  }

  function clearBanter(): void {
    clearTimers();
    activeDialogue.value = null;
    isSpeaking.value = false;
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      clearTimers();
    });
  } else if (getCurrentInstance()) {
    onUnmounted(() => {
      clearTimers();
    });
  }

  return {
    currentPersona: computed(() => currentPersona.value),
    activeDialogue: computed(() => activeDialogue.value),
    lastTrigger: computed(() => lastTrigger.value),
    isSpeaking: computed(() => isSpeaking.value),
    setPersona,
    triggerBanter,
    setCustomDialogue,
    clearBanter,
  };
}
