import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ScenarioCard from '../ScenarioCard.vue';
import type { ChessScenario, ScenarioProgress } from '@fun-chess/shared';

describe('ScenarioCard.vue', () => {
  const mockScenario: ChessScenario = {
    id: 'pawn-journey',
    title: 'The Pawn Journey',
    subtitle: 'Learn how pawns advance, capture diagonally, and promote!',
    category: 'fundamentals',
    difficulty: 'beginner',
    targetAgeGroup: '7-10',
    icon: '♟️',
    description: 'A complete introduction to the mighty pawn.',
    estimatedMinutes: 3,
    steps: [
      {
        id: 'pawn-step-1',
        stepNumber: 1,
        instruction: 'Advance pawn two squares to e4',
        hint: 'Push e2 to e4',
        setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        explanationOnSuccess: 'Great opening pawn move!',
      },
    ],
  };

  it('renders scenario title, subtitle, icon, step count, and estimated time', () => {
    const wrapper = mount(ScenarioCard, {
      props: {
        scenario: mockScenario,
      },
    });

    expect(wrapper.text()).toContain('The Pawn Journey');
    expect(wrapper.text()).toContain('Learn how pawns advance');
    expect(wrapper.text()).toContain('♟️');
    expect(wrapper.text()).toContain('1 Step');
    expect(wrapper.text()).toContain('3m');
    expect(wrapper.text()).toContain('Beginner');
  });

  it('renders difficulty pill with corresponding CSS class', () => {
    const wrapper = mount(ScenarioCard, {
      props: {
        scenario: mockScenario,
      },
    });

    const pill = wrapper.find('.difficulty-pill');
    expect(pill.exists()).toBe(true);
    expect(pill.classes()).toContain('diff-pill--beginner');
    expect(pill.text()).toBe('Beginner');
  });

  it('renders empty star rating when no progress is provided', () => {
    const wrapper = mount(ScenarioCard, {
      props: {
        scenario: mockScenario,
      },
    });

    const stars = wrapper.findAll('.star-icon');
    expect(stars.length).toBe(3);
    stars.forEach((star) => {
      expect(star.classes()).not.toContain('is-filled');
    });

    const playBtn = wrapper.find('.scenario-play-btn');
    expect(playBtn.text()).toContain('Play');
  });

  it('renders 2 filled stars and Replay button when progress has 2 stars', () => {
    const progress: ScenarioProgress = {
      scenarioId: 'pawn-journey',
      starsEarned: 2,
      attemptsCount: 1,
      hintsUsedTotal: 1,
      firstCompletedAt: Date.now(),
      lastCompletedAt: Date.now(),
    };

    const wrapper = mount(ScenarioCard, {
      props: {
        scenario: mockScenario,
        progress,
      },
    });

    const stars = wrapper.findAll('.star-icon');
    expect(stars[0]?.classes()).toContain('is-filled');
    expect(stars[1]?.classes()).toContain('is-filled');
    expect(stars[2]?.classes()).not.toContain('is-filled');

    const playBtn = wrapper.find('.scenario-play-btn');
    expect(playBtn.text()).toContain('Replay');
  });

  it('renders 3 filled stars when progress has 3 stars', () => {
    const progress: ScenarioProgress = {
      scenarioId: 'pawn-journey',
      starsEarned: 3,
      attemptsCount: 2,
      hintsUsedTotal: 0,
      firstCompletedAt: Date.now(),
      lastCompletedAt: Date.now(),
    };

    const wrapper = mount(ScenarioCard, {
      props: {
        scenario: mockScenario,
        progress,
      },
    });

    const stars = wrapper.findAll('.star-icon');
    stars.forEach((star) => {
      expect(star.classes()).toContain('is-filled');
    });
  });

  it('emits "play" event with scenario payload when play button is clicked', async () => {
    const wrapper = mount(ScenarioCard, {
      props: {
        scenario: mockScenario,
      },
    });

    const playBtn = wrapper.find('.scenario-play-btn');
    await playBtn.trigger('click');

    expect(wrapper.emitted('play')).toBeTruthy();
    expect(wrapper.emitted('play')?.[0]).toEqual([mockScenario]);
  });

  it('enforces 44px minimum touch target styling on play button', () => {
    const wrapper = mount(ScenarioCard, {
      props: {
        scenario: mockScenario,
      },
    });

    const playBtn = wrapper.find('.scenario-play-btn');
    expect(playBtn.exists()).toBe(true);
    expect(playBtn.classes()).toContain('scenario-play-btn');
  });
});
