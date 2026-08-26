import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseCard from '../BaseCard.vue';

describe('BaseCard.vue', () => {
  it('renders default slot content', () => {
    const wrapper = mount(BaseCard, {
      slots: {
        default: '<p class="content">Card Content</p>',
      },
    });

    expect(wrapper.find('.content').text()).toBe('Card Content');
    expect(wrapper.classes()).toContain('base-card');
    expect(wrapper.classes()).toContain('base-card--default');
    expect(wrapper.classes()).toContain('base-card--p-md');
  });

  it('renders header and footer slots when provided', () => {
    const wrapper = mount(BaseCard, {
      slots: {
        header: '<h2>Card Header</h2>',
        default: 'Body text',
        footer: '<button>Submit</button>',
      },
    });

    expect(wrapper.find('header').text()).toBe('Card Header');
    expect(wrapper.find('footer').text()).toBe('Submit');
    expect(wrapper.find('.base-card-body').text()).toBe('Body text');
  });

  it('applies variant and padding classes correctly', () => {
    const wrapper = mount(BaseCard, {
      props: {
        variant: 'raised',
        padding: 'lg',
      },
    });

    expect(wrapper.classes()).toContain('base-card--raised');
    expect(wrapper.classes()).toContain('base-card--p-lg');
  });
});
