import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseInput from '../BaseInput.vue';

describe('BaseInput.vue', () => {
  it('renders input with label and placeholder', () => {
    const wrapper = mount(BaseInput, {
      props: {
        label: 'Nickname',
        placeholder: 'Enter name',
      },
    });

    expect(wrapper.find('label').text()).toBe('Nickname');
    const input = wrapper.find('input');
    expect(input.attributes('placeholder')).toBe('Enter name');
  });

  it('updates modelValue on input event', async () => {
    const wrapper = mount(BaseInput, {
      props: {
        modelValue: 'Leo',
      },
    });

    const input = wrapper.find('input');
    await input.setValue('Maya');

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Maya']);
  });

  it('formats input to uppercase when uppercase prop is true', async () => {
    const wrapper = mount(BaseInput, {
      props: {
        uppercase: true,
        modelValue: '',
      },
    });

    const input = wrapper.find('input');
    await input.setValue('lion');

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['LION']);
  });

  it('displays error message, role="alert", aria-invalid, and links aria-describedby', () => {
    const wrapper = mount(BaseInput, {
      props: {
        id: 'test-room-input',
        error: 'Room not found',
      },
    });

    expect(wrapper.classes()).toContain('has-error');
    const errorMsg = wrapper.find('.base-input-error');
    expect(errorMsg.exists()).toBe(true);
    expect(errorMsg.text()).toContain('Room not found');
    expect(errorMsg.attributes('role')).toBe('alert');
    expect(errorMsg.attributes('id')).toBe('test-room-input-error');

    const input = wrapper.find('input');
    expect(input.attributes('aria-invalid')).toBe('true');
    expect(input.attributes('aria-describedby')).toBe('test-room-input-error');
  });

  it('links aria-describedby to hint id when hint is provided without error', () => {
    const wrapper = mount(BaseInput, {
      props: {
        id: 'test-hint-input',
        hint: '4 uppercase letters',
      },
    });

    expect(wrapper.find('.base-input-hint').text()).toContain('4 uppercase letters');
    const input = wrapper.find('input');
    expect(input.attributes('aria-invalid')).toBe('false');
    expect(input.attributes('aria-describedby')).toBe('test-hint-input-hint');
  });

  it('clears value when clear button is clicked', async () => {
    const wrapper = mount(BaseInput, {
      props: {
        modelValue: 'Initial text',
        clearable: true,
      },
    });

    const clearBtn = wrapper.find('.base-input-clear-btn');
    expect(clearBtn.exists()).toBe(true);

    await clearBtn.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toContainEqual(['']);
    expect(wrapper.emitted('clear')).toHaveLength(1);
  });

  it('renders accessible clear button without tabindex="-1" and with aria-label', () => {
    const wrapper = mount(BaseInput, {
      props: {
        modelValue: 'Initial text',
        clearable: true,
      },
    });

    const clearBtn = wrapper.find('.base-input-clear-btn');
    expect(clearBtn.exists()).toBe(true);
    expect(clearBtn.attributes('aria-label')).toBe('Clear input text');
    expect(clearBtn.attributes('tabindex')).toBeUndefined();
  });

  it('renders prefix and suffix slots with accessible attributes', () => {
    const wrapper = mount(BaseInput, {
      slots: {
        'icon-left': '<span class="prefix-icon">🔑</span>',
        'icon-right': '<span class="suffix-icon">✨</span>',
      },
    });

    expect(wrapper.find('.prefix-icon').text()).toBe('🔑');
    expect(wrapper.find('.suffix-icon').text()).toBe('✨');
  });

  it('emits enter event on Enter keydown', async () => {
    const wrapper = mount(BaseInput, {
      props: {
        modelValue: 'STAR',
      },
    });

    const input = wrapper.find('input');
    await input.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('enter')).toHaveLength(1);
  });

  it('renders input control with proper structure and accessible attributes', () => {
    const wrapper = mount(BaseInput, {
      props: {
        label: 'Username',
        placeholder: 'Enter username',
      },
    });

    const control = wrapper.find('.base-input-control');
    expect(control.exists()).toBe(true);
    expect(control.attributes('type')).toBe('text');
    expect(control.attributes('id')).toBeDefined();
  });
});
