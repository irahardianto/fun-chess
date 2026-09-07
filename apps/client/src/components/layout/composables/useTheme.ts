import { ref, type Ref } from 'vue';
import { safeLocalStorage } from '@/platform/storage';

export interface UseThemeReturn {
  isDarkMode: Ref<boolean>;
  toggleTheme: () => void;
  applyTheme: (dark: boolean) => void;
  initTheme: () => void;
}

const isDarkMode = ref(false);

/**
 * useTheme composable
 * Manages theme state, transition suppression to prevent color smearing,
 * data-theme attribute synchronization, and theme-color meta tag updates.
 */
export function useTheme(): UseThemeReturn {
  function applyTheme(dark: boolean) {
    isDarkMode.value = dark;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      safeLocalStorage.safeSetItem('fun_chess_theme', dark ? 'dark' : 'light');

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
    applyTheme(!isDarkMode.value);
  }

  function initTheme() {
    if (typeof window === 'undefined') return;

    const savedTheme = safeLocalStorage.getItem('fun_chess_theme');
    if (savedTheme === 'dark') {
      applyTheme(true);
      return;
    } else if (savedTheme === 'light') {
      applyTheme(false);
      return;
    }

    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      if (mediaQuery.matches) {
        applyTheme(true);
      }
      mediaQuery.addEventListener?.('change', (e) => {
        const explicit = safeLocalStorage.getItem('fun_chess_theme');
        if (!explicit) {
          applyTheme(e.matches);
        }
      });
    }
  }

  return {
    isDarkMode,
    toggleTheme,
    applyTheme,
    initTheme,
  };
}
