<script setup lang="ts">
import type { AppGameMode } from '@fun-chess/shared';
import AppPwaBanner from './AppPwaBanner.vue';
import { usePwaInstall, useNetworkStatus } from '@/features/pwa';

interface Props {
  currentAppMode?: AppGameMode;
  isRoomActive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  currentAppMode: 'lobby',
  isRoomActive: false,
});

useNetworkStatus();
const { promptInstall, snoozePrompt } = usePwaInstall();
</script>

<template>
  <AppPwaBanner
    :current-app-mode="props.currentAppMode"
    :is-room-active="props.isRoomActive"
    @install="promptInstall"
    @snooze="snoozePrompt"
  />
</template>
