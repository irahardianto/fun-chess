<script setup lang="ts">
import BaseButton from '../../../../components/base/BaseButton.vue';

interface Props {
  mode: 'puzzle_rush' | 'streak_survivor';
  isGameOverActive: boolean;
  formattedTime: string;
  isTimeUrgent: boolean;
  showTimeBonus: boolean;
  score: number;
  comboMultiplier: number;
  activeStreak: number;
  strikes: number;
  maxStrikes: number;
}

defineProps<Props>();

defineEmits<{
  (e: 'exit'): void;
}>();
</script>

<template>
  <header
    class="rush-hud-bar"
    data-testid="rush-hud-bar"
    :aria-hidden="isGameOverActive"
    :inert="isGameOverActive"
  >
    <!-- Mode Badge -->
    <div class="rush-mode-badge" :data-mode="mode">
      {{ mode === 'puzzle_rush' ? '⚡ 3-Min Rush' : '🛡️ Streak Survivor' }}
    </div>

    <!-- Countdown Timer (Rush mode only) -->
    <div
      v-if="mode === 'puzzle_rush'"
      class="rush-timer-badge"
      :class="{ 'is-urgent': isTimeUrgent }"
      data-testid="rush-timer"
      data-test-section="timer"
    >
      <div data-testid="rush-timer-section" class="timer-inner-wrap">
        <span class="timer-icon" aria-hidden="true">⏳</span>
        <span class="timer-digits">{{ formattedTime }}</span>
      </div>

      <!-- Floating +5s Time Bonus Notification -->
      <transition name="bonus-pop">
        <span
          v-if="showTimeBonus"
          class="time-bonus-notification"
          data-testid="time-bonus-notification"
        >
          +5s ⚡
        </span>
      </transition>
    </div>

    <!-- Solved Score Counter -->
    <div class="rush-score-badge" data-testid="rush-score" data-test-badge="score">
      <div data-testid="rush-score-badge" class="score-inner-wrap">
        <span class="score-label">Solved:</span>
        <span class="score-value">{{ score }}</span>
      </div>
    </div>

    <!-- Combo Multiplier Flame -->
    <div
      class="flame-combo-badge"
      :data-multiplier="comboMultiplier"
      :class="{ 'has-streak': activeStreak >= 2 }"
      data-testid="combo-badge"
    >
      <span class="flame-icon" aria-hidden="true">🔥</span>
      <span class="combo-text">x{{ comboMultiplier }}</span>
    </div>

    <!-- Strike Shields / Hearts -->
    <div class="rush-strikes-container" data-testid="rush-strikes">
      <div data-testid="strikes-life-row" class="strikes-inner-row">
        <span
          v-for="i in maxStrikes"
          :key="i"
          class="strike-icon"
          :class="{ 'is-struck': i <= strikes }"
          :data-struck="i <= strikes"
        >
          {{ i <= strikes ? '❌' : '💚' }}
        </span>
      </div>
    </div>

    <!-- Exit Button -->
    <BaseButton
      variant="ghost"
      size="sm"
      data-testid="rush-exit-btn"
      @click="$emit('exit')"
    >
      ✕ Exit
    </BaseButton>
  </header>
</template>

<style scoped>
.rush-hud-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
  padding: var(--space-2, 8px) var(--space-4, 16px);
  background: var(--bg-surface, #ffffff);
  border: 2px solid var(--border-subtle, #e2e8f0);
  border-radius: var(--radius-pill, 9999px);
  box-shadow: var(--shadow-sm, 0 2px 6px rgba(15, 23, 42, 0.08));
  width: 100%;
  box-sizing: border-box;
  flex-wrap: wrap;
}

.timer-inner-wrap,
.score-inner-wrap,
.strikes-inner-row {
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
}

.rush-mode-badge {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 700;
  color: var(--mode-rush-primary, #ea580c);
}

.rush-timer-badge {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
  font-family: var(--font-mono, monospace);
  font-size: var(--text-lg, 18px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  padding: 4px 12px;
  border-radius: var(--radius-pill, 9999px);
  background: rgba(15, 23, 42, 0.06);
  color: var(--text-main, #0f172a);
}

.timer-digits {
  font-variant-numeric: tabular-nums;
}

.rush-timer-badge.is-urgent {
  background: var(--color-danger, #ef4444);
  color: #ffffff;
  animation: timer-heartbeat 0.6s infinite ease-in-out;
}

.time-bonus-notification {
  position: absolute;
  top: -24px;
  right: 0;
  background: var(--color-success, #22c55e);
  color: var(--text-on-success, #ffffff);
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 9999px);
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.5);
  pointer-events: none;
  animation: float-delta 1.2s ease-out forwards;
}

.rush-score-badge {
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
}

.score-label {
  font-size: var(--text-xs, 12px);
  color: var(--text-muted, #64748b);
}

.score-value {
  font-size: var(--text-xl, 20px);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--color-primary, #6c5ce7);
}

.flame-combo-badge {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 10px;
  border-radius: var(--radius-pill, 9999px);
  background: rgba(255, 179, 0, 0.18);
  color: var(--flame-blaze-start, #ffb300);
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  transition: background var(--duration-normal) ease, color var(--duration-normal) ease, transform var(--duration-normal) var(--ease-spring);
}

.flame-combo-badge.has-streak {
  background: linear-gradient(135deg, #ea580c, #f43f5e);
  color: #ffffff;
  animation: flame-flicker 0.65s infinite ease-in-out;
}

.rush-strikes-container {
  display: flex;
  gap: 4px;
}

.strike-icon {
  font-size: 1.1rem;
  transition: transform var(--duration-fast, 140ms) var(--ease-spring);
}

.strike-icon.is-struck {
  animation: shake-soft 0.3s ease-in-out;
}

.bonus-pop-enter-active {
  animation: float-delta 1.2s ease-out;
}

@keyframes timer-heartbeat {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.08);
  }
}

@keyframes flame-flicker {
  0%, 100% {
    transform: scale(1) rotate(-2deg);
  }
  50% {
    transform: scale(1.1) rotate(2deg);
  }
}

@keyframes shake-soft {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}

@keyframes float-delta {
  0% {
    transform: translateY(0) scale(0.8);
    opacity: 0;
  }
  30% {
    transform: translateY(-8px) scale(1.1);
    opacity: 1;
  }
  100% {
    transform: translateY(-24px) scale(0.9);
    opacity: 0;
  }
}
</style>
