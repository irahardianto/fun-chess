/**
 * Web Audio API synthesizer for zero-asset sound synthesis.
 * All sound effects are generated dynamically via oscillators and gain envelopes.
 * Adheres to Rule 1 (I/O Isolation) and MAJ-008 (DOM side-effect elimination).
 */
import type { IAudioService } from './audio.interface';

export interface AudioSynthesizerOptions {
  muted?: boolean;
}

export class AudioSynthesizer implements IAudioService {
  private ctx: AudioContext | null = null;
  private _isMuted: boolean = false;
  private masterGain: GainNode | null = null;
  private bootstrapped: boolean = false;

  constructor(options?: AudioSynthesizerOptions) {
    if (options?.muted !== undefined) {
      this._isMuted = options.muted;
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        try {
          this.ctx = new AudioCtxClass();
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.setValueAtTime(this._isMuted ? 0 : 0.4, this.ctx.currentTime);
          this.masterGain.connect(this.ctx.destination);
        } catch (err) {
          console.warn('[FC_AUDIO] Failed to initialize AudioContext', err);
          return null;
        }
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch((err) => {
        console.warn('[FC_AUDIO] Autoplay policy suspended AudioContext', err);
      });
    }

    return this.ctx;
  }

  public initContext(): AudioContext | null {
    return this.getContext();
  }

