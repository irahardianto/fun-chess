<script setup lang="ts">
import { computed } from 'vue';
import type {
  RoomState,
  Player,
  AppGameMode,
  SoloAiLaunchConfig,
  ChessScenario,
  PuzzleTheme,
  LanInfoResponse,
  Square,
  PieceType,
  MoveResult,
} from '@fun-chess/shared';
import { LobbyView } from '@/features/lobby';
import { SoloAiArena } from '@/features/ai';
import { ScenarioArena } from '@/features/scenarios';
import { PuzzleArena, PuzzleRushArena } from '@/features/puzzles';
import { MultiplayerArena } from '@/features/multiplayer';

interface Props {
  currentAppMode?: AppGameMode | 'puzzle_drills' | 'puzzle_ladder' | 'puzzle_rush' | string;
  currentMode?: AppGameMode | 'puzzle_drills' | 'puzzle_ladder' | 'puzzle_rush' | string;
  lobbyActiveMode?: AppGameMode;
  currentRoom?: RoomState | null;
  currentPlayer?: Player | null;
  opponentPlayer?: Player | null;
  soloAiConfig?: SoloAiLaunchConfig | null;
  activeScenario?: ChessScenario | null;
  puzzleSubMode?: 'hub' | 'themed_drills' | 'adaptive_ladder' | 'puzzle_rush' | 'streak_survivor';
  puzzleDrillTheme?: PuzzleTheme;
  initialRoomCode?: string;
  lanInfo?: LanInfoResponse | null;
  isActionLoading?: boolean;
  socketId?: string | null;
  isConnected?: boolean;
  fen?: string;
  turn?: 'w' | 'b';
  orientation?: 'w' | 'b';
  myColor?: 'w' | 'b' | null;
  isMyTurn?: boolean;
  selectedSquare?: Square | null;
  legalMoves?: Square[];
  lastMove?: { from: string; to: string } | null;
  kingInCheckSquare?: Square | null;
  capturedWhite?: PieceType[];
  capturedBlack?: PieceType[];
  materialAdvantage?: { white: number; black: number };
  moveHistory?: MoveResult[];
  myPlayerAvatar?: string;
  drawOfferedBy?: { fromPlayerId: string; fromPlayerName: string } | null;
}

const props = withDefaults(defineProps<Props>(), {
  currentAppMode: 'lobby',
  currentMode: undefined,
  lobbyActiveMode: 'multiplayer_lan',
  currentRoom: null,
  currentPlayer: null,
  opponentPlayer: null,
  soloAiConfig: null,
  activeScenario: null,
  puzzleSubMode: 'hub',
  puzzleDrillTheme: 'fork',
  initialRoomCode: '',
  lanInfo: null,
  isActionLoading: false,
  socketId: null,
  isConnected: true,
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  turn: 'w',
  orientation: 'w',
  myColor: null,
  isMyTurn: false,
  selectedSquare: null,
  legalMoves: () => [],
  lastMove: null,
  kingInCheckSquare: null,
  capturedWhite: () => [],
  capturedBlack: () => [],
  materialAdvantage: () => ({ white: 0, black: 0 }),
  moveHistory: () => [],
  myPlayerAvatar: '🦁',
  drawOfferedBy: null,
});

