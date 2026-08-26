import type { MascotPersona } from '@fun-chess/shared';

/**
 * Peanut the Pup — Level 1: Novice (~400 ELO)
 * A playful puppy who loves chasing pawns, making fun blunders, and keeping kids encouraged.
 */
export const peanutPup: MascotPersona = {
  id: 'peanut',
  name: 'Peanut the Pup',
  avatar: '🐶',
  title: 'Playful Pup',
  eloEstimate: 400,
  difficulty: 'novice',
  description: 'I love chasing tennis balls, wagging my tail, and moving pawns! Sometimes I leave pieces on funny squares!',
  themeColor: 'hsl(28, 92%, 54%)',
  dialogues: {
    game_start: [
      "Bark! Let's have fun playing chess! 🐾",
      "I'm ready! Can I fetch a pawn? 🐶",
      "Woof! Let's play a friendly game! ✨",
      "Paws on the board! Let's play! 🎾",
    ],
    player_move: [
      "Ooh, nice move! Where will I jump? 🐾",
      "Sniff sniff... that looks interesting!",
      "Tail wagging! My turn now! 🐶",
      "Look at that piece go! Zoom! 🌟",
    ],
    ai_move: [
      "Paw to that square! Boop! 🐾",
      "Look at my happy little piece go!",
      "I rolled my piece over there! 🐶",
      "Wag wag! How about this move? ✨",
    ],
    player_check: [
      "Yikes! My King is in trouble! 🐶",
      "Ruff! That check surprised me! 🐾",
      "Woof! Where can my King hide? 🦴",
      "Good check! My King is scampering away!",
    ],
    ai_check: [
      "Check! Can your King run away? 🐾",
      "Woof! Look out for your King! 👑",
      "Check! Tail wagging with excitement! 🐶",
      "Bark! King alert! Can you block it? 🛡️",
    ],
    player_blunder: [
      "Oopsie! Did you mean to leave that piece there? 🐾",
      "Ruff! My turn to take a treat! 🦴",
      "Did a squirrel distract you? 🐶",
      "Nom nom! I caught a piece! 🎾",
    ],
    ai_blunder: [
      "Oopsie! I got distracted by a ball! 🎾",
      "Ruff! Did I leave my piece there? 🐶",
      "Silly puppy mistake! You got me! 🐾",
      "Aww, my shiny piece! Good eyes! ✨",
    ],
    player_win: [
      "Woof woof! You won! You're super smart at chess! 🏆🎉",
      "Bark! What a great game! High paw! 🐾",
      "You outplayed me! Great tactics! 👏",
      "Paws down, you are the champion! 🌟",
    ],
    ai_win: [
      "I did it! Good effort, friend! Want to play again? 🐾",
      "Good game! You played really well! 🐶",
      "Paws up for a great match! Rematch? 🦴",
      "That was super fun! Let's play another round! ✨",
    ],
    draw: [
      "A draw! We are equal puppy pals! 🤝",
      "Peaceful finish! High paw! 🐾",
      "Both kings are safe and sound! 🐶",
      "A tie! Time for a puppy nap! 🎾",
    ],
    hint_requested: [
      "Hints are great! Try that glowing move! 💡",
      "Woof! That looks like a super move! ✨",
      "A golden tip for you! Follow the light! 🐾",
      "My nose smells a great move on that square! 🐶",
    ],
    takeback_used: [
      "No problem! Let's rewind time! 🔄",
      "Takebacks help us learn! Try again! 🐾",
      "Rewind! Second chances are awesome! 🐶",
      "Let's try a different path! Woof! ✨",
    ],
  },
};
