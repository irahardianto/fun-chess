/**
 * Sound effect types supported by Web Audio Synthesizer.
 */
export type SoundEffectType =
  | 'move'              // Subtle wooden click
  | 'capture'           // Satisfying pop / clack
  | 'check'             // Alert chime (high harmonics)
  | 'victory'           // Celebratory major arpeggio fanfare
  | 'draw'              // Neutral calm tone
  | 'start'             // Upbeat start chord
  | 'error'             // Low thud / buzz
  | 'hint'              // ✨ Sparkle chime (pentatonic bell)
  | 'star_earned'       // ⭐ 3-tone ascending chime
  | 'mascot_happy'      // 🐶 Upbeat chirp / bounce
  | 'mascot_blunder'    // 🐿️ Funny slide whistle down
  | 'step_complete';    // Positive ding
