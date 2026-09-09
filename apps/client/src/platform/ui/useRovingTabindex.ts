import {
  ref,
  computed,
  toValue,
  watch,
  type Ref,
  type WritableComputedRef,
  type MaybeRefOrGetter,
} from 'vue';

export type RovingOrientation = 'horizontal' | 'vertical' | 'both' | 'grid';

export interface UseRovingTabindexOptions<T extends string | number> {
  /** Reactive list of items or item IDs */
  items: MaybeRefOrGetter<readonly T[]>;
  /** Currently selected/active value (for v-model binding) */
  modelValue?: Ref<T> | WritableComputedRef<T>;
  /** Navigation axis */
  orientation?: RovingOrientation;
  /** Number of columns for grid orientation */
  gridColumns?: MaybeRefOrGetter<number>;
  /** Loop back to start/end on boundary */
  loop?: boolean;
  /** Automatically select item on focus (default: true for tabs/radios) */
  selectOnFocus?: boolean;
  /** Prefix for generating predictable DOM element IDs */
  idPrefix?: string;
  /** Callback fired when an item is selected via keyboard */
  onSelect?: (id: T) => void;
}

export interface UseRovingTabindexReturn<T extends string | number> {
  /** Current focused item ID */
  focusedId: Ref<T | null>;
  /** Computed tabindex for a given item: 0 if active/focused, -1 otherwise */
  getTabindex: (id: T) => 0 | -1;
  /** Keydown handler to attach to item or container */
  handleKeyDown: (event: KeyboardEvent, currentId?: T) => void;
  /** Programmatically move focus to a specific item */
  focusItem: (id: T) => void;
  /** Helper generating accessible props for v-bind on interactive elements */
  getItemProps: (id: T, index?: number) => {
    id: string;
    tabindex: 0 | -1;
    onKeydown: (event: KeyboardEvent) => void;
    onClick: () => void;
  };
}

/**
 * Computes next index for linear (horizontal, vertical, or bidirectional) roving navigation.
 * Pure function with cyclomatic complexity < 10.
 */
