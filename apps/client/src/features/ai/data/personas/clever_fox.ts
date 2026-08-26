import type { MascotPersona } from '@fun-chess/shared';

/**
 * Clever Fox — Level 3: Intermediate (~1300 ELO)
 * A cunning tactician who looks for sneaky forks, pins, and skewers.
 */
export const cleverFox: MascotPersona = {
  id: 'fox',
  name: 'Clever Fox',
  avatar: '🦊',
  title: 'Tactical Trickster',
  eloEstimate: 1300,
  difficulty: 'intermediate',
  description: 'A cunning tactician who looks for sneaky forks, pins, and skewers. Play sharp or get tricked by the sly fox!',
  themeColor: 'hsl(9, 88%, 56%)',
  dialogues: {
    game_start: [
      "Let's see your opening moves! 🦊",
      "A game of wits! Let the cunning contest begin! 🎩",
      "Keep your eyes on every diagonal and file! 🌲",
      "The fox enters the arena. Prepare your defenses! ✨",
    ],
    player_move: [
      "A thoughtful move... but have you spotted my counter-plan? 🦊",
      "Nice try defending that square! Let's see if you spot this!",
      "Interesting setup. Let's see how deep your plan goes. 🔍",
      "A sly maneuver! You're keeping me on my toes! 🐾",
    ],
    ai_move: [
      "A subtle repositioning... notice the tactical pressure? 🦊",
      "Moving with fox-like stealth! 🐾",
      "Setting a neat little trap... can you see it? 🔍",
      "Step into my tactical web! Your move! 🕸️",
    ],
    player_check: [
      "Well spotted! I must relocate. 🦊",
      "A clever check! My King retreats smoothly.",
      "Impressive thrust! Let me sidestep gracefully. 🛡️",
      "Sharp attack! The fox must find safer ground!",
    ],
    ai_check: [
      "Check! Your King looks uncomfortable! 👑",
      "Check! The fox has trapped the monarch! 🦊",
      "Check! Finding shelter won't be so simple! 🎯",
      "Check! A fork or a trap? Think carefully! ⚡",
    ],
    player_blunder: [
      "Aha! That diagonal is looking open! 🦊",
      "A slight tactical slip... I shall capitalize!",
      "The fox strikes! Thank you for the opening! 🎯",
      "Never leave a piece undefended against a fox! 🐾",
    ],
    ai_blunder: [
      "Tsk, I underestimated your tactic! 🦊",
      "Curious... I missed that defender! Well played! 👏",
      "A rare slip by the fox! You caught me! 🍂",
      "Brilliant counter! My cunning plan was foiled!",
    ],
    player_win: [
      "Remarkable tactics! You outwitted the Clever Fox! 🏆👏",
      "Outstanding vision! You deserve this victory! 🦊🎉",
      "Brilliant chess! You saw right through my tricks! 🎓",
      "Masterful play! Even the slyest fox must bow! 🎩",
    ],
    ai_win: [
      "Checkmate! A cunning finish! You played very bravely! 🦊",
      "Victory for the fox! You are getting stronger every match! 🌟",
      "Good game! Care to test your wits against me again? 🔄",
      "The trap snapped shut! Magnificent battle nonetheless! 👏",
    ],
    draw: [
      "A masterful draw! Our wits are evenly matched! 🤝",
      "A dead heat! Neither fox nor hunter could prevail! 🦊",
      "Balanced to the very last pawn! Well played. ⚖️",
      "A duel of masterminds ending in harmony!",
    ],
    hint_requested: [
      "A clever maneuver! Play it! 💡",
      "A sharp tactical idea right there on the board! 🦊",
      "That move puts maximum pressure on my position! ✨",
      "The fox reveals a secret path to victory! 🔍",
    ],
    takeback_used: [
      "A second chance to find the cunning path! 🔄",
      "Rewinding... now look for the tactical refutation! 🦊",
      "Good choice to reconsider that move!",
      "Second thoughts make wise tacticians! Try again! ✨",
    ],
  },
};
