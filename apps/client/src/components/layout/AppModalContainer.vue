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
import { BaseModal, BaseButton } from '@/components/base';

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
  diffPreview?: ProgressDiffPreview | null;
  isInstallModalOpen?: boolean;
  showInstallBanner?: boolean;
  showConfirmModal?: boolean;
  confirmTitle?: string;
  confirmMessage?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  confirmVariant?: 'primary' | 'danger' | 'warning';
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
  showConfirmModal: false,
  confirmTitle: '',
  confirmMessage: '',
  confirmButtonText: 'Confirm',
  cancelButtonText: 'Cancel',
  confirmVariant: 'danger',
});

const emit = defineEmits<{
  'update:showQrModal': [value: boolean];
  'update:showGameOverModal': [value: boolean];
  'update:isSyncModalOpen': [value: boolean];
  'update:isConflictModalOpen': [value: boolean];
  'update:isInstallModalOpen': [value: boolean];
  'update:showConfirmModal': [value: boolean];
  'confirm-proceed': [];
  'confirm-cancel': [];
  'promotion-select': [piece: 'q' | 'r' | 'b' | 'n'];
  'promotion-cancel': [];
  'request-rematch': [];
  'leave-room': [];
  'accept-rematch': [];
  'decline-rematch': [];
  'resolve-conflict': [strategy: 'smart_merge' | 'replace_local' | 'keep_local'];
  'cancel-conflict': [];
  'dismiss-conflict': [];
  'prompt-install': [];
  'snooze-prompt': [];
  notify: [payload: { message: string; type: 'error' | 'info' | 'success'; durationMs?: number }];
}>();

function handleConfirmProceed() {
  emit('update:showConfirmModal', false);
  emit('confirm-proceed');
}

function handleConfirmCancel() {
  emit('update:showConfirmModal', false);
  emit('confirm-cancel');
}

function handlePromotionSelect(piece: 'q' | 'r' | 'b' | 'n') {
  emit('promotion-select', piece);
}

function handlePromotionCancel() {
  emit('promotion-cancel');
}

function handleRequestRematch() {
  emit('request-rematch');
}

function handleLeaveRoom() {
  emit('leave-room');
}

function handleAcceptRematch() {
  emit('accept-rematch');
}

function handleDeclineRematch() {
  emit('decline-rematch');
}

let lastResolvedStrategy: string | null = null;
let lastResolvedTime = 0;

function handleResolveConflict(strategy: 'smart_merge' | 'replace_local' | 'keep_local') {
  const now = Date.now();
  if (lastResolvedStrategy === strategy && now - lastResolvedTime < 250) {
    return;
  }
  lastResolvedStrategy = strategy;
  lastResolvedTime = now;
  emit('resolve-conflict', strategy);
}

function handleCancelConflict() {
  emit('cancel-conflict');
}

function handlePromptInstall() {
  emit('prompt-install');
}

function handleSnoozePrompt() {
  emit('snooze-prompt');
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (props.showConfirmModal) handleConfirmCancel();
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
      :diff-preview="diffPreview"
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

    <!-- 9. Accessible Confirmation Dialog (Resign, Leave Room, etc.) -->
    <BaseModal
      :model-value="props.showConfirmModal"
      :title="props.confirmTitle || 'Confirmation Required'"
      size="sm"
      @update:model-value="emit('update:showConfirmModal', $event)"
      @close="handleConfirmCancel"
    >
      <div class="confirm-modal-body" data-testid="confirm-dialog-body">
        <p class="confirm-modal-message" data-testid="confirm-dialog-message">
          {{ props.confirmMessage }}
        </p>
      </div>

      <template #footer>
        <BaseButton
          variant="ghost"
          size="md"
          data-testid="confirm-cancel-btn"
          @click="handleConfirmCancel"
        >
          {{ props.cancelButtonText || 'Cancel' }}
        </BaseButton>
        <BaseButton
          :variant="props.confirmVariant === 'warning' ? 'accent' : (props.confirmVariant || 'danger')"
          size="md"
          data-testid="confirm-proceed-btn"
          @click="handleConfirmProceed"
        >
          {{ props.confirmButtonText || 'Confirm' }}
        </BaseButton>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.app-modal-container {
  display: contents;
}

.confirm-modal-body {
  padding: var(--space-2) 0;
}

.confirm-modal-message {
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--text-main);
  line-height: var(--leading-relaxed);
  margin: 0;
}
</style>