export function getLinearNextIndex(
  currentIndex: number,
  total: number,
  key: string,
  orientation: RovingOrientation = 'both',
  loop = true,
): number | null {
  if (total <= 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;

  const isHorizontal = orientation === 'horizontal' || orientation === 'both';
  const isVertical = orientation === 'vertical' || orientation === 'both';

  const isNext = (isHorizontal && key === 'ArrowRight') || (isVertical && key === 'ArrowDown');
  const isPrev = (isHorizontal && key === 'ArrowLeft') || (isVertical && key === 'ArrowUp');

  if (isNext) {
    return currentIndex + 1 < total ? currentIndex + 1 : (loop ? 0 : currentIndex);
  }
  if (isPrev) {
    return currentIndex - 1 >= 0 ? currentIndex - 1 : (loop ? total - 1 : currentIndex);
  }

  return null;
}

/**
 * Computes next index for 2D grid roving navigation.
 * Pure function with cyclomatic complexity < 10.
 */
export function getGridNextIndex(
  currentIndex: number,
  total: number,
  key: string,
  gridColumns: number,
  loop = true,
): number | null {
  if (total <= 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;

  const cols = Math.max(1, gridColumns);

  switch (key) {
    case 'ArrowRight':
      return currentIndex + 1 < total ? currentIndex + 1 : (loop ? 0 : currentIndex);
    case 'ArrowLeft':
      return currentIndex - 1 >= 0 ? currentIndex - 1 : (loop ? total - 1 : currentIndex);
    case 'ArrowDown': {
      const next = currentIndex + cols;
      if (next < total) return next;
      if (!loop) return currentIndex;
      const colIndex = currentIndex % cols;
      return colIndex < total ? colIndex : currentIndex;
    }
    case 'ArrowUp': {
      const prev = currentIndex - cols;
      if (prev >= 0) return prev;
      if (!loop) return currentIndex;
      const colIndex = currentIndex % cols;
      let candidate = colIndex;
      while (candidate + cols < total) {
        candidate += cols;
      }
      return candidate;
    }
    default:
      return null;
  }
}

/**
 * WAI-ARIA compliant roving tabindex composable (MIN-019).
 * Manages roving focus and keyboard navigation across tablists, radiogroups, toolbars, and grids.
 */
export function useRovingTabindex<T extends string | number>(
  options: UseRovingTabindexOptions<T>,
): UseRovingTabindexReturn<T> {
  const orientation = options.orientation ?? 'both';
  const loop = options.loop ?? true;
  const selectOnFocus = options.selectOnFocus ?? true;
  const idPrefix = options.idPrefix ?? 'roving-item-';

  const rawItems = computed<readonly T[]>(() => toValue(options.items) ?? []);

  // Determine initial focused id
  const initialValue =
    options.modelValue?.value !== undefined && rawItems.value.includes(options.modelValue.value)
      ? options.modelValue.value
      : (rawItems.value[0] ?? null);

  const focusedId = ref<T | null>(initialValue) as Ref<T | null>;

  // Synchronize when modelValue changes externally
  if (options.modelValue) {
    watch(
      () => options.modelValue?.value,
      (newVal) => {
        if (newVal !== undefined && newVal !== null && rawItems.value.includes(newVal)) {
          focusedId.value = newVal;
        }
      },
      { immediate: true },
    );
  }

  // Ensure focusedId remains valid when items array changes
  watch(
    rawItems,
    (items) => {
      if (items.length === 0) {
        focusedId.value = null;
      } else if (focusedId.value === null || !items.includes(focusedId.value)) {
        if (options.modelValue?.value !== undefined && items.includes(options.modelValue.value)) {
          focusedId.value = options.modelValue.value;
        } else {
          focusedId.value = items[0] ?? null;
        }
      }
    },
    { deep: true },
  );

  function getTabindex(id: T): 0 | -1 {
    if (focusedId.value !== null) {
      return focusedId.value === id ? 0 : -1;
    }
    if (options.modelValue?.value !== undefined) {
      return options.modelValue.value === id ? 0 : -1;
    }
    return rawItems.value[0] === id ? 0 : -1;
  }

  function focusItem(id: T): void {
    focusedId.value = id;

    if (selectOnFocus) {
      if (options.modelValue && options.modelValue.value !== id) {
        options.modelValue.value = id;
      }
      options.onSelect?.(id);
    }

    if (typeof document !== 'undefined') {
      const elementId = `${idPrefix}${id}`;
      const el = document.getElementById(elementId);
      el?.focus?.();
    }
  }

  function calculateNextIndex(
    currentIndex: number,
    total: number,
    key: string,
  ): number | null {
    if (orientation === 'grid') {
      const cols = Math.max(1, toValue(options.gridColumns) ?? 1);
      return getGridNextIndex(currentIndex, total, key, cols, loop);
    }
    return getLinearNextIndex(currentIndex, total, key, orientation, loop);
  }

  function handleKeyDown(event: KeyboardEvent, currentId?: T): void {
    const items = rawItems.value;
    const total = items.length;
    if (total === 0) return;

    const activeId = currentId ?? focusedId.value ?? options.modelValue?.value ?? items[0];
    const currentIndex = activeId !== undefined ? items.indexOf(activeId as T) : 0;
    const validIndex = currentIndex >= 0 ? currentIndex : 0;

    const nextIndex = calculateNextIndex(validIndex, total, event.key);

    if (nextIndex !== null) {
      event.preventDefault();
      const targetItem = items[nextIndex];
      if (targetItem !== undefined) {
        focusItem(targetItem);
      }
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      if (!selectOnFocus) {
        event.preventDefault();
        const selectedId = items[validIndex];
        if (selectedId !== undefined) {
          if (options.modelValue && options.modelValue.value !== selectedId) {
            options.modelValue.value = selectedId;
          }
          options.onSelect?.(selectedId);
        }
      }
    }
  }

  function getItemProps(id: T, _index?: number) {
    return {
      id: `${idPrefix}${id}`,
      tabindex: getTabindex(id),
      onKeydown: (event: KeyboardEvent) => handleKeyDown(event, id),
      onClick: () => {
        focusItem(id);
        if (!selectOnFocus) {
          if (options.modelValue && options.modelValue.value !== id) {
            options.modelValue.value = id;
          }
          options.onSelect?.(id);
        }
      },
    };
  }

  return {
    focusedId,
    getTabindex,
    handleKeyDown,
    focusItem,
    getItemProps,
  };
}
