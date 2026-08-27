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
});
