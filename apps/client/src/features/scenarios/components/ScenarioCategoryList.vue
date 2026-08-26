<script setup lang="ts">
import { ref, computed } from 'vue';
import type {
  ChessScenario,
  CurriculumSection,
  ScenarioCategory,
  ScenarioProgressMap,
} from '@fun-chess/shared';
import { CURRICULUM_SECTIONS, ALL_SCENARIOS } from '../data';
import ScenarioCard from './ScenarioCard.vue';

interface Props {
  sections?: readonly CurriculumSection[];
  progressMap?: ScenarioProgressMap;
  totalStars?: number;
  completedCount?: number;
  totalScenarios?: number;
}

const props = withDefaults(defineProps<Props>(), {
  sections: () => CURRICULUM_SECTIONS,
  progressMap: () => ({}),
  totalStars: undefined,
  completedCount: undefined,
  totalScenarios: undefined,
});

const emit = defineEmits<{
  selectScenario: [scenario: ChessScenario];
  selectCategory: [category: ScenarioCategory | 'all'];
}>();

const activeFilter = ref<ScenarioCategory | 'all'>('all');

const totalScenariosCount = computed(() => {
  return props.totalScenarios ?? ALL_SCENARIOS.length;
});

const maxPossibleStars = computed(() => {
  return totalScenariosCount.value * 3;
});

const totalEarnedStars = computed(() => {
  if (props.totalStars !== undefined) return props.totalStars;
  return Object.values(props.progressMap).reduce((acc, item) => acc + item.starsEarned, 0);
});

const totalCompletedLessons = computed(() => {
  if (props.completedCount !== undefined) return props.completedCount;
  return Object.values(props.progressMap).filter((item) => item.starsEarned > 0).length;
});

const filteredSections = computed(() => {
  if (activeFilter.value === 'all') {
    return props.sections;
  }
  return props.sections.filter((s) => s.id === activeFilter.value);
});

function handleFilterChange(cat: ScenarioCategory | 'all') {
  activeFilter.value = cat;
  emit('selectCategory', cat);
}

function handlePlayScenario(scenario: ChessScenario) {
  emit('selectScenario', scenario);
}

function getSectionStats(section: CurriculumSection) {
  const total = section.scenarios.length;
  let completed = 0;
  let stars = 0;

  for (const sc of section.scenarios) {
    const rec = props.progressMap[sc.id];
    if (rec && rec.starsEarned > 0) {
      completed++;
      stars += rec.starsEarned;
    }
  }

  return {
    total,
    completed,
    stars,
    maxStars: total * 3,
  };
}
</script>

<template>
  <div class="academy-browser-container">
    <!-- Academy Header Banner with Overall Star Progress -->
    <header class="academy-hero-banner">
      <div class="academy-hero-content">
        <div class="academy-badge-row">
          <span class="academy-brand-pill">🎓 CHESS ACADEMY</span>
          <div class="academy-star-counter" role="status" aria-label="Total stars earned">
            <span class="star-gold-glyph" aria-hidden="true">⭐</span>
            <span class="star-counter-text">{{ totalEarnedStars }} / {{ maxPossibleStars }} Stars</span>
          </div>
        </div>

        <h1 class="academy-hero-title">Master Chess Step by Step!</h1>
        <p class="academy-hero-subtitle">
          Interactive lessons, sneaky tactics, and famous checkmate traps created for young champions.
        </p>

        <!-- Progress Mini Bar -->
        <div class="academy-progress-bar-wrapper">
          <div class="academy-progress-meta">
            <span>{{ totalCompletedLessons }} of {{ totalScenariosCount }} Lessons Completed</span>
            <span>{{ Math.round((totalEarnedStars / Math.max(1, maxPossibleStars)) * 100) }}% Mastery</span>
          </div>
          <div
            class="progress-track"
            role="progressbar"
            :aria-valuenow="totalEarnedStars"
            aria-valuemin="0"
            :aria-valuemax="maxPossibleStars"
          >
            <div
              class="progress-fill"
              :style="{ width: `${(totalEarnedStars / Math.max(1, maxPossibleStars)) * 100}%` }"
            />
          </div>
        </div>
      </div>
    </header>

    <!-- Category Filter Tabs -->
    <nav class="academy-category-tabs" role="tablist" aria-label="Curriculum categories">
      <button
        type="button"
        role="tab"
        :aria-selected="activeFilter === 'all'"
        class="category-tab-btn"
        :class="{ 'is-active': activeFilter === 'all' }"
        @click="handleFilterChange('all')"
      >
        ✨ All Lessons ({{ totalScenariosCount }})
      </button>

      <button
        v-for="sec in props.sections"
        :key="sec.id"
        type="button"
        role="tab"
        :aria-selected="activeFilter === sec.id"
        class="category-tab-btn"
        :class="{ 'is-active': activeFilter === sec.id }"
        @click="handleFilterChange(sec.id)"
      >
        <span class="tab-icon" aria-hidden="true">{{ sec.icon }}</span>
        <span>{{ sec.title }}</span>
      </button>
    </nav>

    <!-- Curriculum Section List -->
    <main class="academy-sections-list">
      <section
        v-for="section in filteredSections"
        :key="section.id"
        class="curriculum-section-block"
        :aria-labelledby="`section-heading-${section.id}`"
      >
        <!-- Section Header -->
        <div class="section-header-row">
          <div class="section-header-main">
            <span class="section-icon" aria-hidden="true">{{ section.icon }}</span>
            <div class="section-title-group">
              <h2 :id="`section-heading-${section.id}`" class="section-title">
                {{ section.title }}
              </h2>
              <p class="section-subtitle">{{ section.subtitle }}</p>
            </div>
          </div>

          <!-- Section Completion Pill -->
          <div class="section-badge-group">
            <span class="section-completion-pill">
              {{ getSectionStats(section).completed }} / {{ getSectionStats(section).total }} Lessons
            </span>
            <span class="section-stars-pill">
              ⭐ {{ getSectionStats(section).stars }} / {{ getSectionStats(section).maxStars }}
            </span>
          </div>
        </div>

        <!-- Scenario Cards Grid -->
        <div class="scenario-grid">
          <ScenarioCard
            v-for="scenario in section.scenarios"
            :key="scenario.id"
            :scenario="scenario"
            :progress="props.progressMap[scenario.id]"
            @play="handlePlayScenario"
          />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.academy-browser-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--space-4);
  box-sizing: border-box;
}

