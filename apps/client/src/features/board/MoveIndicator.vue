<script setup lang="ts">
defineProps<{
  isCapture?: boolean;
}>();
</script>

<template>
  <div
    :class="[
      isCapture ? 'capture-target-ring' : 'valid-move-dot',
    ]"
    data-testid="move-indicator"
    :data-type="isCapture ? 'capture' : 'valid'"
  />
</template>

<style scoped>
.valid-move-dot {
  width: 32%;
  height: 32%;
  border-radius: var(--radius-pill);
  background-color: var(--highlight-valid-dot);
  box-shadow: var(--glow-valid-move);
  animation: pulse-valid-dot var(--duration-pulse) infinite ease-in-out;
  pointer-events: none;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.capture-target-ring {
  position: absolute;
  inset: 6%;
  border-radius: var(--radius-md);
  pointer-events: none;
  animation: pulse-capture-ring 1.1s infinite ease-in-out;
  border: 4px solid var(--highlight-capture-ring);
  box-shadow: 0 0 10px var(--highlight-capture-ring);
}
</style>
