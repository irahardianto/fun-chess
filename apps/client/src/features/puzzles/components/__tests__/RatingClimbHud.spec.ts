import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RatingClimbHud from '../RatingClimbHud.vue';

describe('RatingClimbHud.vue Component', () => {
  it('renders rank tier, live Elo rating, and streak indicator', () => {
    const wrapper = mount(RatingClimbHud, {
      props: {
        currentRating: 1250,
        streak: 4,
      },
    });

    expect(wrapper.text()).toContain('Bishop Tactician');
    expect(wrapper.find('[data-testid="rating-display"]').text()).toContain('1250');
    expect(wrapper.find('[data-testid="streak-display"]').text()).toContain('Streak: 4');
    expect(wrapper.find('[data-testid="streak-display"]').classes()).toContain('is-hot');
  });

  it('renders Pawn Novice for rating under 1000', () => {
    const wrapper = mount(RatingClimbHud, {
      props: {
        currentRating: 850,
        streak: 1,
      },
    });

    expect(wrapper.text()).toContain('Pawn Novice');
    expect(wrapper.find('[data-testid="rating-display"]').text()).toContain('850');
  });
});
