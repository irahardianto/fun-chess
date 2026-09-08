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

  const DEPRECATED_ALIASES = [
    'confirmProceed',
    'confirmCancel',
    'promotionSelect',
    'promotionCancel',
    'rematch',
    'lobby',
    'acceptRematch',
    'declineRematch',
    'resolveConflict',
    'resolve',
    'cancelConflict',
    'cancel',
    'install',
    'dismiss-banner',
    'dismiss',
  ];

  function assertNoDeprecatedAliases(wrapper: ReturnType<typeof mount>) {
    for (const alias of DEPRECATED_ALIASES) {
      expect(
        wrapper.emitted(alias),
        `Expected deprecated alias "${alias}" not to be emitted`
      ).toBeUndefined();
    }
  }

  it('renders QrCodeModal when showQrModal is true and currentRoom exists, binding canonical modelValue and forwarding update:showQrModal', async () => {
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
    expect(qrModal.props('modelValue')).toBe(true);
    expect(qrModal.props('isOpen')).toBeUndefined();

    await qrModal.vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:showQrModal')?.[0]).toEqual([false]);
    assertNoDeprecatedAliases(wrapper);
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

  it('renders PromotionModal with modelValue when pendingPromotion is active, forwarding promotion-select and promotion-cancel', async () => {
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
    expect(promotionModal.props('modelValue')).toBe(true);

    await promotionModal.vm.$emit('select', 'q');
    expect(wrapper.emitted('promotion-select')?.[0]).toEqual(['q']);
    expect(wrapper.emitted('promotionSelect')).toBeUndefined();

    await promotionModal.vm.$emit('cancel');
    expect(wrapper.emitted('promotion-cancel')).toHaveLength(1);
    expect(wrapper.emitted('promotionCancel')).toBeUndefined();
    assertNoDeprecatedAliases(wrapper);
  });

  it('renders GameOverModal with modelValue when showGameOverModal is true, forwarding request-rematch and leave-room', async () => {
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
    expect(gameOverModal.props('modelValue')).toBe(true);

    await gameOverModal.vm.$emit('rematch');
    expect(wrapper.emitted('request-rematch')).toHaveLength(1);
    expect(wrapper.emitted('rematch')).toBeUndefined();

    await gameOverModal.vm.$emit('lobby');
    expect(wrapper.emitted('leave-room')).toHaveLength(1);
    expect(wrapper.emitted('lobby')).toBeUndefined();

    await gameOverModal.vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:showGameOverModal')?.[0]).toEqual([false]);
    assertNoDeprecatedAliases(wrapper);
  });

  it('renders RematchModal with modelValue when showIncomingRematchModal is true, forwarding accept-rematch and decline-rematch', async () => {
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
    expect(rematchModal.props('modelValue')).toBe(true);

    await rematchModal.vm.$emit('accept');
    expect(wrapper.emitted('accept-rematch')).toHaveLength(1);
    expect(wrapper.emitted('acceptRematch')).toBeUndefined();

    await rematchModal.vm.$emit('decline');
    expect(wrapper.emitted('decline-rematch')).toHaveLength(1);
    expect(wrapper.emitted('declineRematch')).toBeUndefined();
    assertNoDeprecatedAliases(wrapper);
  });

  it('renders ProgressSyncModal with modelValue when isSyncModalOpen is true, forwarding update:isSyncModalOpen', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        isSyncModalOpen: true,
      },
      global: globalConfig,
    });

    const syncModal = wrapper.findComponent({ name: 'ProgressSyncModal' });
    expect(syncModal.exists()).toBe(true);
    expect(syncModal.props('modelValue')).toBe(true);

    await syncModal.vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:isSyncModalOpen')?.[0]).toEqual([false]);
    assertNoDeprecatedAliases(wrapper);
  });

  it('renders ProgressConflictModal with modelValue when isConflictModalOpen is true, forwarding resolve-conflict and cancel-conflict', async () => {
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
    expect(conflictModal.props('modelValue')).toBe(true);

    await conflictModal.vm.$emit('resolve', 'smart_merge');
    expect(wrapper.emitted('resolve-conflict')?.[0]).toEqual(['smart_merge']);
    expect(wrapper.emitted('resolveConflict')).toBeUndefined();
    expect(wrapper.emitted('resolve')).toBeUndefined();

    await conflictModal.vm.$emit('cancel');
    expect(wrapper.emitted('cancel-conflict')).toHaveLength(1);
    expect(wrapper.emitted('cancelConflict')).toBeUndefined();
    expect(wrapper.emitted('cancel')).toBeUndefined();
    assertNoDeprecatedAliases(wrapper);
  });

  it('renders PwaInstallModal with modelValue when isInstallModalOpen is true, forwarding update:isInstallModalOpen', async () => {
    const wrapper = mount(AppModalContainer, {
      props: {
        ...defaultProps,
        isInstallModalOpen: true,
      },
      global: globalConfig,
    });

    const installModal = wrapper.findComponent({ name: 'PwaInstallModal' });
    expect(installModal.exists()).toBe(true);
    expect(installModal.props('modelValue')).toBe(true);

    await installModal.vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:isInstallModalOpen')?.[0]).toEqual([false]);
    assertNoDeprecatedAliases(wrapper);
  });

  it('renders PwaInstallBanner when showInstallBanner is true, forwarding prompt-install and snooze-prompt', async () => {
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
    expect(wrapper.emitted('prompt-install')).toHaveLength(1);
    expect(wrapper.emitted('install')).toBeUndefined();

    await banner.vm.$emit('dismiss');
    expect(wrapper.emitted('snooze-prompt')).toHaveLength(1);
    expect(wrapper.emitted('dismiss-banner')).toBeUndefined();
    expect(wrapper.emitted('dismiss')).toBeUndefined();
    assertNoDeprecatedAliases(wrapper);
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

  it('renders confirmation dialog with modelValue and handles confirm-proceed and confirm-cancel interactions', async () => {
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

    const baseModal = wrapper.findComponent({ name: 'BaseModal' });
    expect(baseModal.exists()).toBe(true);
    expect(baseModal.props('modelValue')).toBe(true);

    expect(wrapper.find('[data-testid="confirm-dialog-body"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="confirm-dialog-message"]').text()).toBe('Are you sure you want to forfeit?');

    const proceedBtn = wrapper.find('[data-testid="confirm-proceed-btn"]');
    expect(proceedBtn.text()).toContain('Yes, Forfeit');
    await proceedBtn.trigger('click');

    expect(wrapper.emitted('update:showConfirmModal')?.[0]).toEqual([false]);
    expect(wrapper.emitted('confirm-proceed')).toHaveLength(1);
    expect(wrapper.emitted('confirmProceed')).toBeUndefined();

    const cancelBtn = wrapper.find('[data-testid="confirm-cancel-btn"]');
    expect(cancelBtn.text()).toContain('Keep Playing');
    await cancelBtn.trigger('click');

    expect(wrapper.emitted('confirm-cancel')).toHaveLength(1);
    expect(wrapper.emitted('confirmCancel')).toBeUndefined();

    // BaseModal close event
    await baseModal.vm.$emit('close');
    expect(wrapper.emitted('confirm-cancel')).toHaveLength(2);
    expect(wrapper.emitted('confirmCancel')).toBeUndefined();

    // BaseModal update:modelValue
    await baseModal.vm.$emit('update:modelValue', false);
    expect(wrapper.emitted('update:showConfirmModal')).toBeTruthy();
    assertNoDeprecatedAliases(wrapper);
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
    assertNoDeprecatedAliases(wrapper);
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
    assertNoDeprecatedAliases(wrapper);
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
    expect(wrapper.emitted('decline-rematch')).toHaveLength(1);
    expect(wrapper.emitted('declineRematch')).toBeUndefined();
    assertNoDeprecatedAliases(wrapper);
  });

  it('handles ProgressConflictModal merge and replace shortcuts forwarding resolve-conflict', async () => {
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
    assertNoDeprecatedAliases(wrapper);
  });

  it('dismisses appropriate active modal on keyboard Escape press with canonical emits', async () => {
    // 1. Confirm modal
    const wrapperConfirm = mount(AppModalContainer, {
      props: { ...defaultProps, showConfirmModal: true },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperConfirm.emitted('confirm-cancel')).toBeTruthy();
    expect(wrapperConfirm.emitted('confirmCancel')).toBeUndefined();
    assertNoDeprecatedAliases(wrapperConfirm);
    wrapperConfirm.unmount();

    // 2. QR modal
    const wrapperQr = mount(AppModalContainer, {
      props: { ...defaultProps, showQrModal: true, currentRoom: mockRoom },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperQr.emitted('update:showQrModal')?.[0]).toEqual([false]);
    assertNoDeprecatedAliases(wrapperQr);
    wrapperQr.unmount();

    // 3. Pending promotion
    const wrapperPromotion = mount(AppModalContainer, {
      props: { ...defaultProps, pendingPromotion: { from: 'e7', to: 'e8' } },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperPromotion.emitted('promotion-cancel')).toHaveLength(1);
    expect(wrapperPromotion.emitted('promotionCancel')).toBeUndefined();
    assertNoDeprecatedAliases(wrapperPromotion);
    wrapperPromotion.unmount();

    // 4. Game Over modal
    const wrapperGameOver = mount(AppModalContainer, {
      props: { ...defaultProps, showGameOverModal: true },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperGameOver.emitted('update:showGameOverModal')?.[0]).toEqual([false]);
    assertNoDeprecatedAliases(wrapperGameOver);
    wrapperGameOver.unmount();

    // 5. Incoming rematch modal
    const wrapperRematch = mount(AppModalContainer, {
      props: { ...defaultProps, showIncomingRematchModal: true },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperRematch.emitted('decline-rematch')).toHaveLength(1);
    expect(wrapperRematch.emitted('declineRematch')).toBeUndefined();
    assertNoDeprecatedAliases(wrapperRematch);
    wrapperRematch.unmount();

    // 6. Sync modal
    const wrapperSync = mount(AppModalContainer, {
      props: { ...defaultProps, isSyncModalOpen: true },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperSync.emitted('update:isSyncModalOpen')?.[0]).toEqual([false]);
    assertNoDeprecatedAliases(wrapperSync);
    wrapperSync.unmount();

    // 7. Conflict modal
    const wrapperConflict = mount(AppModalContainer, {
      props: { ...defaultProps, isConflictModalOpen: true },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperConflict.emitted('cancel-conflict')).toHaveLength(1);
    expect(wrapperConflict.emitted('cancelConflict')).toBeUndefined();
    expect(wrapperConflict.emitted('cancel')).toBeUndefined();
    assertNoDeprecatedAliases(wrapperConflict);
    wrapperConflict.unmount();

    // 8. Install modal
    const wrapperInstall = mount(AppModalContainer, {
      props: { ...defaultProps, isInstallModalOpen: true },
      global: globalConfig,
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapperInstall.emitted('update:isInstallModalOpen')?.[0]).toEqual([false]);
    assertNoDeprecatedAliases(wrapperInstall);

    // Non-Escape key does not trigger dismiss
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(wrapperInstall.emitted('update:isInstallModalOpen')?.length).toBe(1);

    wrapperInstall.unmount();
  });
});
