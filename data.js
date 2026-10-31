// Lanternbearers game content: heroes, monsters, items, props, rooms and story text.
// Numbers come from DESIGN.md. tools/check.mjs and tests/data.test.mjs validate this file.
// Dice are { n, d, plus }: { n: 1, d: 8, plus: 1 } is d8+1, and n: 0 means a flat amount.
// Squares are [col, row] on the 12x7 grid in layout.js: row 0 is the back wall, row 6 the front.
// A size-2 monster's `at` is its top-left square; it covers [c, r] to [c + 1, r + 1].
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LB_DATA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const heroes = {
    knight: {
      id: 'knight', name: 'Rowan', title: 'Knight', art: 'hero-knight', color: '#4a7be0',
      blurb: 'A brave knight with a big blue shield who keeps her friends safe.',
      hearts: 14, move: 4, defense: 14, attack: 4, damage: { n: 1, d: 8, plus: 1 },
      range: 1, light: 2, attackKind: 'melee',
      ability: {
        id: 'shield-wall', name: 'Shield Wall',
        text: 'Until your next turn, get +2 Defense, and monsters must hit you instead of friends beside you.',
        short: '+2 Defense, guards friends', // the hero bar's button and the party card at 768 px tall
        defense: 2,
      },
    },
    ranger: {
      id: 'ranger', name: 'Fennick', title: 'Ranger', art: 'hero-ranger', color: '#4fb06a',
      blurb: 'A sharp-eyed ranger who can hit a target from across the room.',
      hearts: 10, move: 5, defense: 12, attack: 5, damage: { n: 1, d: 6, plus: 1 },
      range: 6, light: 2, attackKind: 'arrow',
      ability: {
        id: 'twin-arrows', name: 'Twin Arrows',
        text: 'Shoot two arrows this turn, at one monster or at two different ones.',
        short: 'Two arrows this turn',
        attacks: 2,
      },
    },
    wizard: {
      id: 'wizard', name: 'Juniper', title: 'Wizard', art: 'hero-wizard', color: '#a36bf0',
      blurb: 'A clever wizard who throws sparkly spells and big bursts of fire.',
      hearts: 8, move: 4, defense: 11, attack: 5, damage: { n: 1, d: 6, plus: 2 },
      range: 5, light: 2, attackKind: 'spark',
      ability: {
        id: 'fireburst', name: 'Fireburst',
        text: 'Throw a fireball up to 5 squares away that always hits every monster on and around that spot.',
        short: 'A fireball that always hits',
        range: 5, radius: 1, damage: { n: 2, d: 6, plus: 0 },
      },
    },
    lightbringer: {
      id: 'lightbringer', name: 'Oren', title: 'Lightbringer', art: 'hero-lightbringer', color: '#f0a63a',
      blurb: 'A kind healer whose lantern staff shoots sunbolts and patches up friends.',
      hearts: 11, move: 4, defense: 13, attack: 4, damage: { n: 1, d: 4, plus: 1 },
      // Sunbolt: a bolt of lantern light, so Oren always has something to do from the back.
      range: 4, light: 2, attackKind: 'sunbolt', attackName: 'Sunbolt',
      ability: {
        id: 'sunburst', name: 'Sunburst',
        text: 'Heal every hero within 2 squares, and push every monster within 2 squares one step away.',
        short: 'Heal friends, push monsters',
        radius: 2, heal: { n: 1, d: 6, plus: 3 }, push: 1,
      },
      // Mend is the Lightbringer's everyday action, usable every turn.
      mend: {
        id: 'mend', name: 'Mend',
        text: 'Heal one hero up to 2 squares away with a warm beam of light.',
        range: 2, heal: { n: 1, d: 6, plus: 2 },
      },
    },
  };

  // Monster numbers are tuned by tools/sim.mjs (qa/balance.md), so some differ from DESIGN.md's starting values.
  const monsters = {
    gloomling: {
      id: 'gloomling', name: 'Gloomling', art: 'monster-gloomling',
      hearts: 12, move: 5, defense: 11, attack: 3, damage: { n: 1, d: 4, plus: 1 },
      range: 1, attackKind: 'melee', size: 1, traits: ['shy'],
      blurb: 'A little shadow imp that dislikes bright light and pops into wisps.',
    },
    rattlebones: {
      id: 'rattlebones', name: 'Rattlebones', art: 'monster-rattlebones',
      hearts: 11, move: 3, defense: 13, attack: 4, damage: { n: 1, d: 6, plus: 0 },
      range: 1, attackKind: 'melee', size: 1, traits: [],
      blurb: 'A goofy skeleton guard who is much sturdier than he looks.',
    },
    goblin: {
      id: 'goblin', name: 'Lantern Goblin', art: 'monster-goblin',
      hearts: 12, move: 5, defense: 12, attack: 4, damage: { n: 1, d: 6, plus: 0 },
      range: 1, attackKind: 'melee', size: 1, traits: ['snuffer'],
      blurb: 'A sneaky thief who blows out braziers when nobody is looking.',
    },
    slinger: {
      id: 'slinger', name: 'Goblin Slinger', art: 'monster-slinger',
      hearts: 10, move: 4, defense: 12, attack: 4, damage: { n: 1, d: 4, plus: 1 },
      range: 5, attackKind: 'sling', size: 1, traits: ['keeps-away'],
      blurb: 'A goblin with a sling who likes to keep its distance.',
    },
    sporecap: {
      id: 'sporecap', name: 'Sporecap', art: 'monster-sporecap',
      hearts: 18, move: 2, defense: 11, attack: 4, damage: { n: 1, d: 4, plus: 1 },
      range: 1, attackKind: 'melee', size: 1, traits: ['sleepy-spores'],
      blurb: 'A sleepy walking mushroom whose spores make heroes too drowsy to move.',
    },
    mimic: {
      id: 'mimic', name: 'Mimic', art: 'monster-mimic',
      hearts: 20, move: 3, defense: 13, attack: 5, damage: { n: 1, d: 8, plus: 1 },
      range: 1, attackKind: 'bite', size: 1, traits: ['mimic'],
      drops: 2, // loot rolls from the room's table when defeated
      blurb: 'A treasure chest with teeth, a long tongue and a very big appetite.',
    },
    gloamwing: {
      id: 'gloamwing', name: 'Gloamwing', title: 'The Lantern-Eater', art: 'boss-gloamwing',
      hearts: 55, move: 3, defense: 14, attack: 6, damage: { n: 1, d: 10, plus: 2 },
      range: 1, attackKind: 'melee', size: 2, boss: true, traits: ['flying', 'boss'],
      blurb: 'A giant shadow moth that gobbles up every bit of light it can find.',
      // Gloamwing does one of these each turn (DESIGN.md).
      moves: [
        { id: 'wing-gust', name: 'Wing Gust', radius: 2, push: 2, damage: { n: 1, d: 4, plus: 0 },
          text: 'Every hero within 2 squares is blown back 2 squares and gets a small bump.' },
        { id: 'swoop', name: 'Swoop',
          text: 'Gloamwing flies in and attacks the hero with the fewest hearts.' },
        { id: 'eat-the-light', name: 'Eat the Light', heal: 4,
          text: 'Gloamwing gobbles up the light of the nearest brazier and heals 4 hearts.' },
      ],
      summon: { type: 'gloomling', count: 2, below: 0.5 }, // once, at half hearts
    },
  };

  // kind: heal | bomb | zap | lantern | speed | sunbeam | gear | gold.
  // target: hero (you or a hero next to you) | square | monster (visible) | self | none.
  // Gear ("keeps") goes straight to the hero who opened the chest instead of the party bag.
  const items = {
    potion: {
      id: 'potion', name: 'Healing Potion', art: 'loot-potion', kind: 'heal', target: 'hero',
      heal: { n: 2, d: 4, plus: 2 }, range: 1,
      text: 'Heals you or a hero next to you.',
    },
    'big-potion': {
      id: 'big-potion', name: 'Big Healing Potion', art: 'loot-big-potion', kind: 'heal', target: 'hero',
      heal: { n: 4, d: 4, plus: 4 }, range: 1,
      text: 'Heals you or a hero next to you by a whole lot.',
    },
    'star-biscuit': {
      id: 'star-biscuit', name: 'Star Biscuit', art: 'loot-star-biscuit', kind: 'heal', target: 'hero',
      heal: { n: 0, d: 4, plus: 4 }, range: 1,
      text: 'A crunchy snack that heals 4 hearts.',
    },
    firebomb: {
      id: 'firebomb', name: 'Firebomb', art: 'loot-firebomb', kind: 'bomb', target: 'square',
      damage: { n: 2, d: 6, plus: 0 }, range: 4, radius: 1,
      text: 'Throw it up to 4 squares to hurt everything on that spot and next to it.',
    },
    'lightning-scroll': {
      id: 'lightning-scroll', name: 'Lightning Scroll', art: 'loot-lightning-scroll', kind: 'zap', target: 'monster',
      damage: { n: 3, d: 6, plus: 0 }, range: 99, // anywhere in the room
      text: 'Zap one monster you can see, anywhere in the room.',
    },
    'bright-oil': {
      id: 'bright-oil', name: 'Bright Oil', art: 'loot-bright-oil', kind: 'lantern', target: 'self',
      light: 2, range: 0,
      text: 'Your lantern shines 2 squares farther for the rest of the room.',
    },
    'feather-charm': {
      id: 'feather-charm', name: 'Feather Charm', art: 'loot-feather-charm', kind: 'speed', target: 'self',
      move: 2, range: 0,
      text: 'Move 2 extra squares this turn.',
    },
    'bottled-sunbeam': {
      id: 'bottled-sunbeam', name: 'Bottled Sunbeam', art: 'loot-bottled-sunbeam', kind: 'sunbeam', target: 'none',
      range: 0,
      text: 'Lights every brazier in the room at once!',
    },
    'shield-charm': {
      id: 'shield-charm', name: 'Shield Charm', art: 'loot-shield-charm', kind: 'gear', target: 'self',
      gear: { defense: 1 }, keeps: true, range: 0,
      text: 'Keeps: +1 Defense for the rest of the adventure.',
    },
    'sharpening-stone': {
      id: 'sharpening-stone', name: 'Sharpening Stone', art: 'loot-sharpening-stone', kind: 'gear', target: 'self',
      gear: { damage: 1 }, keeps: true, range: 0,
      text: 'Keeps: your attacks do +1 damage for the rest of the adventure.',
    },
    boots: {
      id: 'boots', name: 'Boots of Bounding', art: 'loot-boots', kind: 'gear', target: 'self',
      gear: { move: 1 }, keeps: true, range: 0,
      text: 'Keeps: move 1 extra square for the rest of the adventure.',
    },
    gold: {
      id: 'gold', name: 'Gold', art: 'loot-gold', kind: 'gold', target: 'none',
      gold: { min: 5, max: 20 }, range: 0,
      text: 'Shiny coins for the party, counted at the end.',
    },
  };

  // How each prop type behaves and how big it draws. height is in floor squares; the picture
  // keeps its own width-to-height shape, so these heights keep each prop about one square wide.
  const props = {
    brazier: { id: 'brazier', name: 'Brazier', art: 'prop-brazier', blocks: true, height: 1.1, light: 4 },
    chest: { id: 'chest', name: 'Treasure Chest', art: 'prop-chest', openArt: 'prop-chest-open', blocks: true, height: 0.9 },
    pillar: { id: 'pillar', name: 'Pillar', art: 'prop-pillar', blocks: true, height: 2.3 },
    rubble: { id: 'rubble', name: 'Rubble', art: 'prop-rubble', blocks: true, height: 0.7 },
    crates: { id: 'crates', name: 'Crates', art: 'prop-crates', blocks: true, height: 1.3 },
    barrel: { id: 'barrel', name: 'Barrel', art: 'prop-barrel', blocks: true, height: 1.0 },
    // glow is decoration only (a soft colored halo); it doesn't light squares.
    mushrooms: { id: 'mushrooms', name: 'Glowing Mushrooms', art: 'prop-mushrooms', blocks: true, height: 1.35, glow: '#55e0d2' },
    'weapon-rack': { id: 'weapon-rack', name: 'Weapon Rack', art: 'prop-weapon-rack', blocks: true, height: 1.5 },
    sarcophagus: { id: 'sarcophagus', name: 'Sarcophagus', art: 'prop-sarcophagus', blocks: true, height: 1.0 },
    bookshelf: { id: 'bookshelf', name: 'Bookshelf', art: 'prop-bookshelf', blocks: true, height: 2.4 },
    'heart-lantern': { id: 'heart-lantern', name: 'Heart Lantern', art: 'prop-heart-lantern', blocks: true, height: 2.8 },
  };

  // Six rooms; a run visits five. Heroes start on row 6 and monsters start in the dark (rows 0-3).
  // Squares in row 0 under a doorway stay clear so heroes can always walk out.
  const rooms = [
    {
      id: 'gate-hall', name: 'The Gate Hall', art: 'room-gate-hall',
      intro: 'The old gate hall is dark, and something is giggling in the shadows. Light the braziers to see who!',
      exits: [{ arch: 'left', to: 'mushroom-grotto' }, { arch: 'right', to: 'old-armory' }],
      start: [[3, 6], [5, 6], [6, 6], [8, 6]],
      props: [
        { type: 'brazier', at: [2, 3] },
        { type: 'brazier', at: [9, 1] },
        { type: 'pillar', at: [4, 3] },
        { type: 'pillar', at: [7, 3] },
        { type: 'chest', at: [11, 1] },
      ],
      monsters: [
        { type: 'gloomling', at: [2, 1] },
        { type: 'gloomling', at: [6, 1] },
        { type: 'gloomling', at: [8, 2] },
        { type: 'rattlebones', at: [10, 2] },
      ],
      loot: ['potion', 'star-biscuit', 'feather-charm', 'bright-oil', 'gold'],
    },
    {
      id: 'mushroom-grotto', name: 'The Mushroom Grotto', art: 'room-mushroom-grotto',
      intro: 'Giant glowing mushrooms fill this soggy cave. Watch out: some of them can walk, and their spores make you yawn!',
      exits: [{ arch: 'center', to: 'sleeping-crypt' }],
      start: [[3, 6], [5, 6], [6, 6], [8, 6]],
      props: [
        { type: 'chest', at: [0, 1] },
        { type: 'mushrooms', at: [0, 2] },
        { type: 'mushrooms', at: [1, 2] },
        { type: 'mushrooms', at: [6, 3] },
        { type: 'mushrooms', at: [10, 1] },
        { type: 'mushrooms', at: [11, 2] },
        { type: 'brazier', at: [3, 3] },
        { type: 'brazier', at: [9, 2] },
      ],
      monsters: [
        { type: 'sporecap', at: [2, 1] },
        { type: 'sporecap', at: [10, 2] },
        { type: 'gloomling', at: [4, 2] },
        { type: 'gloomling', at: [7, 1] },
      ],
      loot: ['potion', 'star-biscuit', 'firebomb', 'boots', 'gold'],
    },
    {
      id: 'old-armory', name: 'The Old Armory', art: 'room-old-armory',
      intro: 'Dusty shields and spears fill the old dwarf armory. Hmm, is that treasure chest smiling at you?',
      exits: [{ arch: 'center', to: 'sleeping-crypt' }],
      start: [[3, 6], [5, 6], [6, 6], [8, 6]],
      props: [
        { type: 'chest', at: [0, 1] },
        { type: 'chest', at: [11, 1], mimic: true },
        { type: 'weapon-rack', at: [1, 2] },
        { type: 'weapon-rack', at: [2, 2] },
        { type: 'weapon-rack', at: [9, 2] },
        { type: 'weapon-rack', at: [10, 2] },
        { type: 'crates', at: [11, 0] },
        { type: 'crates', at: [0, 4] },
        { type: 'barrel', at: [11, 4] },
        { type: 'brazier', at: [3, 1] },
        { type: 'brazier', at: [8, 3] },
      ],
      monsters: [
        { type: 'goblin', at: [4, 2] },
        { type: 'goblin', at: [9, 3] },
        { type: 'slinger', at: [6, 1] },
      ],
      loot: ['sharpening-stone', 'shield-charm', 'firebomb', 'potion', 'gold'],
    },
    {
      id: 'sleeping-crypt', name: 'The Sleeping Crypt', art: 'room-sleeping-crypt',
      intro: 'Old dwarf heroes nap peacefully in this quiet crypt. Tiptoe, because some skeletons here are only pretending to sleep!',
      exits: [{ arch: 'center', to: 'lantern-library' }],
      start: [[3, 6], [5, 6], [6, 6], [8, 6]],
      props: [
        { type: 'brazier', at: [3, 0] },
        { type: 'brazier', at: [8, 0] },
        { type: 'brazier', at: [0, 4] },
        { type: 'sarcophagus', at: [1, 2] },
        { type: 'sarcophagus', at: [2, 2] },
        { type: 'sarcophagus', at: [9, 2] },
        { type: 'sarcophagus', at: [10, 2] },
        { type: 'sarcophagus', at: [2, 4] },
        { type: 'sarcophagus', at: [9, 4] },
        { type: 'chest', at: [11, 1] },
      ],
      monsters: [
        { type: 'rattlebones', at: [4, 2] },
        { type: 'rattlebones', at: [7, 2] },
        { type: 'rattlebones', at: [10, 1] },
        { type: 'gloomling', at: [1, 3] },
        { type: 'gloomling', at: [10, 3] },
      ],
      loot: ['big-potion', 'lightning-scroll', 'shield-charm', 'potion', 'gold'],
    },
    {
      id: 'lantern-library', name: 'The Lantern Library', art: 'room-lantern-library',
      intro: 'Dusty books stack all the way up to the ceiling. Shh, goblins are hiding between the shelves!',
      exits: [{ arch: 'center', to: 'lantern-chamber' }],
      start: [[3, 6], [5, 6], [6, 6], [8, 6]],
      props: [
        { type: 'bookshelf', at: [2, 1] },
        { type: 'bookshelf', at: [2, 2] },
        { type: 'bookshelf', at: [2, 3] },
        { type: 'bookshelf', at: [9, 1] },
        { type: 'bookshelf', at: [9, 2] },
        { type: 'bookshelf', at: [9, 3] },
        { type: 'chest', at: [0, 1], mimic: true },
        { type: 'chest', at: [11, 1], loot: 'bottled-sunbeam' },
        { type: 'brazier', at: [1, 4] },
        { type: 'brazier', at: [10, 4] },
      ],
      monsters: [
        { type: 'goblin', at: [4, 3] },
        { type: 'goblin', at: [8, 3] },
        { type: 'slinger', at: [5, 1] },
        { type: 'slinger', at: [7, 2] },
      ],
      loot: ['lightning-scroll', 'bright-oil', 'big-potion', 'feather-charm', 'gold'],
    },
    {
      id: 'lantern-chamber', name: 'The Lantern Chamber', art: 'room-lantern-chamber', boss: true,
      intro: 'Here sits the great Heart Lantern, dark and cold. Something very big is fluttering in the shadows above...',
      exits: [],
      start: [[3, 6], [5, 6], [6, 6], [8, 6]],
      props: [
        // nudge is a draw offset in squares, so the lantern sits centered on the dais.
        { type: 'heart-lantern', at: [5, 0], nudge: [0.5, 0] },
        { type: 'brazier', at: [1, 1] },
        { type: 'brazier', at: [10, 1] },
        { type: 'brazier', at: [1, 5] },
        { type: 'brazier', at: [10, 5] },
      ],
      monsters: [
        { type: 'gloamwing', at: [5, 1] },
      ],
      loot: ['star-biscuit', 'gold'],
    },
  ];

  // Read aloud over the title art before the first room.
  const story = [
    'Deep under the hills, the magic lanterns of Gloamhold keep the valley safe at night.',
    'But the lanterns have gone dark, and a sneaky shadow called the Gloam is creeping up!',
    "Four brave Lanternbearers grab their lanterns and head down. Let's bring back the light!",
  ];

  // Short and kind: a miss is funny, a knock-down is a chance for a friend to help.
  // Fumble lines work for heroes and monsters alike, so none of them says "you".
  const text = {
    fumble: [
      'Whoops! Slipped on a pebble.',
      'Oops! Tripped over a sleepy bat.',
      'Achoo! A dusty sneeze at the worst time.',
      'Hmm, which end is the pointy end?',
      'Swish! Nothing but air.',
      'Oh no, a bootlace came untied!',
      'Got distracted by a really shiny rock.',
      'Spun around in a big silly circle!',
    ],
    crit: ['CRITICAL!', 'CRITICAL! Wow!', 'CRITICAL! What a hit!'],
    helpUp: [
      'Up you get! Dust off those knees.',
      'A friendly hand, and back on your feet!',
      'Nobody gets left behind. Up you come!',
      'A quick hug, and back to the adventure!',
      "Shake it off, hero. We've got you!",
      'Teamwork! Back in action.',
    ],
    down: [
      'Oof! Knocked down. A friend can help you up.',
      'Down, but not out! A friend next to you can help.',
      'Whoa! Time for a little sit-down.',
    ],
    bright: 'The room is bright!',
    cleared: 'Room cleared! The braziers blaze with light.',
    mimic: 'Surprise! That chest was a Mimic!',
    snuff: 'Phoo! A goblin blew out a brazier.',
    sleepy: 'Yawn... too sleepy to move this turn.',
    summon: 'Gloamwing calls two Gloomlings to help!',
    partyDown: 'Everyone is knocked down. Back to camp for a rest!',
    campTitle: 'Back to Camp',
    campText: 'Everyone rests by the fire. Hearts refilled.',
    tips: [
      'Tip: light the braziers so sneaky monsters cannot hide.',
      'Tip: stand next to a friend, so you can help each other up.',
      'Tip: the Knight is great at standing in front.',
      'Tip: items in the party bag can save the day.',
    ],
    bossTitle: 'GLOAMWING, THE LANTERN-EATER',
    bossLine: "The giant moth spreads its starry wings. It's hungry for light, and your lanterns look like snacks!",
    victoryTitle: 'The Heart Lantern blazes again!',
    victoryText: 'Gloamwing shrinks into a tiny moth and flutters away. Warm light fills Gloamhold, and the valley is safe!',
    howTo: [
      'Tap a hero, then tap a glowing square to move.',
      'Each hero gets one move and one action every turn.',
      'To attack, roll the dice. Match the Defense number or beat it to hit!',
      'Monsters hide in the dark. Light braziers to see them and hit them more easily.',
      'Knocked down? A friend next to you can help you up.',
      'When every hero is done, tap the Monsters go button. Then the monsters take their turn.',
    ],
  };

  // Full-screen paintings for the title, camp, boss reveal and victory screens.
  const screens = { title: 'screen-title', camp: 'screen-camp', boss: 'screen-boss', victory: 'screen-victory' };

  return {
    version: 1,
    startRoom: 'gate-hall',
    heroes,
    monsters,
    items,
    props,
    rooms,
    story,
    text,
    screens,
  };
});
