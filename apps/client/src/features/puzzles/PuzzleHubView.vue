<script setup lang="ts">
import type { PuzzleProgressStore, PuzzleTheme } from '@fun-chess/shared';
import PuzzleHubViewComponent from './components/PuzzleHubView.vue';

interface Props {
  customStore?: PuzzleProgressStore;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  launchDrill: [theme?: PuzzleTheme];
  launchLadder: [];
  launchRush: [mode?: 'puzzle_rush' | 'streak_survivor'];
  backToLobby: [];
}>();

function handleLaunchDrills(theme?: PuzzleTheme) {
  emit('launchDrill', theme);
}

function handleLaunchRush(mode?: 'puzzle_rush' | 'streak_survivor') {
  emit('launchRush', mode);
}
</script>

<template>
  <PuzzleHubViewComponent
    :custom-store="props.customStore"
    @launch-drills="handleLaunchDrills"
    @launch-ladder="emit('launchLadder')"
    @launch-rush="handleLaunchRush"
  />
</template>
