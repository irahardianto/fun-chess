import type { MascotPersona } from '@fun-chess/shared';

/**
 * Sparky the Squirrel — Level 2: Beginner (~900 ELO)
 * A speedy acorn hunter who loves gathering pawns and playing fast, but misses sneaky pins.
 */
export const sparkySquirrel: MascotPersona = {
  id: 'sparky',
  name: 'Sparky the Squirrel',
  avatar: '🐿️',
  title: 'Acorn Hunter',
  eloEstimate: 900,
  difficulty: 'beginner',
  description: 'Fast, zippy, and loves collecting pieces like acorns for winter! Watch out for quick raids on unprotected pawns!',
  themeColor: 'hsl(18, 92%, 50%)',
  dialogues: {
    game_start: [
      "Acorns ready! Let's play fast! 🌰",
      "Scurrying onto the board! Game on! ⚡",
      "I'm looking for shiny pawns to hoard! 🐿️",
      "Zippy squirrel ready for action! Let's go! 🚀",
    ],
    player_move: [
      "Zippy move! Let me calculate at lightning speed! ⚡",
      "Hmm, guarding that acorn closely, aren't you?",
      "Quick paws! My turn to dart across the board! 🐿️",
      "Nice jump! But can you dodge my speedy reply? 🌰",
    ],
    ai_move: [
      "Zip zap! Placed right where I wanted it! 🌰",
      "Storing that piece in a secret tree hollow!",
      "Fast as lightning! Your turn! ⚡",
      "Scurried right onto that square! Boop! 🐿️",
    ],
    player_check: [
      "Whoa! Scurrying for safety! 🌰",
      "Yikes! My King needs a sturdy tree trunk! 🐿️",
      "Sharp check! Let me scramble away! ⚡",
      "Nutty check! My King is on the run! 🏃‍♂️",
    ],
    ai_check: [
      "Check! Zipping in like lightning! ⚡",
      "Check! Can't hide all your nuts from this attack! 🌰",
      "Acorn strike! King in danger! 👑",
      "Check! Fast squirrel maneuver! 🐿️",
    ],
    player_blunder: [
      "Hey! An unprotected piece! Nom nom! 🌰",
      "Free snack! I'll store this in my stash! 🐿️",
      "Did you drop that acorn by accident?",
      "Snagged it! Squirrels never miss free treats! ⚡",
    ],
    ai_blunder: [
      "Dropped my acorn! Bad move by me! 🌰",
      "Tsk! I scrambled onto the wrong branch! 🐿️",
      "Whoops! Scurried too fast and slipped! 🍂",
      "You caught my piece! Sharp eyes! ⚡",
    ],
    player_win: [
      "Incredible speed and tactics! You win! 🏆",
      "You gathered more acorns than me! Fantastic job! 🐿️🎉",
      "GG! You out-smarted my zippy attacks! 👏",
      "Victory to you! You're a lightning-fast chess champ! ⚡",
    ],
    ai_win: [
      "I got all the acorns! Good game, buddy! 🌰",
      "Victory dash! You put up a great fight! 🐿️",
      "Zippy win! Want to scramble again? 🔄",
      "High paws! That was a super fun race! ⚡",
    ],
    draw: [
      "A tie! We split the acorn stash evenly! 🌰🤝",
      "Neither of us could break through! Great defense! 🐿️",
      "Stalemate scurry! Good game!",
      "Evenly matched squirrels! Peace in the trees! 🌲",
    ],
    hint_requested: [
      "Ooh, that's a sharp idea! Go for it! 💡",
      "Look at that sparkling square! Grab the initiative! ⚡",
      "A nutty good move! Try it out! 🌰",
      "My squirrel senses say jump to that glowing square! 🐿️",
    ],
    takeback_used: [
      "Rewinding time! Let's pick a better branch! 🔄",
      "Undo button activated! Zipping back! ⚡",
      "Try a new route through the trees! 🐿️",
      "No sweat! Second chances make us stronger! 🌰",
    ],
  },
};
