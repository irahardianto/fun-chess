<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import type {
  RoomState,
  GameOverPayload,
  PieceColor,
  Square,
  LanInfoResponse,
  UnifiedProgressPayload,
  ProgressDiffPreview,
} from '@fun-chess/shared';
import { QrCodeModal } from '@/features/lobby';
import { PromotionModal, GameOverModal, RematchModal } from '@/features/modals';
import { ProgressSyncModal, ProgressConflictModal } from '@/features/portability';
import { PwaInstallModal, PwaInstallBanner } from '@/features/pwa';

interface Props {
  showQrModal?: boolean;
  currentRoom?: RoomState | null;
  lanInfo?: LanInfoResponse | null;
  pendingPromotion?: { from: Square; to: Square } | null;
  turn?: PieceColor;
  showGameOverModal?: boolean;
  lastGameOver?: GameOverPayload | null;
  isWinner?: boolean;
  isDrawResult?: boolean;
  isRematchRequestedByMe?: boolean;
  showIncomingRematchModal?: boolean;
  rematchRequestedBy?: { requesterId?: string; requestedBy?: string; requesterName: string } | null;
  isSyncModalOpen?: boolean;
  isConflictModalOpen?: boolean;
  currentProgress?: UnifiedProgressPayload | null;
  incomingPayload?: UnifiedProgressPayload | null;
  diffPreview?: ProgressDiffPreview | Record<string, any> | null;
  isInstallModalOpen?: boolean;
  showInstallBanner?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showQrModal: false,
  currentRoom: null,
  lanInfo: null,
  pendingPromotion: null,
  turn: 'w',
  showGameOverModal: false,
  lastGameOver: null,
  isWinner: false,
  isDrawResult: false,
  isRematchRequestedByMe: false,
  showIncomingRematchModal: false,
  rematchRequestedBy: null,
  isSyncModalOpen: false,
  isConflictModalOpen: false,
  currentProgress: null,
  incomingPayload: null,
  diffPreview: null,
  isInstallModalOpen: false,
  showInstallBanner: false,
});

const emit = defineEmits<{
  'update:showQrModal': [value: boolean];
  'update:showGameOverModal': [value: boolean];
  'update:isSyncModalOpen': [value: boolean];
  'update:isConflictModalOpen': [value: boolean];
  'update:isInstallModalOpen': [value: boolean];
  'promotion-select': [piece: 'q' | 'r' | 'b' | 'n'];
  promotionSelect: [piece: 'q' | 'r' | 'b' | 'n'];
  'promotion-cancel': [];
  promotionCancel: [];
  'request-rematch': [];
  rematch: [];
  'leave-room': [];
  lobby: [];
  'accept-rematch': [];
  acceptRematch: [];
  'decline-rematch': [];
  declineRematch: [];
  'resolve-conflict': [strategy: 'smart_merge' | 'replace_local' | 'keep_local'];
  resolveConflict: [strategy: 'smart_merge' | 'replace_local' | 'keep_local'];
  resolve: [strategy: 'smart_merge' | 'replace_local' | 'keep_local'];
  'cancel-conflict': [];
  cancelConflict: [];
  cancel: [];
  'prompt-install': [];
  install: [];
  'snooze-prompt': [];
  'dismiss-banner': [];
  dismiss: [];
  notify: [payload: { message: string; type: 'error' | 'info' | 'success'; durationMs?: number }];
}>();

function handlePromotionSelect(piece: 'q' | 'r' | 'b' | 'n') {
  emit('promotion-select', piece);
  emit('promotionSelect', piece);
}

function handlePromotionCancel() {
  emit('promotion-cancel');
  emit('promotionCancel');
}

function handleRequestRematch() {
  emit('request-rematch');
  emit('rematch');
}

function handleLeaveRoom() {
  emit('leave-room');
  emit('lobby');
}

function handleAcceptRematch() {
  emit('accept-rematch');
  emit('acceptRematch');
}

