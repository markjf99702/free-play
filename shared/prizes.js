// The prize counter, cheapest first. Every machine on the floor pays tickets into the one wallet (wallet.js).
// `say` is how the counter hands it over: "You got a rubber duck."
export const PRIZES = [
  { id: 'lollipop', emoji: '🍭', name: 'Lollipop', cost: 5, say: 'a lollipop' },
  { id: 'spider-ring', emoji: '🕷️', name: 'Spider ring', cost: 10, say: 'a spider ring' },
  { id: 'balloon', emoji: '🎈', name: 'Balloon', cost: 15, say: 'a balloon' },
  { id: 'fuzzy-dice', emoji: '🎲', name: 'Fuzzy dice', cost: 25, say: 'a pair of fuzzy dice' },
  { id: 'yo-yo', emoji: '🪀', name: 'Yo-yo', cost: 40, say: 'a yo-yo' },
  { id: 'magnet', emoji: '🧲', name: 'Horseshoe magnet', cost: 50, say: 'a horseshoe magnet' },
  { id: 'duck', emoji: '🦆', name: 'Rubber duck', cost: 75, say: 'a rubber duck' },
  { id: 'shades', emoji: '🕶️', name: 'Novelty shades', cost: 100, say: 'a pair of novelty shades' },
  { id: 'dinosaur', emoji: '🦖', name: 'Toy dinosaur', cost: 150, say: 'a toy dinosaur' },
  { id: 'disc', emoji: '🥏', name: 'Flying disc', cost: 200, say: 'a flying disc' },
  { id: 'fortune-ball', emoji: '🎱', name: 'Fortune ball', cost: 300, say: 'a fortune ball' },
  { id: 'kite', emoji: '🪁', name: 'Kite', cost: 400, say: 'a kite' },
  { id: 'octopus', emoji: '🐙', name: 'Stuffed octopus', cost: 600, say: 'a stuffed octopus' },
  { id: 'flamingo', emoji: '🦩', name: 'Blow-up flamingo', cost: 900, say: 'a blow-up flamingo' },
  { id: 'bear', emoji: '🧸', name: 'Giant teddy bear', cost: 1500, say: 'a giant teddy bear' },
  { id: 'unicorn', emoji: '🦄', name: 'Enormous unicorn', cost: 2500, say: 'an enormous unicorn' },
];

// The plush in Clutch, the claw machine. They're won outright, not traded for, so they sit on the shelf but not on the
// counter. kind is the machine's name for each (clutch/js/machine.js).
export const PLUSH = [
  { id: 'plush-bear', kind: 'bear', emoji: '🐻', name: 'Plush bear', say: 'a plush bear' },
  { id: 'plush-chick', kind: 'chick', emoji: '🐥', name: 'Plush chick', say: 'a plush chick' },
  { id: 'plush-frog', kind: 'frog', emoji: '🐸', name: 'Plush frog', say: 'a plush frog' },
  { id: 'plush-ghost', kind: 'ghost', emoji: '👻', name: 'Plush ghost', say: 'a plush ghost' },
  { id: 'plush-penguin', kind: 'penguin', emoji: '🐧', name: 'Plush penguin', say: 'a plush penguin' },
  { id: 'plush-alien', kind: 'alien', emoji: '👽', name: 'Plush alien', say: 'a plush alien' },
  { id: 'plush-star', kind: 'star', emoji: '🌟', name: 'Lucky star', say: 'the lucky star' },
];

// The prizes on Topple's deck, pushed off over the edge with the coins. Won outright too, like the plush.
// kind is the machine's name for each (topple/js/app.js); the gem turns up less often than the rest.
export const TRINKETS = [
  { id: 'trinket-watch', kind: 'watch', emoji: '⌚', name: 'Plastic watch', say: 'a plastic watch' },
  { id: 'trinket-car', kind: 'car', emoji: '🚗', name: 'Toy car', say: 'a toy car' },
  { id: 'trinket-keyring', kind: 'keyring', emoji: '🔑', name: 'Lucky keyring', say: 'a lucky keyring' },
  { id: 'trinket-robot', kind: 'robot', emoji: '🤖', name: 'Wind-up robot', say: 'a wind-up robot' },
  { id: 'trinket-gem', kind: 'gem', emoji: '💎', name: 'Giant plastic gem', say: 'a giant plastic gem', rare: true },
];

// Everything that can sit on the shelf, in the order it sits there.
export const SHELF = [...PRIZES, ...PLUSH, ...TRINKETS];
