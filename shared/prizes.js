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

// Trophies, one for each machine's hardest feat, won outright and never sold: each goes on the shelf the moment it's
// earned (another one each time), and they stand together at the end of it, each on a plinth in its machine's colours.
// feat is what it's for, as a tap on the shelf says. Each feat is one the simulated players manage in fewer than one
// round in 50 (see the README).
export const TROPHIES = [
  { id: 'trophy-roll-up', machine: 'roll-up', emoji: '🏆', name: 'Roll Up trophy', say: 'the Roll Up trophy', plinth: '#c23a2e', feat: "all nine calls on today's card" },
  { id: 'trophy-tilt-classic', machine: 'tilt', emoji: '🏆', name: 'Tilt Classic trophy', say: 'the Tilt Classic trophy', plinth: '#ffa53a', feat: 'a 5x bonus, the top lanes made four times on one ball' },
  { id: 'trophy-tilt-space', machine: 'tilt', emoji: '🏆', name: 'Tilt Space trophy', say: 'the Tilt Space trophy', plinth: '#8f7bff', feat: 'five jackpots in a game' },
  { id: 'trophy-tilt-haunted', machine: 'tilt', emoji: '🏆', name: 'Tilt Haunted House trophy', say: 'the Tilt Haunted House trophy', plinth: '#6fe3a2', feat: 'the front door opened three times in a game' },
  { id: 'trophy-highrise', machine: 'highrise', emoji: '🏆', name: 'Highrise trophy', say: 'the Highrise trophy', plinth: '#5cc8ff', feat: 'all fifteen floors' },
  { id: 'trophy-popgun', machine: 'popgun', emoji: '🏆', name: 'Popgun trophy', say: 'the Popgun trophy', plinth: '#d63a2f', feat: 'a round with every cork a hit, the bell among them' },
  { id: 'trophy-bonkers', machine: 'bonkers', emoji: '🏆', name: 'Bonkers trophy', say: 'the Bonkers trophy', plinth: '#ffc93c', feat: 'a round of 40 moles bonked and not one miss' },
  { id: 'trophy-hoops', machine: 'hoops', emoji: '🏆', name: 'Hoops trophy', say: 'the Hoops trophy', plinth: '#ff8a1f', feat: '65 baskets in a round' },
];
export const trophy = id => TROPHIES.find(t => t.id === id);

// Everything that can sit on the shelf, in the order it sits there.
export const SHELF = [...PRIZES, ...PLUSH, ...TRINKETS, ...TROPHIES];
