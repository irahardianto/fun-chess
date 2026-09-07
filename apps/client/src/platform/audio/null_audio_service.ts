import type { IAudioService } from './audio.interface';

/**
 * Null Object test double implementation of IAudioService.
 * Completely no-op for headless test runs and SSR environments.
 */
export class NullAudioService implements IAudioService {
  playMove(): void {}
  playCapture(): void {}
  playCheck(): void {}
  playCheckmate(): void {}
  playVictory(): void {}
  playDefeat(): void {}
  playDraw(): void {}
  playError(): void {}
  playClick(): void {}
  playPickup(): void {}
  playTurnNotification(): void {}
  playStart(): void {}
  playHint(): void {}
  playStarEarned(): void {}
  playMascotHappy(): void {}
  playMascotBlunder(): void {}
  playStepComplete(): void {}
  toggleMute(): boolean {
    return false;
  }
  isMuted(): boolean {
    return true;
  }
  setMuted(_muted: boolean): void {}
  initContext(): AudioContext | null {
    return null;
  }
  resumeContext(): void {}
  async dispose(): Promise<void> {}
}
