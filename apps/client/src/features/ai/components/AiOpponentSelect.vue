<script setup lang="ts">
import { ref } from 'vue';
import type { PieceColor, MascotId, MascotPersona } from '@fun-chess/shared';
import { ALL_MASCOTS } from '../data/index.js';
import BaseCard from '../../../components/base/BaseCard.vue';
import BaseButton from '../../../components/base/BaseButton.vue';

interface Props {
  selectedMascotId?: MascotId;
  initialPlayerColor?: PieceColor | 'random';
}

const props = withDefaults(defineProps<Props>(), {
  selectedMascotId: 'peanut',
  initialPlayerColor: 'w',
});

const emit = defineEmits<{
  select: [mascotId: MascotId];
  start: [payload: { mascotId: MascotId; playerColor: PieceColor | 'random' }];
}>();

const chosenColor = ref<PieceColor | 'random'>(props.initialPlayerColor);
const hoveredMascotId = ref<MascotId | null>(null);

const colorOptions: Array<{ id: PieceColor | 'random'; label: string; icon: string }> = [
  { id: 'w', label: 'Play White', icon: '⚪' },
  { id: 'random', label: 'Random Side', icon: '🎲' },
  { id: 'b', label: 'Play Black', icon: '⚫' },
];

function handleSelectMascot(mascot: MascotPersona) {
  emit('select', mascot.id);
  emit('start', {
    mascotId: mascot.id,
    playerColor: chosenColor.value,
  });
}

function getMascotColorClass(id: MascotId): string {
  return `mascot-theme--${id}`;
}
</script>

<template>
  <div class="ai-opponent-select" role="region" aria-label="Choose Chess Opponent">
    <!-- Header -->
    <header class="select-header">
      <span class="header-badge">SINGLE-PLAYER CHESS 🤖</span>
      <h1 class="select-title">Choose Your Opponent</h1>
      <p class="select-subtitle">
        Pick a friendly chess buddy! Each mascot has unique personalities and playing styles.
      </p>

      <!-- Player Color Preference Segmented Control -->
      <div class="color-picker-control" role="group" aria-label="Select Piece Color">
        <button
          v-for="opt in colorOptions"
          :key="opt.id"
          type="button"
          class="color-option-btn"
          :class="{ 'is-selected': chosenColor === opt.id }"
          :aria-pressed="chosenColor === opt.id"
          @click="chosenColor = opt.id"
        >
          <span class="color-option-icon" aria-hidden="true">{{ opt.icon }}</span>
          <span class="color-option-label">{{ opt.label }}</span>
        </button>
      </div>
    </header>

    <!-- 2x2 Mascots Grid -->
    <div class="mascots-grid" role="list" aria-label="Mascot opponents list">
      <div
        v-for="mascot in ALL_MASCOTS"
        :key="mascot.id"
        :data-testid="`mascot-card-${mascot.id}`"
        class="mascot-card-wrapper"
        :class="[getMascotColorClass(mascot.id), { 'is-active': props.selectedMascotId === mascot.id }]"
        role="listitem"
        @mouseenter="hoveredMascotId = mascot.id"
        @mouseleave="hoveredMascotId = null"
      >
        <BaseCard
          variant="interactive"
          padding="lg"
          class="mascot-card"
        >
          <!-- Mascot Avatar Medallion -->
          <div class="avatar-medallion" :style="{ borderColor: mascot.themeColor }">
            <span class="avatar-emoji" aria-hidden="true">{{ mascot.avatar }}</span>
          </div>

          <!-- Persona Info -->
          <div class="persona-details">
            <div class="name-elo-row">
              <h2 class="persona-name">{{ mascot.name }}</h2>
              <span class="elo-pill">~{{ mascot.eloEstimate }} ELO</span>
            </div>

            <span class="persona-title">{{ mascot.title }}</span>
            <p class="persona-desc">{{ mascot.description }}</p>
          </div>

          <!-- Challenge Button -->
          <div class="card-action">
            <BaseButton
              variant="primary"
              size="md"
              full-width
              :data-testid="`challenge-btn-${mascot.id}`"
              class="challenge-btn"
              :style="{ backgroundColor: mascot.themeColor, borderColor: mascot.themeColor }"
              @click="handleSelectMascot(mascot)"
            >
              <template #icon-left>
                <span>{{ mascot.avatar }}</span>
              </template>
              Challenge {{ mascot.name.split(' ')[0] }}
            </BaseButton>
          </div>
        </BaseCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-opponent-select {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  padding: 0;
  gap: var(--space-6);
  box-sizing: border-box;
}

.select-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-2);
}

.header-badge {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-heavy);
  color: var(--color-primary);
  background-color: var(--color-primary-subtle);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  letter-spacing: var(--tracking-wide);
}

.select-title {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-heavy);
  color: var(--text-main);
  line-height: var(--leading-tight);
}

.select-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--text-muted);
  max-width: 540px;
}

/* Color Picker Control */
.color-picker-control {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  max-width: 100%;
  background-color: var(--bg-surface);
  padding: 4px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-medium);
  box-shadow: var(--shadow-xs);
  margin-top: var(--space-2);
}

.color-option-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-spring);
}

.color-option-btn:hover {
  color: var(--text-main);
  background-color: var(--color-primary-subtle);
}

.color-option-btn.is-selected {
  background-color: var(--color-primary);
  color: var(--text-on-primary);
  box-shadow: var(--shadow-sm);
  transform: scale(1.02);
}

.color-option-icon {
  font-size: 1.1rem;
  line-height: 1;
}

/* 2x2 Mascots Grid */
.mascots-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
  width: 100%;
}

@media (max-width: 640px) {
  .mascots-grid {
    grid-template-columns: 1fr;
  }
}

.mascot-card-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.mascot-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3);
  height: 100%;
  justify-content: space-between;
  border-radius: var(--radius-xl);
  border: 2px solid var(--border-subtle);
  background-color: var(--bg-surface);
  transition: transform var(--duration-fast) var(--ease-spring),
              box-shadow var(--duration-fast) ease,
              border-color var(--duration-fast) ease;
}

.mascot-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--color-primary);
}

/* Avatar Medallion */
.avatar-medallion {
  width: 76px;
  height: 76px;
  border-radius: var(--radius-pill);
  background-color: var(--bg-app);
  border: 3.5px solid var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-fast) var(--ease-spring);
}

.avatar-emoji {
  font-size: 2.8rem;
  line-height: 1;
  user-select: none;
}

.mascot-card:hover .avatar-medallion {
  transform: scale(1.08) rotate(4deg);
}

.persona-details {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  flex: 1 1 auto;
}

.name-elo-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.persona-name {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: var(--weight-heavy);
  color: var(--text-main);
  line-height: var(--leading-tight);
}

.elo-pill {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: var(--weight-heavy);
  background-color: var(--color-primary-subtle);
  color: var(--color-primary);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}

.persona-title {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  color: var(--color-accent-text, #92400e);
}

.persona-desc {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-muted);
  line-height: var(--leading-snug);
  margin-top: var(--space-1);
}

.card-action {
  width: 100%;
  margin-top: var(--space-2);
}

.challenge-btn {
  font-family: var(--font-display);
  font-weight: var(--weight-heavy);
}
</style>