/* HERO BANNER */
.academy-hero-banner {
  background: linear-gradient(135deg, hsl(255, 85%, 60%) 0%, hsl(265, 90%, 48%) 100%);
  border-radius: var(--radius-2xl);
  padding: var(--space-6) var(--space-8);
  color: #ffffff;
  box-shadow: var(--shadow-lg);
  position: relative;
  overflow: hidden;
}

.academy-hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.academy-badge-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.academy-brand-pill {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-heavy);
  background: rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(8px);
  padding: 4px 14px;
  border-radius: var(--radius-pill);
  letter-spacing: 0.5px;
}

.academy-star-counter {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  background: #ffffff;
  color: hsl(222, 47%, 11%);
  font-family: var(--font-display);
  font-weight: var(--weight-bold);
  font-size: var(--text-base);
  padding: 4px 14px;
  border-radius: var(--radius-pill);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.star-gold-glyph {
  font-size: 1.15rem;
}

.academy-hero-title {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-heavy);
  line-height: var(--leading-tight);
  margin: 0;
  color: #ffffff;
}

.academy-hero-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: rgba(255, 255, 255, 0.9);
  max-width: 680px;
  margin: 0;
  line-height: var(--leading-relaxed);
}

.academy-progress-bar-wrapper {
  margin-top: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.academy-progress-meta {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  color: rgba(255, 255, 255, 0.85);
}

.progress-track {
  width: 100%;
  height: 10px;
  background-color: rgba(0, 0, 0, 0.25);
  border-radius: var(--radius-pill);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffc107 0%, #ffeb3b 100%);
  border-radius: var(--radius-pill);
  transition: width 0.4s var(--ease-spring);
  box-shadow: 0 0 10px rgba(255, 193, 7, 0.6);
}

/* CATEGORY TABS */
.academy-category-tabs {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow-x: auto;
  padding-bottom: var(--space-2);
  scrollbar-width: none;
}

.academy-category-tabs::-webkit-scrollbar {
  display: none;
}

.category-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: var(--weight-bold);
  border: 2px solid var(--border-medium);
  border-radius: var(--radius-pill);
  background-color: var(--bg-surface);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--duration-fast) ease;
}

.category-tab-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  transform: translateY(-2px);
}

.category-tab-btn.is-active {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--text-on-primary);
  box-shadow: var(--shadow-btn-primary);
}

/* CURRICULUM SECTIONS */
.academy-sections-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.curriculum-section-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.section-header-main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.section-icon {
  font-size: 2rem;
  line-height: 1;
}

.section-title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-title {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
  color: var(--text-main);
  margin: 0;
}

.section-subtitle {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin: 0;
}

.section-badge-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.section-completion-pill,
.section-stars-pill {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: var(--weight-bold);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: var(--bg-surface-raised);
  border: 1px solid var(--border-subtle);
  color: var(--text-main);
}

.section-stars-pill {
  background: var(--academy-gold-subtle);
  color: var(--text-main);
  border-color: var(--academy-gold);
}

/* SCENARIO GRID */
.scenario-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: var(--space-4);
}

@media (max-width: 640px) {
  .academy-hero-banner {
    padding: var(--space-5);
  }
  .section-header-row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
