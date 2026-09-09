/**
 * Modal management composable for Fun Chess app shell.
 * Encapsulates modal dialogs, accessible confirmation workflows, and modal lifecycle.
 *
 * Adheres to Finding MAJ-022 (App.vue God Component Decomposition).
 */

import { ref } from 'vue';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  variant?: 'primary' | 'danger' | 'warning';
  onConfirm: () => void;
}

export interface ModalManagerOptions {
  playClick?: () => void;
}

export function useModalManager(options?: ModalManagerOptions) {
  const showQrModal = ref(false);
  const showGameOverModal = ref(false);

  // Accessible confirmation modal state (replaces raw window.confirm per CRIT-005 & MIN-010)
  const showConfirmModal = ref(false);
  const confirmTitle = ref('');
  const confirmMessage = ref('');
  const confirmButtonText = ref('Confirm');
  const cancelButtonText = ref('Cancel');
  const confirmVariant = ref<'primary' | 'danger' | 'warning'>('danger');
  let pendingConfirmAction: (() => void) | null = null;

  function requestConfirmation(opts: ConfirmationOptions): void {
    confirmTitle.value = opts.title;
    confirmMessage.value = opts.message;
    confirmButtonText.value = opts.confirmButtonText ?? 'Confirm';
    cancelButtonText.value = opts.cancelButtonText ?? 'Cancel';
    confirmVariant.value = opts.variant ?? 'danger';
    pendingConfirmAction = opts.onConfirm;
    showConfirmModal.value = true;
    options?.playClick?.();
  }

  function handleConfirmProceed(): void {
    options?.playClick?.();
    const action = pendingConfirmAction;
    pendingConfirmAction = null;
    showConfirmModal.value = false;
    if (action) {
      action();
    }
  }

  function handleConfirmCancel(): void {
    options?.playClick?.();
    pendingConfirmAction = null;
    showConfirmModal.value = false;
  }

  function openQrModal(): void {
    showQrModal.value = true;
  }

  function closeQrModal(): void {
    showQrModal.value = false;
  }

  function openGameOverModal(): void {
    showGameOverModal.value = true;
  }

  function closeGameOverModal(): void {
    showGameOverModal.value = false;
  }

  function closeAllModals(): void {
    showQrModal.value = false;
    showGameOverModal.value = false;
    showConfirmModal.value = false;
    pendingConfirmAction = null;
  }

  return {
    showQrModal,
    showGameOverModal,
    showConfirmModal,
    confirmTitle,
    confirmMessage,
    confirmButtonText,
    cancelButtonText,
    confirmVariant,
    requestConfirmation,
    handleConfirmProceed,
    handleConfirmCancel,
    openQrModal,
    closeQrModal,
    openGameOverModal,
    closeGameOverModal,
    closeAllModals,
  };
}
