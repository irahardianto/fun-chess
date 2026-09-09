<script setup lang="ts">
import { ref, computed } from "vue";
import type {
  PuzzleTheme,
  PuzzleThemeCategory,
  PuzzleThemeDescriptor,
  ThemeMasteryProgress,
} from "@fun-chess/shared";
import {
  ALL_PUZZLE_THEMES,
  getThemeVisualClues,
  getThemeConceptDefinition,
} from "../data/puzzle_themes";
import BaseCard from "../../../components/base/BaseCard.vue";
import BaseModal from "../../../components/base/BaseModal.vue";
import BaseButton from "../../../components/base/BaseButton.vue";

interface Props {
  themeMasteryMap?: Record<string, ThemeMasteryProgress>;
  themeMastery?: Record<string, ThemeMasteryProgress>;
  selectedTheme?: PuzzleTheme;
}

const props = withDefaults(defineProps<Props>(), {
  themeMasteryMap: undefined,
  themeMastery: undefined,
  selectedTheme: "fork",
});

const emit = defineEmits<{
  (e: "select-theme", theme: PuzzleTheme): void;
  (e: "selectTheme", theme: PuzzleTheme): void;
}>();

const masteryLookup = computed(() => {
  return props.themeMasteryMap ?? props.themeMastery ?? {};
});

const activeCategoryTab = ref<PuzzleThemeCategory | "all">("all");
const isPrimerOpen = ref<boolean>(false);
const activePrimerTheme = ref<PuzzleThemeDescriptor | null>(null);

const filteredThemes = computed(() => {
  if (activeCategoryTab.value === "all") {
    return ALL_PUZZLE_THEMES;
  }
  return ALL_PUZZLE_THEMES.filter(
    (t) => t.category === activeCategoryTab.value,
  );
});

const categories: {
  id: PuzzleThemeCategory | "all";
  label: string;
  icon: string;
}[] = [
  { id: "all", label: "All Motifs", icon: "🌟" },
  { id: "basic_tactics", label: "Basic Tactics", icon: "⚡" },
  { id: "advanced_tactics", label: "Advanced Motifs", icon: "🔥" },
  { id: "checkmate_patterns", label: "Checkmates", icon: "👑" },
  { id: "endgame_technique", label: "Endgames", icon: "🏆" },
  { id: "opening_traps", label: "Traps", icon: "🪤" },
];

function formatMasteryLevel(level?: string): string {
  if (!level) return "Novice";
  return level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
}

function getMasteryForTheme(
  themeId: PuzzleTheme,
): ThemeMasteryProgress | undefined {
  const map = masteryLookup.value;
  if (map[themeId]) return map[themeId];

  // Check aliases
  const aliases: Partial<Record<PuzzleTheme, readonly string[]>> = {
    smothered_mate: ["smothered"],
    smothered: ["smothered_mate"],
    anastasia_mate: ["anastasia_hook"],
    hook_mate: ["anastasia_hook"],
    anastasia_hook: ["anastasia_mate", "hook_mate"],
    pawn_endgame: ["endgame_conversion"],
    rook_endgame: ["endgame_conversion"],
    endgame_conversion: ["pawn_endgame", "rook_endgame"],
    decoy: ["deflection"],
    deflection: ["decoy"],
  };
  const list = aliases[themeId] ?? [];
  for (const alt of list) {
    if (map[alt]) return map[alt];
  }
  return undefined;
}

function handleSelect(theme: PuzzleTheme) {
  emit("select-theme", theme);
  emit("selectTheme", theme);
}

function openPrimer(desc: PuzzleThemeDescriptor) {
  activePrimerTheme.value = desc;
  isPrimerOpen.value = true;
}

function startDrillFromPrimer() {
  if (activePrimerTheme.value) {
    handleSelect(activePrimerTheme.value.id);
    isPrimerOpen.value = false;
  }
}

