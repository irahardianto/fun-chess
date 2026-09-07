import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import type { PieceColor, PieceType } from '@fun-chess/shared';
import ChessPiece from '../ChessPiece.vue';

describe('ChessPiece.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Piece Rendering and Key Resolution', () => {
    const allPieces: Array<{ color: PieceColor; type: PieceType; key: string; name: string }> = [
      { color: 'w', type: 'p', key: 'wP', name: 'White Pawn' },
      { color: 'w', type: 'r', key: 'wR', name: 'White Rook' },
      { color: 'w', type: 'n', key: 'wN', name: 'White Knight' },
      { color: 'w', type: 'b', key: 'wB', name: 'White Bishop' },
      { color: 'w', type: 'q', key: 'wQ', name: 'White Queen' },
      { color: 'w', type: 'k', key: 'wK', name: 'White King' },
      { color: 'b', type: 'p', key: 'bP', name: 'Black Pawn' },
      { color: 'b', type: 'r', key: 'bR', name: 'Black Rook' },
      { color: 'b', type: 'n', key: 'bN', name: 'Black Knight' },
      { color: 'b', type: 'b', key: 'bB', name: 'Black Bishop' },
      { color: 'b', type: 'q', key: 'bQ', name: 'Black Queen' },
      { color: 'b', type: 'k', key: 'bK', name: 'Black King' },
    ];

    it.each(allPieces)(
      'renders $name with correct data-piece attribute and accessible label',
      ({ key, name }) => {
        const wrapper = mount(ChessPiece, {
          props: {
            piece: key as any,
          },
        });

        expect(wrapper.find('[data-testid="chess-piece"]').exists()).toBe(true);
        expect(wrapper.attributes('data-piece')).toBe(key);
        expect(wrapper.attributes('aria-label')).toBe(name);
        expect(wrapper.find('svg').exists()).toBe(true);
      },
    );

    it('resolves piece key and accessible label when color and type are passed directly', () => {
      const wrapper = mount(ChessPiece, {
        props: {
          color: 'b',
          type: 'r',
          square: 'a8',
        },
      });

      expect(wrapper.attributes('data-piece')).toBe('bR');
      expect(wrapper.attributes('aria-label')).toBe('Black Rook on a8');
    });

    it('uses fallback defaults (wP) when no props are specified', () => {
      const wrapper = mount(ChessPiece);

      expect(wrapper.attributes('data-piece')).toBe('wP');
      expect(wrapper.attributes('aria-label')).toBe('White Pawn');
    });

    it('passes custom size down to SVG element', () => {
      const wrapper = mount(ChessPiece, {
        props: {
          piece: 'wQ',
          size: 48,
        },
      });

      const svg = wrapper.find('svg');
      expect(svg.attributes('width')).toBe('48px');
      expect(svg.attributes('height')).toBe('48px');
    });
  });

  describe('Interactive States and Classes', () => {
    it('applies selected and dragging classes when props are true', () => {
      const wrapper = mount(ChessPiece, {
        props: {
          piece: 'bQ',
          isSelected: true,
          isDragging: true,
        },
      });

      expect(wrapper.classes()).toContain('is-selected');
      expect(wrapper.classes()).toContain('is-dragging');
    });

    it('applies is-interactive class only when draggable and isDraggable are true', () => {
      const wrapperActive = mount(ChessPiece, {
        props: {
          piece: 'wN',
          draggable: true,
          isDraggable: true,
        },
      });
      expect(wrapperActive.classes()).toContain('is-interactive');
      expect(wrapperActive.attributes('draggable')).toBe('true');

      const wrapperDisabled1 = mount(ChessPiece, {
        props: {
          piece: 'wN',
          draggable: false,
          isDraggable: true,
        },
      });
      expect(wrapperDisabled1.classes()).not.toContain('is-interactive');
      expect(wrapperDisabled1.attributes('draggable')).toBe('false');

      const wrapperDisabled2 = mount(ChessPiece, {
        props: {
          piece: 'wN',
          draggable: true,
          isDraggable: false,
        },
      });
      expect(wrapperDisabled2.classes()).not.toContain('is-interactive');
      expect(wrapperDisabled2.attributes('draggable')).toBe('false');
    });
  });

  describe('Click and Native Drag Events', () => {
    it('emits click and select events on user click', async () => {
      const wrapper = mount(ChessPiece, {
        props: {
          piece: 'wN',
          square: 'c3',
        },
      });

      await wrapper.trigger('click');
      expect(wrapper.emitted('click')).toHaveLength(1);
      expect(wrapper.emitted('select')?.[0]).toEqual(['c3']);
    });

    it('emits native dragstart only when draggable is active', async () => {
      const wrapperActive = mount(ChessPiece, {
        props: {
          piece: 'wP',
          draggable: true,
        },
      });

      await wrapperActive.trigger('dragstart');
      expect(wrapperActive.emitted('dragstart')).toHaveLength(1);

      const wrapperDisabled = mount(ChessPiece, {
        props: {
          piece: 'wP',
          draggable: false,
        },
      });

      await wrapperDisabled.trigger('dragstart');
      expect(wrapperDisabled.emitted('dragstart')).toBeUndefined();
    });
  });

  describe('Pointer Drag and Drop State Machine', () => {
    it('ignores pointerdown if not draggable or non-primary mouse button', async () => {
      const wrapper = mount(ChessPiece, {
        props: {
          piece: 'wK',
          draggable: false,
        },
      });

      const element = wrapper.find('[data-testid="chess-piece"]').element as HTMLElement;
      element.setPointerCapture = vi.fn();

      await wrapper.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
      expect(element.setPointerCapture).not.toHaveBeenCalled();

      // Non-primary button (e.g. right click = 2)
      const wrapperDraggable = mount(ChessPiece, {
        props: {
          piece: 'wK',
          draggable: true,
        },
      });
      const element2 = wrapperDraggable.find('[data-testid="chess-piece"]').element as HTMLElement;
      element2.setPointerCapture = vi.fn();

      await wrapperDraggable.trigger('pointerdown', { button: 2, pointerId: 1, clientX: 100, clientY: 100 });
      expect(element2.setPointerCapture).not.toHaveBeenCalled();
    });

    it('handles pointer drag start, movement, and drag end sequence', async () => {
      const wrapper = mount(ChessPiece, {
        props: {
          piece: 'wP',
          square: 'e2',
          draggable: true,
        },
      });

      const element = wrapper.find('[data-testid="chess-piece"]').element as HTMLElement;
      element.setPointerCapture = vi.fn();
      element.releasePointerCapture = vi.fn();

      // 1. Pointer Down
      await wrapper.trigger('pointerdown', { button: 0, pointerId: 42, clientX: 100, clientY: 100 });
      expect(element.setPointerCapture).toHaveBeenCalledWith(42);

      // 2. Minor pointer move (<= 5px, threshold not exceeded)
      await wrapper.trigger('pointermove', { pointerId: 42, clientX: 103, clientY: 102 });
      expect(wrapper.emitted('dragStart')).toBeUndefined();

      // 3. Significant pointer move (> 5px, initiates drag)
      await wrapper.trigger('pointermove', { pointerId: 42, clientX: 120, clientY: 130 });
      expect(wrapper.emitted('dragStart')?.[0]).toEqual(['e2', expect.any(Object)]);
      expect(wrapper.emitted('dragMove')?.[0]).toEqual(['e2', expect.any(Object), { x: 20, y: 30 }]);
      expect(wrapper.classes()).toContain('is-dragging');

      // Check dynamic styling applied during drag
      const styleAttr = wrapper.attributes('style');
      expect(styleAttr).toContain('translate3d(20px, 30px, 0)');
      expect(styleAttr).toContain('z-index: 100');
      expect(styleAttr).toContain('cursor: grabbing');

      // 4. Pointer Up terminates drag
      await wrapper.trigger('pointerup', { pointerId: 42, clientX: 120, clientY: 130 });
      expect(element.releasePointerCapture).toHaveBeenCalledWith(42);
      expect(wrapper.emitted('dragEnd')?.[0]).toEqual(['e2', expect.any(Object), { x: 120, y: 130 }]);
      expect(wrapper.classes()).not.toContain('is-dragging');
    });

    it('emits select when pointerup occurs without exceeding drag threshold (click-like tap)', async () => {
      const wrapper = mount(ChessPiece, {
        props: {
          piece: 'bB',
          square: 'c8',
          draggable: true,
        },
      });

      const element = wrapper.find('[data-testid="chess-piece"]').element as HTMLElement;
      element.setPointerCapture = vi.fn();
      element.releasePointerCapture = vi.fn();

      await wrapper.trigger('pointerdown', { button: 0, pointerId: 10, clientX: 50, clientY: 50 });
      // Small shift <= 5px
      await wrapper.trigger('pointermove', { pointerId: 10, clientX: 52, clientY: 51 });
      await wrapper.trigger('pointerup', { pointerId: 10, clientX: 52, clientY: 51 });

      expect(wrapper.emitted('dragEnd')).toBeUndefined();
      expect(wrapper.emitted('select')?.[0]).toEqual(['c8']);
    });

    it('resets drag state on pointercancel', async () => {
      const wrapper = mount(ChessPiece, {
        props: {
          piece: 'wR',
          square: 'a1',
          draggable: true,
        },
      });

      const element = wrapper.find('[data-testid="chess-piece"]').element as HTMLElement;
      element.setPointerCapture = vi.fn();

      await wrapper.trigger('pointerdown', { button: 0, pointerId: 99, clientX: 10, clientY: 10 });
      await wrapper.trigger('pointermove', { pointerId: 99, clientX: 30, clientY: 30 });
      expect(wrapper.classes()).toContain('is-dragging');

      // Cancel with mismatched pointerId (ignored)
      await wrapper.trigger('pointercancel', { pointerId: 88 });
      expect(wrapper.classes()).toContain('is-dragging');

      // Cancel with matching pointerId
      await wrapper.trigger('pointercancel', { pointerId: 99 });
      expect(wrapper.classes()).not.toContain('is-dragging');
    });

    it('handles exceptions in setPointerCapture and releasePointerCapture gracefully', async () => {
      const wrapper = mount(ChessPiece, {
        props: {
          piece: 'bN',
          square: 'b8',
          draggable: true,
        },
      });

      const element = wrapper.find('[data-testid="chess-piece"]').element as HTMLElement;
      element.setPointerCapture = vi.fn(() => {
        throw new Error('Pointer capture not supported');
      });
      element.releasePointerCapture = vi.fn(() => {
        throw new Error('Pointer release failed');
      });

      expect(() => {
        wrapper.trigger('pointerdown', { button: 0, pointerId: 5, clientX: 10, clientY: 10 });
      }).not.toThrow();

      expect(() => {
        wrapper.trigger('pointerup', { pointerId: 5, clientX: 10, clientY: 10 });
      }).not.toThrow();
    });
  });
});
