import { ref, onMounted, onUnmounted, readonly } from 'vue';
import {
  storageAlertDispatcher,
  type StorageQuotaAlertEvent,
} from '@/platform/storage/storage_alert';

export function useStorageQuotaAlert() {
  const isQuotaExceeded = ref(false);
  const currentAlert = ref<StorageQuotaAlertEvent | null>(null);

  let unsubscribe: (() => void) | null = null;

  onMounted(() => {
    unsubscribe = storageAlertDispatcher.subscribe((event) => {
      isQuotaExceeded.value = true;
      currentAlert.value = event;
    });
  });

  onUnmounted(() => {
    if (unsubscribe) unsubscribe();
  });

  function dismissAlert(): void {
    isQuotaExceeded.value = false;
    currentAlert.value = null;
  }

  return {
    isQuotaExceeded: readonly(isQuotaExceeded),
    currentAlert: readonly(currentAlert),
    dismissAlert,
  };
}