const emit = defineEmits<{
  'update:currentAppMode': [mode: AppGameMode]; 'update:currentMode': [mode: AppGameMode];
  'mode-change': [mode: AppGameMode]; modeChange: [mode: AppGameMode];
  host: [payload: { playerName: string; preferredColor: 'w' | 'b' | 'random'; avatar?: string }];
  join: [payload: { roomCode: string; playerName: string; avatar?: string }];
  'create-room': [payload: { playerName: string; avatar: string; preferredColor: 'w' | 'b' | 'random' }];
  createRoom: [payload: { playerName: string; avatar: string; preferredColor: 'w' | 'b' | 'random' }];
  'join-room': [payload: { roomCode: string; playerName: string; avatar: string }];
  joinRoom: [payload: { roomCode: string; playerName: string; avatar: string }];
  'start-solo-ai': [config: SoloAiLaunchConfig]; startSoloAi: [config: SoloAiLaunchConfig];
  'select-scenario': [scenario: ChessScenario]; selectScenario: [scenario: ChessScenario];
  'launch-drills': [theme?: PuzzleTheme]; launchDrills: [theme?: PuzzleTheme];
  'launch-ladder': []; launchLadder: [];
  'launch-rush': [subMode?: 'puzzle_rush' | 'streak_survivor']; launchRush: [subMode?: 'puzzle_rush' | 'streak_survivor'];
  'open-sync': []; openSync: [];
  'solo-ai-exit': []; 'exit-solo-ai': []; exit: [];
  'solo-ai-change-opponent': []; 'change-opponent': [];
  'academy-back': []; back: [];
  'academy-next-lesson': [scenario: ChessScenario]; 'next-lesson': [scenario: ChessScenario];
  'academy-completed': [stars: number]; completed: [stars: number];
  'puzzle-back': []; 'puzzle-exit': []; 'puzzle-completed': [stars: number]; 'puzzle-rush-exit': [];
  'select-square': [sq: Square]; selectSquare: [sq: Square];
  'execute-move': [move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }];
  executeMove: [move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }];
  'promotion-required': [payload: { from: Square; to: Square }];
  promotionRequired: [payload: { from: Square; to: Square }];
  'offer-draw': []; offerDraw: []; 'accept-draw': []; acceptDraw: [];
  'decline-draw': []; declineDraw: []; resign: []; 'flip-board': []; flipBoard: [];
  notify: [payload: { message: string; type: 'error' | 'info' | 'success'; durationMs?: number }];
}>();

const resolvedMode = computed<string>(() => (props.currentMode || props.currentAppMode || 'lobby') as string);

const resolvedPuzzleArenaMode = computed<'themed_drills' | 'adaptive_ladder'>(() => {
  if (resolvedMode.value === 'puzzle_ladder' || props.puzzleSubMode === 'adaptive_ladder') {
    return 'adaptive_ladder';
  }
  return 'themed_drills';
});

const resolvedPuzzleRushSubMode = computed<'puzzle_rush' | 'streak_survivor'>(() => {
  if (props.puzzleSubMode === 'streak_survivor') {
    return 'streak_survivor';
  }
  return 'puzzle_rush';
});

function handleModeChange(mode: AppGameMode) { emit('mode-change', mode); emit('modeChange', mode); }
function handleHost(payload: { playerName: string; preferredColor: 'w' | 'b' | 'random'; avatar?: string }) { emit('host', payload); }
function handleJoin(payload: { roomCode: string; playerName: string; avatar?: string }) { emit('join', payload); }
function handleCreateRoom(payload: { playerName: string; avatar: string; preferredColor: 'w' | 'b' | 'random' }) { emit('create-room', payload); emit('createRoom', payload); }
function handleJoinRoom(payload: { roomCode: string; playerName: string; avatar: string }) { emit('join-room', payload); emit('joinRoom', payload); }
function handleStartSoloAi(config: SoloAiLaunchConfig) { emit('start-solo-ai', config); emit('startSoloAi', config); }
function handleSelectScenario(scenario: ChessScenario) { emit('select-scenario', scenario); emit('selectScenario', scenario); }
function handleLaunchDrills(theme?: PuzzleTheme) { emit('launch-drills', theme); emit('launchDrills', theme); }
function handleLaunchLadder() { emit('launch-ladder'); emit('launchLadder'); }
function handleLaunchRush(subMode?: 'puzzle_rush' | 'streak_survivor') { emit('launch-rush', subMode); emit('launchRush', subMode); }
function handleOpenSync() { emit('open-sync'); emit('openSync'); }
function handleSoloAiExit() { emit('solo-ai-exit'); emit('exit-solo-ai'); emit('exit'); }
function handleSoloAiChangeOpponent() { emit('solo-ai-change-opponent'); emit('change-opponent'); }
function handleAcademyBack() { emit('academy-back'); emit('back'); }
function handleAcademyNextLesson(scenario: ChessScenario) { emit('academy-next-lesson', scenario); emit('next-lesson', scenario); }
function handleAcademyCompleted(stars: number) { emit('academy-completed', stars); emit('completed', stars); }
function handlePuzzleBack() { emit('puzzle-back'); emit('puzzle-exit'); emit('back'); emit('exit'); }
function handlePuzzleRushExit() { emit('puzzle-rush-exit'); emit('exit'); }
function handlePuzzleCompleted(stars: number) { emit('puzzle-completed', stars); emit('completed', stars); emit('academy-completed', stars); }
function handleSelectSquare(sq: Square) { emit('select-square', sq); }
function handleExecuteMove(move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }) { emit('execute-move', move); }
function handlePromotionRequired(payload: { from: Square; to: Square }) { emit('promotion-required', payload); }
function handleOfferDraw() { emit('offer-draw'); }
function handleAcceptDraw() { emit('accept-draw'); }
function handleDeclineDraw() { emit('decline-draw'); }
function handleResign() { emit('resign'); }
function handleFlipBoard() { emit('flip-board'); }
</script>

