<script setup lang="ts">
import { computed } from 'vue';
import type {
  UnifiedProgressPayload,
  ProgressDiffPreview,
  SyncMergeStrategy,
} from '@fun-chess/shared';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseButton from '@/components/base/BaseButton.vue';

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    currentProgress?: UnifiedProgressPayload | null;
    incomingProgress?: UnifiedProgressPayload | null;
    diffPreview?: ProgressDiffPreview | null;
    loading?: boolean;
  }>(),
  {
    modelValue: false,
    currentProgress: null,
    incomingProgress: null,
    diffPreview: null,
    loading: false,
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  resolve: [strategy: SyncMergeStrategy];
  merge: [strategy?: SyncMergeStrategy];
  replace: [strategy?: SyncMergeStrategy];
  cancel: [];
  closed: [];
}>();

const localStars = computed(() => {
  if (!props.currentProgress?.scenarios) return 0;
  return Object.values(props.currentProgress.scenarios).reduce(
    (sum, sc) => sum + (sc.starsEarned || 0),
    0
  );
});

const incomingStars = computed(() => {
  if (!props.incomingProgress?.scenarios) return 0;
  return Object.values(props.incomingProgress.scenarios).reduce(
    (sum, sc) => sum + (sc.starsEarned || 0),
    0
  );
});

const localRating = computed(() => {
  return props.currentProgress?.puzzles?.ratingProfile?.rating ?? 800;
});

const incomingRating = computed(() => {
  return props.incomingProgress?.puzzles?.ratingProfile?.rating ?? 800;
});

const localSolved = computed(() => {
  return Object.keys(props.currentProgress?.puzzles?.solvedPuzzles || {}).length;
});

const incomingSolved = computed(() => {
  return Object.keys(props.incomingProgress?.puzzles?.solvedPuzzles || {}).length;
});

const localStreak = computed(() => {
  return props.currentProgress?.puzzles?.ratingProfile?.bestStreak ?? 0;
});

const incomingStreak = computed(() => {
  return props.incomingProgress?.puzzles?.ratingProfile?.bestStreak ?? 0;
});

function handleAction(strategy: SyncMergeStrategy) {
  emit('resolve', strategy);
  if (strategy === 'smart_merge') {
    emit('merge', strategy);
  } else if (strategy === 'replace_local') {
    emit('replace', strategy);
  } else if (strategy === 'keep_local') {
    emit('cancel');
  }
  emit('update:modelValue', false);
}

function handleClose() {
  emit('update:modelValue', false);
  emit('closed');
}
</script>

