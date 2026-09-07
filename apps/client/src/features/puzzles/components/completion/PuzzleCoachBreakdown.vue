<script setup lang="ts">
interface Props {
  coachExplanation: string;
  mascotTakeaway: string;
}

defineProps<Props>();
</script>

<template>
  <div class="coach-breakdown-card" data-testid="coach-breakdown-card">
    <h4 class="breakdown-card-title">
      <span>🎓</span>
      Coach's Tactical Breakdown
    </h4>
    <p class="breakdown-explanation-text" data-testid="coach-explanation-text">
      {{ coachExplanation }}
    </p>

    <!-- Mascot Persona Coaching Bubble -->
    <div class="mascot-coaching-box" data-testid="mascot-coaching-box">
      <div class="mascot-avatar-circle" aria-hidden="true">
        🐿️
      </div>
      <div class="mascot-quote-content">
        <span class="mascot-speaker-name">Sparky's Takeaway Rule:</span>
        <p class="mascot-quote-text" data-testid="mascot-takeaway-text">
          "{{ mascotTakeaway }}"
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.coach-breakdown-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2-5, 10px);
  background: var(--bg-surface-raised, #f8fafc);
  border: 2px solid var(--border-medium, #cbd5e1);
  border-radius: var(--radius-xl, 22px);
  padding: var(--space-4, 16px);
  width: 100%;
  text-align: start;
  box-sizing: border-box;
}

.breakdown-card-title {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-section-h4, 16px);
  font-weight: 800;
  color: var(--color-primary, #6c5ce7);
  margin: 0;
}

.breakdown-explanation-text {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-base, 15px);
  font-weight: 500;
  color: var(--text-main, #0f172a);
  line-height: var(--leading-relaxed, 1.6);
  margin: 0;
}

/* Mascot Coaching Box */
.mascot-coaching-box {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3, 12px);
  background: var(--mascot-sparky-bg, hsl(20, 95%, 94%));
  border: 2px solid var(--mascot-sparky-border, hsl(18, 85%, 75%));
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-2-5, 10px) var(--space-3-5, 14px);
  margin-top: var(--space-1, 4px);
}

[data-theme='dark'] .mascot-coaching-box {
  background: var(--mascot-sparky-bg, hsl(18, 40%, 18%));
  border-color: var(--mascot-sparky-border, hsl(18, 50%, 35%));
}

.mascot-avatar-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-pill, 9999px);
  background: #ffffff;
  border: 2px solid var(--mascot-sparky-primary, #ea580c);
  font-size: 1.4rem;
  flex-shrink: 0;
}

.mascot-quote-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mascot-speaker-name {
  font-family: var(--font-display, 'Fredoka', cursive, sans-serif);
  font-size: var(--text-xs, 12px);
  font-weight: 800;
  color: var(--mascot-sparky-primary, #ea580c);
}

.mascot-quote-text {
  font-family: var(--font-body, 'Nunito', sans-serif);
  font-size: var(--text-sm, 14px);
  font-weight: 600;
  color: var(--mascot-sparky-text, #431407);
  line-height: var(--leading-normal, 1.5);
  margin: 0;
}

[data-theme='dark'] .mascot-quote-text {
  color: var(--mascot-sparky-text, hsl(18, 85%, 90%));
}
</style>
