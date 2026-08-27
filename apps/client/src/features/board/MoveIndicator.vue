<script setup lang="ts">
defineProps<{
  isCapture?: boolean;
}>();
</script>

<template>
  <div
    class="move-indicator-ring"
    :class="[
      isCapture ? 'capture-target-ring' : 'valid-move-ring',
    ]"
    data-testid="move-indicator"
    :data-type="isCapture ? 'capture' : 'valid'"
  />
</template>

<style scoped>
.move-indicator-ring,
.valid-move-ring,
.valid-move-dot,
.capture-target-ring {
  position: absolute;
  inset: 6%;
  border-radius: var(--radius-md);
  pointer-events: none;
  animation: pulse-capture-ring 1.1s infinite ease-in-out;
  border: 4px solid var(--highlight-capture-ring);
  box-shadow: 0 0 10px var(--highlight-capture-ring);
  box-sizing: border-box;
}
</style>
