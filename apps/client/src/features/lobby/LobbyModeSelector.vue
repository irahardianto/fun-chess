<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { AppGameMode, LobbyModeOption } from '@fun-chess/shared';
import { useRovingTabindex } from '@/platform/ui';

interface Props {
  modelValue?: AppGameMode;
  completedCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 'multiplayer_lan',
  completedCount: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [mode: AppGameMode];
  select: [mode: AppGameMode];
}>();

const modeOptions: readonly LobbyModeOption[] = [
  {
    id: 'multiplayer_lan',
    title: 'Play with Friends',
    subtitle: 'Online or Wi-Fi',
    icon: '👥',
    colorTheme: 'primary',
  },
  {
    id: 'solo_ai',
    title: 'Play vs AI',
    subtitle: '4 Mascots',
    icon: '🤖',
    colorTheme: 'accent',
  },
  {
    id: 'academy',
    title: 'Chess Academy',
    subtitle: 'Tutorials & Puzzles',
    icon: '🎓',
    colorTheme: 'warning',
  },
  {
    id: 'puzzle_hub',
    title: 'Puzzle Hub',
    subtitle: 'Drills & Rush',
    icon: '🧩',
    colorTheme: 'primary',
  },
];

const modeIds = computed(() => modeOptions.map((m) => m.id));
const selectedMode = ref<AppGameMode>(props.modelValue);

watch(
  () => props.modelValue,
  (newVal) => {
    if (newVal) selectedMode.value = newVal;
  },
);

function selectMode(modeId: AppGameMode) {
  selectedMode.value = modeId;
  emit('update:modelValue', modeId);
  emit('select', modeId);
}

const { handleKeyDown, getTabindex } = useRovingTabindex({
  items: modeIds,
  modelValue: selectedMode,
  orientation: 'both',
  idPrefix: 'mode-tab-',
  onSelect: (id) => {
    selectMode(id);
  },
});
</script>

<template>
  <nav
    class="mode-switcher-container"
    role="tablist"
    aria-label="Game Mode Selection"
    data-testid="lobby-mode-selector"
  >
    <button
      v-for="mode in modeOptions"
      :key="mode.id"
      :id="`mode-tab-${mode.id}`"
      type="button"
      role="tab"
      :tabindex="getTabindex(mode.id)"
      :aria-selected="props.modelValue === mode.id"
      :aria-controls="`mode-panel-${mode.id}`"
      :data-testid="`mode-tab-${mode.id}`"
      class="mode-tab-button"
      :class="[
        `theme--${mode.id}`,
        { 'is-active': props.modelValue === mode.id },
      ]"
      @click="selectMode(mode.id)"
      @keydown="handleKeyDown($event, mode.id)"
    >
      <span class="mode-icon" aria-hidden="true">{{ mode.icon }}</span>
      <div class="mode-text-group">
        <span class="mode-title">{{ mode.title }}</span>
        <span class="mode-badge">{{ mode.subtitle }}</span>
      </div>
      <span
        v-if="mode.id === 'academy' && (props.completedCount ?? 0) === 0"
        class="start-here-badge"
        data-testid="start-here-badge"
      >
        ⭐ Start Here!
      </span>
    </button>
  </nav>
</template>

<style scoped>
.mode-switcher-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  background-color: var(--bg-surface);
  padding: var(--space-1-5);
  border-radius: var(--radius-pill);
  border: 2px solid var(--border-medium);
  box-shadow: var(--shadow-sm);
  width: 100%;
  max-width: 880px;
  box-sizing: border-box;
}

.mode-tab-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  flex: 1 1 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-pill);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  min-height: 48px;
  font-family: var(--font-display);
  transition: transform var(--duration-fast) var(--ease-spring), color var(--duration-fast) ease, background-color var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
  text-decoration: none;
  user-select: none;
}

