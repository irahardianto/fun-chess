import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import AiOpponentSelect from '../AiOpponentSelect.vue';
import { ALL_MASCOTS } from '../../data/index';

describe('AiOpponentSelect.vue', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
    });
  });
  it('renders header, title, and all 4 mascot persona cards', () => {
    const wrapper = mount(AiOpponentSelect);

    expect(wrapper.text()).toContain('Choose Your Opponent');
    expect(wrapper.text()).toContain('Single-Player Chess');

    ALL_MASCOTS.forEach((mascot) => {
      expect(wrapper.text()).toContain(mascot.name);
      expect(wrapper.text()).toContain(mascot.avatar);
      expect(wrapper.text()).toContain(`~${mascot.eloEstimate} Elo`);
      expect(wrapper.text()).toContain(mascot.title);
    });

    const cards = wrapper.findAll('.mascot-card-wrapper');
    expect(cards.length).toBe(4);
  });

  it('renders color option buttons (White, Random, Black) with White selected by default and roving tabindex', () => {
    const wrapper = mount(AiOpponentSelect);

    const colorButtons = wrapper.findAll('.color-option-btn');
    expect(colorButtons.length).toBe(3);

    expect(colorButtons[0]?.text()).toContain('Play White');
    expect(colorButtons[1]?.text()).toContain('Random Side');
    expect(colorButtons[2]?.text()).toContain('Play Black');

    // Default selected is White
    expect(colorButtons[0]?.classes()).toContain('is-selected');
    expect(colorButtons[0]?.attributes('aria-checked')).toBe('true');
    expect(colorButtons[0]?.attributes('tabindex')).toBe('0');
    expect(colorButtons[1]?.attributes('tabindex')).toBe('-1');
    expect(colorButtons[2]?.attributes('tabindex')).toBe('-1');
  });

  it('allows player to toggle color preference and updates aria-checked and tabindex', async () => {
    const wrapper = mount(AiOpponentSelect);
    const colorButtons = wrapper.findAll('.color-option-btn');

    // Click "Random Side"
    await colorButtons[1]?.trigger('click');
    expect(colorButtons[1]?.classes()).toContain('is-selected');
    expect(colorButtons[1]?.attributes('aria-checked')).toBe('true');
    expect(colorButtons[1]?.attributes('tabindex')).toBe('0');
    expect(colorButtons[0]?.classes()).not.toContain('is-selected');
    expect(colorButtons[0]?.attributes('tabindex')).toBe('-1');

    // Click "Play Black"
    await colorButtons[2]?.trigger('click');
    expect(colorButtons[2]?.classes()).toContain('is-selected');
    expect(colorButtons[2]?.attributes('aria-checked')).toBe('true');
    expect(colorButtons[2]?.attributes('tabindex')).toBe('0');
    expect(colorButtons[1]?.classes()).not.toContain('is-selected');
    expect(colorButtons[1]?.attributes('tabindex')).toBe('-1');
  });

  it('supports roving tabindex keyboard navigation on color options', async () => {
    const wrapper = mount(AiOpponentSelect);

    const whiteBtn = wrapper.find('[data-testid="color-option-w"]');
    const randomBtn = wrapper.find('[data-testid="color-option-random"]');
    const blackBtn = wrapper.find('[data-testid="color-option-b"]');

    expect(whiteBtn.attributes('aria-checked')).toBe('true');

    // ArrowRight -> selects random
    await whiteBtn.trigger('keydown', { key: 'ArrowRight' });
    expect(randomBtn.attributes('aria-checked')).toBe('true');
    expect(randomBtn.attributes('tabindex')).toBe('0');

    // ArrowRight -> selects black
    await randomBtn.trigger('keydown', { key: 'ArrowRight' });
    expect(blackBtn.attributes('aria-checked')).toBe('true');
    expect(blackBtn.attributes('tabindex')).toBe('0');

    // ArrowRight -> wraps to white
    await blackBtn.trigger('keydown', { key: 'ArrowRight' });
    expect(whiteBtn.attributes('aria-checked')).toBe('true');

    // ArrowLeft -> wraps to black
    await whiteBtn.trigger('keydown', { key: 'ArrowLeft' });
    expect(blackBtn.attributes('aria-checked')).toBe('true');

    // Home -> white
    await blackBtn.trigger('keydown', { key: 'Home' });
    expect(whiteBtn.attributes('aria-checked')).toBe('true');

    // End -> black
    await whiteBtn.trigger('keydown', { key: 'End' });
    expect(blackBtn.attributes('aria-checked')).toBe('true');
  });

  it('supports roving tabindex keyboard navigation on avatar options', async () => {
    const wrapper = mount(AiOpponentSelect);

    const lionOption = wrapper.find('[data-testid="avatar-option-🦁"]');
    const rocketOption = wrapper.find('[data-testid="avatar-option-🚀"]');
    const pandaOption = wrapper.find('[data-testid="avatar-option-🐼"]');

    expect(lionOption.attributes('tabindex')).toBe('0');
    expect(rocketOption.attributes('tabindex')).toBe('-1');

    // ArrowRight -> selects rocket
    await lionOption.trigger('keydown', { key: 'ArrowRight' });
    expect(rocketOption.classes()).toContain('is-selected');
    expect(rocketOption.attributes('tabindex')).toBe('0');
    expect(lionOption.attributes('tabindex')).toBe('-1');

    // End -> selects panda
    await rocketOption.trigger('keydown', { key: 'End' });
    expect(pandaOption.classes()).toContain('is-selected');
    expect(pandaOption.attributes('tabindex')).toBe('0');

    // Home -> selects lion
    await pandaOption.trigger('keydown', { key: 'Home' });
    expect(lionOption.classes()).toContain('is-selected');
    expect(lionOption.attributes('tabindex')).toBe('0');
  });

  it('renders all 6 avatar emoji options with 🦁 selected by default', () => {
    const wrapper = mount(AiOpponentSelect);

    const avatarButtons = wrapper.findAll('.avatar-option-btn');
    expect(avatarButtons.length).toBe(6);

    const avatars = ['🦁', '🚀', '🦄', '⚡', '👑', '🐼'];
    avatars.forEach((emoji, idx) => {
      expect(avatarButtons[idx]?.text()).toBe(emoji);
    });

    const lionOption = wrapper.find('[data-testid="avatar-option-🦁"]');
    expect(lionOption.classes()).toContain('is-selected');
    expect(lionOption.attributes('aria-checked')).toBe('true');
  });

  it('allows selecting avatar and persists to localStorage under fun_chess_player_avatar', async () => {
    const wrapper = mount(AiOpponentSelect);

    const rocketOption = wrapper.find('[data-testid="avatar-option-🚀"]');
    await rocketOption.trigger('click');

    expect(rocketOption.classes()).toContain('is-selected');
    expect(localStorage.getItem('fun_chess_player_avatar')).toBe('🚀');
  });

  it('emits "select" and "start" events including avatar when a mascot challenge button is clicked', async () => {
    const wrapper = mount(AiOpponentSelect);

    const challengeFoxBtn = wrapper.find('[data-testid="challenge-btn-fox"]');
    expect(challengeFoxBtn.exists()).toBe(true);

    await challengeFoxBtn.trigger('click');

    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')?.[0]).toEqual(['fox']);

    expect(wrapper.emitted('start')).toBeTruthy();
    expect(wrapper.emitted('start')?.[0]).toEqual([
      { mascotId: 'fox', playerColor: 'w', avatar: '🦁' },
    ]);
  });

  it('emits selected color and avatar when custom preferences are picked before challenge', async () => {
    const wrapper = mount(AiOpponentSelect);

    // Pick Black
    const colorButtons = wrapper.findAll('.color-option-btn');
    await colorButtons[2]?.trigger('click');

    // Pick Unicorn avatar
    const unicornOption = wrapper.find('[data-testid="avatar-option-🦄"]');
    await unicornOption.trigger('click');

    // Challenge Sparky
    const challengeSparkyBtn = wrapper.find('[data-testid="challenge-btn-sparky"]');
    await challengeSparkyBtn.trigger('click');

    expect(wrapper.emitted('start')?.[0]).toEqual([
      { mascotId: 'sparky', playerColor: 'b', avatar: '🦄' },
    ]);
  });

  it('highlights selected mascot card when selectedMascotId prop is passed', () => {
    const wrapper = mount(AiOpponentSelect, {
      props: {
        selectedMascotId: 'owl',
      },
    });

    const owlCard = wrapper.find('[data-testid="mascot-card-owl"]');
    expect(owlCard.classes()).toContain('is-active');

    const peanutCard = wrapper.find('[data-testid="mascot-card-peanut"]');
    expect(peanutCard.classes()).not.toContain('is-active');
  });
});
