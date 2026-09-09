import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useRovingTabindex, getLinearNextIndex, getGridNextIndex } from '../useRovingTabindex';

describe('useRovingTabindex composable (Gap 1 / MIN-019)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  function createKeyboardEvent(key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    vi.spyOn(event, 'preventDefault');
    return event;
  }

  function mountDomElements(ids: readonly (string | number)[], prefix = 'roving-item-'): HTMLButtonElement[] {
    return ids.map((id) => {
      const btn = document.createElement('button');
      btn.id = `${prefix}${id}`;
      btn.tabIndex = -1;
      container.appendChild(btn);
      return btn;
    });
  }

  // --------------------------------------------------------------------------
  // 1. Initialization & Defaults
  // --------------------------------------------------------------------------
  describe('Initialization', () => {
    it('initializes with first item focused when modelValue is not provided', () => {
      const items = ['tab-1', 'tab-2', 'tab-3'];
      const { focusedId, getTabindex } = useRovingTabindex({ items });

      expect(focusedId.value).toBe('tab-1');
      expect(getTabindex('tab-1')).toBe(0);
      expect(getTabindex('tab-2')).toBe(-1);
      expect(getTabindex('tab-3')).toBe(-1);
    });

    it('initializes with modelValue when provided and present in items', () => {
      const items = ['apple', 'banana', 'cherry'];
      const modelValue = ref('banana');
      const { focusedId, getTabindex } = useRovingTabindex({
        items,
        modelValue,
      });

      expect(focusedId.value).toBe('banana');
      expect(getTabindex('apple')).toBe(-1);
      expect(getTabindex('banana')).toBe(0);
      expect(getTabindex('cherry')).toBe(-1);
    });

    it('initializes with null focusedId when items array is empty', () => {
      const { focusedId } = useRovingTabindex({ items: [] });
      expect(focusedId.value).toBeNull();
    });

    it('falls back to first item if modelValue is not found in items', () => {
      const items = ['alpha', 'beta'];
      const modelValue = ref('gamma');
      const { focusedId } = useRovingTabindex({ items, modelValue });

      expect(focusedId.value).toBe('alpha');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Horizontal Navigation
  // --------------------------------------------------------------------------
  describe('Horizontal Navigation (orientation: "horizontal")', () => {
    it('navigates with ArrowRight and ArrowLeft', () => {
      const items = ['item-1', 'item-2', 'item-3'];
      const modelValue = ref('item-1');
      const { handleKeyDown, focusedId } = useRovingTabindex({
        items,
        modelValue,
        orientation: 'horizontal',
      });

      const rightEv = createKeyboardEvent('ArrowRight');
      handleKeyDown(rightEv);
      expect(rightEv.preventDefault).toHaveBeenCalled();
      expect(focusedId.value).toBe('item-2');
      expect(modelValue.value).toBe('item-2');

      const leftEv = createKeyboardEvent('ArrowLeft');
      handleKeyDown(leftEv);
      expect(leftEv.preventDefault).toHaveBeenCalled();
      expect(focusedId.value).toBe('item-1');
      expect(modelValue.value).toBe('item-1');
    });

    it('ignores vertical keys (ArrowDown, ArrowUp) in horizontal orientation', () => {
      const items = ['opt-a', 'opt-b', 'opt-c'];
      const { handleKeyDown, focusedId } = useRovingTabindex({
        items,
        orientation: 'horizontal',
      });

      const downEv = createKeyboardEvent('ArrowDown');
      handleKeyDown(downEv);
      expect(downEv.preventDefault).not.toHaveBeenCalled();
      expect(focusedId.value).toBe('opt-a');

      const upEv = createKeyboardEvent('ArrowUp');
      handleKeyDown(upEv);
      expect(upEv.preventDefault).not.toHaveBeenCalled();
      expect(focusedId.value).toBe('opt-a');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Vertical Navigation
  // --------------------------------------------------------------------------
  describe('Vertical Navigation (orientation: "vertical")', () => {
    it('navigates with ArrowDown and ArrowUp', () => {
      const items = ['row-1', 'row-2', 'row-3'];
      const { handleKeyDown, focusedId } = useRovingTabindex({
        items,
        orientation: 'vertical',
      });

      const downEv = createKeyboardEvent('ArrowDown');
      handleKeyDown(downEv);
      expect(downEv.preventDefault).toHaveBeenCalled();
      expect(focusedId.value).toBe('row-2');

      const upEv = createKeyboardEvent('ArrowUp');
      handleKeyDown(upEv);
      expect(upEv.preventDefault).toHaveBeenCalled();
      expect(focusedId.value).toBe('row-1');
    });

    it('ignores horizontal keys (ArrowRight, ArrowLeft) in vertical orientation', () => {
      const items = ['row-1', 'row-2'];
      const { handleKeyDown, focusedId } = useRovingTabindex({
        items,
        orientation: 'vertical',
      });

      const rightEv = createKeyboardEvent('ArrowRight');
      handleKeyDown(rightEv);
      expect(rightEv.preventDefault).not.toHaveBeenCalled();
      expect(focusedId.value).toBe('row-1');

      const leftEv = createKeyboardEvent('ArrowLeft');
      handleKeyDown(leftEv);
      expect(leftEv.preventDefault).not.toHaveBeenCalled();
      expect(focusedId.value).toBe('row-1');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Both Orientation (Default)
  // --------------------------------------------------------------------------
  describe('Both Orientation (orientation: "both")', () => {
    it('allows both horizontal and vertical keys to navigate', () => {
      const items = ['step-1', 'step-2', 'step-3', 'step-4'];
      const { handleKeyDown, focusedId } = useRovingTabindex({ items });

      handleKeyDown(createKeyboardEvent('ArrowRight'));
      expect(focusedId.value).toBe('step-2');

      handleKeyDown(createKeyboardEvent('ArrowDown'));
      expect(focusedId.value).toBe('step-3');

      handleKeyDown(createKeyboardEvent('ArrowLeft'));
      expect(focusedId.value).toBe('step-2');

      handleKeyDown(createKeyboardEvent('ArrowUp'));
      expect(focusedId.value).toBe('step-1');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Grid 2D Navigation
  // --------------------------------------------------------------------------
  describe('Grid 2D Navigation (orientation: "grid")', () => {
    // 3 columns x 3 rows = 8 items (last row has 2)
    // [0, 1, 2]
    // [3, 4, 5]
    // [6, 7]
    const items = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];

    it('navigates rows and columns in 2D grid', () => {
      const { handleKeyDown, focusedId } = useRovingTabindex({
        items,
        orientation: 'grid',
        gridColumns: 3,
      });

      expect(focusedId.value).toBe('c0');

      // Right -> c1
      handleKeyDown(createKeyboardEvent('ArrowRight'));
      expect(focusedId.value).toBe('c1');

      // Down -> c1 + 3 = c4
      handleKeyDown(createKeyboardEvent('ArrowDown'));
      expect(focusedId.value).toBe('c4');

      // Down -> c4 + 3 = c7
      handleKeyDown(createKeyboardEvent('ArrowDown'));
      expect(focusedId.value).toBe('c7');

      // Left -> c6
      handleKeyDown(createKeyboardEvent('ArrowLeft'));
      expect(focusedId.value).toBe('c6');

      // Up -> c6 - 3 = c3
      handleKeyDown(createKeyboardEvent('ArrowUp'));
      expect(focusedId.value).toBe('c3');

      // Up -> c3 - 3 = c0
      handleKeyDown(createKeyboardEvent('ArrowUp'));
      expect(focusedId.value).toBe('c0');
    });

    it('wraps rows and columns correctly when loop is true', () => {
      const { handleKeyDown, focusedId } = useRovingTabindex({
        items,
        orientation: 'grid',
        gridColumns: 3,
        loop: true,
      });

      // ArrowLeft from c0 wraps to end of list (c7)
      handleKeyDown(createKeyboardEvent('ArrowLeft'));
      expect(focusedId.value).toBe('c7');

      // ArrowRight from c7 wraps to start (c0)
      handleKeyDown(createKeyboardEvent('ArrowRight'));
      expect(focusedId.value).toBe('c0');

      // ArrowUp from c0 wraps to bottom in column 0 (c6)
      handleKeyDown(createKeyboardEvent('ArrowUp'));
      expect(focusedId.value).toBe('c6');

      // ArrowDown from c6 (6+3=9 >= 8) wraps to top row in column 0 (c0)
      handleKeyDown(createKeyboardEvent('ArrowDown'));
      expect(focusedId.value).toBe('c0');

      // Move to c1 then wrap up to c7 (column 1 bottom candidate is c7)
      handleKeyDown(createKeyboardEvent('ArrowRight'));
      expect(focusedId.value).toBe('c1');
      handleKeyDown(createKeyboardEvent('ArrowUp'));
      expect(focusedId.value).toBe('c7');

      // From c7 (column 1 bottom), ArrowDown wraps to column 1 top (c1)
      handleKeyDown(createKeyboardEvent('ArrowDown'));
      expect(focusedId.value).toBe('c1');
    });

    it('does not wrap when loop is false', () => {
      const { handleKeyDown, focusedId } = useRovingTabindex({
        items,
        orientation: 'grid',
        gridColumns: 3,
        loop: false,
      });

      // Left at 0 stays at 0
      handleKeyDown(createKeyboardEvent('ArrowLeft'));
      expect(focusedId.value).toBe('c0');

      // Up at 0 stays at 0
      handleKeyDown(createKeyboardEvent('ArrowUp'));
      expect(focusedId.value).toBe('c0');

      // Move to c7 (last item)
      handleKeyDown(createKeyboardEvent('End'));
      expect(focusedId.value).toBe('c7');

      // Right at c7 stays at c7
      handleKeyDown(createKeyboardEvent('ArrowRight'));
      expect(focusedId.value).toBe('c7');

      // Down at c7 (7+3=10 >= 8) stays at c7
      handleKeyDown(createKeyboardEvent('ArrowDown'));
      expect(focusedId.value).toBe('c7');
    });

    it('respects reactive gridColumns getter', () => {
      const cols = ref(2);
      const { handleKeyDown, focusedId } = useRovingTabindex({
        items: ['g0', 'g1', 'g2', 'g3'],
        orientation: 'grid',
        gridColumns: cols,
      });

      // Down with 2 cols -> g2
      handleKeyDown(createKeyboardEvent('ArrowDown'));
      expect(focusedId.value).toBe('g2');

      // Change cols to 1
      cols.value = 1;
      // Down with 1 col from g2 -> g3
      handleKeyDown(createKeyboardEvent('ArrowDown'));
      expect(focusedId.value).toBe('g3');
    });
  });

  // --------------------------------------------------------------------------
  // 6. Boundary Wrapping (loop: true vs loop: false)
  // --------------------------------------------------------------------------
  describe('Boundary Wrapping', () => {
    it('wraps around forward and backward with loop: true', () => {
      const items = ['first', 'second', 'third'];
      const { handleKeyDown, focusedId } = useRovingTabindex({
        items,
        loop: true,
      });

      // Left from first wraps to third
      handleKeyDown(createKeyboardEvent('ArrowLeft'));
      expect(focusedId.value).toBe('third');

      // Right from third wraps to first
      handleKeyDown(createKeyboardEvent('ArrowRight'));
      expect(focusedId.value).toBe('first');
    });

    it('clamps at boundaries with loop: false', () => {
      const items = ['first', 'second', 'third'];
      const { handleKeyDown, focusedId } = useRovingTabindex({
        items,
        loop: false,
      });

      // Left from first stays at first
      handleKeyDown(createKeyboardEvent('ArrowLeft'));
      expect(focusedId.value).toBe('first');

      // Move to third
      handleKeyDown(createKeyboardEvent('End'));
      expect(focusedId.value).toBe('third');

      // Right from third stays at third
      handleKeyDown(createKeyboardEvent('ArrowRight'));
      expect(focusedId.value).toBe('third');
    });
  });

  // --------------------------------------------------------------------------
  // 7. Home and End Keys
  // --------------------------------------------------------------------------
  describe('Home and End Keys', () => {
    it('jumps directly to start on Home and end on End', () => {
      const items = ['a', 'b', 'c', 'd', 'e'];
      const modelValue = ref('c');
      const { handleKeyDown, focusedId } = useRovingTabindex({
        items,
        modelValue,
      });

      const endEv = createKeyboardEvent('End');
      handleKeyDown(endEv);
      expect(endEv.preventDefault).toHaveBeenCalled();
      expect(focusedId.value).toBe('e');
      expect(modelValue.value).toBe('e');

      const homeEv = createKeyboardEvent('Home');
      handleKeyDown(homeEv);
      expect(homeEv.preventDefault).toHaveBeenCalled();
      expect(focusedId.value).toBe('a');
      expect(modelValue.value).toBe('a');
    });
  });

  // --------------------------------------------------------------------------
  // 8. Selection Mode (selectOnFocus: true vs false)
  // --------------------------------------------------------------------------
  describe('Selection Modes (selectOnFocus)', () => {
    it('updates modelValue and invokes onSelect automatically when selectOnFocus: true', () => {
      const items = ['opt-1', 'opt-2', 'opt-3'];
      const modelValue = ref('opt-1');
      const onSelect = vi.fn();

      const { handleKeyDown } = useRovingTabindex({
        items,
        modelValue,
        selectOnFocus: true,
        onSelect,
      });

      handleKeyDown(createKeyboardEvent('ArrowRight'));
      expect(modelValue.value).toBe('opt-2');
      expect(onSelect).toHaveBeenCalledWith('opt-2');
    });

    it('does NOT update modelValue on navigation when selectOnFocus: false until Enter or Space is pressed', () => {
      const items = ['opt-1', 'opt-2', 'opt-3'];
      const modelValue = ref('opt-1');
      const onSelect = vi.fn();

      const { handleKeyDown, focusedId } = useRovingTabindex({
        items,
        modelValue,
        selectOnFocus: false,
        onSelect,
      });

      // Move focus with ArrowRight
      handleKeyDown(createKeyboardEvent('ArrowRight'));
      expect(focusedId.value).toBe('opt-2');
      expect(modelValue.value).toBe('opt-1');
      expect(onSelect).not.toHaveBeenCalled();

      // Press Enter to commit selection
      const enterEv = createKeyboardEvent('Enter');
      handleKeyDown(enterEv);
      expect(enterEv.preventDefault).toHaveBeenCalled();
      expect(modelValue.value).toBe('opt-2');
      expect(onSelect).toHaveBeenCalledWith('opt-2');

      // Move focus again with ArrowRight
      handleKeyDown(createKeyboardEvent('ArrowRight'));
      expect(focusedId.value).toBe('opt-3');
      expect(modelValue.value).toBe('opt-2');

      // Press Space to commit selection
      const spaceEv = createKeyboardEvent(' ');
      handleKeyDown(spaceEv);
      expect(spaceEv.preventDefault).toHaveBeenCalled();
      expect(modelValue.value).toBe('opt-3');
      expect(onSelect).toHaveBeenCalledWith('opt-3');
    });
  });

  // --------------------------------------------------------------------------
  // 9. Dynamic Reactive Items Updates
  // --------------------------------------------------------------------------
  describe('Dynamic Reactive Items Updates', () => {
    it('maintains focusedId if still present when items list changes', async () => {
      const items = ref(['apple', 'banana', 'cherry']);
      const { focusedId } = useRovingTabindex({ items });

      expect(focusedId.value).toBe('apple');

      items.value = ['banana', 'cherry', 'date'];
      await nextTick();

      // 'apple' removed, resets to modelValue or new first item ('banana')
      expect(focusedId.value).toBe('banana');
    });

    it('resets focusedId to null when items become empty', async () => {
      const items = ref(['single']);
      const { focusedId } = useRovingTabindex({ items });

      expect(focusedId.value).toBe('single');

      items.value = [];
      await nextTick();

      expect(focusedId.value).toBeNull();
    });

    it('recovers focus when items are populated after being empty', async () => {
      const items = ref<string[]>([]);
      const { focusedId } = useRovingTabindex({ items });

      expect(focusedId.value).toBeNull();

      items.value = ['restored-1', 'restored-2'];
      await nextTick();

      expect(focusedId.value).toBe('restored-1');
    });

    it('syncs focusedId when modelValue changes externally', async () => {
      const items = ['x', 'y', 'z'];
      const modelValue = ref('x');
      const { focusedId } = useRovingTabindex({ items, modelValue });

      expect(focusedId.value).toBe('x');

      modelValue.value = 'z';
      await nextTick();

      expect(focusedId.value).toBe('z');
    });
  });

  // --------------------------------------------------------------------------
  // 10. getItemProps Helper
  // --------------------------------------------------------------------------
  describe('getItemProps Helper', () => {
    it('returns valid id, tabindex, onKeydown, and onClick handlers', () => {
      const items = ['tab-a', 'tab-b'];
      const modelValue = ref('tab-a');
      const onSelect = vi.fn();
      const { getItemProps } = useRovingTabindex({
        items,
        modelValue,
        idPrefix: 'custom-prefix-',
        onSelect,
      });

      const propsA = getItemProps('tab-a');
      expect(propsA.id).toBe('custom-prefix-tab-a');
      expect(propsA.tabindex).toBe(0);

      const propsB = getItemProps('tab-b');
      expect(propsB.id).toBe('custom-prefix-tab-b');
      expect(propsB.tabindex).toBe(-1);

      // Trigger onClick on tab-b
      propsB.onClick();
      expect(modelValue.value).toBe('tab-b');
      expect(onSelect).toHaveBeenCalledWith('tab-b');
    });

    it('handles click when selectOnFocus: false', () => {
      const items = ['m1', 'm2'];
      const modelValue = ref('m1');
      const onSelect = vi.fn();
      const { getItemProps, focusedId } = useRovingTabindex({
        items,
        modelValue,
        selectOnFocus: false,
        onSelect,
      });

      const propsM2 = getItemProps('m2');
      propsM2.onClick();

      expect(focusedId.value).toBe('m2');
      expect(modelValue.value).toBe('m2');
      expect(onSelect).toHaveBeenCalledWith('m2');
    });

    it('delegates keyboard events through onKeydown', () => {
      const items = ['btn1', 'btn2'];
      const { getItemProps, focusedId } = useRovingTabindex({ items });

      const propsBtn1 = getItemProps('btn1');
      const rightEv = createKeyboardEvent('ArrowRight');
      propsBtn1.onKeydown(rightEv);

      expect(focusedId.value).toBe('btn2');
    });
  });

  // --------------------------------------------------------------------------
  // 11. DOM Focus Integration
  // --------------------------------------------------------------------------
  describe('DOM Focus Integration', () => {
    it('invokes element.focus() on target DOM element when navigating', () => {
      const items = ['d1', 'd2', 'd3'];
      const [, btn2, btn3] = mountDomElements(items, 'dom-tab-');
      if (!btn2 || !btn3) throw new Error('Expected buttons to be mounted');
      const focusSpy2 = vi.spyOn(btn2, 'focus');
      const focusSpy3 = vi.spyOn(btn3, 'focus');

      const { handleKeyDown, focusItem } = useRovingTabindex({
        items,
        idPrefix: 'dom-tab-',
      });

      handleKeyDown(createKeyboardEvent('ArrowRight'));
      expect(focusSpy2).toHaveBeenCalled();

      focusItem('d3');
      expect(focusSpy3).toHaveBeenCalled();
    });

    it('safely handles navigation when DOM elements are missing', () => {
      const items = ['missing-1', 'missing-2'];
      const { handleKeyDown, focusedId } = useRovingTabindex({ items });

      expect(() => {
        handleKeyDown(createKeyboardEvent('ArrowRight'));
      }).not.toThrow();
      expect(focusedId.value).toBe('missing-2');
    });
  });

  describe('Pure helper functions (MAJ-006)', () => {
    it('getLinearNextIndex handles linear navigation, boundaries, and keys', () => {
      expect(getLinearNextIndex(0, 3, 'ArrowRight', 'horizontal', true)).toBe(1);
      expect(getLinearNextIndex(2, 3, 'ArrowRight', 'horizontal', true)).toBe(0);
      expect(getLinearNextIndex(2, 3, 'ArrowRight', 'horizontal', false)).toBe(2);
      expect(getLinearNextIndex(0, 3, 'ArrowLeft', 'horizontal', true)).toBe(2);
      expect(getLinearNextIndex(0, 3, 'ArrowLeft', 'horizontal', false)).toBe(0);
      expect(getLinearNextIndex(1, 3, 'Home', 'horizontal', true)).toBe(0);
      expect(getLinearNextIndex(1, 3, 'End', 'horizontal', true)).toBe(2);
      expect(getLinearNextIndex(0, 0, 'ArrowRight', 'horizontal', true)).toBeNull();
      expect(getLinearNextIndex(0, 3, 'ArrowUp', 'horizontal', true)).toBeNull();
    });

    it('getGridNextIndex handles 2D grid wrapping, columns, and keys', () => {
      expect(getGridNextIndex(0, 6, 'ArrowRight', 3, true)).toBe(1);
      expect(getGridNextIndex(5, 6, 'ArrowRight', 3, true)).toBe(0);
      expect(getGridNextIndex(0, 6, 'ArrowLeft', 3, true)).toBe(5);
      expect(getGridNextIndex(1, 6, 'ArrowDown', 3, true)).toBe(4);
      expect(getGridNextIndex(4, 6, 'ArrowDown', 3, true)).toBe(1);
      expect(getGridNextIndex(4, 6, 'ArrowDown', 3, false)).toBe(4);
      expect(getGridNextIndex(1, 6, 'ArrowUp', 3, true)).toBe(4);
      expect(getGridNextIndex(1, 6, 'ArrowUp', 3, false)).toBe(1);
      expect(getGridNextIndex(0, 0, 'ArrowDown', 3, true)).toBeNull();
      expect(getGridNextIndex(1, 6, 'Space', 3, true)).toBeNull();
    });
  });

  describe('Edge Cases and Dynamic Reactions', () => {
    it('updates focusedId dynamically when rawItems changes', async () => {
      const items = ref(['item-1', 'item-2', 'item-3']);
      const modelValue = ref('item-2');
      const { focusedId } = useRovingTabindex({ items, modelValue });
      expect(focusedId.value).toBe('item-2');

      // 1. Items array emptied
      items.value = [];
      await nextTick();
      expect(focusedId.value).toBeNull();

      // 2. Items array repopulated with modelValue included
      items.value = ['item-4', 'item-2'];
      await nextTick();
      expect(focusedId.value).toBe('item-2');

      // 3. Items array changed where neither focused nor modelValue is included
      modelValue.value = 'missing';
      items.value = ['item-5', 'item-6'];
      await nextTick();
      expect(focusedId.value).toBe('item-5');
    });

    it('handles getTabindex when focusedId is null', () => {
      const items = ref(['first', 'second']);
      const modelValue = ref('second');
      const { focusedId, getTabindex } = useRovingTabindex({ items, modelValue });

      // Force focusedId to null
      focusedId.value = null;

      // With modelValue
      expect(getTabindex('second')).toBe(0);
      expect(getTabindex('first')).toBe(-1);

      // Without modelValue
      const { focusedId: f2, getTabindex: g2 } = useRovingTabindex({ items: ['a', 'b'] });
      f2.value = null;
      expect(g2('a')).toBe(0);
      expect(g2('b')).toBe(-1);
    });

    it('safely no-ops in handleKeyDown when items array is empty or activeId is unknown', () => {
      const items = ref<string[]>([]);
      const { handleKeyDown } = useRovingTabindex({ items });

      const ev = createKeyboardEvent('ArrowRight');
      expect(() => handleKeyDown(ev)).not.toThrow();
      expect(ev.preventDefault).not.toHaveBeenCalled();

      // Unknown activeId
      const items2 = ref(['x', 'y']);
      const { handleKeyDown: h2, focusedId } = useRovingTabindex({ items: items2 });
      h2(createKeyboardEvent('ArrowRight'), 'non-existent' as any);
      expect(focusedId.value).toBe('y');
    });

    it('supports gridColumns as a getter function or reactive ref', () => {
      const items = ['1', '2', '3', '4', '5', '6'];
      const columnsFn = () => 3;
      const { handleKeyDown, focusedId } = useRovingTabindex({
        items,
        orientation: 'grid',
        gridColumns: columnsFn,
      });

      handleKeyDown(createKeyboardEvent('ArrowDown'));
      expect(focusedId.value).toBe('4');
    });
  });
});