function handleCategoryKeyDown(
  event: KeyboardEvent,
  currentId: PuzzleThemeCategory | "all",
) {
  const currentIndex = categories.findIndex((c) => c.id === currentId);
  let nextIndex: number;

  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    nextIndex = (currentIndex + 1) % categories.length;
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    nextIndex = (currentIndex - 1 + categories.length) % categories.length;
  } else if (event.key === "Home") {
    event.preventDefault();
    nextIndex = 0;
  } else if (event.key === "End") {
    event.preventDefault();
    nextIndex = categories.length - 1;
  } else {
    return;
  }

  const nextCat = categories[nextIndex];
  if (nextCat) {
    activeCategoryTab.value = nextCat.id;
    const tabEl = document.querySelector<HTMLElement>(
      `[data-testid="${nextCat.id === "all" ? "filter-tab-all" : `filter-tab-${nextCat.id}`}"]`,
    );
    tabEl?.focus();
  }
}
</script>

<template>
  <div class="theme-drill-selector" data-testid="theme-drill-selector">
    <!-- Category Filter Tabs -->
    <div
      class="category-tabs-bar"
      role="tablist"
      aria-label="Tactical Theme Categories"
    >
      <button
        v-for="cat in categories"
        :key="cat.id"
        type="button"
        role="tab"
        :data-testid="
          cat.id === 'all' ? 'filter-tab-all' : `filter-tab-${cat.id}`
        "
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
        variant="default"
        padding="md"
        class="theme-drill-card"
        :class="{ 'is-selected': props.selectedTheme === desc.id }"
        :data-testid="`theme-card-${desc.id}`"
        role="region"
        :aria-label="`${desc.name} tactical drill`"
      >
        <div class="card-top-row">
          <span class="theme-icon-badge">{{ desc.icon }}</span>
          <div class="top-row-actions">
            <button
              type="button"
              class="primer-info-btn"
              :data-testid="`theme-primer-btn-${desc.id}`"
              aria-label="View Concept Primer"
              @click="openPrimer(desc)"
            >
              📖 Primer
            </button>
            <span class="rating-range-pill">
              ~{{ desc.estimatedRatingRange[0] }}-{{
                desc.estimatedRatingRange[1]
              }}
            </span>
          </div>
        </div>

        <h3 class="theme-card-title">{{ desc.name }}</h3>
        <p class="theme-card-description">{{ desc.description }}</p>

        <div class="theme-tip-box">
          <span class="tip-icon">💡</span>
          <span class="tip-text">{{ desc.kidFriendlyTip }}</span>
        </div>

        <div class="card-footer-stats">
          <span
            class="mastery-level-tag"
            :data-level="getMasteryForTheme(desc.id)?.masteryLevel || 'novice'"
          >
            {{ formatMasteryLevel(getMasteryForTheme(desc.id)?.masteryLevel) }}
          </span>
          <span class="solved-count">
            ⭐ {{ getMasteryForTheme(desc.id)?.starsEarned || 0 }} Stars ({{
              getMasteryForTheme(desc.id)?.solved || 0
            }}
            Solved)
          </span>
        </div>

        <div class="card-actions">
          <BaseButton
            variant="primary"
            size="sm"
            full-width
            class="practice-drill-btn"
            :data-testid="`practice-drill-btn-${desc.id}`"
            @click="handleSelect(desc.id)"
          >
            <template #icon-left>🎯</template>
            Practice Drill
          </BaseButton>
        </div>
      </BaseCard>
    </div>

    <!-- Theme Concept Primer Modal -->
    <BaseModal
      v-model="isPrimerOpen"
      size="md"
      :title="`${activePrimerTheme?.icon || '💡'} ${activePrimerTheme?.name || 'Theme'} Primer`"
      data-testid="theme-primer-modal"
    >
      <div v-if="activePrimerTheme" class="theme-primer-body">
        <div class="primer-header-row">
          <span class="primer-big-icon">{{ activePrimerTheme.icon }}</span>
          <div class="primer-header-meta">
            <h3 class="primer-motif-name">{{ activePrimerTheme.name }}</h3>
            <span class="primer-rating-tag">
              Rating Level: ~{{ activePrimerTheme.estimatedRatingRange[0] }}-{{
                activePrimerTheme.estimatedRatingRange[1]
              }}
              Elo
            </span>
          </div>
        </div>

        <!-- Section 1: Tactical Concept & Definition -->
        <div
          class="primer-section concept-box"
          data-testid="primer-concept-section"
        >
          <h4 class="primer-section-title">
            <span>🎯</span> What is this Tactical Motif?
          </h4>
          <p class="primer-section-text" data-testid="primer-concept-text">
            {{ getThemeConceptDefinition(activePrimerTheme.id) }}
          </p>
          <p class="primer-section-subtext">
            {{ activePrimerTheme.description }}
          </p>
        </div>

        <!-- Section 2: Visual Clues -->
        <div
          class="primer-section clues-box"
          data-testid="primer-clues-section"
        >
          <h4 class="primer-section-title">
            <span>🔍</span> Visual Clues to Spot It
          </h4>
          <p class="primer-section-text" data-testid="primer-clues-text">
            {{ getThemeVisualClues(activePrimerTheme.id) }}
          </p>
        </div>

        <!-- Section 3: Coach / Kid Friendly Tip -->
        <div class="primer-section tip-box" data-testid="primer-tip-section">
          <h4 class="primer-section-title">
            <span>🐿️</span> Sparky's Rule of Thumb
          </h4>
          <p class="primer-section-text" data-testid="primer-tip-text">
            "{{ activePrimerTheme.kidFriendlyTip }}"
          </p>
        </div>
      </div>

      <template #footer>
        <div class="primer-footer-actions">
          <BaseButton
            variant="ghost"
            size="md"
            data-testid="close-primer-btn"
            @click="isPrimerOpen = false"
          >
            Close
          </BaseButton>
          <BaseButton
            variant="primary"
            size="md"
            data-testid="start-drill-btn"
            @click="startDrillFromPrimer"
          >
            <template #icon-left>🚀</template>
            Start Drill
          </BaseButton>
        </div>
      </template>
    </BaseModal>
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
  transition:
    border-color var(--duration-fast) ease,
    transform var(--duration-fast) var(--ease-spring),
    background-color var(--duration-fast) ease,
    color var(--duration-fast) ease,
    box-shadow var(--duration-fast) ease;
}

