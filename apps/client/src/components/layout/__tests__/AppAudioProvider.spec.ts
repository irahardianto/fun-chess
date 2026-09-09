import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import AppAudioProvider, { useAudioContext } from '../AppAudioProvider.vue';
import {
  AUDIO_SERVICE_KEY,
  HAPTICS_KEY,
  STORAGE_KEY,
  LOGGER_KEY,
} from '@/platform/di/tokens';
import type { IHapticsService } from '@/platform/hardware/haptics';
import type { KeyValueStorage } from '@/platform/storage/key_value_storage';
import type { ILogger } from '@/platform/telemetry';
import type { GameDomainEventSource } from '@/composables/useAudio';

describe('AppAudioProvider.vue', () => {
  let mockSynth: Record<string, any>;
  let mockHaptics: Partial<IHapticsService>;
  let mockStorage: Partial<KeyValueStorage>;
  let mockLogger: Partial<ILogger>;
  let storageMap: Map<string, string>;
  let synthMuted: boolean;

  beforeEach(() => {
    storageMap = new Map();
    synthMuted = false;

    mockSynth = {
      isSupported: vi.fn().mockReturnValue(true),
      initContext: vi.fn().mockReturnValue(null),
      resumeContext: vi.fn(),
      dispose: vi.fn(),
      setMuted: vi.fn((m: boolean) => {
        synthMuted = m;
      }),
      isMuted: vi.fn(() => synthMuted),
      toggleMute: vi.fn(() => {
        synthMuted = !synthMuted;
        return synthMuted;
      }),
      playMove: vi.fn(),
      playCapture: vi.fn(),
      playCheck: vi.fn(),
      playCheckmate: vi.fn(),
      playVictory: vi.fn(),
      playDefeat: vi.fn(),
      playDraw: vi.fn(),
      playStart: vi.fn(),
      playError: vi.fn(),
      playStarEarned: vi.fn(),
      playClick: vi.fn(),
      playPickup: vi.fn(),
      playTurnNotification: vi.fn(),
      destroy: vi.fn(),
    };

    mockHaptics = {
      vibrate: vi.fn().mockReturnValue(true),
      isSupported: vi.fn().mockReturnValue(true),
    };

    mockStorage = {
      getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
      setItem: vi.fn((key: string, val: string) => {
        storageMap.set(key, val);
      }),
      removeItem: vi.fn((key: string) => {
        storageMap.delete(key);
      }),
      clear: vi.fn(() => storageMap.clear()),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createComponent(props = {}, slotContent?: unknown) {
    return mount(AppAudioProvider, {
      props,
      global: {
        provide: {
          [AUDIO_SERVICE_KEY]: mockSynth,
          [HAPTICS_KEY]: mockHaptics,
          [STORAGE_KEY]: mockStorage,
          [LOGGER_KEY]: mockLogger,
        },
      },
      slots: {
        default: (slotContent as any) || '<div class="test-slot">Child Content</div>',
      },
    });
  }

  it('renders default slot and provides audio context to children', async () => {
    const ChildConsumer = defineComponent({
      setup() {
        const audioCtx = useAudioContext();
        return { audioCtx };
      },
      render() {
        return h(
          'button',
          {
            id: 'mute-btn',
            onClick: () => this.audioCtx.toggleMute(),
          },
          `Muted: ${this.audioCtx.isMuted.value}`
        );
      },
    });

    const wrapper = mount(AppAudioProvider, {
      global: {
        provide: {
          [AUDIO_SERVICE_KEY]: mockSynth,
          [HAPTICS_KEY]: mockHaptics,
          [STORAGE_KEY]: mockStorage,
          [LOGGER_KEY]: mockLogger,
        },
      },
      slots: {
        default: h(ChildConsumer),
      },
    });

    expect(wrapper.text()).toContain('Muted: false');
    const btn = wrapper.find('#mute-btn');
    await btn.trigger('click');
    await nextTick();
    expect(wrapper.text()).toContain('Muted: true');
  });

  it('throws error when useAudioContext is called outside of provider', () => {
    const BadComponent = defineComponent({
      setup() {
        useAudioContext();
        return {};
      },
      render() {
        return h('div');
      },
    });

    expect(() => mount(BadComponent)).toThrow(
      'useAudioContext must be used within an AppAudioProvider'
    );
  });

  it('restores persisted audio mute state from storage on mount', () => {
    storageMap.set('fun_chess_audio_muted', 'true');
    const wrapper = createComponent();
    expect(wrapper.vm.isMuted).toBe(true);
  });

  it('handles storage read errors gracefully when restoring mute state', () => {
    mockStorage.getItem = vi.fn().mockImplementation(() => {
      throw new Error('Storage access blocked');
    });
    const wrapper = createComponent();
    expect(wrapper.vm.isMuted).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to read persisted audio mute state',
      expect.objectContaining({ operation: 'audio_read_persisted_mute' })
    );
  });

  it('persists mute state changes to storage and logs errors if storage fails', async () => {
    const wrapper = createComponent();
    wrapper.vm.setMuted(true);
    expect(storageMap.get('fun_chess_audio_muted')).toBe('true');

    // Make storage throw
    mockStorage.setItem = vi.fn().mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    wrapper.vm.setMuted(false);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to persist audio mute state',
      expect.objectContaining({ operation: 'audio_persist_mute' })
    );
  });

  it('plays sounds through exposed methods and context', () => {
    const wrapper = createComponent();
    wrapper.vm.playMove();
    wrapper.vm.playCapture();
    wrapper.vm.playCheck();
    wrapper.vm.playVictory();
    wrapper.vm.playDraw();
    wrapper.vm.playStart();
    wrapper.vm.playError();
    wrapper.vm.playStarEarned();
    wrapper.vm.playClick();
    expect(mockSynth.playMove).toHaveBeenCalled();
    expect(mockSynth.playCapture).toHaveBeenCalled();
    expect(mockSynth.playCheck).toHaveBeenCalled();
    expect(mockSynth.playVictory).toHaveBeenCalled();
    expect(mockSynth.playDraw).toHaveBeenCalled();
    expect(mockSynth.playStart).toHaveBeenCalled();
    expect(mockSynth.playError).toHaveBeenCalled();
    expect(mockSynth.playClick).toHaveBeenCalled();
  });

  it('attaches and triggers audio unlock gesture on user interaction', () => {
    const wrapper = createComponent();
    wrapper.vm.handleUnlockGesture();
    expect(mockSynth.resumeContext).toHaveBeenCalled();
    expect(mockSynth.initContext).toHaveBeenCalled();
  });

  it('attaches and cleans up game domain event listeners from socketApi prop', async () => {
    const mockUnsubscribe = vi.fn();
    const mockSocketApi: GameDomainEventSource = {
      onOpponentMove: vi.fn().mockReturnValue(mockUnsubscribe),
      onGameCheck: vi.fn().mockReturnValue(mockUnsubscribe),
      onGameOver: vi.fn().mockReturnValue(mockUnsubscribe),
    };

    const wrapper = createComponent({ socketApi: mockSocketApi });
    expect(mockSocketApi.onOpponentMove).toHaveBeenCalled();
    expect(mockSocketApi.onGameCheck).toHaveBeenCalled();
    expect(mockSocketApi.onGameOver).toHaveBeenCalled();

    // Update socketApi prop
    const newUnsubscribe = vi.fn();
    const newMockSocketApi: GameDomainEventSource = {
      onOpponentMove: vi.fn().mockReturnValue(newUnsubscribe),
      onGameCheck: vi.fn().mockReturnValue(newUnsubscribe),
      onGameOver: vi.fn().mockReturnValue(newUnsubscribe),
    };
    await wrapper.setProps({ socketApi: newMockSocketApi });
    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(newMockSocketApi.onOpponentMove).toHaveBeenCalled();

    // Unmount cleans up
    wrapper.unmount();
    expect(newUnsubscribe).toHaveBeenCalled();
  });

  it('provides slot props for is-muted and toggle-mute', async () => {
    const wrapper = mount(AppAudioProvider, {
      global: {
        provide: {
          [AUDIO_SERVICE_KEY]: mockSynth,
          [HAPTICS_KEY]: mockHaptics,
          [STORAGE_KEY]: mockStorage,
          [LOGGER_KEY]: mockLogger,
        },
      },
      slots: {
        default: `<template #default="{ isMuted, toggleMute }">
          <button id="slot-btn" @click="toggleMute">State: {{ isMuted }}</button>
        </template>`,
      },
    });

    expect(wrapper.text()).toContain('State: false');
    await wrapper.find('#slot-btn').trigger('click');
    await nextTick();
    expect(wrapper.text()).toContain('State: true');
  });

  it('persists game event listeners across match resets and allows explicit reconnection (CRIT-002)', async () => {
    let opponentMoveHandler: ((data: any) => void) | null = null;
    const mockUnsubscribe = vi.fn();
    const mockSocketApi: GameDomainEventSource = {
      onOpponentMove: vi.fn((handler) => {
        opponentMoveHandler = handler;
        return mockUnsubscribe;
      }),
      onGameCheck: vi.fn().mockReturnValue(mockUnsubscribe),
      onGameOver: vi.fn().mockReturnValue(mockUnsubscribe),
    };

    const wrapper = createComponent({ socketApi: mockSocketApi });
    expect(mockSocketApi.onOpponentMove).toHaveBeenCalledTimes(1);

    // Verify opponent move handler triggers sound
    opponentMoveHandler!({ move: { captured: false, san: 'e4' } });
    expect(mockSynth.playMove).toHaveBeenCalledTimes(1);

    // Trigger explicit reconnectAudioListeners
    wrapper.vm.reconnectAudioListeners();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(3);
    expect(mockSocketApi.onOpponentMove).toHaveBeenCalledTimes(2);
  });
});
