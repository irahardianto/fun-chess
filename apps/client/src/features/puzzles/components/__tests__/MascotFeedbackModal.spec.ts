import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import MascotFeedbackModal from '../MascotFeedbackModal.vue';
import type { MascotId } from '@fun-chess/shared';

const mockCelebrate = vi.fn();
vi.mock('../../../../composables/useConfetti', () => ({
  useConfetti: () => ({
    celebrate: mockCelebrate,
    celebrateVictory: vi.fn(),
    celebrateDraw: vi.fn(),
  }),
}));

describe('MascotFeedbackModal.vue', () => {
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
    }
    document.body.innerHTML = '';
  });

  const mountModal = (props: Partial<InstanceType<typeof MascotFeedbackModal>['$props']> = {}) => {
    return mount(MascotFeedbackModal, {
      props: {
        modelValue: true,
        message: 'Great tactical vision!',
        ...props,
      },
      global: {
        stubs: {
          teleport: true,
        },
      },
    });
  };

  describe('Mascot Dialogue & Personas Rendering', () => {
    it('renders dialogue message, default mascot (Sparky Squirrel), and default buttons', () => {
      wrapper = mountModal({
        message: 'Always look for undefended pieces!',
      });

      expect(wrapper.find('[data-testid="mascot-feedback-modal"]').exists()).toBe(true);
      const messageEl = wrapper.find('[data-testid="mascot-message"]');
      expect(messageEl.text()).toBe('"Always look for undefended pieces!"');

      const nameEl = wrapper.find('.mascot-name-tag');
      expect(nameEl.text()).toBe('Sparky Squirrel');

      const avatarEmoji = wrapper.find('.avatar-emoji');
      expect(avatarEmoji.text()).toBe('🐿️');

      expect(wrapper.text()).toContain('Coach Tip! 💡');
      expect(wrapper.find('[data-testid="mascot-confirm-btn"]').text()).toBe('Continue');
    });

    const mascots: Array<{ id: MascotId; name: string; avatar: string }> = [
      { id: 'sparky', name: 'Sparky Squirrel', avatar: '🐿️' },
      { id: 'peanut', name: 'Peanut the Pup', avatar: '🐶' },
      { id: 'fox', name: 'Clever Fox', avatar: '🦊' },
      { id: 'owl', name: 'GM Owl', avatar: '🦉' },
    ];

    for (const mascot of mascots) {
      it(`renders mascot persona correctly for "${mascot.id}" (${mascot.name})`, () => {
        wrapper = mountModal({
          mascotId: mascot.id,
          message: `Advice from ${mascot.name}`,
        });

        expect(wrapper.find('.mascot-name-tag').text()).toBe(mascot.name);
        expect(wrapper.find('.avatar-emoji').text()).toBe(mascot.avatar);
      });
    }

    it('renders custom title and confirm button text when provided', () => {
      wrapper = mountModal({
        title: 'Mastery Achieved! 🏆',
        confirmText: 'Continue Next Drill 🚀',
        message: 'You solved this in record time!',
      });

      expect(wrapper.text()).toContain('Mastery Achieved! 🏆');
      expect(wrapper.find('[data-testid="mascot-confirm-btn"]').text()).toBe('Continue Next Drill 🚀');
    });

    it('does not render modal content when modelValue is false', () => {
      wrapper = mountModal({
        modelValue: false,
      });

      expect(wrapper.find('.mascot-feedback-body').exists()).toBe(false);
    });
  });

  describe('Feedback Variants (Positive vs Encouraging Blunder)', () => {
    it('applies "variant--solve" class for positive puzzle solves', () => {
      wrapper = mountModal({
        variant: 'solve',
        message: 'Checkmate found on move 1!',
      });

      expect(wrapper.find('.mascot-feedback-body').classes()).toContain('variant--solve');
    });

    it('applies "variant--streak_milestone" class for hot streak celebrations', () => {
      wrapper = mountModal({
        variant: 'streak_milestone',
        message: '5 In A Row! You are on fire!',
      });

      expect(wrapper.find('.mascot-feedback-body').classes()).toContain('variant--streak_milestone');
    });

    it('applies "variant--hint" class for progressive coaching hints', () => {
      wrapper = mountModal({
        variant: 'hint',
        message: 'Notice that Black king has no escape squares.',
      });

      expect(wrapper.find('.mascot-feedback-body').classes()).toContain('variant--hint');
    });

    it('applies "variant--mistake" class for encouraging blunder feedback', () => {
      wrapper = mountModal({
        variant: 'mistake',
        message: 'Not quite! Look carefully at the rook pin before moving.',
      });

      expect(wrapper.find('.mascot-feedback-body').classes()).toContain('variant--mistake');
    });
  });

  describe('Celebration & Audio / Visual Cue Triggers', () => {
    it('triggers celebrate effect when opening with variant "solve"', async () => {
      wrapper = mountModal({
        modelValue: false,
        variant: 'solve',
      });
      expect(mockCelebrate).not.toHaveBeenCalled();

      await wrapper.setProps({ modelValue: true });
      expect(mockCelebrate).toHaveBeenCalledTimes(1);
    });

    it('triggers celebrate effect when opening with variant "streak_milestone"', async () => {
      wrapper = mountModal({
        modelValue: false,
        variant: 'streak_milestone',
      });
      expect(mockCelebrate).not.toHaveBeenCalled();

      await wrapper.setProps({ modelValue: true });
      expect(mockCelebrate).toHaveBeenCalledTimes(1);
    });

    it('triggers celebrate effect when triggerConfetti is explicitly true even for hint variant', async () => {
      wrapper = mountModal({
        modelValue: false,
        variant: 'hint',
        triggerConfetti: true,
      });

      await wrapper.setProps({ modelValue: true });
      expect(mockCelebrate).toHaveBeenCalledTimes(1);
    });

    it('does not trigger celebrate effect when opening with encouraging blunder (mistake) variant', async () => {
      wrapper = mountModal({
        modelValue: false,
        variant: 'mistake',
        triggerConfetti: false,
      });

      await wrapper.setProps({ modelValue: true });
      expect(mockCelebrate).not.toHaveBeenCalled();
    });

    it('does not trigger celebrate effect when opening with hint variant without triggerConfetti', async () => {
      wrapper = mountModal({
        modelValue: false,
        variant: 'hint',
        triggerConfetti: false,
      });

      await wrapper.setProps({ modelValue: true });
      expect(mockCelebrate).not.toHaveBeenCalled();
    });

    it('does not trigger celebrate when modal transitions from open to closed', async () => {
      wrapper = mountModal({
        modelValue: true,
        variant: 'solve',
      });
      mockCelebrate.mockClear();

      await wrapper.setProps({ modelValue: false });
      expect(mockCelebrate).not.toHaveBeenCalled();
    });
  });

  describe('Modal Dismiss & Action Emits', () => {
    it('emits "confirm" and "update:modelValue" false when confirm button is clicked', async () => {
      wrapper = mountModal({
        modelValue: true,
      });

      const confirmBtn = wrapper.find('[data-testid="mascot-confirm-btn"]');
      expect(confirmBtn.exists()).toBe(true);

      await confirmBtn.trigger('click');

      expect(wrapper.emitted('confirm')).toHaveLength(1);
      expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    });

    it('emits "close" and "update:modelValue" false when modal close event is triggered', async () => {
      wrapper = mountModal({
        modelValue: true,
      });

      const baseModal = wrapper.findComponent({ name: 'BaseModal' });
      expect(baseModal.exists()).toBe(true);

      baseModal.vm.$emit('close');

      expect(wrapper.emitted('close')).toHaveLength(1);
      expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
    });
  });
});
