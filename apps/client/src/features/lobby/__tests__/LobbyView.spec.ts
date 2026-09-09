import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LobbyView from '../LobbyView.vue';
import { PuzzleHubView } from '@/features/puzzles';
import { STORAGE_KEYS } from '@/platform/storage/keys';
import { safeLocalStorage } from '@/platform/storage';

describe('LobbyView.vue', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    safeLocalStorage.clear();
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

  afterEach(() => {
    mockStorage = {};
    safeLocalStorage.clear();
    vi.restoreAllMocks();
  });

  it('defaults fresh users to Chess Academy mode', () => {
    const wrapper = mount(LobbyView);

    expect(wrapper.find('[data-testid="lobby-mode-selector"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="academy-panel"]').exists()).toBe(true);
    expect(wrapper.find('.academy-browser-container').exists()).toBe(true);
    expect(wrapper.find('.lan-mode-panel').exists()).toBe(false);
  });

  it('renders Mode Switcher, HostCard, JoinCard, and Wi-Fi LAN banner in LAN mode', () => {
    const wrapper = mount(LobbyView, {
      props: { initialMode: 'multiplayer_lan' },
    });

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
    const wrapper = mount(LobbyView, {
      props: {
        initialMode: 'multiplayer_lan',
      },
    });

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
        initialMode: 'multiplayer_lan',
      },
    });

    const inputs = wrapper.find('.join-card').findAll('input');
    await inputs[0]!.setValue('FastKnight'); // Nickname input
    await inputs[1]!.setValue('STAR'); // Room code input

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
        initialMode: 'multiplayer_lan',
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
    const wrapper = mount(LobbyView, {
      props: {
        initialMode: 'multiplayer_lan',
      },
    });

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

  it('implements ARIA APG roving tabindex and arrow key navigation for avatar picker', async () => {
    const wrapper = mount(LobbyView, {
      props: {
        initialMode: 'multiplayer_lan',
      },
    });

    const lionBtn = wrapper.find('[data-testid="lobby-avatar-option-🦁"]');
    const rocketBtn = wrapper.find('[data-testid="lobby-avatar-option-🚀"]');
    const unicornBtn = wrapper.find('[data-testid="lobby-avatar-option-🦄"]');
    const pandaBtn = wrapper.find('[data-testid="lobby-avatar-option-🐼"]');

    // Initially 🦁 is selected (tabindex 0), others have -1
    expect(lionBtn.attributes('tabindex')).toBe('0');
    expect(rocketBtn.attributes('tabindex')).toBe('-1');

    // ArrowRight -> selects 🚀
    await lionBtn.trigger('keydown', { key: 'ArrowRight' });
    expect(rocketBtn.classes()).toContain('is-selected');
    expect(rocketBtn.attributes('tabindex')).toBe('0');
    expect(lionBtn.attributes('tabindex')).toBe('-1');

    // ArrowRight -> selects 🦄
    await rocketBtn.trigger('keydown', { key: 'ArrowRight' });
    expect(unicornBtn.classes()).toContain('is-selected');

    // ArrowLeft -> back to 🚀
    await unicornBtn.trigger('keydown', { key: 'ArrowLeft' });
    expect(rocketBtn.classes()).toContain('is-selected');

    // End -> selects 🐼 (last avatar)
    await rocketBtn.trigger('keydown', { key: 'End' });
    expect(pandaBtn.classes()).toContain('is-selected');

    // Home -> selects 🦁 (first avatar)
    await pandaBtn.trigger('keydown', { key: 'Home' });
    expect(lionBtn.classes()).toContain('is-selected');
  });

  it('reads and saves player avatar using STORAGE_KEYS.PLAYER_AVATAR (MIN-031)', async () => {
    localStorage.setItem(STORAGE_KEYS.PLAYER_AVATAR, '🦄');

    const wrapper = mount(LobbyView, {
      props: {
        initialMode: 'multiplayer_lan',
      },
    });

    const unicornBtn = wrapper.find('[data-testid="lobby-avatar-option-🦄"]');
    expect(unicornBtn.classes()).toContain('is-selected');

    const pandaBtn = wrapper.find('[data-testid="lobby-avatar-option-🐼"]');
    await pandaBtn.trigger('click');

    expect(pandaBtn.classes()).toContain('is-selected');
    expect(localStorage.getItem(STORAGE_KEYS.PLAYER_AVATAR)).toBe('🐼');
  });

  it('resolves initial mode from props.progressMap without accessing legacy raw localStorage (MIN-031)', () => {
    // When progressMap has completed scenarios (> 0), defaults to multiplayer_lan
    const wrapperCompleted = mount(LobbyView, {
      props: {
        progressMap: {
          'scenario-1': {
            scenarioId: 'scenario-1',
            starsEarned: 3,
            attemptsCount: 1,
            hintsUsedTotal: 0,
            firstCompletedAt: 123456,
            lastCompletedAt: 123456,
          },
        },
      },
    });
    expect(wrapperCompleted.find('.host-card').exists()).toBe(true);

    // When progressMap is empty (0 completed), defaults to academy
    const wrapperEmpty = mount(LobbyView, {
      props: {
        progressMap: {},
      },
    });
    expect(wrapperEmpty.find('.academy-browser-container').exists()).toBe(true);
  });

  describe('Puzzle Hub navigation and drill event standardization (MAJ-004)', () => {
    it('switches to puzzle_hub mode and renders PuzzleHubView', async () => {
      const wrapper = mount(LobbyView);

      const puzzleHubTab = wrapper.find('[data-testid="mode-tab-puzzle_hub"]');
      expect(puzzleHubTab.exists()).toBe(true);
      await puzzleHubTab.trigger('click');

      expect(wrapper.find('[data-testid="puzzle-hub-panel"]').exists()).toBe(true);
      expect(wrapper.findComponent(PuzzleHubView).exists()).toBe(true);
      expect(wrapper.emitted('modeChange')).toContainEqual(['puzzle_hub']);
    });

    it('standardizes and forwards launch-drills event with optional theme', () => {
      const wrapper = mount(LobbyView, {
        props: { initialMode: 'puzzle_hub' },
      });

      const hub = wrapper.findComponent(PuzzleHubView);
      expect(hub.exists()).toBe(true);

      hub.vm.$emit('launch-drills', 'fork');

      expect(wrapper.emitted('launchDrills')).toHaveLength(1);
      expect(wrapper.emitted('launchDrills')?.[0]).toEqual(['fork']);
      expect(wrapper.emitted('launch-drills')).toHaveLength(1);
      expect(wrapper.emitted('launch-drills')?.[0]).toEqual(['fork']);

      hub.vm.$emit('launch-drills');
      expect(wrapper.emitted('launchDrills')).toHaveLength(2);
      expect(wrapper.emitted('launchDrills')?.[1]).toEqual([undefined]);
      expect(wrapper.emitted('launch-drills')).toHaveLength(2);
      expect(wrapper.emitted('launch-drills')?.[1]).toEqual([undefined]);
    });

    it('standardizes and forwards launch-ladder event', () => {
      const wrapper = mount(LobbyView, {
        props: { initialMode: 'puzzle_hub' },
      });

      const hub = wrapper.findComponent(PuzzleHubView);
      expect(hub.exists()).toBe(true);

      hub.vm.$emit('launch-ladder');

      expect(wrapper.emitted('launchLadder')).toHaveLength(1);
      expect(wrapper.emitted('launchLadder')?.[0]).toEqual([]);
      expect(wrapper.emitted('launch-ladder')).toHaveLength(1);
      expect(wrapper.emitted('launch-ladder')?.[0]).toEqual([]);
    });

    it('standardizes and forwards launch-rush event with optional subMode', () => {
      const wrapper = mount(LobbyView, {
        props: { initialMode: 'puzzle_hub' },
      });

      const hub = wrapper.findComponent(PuzzleHubView);
      expect(hub.exists()).toBe(true);

      hub.vm.$emit('launch-rush', 'streak_survivor');

      expect(wrapper.emitted('launchRush')).toHaveLength(1);
      expect(wrapper.emitted('launchRush')?.[0]).toEqual(['streak_survivor']);
      expect(wrapper.emitted('launch-rush')).toHaveLength(1);
      expect(wrapper.emitted('launch-rush')?.[0]).toEqual(['streak_survivor']);

      hub.vm.$emit('launch-rush', 'puzzle_rush');
      expect(wrapper.emitted('launchRush')).toHaveLength(2);
      expect(wrapper.emitted('launchRush')?.[1]).toEqual(['puzzle_rush']);
      expect(wrapper.emitted('launch-rush')).toHaveLength(2);
      expect(wrapper.emitted('launch-rush')?.[1]).toEqual(['puzzle_rush']);
    });
  });
});

