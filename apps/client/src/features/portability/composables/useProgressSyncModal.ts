/**
 * Presentation modal state composable for Progress Portability & Sync (MAJ-021).
 * Isolates dialog visibility controls from data persistence and diffing.
 */

import { ref, type Ref } from 'vue';

export interface UseProgressSyncModalReturn {
  isSyncModalOpen: Ref<boolean>;
  isConflictModalOpen: Ref<boolean>;
  openSyncModal: () => void;
  closeSyncModal: () => void;
  openConflictModal: () => void;
  closeConflictModal: () => void;
}

export function useProgressSyncModal(options?: {
  onOpenSyncModal?: () => void;
}): UseProgressSyncModalReturn {
  const isSyncModalOpen = ref(false);
  const isConflictModalOpen = ref(false);

  function openSyncModal(): void {
    isSyncModalOpen.value = true;
    options?.onOpenSyncModal?.();
  }

  function closeSyncModal(): void {
    isSyncModalOpen.value = false;
  }

  function openConflictModal(): void {
    isConflictModalOpen.value = true;
  }

  function closeConflictModal(): void {
    isConflictModalOpen.value = false;
  }

  return {
    isSyncModalOpen,
    isConflictModalOpen,
    openSyncModal,
    closeSyncModal,
    openConflictModal,
    closeConflictModal,
  };
}
