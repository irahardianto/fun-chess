/**
 * Confetti cannon trigger using canvas-confetti.
 * Fires full-screen celebration with gold, violet, emerald, and coral particles.
 * Respects prefers-reduced-motion.
 */
import defaultConfetti from 'canvas-confetti';

export interface ConfettiOptions {
  particleCount?: number;
  spread?: number;
  angle?: number;
  origin?: { x?: number; y?: number };
  colors?: string[];
  ticks?: number;
  gravity?: number;
  scalar?: number;
  shapes?: Array<'star' | 'circle' | 'square'>;
}

export class ConfettiTrigger {
  private confettiFn: typeof defaultConfetti;
  private isCustomFn: boolean;

  constructor(injectedConfetti?: typeof defaultConfetti) {
    this.confettiFn = injectedConfetti || defaultConfetti;
    this.isCustomFn = !!injectedConfetti;
  }

  private shouldReduceMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private canExecute(): boolean {
    if (this.shouldReduceMotion()) return false;
    if (this.isCustomFn) return true;
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    try {
      const testCanvas = document.createElement('canvas');
      return !!testCanvas.getContext?.('2d');
    } catch {
      return false;
    }
  }

  public triggerVictoryConfetti(): void {
    try {
      if (!this.canExecute()) return;

      const colors = ['#ffb300', '#6c5ce7', '#22c55e', '#ef4444', '#0ea5e9'];

      // Two cannons immediately fired (left and right)
      this.confettiFn({
        particleCount: 60,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors,
      });

      this.confettiFn({
        particleCount: 60,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors,
      });

      // Center burst fired after 300ms
      setTimeout(() => {
        try {
          if (this.shouldReduceMotion()) return;
          this.confettiFn({
            particleCount: 80,
            spread: 100,
            origin: { y: 0.6 },
            colors,
          });
        } catch {
          // Ignore
        }
      }, 300);
    } catch {
      // Confetti error handled safely
    }
  }

  public triggerDrawCelebration(): void {
    try {
      if (!this.canExecute()) return;

      this.confettiFn({
        particleCount: 40,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#94a3b8', '#64748b', '#cbd5e1'],
      });
    } catch {
      // Ignore
    }
  }

  public triggerCustom(options: ConfettiOptions = {}): void {
    try {
      if (!this.canExecute()) return;
      this.confettiFn(options as any);
    } catch {
      // Ignore
    }
  }
}

export const defaultConfettiTrigger = new ConfettiTrigger();
export const confettiTrigger = defaultConfettiTrigger;

export function triggerVictoryConfetti(): void {
  defaultConfettiTrigger.triggerVictoryConfetti();
}
