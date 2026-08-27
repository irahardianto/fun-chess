import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PlayerBadge from '../PlayerBadge.vue';

describe('PlayerBadge.vue', () => {
  it('renders player name, color tag, and avatar', () => {
    const wrapper = mount(PlayerBadge, {
      props: {
        playerName: 'Leo',
        color: 'w',
        isCurrentTurn: false,
        avatar: '🚀',
      },
    });

    expect(wrapper.find('.player-name').text()).toBe('Leo');
    expect(wrapper.find('.color-icon').text()).toBe('⚪');
    expect(wrapper.find('.color-text').text()).toBe('White');
    expect(wrapper.find('[data-testid="player-avatar"]').text()).toContain('🚀');
  });

  it('renders active turn badge with "Your Turn! ✨" when isSelf is true', () => {
    const wrapper = mount(PlayerBadge, {
      props: {
        playerName: 'Leo',
        color: 'w',
        isCurrentTurn: true,
        isSelf: true,
      },
    });

    expect(wrapper.classes()).toContain('is-active-turn');
    const badge = wrapper.find('[data-testid="turn-badge-active"]');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toContain('Your Turn! ✨');
  });

  it('renders "Thinking... ⏳" when opponent turn', () => {
    const wrapper = mount(PlayerBadge, {
      props: {
        playerName: 'Opponent',
        color: 'b',
        isCurrentTurn: true,
        isSelf: false,
      },
    });

    const badge = wrapper.find('[data-testid="turn-badge-active"]');
    expect(badge.text()).toContain('Thinking... ⏳');
  });

  it('displays host badge and handles disconnected status', () => {
    const wrapper = mount(PlayerBadge, {
      props: {
        playerName: 'HostMaster',
        color: 'w',
        isCurrentTurn: false,
        isHost: true,
        isConnected: false,
      },
    });

    expect(wrapper.find('.host-tag').exists()).toBe(true);
    expect(wrapper.classes()).toContain('is-disconnected');
    expect(wrapper.find('.connection-dot').classes()).toContain('is-offline');
  });

  it('renders title attribute on player-name for accessible tooltip and truncation', () => {
    const longName = 'Grandmaster Alexander The Great Chess Champion';
    const wrapper = mount(PlayerBadge, {
      props: {
        playerName: longName,
        color: 'w',
        isCurrentTurn: false,
      },
    });

    const nameEl = wrapper.find('.player-name');
    expect(nameEl.attributes('title')).toBe(longName);
    expect(nameEl.text()).toBe(longName);
  });
});
