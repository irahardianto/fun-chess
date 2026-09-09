<script lang="ts">
import type { AppGameMode } from '@fun-chess/shared';

export interface AppPwaBannerProps {
  currentAppMode?: AppGameMode;
  isRoomActive?: boolean;
}
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { OfflineIndicator, PwaInstallBanner, usePwaInstall } from '@/features/pwa';

const props = withDefaults(defineProps<AppPwaBannerProps>(), {
  currentAppMode: 'lobby',
  isRoomActive: false,
});

const emit = defineEmits<{
  install: [];
  snooze: [];
}>();

const { canInstall, isStandalone, isSnoozed, promptInstall, snoozePrompt } = usePwaInstall();

const shouldShowBanner = computed<boolean>(() => {
  return (
    canInstall.value &&
    !isStandalone.value &&
    props.currentAppMode === 'lobby' &&
    !props.isRoomActive &&
    !isSnoozed.value
  );
});

function handleInstall(): void {
  emit('install');
}

function handleDismiss(): void {
  emit('snooze');
}

defineExpose({
  shouldShowBanner,
  canInstall,
  isStandalone,
  isSnoozed,
  handleInstall,
  handleDismiss,
  promptInstall,
  snoozePrompt,
});
</script>

<template>
  <div class="app-pwa-banner-coordinator" data-testid="app-pwa-banner-coordinator">
    <OfflineIndicator />
    <PwaInstallBanner
      v-if="shouldShowBanner"
      force-show
      @install="handleInstall"
      @dismiss="handleDismiss"
    />
  </div>
</template>

<style scoped>
.app-pwa-banner-coordinator {
  display: contents;
}
</style>
