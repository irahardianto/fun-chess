import type { IAudioService } from './audio.interface';

/**
 * Null Object test double implementation of IAudioService.
 * Completely no-op for headless test runs and SSR environments.
 */
export class NullAudioService implements IAudioService {
  playMove(): void {}
  playCapture(): void {}
  playCheck(): void {}
  playVictory(): void {}
  playDefeat(): void {}
  toggleMute(): boolean {
    return false;
  }
  isMuted(): boolean {
    return true;
  }
}
