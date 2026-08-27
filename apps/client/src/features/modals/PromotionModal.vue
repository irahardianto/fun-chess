<script setup lang="ts">
import type { PieceColor } from '@fun-chess/shared';
import BaseModal from '../../components/base/BaseModal.vue';
import ChessPieceSvg from '../../components/base/ChessPieceSvg.vue';

interface Props {
  modelValue?: boolean;
  isOpen?: boolean;
  color?: PieceColor;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  isOpen: undefined,
  color: 'w',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  select: [piece: 'q' | 'r' | 'b' | 'n'];
  cancel: [];
}>();

const promotionOptions: Array<{
  type: 'q' | 'r' | 'b' | 'n';
  name: string;
  points: number;
  description: string;
}> = [
  { type: 'q', name: 'Queen', points: 9, description: 'Powerful & Fast' },
  { type: 'n', name: 'Knight', points: 3, description: 'Tricky Jumper' },
  { type: 'r', name: 'Rook', points: 5, description: 'Straight Cannon' },
  { type: 'b', name: 'Bishop', points: 3, description: 'Diagonal Master' },
];

function handleSelect(type: 'q' | 'r' | 'b' | 'n') {
  emit('select', type);
  emit('update:modelValue', false);
}

function handleClose() {
  emit('cancel');
  emit('update:modelValue', false);
}
</script>

<template>
  <BaseModal
    :model-value="props.modelValue || props.isOpen"
    title="Choose Your Promotion! 🌟"
    size="md"
    :close-on-backdrop="false"
    :show-close-button="false"
    @update:model-value="(val) => emit('update:modelValue', val)"
    @close="handleClose"
  >
    <div class="promotion-modal-content">
      <p class="promotion-subtitle">
        Your pawn reached the end of the board! Pick the piece you want it to transform into:
      </p>

      <div class="promotion-grid" role="group" aria-label="Promotion options">
        <button
          v-for="opt in promotionOptions"
          :key="opt.type"
          :data-testid="`promote-${opt.type}`"
          type="button"
          class="promotion-card"
          :aria-label="`Promote to ${opt.name}, ${opt.points} points, ${opt.description}`"
          @click="handleSelect(opt.type)"
        >
          <div class="piece-icon-wrapper">
            <ChessPieceSvg
              :color="props.color"
              :type="opt.type"
              :size="52"
            />
          </div>

          <div class="piece-info">
            <div class="name-points-row">
              <span class="piece-name">{{ opt.name }}</span>
              <span class="points-badge">{{ opt.points }} pts</span>
            </div>
            <span class="piece-desc">{{ opt.description }}</span>
          </div>
        </button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.promotion-modal-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  text-align: center;
}

.promotion-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--text-muted);
}

.promotion-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

@media (max-width: 440px) {
  .promotion-grid {
    grid-template-columns: 1fr;
  }
}

.promotion-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background-color: var(--bg-app);
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  text-align: start;
  color-scheme: only light !important;
  forced-color-adjust: none !important;
  transition: transform var(--duration-fast) var(--ease-spring),
              border-color var(--duration-fast) ease,
              box-shadow var(--duration-fast) ease,
              background-color var(--duration-fast) ease;
}

.promotion-card:hover {
  transform: translateY(-3px) scale(1.04);
  border-color: var(--color-primary);
  background-color: var(--color-primary-subtle);
  box-shadow: var(--shadow-md);
}

.promotion-card:active {
  transform: translateY(4px) scale(0.96);
}

.promotion-card:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
  box-shadow: var(--focus-ring);
}

.piece-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  background-color: var(--bg-surface);
  border-radius: calc(var(--radius-lg) - var(--space-3));
  border: 1px solid var(--border-subtle);
  flex-shrink: 0;
  color-scheme: only light !important;
  forced-color-adjust: none !important;
}

.piece-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
}

.name-points-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.piece-name {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: var(--weight-bold);
  color: var(--text-main);
}

.points-badge {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-heavy);
  background-color: var(--color-accent);
  color: var(--text-on-accent);
  padding: 1px var(--space-2);
  border-radius: var(--radius-pill);
}

.piece-desc {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
}
</style>
