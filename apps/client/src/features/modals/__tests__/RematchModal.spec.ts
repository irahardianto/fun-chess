import { describe, it, expect, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import RematchModal from '../RematchModal.vue';

describe('RematchModal.vue', () => {
  let wrapper: VueWrapper;

  afterEach(() => {
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('renders requester nickname and challenge message', () => {
    wrapper = mount(RematchModal, {
      props: {
        modelValue: true,
        requesterName: 'Maya',
      },
    });

    expect(document.body.textContent).toContain('Maya');
    expect(document.body.textContent).toContain('wants a rematch');
  });

  it('emits accept event when accept button is clicked', async () => {
    wrapper = mount(RematchModal, {
      props: {
        modelValue: true,
        requesterName: 'Maya',
      },
    });

    const acceptBtn = document.body.querySelector('[data-testid="accept-rematch-btn"]') as HTMLButtonElement;
    expect(acceptBtn).not.toBeNull();
    expect(acceptBtn.textContent).toContain('Accept rematch');
    acceptBtn.click();

    expect(wrapper.emitted('accept')).toHaveLength(1);
  });

  it('emits decline event when decline button is clicked', async () => {
    wrapper = mount(RematchModal, {
      props: {
        modelValue: true,
        requesterName: 'Maya',
      },
    });

    const declineBtn = document.body.querySelector('[data-testid="decline-rematch-btn"]') as HTMLButtonElement;
    expect(declineBtn).not.toBeNull();
    expect(declineBtn.textContent).toContain('Decline rematch');
    declineBtn.click();

    expect(wrapper.emitted('decline')).toHaveLength(1);
  });
});
