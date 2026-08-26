import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AiOpponentSelect from '../AiOpponentSelect.vue';
import { ALL_MASCOTS } from '../../data/index';

describe('AiOpponentSelect.vue', () => {
  it('renders header, title, and all 4 mascot persona cards', () => {
    const wrapper = mount(AiOpponentSelect);

    expect(wrapper.text()).toContain('Choose Your Opponent');
    expect(wrapper.text()).toContain('SINGLE-PLAYER CHESS');

    ALL_MASCOTS.forEach((mascot) => {
      expect(wrapper.text()).toContain(mascot.name);
      expect(wrapper.text()).toContain(mascot.avatar);
      expect(wrapper.text()).toContain(`~${mascot.eloEstimate} ELO`);
      expect(wrapper.text()).toContain(mascot.title);
    });

    const cards = wrapper.findAll('.mascot-card-wrapper');
    expect(cards.length).toBe(4);
  });

  it('renders color option buttons (White, Random, Black) with White selected by default', () => {
    const wrapper = mount(AiOpponentSelect);

    const colorButtons = wrapper.findAll('.color-option-btn');
    expect(colorButtons.length).toBe(3);

    expect(colorButtons[0]?.text()).toContain('Play White');
    expect(colorButtons[1]?.text()).toContain('Random Side');
    expect(colorButtons[2]?.text()).toContain('Play Black');

    // Default selected is White
    expect(colorButtons[0]?.classes()).toContain('is-selected');
    expect(colorButtons[0]?.attributes('aria-pressed')).toBe('true');
  });

  it('allows player to toggle color preference', async () => {
    const wrapper = mount(AiOpponentSelect);
    const colorButtons = wrapper.findAll('.color-option-btn');

    // Click "Random Side"
    await colorButtons[1]?.trigger('click');
    expect(colorButtons[1]?.classes()).toContain('is-selected');
    expect(colorButtons[0]?.classes()).not.toContain('is-selected');

    // Click "Play Black"
    await colorButtons[2]?.trigger('click');
    expect(colorButtons[2]?.classes()).toContain('is-selected');
    expect(colorButtons[1]?.classes()).not.toContain('is-selected');
  });

  it('emits "select" and "start" events when a mascot challenge button is clicked', async () => {
    const wrapper = mount(AiOpponentSelect);

    const challengeFoxBtn = wrapper.find('[data-testid="challenge-btn-fox"]');
    expect(challengeFoxBtn.exists()).toBe(true);

    await challengeFoxBtn.trigger('click');

    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')?.[0]).toEqual(['fox']);

    expect(wrapper.emitted('start')).toBeTruthy();
    expect(wrapper.emitted('start')?.[0]).toEqual([
      { mascotId: 'fox', playerColor: 'w' },
    ]);
  });

  it('emits selected color when custom color is picked before challenge', async () => {
    const wrapper = mount(AiOpponentSelect);

    // Pick Black
    const colorButtons = wrapper.findAll('.color-option-btn');
    await colorButtons[2]?.trigger('click');

    // Challenge Sparky
    const challengeSparkyBtn = wrapper.find('[data-testid="challenge-btn-sparky"]');
    await challengeSparkyBtn.trigger('click');

    expect(wrapper.emitted('start')?.[0]).toEqual([
      { mascotId: 'sparky', playerColor: 'b' },
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
