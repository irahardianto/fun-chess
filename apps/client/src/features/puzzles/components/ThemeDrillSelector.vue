<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PuzzleTheme, PuzzleThemeCategory, ThemeMasteryProgress } from '@fun-chess/shared';
import { ALL_PUZZLE_THEMES } from '../data/puzzle_themes';
import BaseCard from '../../../components/base/BaseCard.vue';

interface Props {
  themeMasteryMap?: Record<string, ThemeMasteryProgress>;
  themeMastery?: Record<string, ThemeMasteryProgress>;
  selectedTheme?: PuzzleTheme;
}

const props = withDefaults(defineProps<Props>(), {
  themeMasteryMap: undefined,
  themeMastery: undefined,
  selectedTheme: 'fork',
});

const emit = defineEmits<{
  (e: 'select-theme', theme: PuzzleTheme): void;
  (e: 'selectTheme', theme: PuzzleTheme): void;
}>();

const masteryLookup = computed(() => {
  return props.themeMasteryMap ?? props.themeMastery ?? {};
});

const activeCategoryTab = ref<PuzzleThemeCategory | 'all'>('all');

const filteredThemes = computed(() => {
  if (activeCategoryTab.value === 'all') {
    return ALL_PUZZLE_THEMES;
  }
  return ALL_PUZZLE_THEMES.filter((t) => t.category === activeCategoryTab.value);
});

const categories: { id: PuzzleThemeCategory | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'All Motifs', icon: '🌟' },
  { id: 'basic_tactics', label: 'Basic Tactics', icon: '⚡' },
  { id: 'advanced_tactics', label: 'Advanced Motifs', icon: '🔥' },
  { id: 'checkmate_patterns', label: 'Checkmates', icon: '👑' },
  { id: 'endgame_technique', label: 'Endgames', icon: '🏆' },
  { id: 'opening_traps', label: 'Traps', icon: '🪤' },
];

function handleSelect(theme: PuzzleTheme) {
  emit('select-theme', theme);
  emit('selectTheme', theme);
}

function handleCategoryKeyDown(event: KeyboardEvent, currentId: PuzzleThemeCategory | 'all') {
  const currentIndex = categories.findIndex((c) => c.id === currentId);
  let nextIndex = currentIndex;

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    nextIndex = (currentIndex + 1) % categories.length;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    nextIndex = (currentIndex - 1 + categories.length) % categories.length;
  } else if (event.key === 'Home') {
    event.preventDefault();
    nextIndex = 0;
  } else if (event.key === 'End') {
    event.preventDefault();
    nextIndex = categories.length - 1;
  } else {
    return;
  }

  const nextCat = categories[nextIndex];
  if (nextCat) {
    activeCategoryTab.value = nextCat.id;
    const tabEl = document.querySelector<HTMLElement>(`[data-testid="${nextCat.id === 'all' ? 'filter-tab-all' : `filter-tab-${nextCat.id}`}"]`);
    tabEl?.focus();
  }
}
</script>

<template>
  <div class="theme-drill-selector" data-testid="theme-drill-selector">
    <!-- Category Filter Tabs -->
    <div class="category-tabs-bar" role="tablist" aria-label="Tactical Theme Categories">
      <button
        v-for="cat in categories"
        :key="cat.id"
        type="button"
        role="tab"
        :data-testid="cat.id === 'all' ? 'filter-tab-all' : `filter-tab-${cat.id}`"
        :aria-selected="activeCategoryTab === cat.id"
        :tabindex="activeCategoryTab === cat.id ? 0 : -1"
        class="category-tab-btn"
        :class="{ 'is-active': activeCategoryTab === cat.id }"
        @click="activeCategoryTab = cat.id"
        @keydown="handleCategoryKeyDown($event, cat.id)"
      >
        <span class="tab-icon">{{ cat.icon }}</span>
        <span class="tab-label">{{ cat.label }}</span>
      </button>
    </div>

    <!-- Theme Cards Grid -->
    <div class="theme-cards-grid">
      <BaseCard
        v-for="desc in filteredThemes"
        :key="desc.id"
        variant="interactive"
        padding="md"
        class="theme-drill-card"
        :class="{ 'is-selected': props.selectedTheme === desc.id }"
        :data-testid="`theme-card-${desc.id}`"
        role="button"
        tabindex="0"
        :aria-label="`Select ${desc.name} tactical drill`"
        @click="handleSelect(desc.id)"
        @keydown.enter.prevent="handleSelect(desc.id)"
        @keydown.space.prevent="handleSelect(desc.id)"
      >
        <div class="card-top-row">
          <span class="theme-icon-badge">{{ desc.icon }}</span>
          <span class="rating-range-pill">
            ~{{ desc.estimatedRatingRange[0] }}-{{ desc.estimatedRatingRange[1] }} Elo
          </span>
        </div>

        <h3 class="theme-card-title">{{ desc.name }}</h3>
        <p class="theme-card-description">{{ desc.description }}</p>

        <div class="theme-tip-box">
          <span class="tip-icon">💡</span>
          <span class="tip-text">{{ desc.kidFriendlyTip }}</span>
        </div>

        <div class="card-footer-stats">
          <span class="mastery-level-tag" :data-level="masteryLookup[desc.id]?.masteryLevel || 'novice'">
            {{ (masteryLookup[desc.id]?.masteryLevel || 'novice').toUpperCase() }}
          </span>
          <span class="solved-count">
            ⭐ {{ masteryLookup[desc.id]?.starsEarned || 0 }} Stars ({{ masteryLookup[desc.id]?.solved || 0 }} Solved)
          </span>
        </div>
      </BaseCard>
    </div>
  </div>
</template>

<style scoped>
.theme-drill-selector {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
}

.category-tabs-bar {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding-bottom: var(--space-2);
  scrollbar-width: none;
}

.category-tab-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--bg-surface);
  border: 2px solid var(--border-subtle);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--duration-fast) var(--ease-spring);
}

.category-tab-btn:hover {
  border-color: var(--color-primary);
  transform: translateY(-2px);
}

.category-tab-btn.is-active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
  box-shadow: 0 4px 12px rgba(108, 92, 231, 0.35);
}

.theme-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

.theme-drill-card {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border: 2px solid transparent;
  transition: all var(--duration-fast) var(--ease-spring);
}

.theme-drill-card:hover {
  transform: translateY(-4px);
  border-color: var(--color-primary);
}

.theme-drill-card.is-selected {
  border-color: var(--color-primary);
  background: linear-gradient(135deg, var(--bg-surface) 0%, var(--mode-drills-bg, #eef2ff) 100%);
  box-shadow: var(--mode-drills-shadow, 0 6px 20px rgba(79, 70, 229, 0.25));
}

.card-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.theme-icon-badge {
  font-size: 1.8rem;
}

.rating-range-pill {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: rgba(15, 23, 42, 0.08);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}

.theme-card-title {
  font-family: var(--font-display);
  font-size: var(--text-base);
  font-weight: 700;
  margin: 0;
  color: var(--text-main);
}

.theme-card-description {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin: 0;
  line-height: 1.4;
}

.theme-tip-box {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-2);
  background: rgba(255, 193, 7, 0.12);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--hint-banner-text, #451a03);
}

.card-footer-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: var(--space-2);
  border-top: 1px solid var(--border-subtle);
}

.mastery-level-tag {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
}

.solved-count {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
}
</style>
