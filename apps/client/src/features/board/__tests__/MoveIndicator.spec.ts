import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MoveIndicator from '../MoveIndicator.vue';

describe('MoveIndicator.vue', () => {
  it('renders standardized move indicator ring by default', () => {
    const wrapper = mount(MoveIndicator);

    const indicator = wrapper.find('[data-testid="move-indicator"]');
    expect(indicator.exists()).toBe(true);
    expect(indicator.classes()).toContain('move-indicator-ring');
    expect(indicator.classes()).toContain('valid-move-ring');
    expect(indicator.classes()).not.toContain('capture-target-ring');
    expect(indicator.attributes('data-type')).toBe('valid');
  });

  it('renders capture target ring indicator when isCapture is true', () => {
    const wrapper = mount(MoveIndicator, {
      props: {
        isCapture: true,
      },
    });

    const indicator = wrapper.find('[data-testid="move-indicator"]');
    expect(indicator.exists()).toBe(true);
    expect(indicator.classes()).toContain('move-indicator-ring');
    expect(indicator.classes()).toContain('capture-target-ring');
    expect(indicator.classes()).not.toContain('valid-move-ring');
    expect(indicator.attributes('data-type')).toBe('capture');
  });
});