  public resumeContext(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch((err) => {
        console.warn('[FC_AUDIO] Failed to resume suspended AudioContext', err);
      });
    }
  }

  public isMuted(): boolean {
    return this._isMuted;
  }

  public setMuted(muted: boolean): void {
    this._isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 0.4, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    const newState = !this._isMuted;
    this.setMuted(newState);
    return newState;
  }

  /**
   * Explicit lifecycle bootstrap for user gesture unlock and visibility changes.
   * Eliminates module-import-level DOM side effects per MAJ-008.
   */
  public bootstrap(): void {
    if (this.bootstrapped || typeof window === 'undefined') return;
    this.bootstrapped = true;

    const unlockEvents = ['pointerdown', 'touchstart', 'keydown', 'click'];
    const unlockHandler = () => {
      this.initContext();
      unlockEvents.forEach((evt) => {
        try {
          window.removeEventListener(evt, unlockHandler, true);
        } catch (err) {
          console.warn('[FC_AUDIO] Failed to remove unlock listener', err);
        }
      });
    };

    unlockEvents.forEach((evt) => {
      try {
        window.addEventListener(evt, unlockHandler, { once: true, capture: true, passive: true });
      } catch (err) {
        console.warn('[FC_AUDIO] Failed to attach unlock listener', err);
      }
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.resumeContext();
        }
      });
    }
  }

  /**
   * Piece pickup / click: Sine wave 440 Hz (A4), 30ms click.
   */
  public playClick(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.035);
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play click sound', err);
    }
  }

  public playPickup(): void {
    this.playClick();
  }

  /**
   * Standard Move: Sine wave 320 Hz -> 200 Hz decay, 70ms. Soft wooden chess thud.
   */
  public playMove(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.07);

      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play move sound', err);
    }
  }

  /**
   * Piece Capture: Dual Triangle wave 480 Hz -> 120 Hz snap, 110ms crunchy pop.
   */
  public playCapture(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;

      // Oscillator 1: Triangle drop
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(480, now);
      osc1.frequency.exponentialRampToValueAtTime(120, now + 0.11);
      gain1.gain.setValueAtTime(0.7, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.115);
      osc1.connect(gain1);
      gain1.connect(this.masterGain);

      // Oscillator 2: Sine punch
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(240, now);
      osc2.frequency.exponentialRampToValueAtTime(80, now + 0.09);
      gain2.gain.setValueAtTime(0.5, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc2.connect(gain2);
      gain2.connect(this.masterGain);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.12);
      osc2.stop(now + 0.12);
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play capture sound', err);
    }
  }

  /**
   * Check Alert: Dual Square/Sine chime, 587 Hz (D5) -> 880 Hz (A5), 180ms high alert double chime.
   */
  public playCheck(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;

      // Note 1: 587 Hz (D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.5, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc1.connect(gain1);
      gain1.connect(this.masterGain);

      // Note 2: 880 Hz (A5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.08);
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.setValueAtTime(0.6, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(this.masterGain);

      osc1.start(now);
      osc1.stop(now + 0.095);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.23);
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play check sound', err);
    }
  }

  /**
   * Victory Fanfare: Major arpeggio (C5 -> E5 -> G5 -> C6), 550ms.
   */
  public playVictory(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const notes = [
        { freq: 523.25, time: 0.0, duration: 0.12 }, // C5
        { freq: 659.25, time: 0.11, duration: 0.12 }, // E5
        { freq: 783.99, time: 0.22, duration: 0.12 }, // G5
        { freq: 1046.5, time: 0.33, duration: 0.28 }, // C6
      ];

      notes.forEach(({ freq, time, duration }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.5, now + time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + duration);

        osc.connect(gain);
        gain.connect(this.masterGain!);

        osc.start(now + time);
        osc.stop(now + time + duration + 0.02);
      });
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play victory sound', err);
    }
  }

  /**
   * Defeat Sound: Descending minor arpeggio (G4 -> Eb4 -> C4), 380ms gentle melancholic chime.
   */
  public playDefeat(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const notes = [
        { freq: 392.0, time: 0.0, duration: 0.12 }, // G4
        { freq: 311.13, time: 0.1, duration: 0.14 }, // Eb4
        { freq: 261.63, time: 0.22, duration: 0.22 }, // C4
      ];

      notes.forEach(({ freq, time, duration }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.35, now + time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + duration);

        osc.connect(gain);
        gain.connect(this.masterGain!);

        osc.start(now + time);
        osc.stop(now + time + duration + 0.02);
      });
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play defeat sound', err);
    }
  }

  /**
   * Draw Sound: Gentle descending peaceful chime.
   */
  public playDraw(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(330, now + 0.3);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.33);
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play draw sound', err);
    }
  }

  /**
   * Illegal Move / Error: Sawtooth wave 130 Hz -> 80 Hz, 140ms friendly bonk.
   */
  public playError(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.14);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.145);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play error sound', err);
    }
  }

  /**
   * Turn Notification: Playful bell alerting player of their turn.
   */
  public playTurnNotification(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play turn notification sound', err);
    }
  }

  /**
   * Match start chord: Warm C-major chord.
   */
  public playStart(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const freqs = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5

      freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.masterGain!);

        osc.start(now);
        osc.stop(now + 0.36);
      });
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play start sound', err);
    }
  }

  /**
   * Hint Sparkle: Sparkle pentatonic chime (587.33 Hz [D5] -> 880.00 Hz [A5] -> 1174.66 Hz [D6]), 300ms.
   */
  public playHint(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const notes = [
        { freq: 587.33, time: 0.0, duration: 0.12 },
        { freq: 880.0, time: 0.08, duration: 0.14 },
        { freq: 1174.66, time: 0.16, duration: 0.22 },
      ];

      notes.forEach(({ freq, time, duration }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.4, now + time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + duration);

        osc.connect(gain);
        gain.connect(this.masterGain!);

        osc.start(now + time);
        osc.stop(now + time + duration + 0.02);
      });
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play hint sound', err);
    }
  }

  /**
   * Star Earned: 3-tone ascending major arpeggio (C5 -> E5 -> G5) with sparkling bell tones.
   */
  public playStarEarned(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const notes = [
        { freq: 523.25, time: 0.0, duration: 0.14 }, // C5
        { freq: 659.25, time: 0.1, duration: 0.16 }, // E5
        { freq: 783.99, time: 0.2, duration: 0.28 }, // G5
      ];

      notes.forEach(({ freq, time, duration }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.5, now + time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + duration);

        osc.connect(gain);
        gain.connect(this.masterGain!);

        osc.start(now + time);
        osc.stop(now + time + duration + 0.02);
      });
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play star earned sound', err);
    }
  }

  /**
   * Mascot Happy: Upbeat chirp / bounce, sliding up and settling with lively bounce.
   */
  public playMascotHappy(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.16);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.24);
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play mascot happy sound', err);
    }
  }

  /**
   * Mascot Blunder: Downward slide whistle.
   */
  public playMascotBlunder(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.32);

      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.36);
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play mascot blunder sound', err);
    }
  }

  /**
   * Step Complete: Positive bell chime with harmonics.
   */
  public playStepComplete(): void {
    if (this._isMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(this.masterGain);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1318.5, now);
      gain2.gain.setValueAtTime(0.25, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc2.connect(gain2);
      gain2.connect(this.masterGain);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.26);
      osc2.stop(now + 0.26);
    } catch (err) {
      console.warn('[FC_AUDIO] Failed to play step complete sound', err);
    }
  }
}

export const audioSynthesizer = new AudioSynthesizer();
