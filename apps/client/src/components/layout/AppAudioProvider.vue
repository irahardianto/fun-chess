<script lang="ts">
import { inject } from 'vue';
import type { GameDomainEventSource } from '@/composables/useAudio';
import { AUDIO_CONTEXT_KEY, type AudioContextValue } from '@/platform/di/tokens';

export { AUDIO_CONTEXT_KEY, type AudioContextValue };

export function useAudioContext(): AudioContextValue {
  const ctx = inject(AUDIO_CONTEXT_KEY);
  if (!ctx) {
    throw new Error('useAudioContext must be used within an AppAudioProvider');
  }
  return ctx;
}

export interface AppAudioProviderProps {
  socketApi?: GameDomainEventSource;
}
</script>

<script setup lang="ts">
import {
  watch,
  onMounted,
  onUnmounted,
  provide,
} from 'vue';
import { useAudio } from '@/composables/useAudio';
import {
  useInjectAudioService,
  useInjectHaptics,
  useInjectStorage,
  useInjectLogger,
} from '@/platform/di';
import { STORAGE_KEYS } from '@/platform/storage';

const props = defineProps<AppAudioProviderProps>();

const synth = useInjectAudioService();
const haptics = useInjectHaptics();
const storage = useInjectStorage();
const logger = useInjectLogger();

const audio = useAudio(synth, haptics);

const AUDIO_MUTED_STORAGE_KEY =
  (STORAGE_KEYS as Record<string, string>).AUDIO_MUTED || 'fun_chess_audio_muted';

function persistMuteState(muted: boolean): void {
  try {
    storage.setItem(AUDIO_MUTED_STORAGE_KEY, String(muted));
  } catch (err) {
    logger.warn('Failed to persist audio mute state', {
      operation: 'audio_persist_mute',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Restore persisted audio mute state
try {
  const persistedMuted = storage.getItem(AUDIO_MUTED_STORAGE_KEY);
  if (persistedMuted !== null) {
    audio.setMuted(persistedMuted === 'true');
  }
} catch (err) {
  logger.warn('Failed to read persisted audio mute state', {
    operation: 'audio_read_persisted_mute',
    error: err instanceof Error ? err.message : String(err),
  });
}

function setMuted(muted: boolean): void {
  audio.setMuted(muted);
  persistMuteState(muted);
}

function toggleMute(): boolean {
  const newState = audio.toggleMute();
  persistMuteState(newState);
  return newState;
}

// Reactive sync with synchronous flush as fallback
watch(
  () => audio.isMuted.value,
  (newVal) => {
    persistMuteState(newVal);
  },
  { flush: 'sync' },
);

// Provide audio context to children
const contextValue: AudioContextValue = {
  isMuted: audio.isMuted,
  toggleMute,
  setMuted,
  playMove: audio.playMove,
  playCapture: audio.playCapture,
  playCheck: audio.playCheck,
  playVictory: audio.playVictory,
  playDraw: audio.playDraw,
  playStart: audio.playStart,
  playError: audio.playError,
  playStarEarned: audio.playStarEarned,
  playClick: audio.playClick,
};

provide(AUDIO_CONTEXT_KEY, contextValue);

// Unlock audio on first user gesture
const unlockEvents = ['click', 'keydown', 'touchstart'] as const;

function handleUnlockGesture() {
  audio.resumeAudio();
  audio.initAudio();
  removeUnlockListeners();
}

function removeUnlockListeners() {
  if (typeof window === 'undefined') return;
  unlockEvents.forEach((evt) => {
    try {
      window.removeEventListener(evt, handleUnlockGesture, true);
    } catch (err) {
      logger.debug('Failed to remove audio unlock gesture listener', {
        operation: 'audio_remove_unlock',
        event: evt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

function attachUnlockListeners() {
  if (typeof window === 'undefined') return;
  unlockEvents.forEach((evt) => {
    try {
      window.addEventListener(evt, handleUnlockGesture, {
        once: true,
        capture: true,
        passive: true,
      });
    } catch (err) {
      logger.warn('Failed to attach audio unlock gesture listener', {
        operation: 'audio_attach_unlock',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

// Socket game event listeners lifecycle
let cleanupAudioListeners: (() => void) | null = null;

function setupSocketListeners(api?: GameDomainEventSource) {
  if (cleanupAudioListeners) {
    cleanupAudioListeners();
    cleanupAudioListeners = null;
  }
  const targetApi = api ?? props.socketApi;
  if (targetApi) {
    cleanupAudioListeners = audio.attachGameEventListeners(targetApi);
  }
}

onMounted(() => {
  attachUnlockListeners();
  setupSocketListeners(props.socketApi);
});

watch(
  () => props.socketApi,
  (newApi) => {
    setupSocketListeners(newApi);
  },
);

onUnmounted(() => {
  removeUnlockListeners();
  if (cleanupAudioListeners) {
    cleanupAudioListeners();
    cleanupAudioListeners = null;
  }
});

const isMuted = audio.isMuted;

defineExpose({
  isMuted: audio.isMuted,
  toggleMute,
  setMuted,
  setupSocketListeners,
  reconnectAudioListeners: () => setupSocketListeners(props.socketApi),
  playMove: audio.playMove,
  playCapture: audio.playCapture,
  playCheck: audio.playCheck,
  playVictory: audio.playVictory,
  playDraw: audio.playDraw,
  playStart: audio.playStart,
  playError: audio.playError,
  playStarEarned: audio.playStarEarned,
  playClick: audio.playClick,
  resumeAudio: audio.resumeAudio,
  initAudio: audio.initAudio,
  handleUnlockGesture,
});
</script>

<template>
  <slot :is-muted="isMuted" :toggle-mute="toggleMute" />
</template>
