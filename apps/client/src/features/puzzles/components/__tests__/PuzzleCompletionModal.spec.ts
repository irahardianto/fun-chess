import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PuzzleCompletionModal from '../PuzzleCompletionModal.vue';
import type { Puzzle, PuzzleAnalysisResult } from '@fun-chess/shared';

// Mock confetti to avoid web canvas / DOM dependencies
vi.mock('../../../composables/useConfetti', () => ({
  useConfetti: () => ({
    celebrate: vi.fn(),
  }),
}));

const mockForkPuzzle: Puzzle = {
  id: 'puz_fork_test',
  fen: 'r3k2r/ppp2ppp/2n1pn2/3p4/3P4/2N2N2/PPP2PPP/R1BQK2R w KQkq - 0 1',
  moves: ['c3b5', 'e8d8', 'b5c7'],
  rating: 750,
  ratingDeviation: 80,
  themes: ['fork', 'captures_checks_threats'],
  primaryTheme: 'fork',
  difficulty: 'novice',
  title: 'Royal Knight Fork on c7 ♞',
  subtitle: 'Jump to b5 and attack c7!',
  playerColor: 'w',
  solutionPlies: 3,
  tacticalGoal: 'Fork King and Rook on c7 to win decisive material!',
  tacticalReward: 'win_rook',
  outcomeAdvantage: '+5 Rook ♜',
  learningSummary: '1. Nb5 threatened c7. 2. Nxc7+ forked King and Rook, winning the undefended Rook cleanly!',
  keyTakeaway: 'Knights make the best forkers because they can leap over defenders!',
  stepExplanations: [
    { plyIndex: 0, moveSan: 'Nb5', moveUci: 'c3b5', actor: 'w', explanation: 'Knight jumps to b5 attacking c7.' },
    { plyIndex: 1, moveSan: 'Kd8', moveUci: 'e8d8', actor: 'b', explanation: 'King steps to d8 to defend.' },
    { plyIndex: 2, moveSan: 'Nxc7+', moveUci: 'b5c7', actor: 'w', explanation: 'Knight forks King and Rook!' },
  ],
};

const mockMatePuzzle: Puzzle = {
  id: 'puz_mate_test',
  fen: '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1',
  moves: ['e1e8'],
  rating: 650,
  ratingDeviation: 90,
  themes: ['back_rank_mate'],
  primaryTheme: 'back_rank_mate',
  difficulty: 'novice',
  title: 'Back-Rank Mate in 1 👑',
  subtitle: 'Rook slides to e8!',
  playerColor: 'w',
  solutionPlies: 1,
  tacticalGoal: 'Deliver back-rank checkmate on e8!',
  tacticalReward: 'checkmate',
  outcomeAdvantage: 'Checkmate 👑',
  learningSummary: '1. Re8# trapped the King behind its own defending pawns for checkmate!',
  keyTakeaway: 'Watch out for trapped Kings on the back rank when pawns block their escape!',
  stepExplanations: [
    { plyIndex: 0, moveSan: 'Re8#', moveUci: 'e1e8', actor: 'w', explanation: 'Rook delivers back-rank mate.' },
  ],
};

const mockAnalysisResult: PuzzleAnalysisResult = {
  initialMaterial: { white: 39, black: 39, net: 0 },
  finalMaterial: { white: 39, black: 34, net: 5 },
  materialDeltaCentipawns: 500,
  netPointsDelta: 5,
  advantageSummary: {
    pieceType: 'r',
    netCentipawns: 500,
    netPoints: 5,
    formattedAdvantage: '+5 Rook ♜',
    isDecisive: true,
  },
  detectedTheme: 'fork',
  isCheckmate: false,
  isPawnPromotion: false,
  tacticalHeadline: 'Royal Knight Fork on c7!',
  kidFriendlyExplanation: 'Your Knight leaped to c7, creating a double attack on King and Rook!',
  ruleOfThumb: 'Knights are the only pieces that can jump over other pieces to deliver surprise forks!',
  stepNarratives: [
    { plyIndex: 0, moveSan: 'Nb5', moveUci: 'c3b5', actor: 'w', explanation: 'White plays Nb5.' },
    { plyIndex: 1, moveSan: 'Kd8', moveUci: 'e8d8', actor: 'b', explanation: 'Black plays Kd8.' },
    { plyIndex: 2, moveSan: 'Nxc7+', moveUci: 'b5c7', actor: 'w', explanation: 'White forks on c7.' },
  ],
};