<template>
  <BaseModal
    :model-value="props.modelValue"
    size="md"
    aria-label="Progress Conflict Resolution"
    @update:model-value="emit('update:modelValue', $event)"
    @close="handleClose"
  >
    <template #header>
      <div class="conflict-modal-header">
        <h2 class="conflict-modal-title">Merge Progress or Overwrite? ⚠️</h2>
        <p class="conflict-modal-subtitle">
          Scanned progress has different stats than this device. Choose how to merge:
        </p>
      </div>
    </template>

    <div class="conflict-modal-content">
      <!-- Side-by-Side Comparison Matrix -->
      <div class="conflict-grid">
        <!-- Current Device Card -->
        <div class="conflict-card">
          <div class="conflict-card-header">
            <span>Current Device 📱</span>
          </div>

          <div class="conflict-stats-list">
            <div
              class="stat-diff-row"
              :class="{ 'is-winner': localStars > incomingStars }"
            >
              <span>⭐ {{ localStars }} Stars</span>
              <span v-if="localStars > incomingStars" class="stat-winner-badge">Best</span>
            </div>

            <div
              class="stat-diff-row"
              :class="{ 'is-winner': localRating > incomingRating }"
            >
              <span>🎯 {{ localRating }} Elo</span>
              <span v-if="localRating > incomingRating" class="stat-winner-badge">Best</span>
            </div>

            <div
              class="stat-diff-row"
              :class="{ 'is-winner': localSolved > incomingSolved }"
            >
              <span>🧩 {{ localSolved }} Solved</span>
              <span v-if="localSolved > incomingSolved" class="stat-winner-badge">Best</span>
            </div>

            <div
              class="stat-diff-row"
              :class="{ 'is-winner': localStreak > incomingStreak }"
            >
              <span>🔥 {{ localStreak }} Streak</span>
              <span v-if="localStreak > incomingStreak" class="stat-winner-badge">Best</span>
            </div>
          </div>
        </div>

        <!-- Imported Save Card -->
        <div class="conflict-card is-imported">
          <div class="conflict-card-header">
            <span>Imported Save 📥</span>
          </div>

          <div class="conflict-stats-list">
            <div
              class="stat-diff-row"
              :class="{ 'is-winner': incomingStars > localStars }"
            >
              <span>⭐ {{ incomingStars }} Stars</span>
              <span v-if="incomingStars > localStars" class="stat-winner-badge">Best</span>
            </div>

            <div
              class="stat-diff-row"
              :class="{ 'is-winner': incomingRating > localRating }"
            >
              <span>🎯 {{ incomingRating }} Elo</span>
              <span v-if="incomingRating > localRating" class="stat-winner-badge">Best</span>
            </div>

            <div
              class="stat-diff-row"
              :class="{ 'is-winner': incomingSolved > localSolved }"
            >
              <span>🧩 {{ incomingSolved }} Solved</span>
              <span v-if="incomingSolved > localSolved" class="stat-winner-badge">Best</span>
            </div>

            <div
              class="stat-diff-row"
              :class="{ 'is-winner': incomingStreak > localStreak }"
            >
              <span>🔥 {{ incomingStreak }} Streak</span>
              <span v-if="incomingStreak > localStreak" class="stat-winner-badge">Best</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Smart Merge Explanation Box -->
      <div class="merge-info-callout">
        <span class="callout-icon" aria-hidden="true">✨</span>
        <div class="callout-text">
          <strong>Smart merge:</strong>
          Smart merge combines both saves safely without data loss. It keeps your highest Elo rating, all solved puzzles + lessons, and maximum star records.
        </div>
      </div>

      <!-- Action Hierarchy Buttons -->
      <div class="conflict-actions-stack">
        <BaseButton
          variant="success"
          size="md"
          :full-width="true"
          :loading="props.loading"
          @click="handleAction('smart_merge')"
        >
          <template #icon>🌟</template>
          Smart Merge (Recommended)
        </BaseButton>

        <div class="secondary-actions-row">
          <div class="replace-action-col">
            <BaseButton
              variant="danger"
              size="sm"
              :loading="props.loading"
              @click="handleAction('replace_local')"
            >
              <template #icon>⚠️</template>
              Replace Device Progress
            </BaseButton>
            <span class="action-subtext">Replaces all stars and puzzle ratings on this device with incoming save</span>
          </div>

          <BaseButton
            variant="ghost"
            size="sm"
            @click="handleAction('keep_local')"
          >
            Cancel / Keep Current
          </BaseButton>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.conflict-modal-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.conflict-modal-title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  line-height: 1.2;
}

.conflict-modal-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.conflict-modal-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.conflict-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3, 12px);
  width: 100%;
}

@media (max-width: 520px) {
  .conflict-grid {
    grid-template-columns: 1fr;
  }
}

.conflict-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  padding: var(--space-3, 12px);
  background-color: var(--bg-surface-raised);
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-xl, 22px);
}

.conflict-card.is-imported {
  border-color: var(--color-primary);
  background-color: var(--color-primary-subtle);
}

.conflict-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  padding-bottom: var(--space-1, 4px);
  border-bottom: 1px solid var(--border-subtle);
}

.conflict-stats-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-diff-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: var(--radius-sm, 8px);
  background-color: var(--bg-surface);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-main);
}

.stat-diff-row.is-winner {
  background-color: var(--stat-better-bg, rgba(16, 185, 129, 0.18));
  border: 1px solid var(--stat-better-border, #10b981);
  color: var(--stat-better-text, #166534);
  font-weight: var(--weight-bold, 700);
}

.stat-winner-badge {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold, 700);
  background-color: var(--stat-better-badge, #047857);
  color: var(--text-on-primary, #ffffff);
  padding: 2px 6px;
  border-radius: var(--radius-pill, 9999px);
}

.merge-info-callout {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2-5, 10px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  background-color: var(--stat-better-bg, rgba(16, 185, 129, 0.12));
  border: 1.5px solid var(--stat-better-border, #10b981);
  border-radius: var(--radius-lg, 16px);
  color: var(--text-main);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: 1.4;
}

.callout-icon {
  font-size: 1.3rem;
  flex-shrink: 0;
}

.conflict-actions-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5, 10px);
  width: 100%;
  margin-top: var(--space-1, 4px);
}

.secondary-actions-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2, 8px);
}

@media (max-width: 480px) {
  .secondary-actions-row {
    grid-template-columns: 1fr;
  }
}

.replace-action-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.action-subtext {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.2;
  text-align: center;
}
</style>
