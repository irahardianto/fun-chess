import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ScenarioCategoryList from '../ScenarioCategoryList.vue';
import { CURRICULUM_SECTIONS } from '../../data/index';

describe('ScenarioCategoryList.vue', () => {
  it('renders hero banner with star progress and curriculum sections', () => {
    const wrapper = mount(ScenarioCategoryList, {
      props: {
        sections: CURRICULUM_SECTIONS,
        progressMap: {},
      },
    });

    expect(wrapper.text()).toContain('Chess Academy');
    expect(wrapper.text()).toContain('Master Chess Step by Step!');
    expect(wrapper.text()).toContain('All Lessons');

    CURRICULUM_SECTIONS.forEach((sec) => {
      expect(wrapper.text()).toContain(sec.title);
    });
  });

  it('filters sections when a category tab is clicked', async () => {
    const wrapper = mount(ScenarioCategoryList, {
      props: {
        sections: CURRICULUM_SECTIONS,
      },
    });

    const tabs = wrapper.findAll('.category-tab-btn');
    expect(tabs.length).toBeGreaterThan(1);

    // Click the second tab (e.g. Piece Fundamentals or Tactical Patterns)
    await tabs[1]?.trigger('click');

    expect(wrapper.emitted('selectCategory')).toBeTruthy();
    expect(tabs[1]?.classes()).toContain('is-active');
  });

  it('emits "selectScenario" when child ScenarioCard plays a scenario', async () => {
    const wrapper = mount(ScenarioCategoryList, {
      props: {
        sections: CURRICULUM_SECTIONS,
      },
    });

    const playBtns = wrapper.findAll('.scenario-play-btn');
    expect(playBtns.length).toBeGreaterThan(0);

    await playBtns[0]?.trigger('click');

    expect(wrapper.emitted('selectScenario')).toBeTruthy();
  });

  it('renders "Continue Learning" hero card pointing to the first uncompleted lesson', async () => {
    const firstScenario = CURRICULUM_SECTIONS[0]!.scenarios[0]!;
    const secondScenario = CURRICULUM_SECTIONS[0]!.scenarios[1]!;

    // Case 1: No progress -> first scenario is next
    const wrapperEmpty = mount(ScenarioCategoryList, {
      props: {
        sections: CURRICULUM_SECTIONS,
        progressMap: {},
      },
    });

    const heroEmpty = wrapperEmpty.find('[data-testid="continue-learning-hero"]');
    expect(heroEmpty.exists()).toBe(true);
    expect(heroEmpty.text()).toContain(firstScenario.title);

    // Case 2: First completed -> second scenario is next
    const wrapperPartial = mount(ScenarioCategoryList, {
      props: {
        sections: CURRICULUM_SECTIONS,
        progressMap: {
          [firstScenario.id]: {
            scenarioId: firstScenario.id,
            starsEarned: 3,
            attemptsCount: 1,
            hintsUsedTotal: 0,
            firstCompletedAt: Date.now(),
            lastCompletedAt: Date.now(),
          },
        },
      },
    });

    const heroPartial = wrapperPartial.find('[data-testid="continue-learning-hero"]');
    expect(heroPartial.exists()).toBe(true);
    expect(heroPartial.text()).toContain(secondScenario.title);

    // Clicking the continue button emits selectScenario with the second scenario
    const resumeBtn = wrapperPartial.find('[data-testid="resume-lesson-btn"]');
    expect(resumeBtn.exists()).toBe(true);
    await resumeBtn.trigger('click');

    expect(wrapperPartial.emitted('selectScenario')).toBeTruthy();
    expect(wrapperPartial.emitted('selectScenario')?.[0]?.[0]).toEqual(secondScenario);
  });

  it('does not render "Continue Learning" hero card when all lessons are completed', () => {
    const progressMap: Record<string, any> = {};
    for (const sec of CURRICULUM_SECTIONS) {
      for (const sc of sec.scenarios) {
        progressMap[sc.id] = {
          scenarioId: sc.id,
          starsEarned: 3,
          attemptsCount: 1,
          hintsUsedTotal: 0,
          firstCompletedAt: Date.now(),
          lastCompletedAt: Date.now(),
        };
      }
    }

    const wrapper = mount(ScenarioCategoryList, {
      props: {
        sections: CURRICULUM_SECTIONS,
        progressMap,
      },
    });

    const hero = wrapper.find('[data-testid="continue-learning-hero"]');
    expect(hero.exists()).toBe(false);
  });

  it('supports roving tabindex keyboard navigation on curriculum category tabs', async () => {
    const wrapper = mount(ScenarioCategoryList, {
      props: {
        sections: CURRICULUM_SECTIONS,
      },
    });

    const allTab = wrapper.find('#academy-tab-all');
    expect(allTab.attributes('tabindex')).toBe('0');

    // ArrowRight -> selects first section tab
    await allTab.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('selectCategory')).toBeTruthy();
    expect(wrapper.emitted('selectCategory')?.[0]).toEqual([CURRICULUM_SECTIONS[0]!.id]);

    // End -> selects last section tab
    await allTab.trigger('keydown', { key: 'End' });
    const lastSection = CURRICULUM_SECTIONS[CURRICULUM_SECTIONS.length - 1]!;
    expect(wrapper.emitted('selectCategory')?.[1]).toEqual([lastSection.id]);

    // Home -> selects all lessons tab
    await allTab.trigger('keydown', { key: 'Home' });
    expect(wrapper.emitted('selectCategory')?.[2]).toEqual(['all']);
  });
});

