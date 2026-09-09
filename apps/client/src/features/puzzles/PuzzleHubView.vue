<script setup lang="ts">
import type { PuzzleProgressStore, PuzzleTheme } from '@fun-chess/shared';
import PuzzleHubViewComponent from './components/PuzzleHubView.vue';

interface Props {
  customStore?: PuzzleProgressStore;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  launchDrills: [theme?: PuzzleTheme];
  'launch-drills': [theme?: PuzzleTheme];
  launchDrill: [theme?: PuzzleTheme];
  launchLadder: [];
  'launch-ladder': [];
  launchRush: [mode?: 'puzzle_rush' | 'streak_survivor'];
  'launch-rush': [mode?: 'puzzle_rush' | 'streak_survivor'];
  backToLobby: [];
  'back-to-lobby': [];
}>();

function handleLaunchDrills(theme?: PuzzleTheme) {
  emit('launchDrills', theme);
  emit('launch-drills', theme);
  emit('launchDrill', theme);
}

function handleLaunchRush(mode?: 'puzzle_rush' | 'streak_survivor') {
  emit('launchRush', mode);
  emit('launch-rush', mode);
}
</script>

<template>
  <PuzzleHubViewComponent
    :custom-store="props.customStore"
    @launch-drills="handleLaunchDrills"
    @launch-ladder="emit('launchLadder'); emit('launch-ladder');"
    @launch-rush="handleLaunchRush"
    @back-to-lobby="emit('backToLobby'); emit('back-to-lobby');"
  />
</template>