<template>
  <div class="app-view-router" data-testid="app-view-router">
    <SoloAiArena
      v-if="resolvedMode === 'solo_ai' && soloAiConfig"
      :initial-mascot-id="soloAiConfig.mascotId"
      :initial-player-color="soloAiConfig.playerColor"
      :player-name="soloAiConfig.playerName"
      :player-avatar="soloAiConfig.playerAvatar"
      @exit="handleSoloAiExit"
      @lobby="handleSoloAiExit"
      @change-opponent="handleSoloAiChangeOpponent"
    />

    <ScenarioArena
      v-else-if="resolvedMode === 'academy' && activeScenario"
      :scenario="activeScenario"
      @back="handleAcademyBack"
      @next-lesson="handleAcademyNextLesson"
      @completed="handleAcademyCompleted"
    />

    <PuzzleArena
      v-else-if="
        resolvedMode === 'puzzle_drills' ||
        resolvedMode === 'puzzle_ladder' ||
        (resolvedMode === 'puzzle_hub' &&
          (puzzleSubMode === 'themed_drills' || puzzleSubMode === 'adaptive_ladder'))
      "
      :mode="resolvedPuzzleArenaMode"
      :initial-theme="puzzleDrillTheme"
      @back="handlePuzzleBack"
      @exit="handlePuzzleBack"
      @completed="handlePuzzleCompleted"
    />

    <PuzzleRushArena
      v-else-if="
        resolvedMode === 'puzzle_rush' ||
        (resolvedMode === 'puzzle_hub' &&
          (puzzleSubMode === 'puzzle_rush' || puzzleSubMode === 'streak_survivor'))
      "
      :sub-mode="resolvedPuzzleRushSubMode"
      :mode="resolvedPuzzleRushSubMode"
      @exit="handlePuzzleRushExit"
      @lobby="handlePuzzleRushExit"
    />

    <MultiplayerArena
      v-else-if="currentRoom && currentRoom.status !== 'lobby'"
      :current-room="currentRoom"
      :current-player="currentPlayer"
      :opponent-player="opponentPlayer"
      :socket-id="socketId"
      :is-connected="isConnected"
      :fen="fen"
      :turn="turn"
      :orientation="orientation"
      :my-color="myColor"
      :is-my-turn="isMyTurn"
      :selected-square="selectedSquare"
      :legal-moves="legalMoves"
      :last-move="lastMove"
      :king-in-check-square="kingInCheckSquare"
      :captured-white="capturedWhite"
      :captured-black="capturedBlack"
      :material-advantage="materialAdvantage"
      :move-history="moveHistory"
      :my-player-avatar="myPlayerAvatar"
      :draw-offered_by="drawOfferedBy"
      :draw-offered-by="drawOfferedBy"
      @select-square="handleSelectSquare"
      @execute-move="handleExecuteMove"
      @promotion-required="handlePromotionRequired"
      @accept-draw="handleAcceptDraw"
      @decline-draw="handleDeclineDraw"
      @offer-draw="handleOfferDraw"
      @resign="handleResign"
      @flip-board="handleFlipBoard"
    />

    <LobbyView
      v-else
      :initial-room-code="initialRoomCode"
      :lan-info="lanInfo"
      :loading="isActionLoading"
      :initial-mode="lobbyActiveMode"
      @mode-change="handleModeChange"
      @host="handleHost"
      @join="handleJoin"
      @create-room="handleCreateRoom"
      @createRoom="handleCreateRoom"
      @join-room="handleJoinRoom"
      @joinRoom="handleJoinRoom"
      @start-solo-ai="handleStartSoloAi"
      @select-scenario="handleSelectScenario"
      @launch-drills="handleLaunchDrills"
      @launch-ladder="handleLaunchLadder"
      @launch-rush="handleLaunchRush"
      @open-sync="handleOpenSync"
      @openSync="handleOpenSync"
    />
  </div>
</template>

<style scoped>
.app-view-router {
  width: 100%;
  display: contents;
}
</style>
