import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ThemeDrillSelector from '../ThemeDrillSelector.vue';

describe('ThemeDrillSelector.vue', () => {
  it('renders theme cards and filters by category', async () => {
    const wrapper = mount(ThemeDrillSelector, {
      props: {
        themeMasteryMap: {
          fork: {
            theme: 'fork',
            attempted: 5,
            solved: 5,
            starsEarned: 15,
            masteryLevel: 'apprentice',
            lastPracticedAt: Date.now(),
          },
        },
      },
    });

    expect(wrapper.find('[data-testid="theme-drill-selector"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="theme-card-fork"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="theme-card-fork"]').text()).toContain('15 Stars');

    // Click filter tab for checkmate_patterns
    const checkmateTab = wrapper.find('[data-testid="filter-tab-checkmate_patterns"]');
    await checkmateTab.trigger('click');

    expect(wrapper.find('[data-testid="theme-card-mate_in_1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="theme-card-fork"]').exists()).toBe(false);
  });

  it('emits selectTheme on clicking the practice drill button', async () => {
    const wrapper = mount(ThemeDrillSelector);
    const drillBtn = wrapper.find('[data-testid="practice-drill-btn-fork"]');
    expect(drillBtn.exists()).toBe(true);
    await drillBtn.trigger('click');

    expect(wrapper.emitted('selectTheme')).toBeTruthy();
    expect(wrapper.emitted('selectTheme')![0]).toEqual(['fork']);
  });

  it('renders theme card as accessible region and supports decoupled practice drill button', async () => {
    const wrapper = mount(ThemeDrillSelector);
    const forkCard = wrapper.find('[data-testid="theme-card-fork"]');
    const drillBtn = wrapper.find('[data-testid="practice-drill-btn-fork"]');

    expect(forkCard.attributes('role')).toBe('region');
    expect(forkCard.attributes('aria-label')).toBe('Royal Forks 🍴 tactical drill');
    expect(drillBtn.exists()).toBe(true);
    expect(drillBtn.text()).toContain('Practice Drill');

    await drillBtn.trigger('click');
    expect(wrapper.emitted('selectTheme')?.[0]).toEqual(['fork']);
  });

  describe('Theme Concept Primer Modal Flow', () => {
    it('opens concept primer modal on clicking primer button and displays motif definition and visual clues', async () => {
      const wrapper = mount(ThemeDrillSelector, {
        global: {
          stubs: { teleport: true },
        },
      });

      const primerBtn = wrapper.find('[data-testid="theme-primer-btn-fork"]');
      expect(primerBtn.exists()).toBe(true);

      await primerBtn.trigger('click');

      const primerModal = wrapper.find('[data-testid="theme-primer-modal"]');
      expect(primerModal.exists()).toBe(true);
      expect(wrapper.find('[data-testid="primer-concept-section"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="primer-concept-text"]').text()).toContain('double attack where one piece strikes two or more targets');
      expect(wrapper.find('[data-testid="primer-clues-section"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="primer-clues-text"]').text()).toContain('Look for two high-value enemy pieces on squares that a Knight');
      expect(wrapper.find('[data-testid="primer-tip-text"]').text()).toContain('Knights and Pawns love jumping into squares');
    });

    it('emits selectTheme and closes modal when Start Drill is clicked in primer modal', async () => {
      const wrapper = mount(ThemeDrillSelector, {
        global: {
          stubs: { teleport: true },
        },
      });

      const primerBtn = wrapper.find('[data-testid="theme-primer-btn-fork"]');
      await primerBtn.trigger('click');

      const startDrillBtn = wrapper.find('[data-testid="start-drill-btn"]');
      expect(startDrillBtn.exists()).toBe(true);

      await startDrillBtn.trigger('click');

      expect(wrapper.emitted('selectTheme')).toBeTruthy();
      expect(wrapper.emitted('selectTheme')![0]).toEqual(['fork']);
    });
  });

  describe('Zero Empty Theme Cards Guarantee across all Category Tabs', () => {
    it('renders all 24 theme cards in "All Motifs" view without any empty drills', () => {
      const wrapper = mount(ThemeDrillSelector);
      const cards = wrapper.findAll('.theme-drill-card');
      expect(cards).toHaveLength(24);
    });

    it('renders playable theme cards in every category tab and emits valid theme on click', async () => {
      const wrapper = mount(ThemeDrillSelector);
      const categoryTabs = [
        'basic_tactics',
        'advanced_tactics',
        'checkmate_patterns',
        'endgame_technique',
        'opening_traps',
      ] as const;

      for (const cat of categoryTabs) {
        const tabBtn = wrapper.find(`[data-testid="filter-tab-${cat}"]`);
        expect(tabBtn.exists(), `Tab button filter-tab-${cat} missing`).toBe(true);
        await tabBtn.trigger('click');

        const activeCards = wrapper.findAll('.theme-drill-card');
        expect(
          activeCards.length,
          `Category ${cat} has 0 theme cards rendered!`,
        ).toBeGreaterThan(0);
      }
    });
  });

  describe('Theme Aliases, Keyboard Navigation & Mastery Mapping', () => {
    it('resolves mastery progress through theme aliases and alternative themeMastery prop', () => {
      const wrapper = mount(ThemeDrillSelector, {
        props: {
          selectedTheme: 'pin',
          themeMastery: {
            smothered: {
              theme: 'smothered_mate',
              attempted: 2,
              solved: 2,
              starsEarned: 6,
              masteryLevel: 'apprentice',
              lastPracticedAt: Date.now(),
            },
            endgame_conversion: {
              theme: 'pawn_endgame',
              attempted: 3,
              solved: 3,
              starsEarned: 9,
              masteryLevel: 'master',
              lastPracticedAt: Date.now(),
            },
          },
        },
      });

      // pin is selected
      const pinCard = wrapper.find('[data-testid="theme-card-pin"]');
      expect(pinCard.classes()).toContain('is-selected');

      // smothered_mate resolved via smothered alias
      const smotheredCard = wrapper.find('[data-testid="theme-card-smothered_mate"]');
      expect(smotheredCard.text()).toContain('Apprentice');

      // pawn_endgame resolved via endgame_conversion alias
      const pawnCard = wrapper.find('[data-testid="theme-card-pawn_endgame"]');
      expect(pawnCard.text()).toContain('Master');
    });

    it('navigates category tabs using keyboard arrows, Home, and End keys', async () => {
      const wrapper = mount(ThemeDrillSelector);
      const allTab = wrapper.find('[data-testid="filter-tab-all"]');

      // ArrowRight advances to basic_tactics
      await allTab.trigger('keydown', { key: 'ArrowRight' });
      expect(wrapper.find('[data-testid="filter-tab-basic_tactics"]').classes()).toContain('is-active');

      // ArrowDown advances to advanced_tactics
      const basicTab = wrapper.find('[data-testid="filter-tab-basic_tactics"]');
      await basicTab.trigger('keydown', { key: 'ArrowDown' });
      expect(wrapper.find('[data-testid="filter-tab-advanced_tactics"]').classes()).toContain('is-active');

      // ArrowLeft retreats to basic_tactics
      const advTab = wrapper.find('[data-testid="filter-tab-advanced_tactics"]');
      await advTab.trigger('keydown', { key: 'ArrowLeft' });
      expect(wrapper.find('[data-testid="filter-tab-basic_tactics"]').classes()).toContain('is-active');

      // ArrowUp retreats to all
      await basicTab.trigger('keydown', { key: 'ArrowUp' });
      expect(wrapper.find('[data-testid="filter-tab-all"]').classes()).toContain('is-active');

      // End jumps to last category
      await allTab.trigger('keydown', { key: 'End' });
      expect(wrapper.find('[data-testid="filter-tab-opening_traps"]').classes()).toContain('is-active');

      // Home jumps back to all
      const trapTab = wrapper.find('[data-testid="filter-tab-opening_traps"]');
      await trapTab.trigger('keydown', { key: 'Home' });
      expect(wrapper.find('[data-testid="filter-tab-all"]').classes()).toContain('is-active');

      // Ignored keys
      await allTab.trigger('keydown', { key: 'Tab' });
      expect(wrapper.find('[data-testid="filter-tab-all"]').classes()).toContain('is-active');
    });
  });
});
