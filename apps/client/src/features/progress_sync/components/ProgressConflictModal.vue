<script setup lang="ts">
import ProgressConflictModal from '@/features/portability/components/ProgressConflictModal.vue';
import type {
  UnifiedProgressPayload,
  ProgressDiffPreview,
  SyncMergeStrategy,
} from '@fun-chess/shared';

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
</script>

<template>
  <ProgressConflictModal
    :model-value="props.modelValue"
    :current-progress="props.currentProgress"
    :incoming-progress="props.incomingProgress"
    :diff-preview="props.diffPreview"
    :loading="props.loading"
    @update:model-value="emit('update:modelValue', $event)"
    @resolve="emit('resolve', $event)"
    @merge="emit('merge', $event)"
    @replace="emit('replace', $event)"
    @cancel="emit('cancel')"
    @closed="emit('closed')"
  />
</template>
