/**
 * Audio Service interface contract.
 * Adheres to Architectural Patterns Rule 1: I/O Isolation.
 */
export interface IAudioService {
  /** Plays tactical game move sound effect */
  playMove(): void;
  /** Plays capture sound effect */
  playCapture(): void;
  /** Plays check alert sound */
  playCheck(): void;
  /** Plays game victory fanfare */
  playVictory(): void;
  /** Plays defeat sound */
  playDefeat(): void;
  /** Toggles global audio mute */
  toggleMute(): boolean;
  /** Audio mute status */
  isMuted(): boolean;
  /** Releases AudioContext resources and unbinds event listeners */
  dispose?(): Promise<void> | void;
}
