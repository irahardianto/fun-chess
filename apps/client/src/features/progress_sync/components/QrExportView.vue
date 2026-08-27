<script setup lang="ts">
import QrExportView from '@/features/portability/components/QrExportView.vue';
import type { UnifiedProgressPayload } from '@fun-chess/shared';

const props = defineProps<{
  payload: UnifiedProgressPayload | null;
  qrString: string;
  loading?: boolean;
}>();

const emit = defineEmits<{
  downloadJson: [];
}>();
</script>

<template>
  <QrExportView
    :payload="props.payload"
    :qr-string="props.qrString"
    :loading="props.loading"
    @download-json="emit('downloadJson')"
  />
</template>
