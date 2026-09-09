import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PuzzleRushArena from '../PuzzleRushArena.vue';
import PuzzleBoardWrapper from '../PuzzleBoardWrapper.vue';
import { InMemoryPuzzleProgressStore } from '../../store/in_memory_puzzle_progress.store';

describe('PuzzleRushArena.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders arena header, timer, strikes, board, and exit button in blitz mode', () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleRushArena, {
      props: {
        subMode: 'puzzle_rush',
        customStore: store,
      },
    });

    expect(wrapper.find('[data-testid="puzzle-rush-arena"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="rush-hud-bar"]').exists()).toBe(true);
    expect(wrapper.find('.rush-mode-badge').text()).toContain('3-Min Rush');
    expect(wrapper.find('[data-testid="rush-timer-section"]').text()).toContain('3:00');
    expect(wrapper.find('[data-testid="rush-score-badge"]').text()).toContain('0');
    expect(wrapper.find('[data-testid="combo-badge"]').text()).toContain('x1');
    expect(wrapper.find('[data-testid="strikes-life-row"]').exists()).toBe(true);
    expect(wrapper.findComponent(PuzzleBoardWrapper).exists()).toBe(true);

    const exitBtn = wrapper.find('[data-testid="rush-exit-btn"]');
    exitBtn.trigger('click');
    expect(wrapper.emitted('exit')).toBeTruthy();
  });

  it('handles countdown timer, urgency class, and timer expiration game over', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleRushArena, {
      props: {
        subMode: 'puzzle_rush',
        customStore: store,
        initialDurationSeconds: 20,
      },
    });

    expect(wrapper.find('[data-testid="rush-timer"]').text()).toContain('0:20');
    expect(wrapper.find('[data-testid="rush-timer"]').classes()).not.toContain('is-urgent');

    // Advance 6 seconds -> 14s remaining (urgent threshold <= 15s)
    await vi.advanceTimersByTimeAsync(6000);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="rush-timer"]').text()).toContain('0:14');
    expect(wrapper.find('[data-testid="rush-timer"]').classes()).toContain('is-urgent');

    // Advance remaining 14 seconds -> time expires
    await vi.advanceTimersByTimeAsync(14000);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="rush-game-over"]').exists()).toBe(true);
    expect(wrapper.find('.game-over-title').text()).toContain('Time is up');
  });

  it('executes solves, increases score, grants +5s bonus, and shows notification', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleRushArena, {
      props: {
        subMode: 'puzzle_rush',
        customStore: store,
        initialDurationSeconds: 60,
      },
    });

    const initialTime = wrapper.vm.rush.timeRemainingSeconds.value;

    // Simulate solve
    await wrapper.vm.rush.handleRunnerSolved();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="rush-score-badge"]').text()).toContain('1');
    // +5s bonus granted
    expect(wrapper.vm.rush.timeRemainingSeconds.value).toBe(initialTime + 5);

    // Time bonus notification is shown
    expect(wrapper.find('[data-testid="time-bonus-notification"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="time-bonus-notification"]').text()).toContain('+5s');

    // Advance timer past bonus display timeout
    await vi.advanceTimersByTimeAsync(1600);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="time-bonus-notification"]').exists()).toBe(false);
  });

  it('escalates combo multiplier with consecutive solves and resets on strike', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleRushArena, {
      props: {
        subMode: 'puzzle_rush',
        customStore: store,
      },
    });

    // 1st solve -> 1x
    await wrapper.vm.rush.handleRunnerSolved();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="combo-badge"]').text()).toContain('x1');

    // 2nd solve -> 2x
    await wrapper.vm.rush.handleRunnerSolved();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="combo-badge"]').text()).toContain('x2');
    expect(wrapper.find('[data-testid="combo-badge"]').classes()).toContain('has-streak');

    // 3rd, 4th, 5th solve -> 3x
    await wrapper.vm.rush.handleRunnerSolved();
    await wrapper.vm.rush.handleRunnerSolved();
    await wrapper.vm.rush.handleRunnerSolved();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="combo-badge"]').text()).toContain('x3');

    // Mistake / strike -> resets combo to 1x
    wrapper.vm.rush.handleRunnerFailed();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="combo-badge"]').text()).toContain('x1');
    expect(wrapper.find('[data-testid="combo-badge"]').classes()).not.toContain('has-streak');
  });

  it('tracks strikes and ends game when 3 strikes are reached', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleRushArena, {
      props: {
        subMode: 'puzzle_rush',
        customStore: store,
      },
    });

    const strikeIcons = () => wrapper.findAll('.strike-icon');
    expect(strikeIcons().length).toBe(3);
    expect(strikeIcons().filter((s) => s.text().includes('❌')).length).toBe(0);

    // 1st mistake
    wrapper.vm.rush.handleRunnerFailed();
    await wrapper.vm.$nextTick();
    expect(strikeIcons().filter((s) => s.text().includes('❌')).length).toBe(1);
    expect(wrapper.find('[data-testid="rush-game-over"]').exists()).toBe(false);

    // 2nd mistake
    wrapper.vm.rush.handleRunnerFailed();
    await wrapper.vm.$nextTick();
    expect(strikeIcons().filter((s) => s.text().includes('❌')).length).toBe(2);
    expect(wrapper.find('[data-testid="rush-game-over"]').exists()).toBe(false);

    // 3rd mistake -> Game Over
    wrapper.vm.rush.handleRunnerFailed();
    await wrapper.vm.$nextTick();
    expect(strikeIcons().filter((s) => s.text().includes('❌')).length).toBe(3);
    expect(wrapper.find('[data-testid="rush-game-over"]').exists()).toBe(true);
    expect(wrapper.find('.game-over-title').text()).toContain('Run finished');
  });

  it('runs in streak survivor mode without timer and decrements lives on mistakes', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleRushArena, {
      props: {
        subMode: 'streak_survivor',
        customStore: store,
      },
    });

    expect(wrapper.find('.rush-mode-badge').text()).toContain('Streak Survivor');
    // Timer is not shown in streak survivor mode
    expect(wrapper.find('[data-testid="rush-timer"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="strikes-life-row"]').exists()).toBe(true);

    // Solve 2 puzzles
    await wrapper.vm.rush.handleRunnerSolved();
    await wrapper.vm.rush.handleRunnerSolved();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="rush-score-badge"]').text()).toContain('2');

    // 3 strikes -> game over
    wrapper.vm.rush.handleRunnerFailed();
    wrapper.vm.rush.handleRunnerFailed();
    wrapper.vm.rush.handleRunnerFailed();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="rush-game-over"]').exists()).toBe(true);
  });

  it('displays game over stats (score, highest streak, rank achieved) and handles Play Again / Exit', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleRushArena, {
      props: {
        subMode: 'puzzle_rush',
        customStore: store,
      },
    });

    // Score 3 puzzles
    await wrapper.vm.rush.handleRunnerSolved();
    await wrapper.vm.rush.handleRunnerSolved();
    await wrapper.vm.rush.handleRunnerSolved();
    await wrapper.vm.$nextTick();

    // Trigger Game Over via stopRun
    wrapper.vm.rush.stopRun();
    await wrapper.vm.$nextTick();

    const gameOverModal = wrapper.find('[data-testid="rush-game-over"]');
    expect(gameOverModal.exists()).toBe(true);
    expect(wrapper.find('[data-testid="final-score"]').text()).toContain('3 Solved');
    expect(wrapper.find('[data-testid="highest-streak"]').text()).toContain('3');
    expect(wrapper.find('[data-testid="rank-achieved"]').exists()).toBe(true);

    // Test Play Again button
    const restartBtn = wrapper.find('[data-testid="rush-restart-btn"]');
    await restartBtn.trigger('click');
    expect(wrapper.emitted('restart')).toBeTruthy();
    expect(wrapper.vm.rush.score.value).toBe(0);
    expect(wrapper.vm.rush.isGameOver.value).toBe(false);
    expect(wrapper.find('[data-testid="rush-game-over"]').exists()).toBe(false);

    // Trigger game over again and test Exit button
    wrapper.vm.rush.stopRun();
    await wrapper.vm.$nextTick();

    const gameOverExitBtn = wrapper.find('[data-testid="rush-game-over-exit-btn"]');
    await gameOverExitBtn.trigger('click');
    expect(wrapper.emitted('exit')).toBeTruthy();
  });

  it('wires board square select and moves to runner', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleRushArena, {
      props: {
        subMode: 'puzzle_rush',
        customStore: store,
      },
    });

    const board = wrapper.findComponent(PuzzleBoardWrapper);
    expect(board.exists()).toBe(true);
    expect(board.props('interactive')).toBe(true);

    // Board emits select
    await board.vm.$emit('select', 'e2');
    // Board emits move
    await board.vm.$emit('move', { from: 'e2', to: 'e4' });
    // Board emits promotion
    await board.vm.$emit('promotionRequired', { from: 'e7', to: 'e8' });

    expect(wrapper.vm.rush.runner).toBeDefined();
  });

  it('sets dialog attributes and inert on background when game over is active', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const wrapper = mount(PuzzleRushArena, {
      props: {
        subMode: 'puzzle_rush',
        customStore: store,
      },
    });

    const hudBar = wrapper.find('[data-testid="rush-hud-bar"]');
    const boardContainer = wrapper.find('[data-testid="rush-board-container"]');

    expect(hudBar.attributes('aria-hidden')).toBe('false');
    expect(boardContainer.attributes('aria-hidden')).toBe('false');

    // End run -> game over
    wrapper.vm.rush.stopRun();
    await wrapper.vm.$nextTick();

    const gameOverOverlay = wrapper.find('[data-testid="rush-game-over"]');
    expect(gameOverOverlay.exists()).toBe(true);
    expect(gameOverOverlay.attributes('role')).toBe('dialog');
    expect(gameOverOverlay.attributes('aria-modal')).toBe('true');
    expect(gameOverOverlay.attributes('aria-labelledby')).toBe('game-over-title');

    expect(hudBar.attributes('aria-hidden')).toBe('true');
    expect(boardContainer.attributes('aria-hidden')).toBe('true');
  });

  it('does not mutate readonly frozen props during mounting and gameplay lifecycle [MAJ-005]', async () => {
    const store = new InMemoryPuzzleProgressStore();
    const frozenProps = Object.freeze({
      subMode: 'puzzle_rush' as const,
      customStore: store,
      initialDurationSeconds: 120,
      maxStrikes: 3,
    });

    const wrapper = mount(PuzzleRushArena, {
      props: frozenProps,
    });

    expect(wrapper.find('[data-testid="puzzle-rush-arena"]').exists()).toBe(true);
    expect(wrapper.vm.rush.timeRemainingSeconds.value).toBe(120);

    // Perform operations: restart, selection, moves
    await wrapper.vm.handleRestart();
    await wrapper.vm.$nextTick();

    const board = wrapper.findComponent(PuzzleBoardWrapper);
    await board.vm.$emit('select', 'e2');
    await board.vm.$emit('move', { from: 'e2', to: 'e4' });
    await wrapper.vm.$nextTick();

    // Verify frozenProps remains strictly frozen and unmutated
    expect(Object.isFrozen(frozenProps)).toBe(true);
    expect(frozenProps.subMode).toBe('puzzle_rush');
    expect(frozenProps.initialDurationSeconds).toBe(120);
    expect(frozenProps.maxStrikes).toBe(3);
  });
});



