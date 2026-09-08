/**
 * Unit tests for useModalManager composable.
 * Verifies accessible confirmation modal lifecycle, option defaults,
 * proceed/cancel actions, and modal visibility toggling.
 */

import { describe, it, expect, vi } from 'vitest';
import { useModalManager } from '../useModalManager';

describe('useModalManager Composable', () => {
  it('initializes with all modals closed and default confirmation options', () => {
    const modalManager = useModalManager();

    expect(modalManager.showQrModal.value).toBe(false);
    expect(modalManager.showGameOverModal.value).toBe(false);
    expect(modalManager.showConfirmModal.value).toBe(false);
    expect(modalManager.confirmTitle.value).toBe('');
    expect(modalManager.confirmMessage.value).toBe('');
    expect(modalManager.confirmButtonText.value).toBe('Confirm');
    expect(modalManager.cancelButtonText.value).toBe('Cancel');
    expect(modalManager.confirmVariant.value).toBe('danger');
  });

  it('handles confirmation requests and invokes onConfirm on proceed', () => {
    const playClick = vi.fn();
    const modalManager = useModalManager({ playClick });
    const onConfirm = vi.fn();

    modalManager.requestConfirmation({
      title: 'Leave Match?',
      message: 'Active match will be forfeited',
      confirmButtonText: 'Leave',
      cancelButtonText: 'Stay',
      variant: 'danger',
      onConfirm,
    });

    expect(modalManager.showConfirmModal.value).toBe(true);
    expect(modalManager.confirmTitle.value).toBe('Leave Match?');
    expect(modalManager.confirmMessage.value).toBe('Active match will be forfeited');
    expect(modalManager.confirmButtonText.value).toBe('Leave');
    expect(modalManager.cancelButtonText.value).toBe('Stay');
    expect(modalManager.confirmVariant.value).toBe('danger');
    expect(playClick).toHaveBeenCalledTimes(1);

    modalManager.handleConfirmProceed();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(modalManager.showConfirmModal.value).toBe(false);
    expect(playClick).toHaveBeenCalledTimes(2);
  });

  it('handles confirmation cancellation without executing onConfirm', () => {
    const playClick = vi.fn();
    const modalManager = useModalManager({ playClick });
    const onConfirm = vi.fn();

    modalManager.requestConfirmation({
      title: 'Resign?',
      message: 'Resign match?',
      onConfirm,
    });

    expect(modalManager.showConfirmModal.value).toBe(true);

    modalManager.handleConfirmCancel();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(modalManager.showConfirmModal.value).toBe(false);
    expect(playClick).toHaveBeenCalledTimes(2);
  });

  it('provides helper functions to open and close modals', () => {
    const modalManager = useModalManager();

    modalManager.openQrModal();
    expect(modalManager.showQrModal.value).toBe(true);
    modalManager.closeQrModal();
    expect(modalManager.showQrModal.value).toBe(false);

    modalManager.openGameOverModal();
    expect(modalManager.showGameOverModal.value).toBe(true);
    modalManager.closeGameOverModal();
    expect(modalManager.showGameOverModal.value).toBe(false);

    modalManager.openQrModal();
    modalManager.openGameOverModal();
    modalManager.closeAllModals();
    expect(modalManager.showQrModal.value).toBe(false);
    expect(modalManager.showGameOverModal.value).toBe(false);
  });
});
