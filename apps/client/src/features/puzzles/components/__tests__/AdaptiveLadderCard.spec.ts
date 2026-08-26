import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AdaptiveLadderCard from '../AdaptiveLadderCard.vue';

describe('AdaptiveLadderCard.vue', () => {
  it('renders rating, rank tier badge, and play button', () => {
    const wrapper = mount(AdaptiveLadderCard, {
      props: {
        elo: 1050,
        streak: 3,
        totalSolved: 15,
        targetRating: 1070,
        isLocked: false,
      },
    });

    expect(wrapper.find('[data-testid="live-elo-pill"]').text()).toContain('1050');
    expect(wrapper.find('[data-testid="rank-tier-badge"]').text()).toContain('Knight Scout');
    expect(wrapper.text()).toContain('3 Win Streak');

    const playBtn = wrapper.find('[data-testid="ladder-play-btn"]');
    expect(playBtn.exists()).toBe(true);
    playBtn.trigger('click');
    expect(wrapper.emitted('play')).toBeTruthy();
  });

  it('renders locked overlay when isLocked is true', () => {
    const wrapper = mount(AdaptiveLadderCard, {
      props: {
        elo: 800,
        isLocked: true,
        requiredStarsToUnlock: 20,
        userStars: 5,
      },
    });

    expect(wrapper.find('[data-testid="ladder-locked-overlay"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Unlocks at 20 Stars');
  });
});
