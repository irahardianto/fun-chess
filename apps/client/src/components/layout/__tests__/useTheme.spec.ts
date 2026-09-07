import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTheme } from '../composables/useTheme';
import { safeLocalStorage } from '@/platform/storage';

describe('useTheme composable', () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;
  let matchMediaMatches = false;
  let rafCallbacks: FrameRequestCallback[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    rafCallbacks = [];

    // Clean up DOM state before each test
    document.documentElement.removeAttribute('data-theme');
    const existingSuppress = document.getElementById('theme-transition-suppress');
    if (existingSuppress) {
      existingSuppress.remove();
    }

    // Set up or reset <meta name="theme-color">
    let metaTag = document.querySelector('meta[name="theme-color"]');
    if (!metaTag) {
      metaTag = document.createElement('meta');
      metaTag.setAttribute('name', 'theme-color');
      metaTag.setAttribute('content', '#ffffff');
      document.head.appendChild(metaTag);
    } else {
      metaTag.setAttribute('content', '#ffffff');
    }

    // Mock matchMedia
    originalMatchMedia = window.matchMedia;
    matchMediaMatches = false;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: matchMediaMatches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    // Mock requestAnimationFrame to test double-frame transition suppression cleanup
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });

    safeLocalStorage.clear();
    const { applyTheme } = useTheme();
    applyTheme(false);
    flushRaf();
    safeLocalStorage.clear();
    document.getElementById('theme-transition-suppress')?.remove();
  });

  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    }
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('theme-transition-suppress')?.remove();
  });

  function flushRaf() {
    while (rafCallbacks.length > 0) {
      const callbacks = [...rafCallbacks];
      rafCallbacks = [];
      callbacks.forEach((cb) => cb(performance.now()));
    }
  }

  it('initializes to light mode when matchMedia prefers-color-scheme is false', () => {
    matchMediaMatches = false;
    const { isDarkMode, initTheme } = useTheme();
    if (initTheme) initTheme();

    expect(isDarkMode.value).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('initializes to dark mode when matchMedia prefers-color-scheme is true', () => {
    matchMediaMatches = true;
    const { isDarkMode, initTheme } = useTheme();
    if (initTheme) initTheme();

    expect(isDarkMode.value).toBe(true);
  });

  it('toggleTheme() toggles isDarkMode ref between true and false', () => {
    matchMediaMatches = false;
    const { isDarkMode, toggleTheme } = useTheme();

    expect(isDarkMode.value).toBe(false);

    toggleTheme();
    expect(isDarkMode.value).toBe(true);

    toggleTheme();
    expect(isDarkMode.value).toBe(false);
  });

  it('applyTheme(true) adds data-theme="dark" attribute and updates meta theme-color to #0f0f1b', () => {
    const { isDarkMode, applyTheme } = useTheme();

    applyTheme(true);

    expect(isDarkMode.value).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const metaTag = document.querySelector('meta[name="theme-color"]');
    expect(metaTag?.getAttribute('content')).toBe('#0f0f1b');
  });

  it('applyTheme(false) removes data-theme attribute and updates meta theme-color to #ffffff', () => {
    const { isDarkMode, applyTheme } = useTheme();

    // First apply dark
    applyTheme(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Now apply light
    applyTheme(false);

    expect(isDarkMode.value).toBe(false);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    const metaTag = document.querySelector('meta[name="theme-color"]');
    expect(metaTag?.getAttribute('content')).toBe('#ffffff');
  });

  it('injects temporary transition suppression style tag and cleans up via requestAnimationFrame', () => {
    const { applyTheme } = useTheme();

    expect(document.getElementById('theme-transition-suppress')).toBeNull();

    applyTheme(true);

    // Suppression style tag should be injected into document.head
    const styleTag = document.getElementById('theme-transition-suppress');
    expect(styleTag).not.toBeNull();
    expect(styleTag?.textContent).toContain('transition: none !important');

    // Run first RAF frame - style tag should still exist
    if (rafCallbacks.length > 0) {
      const firstFrameCallbacks = [...rafCallbacks];
      rafCallbacks = [];
      firstFrameCallbacks.forEach((cb) => cb(performance.now()));
    }

    // Run second RAF frame - style tag should be cleanly removed
    flushRaf();
    expect(document.getElementById('theme-transition-suppress')).toBeNull();
  });

  it('handles missing meta tag gracefully without throwing', () => {
    const metaTag = document.querySelector('meta[name="theme-color"]');
    if (metaTag) {
      metaTag.remove();
    }

    const { applyTheme } = useTheme();
    expect(() => applyTheme(true)).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