.category-tab-btn:hover {
  border-color: var(--color-primary);
  transform: translateY(-2px);
}

.category-tab-btn.is-active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--text-on-primary, #ffffff);
  box-shadow: 0 4px 12px rgba(108, 92, 231, 0.35);
}

.theme-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

.theme-drill-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border: 2px solid transparent;
  transition:
    transform var(--duration-fast) var(--ease-spring),
    border-color var(--duration-fast) ease,
    box-shadow var(--duration-fast) ease;
}

.theme-drill-card:hover {
  transform: translateY(-4px);
  border-color: var(--color-primary);
}

.theme-drill-card.is-selected {
  border-color: var(--color-primary);
  background: linear-gradient(
    135deg,
    var(--bg-surface) 0%,
    var(--mode-drills-bg, #eef2ff) 100%
  );
  box-shadow: var(--mode-drills-shadow, 0 6px 20px rgba(79, 70, 229, 0.25));
}

.card-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.top-row-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.primer-info-btn {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 700;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  border: 1px solid transparent;
  cursor: pointer;
  transition: transform var(--duration-fast) ease,
              background-color var(--duration-fast) ease,
              color var(--duration-fast) ease;
}

.primer-info-btn:hover {
  background: var(--color-primary);
  color: var(--text-on-primary);
  transform: scale(1.05);
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

.card-actions {
  margin-top: var(--space-2);
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

/* Theme Concept Primer Modal Styles */
.theme-primer-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  text-align: start;
}

.primer-header-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border-subtle);
}

.primer-big-icon {
  font-size: 2.4rem;
  line-height: 1;
}

.primer-header-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.primer-motif-name {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 800;
  color: var(--text-main);
  margin: 0;
}

.primer-rating-tag {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.primer-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
  padding: var(--space-3);
  border-radius: var(--radius-lg);
  border: 1.5px solid transparent;
}

.primer-section.concept-box {
  background: var(--bg-surface-raised, #f8fafc);
  border-color: var(--border-subtle, #e2e8f0);
}

.primer-section.clues-box {
  background: rgba(34, 197, 94, 0.08);
  border-color: rgba(34, 197, 94, 0.35);
}

.primer-section.tip-box {
  background: rgba(255, 193, 7, 0.12);
  border-color: rgba(255, 193, 7, 0.4);
}

.primer-section-title {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 800;
  color: var(--text-main);
  margin: 0;
}

.primer-section-text {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-main);
  line-height: var(--leading-normal, 1.5);
  margin: 0;
}

.primer-section-subtext {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: var(--leading-normal, 1.4);
  margin: 0;
}

.primer-footer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  width: 100%;
}
</style>
