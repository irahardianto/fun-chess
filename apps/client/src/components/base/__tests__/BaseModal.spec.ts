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

  it('sets inert attribute on #app when open and removes when closed', async () => {
    const appEl = document.createElement('div');
    appEl.id = 'app';
    document.body.appendChild(appEl);

    const wrapper = mount(BaseModal, {
      props: {
        modelValue: true,
        title: 'Inert Modal',
      },
    });

    expect(appEl.hasAttribute('inert')).toBe(true);

    await wrapper.setProps({ modelValue: false });
    expect(appEl.hasAttribute('inert')).toBe(false);

    wrapper.unmount();
    appEl.remove();
  });

  it('traps Tab and Shift+Tab focus within modal', async () => {
    const wrapper = mount(BaseModal, {
      props: {
        modelValue: true,
        title: 'Focus Trap Modal',
        showCloseButton: true,
      },
      slots: {
        default: '<button id="btn1">Button 1</button><button id="btn2">Button 2</button>',
      },
      attachTo: document.body,
    });

    const closeBtn = document.body.querySelector('.base-modal-close-btn') as HTMLButtonElement;
    const btn2 = document.body.querySelector('#btn2') as HTMLButtonElement;

    // Set focus on last element (btn2)
    btn2.focus();
    expect(document.activeElement).toBe(btn2);

    // Tab on last element should cycle to first element (closeBtn)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tab on first element should cycle to last element (btn2)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(btn2);

    wrapper.unmount();
  });

  it('auto-focuses first element and restores focus to previous element on close', async () => {
    const triggerBtn = document.createElement('button');
    triggerBtn.id = 'trigger-btn';
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    const wrapper = mount(BaseModal, {
      props: {
        modelValue: true,
        title: 'Auto Focus Modal',
        showCloseButton: true,
      },
      slots: {
        default: '<input id="test-input" />',
      },
      attachTo: document.body,
    });

    await wrapper.vm.$nextTick();
    const closeBtn = document.body.querySelector('.base-modal-close-btn') as HTMLButtonElement;
    expect(document.activeElement).toBe(closeBtn);

    // Close modal
    await wrapper.setProps({ modelValue: false });
    expect(document.activeElement).toBe(triggerBtn);

    wrapper.unmount();
    triggerBtn.remove();
  });

  it('does not close on Escape when closeOnEsc is false', async () => {
    const wrapper = mount(BaseModal, {
      props: {
        modelValue: true,
        closeOnEsc: false,
      },
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('close')).toBeUndefined();
    wrapper.unmount();
  });

  it('supports isOpen prop, showCloseButton false, size variants, and ariaLabel', async () => {
    const wrapper = mount(BaseModal, {
      props: {
        isOpen: true,
        showCloseButton: false,
        size: 'lg',
        ariaLabel: 'Accessible Dialog',
      },
      slots: {
        default: '<span>Plain text without buttons</span>',
      },
      attachTo: document.body,
    });

    await wrapper.vm.$nextTick();
    const container = document.body.querySelector('.base-modal-container');
    expect(container).not.toBeNull();
    expect(container?.classList.contains('base-modal--lg')).toBe(true);
    expect(container?.getAttribute('aria-label')).toBe('Accessible Dialog');
    expect(document.body.querySelector('.base-modal-close-btn')).toBeNull();

    // Tab with 0 focusable elements
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(container);

    wrapper.unmount();
  });
});
