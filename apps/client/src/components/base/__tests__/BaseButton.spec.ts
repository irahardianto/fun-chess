import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseButton from '../BaseButton.vue';

describe('BaseButton.vue', () => {
  it('renders default slot content', () => {
    const wrapper = mount(BaseButton, {
      slots: {
        default: 'Click Me!',
      },
    });

    expect(wrapper.text()).toContain('Click Me!');
    expect(wrapper.classes()).toContain('btn-tactile');
    expect(wrapper.classes()).toContain('btn-tactile--primary');
    expect(wrapper.classes()).toContain('btn-tactile--md');
  });

  it('applies variant and size classes properly', () => {
    const wrapper = mount(BaseButton, {
      props: {
        variant: 'accent',
        size: 'lg',
        fullWidth: true,
      },
      slots: {
        default: 'Join Game',
      },
    });

    expect(wrapper.classes()).toContain('btn-tactile--accent');
    expect(wrapper.classes()).toContain('btn-tactile--lg');
    expect(wrapper.classes()).toContain('is-full-width');
  });

  it('emits click event on user interaction', async () => {
    const wrapper = mount(BaseButton, {
      slots: {
        default: 'Host',
      },
    });

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
    expect(wrapper.emitted('click')?.[0]?.[0]).toBeInstanceOf(MouseEvent);
  });

  it('does not emit click event when disabled', async () => {
    const wrapper = mount(BaseButton, {
      props: {
        disabled: true,
      },
      slots: {
        default: 'Disabled Button',
      },
    });

    expect(wrapper.attributes('disabled')).toBeDefined();
    expect(wrapper.classes()).toContain('is-disabled');

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('does not emit click event when loading', async () => {
    const wrapper = mount(BaseButton, {
      props: {
        loading: true,
      },
      slots: {
        default: 'Submitting',
      },
    });

    expect(wrapper.classes()).toContain('is-loading');
    expect(wrapper.find('.btn-spinner').exists()).toBe(true);

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('renders icon-left and icon-right slots correctly', () => {
    const wrapper = mount(BaseButton, {
      slots: {
        'icon-left': '<span class="test-left-icon">⚔️</span>',
        default: 'Battle',
        'icon-right': '<span class="test-right-icon">➡️</span>',
      },
    });

    expect(wrapper.find('.test-left-icon').exists()).toBe(true);
    expect(wrapper.find('.test-right-icon').exists()).toBe(true);
    expect(wrapper.text()).toContain('Battle');
  });

  it('renders with button type and accessible attributes', () => {
    const wrapper = mount(BaseButton, {
      props: {
        type: 'submit',
        ariaLabel: 'Submit form',
      },
    });

    expect(wrapper.attributes('type')).toBe('submit');
    expect(wrapper.attributes('aria-label')).toBe('Submit form');
    expect(wrapper.classes()).toContain('btn-tactile');
  });
});
