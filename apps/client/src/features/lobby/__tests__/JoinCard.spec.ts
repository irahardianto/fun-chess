import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import JoinCard from '../JoinCard.vue';

describe('JoinCard.vue (Accessibility & Error Binding)', () => {
  it('renders card title, inputs with accessible labels, and verb-first Join Game button', () => {
    const wrapper = mount(JoinCard);

    expect(wrapper.find('[data-testid="join-card"]').exists()).toBe(true);
    expect(wrapper.find('.card-title').text()).toBe('Enter Room Code');
    expect(wrapper.find('.card-badge').text()).toContain('Join Match');

    const nicknameInput = wrapper.find('[data-testid="join-nickname-input"]');
    expect(nicknameInput.exists()).toBe(true);
    expect(nicknameInput.find('label').text()).toBe('Your Nickname');

    const roomCodeInput = wrapper.find('[data-testid="join-room-code-input"]');
    expect(roomCodeInput.exists()).toBe(true);
    expect(roomCodeInput.find('label').text()).toBe('4-Letter Room Code');

    const joinBtn = wrapper.find('[data-testid="join-game-btn"]');
    expect(joinBtn.exists()).toBe(true);
    expect(joinBtn.text()).toContain('Join Game');
  });

  it('populates room code from initialRoomCode prop and converts to uppercase', async () => {
    const wrapper = mount(JoinCard, {
      props: {
        initialRoomCode: 'star',
      },
    });

    const roomInput = wrapper.find('[data-testid="join-room-code-input"] input');
    expect((roomInput.element as HTMLInputElement).value).toBe('STAR');

    await wrapper.setProps({ initialRoomCode: 'moon' });
    expect((roomInput.element as HTMLInputElement).value).toBe('MOON');
  });

  it('validates empty nickname and sets nicknameError on nickname input', async () => {
    const wrapper = mount(JoinCard);

    const nicknameInput = wrapper.find('[data-testid="join-nickname-input"] input');
    await nicknameInput.setValue('   '); // whitespace only

    const roomInput = wrapper.find('[data-testid="join-room-code-input"] input');
    await roomInput.setValue('STAR');

    const joinBtn = wrapper.find('[data-testid="join-game-btn"]');
    await joinBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('join')).toBeUndefined();
    const nicknameInputGroup = wrapper.find('[data-testid="join-nickname-input"]');
    expect(nicknameInputGroup.find('.base-input-error').text()).toContain('Enter a nickname to join');
    expect(nicknameInputGroup.find('input').attributes('aria-invalid')).toBe('true');
  });

  it('validates invalid room code length (< 4 characters) and sets local error on room code input', async () => {
    const wrapper = mount(JoinCard);

    const nicknameInput = wrapper.find('[data-testid="join-nickname-input"] input');
    await nicknameInput.setValue('FastKnight');

    const roomInput = wrapper.find('[data-testid="join-room-code-input"] input');
    await roomInput.setValue('AB');

    const joinBtn = wrapper.find('[data-testid="join-game-btn"]');
    await joinBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('join')).toBeUndefined();
    const roomInputGroup = wrapper.find('[data-testid="join-room-code-input"]');
    expect(roomInputGroup.find('.base-input-error').text()).toContain('Room code must be 4 characters.');
    expect(roomInputGroup.find('input').attributes('aria-invalid')).toBe('true');
  });

  it('displays external errorMessage prop with role="alert" and aria-invalid on room code input', () => {
    const wrapper = mount(JoinCard, {
      props: {
        errorMessage: 'Room STAR does not exist or has expired!',
      },
    });

    const roomInputGroup = wrapper.find('[data-testid="join-room-code-input"]');
    const errorEl = roomInputGroup.find('.base-input-error');
    expect(errorEl.exists()).toBe(true);
    expect(errorEl.attributes('role')).toBe('alert');
    expect(errorEl.text()).toContain('Room STAR does not exist or has expired!');
    expect(roomInputGroup.find('input').attributes('aria-invalid')).toBe('true');
  });

  it('emits join event with trimmed nickname and uppercase code when inputs are valid', async () => {
    const wrapper = mount(JoinCard);

    const nicknameInput = wrapper.find('[data-testid="join-nickname-input"] input');
    await nicknameInput.setValue('  PandaMaster 🐼  ');

    const roomInput = wrapper.find('[data-testid="join-room-code-input"] input');
    await roomInput.setValue('star');

    const joinBtn = wrapper.find('[data-testid="join-game-btn"]');
    await joinBtn.trigger('click');

    expect(wrapper.emitted('join')).toHaveLength(1);
    expect(wrapper.emitted('join')?.[0]).toEqual([
      {
        roomCode: 'STAR',
        playerName: 'PandaMaster 🐼',
      },
    ]);
  });

  it('emits join event when submitting the form directly (e.g. Enter key)', async () => {
    const wrapper = mount(JoinCard);

    const nicknameInput = wrapper.find('[data-testid="join-nickname-input"] input');
    await nicknameInput.setValue('FastKnight ⚡');

    const roomInput = wrapper.find('[data-testid="join-room-code-input"] input');
    await roomInput.setValue('STAR');

    const form = wrapper.find('form.join-form');
    expect(form.exists()).toBe(true);
    await form.trigger('submit.prevent');

    expect(wrapper.emitted('join')).toHaveLength(1);
    expect(wrapper.emitted('join')?.[0]).toEqual([
      {
        roomCode: 'STAR',
        playerName: 'FastKnight ⚡',
      },
    ]);
  });
});
