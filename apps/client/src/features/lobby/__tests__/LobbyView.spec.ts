import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LobbyView from '../LobbyView.vue';

describe('LobbyView.vue', () => {
  it('renders Mode Switcher, HostCard, JoinCard, and Wi-Fi LAN banner by default', () => {
    const wrapper = mount(LobbyView);

    expect(wrapper.find('[data-testid="lobby-mode-selector"]').exists()).toBe(true);
    expect(wrapper.find('.host-card').exists()).toBe(true);
    expect(wrapper.find('.join-card').exists()).toBe(true);
    expect(wrapper.find('.lan-host-banner').exists()).toBe(true);
  });

  it('switches to Solo AI mode and renders AiOpponentSelect', async () => {
    const wrapper = mount(LobbyView);

    const soloAiTab = wrapper.find('[data-testid="mode-tab-solo_ai"]');
    expect(soloAiTab.exists()).toBe(true);
    await soloAiTab.trigger('click');

    expect(wrapper.find('[data-testid="solo-ai-panel"]').exists()).toBe(true);
    expect(wrapper.find('.ai-opponent-select').exists()).toBe(true);
    expect(wrapper.find('.lan-mode-panel').exists()).toBe(false);
    expect(wrapper.emitted('modeChange')).toContainEqual(['solo_ai']);
  });

  it('switches to Chess Academy mode and renders ScenarioCategoryList', async () => {
    const wrapper = mount(LobbyView);

    const academyTab = wrapper.find('[data-testid="mode-tab-academy"]');
    expect(academyTab.exists()).toBe(true);
    await academyTab.trigger('click');

    expect(wrapper.find('[data-testid="academy-panel"]').exists()).toBe(true);
    expect(wrapper.find('.academy-browser-container').exists()).toBe(true);
    expect(wrapper.find('.lan-mode-panel').exists()).toBe(false);
    expect(wrapper.emitted('modeChange')).toContainEqual(['academy']);
  });

  it('emits startSoloAi when mascot challenge button is clicked in Solo AI mode', async () => {
    const wrapper = mount(LobbyView, {
      props: {
        initialMode: 'solo_ai',
      },
    });

    expect(wrapper.find('[data-testid="solo-ai-panel"]').exists()).toBe(true);
    const challengePeanutBtn = wrapper.find('[data-testid="challenge-btn-peanut"]');
    expect(challengePeanutBtn.exists()).toBe(true);
    await challengePeanutBtn.trigger('click');

    expect(wrapper.emitted('startSoloAi')).toHaveLength(1);
    expect(wrapper.emitted('startSoloAi')?.[0]?.[0]).toMatchObject({
      mascotId: 'peanut',
      playerName: 'You',
      playerAvatar: '🦁',
    });
  });

  it('emits host and createRoom events when HostCard submits in LAN mode', async () => {
    const wrapper = mount(LobbyView);

    const nameInput = wrapper.find('.host-card input');
    await nameInput.setValue('GrandmasterLeo');

    const whiteBtn = wrapper.find('.host-card [data-testid="color-white-btn"]');
    await whiteBtn.trigger('click');

    const hostBtn = wrapper.find('.host-card .btn-tactile');
    await hostBtn.trigger('click');

    expect(wrapper.emitted('host')).toHaveLength(1);
    expect(wrapper.emitted('host')?.[0]).toEqual([
      {
        playerName: 'GrandmasterLeo',
        preferredColor: 'w',
      },
    ]);
    expect(wrapper.emitted('createRoom')).toHaveLength(1);
  });

  it('emits join and joinRoom events when JoinCard submits', async () => {
    const wrapper = mount(LobbyView, {
      props: {
        initialRoomCode: 'STAR',
      },
    });

    const inputs = wrapper.find('.join-card').findAll('input');
    await inputs[0].setValue('FastKnight'); // Nickname input
    await inputs[1].setValue('STAR'); // Room code input

    const joinBtn = wrapper.find('.join-card .btn-tactile');
    await joinBtn.trigger('click');

    expect(wrapper.emitted('join')).toHaveLength(1);
    expect(wrapper.emitted('join')?.[0]).toEqual([
      {
        roomCode: 'STAR',
        playerName: 'FastKnight',
      },
    ]);
    expect(wrapper.emitted('joinRoom')).toHaveLength(1);
  });

  it('renders Install App button in header badges and allows triggering install', async () => {
    const wrapper = mount(LobbyView);

    const installBtn = wrapper.find('[data-testid="lobby-install-btn"]');
    expect(installBtn.exists()).toBe(true);
    expect(installBtn.text()).toContain('Install App');

    await installBtn.trigger('click');
  });

  it('renders Cloud Server Online banner when isCloudRelay is true', () => {
    const wrapper = mount(LobbyView, {
      props: {
        lanInfo: {
          lanIp: '127.0.0.1',
          port: 3000,
          localUrl: 'https://cloud.funchess.app',
          joinUrl: 'https://cloud.funchess.app',
          interfaces: [],
          isCloudRelay: true,
          relayMode: 'cloud',
        },
      },
    });

    const banner = wrapper.find('[data-testid="lobby-server-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain('Cloud Server Online');
    expect(banner.text()).toContain('Share via Cloud Link / QR Code');
  });

  it('allows picking an avatar and passes the chosen avatar when hosting a game', async () => {
    const wrapper = mount(LobbyView);

    // Pick Rocket avatar
    const rocketAvatarBtn = wrapper.find('[data-testid="lobby-avatar-option-🚀"]');
    expect(rocketAvatarBtn.exists()).toBe(true);
    await rocketAvatarBtn.trigger('click');

    expect(rocketAvatarBtn.classes()).toContain('is-selected');

    // Host game
    const nameInput = wrapper.find('.host-card input');
    await nameInput.setValue('RocketMaster');

    const hostBtn = wrapper.find('.host-card .btn-tactile');
    await hostBtn.trigger('click');

    expect(wrapper.emitted('createRoom')?.[0]).toEqual([
      {
        playerName: 'RocketMaster',
        avatar: '🚀',
        preferredColor: 'random',
      },
    ]);
  });
});

