<script setup lang="ts">
import QrScannerView from '@/features/portability/components/QrScannerView.vue';

const props = defineProps<{
  loading?: boolean;
}>();

const emit = defineEmits<{
  code: [code: string];
  file: [file: File];
}>();
</script>

<template>
  <QrScannerView
    :loading="props.loading"
    @code="emit('code', $event)"
    @file="emit('file', $event)"
  />
</template>
