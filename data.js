// Lanternbearers game content: heroes, monsters, items, props, rooms and story text.
// Numbers come from DESIGN.md. tools/check.mjs and tests/data.test.mjs validate this file.
// Dice are { n, d, plus }: { n: 1, d: 8, plus: 1 } is d8+1, and n: 0 means a flat amount.
// Squares are [col, row] on the 12x7 grid in layout.js: row 0 is the back wall, row 6 the front.
// A size-2 monster's `at` is its top-left square; it covers [c, r] to [c + 1, r + 1].
// Chapter 2 (docs/PHASE-2.md) adds `chapters`, `flames`, colored braziers, new monsters, items and rooms;
// every room names its `chapter`. Chapter 1's content is unchanged.
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

    // Chapter 2 (docs/PHASE-2.md). Numbers tuned by the balancer on 2026-10-31 (qa/balance.md,
    // "Chapter 2: tuned"); PHASE-2.md keeps the starting values, so check.mjs warns where they differ.
    // Names and blurbs are Gemini's (story/chapter-2.json). Each trait's extra field sits next to it:
    // hit-and-run -> hitAndRun, knockback -> knockback, splits -> splitInto, armored -> armor,
    // grabby -> grab, blink -> blink. A rooted monster has move 0.
    greyling: {
      id: 'greyling', name: 'Greyling', art: 'monster-greyling',
      hearts: 14, move: 5, defense: 11, attack: 4, damage: { n: 1, d: 4, plus: 1 }, // tuned: was 10 hearts, +3
      range: 1, attackKind: 'melee', size: 1, traits: ['sneaky'],
      blurb: "A smudgy ink-blob gremlin. Only brazier light reveals it—lantern light alone isn't enough!",
    },
    chillbat: {
      id: 'chillbat', name: 'Chillbat', art: 'monster-chillbat',
      hearts: 9, move: 6, defense: 13, attack: 4, damage: { n: 1, d: 4, plus: 1 }, // tuned: was 8 hearts
      range: 1, attackKind: 'bite', size: 1, traits: ['flying', 'hit-and-run'],
      hitAndRun: 3, // flies this far from the hero it attacked, hit or miss
      blurb: 'A round, fluffy ice-blue bat that flies in, gives a chilly nip, and flutters away.',
    },
    frostcub: {
      id: 'frostcub', name: 'Frostcub', art: 'monster-frostcub',
      hearts: 22, move: 3, defense: 12, attack: 5, damage: { n: 1, d: 4, plus: 3 }, // tuned: was 14 hearts, +4, 1d4+1
      range: 4, attackKind: 'snowball', size: 1, traits: ['knockback'],
      knockback: 1, // a hit pushes the hero this far straight away from it
      blurb: 'A chubby yeti cub in a scarf whose snowballs knock heroes back 1 square!',
    },
    'magma-blob': {
      id: 'magma-blob', name: 'Magma Blob', art: 'monster-magma-blob',
      hearts: 10, move: 2, defense: 11, attack: 4, damage: { n: 1, d: 6, plus: 0 }, // tuned: was 14 hearts, move 3
      range: 1, attackKind: 'melee', size: 1, traits: ['splits'],
      splitInto: { type: 'blobbit', count: 2 }, // when defeated, these appear on the nearest free squares
      blurb: 'A happy, wobbly jelly of warm lava. When defeated, it pops into two little Blobbits!',
    },
    blobbit: {
      id: 'blobbit', name: 'Blobbit', art: 'monster-magma-blob',
      scale: 0.65, // the Magma Blob's picture drawn smaller; it has no painting of its own
      hearts: 5, move: 4, defense: 11, attack: 3, damage: { n: 1, d: 4, plus: 0 },
      range: 1, attackKind: 'melee', size: 1, traits: [],
      blurb: 'Half a Magma Blob and twice as giggly! A tiny, bouncy drop of warm jelly.',
    },
    clanker: {
      id: 'clanker', name: 'Clanker', art: 'monster-clanker',
      hearts: 18, move: 2, defense: 11, attack: 5, damage: { n: 1, d: 6, plus: 0 }, // tuned: was Defense 12, 1d8
      range: 1, attackKind: 'melee', size: 1, traits: ['armored'],
      armor: 1, // every damage instance from a hero is this much less, minimum 1
      blurb: 'A noisy brass forge robot. Its heavy armor makes every hit do 1 less damage.',
    },
    'vine-snapper': {
      id: 'vine-snapper', name: 'Vine Snapper', art: 'monster-vine-snapper',
      hearts: 16, move: 0, defense: 11, attack: 4, damage: { n: 1, d: 6, plus: 0 },
      range: 1, attackKind: 'bite', size: 1, traits: ['rooted', 'grabby'],
      grab: { range: 3 }, // pulls the nearest standing hero within this range to a square next to it
      blurb: 'A rooted flower that stays put, pulling heroes from 3 squares away to chomp!',
    },
    starwisp: {
      id: 'starwisp', name: 'Starwisp', art: 'monster-starwisp',
      hearts: 9, move: 4, defense: 13, attack: 4, damage: { n: 1, d: 4, plus: 0 }, // tuned: was 1d4+2
      range: 4, attackKind: 'spark', size: 1, traits: ['flying', 'blink'],
      blink: { min: 3, max: 5 }, // after it attacks, it teleports this far from its target, preferring darkness
      blurb: 'A floating star spirit that shoots twinkle bolts, then blinks to another spot!',
    },
    'color-dragon': {
      id: 'color-dragon', name: 'Pebblebelly', title: 'The Color Gobbler', art: 'boss-color-dragon',
      hearts: 46, move: 3, defense: 14, attack: 6, damage: { n: 1, d: 8, plus: 2 }, // tuned: was 60 hearts, 1d10+2
      range: 1, attackKind: 'bite', size: 2, boss: true, traits: ['flying', 'boss'],
      blurb: 'A huge, chubby grey dragon whose round belly swirls with stolen rainbow flames. Watch which color it glows next!',
      // Its glow is the telegraph: m.glow starts at `start` and walks `cycle` after each color move.
      // The move whose `color` matches the glow is the one it does next.
      glow: { start: 'blue', cycle: ['blue', 'green', 'red', 'violet'] },
      moves: [
        { id: 'frost-breath', color: 'blue', name: 'Frosty Breath', radius: 3, damage: { n: 1, d: 4, plus: 0 }, status: 'frozen',
          text: 'Chilly blue puff! Hurts heroes within 3 squares and freezes their feet for their next turn.' },
        { id: 'vine-yank', color: 'green', name: 'Vine Yank', pull: 'farthest', bite: true,
          text: 'Stretchy green vine! Pulls the farthest hero right next to Pebblebelly for a cheeky nibble.' },
        { id: 'ember-breath', color: 'red', name: 'Ember Breath', radius: 2, damage: { n: 2, d: 4, plus: 0 },
          text: 'Warm red huff! A cozy-hot puff of sparks hurts every hero within 2 squares.' },
        { id: 'star-hop', color: 'violet', name: 'Star Hop', blink: 'fewest-hearts', bite: true,
          text: 'Violet twinkle pop! Blinks right next to the hero with the fewest hearts and chomps.' },
        // Not a color move: it snuffs the nearest lit brazier instead, and the glow stays put.
        { id: 'gobble-color', name: 'Gobble Color', heal: 4, digest: 1,
          text: 'Slurps the flame right out of a lit brazier and heals some hearts!' },
      ],
      eatAt: 3, // gobbles once this many braziers are lit (or all of them, in a smaller room), never two turns in a row
      summon: { type: 'greyling', count: 2, below: 0.5 }, // once, at half hearts
    },
  };

  // kind: heal | bomb | zap | lantern | speed | sunbeam | gear | gold, plus Chapter 2's
  // tint (a color crystal) | freeze | feast | revive.
  // target: hero (you or a hero next to you) | square | monster (visible) | self | none | downed (a knocked-down hero anywhere).
  // Gear ("keeps") goes straight to the hero who opened the chest instead of the party bag.
  const items = {
    potion: {
      id: 'potion', price: 16, name: 'Healing Potion', art: 'loot-potion', kind: 'heal', target: 'hero',
      heal: { n: 2, d: 4, plus: 2 }, range: 1,
      text: 'Heals you or a hero next to you.',
    },
    'big-potion': {
      id: 'big-potion', price: 28, name: 'Big Healing Potion', art: 'loot-big-potion', kind: 'heal', target: 'hero',
      heal: { n: 4, d: 4, plus: 4 }, range: 1,
      text: 'Heals you or a hero next to you by a whole lot.',
    },
    'star-biscuit': {
      id: 'star-biscuit', price: 6, name: 'Star Biscuit', art: 'loot-star-biscuit', kind: 'heal', target: 'hero',
      heal: { n: 0, d: 4, plus: 4 }, range: 1,
      text: 'A crunchy snack that heals 4 hearts.',
    },
    firebomb: {
      id: 'firebomb', price: 40, name: 'Firebomb', art: 'loot-firebomb', kind: 'bomb', target: 'square',
      damage: { n: 2, d: 6, plus: 0 }, range: 4, radius: 1,
      text: 'Throw it up to 4 squares to hurt everything on that spot and next to it.',
    },
    'lightning-scroll': {
      id: 'lightning-scroll', price: 40, name: 'Lightning Scroll', art: 'loot-lightning-scroll', kind: 'zap', target: 'monster',
      damage: { n: 3, d: 6, plus: 0 }, range: 99, // anywhere in the room
      text: 'Zap one monster you can see, anywhere in the room.',
    },
    'bright-oil': {
      id: 'bright-oil', price: 10, name: 'Bright Oil', art: 'loot-bright-oil', kind: 'lantern', target: 'self',
      light: 2, range: 0,
      text: 'Your lantern shines 2 squares farther for the rest of the room.',
    },
    'feather-charm': {
      id: 'feather-charm', price: 10, name: 'Feather Charm', art: 'loot-feather-charm', kind: 'speed', target: 'self',
      move: 2, range: 0,
      text: 'Move 2 extra squares this turn.',
    },
    'bottled-sunbeam': {
      id: 'bottled-sunbeam', price: 40, name: 'Bottled Sunbeam', art: 'loot-bottled-sunbeam', kind: 'sunbeam', target: 'none',
      range: 0,
      text: 'Lights every brazier in the room at once!',
    },
    'shield-charm': {
      id: 'shield-charm', price: 50, name: 'Shield Charm', art: 'loot-shield-charm', kind: 'gear', target: 'self',
      gear: { defense: 1 }, keeps: true, range: 0,
      text: 'Keeps: +1 Defense for the rest of the adventure.',
    },
    'sharpening-stone': {
      id: 'sharpening-stone', price: 50, name: 'Sharpening Stone', art: 'loot-sharpening-stone', kind: 'gear', target: 'self',
      gear: { damage: 1 }, keeps: true, range: 0,
      text: 'Keeps: your attacks do +1 damage for the rest of the adventure.',
    },
    boots: {
      id: 'boots', price: 50, name: 'Boots of Bounding', art: 'loot-boots', kind: 'gear', target: 'self',
      gear: { move: 1 }, keeps: true, range: 0,
      text: 'Keeps: move 1 extra square for the rest of the adventure.',
    },
    gold: {
      id: 'gold', price: 0, name: 'Gold', art: 'loot-gold', kind: 'gold', target: 'none',
      gold: { min: 5, max: 20 }, range: 0,
      text: 'Shiny coins for the party, counted at the end.',
    },

    // Chapter 2 (docs/PHASE-2.md). A crystal tints one hero's lantern until they enter a room or retry it.
    'frost-crystal': {
      id: 'frost-crystal', price: 10, name: 'Frost Crystal', art: 'loot-frost-crystal', kind: 'tint', target: 'self',
      color: 'blue', range: 0,
      text: 'Your lantern glows blue this room: monsters in your light move 2 fewer squares.',
    },
    'grove-crystal': {
      id: 'grove-crystal', price: 10, name: 'Grove Crystal', art: 'loot-grove-crystal', kind: 'tint', target: 'self',
      color: 'green', range: 0,
      text: 'Your lantern glows green this room: heroes in your light heal 1 heart each turn.',
    },
    'ember-crystal': {
      id: 'ember-crystal', price: 10, name: 'Ember Crystal', art: 'loot-ember-crystal', kind: 'tint', target: 'self',
      color: 'red', range: 0,
      text: 'Your lantern glows red this room: heroes in your light do +1 damage on hits.',
    },
    'star-crystal': {
      id: 'star-crystal', price: 10, name: 'Star Crystal', art: 'loot-star-crystal', kind: 'tint', target: 'self',
      color: 'violet', range: 0,
      text: 'Your lantern glows violet this room: heroes in your light get +1 Defense.',
    },
    'snow-globe': {
      id: 'snow-globe', price: 12, name: 'Snow Globe', art: 'loot-snow-globe', kind: 'freeze', target: 'square',
      range: 4, radius: 1, // like the Firebomb's area, but it freezes instead of hurting
      text: 'Throw up to 4 squares. Monsters on or beside that spot cannot move next turn.',
    },
    'rainbow-cake': {
      id: 'rainbow-cake', price: 32, name: 'Rainbow Cake', art: 'loot-rainbow-cake', kind: 'feast', target: 'none',
      heal: { n: 0, d: 4, plus: 3 }, range: 0, // every hero, anywhere in the room
      text: 'Every hero in the room heals 3 hearts, and knocked-down heroes get right back up!',
    },
    'phoenix-feather': {
      id: 'phoenix-feather', price: 40, name: 'Phoenix Feather', art: 'loot-phoenix-feather', kind: 'revive', target: 'downed',
      range: 99, // offered only while someone is down
      text: 'Helps one knocked-down hero anywhere in the room get back up with all their hearts.',
    },
    'lucky-clover': {
      id: 'lucky-clover', price: 50, name: 'Lucky Clover', art: 'loot-lucky-clover', kind: 'gear', target: 'self',
      gear: { attack: 1 }, keeps: true, range: 0,
      text: 'Keeps: Gives +1 to hit for the rest of the adventure.',
    },
    'heart-locket': {
      id: 'heart-locket', price: 50, name: 'Heart Locket', art: 'loot-heart-locket', kind: 'gear', target: 'self',
      gear: { hearts: 3 }, keeps: true, range: 0, // and heals 3 right away
      text: 'Keeps: Gives +3 max hearts for the rest of the adventure.',
    },
    'lantern-lens': {
      id: 'lantern-lens', price: 50, name: 'Lantern Lens', art: 'loot-lantern-lens', kind: 'gear', target: 'self',
      gear: { light: 1 }, keeps: true, range: 0,
      text: 'Keeps: Your lantern shines 1 square farther for the rest of the adventure.',
    },
  };

  // How each prop type behaves and how big it draws. height is in floor squares; the picture
  // keeps its own width-to-height shape, so these heights keep each prop about one square wide.
  const props = {
    brazier: {
      id: 'brazier', name: 'Brazier', art: 'prop-brazier', blocks: true, height: 1.1, light: 4,
      // A room placement with `color` (data.flames) draws this art instead; the game adds the flames.
      colorArt: { blue: 'prop-brazier-blue', green: 'prop-brazier-green', red: 'prop-brazier-red', violet: 'prop-brazier-violet' },
    },
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
    // Chapter 2 furniture. Heights stay under 1.5 where something may stand behind the prop.
    'flower-bed': { id: 'flower-bed', name: 'Flower Bed', art: 'prop-flower-bed', blocks: true, height: 0.7 },
    'ice-crystals': { id: 'ice-crystals', name: 'Ice Crystals', art: 'prop-ice-crystals', blocks: true, height: 1.4, glow: '#9fdcff' },
    anvil: { id: 'anvil', name: 'Anvil', art: 'prop-anvil', blocks: true, height: 0.8 },
    furnace: { id: 'furnace', name: 'Furnace', art: 'prop-furnace', blocks: true, height: 1.9 },
    'star-globe': { id: 'star-globe', name: 'Star Globe', art: 'prop-star-globe', blocks: true, height: 1.4, glow: '#c8a6ff' },
    'crystal-pillar': { id: 'crystal-pillar', name: 'Crystal Pillar', art: 'prop-crystal-pillar', blocks: true, height: 2.3 },
    'prism-heart': { id: 'prism-heart', name: 'Prism Crystal', art: 'prop-prism-heart', blocks: true, height: 2.8, glow: '#e6d8ff' },
  };

  // Six rooms; a run visits five. Heroes start on row 6 and monsters start in the dark (rows 0-3).
  // Squares in row 0 under a doorway stay clear so heroes can always walk out.
  const rooms = [
    {
      id: 'gate-hall', name: 'The Gate Hall', art: 'room-gate-hall', chapter: 'deep-lanterns',
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
      id: 'mushroom-grotto', name: 'The Mushroom Grotto', art: 'room-mushroom-grotto', chapter: 'deep-lanterns',
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
      id: 'old-armory', name: 'The Old Armory', art: 'room-old-armory', chapter: 'deep-lanterns',
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
      id: 'sleeping-crypt', name: 'The Sleeping Crypt', art: 'room-sleeping-crypt', chapter: 'deep-lanterns',
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
      id: 'lantern-library', name: 'The Lantern Library', art: 'room-lantern-library', chapter: 'deep-lanterns',
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
      id: 'lantern-chamber', name: 'The Lantern Chamber', art: 'room-lantern-chamber', boss: true, chapter: 'deep-lanterns',
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

    // Chapter 2, "The Prism Deeps" (docs/PHASE-2.md): six rooms, a run visits five. Same layout rules.
    // A brazier placement's `color` picks its flame (data.flames) and its art (props.brazier.colorArt);
    // the braziers in a room are spread out so each one lights a different part of it.
    {
      id: 'greyed-garden', name: 'The Greyed Garden', art: 'room-greyed-garden', chapter: 'prism-deeps',
      intro: 'Stone flowerbeds and giant mushrooms stand pale and grey. Smudgy blobs giggle in the shadows, and a huge flower in the middle is waving some very grabby vines!',
      exits: [{ arch: 'left', to: 'frostfall-cavern' }, { arch: 'right', to: 'ember-forge' }],
      start: [[3, 6], [5, 6], [6, 6], [8, 6]],
      props: [
        { type: 'brazier', color: 'green', at: [2, 4] }, // one step from the heroes, so healing light comes early
        { type: 'brazier', color: 'green', at: [9, 2] },
        { type: 'flower-bed', at: [4, 1] },
        { type: 'flower-bed', at: [7, 1] },
        { type: 'flower-bed', at: [5, 4] },
        { type: 'flower-bed', at: [10, 4] },
        { type: 'chest', at: [5, 2] },
      ],
      monsters: [
        { type: 'greyling', at: [1, 1] },
        { type: 'greyling', at: [8, 2] },
        { type: 'greyling', at: [4, 3] },
        { type: 'vine-snapper', at: [6, 2] }, // the huge flower in the middle; it never moves
      ],
      loot: ['potion', 'star-biscuit', 'grove-crystal', 'lucky-clover', 'gold'],
    },
    {
      id: 'frostfall-cavern', name: 'The Frostfall Cavern', art: 'room-frostfall-cavern', chapter: 'prism-deeps',
      intro: 'Frozen waterfalls hang silent and pale. Fluffy bats flutter overhead, and smudgy blobs slide across the ice. A chubby cub in a scarf is packing a pile of snowballs!',
      exits: [{ arch: 'center', to: 'starglass-hall' }],
      start: [[3, 6], [5, 6], [6, 6], [8, 6]],
      props: [
        { type: 'brazier', color: 'blue', at: [4, 0] },
        { type: 'brazier', color: 'blue', at: [7, 4] },
        { type: 'ice-crystals', at: [0, 0] }, // frozen falls along the back wall
        { type: 'ice-crystals', at: [3, 0] },
        { type: 'ice-crystals', at: [8, 0] },
        { type: 'ice-crystals', at: [5, 3] },
        { type: 'chest', at: [0, 3] },
      ],
      monsters: [
        { type: 'chillbat', at: [2, 1] },
        { type: 'chillbat', at: [9, 2] },
        { type: 'frostcub', at: [6, 1] }, // throws snowballs from the back
        { type: 'greyling', at: [4, 3] },
      ],
      loot: ['frost-crystal', 'snow-globe', 'potion', 'heart-locket', 'gold'],
    },
    {
      id: 'ember-forge', name: 'The Ember Forge', art: 'room-ember-forge', chapter: 'prism-deeps',
      intro: 'The dwarf furnaces sit cold and grey. Wobbly jelly blobs bounce by the anvils, smudgy gremlins lurk in the soot, and a heavy brass robot goes clang-clang!',
      exits: [{ arch: 'center', to: 'starglass-hall' }],
      start: [[3, 6], [5, 6], [6, 6], [8, 6]],
      props: [
        { type: 'brazier', color: 'red', at: [3, 4] },
        { type: 'brazier', color: 'red', at: [9, 1] },
        { type: 'furnace', at: [0, 0] }, // tall, so they stand against the back wall with nothing behind them
        { type: 'furnace', at: [11, 0] },
        { type: 'anvil', at: [3, 2] },
        { type: 'anvil', at: [8, 2] },
        { type: 'crates', at: [11, 3] },
        { type: 'barrel', at: [0, 4] },
        { type: 'chest', at: [11, 1] },
      ],
      monsters: [
        { type: 'magma-blob', at: [4, 1] },
        { type: 'magma-blob', at: [7, 2] },
        { type: 'clanker', at: [6, 1] }, // slow, so it guards the doorway
        { type: 'greyling', at: [1, 2] },
      ],
      loot: ['ember-crystal', 'firebomb', 'sharpening-stone', 'potion', 'gold'],
    },
    {
      id: 'starglass-hall', name: 'The Starglass Hall', art: 'room-starglass-hall', chapter: 'prism-deeps',
      intro: 'Crystal stars hang dark in the glass dome above. Blinking star spirits zip past smudgy blobs, and wait—did that treasure chest in the corner just lick its lips?',
      exits: [{ arch: 'center', to: 'prism-bridge' }],
      start: [[3, 6], [5, 6], [6, 6], [8, 6]],
      props: [
        // Two by the side walls and one front-center, so each lights its own third of the hall.
        { type: 'brazier', color: 'violet', at: [0, 2] },
        { type: 'brazier', color: 'violet', at: [11, 2] },
        { type: 'brazier', color: 'violet', at: [6, 4] },
        { type: 'crystal-pillar', at: [2, 2] }, // tall: nothing stands right behind it
        { type: 'crystal-pillar', at: [9, 2] },
        { type: 'star-globe', at: [4, 3] },
        { type: 'star-globe', at: [7, 3] },
        { type: 'chest', at: [0, 1] },
        { type: 'chest', at: [11, 1], mimic: true }, // the chest in the corner that licks its lips
      ],
      monsters: [
        { type: 'starwisp', at: [3, 1] },
        { type: 'starwisp', at: [8, 1] },
        { type: 'greyling', at: [5, 2] },
        { type: 'greyling', at: [10, 1] },
      ],
      loot: ['star-crystal', 'lantern-lens', 'big-potion', 'rainbow-cake', 'gold'],
    },
    {
      id: 'prism-bridge', name: 'The Prism Bridge', art: 'room-prism-bridge', chapter: 'prism-deeps',
      intro: 'A wide crystal bridge crosses a sparkly chasm right before the vault! Critters from every hall block the way around four braziers—one for each color flame.',
      exits: [{ arch: 'center', to: 'color-vault' }],
      start: [[3, 6], [5, 6], [6, 6], [8, 6]],
      props: [
        // Four corners, one color each, so their pools of light cross in the middle of the bridge.
        { type: 'brazier', color: 'blue', at: [2, 1] },
        { type: 'brazier', color: 'green', at: [9, 1] },
        { type: 'brazier', color: 'red', at: [1, 5] },
        { type: 'brazier', color: 'violet', at: [10, 5] },
        { type: 'crystal-pillar', at: [0, 0] }, // along the bridge's edges
        { type: 'crystal-pillar', at: [11, 0] },
        { type: 'crystal-pillar', at: [0, 4] },
        { type: 'crystal-pillar', at: [11, 4] },
        { type: 'chest', at: [11, 2], loot: 'phoenix-feather' },
      ],
      monsters: [
        { type: 'clanker', at: [6, 1] },
        { type: 'vine-snapper', at: [5, 2] },
        { type: 'chillbat', at: [1, 2] },
        { type: 'starwisp', at: [9, 3] },
        { type: 'greyling', at: [3, 3] },
      ],
      loot: ['rainbow-cake', 'big-potion', 'snow-globe', 'potion', 'gold'],
    },
    {
      id: 'color-vault', name: 'The Color Vault', art: 'room-color-vault', chapter: 'prism-deeps', boss: true,
      intro: 'Here is the great Prism Crystal, drained to dull grey stone! Four corner braziers stand cold, and something huge, round, and rainbow-bellied is hiccuping in the shadows at the back...',
      exits: [],
      start: [[3, 6], [5, 6], [6, 6], [8, 6]],
      props: [
        // Mirrors the Lantern Chamber: the crystal sits centered on the back dais, a brazier of each color near each corner.
        { type: 'prism-heart', at: [5, 0], nudge: [0.5, 0] },
        { type: 'brazier', color: 'blue', at: [1, 1] },
        { type: 'brazier', color: 'green', at: [10, 1] },
        { type: 'brazier', color: 'red', at: [1, 5] },
        { type: 'brazier', color: 'violet', at: [10, 5] },
      ],
      monsters: [
        { type: 'color-dragon', at: [5, 1] },
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
    shop: {
      greeting: "Psst! Nibbet's Lantern Shop is open! Shiny gold for shiny things.",
      bought: "A fine choice! It's in your bag.",
      need: 'Ooh, so close! Find a little more gold and come back.',
      leaving: 'Off you go, heroes! Keep those lanterns bright!',
    },
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
    // Chapter 2 moments, in Gemini's words. The rules say these by key; colorBack plays when a
    // colored brazier is lit. They live here, not in the chapter, so every chapter can use them.
    split: 'Plop-plop! The Magma Blob splits into two giggly Blobbits!',
    grab: 'Yoink! A stretchy vine pulls a hero right in!',
    blink: 'Twinkle-pop! The Starwisp blinks to a brand-new spot!',
    knockback: 'Splat! A chilly snowball knocks them back a square!',
    armored: 'CLANG! Thick brass armor blocks 1 damage!',
    frozen: 'Brrr! Frozen boots—stuck in place for this turn!',
    chilled: 'Shiver-step! Blue light slows those feet way down!',
    colorBack: [
      'Whoosh! Bright color splashes back across the stone!',
      'The brazier blazes, and the grey melts away!',
      'Hooray! Another piece of the rainbow shines again!',
    ],
  };

  // Full-screen paintings for the title, camp, boss reveal and victory screens.
  const screens = { title: 'screen-title', camp: 'screen-camp', boss: 'screen-boss', victory: 'screen-victory' };

  // Chapter 2's colored flames (docs/PHASE-2.md). A lit colored brazier's bright light also carries
  // its color, and whoever stands in it gets the effect. Names and text are Gemini's; `short` is the
  // HUD chip (at most 4 words).
  const flames = {
    blue: {
      id: 'blue', name: 'Frostblue Flame', hex: '#6ec8ff', effect: 'chill', move: -2,
      text: 'Monsters standing in blue light move 2 fewer squares.', short: 'Monsters move 2 less',
    },
    green: {
      id: 'green', name: 'Leafgreen Flame', hex: '#7be07b', effect: 'grow', heal: 1,
      text: 'Heroes standing in green light heal 1 heart when the party turn starts.', short: 'Heroes heal 1 heart',
    },
    red: {
      id: 'red', name: 'Hearthred Flame', hex: '#ff7a52', effect: 'ember', damage: 1,
      text: 'Heroes standing in red light do +1 damage when they hit.', short: 'Heroes +1 damage',
    },
    violet: {
      id: 'violet', name: 'Starviolet Flame', hex: '#c08bff', effect: 'star', defense: 1,
      text: 'Heroes standing in violet light get +1 Defense and are harder to hit.', short: 'Heroes +1 Defense',
    },
  };

  // The adventures on the title screen, in order. Chapter 1 repeats the top-level story, text and
  // screens (the same objects), so Chapter 1 code and saves keep working. Chapter 2's words are
  // Gemini's (story/chapter-2.json). Rules look a chapter's text up first, then the top-level text.
  const chapters = [
    {
      id: 'deep-lanterns', number: 1, name: 'The Deep Lanterns', subtitle: 'The Lanterns of Gloamhold',
      blurb: 'The magic lanterns of Gloamhold have gone dark, and a sneaky shadow is creeping up. Bring back the light!',
      startRoom: 'gate-hall', story,
      screens: { card: 'screen-title', story: ['screen-story-1', 'screen-story-2', 'screen-story-3'],
        camp: 'screen-camp', boss: 'screen-boss', victory: 'screen-victory', map: 'screen-map' },
      music: 'explore', text,
    },
    {
      id: 'prism-deeps', number: 2, name: 'The Prism Deeps', subtitle: 'Where the Four Colors Sleep',
      blurb: "Someone gobbled up the valley's colors! Carry your lanterns deep below and bring the rainbow home.",
      tag: 'Best after Chapter 1', // the small note on its chapter card
      startRoom: 'greyed-garden',
      story: [
        'The morning after the Heart Lantern blazed, the valley woke up grey. Flowers, painted doors, the sky, and even the crayons had lost their colors!',
        'Beneath the Heart Lantern, a crack opened into the ancient Prism Deeps. Smudgy grey footprints led down toward the halls of the four colored flames.',
        "Rowan, Fennick, Juniper, and Oren raised their warm lanterns at the top of the crystal stairs. Lanterns up, friends! Let's bring back the rainbow!",
      ],
      screens: { card: 'screen-c2-card', story: ['screen-c2-story-1', 'screen-c2-story-2', 'screen-c2-story-3'],
        camp: 'screen-camp', boss: 'screen-c2-boss', victory: 'screen-c2-victory', map: 'screen-c2-map' },
      music: 'prism',
      text: {
        bossTitle: 'PEBBLEBELLY, THE COLOR GOBBLER',
        bossLine: 'Hic-burp! Rainbow sparkles pop out as Pebblebelly waddles into the light, patting its glowing round tummy. "Ooh, shiny lanterns! Can I gobble those up too?"',
        victoryTitle: 'The Rainbow Comes Home',
        victoryText: 'HIC-POP! Pebblebelly hiccuped out the four flames, and they zoomed home to paint the valley bright. It shrank into a small, friendly rainbow dragon. "I only wanted to be colorful too, I\'m sorry!" it peeped. The heroes smiled and welcomed their new friend.',
        summon: '"Little smudgies, help me out!" Pebblebelly hiccups, and two Greylings hop in!',
        // One per glow color: said (and shown in the HUD) after each color move, when the glow moves on.
        telegraph: {
          blue: 'Pebblebelly glows blue... frosty breath is coming! Step back!',
          green: 'Pebblebelly glows green... it will yank the farthest hero!',
          red: 'Pebblebelly glows red... warm ember breath nearby!',
          violet: 'Pebblebelly glows violet... star hop to the lowest hearts!',
        },
        fumble: [
          'Whoops! Slipped on a smudgy grey spot and missed!',
          'A sudden sneeze sends that attack sideways—achoo!',
          'Swung with big style, but hit only thin air!',
          'Distracted by a shiny crystal! That one goes wide.',
          'Boing! The attack bounces harmlessly off a pebble.',
          'Wait, eyes were closed! Missed by a whole mile!',
        ],
        helpUp: [
          'A warm hand and a smile—back on your feet!',
          'Up we go! Friends never leave a friend down.',
          'Dusted off, hugged tight, and ready to shine again!',
          "Steady there, buddy! Let's finish this together.",
        ],
        tips: [
          "Tip: Greylings hide in the dark! Light a room's braziers to spot them right away.",
          'Tip: Stand in green brazier light to heal 1 heart when the party turn starts.',
          'Tip: Watch which color Pebblebelly glows—it tells the team which move is coming next!',
          'Tip: Blue light slows monsters, red adds damage, and violet boosts hero Defense!',
        ],
      },
    },
  ];

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
    chapters,
    flames,
  };
});
