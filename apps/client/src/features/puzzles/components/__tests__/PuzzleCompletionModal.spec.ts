import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PuzzleCompletionModal from '../PuzzleCompletionModal.vue';

describe('PuzzleCompletionModal.vue Component', () => {
  it('renders modal when modelValue is true with 3 stars celebration', () => {
    const wrapper = mount(PuzzleCompletionModal, {
      props: {
        modelValue: true,
        stars: 3,
        result: 'solved_first_try',
        ratingDelta: 14,
      },
      global: {
        stubs: {
          teleport: true,
        },
      },
    });

    expect(wrapper.find('[data-testid="puzzle-completion-modal"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Flawless Masterpiece');
    expect(wrapper.text()).toContain('+14 Elo Points');
    expect(wrapper.findAll('.star-item.is-filled').length).toBe(3);
  });

  it('emits next and replay events when buttons are clicked', async () => {
    const wrapper = mount(PuzzleCompletionModal, {
      props: {
        modelValue: true,
        stars: 2,
        result: 'solved_with_hints',
      },
      global: {
        stubs: {
          teleport: true,
        },
      },
    });

    const nextBtn = wrapper.findAll('button').find((b) => b.text().includes('Next Puzzle'));
    await nextBtn?.trigger('click');
    expect(wrapper.emitted('next')).toBeTruthy();

    const replayBtn = wrapper.findAll('button').find((b) => b.text().includes('Replay'));
    await replayBtn?.trigger('click');
    expect(wrapper.emitted('replay')).toBeTruthy();
  });
});
