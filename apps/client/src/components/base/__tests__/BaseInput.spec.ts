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

  it('displays error message and sets aria-invalid', () => {
    const wrapper = mount(BaseInput, {
      props: {
        error: 'Room not found',
      },
    });

    expect(wrapper.classes()).toContain('has-error');
    expect(wrapper.find('.base-input-error').text()).toContain('Room not found');
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true');
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
});