function handleDeclineRematch() {
  emit('decline-rematch');
  emit('declineRematch');
}

function handleResolveConflict(strategy: 'smart_merge' | 'replace_local' | 'keep_local') {
  emit('resolve-conflict', strategy);
  emit('resolveConflict', strategy);
  emit('resolve', strategy);
}

function handleCancelConflict() {
  emit('cancel-conflict');
  emit('cancelConflict');
  emit('cancel');
}

function handlePromptInstall() {
  emit('prompt-install');
  emit('install');
}

function handleSnoozePrompt() {
  emit('snooze-prompt');
  emit('dismiss-banner');
  emit('dismiss');
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (props.showQrModal) emit('update:showQrModal', false);
    if (props.pendingPromotion) handlePromotionCancel();
    if (props.showGameOverModal) emit('update:showGameOverModal', false);
    if (props.showIncomingRematchModal) handleDeclineRematch();
    if (props.isSyncModalOpen) emit('update:isSyncModalOpen', false);
    if (props.isConflictModalOpen) handleCancelConflict();
    if (props.isInstallModalOpen) emit('update:isInstallModalOpen', false);
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<template>
  <div class="app-modal-container" data-testid="app-modal-container">
    <!-- 1. QR Code / LAN Share Modal -->
    <QrCodeModal
      v-if="currentRoom"
      :model-value="showQrModal"
      :room-code="currentRoom.roomCode"
      :lan-info="lanInfo"
      @update:model-value="emit('update:showQrModal', $event)"
      @close="emit('update:showQrModal', false)"
    />

    <!-- 2. Pawn Promotion Dialog -->
    <PromotionModal
      :model-value="!!pendingPromotion"
      :color="turn"
      @select="handlePromotionSelect"
      @cancel="handlePromotionCancel"
    />

    <!-- 3. Game Over Celebratory Modal -->
    <GameOverModal
      :model-value="showGameOverModal"
      :payload="lastGameOver"
      :is-winner="isWinner"
      :is-draw="isDrawResult"
      :rematch-requested="isRematchRequestedByMe"
      @update:model-value="emit('update:showGameOverModal', $event)"
      @rematch="handleRequestRematch"
      @lobby="handleLeaveRoom"
      @close="emit('update:showGameOverModal', false)"
    />

    <!-- 4. Inbound Rematch Challenge Modal -->
    <RematchModal
      :model-value="showIncomingRematchModal"
      :requester-name="rematchRequestedBy?.requesterName || 'Opponent'"
      @accept="handleAcceptRematch"
      @decline="handleDeclineRematch"
      @update:model-value="!$event && handleDeclineRematch()"
    />

    <!-- 5. Progress Portability Sync Modal -->
    <ProgressSyncModal
      :model-value="isSyncModalOpen"
      @update:model-value="emit('update:isSyncModalOpen', $event)"
    />

    <!-- 6. Progress Conflict Resolution Modal -->
    <ProgressConflictModal
      :model-value="isConflictModalOpen"
      :current-progress="currentProgress"
      :incoming-progress="incomingPayload"
      :diff-preview="(diffPreview as any)"
      @update:model-value="emit('update:isConflictModalOpen', $event)"
      @resolve="handleResolveConflict"
      @merge="handleResolveConflict('smart_merge')"
      @replace="handleResolveConflict('replace_local')"
      @cancel="handleCancelConflict"
    />

    <!-- 7. PWA Install Modal (iOS / Manual Guide) -->
    <PwaInstallModal
      :model-value="isInstallModalOpen"
      @update:model-value="emit('update:isInstallModalOpen', $event)"
    />

    <!-- 8. Floating PWA Install CTA Banner -->
    <PwaInstallBanner
      v-if="showInstallBanner"
      @install="handlePromptInstall"
      @dismiss="handleSnoozePrompt"
    />
  </div>
</template>

<style scoped>
.app-modal-container {
  display: contents;
}
</style>
