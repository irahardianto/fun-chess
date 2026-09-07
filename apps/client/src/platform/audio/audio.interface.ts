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
  /** Plays decisive checkmate sound */
  playCheckmate(): void;
  /** Plays game victory fanfare */
  playVictory(): void;
  /** Plays defeat sound */
  playDefeat(): void;
  /** Plays game draw sound */
  playDraw(): void;
  /** Plays illegal move or error sound */
  playError(): void;
  /** Plays interactive click sound */
  playClick(): void;
  /** Plays piece pickup sound */
  playPickup(): void;
  /** Plays turn notification chime */
  playTurnNotification(): void;
  /** Plays match start sound */
  playStart(): void;
  /** Plays hint audio effect */
  playHint(): void;
  /** Plays star earned fanfare */
  playStarEarned(): void;
  /** Plays mascot happy animation sound */
  playMascotHappy(): void;
  /** Plays mascot blunder animation sound */
  playMascotBlunder(): void;
  /** Plays step completion sound */
  playStepComplete(): void;
  /** Toggles global audio mute */
  toggleMute(): boolean;
  /** Audio mute status */
  isMuted(): boolean;
  /** Sets audio mute state explicitly */
  setMuted(muted: boolean): void;
  /** Initializes AudioContext if supported */
  initContext(): AudioContext | null;
  /** Resumes suspended AudioContext on user gesture */
  resumeContext(): void;
  /** Releases AudioContext resources and unbinds event listeners */
  dispose(): Promise<void> | void;
}
