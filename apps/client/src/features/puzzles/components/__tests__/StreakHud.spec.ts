import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StreakHud from '../StreakHud.vue';

describe('StreakHud.vue', () => {
  it('renders initial streak status', () => {
    const wrapper = mount(StreakHud, {
      props: { streak: 0 },
    });

    expect(wrapper.find('[data-testid="streak-hud"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="streak-label"]').text()).toContain('0 Solved');
  });

  it('renders Spark stage with x2 multiplier on 2 streak', () => {
    const wrapper = mount(StreakHud, {
      props: { streak: 2 },
    });

    expect(wrapper.classes()).toContain('stage--spark');
    expect(wrapper.find('[data-testid="streak-label"]').text()).toContain('STREAK');
    expect(wrapper.text()).toContain('x2');
  });

  it('renders Blaze stage on 4 streak', () => {
    const wrapper = mount(StreakHud, {
      props: { streak: 4 },
    });

    expect(wrapper.classes()).toContain('stage--blaze');
    expect(wrapper.find('[data-testid="streak-label"]').text()).toContain('ON FIRE');
  });

  it('renders Inferno stage on 6+ streak', () => {
    const wrapper = mount(StreakHud, {
      props: { streak: 6 },
    });

    expect(wrapper.classes()).toContain('stage--inferno');
    expect(wrapper.find('[data-testid="streak-label"]').text()).toContain('INFERNO');
  });
});