describe('PuzzleCompletionModal.vue Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('3-Star Celebration Banner & Praise', () => {
    it('renders 3 filled stars and Flawless Masterpiece praise for 3 stars', () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
          result: 'solved_first_try',
          ratingDelta: 14,
          solveTimeSeconds: 12,
          hintsUsed: 0,
          mistakesCount: 0,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      expect(wrapper.find('[data-testid="puzzle-completion-modal"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('Flawless Masterpiece! 🌟');
      expect(wrapper.text()).toContain('(3 / 3 Stars Earned!)');

      const filledStars = wrapper.findAll('.star-item.is-earned');
      expect(filledStars).toHaveLength(3);
      expect(wrapper.find('.star-center').classes()).toContain('is-earned');
    });

    it('renders 2 filled stars and Super Tactical Solve praise for 2 stars', () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 2,
          result: 'solved_with_hints',
          ratingDelta: 8,
          solveTimeSeconds: 25,
          hintsUsed: 1,
          mistakesCount: 0,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      expect(wrapper.text()).toContain('Super Tactical Solve! 🎯');
      expect(wrapper.text()).toContain('(2 / 3 Stars Earned!)');
      const earnedStars = wrapper.findAll('.star-item.is-earned');
      expect(earnedStars).toHaveLength(2);
    });

    it('renders 1 filled star and Puzzle Completed praise for 1 star', () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 1,
          result: 'solved_with_retries',
          ratingDelta: 4,
          solveTimeSeconds: 45,
          hintsUsed: 2,
          mistakesCount: 2,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      expect(wrapper.text()).toContain('Puzzle Completed! 👏');
      expect(wrapper.text()).toContain('(1 / 3 Stars Earned!)');
      const earnedStars = wrapper.findAll('.star-item.is-earned');
      expect(earnedStars).toHaveLength(1);
    });

    it('renders solve metrics grid correctly (Elo Points, Solve Time, Hints, Accuracy)', () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
          ratingDelta: 16,
          solveTimeSeconds: 15,
          hintsUsed: 0,
          mistakesCount: 0,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      expect(wrapper.text()).toContain('+16 Elo Points');
      expect(wrapper.text()).toContain('15s');
      expect(wrapper.text()).toContain('Hints');
      expect(wrapper.text()).toContain('100%');
    });
  });

  describe('Motif Badge and Material Gain Pill Rendering', () => {
    it('renders motif badge and +5 Rook material gain pill for fork puzzle', () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      const header = wrapper.find('[data-testid="tactical-outcome-header"]');
      expect(header.exists()).toBe(true);

      const motifBadge = wrapper.find('[data-testid="motif-outcome-badge"]');
      expect(motifBadge.exists()).toBe(true);
      expect(motifBadge.classes()).toContain('badge--fork');
      expect(motifBadge.text()).toContain('Royal Fork');
      expect(motifBadge.find('.motif-badge-icon').text()).toBe('🍴');

      const materialPill = wrapper.find('[data-testid="material-gain-pill"]');
      expect(materialPill.exists()).toBe(true);
      expect(materialPill.classes()).toContain('pill--rook');
      expect(materialPill.text()).toContain('+5 Rook ♜');
    });

    it('renders checkmate motif badge and Checkmate 👑 advantage pill for mate puzzle', () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockMatePuzzle,
          stars: 3,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      const motifBadge = wrapper.find('[data-testid="motif-outcome-badge"]');
      expect(motifBadge.classes()).toContain('badge--mate');
      expect(motifBadge.text()).toContain('Checkmate Pattern');

      const materialPill = wrapper.find('[data-testid="material-gain-pill"]');
      expect(materialPill.classes()).toContain('pill--mate');
      expect(materialPill.text()).toContain('Checkmate 👑');
    });

    it('derives motif and advantage from analysis prop when puzzle is null', () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: null,
          analysis: mockAnalysisResult,
          stars: 3,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      const motifBadge = wrapper.find('[data-testid="motif-outcome-badge"]');
      expect(motifBadge.text()).toContain('Royal Fork');

      const materialPill = wrapper.find('[data-testid="material-gain-pill"]');
      expect(materialPill.text()).toContain('+5 Rook ♜');
    });
  });

  describe("Coach's Tactical Breakdown and Mascot Takeaway Rule", () => {
    it('renders coach tactical breakdown card with learningSummary from puzzle', () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      const coachCard = wrapper.find('[data-testid="coach-breakdown-card"]');
      expect(coachCard.exists()).toBe(true);
      expect(coachCard.find('.breakdown-card-title').text()).toContain("Coach's Tactical Breakdown");

      const explanation = wrapper.find('[data-testid="coach-explanation-text"]');
      expect(explanation.text()).toContain('1. Nb5 threatened c7');
      expect(explanation.text()).toContain('winning the undefended Rook cleanly!');
    });

    it('renders mascot takeaway bubble with Sparky rule of thumb from puzzle', () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      const mascotBox = wrapper.find('[data-testid="mascot-coaching-box"]');
      expect(mascotBox.exists()).toBe(true);
      expect(mascotBox.find('.mascot-speaker-name').text()).toContain("Sparky's Takeaway Rule");
      expect(mascotBox.find('[data-testid="mascot-takeaway-text"]').text()).toContain(
        'Knights make the best forkers because they can leap over defenders!'
      );
    });

    it('falls back to analysis.kidFriendlyExplanation and ruleOfThumb when puzzle fields are absent', () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: null,
          analysis: mockAnalysisResult,
          stars: 3,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      expect(wrapper.find('[data-testid="coach-explanation-text"]').text()).toBe(
        mockAnalysisResult.kidFriendlyExplanation
      );
      expect(wrapper.find('[data-testid="mascot-takeaway-text"]').text()).toContain(
        mockAnalysisResult.ruleOfThumb
      );
    });
  });

  describe('"Inspect Board" / Minimize Toggle Interaction', () => {
    it('renders "Inspect Board" button in modal footer', () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      const inspectBtn = wrapper.find('[data-testid="inspect-board-btn"]');
      expect(inspectBtn.exists()).toBe(true);
      expect(inspectBtn.text()).toContain('Inspect Board');
    });

    it('toggles into docked minimized inspection bar when Inspect Board button is clicked', async () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      // Initially full modal is visible, docked bar is not
      expect(wrapper.find('[data-testid="puzzle-completion-modal"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="docked-inspect-bar"]').exists()).toBe(false);

      // Click Inspect Board
      const inspectBtn = wrapper.find('[data-testid="inspect-board-btn"]');
      await inspectBtn.trigger('click');

      // Modal closes, docked bar appears
      expect(wrapper.find('[data-testid="docked-inspect-bar"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="docked-motif-title"]').text()).toContain('Royal Fork');
      expect(wrapper.emitted('inspect-board')).toEqual([[true]]);
      expect(wrapper.emitted('update:minimized')).toEqual([[true]]);
    });

    it('restores full modal view when "Coach Report" button in docked bar is clicked', async () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
          initialMinimized: true,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      expect(wrapper.find('[data-testid="docked-inspect-bar"]').exists()).toBe(true);

      const expandBtn = wrapper.find('[data-testid="expand-modal-btn"]');
      expect(expandBtn.exists()).toBe(true);
      await expandBtn.trigger('click');

      expect(wrapper.find('[data-testid="puzzle-completion-modal"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="docked-inspect-bar"]').exists()).toBe(false);
      expect(wrapper.emitted('inspect-board')).toEqual([[false]]);
      expect(wrapper.emitted('update:minimized')).toEqual([[false]]);
    });
  });

  describe('Move Replay Controller & Ply Stepping Interactions', () => {
    it('renders replay controller with correct total plies and step counter', () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      const controller = wrapper.find('[data-testid="move-replay-controller"]');
      expect(controller.exists()).toBe(true);

      const counter = wrapper.find('[data-testid="replay-step-counter"]');
      expect(counter.text()).toBe('Step 3 of 3');

      const sanBadge = wrapper.find('[data-testid="replay-step-san"]');
      expect(sanBadge.text()).toBe('Nxc7+');

      // Step Explanation in Replay UI
      const explanation = wrapper.find('[data-testid="replay-step-explanation"]');
      expect(explanation.exists()).toBe(true);
      expect(explanation.text()).toContain('Knight forks King and Rook!');
    });

    it('handles jump-to-start [⏮] and disables prev buttons on step 0 (Initial Position)', async () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      const startBtn = wrapper.find('[data-testid="replay-start-btn"]');
      const prevBtn = wrapper.find('[data-testid="replay-prev-btn"]');
      const nextBtn = wrapper.find('[data-testid="replay-next-btn"]');
      const endBtn = wrapper.find('[data-testid="replay-end-btn"]');

      // Initially at final step (step 3 of 3)
      expect((nextBtn.element as HTMLButtonElement).disabled).toBe(true);
      expect((endBtn.element as HTMLButtonElement).disabled).toBe(true);
      expect((prevBtn.element as HTMLButtonElement).disabled).toBe(false);

      // Jump to start (step 0)
      await startBtn.trigger('click');

      expect(wrapper.emitted('replay-step')).toEqual([[0]]);
      expect(wrapper.find('[data-testid="replay-step-counter"]').text()).toBe('Initial Position');
      expect(wrapper.find('[data-testid="replay-step-san"]').text()).toBe('Start');
      expect(wrapper.find('[data-testid="replay-step-explanation"]').text()).toContain('Initial puzzle setup position');

      // Now prev and start should be disabled
      expect((startBtn.element as HTMLButtonElement).disabled).toBe(true);
      expect((prevBtn.element as HTMLButtonElement).disabled).toBe(true);
      expect((nextBtn.element as HTMLButtonElement).disabled).toBe(false);
      expect((endBtn.element as HTMLButtonElement).disabled).toBe(false);
    });

    it('steps forward [▶] and backward [◀] through steps 0..N emitting replay-step', async () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      const startBtn = wrapper.find('[data-testid="replay-start-btn"]');
      const prevBtn = wrapper.find('[data-testid="replay-prev-btn"]');
      const nextBtn = wrapper.find('[data-testid="replay-next-btn"]');
      const endBtn = wrapper.find('[data-testid="replay-end-btn"]');

      // Go to step 0
      await startBtn.trigger('click');
      expect(wrapper.find('[data-testid="replay-step-counter"]').text()).toBe('Initial Position');

      // Step forward to step 1
      await nextBtn.trigger('click');
      expect(wrapper.emitted('replay-step')).toContainEqual([1]);
      expect(wrapper.find('[data-testid="replay-step-counter"]').text()).toBe('Step 1 of 3');
      expect(wrapper.find('[data-testid="replay-step-san"]').text()).toBe('Nb5');
      expect(wrapper.find('[data-testid="replay-step-explanation"]').text()).toContain('Knight jumps to b5');

      // Step forward to step 2
      await nextBtn.trigger('click');
      expect(wrapper.emitted('replay-step')).toContainEqual([2]);
      expect(wrapper.find('[data-testid="replay-step-counter"]').text()).toBe('Step 2 of 3');
      expect(wrapper.find('[data-testid="replay-step-san"]').text()).toBe('Kd8');

      // Step forward to step 3 (final winning position)
      await nextBtn.trigger('click');
      expect(wrapper.emitted('replay-step')).toContainEqual([3]);
      expect(wrapper.find('[data-testid="replay-step-counter"]').text()).toBe('Step 3 of 3');
      expect(wrapper.find('[data-testid="replay-step-san"]').text()).toBe('Nxc7+');
      expect((nextBtn.element as HTMLButtonElement).disabled).toBe(true);

      // Step backward to step 2
      await prevBtn.trigger('click');
      expect(wrapper.emitted('replay-step')).toContainEqual([2]);
      expect(wrapper.find('[data-testid="replay-step-counter"]').text()).toBe('Step 2 of 3');

      // Jump to end (step 3)
      await endBtn.trigger('click');
      expect(wrapper.emitted('replay-step')).toContainEqual([3]);
      expect(wrapper.find('[data-testid="replay-step-counter"]').text()).toBe('Step 3 of 3');
    });

    it('supports replay controls and step explanations inside the minimized docked inspection bar', async () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
          initialMinimized: true,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      const dockedBar = wrapper.find('[data-testid="docked-inspect-bar"]');
      expect(dockedBar.exists()).toBe(true);

      const dockedStartBtn = wrapper.find('[data-testid="docked-replay-start-btn"]');
      const dockedPrevBtn = wrapper.find('[data-testid="docked-replay-prev-btn"]');
      const dockedNextBtn = wrapper.find('[data-testid="docked-replay-next-btn"]');

      expect(wrapper.find('[data-testid="docked-step-counter"]').text()).toBe('3/3');
      expect(wrapper.find('[data-testid="docked-step-explanation"]').text()).toContain('Knight forks King and Rook!');

      await dockedStartBtn.trigger('click');
      expect(wrapper.emitted('replay-step')).toEqual([[0]]);
      expect(wrapper.find('[data-testid="docked-step-counter"]').text()).toBe('Start (0/3)');
      expect(wrapper.find('[data-testid="docked-step-explanation"]').text()).toContain('Initial puzzle setup position');

      await dockedNextBtn.trigger('click');
      expect(wrapper.emitted('replay-step')).toContainEqual([1]);
      expect(wrapper.find('[data-testid="docked-step-counter"]').text()).toBe('1/3');
      expect(wrapper.find('[data-testid="docked-step-explanation"]').text()).toContain('Nb5: Knight jumps to b5');

      await dockedPrevBtn.trigger('click');
      expect(wrapper.emitted('replay-step')).toContainEqual([0]);
      expect(wrapper.find('[data-testid="docked-step-counter"]').text()).toBe('Start (0/3)');
    });
  });

  describe('Modal Action Buttons & Navigation Events', () => {
    it('emits next and nextPuzzle when Next Puzzle button is clicked', async () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
          hasNextPuzzle: true,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      const nextBtn = wrapper.find('[data-testid="puzzle-next-btn"]');
      await nextBtn.trigger('click');

      expect(wrapper.emitted('next')).toHaveLength(1);
      expect(wrapper.emitted('nextPuzzle')).toHaveLength(1);
    });

    it('emits replay and retry when Replay button is clicked', async () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      const replayBtn = wrapper.find('[data-testid="puzzle-retry-btn"]');
      await replayBtn.trigger('click');

      expect(wrapper.emitted('replay')).toHaveLength(1);
      expect(wrapper.emitted('retry')).toHaveLength(1);
    });

    it('renders Back to Hub button when hasNextPuzzle is false and emits backToHub', async () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
          hasNextPuzzle: false,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      expect(wrapper.find('[data-testid="puzzle-next-btn"]').exists()).toBe(false);
      const hubBtn = wrapper.find('[data-testid="puzzle-hub-btn"]');
      expect(hubBtn.exists()).toBe(true);

      await hubBtn.trigger('click');
      expect(wrapper.emitted('backToHub')).toHaveLength(1);
    });

    it('emits next from docked bar Next button', async () => {
      const wrapper = mount(PuzzleCompletionModal, {
        props: {
          modelValue: true,
          puzzle: mockForkPuzzle,
          stars: 3,
          initialMinimized: true,
          hasNextPuzzle: true,
        },
        global: {
          stubs: { teleport: true },
        },
      });

      const dockedNextBtn = wrapper.find('[data-testid="docked-next-btn"]');
      await dockedNextBtn.trigger('click');

      expect(wrapper.emitted('next')).toHaveLength(1);
      expect(wrapper.emitted('nextPuzzle')).toHaveLength(1);
    });
  });
});

