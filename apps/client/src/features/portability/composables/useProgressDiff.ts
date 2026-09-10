/**
 * Diff calculation and preview state composable for Progress Portability & Sync (MAJ-021).
 * Isolates incoming payload stage and diff comparison state.
 */

import { ref, type Ref } from 'vue';
import type {
  UnifiedProgressPayload,
  ProgressDiffPreview,
  ProgressMergeEngine,
} from '@fun-chess/shared';

export interface UseProgressDiffReturn {
  incomingPayload: Ref<UnifiedProgressPayload | null>;
  diffPreview: Ref<ProgressDiffPreview | null>;
  calculateAndSetDiff: (
    local: UnifiedProgressPayload,
    incoming: UnifiedProgressPayload,
    engine: ProgressMergeEngine
  ) => ProgressDiffPreview;
  clearDiff: () => void;
}

export function useProgressDiff(): UseProgressDiffReturn {
  const incomingPayload = ref<UnifiedProgressPayload | null>(null);
  const diffPreview = ref<ProgressDiffPreview | null>(null);

  function calculateAndSetDiff(
    local: UnifiedProgressPayload,
    incoming: UnifiedProgressPayload,
    engine: ProgressMergeEngine
  ): ProgressDiffPreview {
    const diff = engine.calculateDiff(local, incoming);
    incomingPayload.value = incoming;
    diffPreview.value = diff;
    return diff;
  }

  function clearDiff(): void {
    incomingPayload.value = null;
    diffPreview.value = null;
  }

  return {
    incomingPayload,
    diffPreview,
    calculateAndSetDiff,
    clearDiff,
  };
}
