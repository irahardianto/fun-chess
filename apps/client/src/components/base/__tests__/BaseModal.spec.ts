import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseModal from '../BaseModal.vue';

describe('BaseModal.vue', () => {
  it('does not render dialog content when modelValue is false', () => {
    const wrapper = mount(BaseModal, {
      props: {
        modelValue: false,
        title: 'Test Modal',
      },
    });

    expect(wrapper.find('.base-modal-backdrop').exists()).toBe(false);
  });

  it('renders modal dialog and title when modelValue is true', () => {
    const wrapper = mount(BaseModal, {
      props: {
        modelValue: true,
        title: 'Promotion Title',
      },
      slots: {
        default: '<div class="modal-content">Pick a piece</div>',
      },
    });

    const backdrop = document.body.querySelector('.base-modal-backdrop');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.textContent).toContain('Promotion Title');
    expect(backdrop?.textContent).toContain('Pick a piece');
    wrapper.unmount();
  });

  it('emits close and update:modelValue when close button is clicked', async () => {
    const wrapper = mount(BaseModal, {
      props: {
        modelValue: true,
        title: 'Close Me',
        showCloseButton: true,
      },
    });

    const closeBtn = document.body.querySelector('.base-modal-close-btn') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('closes on backdrop click when closeOnBackdrop is true', async () => {
    const wrapper = mount(BaseModal, {
      props: {
        modelValue: true,
        closeOnBackdrop: true,
      },
    });

    const backdrop = document.body.querySelector('.base-modal-backdrop') as HTMLElement;
    expect(backdrop).not.toBeNull();

    // Click backdrop
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('does not close on backdrop click when closeOnBackdrop is false', async () => {
    const wrapper = mount(BaseModal, {
      props: {
        modelValue: true,
        closeOnBackdrop: false,
      },
    });

    const backdrop = document.body.querySelector('.base-modal-backdrop') as HTMLElement;
    expect(backdrop).not.toBeNull();

    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('close')).toBeUndefined();
    wrapper.unmount();
  });

  it('closes on Escape key press when closeOnEsc is true', async () => {
    const wrapper = mount(BaseModal, {
      props: {
        modelValue: true,
        closeOnEsc: true,
      },
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
});
