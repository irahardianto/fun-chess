import { ref, type Ref, onScopeDispose, getCurrentScope } from 'vue';
import { safeLocalStorage } from '@/platform/storage';

export interface UseThemeReturn {
  isDarkMode: Ref<boolean>;
  toggleTheme: () => void;
  applyTheme: (dark: boolean, persist?: boolean) => void;
  initTheme: () => void;
}

const isDarkMode = ref(false);

// Module-level listener tracking (MIN-003)
let activeMediaQuery: MediaQueryList | null = null;
let activeMediaListener: ((e: MediaQueryListEvent | MediaQueryList) => void) | null = null;
let isMediaListenerRegistered = false;

type LegacyMediaQueryList = {
  addListener?: (fn: unknown) => void;
  removeListener?: (fn: unknown) => void;
};

/**
 * Detaches any active media query listeners and resets listener registration state.
 * Exported for test teardown and scope disposal.
 */
export function cleanupThemeListeners(): void {
  if (activeMediaQuery && activeMediaListener) {
    const legacyQuery = activeMediaQuery as LegacyMediaQueryList;
    if (typeof activeMediaQuery.removeEventListener === 'function') {
      activeMediaQuery.removeEventListener('change', activeMediaListener as (e: MediaQueryListEvent) => void);
    } else if (typeof legacyQuery.removeListener === 'function') {
      legacyQuery.removeListener(activeMediaListener);
    }
  }
  activeMediaQuery = null;
  activeMediaListener = null;
  isMediaListenerRegistered = false;
}

/**
 * useTheme composable
 * Manages theme state, transition suppression to prevent color smearing,
 * data-theme attribute synchronization, and idempotent media query listeners.
 */
export function useTheme(): UseThemeReturn {
  function applyTheme(dark: boolean, persist = true) {
    isDarkMode.value = dark;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      if (persist) {
        safeLocalStorage.safeSetItem('fun_chess_theme', dark ? 'dark' : 'light');
      }

      // Suppress CSS transitions temporarily during theme switch to prevent visual smearing
      const style = document.createElement('style');
      style.id = 'theme-transition-suppress';
      style.appendChild(
        document.createTextNode('*, *::before, *::after { transition: none !important; }')
      );
      document.head.appendChild(style);

      if (dark) {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }

      // Synchronize <meta name="theme-color"> with active theme
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) {
        themeMeta.setAttribute('content', dark ? '#0f0f1b' : '#ffffff');
      }

      // Force layout reflow
      const _flushReflow = document.body ? document.body.offsetHeight : 0;
      void _flushReflow;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          style.remove();
        });
      });
    }
  }

  function toggleTheme() {
    applyTheme(!isDarkMode.value, true);
  }

  function initTheme() {
    if (typeof window === 'undefined') return;

    const savedTheme = safeLocalStorage.getItem('fun_chess_theme');
    if (savedTheme === 'dark') {
      applyTheme(true, false);
      return;
    } else if (savedTheme === 'light') {
      applyTheme(false, false);
      return;
    }

    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      if (mediaQuery.matches) {
        applyTheme(true, false);
      }

      // Guard against duplicate listener registration (MIN-003)
      if (!isMediaListenerRegistered) {
        const listener = (e: MediaQueryListEvent | MediaQueryList) => {
          const explicit = safeLocalStorage.getItem('fun_chess_theme');
          if (!explicit) {
            applyTheme(Boolean(e.matches), false);
          }
        };

        const legacyQuery = mediaQuery as LegacyMediaQueryList;
        if (typeof mediaQuery.addEventListener === 'function') {
          mediaQuery.addEventListener('change', listener as (e: MediaQueryListEvent) => void);
        } else if (typeof legacyQuery.addListener === 'function') {
          legacyQuery.addListener(listener);
        }

        activeMediaQuery = mediaQuery;
        activeMediaListener = listener;
        isMediaListenerRegistered = true;
      }

      if (getCurrentScope()) {
        onScopeDispose(() => {
          cleanupThemeListeners();
        });
      }
    }
  }

  return {
    isDarkMode,
    toggleTheme,
    applyTheme,
    initTheme,
  };
}
