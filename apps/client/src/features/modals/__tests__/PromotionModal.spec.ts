import { describe, it, expect, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import PromotionModal from '../PromotionModal.vue';

describe('PromotionModal.vue', () => {
  let wrapper: VueWrapper;

  afterEach(() => {
    if (wrapper) wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('renders all 4 piece promotion options with points and descriptions', () => {
    wrapper = mount(PromotionModal, {
      props: {
        modelValue: true,
        color: 'w',
      },
    });

    expect(document.body.querySelector('[data-testid="promote-q"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="promote-n"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="promote-r"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="promote-b"]')).not.toBeNull();

    expect(document.body.textContent).toContain('Queen');
    expect(document.body.textContent).toContain('9 pts');
    expect(document.body.textContent).toContain('Knight');
    expect(document.body.textContent).toContain('3 pts');
  });

  it('emits select event with "q" when Queen is chosen', async () => {
    wrapper = mount(PromotionModal, {
      props: {
        modelValue: true,
        color: 'w',
      },
    });

    const queenBtn = document.body.querySelector('[data-testid="promote-q"]') as HTMLButtonElement;
    expect(queenBtn).not.toBeNull();
    queenBtn.click();

    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('select')?.[0]).toEqual(['q']);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });

  it('emits select event with "n" when Knight is chosen', async () => {
    wrapper = mount(PromotionModal, {
      props: {
        modelValue: true,
        color: 'b',
      },
    });

    const knightBtn = document.body.querySelector('[data-testid="promote-n"]') as HTMLButtonElement;
    expect(knightBtn).not.toBeNull();
    knightBtn.click();

    expect(wrapper.emitted('select')).toHaveLength(1);
    expect(wrapper.emitted('select')?.[0]).toEqual(['n']);
  });
});
