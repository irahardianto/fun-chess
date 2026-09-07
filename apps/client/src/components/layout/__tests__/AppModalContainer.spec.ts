import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import type { RoomState, Player, GameOverPayload } from '@fun-chess/shared';
import AppModalContainer from '../AppModalContainer.vue';

describe('AppModalContainer.vue', () => {
  const mockWhitePlayer: Player = {
    id: 'p1',
    socketId: 'sock-1',
    name: 'Player One',
    color: 'w',
    isConnected: true,
    isHost: true,
    avatar: '🦊',
    connectedAt: Date.now(),
  };

  const mockBlackPlayer: Player = {
    id: 'p2',
    socketId: 'sock-2',
    name: 'Player Two',
    color: 'b',
    isConnected: true,
    isHost: false,
    avatar: '🐼',
    connectedAt: Date.now(),
  };

  const mockRoom: RoomState = {
    roomCode: 'WXYZ',
    hostId: 'p1',
    status: 'playing',
    whitePlayer: mockWhitePlayer,
    blackPlayer: mockBlackPlayer,
    spectators: [],
    game: {
      fen: '8/8/8/8/8/8/8/8 w - - 0 1',
      turn: 'w',
      isCheck: false,
      isCheckmate: false,
      isDraw: false,
      isStalemate: false,
      isThreefoldRepetition: false,
      isInsufficientMaterial: false,
      isFiftyMoveRule: false,
      moveHistory: [],
      capturedWhite: [],
      capturedBlack: [],
      materialAdvantage: { white: 0, black: 0 },
      lastMove: null,
      moveCount: 10,
    },
    rematch: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  const mockGameOver: GameOverPayload = {
    winner: 'w',
    reason: 'checkmate',
    message: 'Player One wins by checkmate!',
    finalFen: '8/8/8/8/8/8/8/8 w - - 0 1',
    totalMoves: 10,
    durationSeconds: 120,
  };

  const defaultProps = {
    showQrModal: false,
    currentRoom: null,
    lanInfo: null,
    pendingPromotion: null,
    turn: 'w' as const,
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
  };

  const globalConfig = {
    stubs: {
      Teleport: true,
      QrCodeModal: true,
      PromotionModal: true,
      GameOverModal: true,
      RematchModal: true,
      ProgressSyncModal: true,
      ProgressConflictModal: true,
      PwaInstallModal: true,
      PwaInstallBanner: true,
    },
  };

  it('renders QrCodeModal when showQrModal is true and currentRoom exists, forwarding update:showQrModal', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        showQrModal: true,
        currentRoom: mockRoom,
      },
      global: globalConfig,
    });

    const qrModal = wrapper.findComponent({ name: 'QrCodeModal' });
    expect(qrModal.exists()).toBe(true);

    await qrModal.vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:showQrModal')?.[0]).toEqual([false]);
  });

  it('does not render QrCodeModal when currentRoom is null', () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        showQrModal: true,
        currentRoom: null,
      },
      global: globalConfig,
    });

    expect(wrapper.findComponent({ name: 'QrCodeModal' }).exists()).toBe(false);
  });

  it('renders PromotionModal when pendingPromotion is active, forwarding select and cancel events', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        pendingPromotion: { from: 'e7', to: 'e8' },
        turn: 'w',
      },
      global: globalConfig,
    });

    const promotionModal = wrapper.findComponent({ name: 'PromotionModal' });
    expect(promotionModal.exists()).toBe(true);

    await promotionModal.vm.$emit('select', 'q');
    expect(wrapper.emitted('promotion-select') || wrapper.emitted('promotionSelect')).toBeTruthy();

    await promotionModal.vm.$emit('cancel');
    expect(wrapper.emitted('promotion-cancel') || wrapper.emitted('promotionCancel')).toBeTruthy();
  });

  it('renders GameOverModal when showGameOverModal is true, forwarding rematch and lobby events', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        showGameOverModal: true,
        lastGameOver: mockGameOver,
        isWinner: true,
      },
      global: globalConfig,
    });

    const gameOverModal = wrapper.findComponent({ name: 'GameOverModal' });
    expect(gameOverModal.exists()).toBe(true);

    await gameOverModal.vm.$emit('rematch');
    expect(wrapper.emitted('request-rematch') || wrapper.emitted('rematch')).toBeTruthy();

    await gameOverModal.vm.$emit('lobby');
    expect(wrapper.emitted('leave-room') || wrapper.emitted('lobby')).toBeTruthy();

    await gameOverModal.vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:showGameOverModal')?.[0]).toEqual([false]);
  });

  it('renders RematchModal when showIncomingRematchModal is true, forwarding accept and decline', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        showIncomingRematchModal: true,
        rematchRequestedBy: { requesterId: 'p2', requesterName: 'Bob' },
      },
      global: globalConfig,
    });

    const rematchModal = wrapper.findComponent({ name: 'RematchModal' });
    expect(rematchModal.exists()).toBe(true);

    await rematchModal.vm.$emit('accept');
    expect(wrapper.emitted('accept-rematch') || wrapper.emitted('acceptRematch')).toBeTruthy();

    await rematchModal.vm.$emit('decline');
    expect(wrapper.emitted('decline-rematch') || wrapper.emitted('declineRematch')).toBeTruthy();
  });

  it('renders ProgressSyncModal when isSyncModalOpen is true, forwarding update:isSyncModalOpen', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        isSyncModalOpen: true,
      },
      global: globalConfig,
    });

    const syncModal = wrapper.findComponent({ name: 'ProgressSyncModal' });
    expect(syncModal.exists()).toBe(true);

    await syncModal.vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:isSyncModalOpen')?.[0]).toEqual([false]);
  });

  it('renders ProgressConflictModal when isConflictModalOpen is true, forwarding resolution events', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        isConflictModalOpen: true,
        diffPreview: { scenarios: {}, puzzles: {} },
      },
      global: globalConfig,
    });

    const conflictModal = wrapper.findComponent({ name: 'ProgressConflictModal' });
    expect(conflictModal.exists()).toBe(true);

    await conflictModal.vm.$emit('resolve', 'smart_merge');
    expect(wrapper.emitted('resolve-conflict') || wrapper.emitted('resolveConflict') || wrapper.emitted('resolve')).toBeTruthy();

    await conflictModal.vm.$emit('cancel');
    expect(wrapper.emitted('cancel-conflict') || wrapper.emitted('cancelConflict') || wrapper.emitted('cancel')).toBeTruthy();
  });

  it('renders PwaInstallModal when isInstallModalOpen is true, forwarding update:isInstallModalOpen', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        isInstallModalOpen: true,
      },
      global: globalConfig,
    });

    const installModal = wrapper.findComponent({ name: 'PwaInstallModal' });
    expect(installModal.exists()).toBe(true);

    await installModal.vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:isInstallModalOpen')?.[0]).toEqual([false]);
  });

  it('renders PwaInstallBanner when showInstallBanner is true, forwarding install and dismiss', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        showInstallBanner: true,
      },
      global: globalConfig,
    });

    const banner = wrapper.findComponent({ name: 'PwaInstallBanner' });
    expect(banner.exists()).toBe(true);

    await banner.vm.$emit('install');
    expect(wrapper.emitted('prompt-install') || wrapper.emitted('install')).toBeTruthy();

    await banner.vm.$emit('dismiss');
    expect(wrapper.emitted('snooze-prompt') || wrapper.emitted('dismiss-banner') || wrapper.emitted('dismiss')).toBeTruthy();
  });

  it('does not render PwaInstallBanner when showInstallBanner is false', () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        showInstallBanner: false,
      },
      global: globalConfig,
    });

    expect(wrapper.findComponent({ name: 'PwaInstallBanner' }).exists()).toBe(false);
  });

  it('renders confirmation dialog and handles confirm proceed and cancel interactions', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        showConfirmModal: true,
        confirmTitle: 'Leave Match?',
        confirmMessage: 'Are you sure you want to forfeit?',
        confirmButtonText: 'Yes, Forfeit',
        cancelButtonText: 'Keep Playing',
        confirmVariant: 'danger',
      },
      global: globalConfig,
    });

    expect(wrapper.find('[data-testid="confirm-dialog-body"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="confirm-dialog-message"]').text()).toBe('Are you sure you want to forfeit?');

    const proceedBtn = wrapper.find('[data-testid="confirm-proceed-btn"]');
    expect(proceedBtn.text()).toContain('Yes, Forfeit');
    await proceedBtn.trigger('click');

    expect(wrapper.emitted('update:showConfirmModal')?.[0]).toEqual([false]);
    expect(wrapper.emitted('confirm-proceed') || wrapper.emitted('confirmProceed')).toBeTruthy();

    const cancelBtn = wrapper.find('[data-testid="confirm-cancel-btn"]');
    expect(cancelBtn.text()).toContain('Keep Playing');
    await cancelBtn.trigger('click');

    expect(wrapper.emitted('confirm-cancel') || wrapper.emitted('confirmCancel')).toBeTruthy();

    // BaseModal close event
    const baseModal = wrapper.findComponent({ name: 'BaseModal' });
    await baseModal.vm.$emit('close');
    expect(wrapper.emitted('confirm-cancel') || wrapper.emitted('confirmCancel')).toBeTruthy();

    // BaseModal update:modelValue
    await baseModal.vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:showConfirmModal')).toBeTruthy();
  });

  it('renders confirmation dialog with default button labels and variant when props are omitted', () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        showConfirmModal: true,
        confirmTitle: 'Default Dialog',
        confirmMessage: 'Default message',
      },
      global: globalConfig,
    });

    const cancelBtn = wrapper.find('[data-testid="confirm-cancel-btn"]');
    expect(cancelBtn.text()).toBe('Cancel');

    const proceedBtn = wrapper.find('[data-testid="confirm-proceed-btn"]');
    expect(proceedBtn.text()).toBe('Confirm');
  });

  it('handles QrCodeModal and GameOverModal close events directly', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        showQrModal: true,
        currentRoom: mockRoom,
        showGameOverModal: true,
        lastGameOver: mockGameOver,
      },
      global: globalConfig,
    });

    const qrModal = wrapper.findComponent({ name: 'QrCodeModal' });
    await qrModal.vm.$emit('close');
    expect(wrapper.emitted('update:showQrModal')).toBeTruthy();

    const gameOverModal = wrapper.findComponent({ name: 'GameOverModal' });
    await gameOverModal.vm.$emit('close');
    expect(wrapper.emitted('update:showGameOverModal')).toBeTruthy();
  });

  it('handles RematchModal update:modelValue false by declining rematch', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        showIncomingRematchModal: true,
        rematchRequestedBy: { requesterId: 'p2', requesterName: 'Bob' },
      },
      global: globalConfig,
    });

    const rematchModal = wrapper.findComponent({ name: 'RematchModal' });
    await rematchModal.vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('decline-rematch') || wrapper.emitted('declineRematch')).toBeTruthy();
  });

  it('handles ProgressConflictModal merge and replace shortcuts', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        isConflictModalOpen: true,
      },
      global: globalConfig,
    });

    const conflictModal = wrapper.findComponent({ name: 'ProgressConflictModal' });

    await conflictModal.vm.$emit('merge');
    expect(wrapper.emitted('resolve-conflict')?.[0]).toEqual(['smart_merge']);

    await conflictModal.vm.$emit('replace');
    expect(wrapper.emitted('resolve-conflict')?.[1]).toEqual(['replace_local']);

    await conflictModal.vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:isConflictModalOpen')?.[0]).toEqual([false]);
  });

  it('dismisses appropriate active modal on keyboard Escape press', async () => {
    // 1. Confirm modal
    const wrapperConfirm = mount(AppModalContainer, {
      props: { ...defaultProps, showConfirmModal: true },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperConfirm.emitted('confirm-cancel') || wrapperConfirm.emitted('confirmCancel')).toBeTruthy();
    wrapperConfirm.unmount();

    // 2. QR modal
    const wrapperQr = mount(AppModalContainer, {
      props: { ...defaultProps, showQrModal: true, currentRoom: mockRoom },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperQr.emitted('update:showQrModal')?.[0]).toEqual([false]);
    wrapperQr.unmount();

    // 3. Pending promotion
    const wrapperPromotion = mount(AppModalContainer, {
      props: { ...defaultProps, pendingPromotion: { from: 'e7', to: 'e8' } },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperPromotion.emitted('promotion-cancel') || wrapperPromotion.emitted('promotionCancel')).toBeTruthy();
    wrapperPromotion.unmount();

    // 4. Game Over modal
    const wrapperGameOver = mount(AppModalContainer, {
      props: { ...defaultProps, showGameOverModal: true },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperGameOver.emitted('update:showGameOverModal')?.[0]).toEqual([false]);
    wrapperGameOver.unmount();

    // 5. Incoming rematch modal
    const wrapperRematch = mount(AppModalContainer, {
      props: { ...defaultProps, showIncomingRematchModal: true },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperRematch.emitted('decline-rematch') || wrapperRematch.emitted('declineRematch')).toBeTruthy();
    wrapperRematch.unmount();

    // 6. Sync modal
    const wrapperSync = mount(AppModalContainer, {
      props: { ...defaultProps, isSyncModalOpen: true },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperSync.emitted('update:isSyncModalOpen')?.[0]).toEqual([false]);
    wrapperSync.unmount();

    // 7. Conflict modal
    const wrapperConflict = mount(AppModalContainer, {
      props: { ...defaultProps, isConflictModalOpen: true },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperConflict.emitted('cancel-conflict') || wrapperConflict.emitted('cancelConflict') || wrapperConflict.emitted('cancel')).toBeTruthy();
    wrapperConflict.unmount();

    // 8. Install modal
    const wrapperInstall = mount(AppModalContainer, {
      props: { ...defaultProps, isInstallModalOpen: true },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperInstall.emitted('update:isInstallModalOpen')?.[0]).toEqual([false]);

    // Non-Escape key does not trigger dismiss
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(wrapperInstall.emitted('update:isInstallModalOpen')?.length).toBe(1);

    wrapperInstall.unmount();
  });
});
