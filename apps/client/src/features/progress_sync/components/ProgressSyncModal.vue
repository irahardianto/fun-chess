<script setup lang="ts">
import ProgressSyncModal from '@/features/portability/components/ProgressSyncModal.vue';

const modelValue = defineModel<boolean>({ default: false });
</script>

<template>
  <ProgressSyncModal v-model="modelValue" />
</template>