.start-here-badge {
  position: absolute;
  top: -10px;
  right: -4px;
  background: var(--color-accent, #ff4757);
  color: #ffffff;
  font-family: var(--font-display);
  font-size: 0.65rem;
  font-weight: var(--weight-heavy);
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  box-shadow: 0 2px 8px rgba(255, 71, 87, 0.5);
  animation: pulse-badge 1.8s infinite ease-in-out;
  white-space: nowrap;
  pointer-events: none;
  z-index: 2;
}

@keyframes pulse-badge {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 2px 8px rgba(255, 71, 87, 0.5);
  }
  50% {
    transform: scale(1.08);
    box-shadow: 0 4px 14px rgba(255, 71, 87, 0.85);
  }
}

@media (prefers-reduced-motion: reduce) {
  .start-here-badge {
    animation: none;
  }
}

.mode-tab-button:hover:not(.is-active) {
  color: var(--color-primary);
  background-color: var(--color-primary-subtle);
  transform: translateY(-2px);
}

.mode-tab-button:focus-visible {
  outline: 2px solid var(--border-focus, var(--color-primary));
  outline-offset: 2px;
  box-shadow: var(--focus-ring, 0 0 0 3px hsla(var(--color-primary-h, 255), 85%, 60%, 0.45));
}

.mode-tab-button:active {
  transform: translateY(4px) scale(0.96);
}

.mode-icon {
  font-size: 1.4rem;
  line-height: 1;
  flex-shrink: 0;
}

.mode-text-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: start;
  line-height: 1.15;
}

.mode-title {
  font-size: var(--text-sm);
  font-weight: var(--weight-heavy);
  white-space: nowrap;
}

.mode-badge {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  opacity: 0.88;
  white-space: nowrap;
}

/* Active Mode Styling */
.mode-tab-button.is-active.theme--multiplayer_lan {
  background-color: var(--color-primary);
  color: var(--text-on-primary);
  box-shadow: var(--shadow-btn-primary);
  transform: translateY(-1px);
}

.mode-tab-button.is-active.theme--multiplayer_lan:active {
  transform: translateY(4px) scale(0.96);
}

.mode-tab-button.is-active.theme--solo_ai {
  background-color: var(--mascot-peanut-primary, hsl(28, 92%, 54%));
  color: var(--text-on-primary, #ffffff);
  box-shadow: var(--mascot-peanut-shadow, 0 5px 0 hsl(28, 90%, 36%), 0 8px 18px rgba(245, 130, 32, 0.35));
  transform: translateY(-1px);
}

.mode-tab-button.is-active.theme--solo_ai:active {
  transform: translateY(4px) scale(0.96);
}

.mode-tab-button.is-active.theme--academy {
  background-color: var(--academy-gold, hsl(45, 100%, 51%));
  color: var(--text-on-accent, #1e1b4b);
  box-shadow: var(--shadow-btn-gold, 0 5px 0 hsl(45, 95%, 35%), 0 8px 15px rgba(255, 193, 7, 0.35));
  transform: translateY(-1px);
}

.mode-tab-button.is-active.theme--academy:active {
  transform: translateY(4px) scale(0.96);
}

.mode-tab-button.is-active.theme--puzzle_hub {
  background-color: var(--color-primary, #6c5ce7);
  color: var(--text-on-primary, #ffffff);
  box-shadow: var(--shadow-btn-primary, 0 5px 0 var(--color-primary-bevel), 0 8px 15px rgba(108, 92, 231, 0.35));
  transform: translateY(-1px);
}

.mode-tab-button.is-active.theme--puzzle_hub:active {
  transform: translateY(4px) scale(0.96);
}

@media (max-width: 580px) {
  .mode-switcher-container {
    border-radius: var(--radius-xl);
    padding: var(--space-1);
    gap: 4px;
  }

  .mode-tab-button {
    padding: var(--space-1-5) var(--space-2);
    min-height: 44px;
    gap: 4px;
  }

  .mode-icon {
    font-size: 1.2rem;
  }

  .mode-badge {
    display: none;
  }
}

@media (max-width: 480px) {
  .mode-switcher-container {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-radius: var(--radius-xl);
    padding: var(--space-1-5);
    gap: var(--space-1-5);
  }

  .mode-tab-button {
    min-height: 48px;
    padding: var(--space-2);
    border-radius: var(--radius-lg);
  }

  .mode-badge {
    display: block;
  }
}
</style>
