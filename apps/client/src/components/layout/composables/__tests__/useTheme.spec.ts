import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { effectScope } from 'vue';
import { useTheme, cleanupThemeListeners } from '../useTheme';
import { safeLocalStorage } from '@/platform/storage';

describe('useTheme', () => {
  let addEventListenerSpy: any;
  let removeEventListenerSpy: any;
  let mockMatchMedia: any;
  let mediaListenerCallback: ((e: any) => void) | null = null;
  let matchesDark = false;

  beforeEach(() => {
    safeLocalStorage.removeItem('fun_chess_theme');
    document.documentElement.removeAttribute('data-theme');
    cleanupThemeListeners();
    matchesDark = false;
    mediaListenerCallback = null;

    addEventListenerSpy = vi.fn((event: string, callback: any) => {
      if (event === 'change') {
        mediaListenerCallback = callback;
      }
    });

    removeEventListenerSpy = vi.fn((event: string, callback: any) => {
      if (event === 'change' && mediaListenerCallback === callback) {
        mediaListenerCallback = null;
      }
    });

    mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: matchesDark,
      media: query,
      onchange: null,
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    window.matchMedia = mockMatchMedia;
  });

  afterEach(() => {
    cleanupThemeListeners();
    safeLocalStorage.removeItem('fun_chess_theme');
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
  });

  it('initializes with default light theme when no saved preference and media query is light', () => {
    const { isDarkMode, initTheme } = useTheme();
    initTheme();

    expect(isDarkMode.value).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('initializes with dark theme when media query matches dark and no saved preference', () => {
    matchesDark = true;
    const { isDarkMode, initTheme } = useTheme();
    initTheme();

    expect(isDarkMode.value).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('prioritizes saved theme in safeLocalStorage over media query', () => {
    matchesDark = true;
    safeLocalStorage.safeSetItem('fun_chess_theme', 'light');

    const { isDarkMode, initTheme } = useTheme();
    initTheme();

    expect(isDarkMode.value).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('toggles theme between light and dark and updates localStorage and DOM', () => {
    const { isDarkMode, toggleTheme } = useTheme();
    expect(isDarkMode.value).toBe(false);

    toggleTheme();
    expect(isDarkMode.value).toBe(true);
    expect(safeLocalStorage.getItem('fun_chess_theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    toggleTheme();
    expect(isDarkMode.value).toBe(false);
    expect(safeLocalStorage.getItem('fun_chess_theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('registers media query listener idempotently across multiple initTheme calls (MIN-003)', () => {
    const { initTheme } = useTheme();

    initTheme();
    initTheme();
    initTheme();

    expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
  });

  it('responds to system theme changes when no explicit user theme is saved', () => {
    const { isDarkMode, initTheme } = useTheme();
    initTheme();

    expect(mediaListenerCallback).not.toBeNull();
    mediaListenerCallback!({ matches: true } as MediaQueryListEvent);
    expect(isDarkMode.value).toBe(true);

    mediaListenerCallback!({ matches: false } as MediaQueryListEvent);
    expect(isDarkMode.value).toBe(false);
  });

  it('ignores system theme changes when an explicit user theme is set', () => {
    const { isDarkMode, initTheme, applyTheme } = useTheme();
    initTheme();

    // User explicitly sets light theme
    applyTheme(false);
    expect(safeLocalStorage.getItem('fun_chess_theme')).toBe('light');

    // System changes to dark
    mediaListenerCallback!({ matches: true } as MediaQueryListEvent);
    expect(isDarkMode.value).toBe(false);
  });

  it('cleans up active listeners and resets registration state via cleanupThemeListeners', () => {
    const { initTheme } = useTheme();
    initTheme();

    expect(addEventListenerSpy).toHaveBeenCalledTimes(1);

    cleanupThemeListeners();
    expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);

    // After cleanup, next initTheme should be able to register again
    initTheme();
    expect(addEventListenerSpy).toHaveBeenCalledTimes(2);
  });

  it('cleans up active listener on scope disposal', () => {
    const scope = effectScope();
    scope.run(() => {
      const { initTheme } = useTheme();
      initTheme();
    });

    expect(addEventListenerSpy).toHaveBeenCalledTimes(1);

    scope.stop();
    expect(removeEventListenerSpy).toHaveBeenCalledTimes(1);
  });
});
