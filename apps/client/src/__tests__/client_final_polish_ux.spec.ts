import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { mount } from '@vue/test-utils';
import BaseButton from '../components/base/BaseButton.vue';

/**
 * Calculates WCAG 2.1 / 2.2 relative luminance from 8-bit RGB components.
 */
function toLinear(val: number): number {
  const s = val / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function getRelativeLuminance(r: number, g: number, b: number): number {
  const rLin = toLinear(r);
  const gLin = toLinear(g);
  const bLin = toLinear(b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Calculates WCAG 2.1 / 2.2 contrast ratio between two colors.
 */
function getContrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const lum1 = getRelativeLuminance(...rgb1);
  const lum2 = getRelativeLuminance(...rgb2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Converts HSL to RGB [0-255].
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (h >= 0 && h < 60) {
    rPrime = c; gPrime = x; bPrime = 0;
  } else if (h >= 60 && h < 120) {
    rPrime = x; gPrime = c; bPrime = 0;
  } else if (h >= 120 && h < 180) {
    rPrime = 0; gPrime = c; bPrime = x;
  } else if (h >= 180 && h < 240) {
    rPrime = 0; gPrime = x; bPrime = c;
  } else if (h >= 240 && h < 300) {
    rPrime = x; gPrime = 0; bPrime = c;
  } else {
    rPrime = c; gPrime = 0; bPrime = x;
  }

  return [
    Math.round((rPrime + m) * 255),
    Math.round((gPrime + m) * 255),
    Math.round((bPrime + m) * 255),
  ];
}

/**
 * Converts 6-char hex color to RGB.
 */
function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.replace(/^#/, '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return [r, g, b];
}

describe('Client Final Polish: UX-001 & UX-002 Conformance', () => {
  const designTokensPath = path.resolve(__dirname, '../assets/design-tokens.css');
  const baseButtonPath = path.resolve(__dirname, '../components/base/BaseButton.vue');
  const soloAiArenaPath = path.resolve(__dirname, '../features/ai/SoloAiArena.vue');
  const qrScannerViewPath = path.resolve(__dirname, '../features/portability/components/QrScannerView.vue');

  const designTokensSrc = fs.readFileSync(designTokensPath, 'utf-8');
  const baseButtonSrc = fs.readFileSync(baseButtonPath, 'utf-8');
  const soloAiArenaSrc = fs.readFileSync(soloAiArenaPath, 'utf-8');
  const qrScannerViewSrc = fs.readFileSync(qrScannerViewPath, 'utf-8');

  describe('UX-001: Dark Mode Primary Button Contrast (WCAG 2.1 AA >= 4.5:1)', () => {
    it('defines --text-on-primary in :root for light mode', () => {
      expect(designTokensSrc).toMatch(/:root\s*\{[^}]*--text-on-primary:\s*#ffffff;/s);
    });

    it('defines --text-on-primary override in [data-theme=\'dark\'] as #0f172a', () => {
      expect(designTokensSrc).toMatch(/\[data-theme=['"]dark['"]\]\s*\{[^}]*--text-on-primary:\s*#0f172a;/s);
    });

    it('guarantees dark mode primary button text achieves at least 4.5:1 contrast against lavender primary', () => {
      // Dark mode primary background: hsl(255, 85%, 72%)
      const primaryBgRgb = hslToRgb(255, 0.85, 0.72);
      // Dark mode text on primary: #0f172a
      const textOnPrimaryRgb = hexToRgb('#0f172a');
      // White fallback text: #ffffff
      const whiteRgb = hexToRgb('#ffffff');

      const contrastWithNavy = getContrastRatio(primaryBgRgb, textOnPrimaryRgb);
      const contrastWithWhite = getContrastRatio(primaryBgRgb, whiteRgb);

      // Verify that white text fails WCAG AA on light lavender
      expect(contrastWithWhite).toBeLessThan(4.5);

      // Verify that #0f172a dark navy text comfortably passes WCAG AA (>= 4.5:1)
      expect(contrastWithNavy).toBeGreaterThanOrEqual(4.5);
    });

    it('defines .btn-primary utility class in design-tokens.css utilizing var(--text-on-primary)', () => {
      expect(designTokensSrc).toMatch(/\.btn-primary\s*\{[^}]*background-color:\s*var\(--color-primary\)/s);
      expect(designTokensSrc).toMatch(/\.btn-primary\s*\{[^}]*color:\s*var\(--text-on-primary\)/s);
      expect(designTokensSrc).toMatch(/\.btn-primary:hover:not\(:disabled\)\s*\{[^}]*color:\s*var\(--text-on-primary\)/s);
      expect(designTokensSrc).toMatch(/\.btn-primary:active:not\(:disabled\)\s*\{[^}]*color:\s*var\(--text-on-primary\)/s);
    });

    it('BaseButton component styles use var(--text-on-primary) and exposes btn-primary class', () => {
      expect(baseButtonSrc).toMatch(/color:\s*var\(--text-on-primary\);/);

      const wrapper = mount(BaseButton, {
        props: {
          variant: 'primary',
        },
        slots: {
          default: 'Confirm Move',
        },
      });

      expect(wrapper.classes()).toContain('btn-tactile--primary');
      expect(wrapper.classes()).toContain('btn-primary');
    });
  });

  describe('UX-002: Mobile Touch Targets (>= 44x44px)', () => {
    it('SoloAiArena .hint-close-btn has min-width: 44px, min-height: 44px, and flex centering', () => {
      expect(soloAiArenaSrc).toMatch(/\.hint-close-btn\s*\{[^}]*min-width:\s*44px;/s);
      expect(soloAiArenaSrc).toMatch(/\.hint-close-btn\s*\{[^}]*min-height:\s*44px;/s);
      expect(soloAiArenaSrc).toMatch(/\.hint-close-btn\s*\{[^}]*display:\s*inline-flex;/s);
      expect(soloAiArenaSrc).toMatch(/\.hint-close-btn\s*\{[^}]*align-items:\s*center;/s);
      expect(soloAiArenaSrc).toMatch(/\.hint-close-btn\s*\{[^}]*justify-content:\s*center;/s);
    });

    it('QrScannerView .manual-drawer-toggle has min-height: 44px and flex centering', () => {
      expect(qrScannerViewSrc).toMatch(/\.manual-drawer-toggle\s*\{[^}]*min-height:\s*44px;/s);
      expect(qrScannerViewSrc).toMatch(/\.manual-drawer-toggle\s*\{[^}]*display:\s*inline-flex;/s);
      expect(qrScannerViewSrc).toMatch(/\.manual-drawer-toggle\s*\{[^}]*align-items:\s*center;/s);
      expect(qrScannerViewSrc).toMatch(/\.manual-drawer-toggle\s*\{[^}]*justify-content:\s*center;/s);
    });
  });
});
