// Lanternbearers rules engine (LB_RULES): pure, deterministic, no DOM.
//
// Every call that changes the game mutates the state it is given and returns an array of
// events, in the order things happen, so the board and UI can animate them one by one.
// Dice come from a seeded generator whose position lives in state.rng: the same seed and
// the same choices always play out exactly the same way.
//
// Conventions (ARCHITECTURE.md has the contract):
// - Squares are [col, row] on the 12x7 grid. Distances count diagonals as 1.
// - light(state)[col][row] is 0 dark, 1 lantern light or 2 bright light.
// - The `path` in move and push events lists the squares stepped onto, not the start square.
// - A 2x2 monster's `at` is its top-left square.
// - Hero uids are their ids ('knight'); monsters are 'm1', 'm2'...; props are 'p1', 'p2'...
// - Events carry every contract field, plus a few extras (`by`, `at`, `type`) that make
//   animation easier. Status names: 'sleepy', 'shield', 'feather', 'bright-oil', and (Chapter 2)
//   'frozen' and 'tint' on heroes, 'frozen' and 'chilled' on monsters.
// - Healing a knocked-down hero (Mend, a potion, Sunburst) also gets them back up.
// - Ability events carry a ready `name`. Mend and these items also play as an 'ability' event
//   (with `item` for items) just before their effect: potions, the Star Biscuit, the Firebomb and
//   the Bottled Sunbeam. A Lightning Scroll is an 'attack' (kind 'spark') with item:
//   'lightning-scroll'; Bright Oil and the Feather Charm are 'status' events.
// - 'down' and 'up' events carry a friendly `line` from data.text.down / data.text.helpUp.
// - 'say' events carry `key` naming the data.text line they came from ('mimic', 'snuff', 'sleepy',
//   'summon', 'cleared', 'partyDown'); Gloamwing's moves are says with `move` instead.
// - Wing Gust is one 'attack' (kind 'gust', no roll) per hero it hits, each followed by that
//   hero's 'push' and 'damage'.
// - act() with no target picks the first valid one; { kind: 'wait' } ends that hero's turn.
// - Extra helpers: exits(state) for the doorway choice, done(state, heroId), blast(at) for the
//   Fireburst 3x3 preview, cells(monster), distance(a, b), heroIds(state).
//
// Phase 2 (docs/PHASE-2.md): chapters, colored flames, new habits, new items and the Color Dragon.
// Chapter 1 plays exactly as before: nothing below fires unless a room, monster or item asks for it.
// - Chapters: newGame({ chapter }) sets state.chapter (the first chapter's id by default; null when
//   the data has no chapters). chapterOf(state) is its data entry and startRoom(state) its first
//   room. Text lookups (say lines, fumbles, help-ups, telegraphs) take the chapter's `text` first,
//   then the top-level `text`. deserialize fills in `chapter` and the new gear fields (attack,
//   hearts, light) for saves from before Phase 2.
// - Colored flames: a brazier placement with `color` keeps it as state.props[i].color (absent for a
//   gold brazier). colors(state)[col][row] lists the colors on a square ([] for none): a lit colored
//   brazier colors its bright light, and a tinted lantern (hero status 'tint', from a crystal) colors
//   that hero's lantern squares. A unit is "in" a color when any square it covers has it; the same
//   color never stacks. blue 'chill': a monster starting its turn in blue moves 2 fewer squares (at
//   least 1) and has status 'chilled' ('status' events when it changes, say 'chilled' when it
//   starts). green 'grow': just before each new party turn, every standing hero in green heals 1
//   ('heal' with source: 'green'). red 'ember': +1 damage on a hero's attacks and Fireburst. violet
//   'star': +1 Defense. The numbers come from data.flames[color] (move, heal, damage, defense).
// - Statuses: 'frozen' on a hero works like Sleepy (no move on their next turn; they can still act).
//   On a monster it skips that monster's next move, blink, flutter and pull (it still attacks what
//   it can reach) and melts at the end of that turn with a 'status' off event. 'tint' holds a color.
// - Habits (a trait name in data.js, or the type from PHASE-2.md): 'sneaky' (seen only once spotted
//   or in bright light), 'hit-and-run' (after attacking, a 'move' with kind: 'hit-and-run' up to
//   hitAndRun squares, farther from every hero, then darker, flying over props), 'knockback' (a hit
//   pushes the hero `knockback` squares: 'push' with kind: 'knockback', then say 'knockback'),
//   'splits' (when defeated: 'defeated', then 'split { uid, into, at, type }', one 'summon' per new
//   monster, then say 'split'; the new monsters are spotted and act on the next monster turn),
//   'armored' (a hero's damage is `armor` less, at least 1; the 'damage' event carries `armored`,
//   and the first blocked hit on each one says 'armored'), 'rooted' (never moves, never pushed or
//   pulled), 'grabby' (no hero beside it but one within grab.range: a 'push' with kind: 'pull'
//   straight to a square beside it, say 'grab', then it attacks if the hero got there), 'blink'
//   (after attacking: 'blink { uid, from, to }' to a free square blink.min to blink.max from its
//   target, darkest squares first, picked with the seeded dice, then say 'blink'; it stays spotted).
// - Push events: a plain push has no `kind` (so Chapter 1's events are unchanged); pulls and
//   knockbacks carry kind: 'pull' | 'knockback' and `by` (the monster's uid), so the board can draw
//   the vine or the snowball from the right place.
// - Items: a crystal (kind 'tint') is a 'tint { uid, color, item }' event. The Snow Globe (kind
//   'freeze', `area` like the Firebomb) plays as an 'ability', then 'status frozen on' for each
//   monster on or next to the square (which also spots it) and one say 'frozen'. The Rainbow Cake
//   (kind 'feast') is an 'ability' then a flat 'heal' for every hero who needs one (a knocked-down
//   hero gets up). The Phoenix Feather (kind 'revive'; options() offers `heroes` that are down) is an
//   'ability', then a 'heal' to full hearts and 'up'. New gear fields: gear.attack (+to hit),
//   gear.hearts (+max hearts, with a 'heal' of the same right away) and gear.light (a bigger lantern
//   in every room).
// - The Color Dragon (type 'color-dragon'): m.glow is its color, starting at data glow.start and
//   walking glow.cycle. Each turn it either gobbles (3 or more braziers lit, or all of them in a
//   smaller room, never twice in a row): a 'say' with move: 'gobble-color', then 'snuff' and 'heal',
//   and the glow stays put; or it does its glow color's move: a 'say' with `move` and `color`, a
//   'move' toward its target when it needs to get closer, the move itself, then 'glow { uid, color }'
//   for the next color and say { key: 'telegraph', color }. Breath moves emit 'breath { uid, color,
//   cells }' and then each hero's 'damage' (no roll; `dice` names the die) and, for frost, 'status
//   frozen on' and one say 'frozen'. Vine Yank is a 'push' (kind 'pull') then a bite; Star Hop is a
//   'blink' then a bite. A 'glow' event also follows the 'room' event when a room holds a glowing
//   monster. At half hearts it summons its data `summon` (two Greylings), once, with say 'summon'.
//   bossNext(state) gives { uid, color, move: { id, name, text } } for the HUD, or null.
// - Say keys gained: 'split', 'grab', 'blink', 'knockback', 'armored', 'frozen', 'chilled',
//   'colorBack' (a hero or the Bottled Sunbeam lights a colored brazier) and 'telegraph'.
// - New helpers: chapterOf(state), startRoom(state), colors(state), bossNext(state).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.LB_RULES = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const COLS = 12;
  const ROWS = 7;
  const HERO_ORDER = ['knight', 'ranger', 'wizard', 'lightbringer'];
  // Orthogonal steps first, so paths look natural when diagonals don't matter.
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
  // The eight directions in turning order, so a push can slide around a corner.
  const RING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  // Rule numbers from DESIGN.md that data.js doesn't carry.
  const RULE = {
    litBonus: 2,        // +2 to hit a target standing in bright light
    brazierLight: 4,    // a lit brazier makes bright light this far (data.props.brazier.light wins)
    helpUpHearts: 4,    // a helped-up hero stands with this many hearts
    brightHeal: 2,      // every brazier lit: each standing hero heals this much
    goldChance: 0.25,   // a defeated monster drops gold this often
    gold: { min: 5, max: 20 },
  };

  // Ability, item and boss numbers from DESIGN.md, used when data.js leaves a field out.
  const ABILITY_BY_HERO = { knight: 'shield-wall', ranger: 'twin-arrows', wizard: 'fireburst', lightbringer: 'sunburst' };
  const ABILITY_NAMES = { 'shield-wall': 'Shield Wall', 'twin-arrows': 'Twin Arrows', fireburst: 'Fireburst', sunburst: 'Sunburst' };
  const ABILITY = {
    'shield-wall': { defense: 2 },
    'twin-arrows': { attacks: 2 },
    fireburst: { range: 5, radius: 1, damage: { n: 2, d: 6, plus: 0 } },
    sunburst: { radius: 2, heal: { n: 1, d: 6, plus: 3 }, push: 1 },
  };
  const MEND = { range: 1, heal: { n: 1, d: 6, plus: 2 } };
  // An item's id decides how it works; data.js supplies names and can change the numbers.
  const ITEM = {
    potion: { kind: 'heal', heal: { n: 2, d: 4, plus: 2 }, range: 1 },
    'big-potion': { kind: 'heal', heal: { n: 4, d: 4, plus: 4 }, range: 1 },
    'star-biscuit': { kind: 'heal', heal: { n: 0, d: 4, plus: 4 }, range: 1 },
    firebomb: { kind: 'bomb', damage: { n: 2, d: 6, plus: 0 }, range: 4, radius: 1 },
    'lightning-scroll': { kind: 'zap', damage: { n: 3, d: 6, plus: 0 }, range: 99 },
    'bright-oil': { kind: 'lantern', light: 2, range: 0 },
    'feather-charm': { kind: 'speed', move: 2, range: 0 },
    'bottled-sunbeam': { kind: 'sunbeam', range: 0 },
    'shield-charm': { kind: 'gear', gear: { defense: 1 }, range: 0 },
    'sharpening-stone': { kind: 'gear', gear: { damage: 1 }, range: 0 },
    boots: { kind: 'gear', gear: { move: 1 }, range: 0 },
    gold: { kind: 'gold', gold: { min: 5, max: 20 }, range: 0 },
    // Chapter 2 (PHASE-2.md).
    'frost-crystal': { kind: 'tint', color: 'blue', range: 0 },
    'grove-crystal': { kind: 'tint', color: 'green', range: 0 },
    'ember-crystal': { kind: 'tint', color: 'red', range: 0 },
    'star-crystal': { kind: 'tint', color: 'violet', range: 0 },
    'snow-globe': { kind: 'freeze', range: 4, radius: 1 },
    'rainbow-cake': { kind: 'feast', heal: { n: 0, d: 4, plus: 3 }, range: 0 },
    'phoenix-feather': { kind: 'revive', range: 99 },
    'lucky-clover': { kind: 'gear', gear: { attack: 1 }, range: 0 },
    'heart-locket': { kind: 'gear', gear: { hearts: 3 }, range: 0 },
    'lantern-lens': { kind: 'gear', gear: { light: 1 }, range: 0 },
  };
  // Every gear field a hero carries; the last three are new in Phase 2 and default to 0.
  const GEAR_KEYS = ['defense', 'damage', 'move', 'attack', 'hearts', 'light'];
  const BOSS = {
    gustRadius: 2, gustPush: 2, gust: { n: 1, d: 4, plus: 0 }, eatHeal: 4,
    eatAt: 3, // Eat the Light once this many braziers are lit (or all of them, in a smaller room)
    summonType: 'gloomling', summonCount: 2, summonBelow: 0.5,
  };
  // The Color Dragon (PHASE-2.md). data.monsters['color-dragon'] can rename or renumber any of it:
  // moves are matched by `color` or `id`, the glow by glow.start and glow.cycle, the gobble by eatAt.
  const DRAGON = {
    type: 'color-dragon',
    cycle: ['blue', 'green', 'red', 'violet'],
    moves: {
      blue: { id: 'frost-breath', name: 'Frosty Breath', kind: 'breath', radius: 3, damage: { n: 1, d: 4, plus: 0 }, freeze: true },
      green: { id: 'vine-yank', name: 'Vine Yank', kind: 'yank' },
      red: { id: 'ember-breath', name: 'Ember Breath', kind: 'breath', radius: 2, damage: { n: 2, d: 4, plus: 0 } },
      violet: { id: 'star-hop', name: 'Star Hop', kind: 'hop' },
    },
    gobble: { id: 'gobble-color', name: 'Gobble Color', heal: 4, at: 3 },
    summonType: 'greyling',
  };
  // What each colored flame does (PHASE-2.md); data.flames[color] can change the numbers.
  const FLAME = { blue: { move: -2 }, green: { heal: 1 }, red: { damage: 1 }, violet: { defense: 1 } };
  const COLOR_ORDER = ['blue', 'green', 'red', 'violet'];
  // Monster habits: a trait name in data.js, or the monster type that has it in DESIGN.md / PHASE-2.md.
  const TRAITS = {
    shy: { names: ['shy'], types: ['gloomling'] },
    snuffer: { names: ['snuffer'], types: ['goblin'] },
    keepAway: { names: ['keeps-away', 'keep-away', 'keepaway'], types: ['slinger'] },
    sleepy: { names: ['sleepy-spores', 'sleepy', 'spores'], types: ['sporecap'] },
    flying: { names: ['flying'], types: ['gloamwing', 'chillbat', 'starwisp', 'color-dragon'] },
    boss: { names: ['boss'], types: ['gloamwing', 'color-dragon'] },
    sneaky: { names: ['sneaky'], types: ['greyling'] },
    hitAndRun: { names: ['hit-and-run', 'hitandrun', 'hit-run'], types: ['chillbat'] },
    knockback: { names: ['knockback', 'knock-back'], types: ['frostcub'] },
    splits: { names: ['splits', 'split'], types: ['magma-blob'] },
    armored: { names: ['armored', 'armor'], types: ['clanker'] },
    rooted: { names: ['rooted'], types: ['vine-snapper'] },
    grabby: { names: ['grabby', 'grab'], types: ['vine-snapper'] },
    blink: { names: ['blink', 'blinks'], types: ['starwisp'] },
  };
  // Each habit's number from PHASE-2.md, used when data.js leaves the field out.
  const HABIT = {
    hitAndRun: 3, knockback: 1, splitInto: { type: 'blobbit', count: 2 }, armor: 1,
    grab: { range: 3 }, blink: { min: 3, max: 5 },
  };
  const TEXT = { fumble: ['Whoops! Slipped on a pebble.'], crit: ['CRITICAL!'] };

  // ---------- data and lookups ----------

  // The game data rides along on the state as a hidden property, so the state itself stays
  // plain JSON. A state rebuilt some other way falls back to the global LB_DATA.
  function attach(state, data) {
    Object.defineProperty(state, '_data', { value: data, enumerable: false, configurable: true, writable: true });
    return state;
  }
  function globalData() {
    const g = typeof globalThis !== 'undefined' ? globalThis : root;
    return (g && g.LB_DATA) || (root && root.LB_DATA) || null;
  }
  function dataOf(state) {
    const data = state._data || globalData();
    if (!data) throw new Error('LB_RULES needs the game data: pass it to newGame() or deserialize().');
    return data;
  }
  // The chapter's own lines (Chapter 2's fumbles, help-ups, telegraphs) win over the top-level text.
  function textOf(state) {
    const top = dataOf(state).text || {};
    const ch = chapterOf(state);
    return ch && ch.text && Object.keys(ch.text).length ? Object.assign({}, top, ch.text) : top;
  }
  function chapterOf(state) {
    const list = dataOf(state).chapters || [];
    return list.find((c) => c.id === state.chapter) || null;
  }
  // Where the adventure begins: the chapter's startRoom, else the data's.
  function startRoom(state) {
    const data = dataOf(state);
    const ch = chapterOf(state);
    return (ch && ch.startRoom) || data.startRoom || ((data.rooms || [])[0] || {}).id || null;
  }
  // The chapter to play: an id, a number or a chapter object; the first one by default.
  function pickChapter(data, want) {
    const list = data.chapters || [];
    if (!list.length) return null;
    const id = want && typeof want === 'object' ? want.id : want;
    const found = list.find((c, i) => c.id === id || (typeof id === 'number' && (c.number === id || i === id - 1)));
    return (found || list[0]).id;
  }
  // A colored flame's numbers: data.flames[color] over PHASE-2.md's defaults.
  const flameOf = (state, color) => Object.assign({}, FLAME[color] || {}, (dataOf(state).flames || {})[color] || {});
  const roomOf = (state) => (dataOf(state).rooms || []).find((r) => r.id === state.roomId) || null;
  const hdata = (state, h) => dataOf(state).heroes[h.id] || {};
  const mdata = (state, m) => dataOf(state).monsters[m.type] || {};
  const pdata = (state, p) => (dataOf(state).props || {})[p.type] || {};

  function heroIds(state) {
    const ids = Object.keys(state.heroes);
    return HERO_ORDER.filter((id) => ids.indexOf(id) >= 0).concat(ids.filter((id) => HERO_ORDER.indexOf(id) < 0));
  }
  const heroList = (state) => heroIds(state).map((id) => state.heroes[id]);
  const standing = (state) => heroList(state).filter((h) => !h.down && h.at);
  const monsterBy = (state, uid) => state.monsters.find((m) => m.uid === uid) || null;
  const mcells = (m) => cellsOf(m.at, m.size || 1);

  function trait(state, m, name) {
    const md = mdata(state, m);
    if (name === 'boss' && md.boss) return true;
    const t = TRAITS[name];
    const list = md.traits || [];
    return t.types.indexOf(m.type) >= 0 || t.names.some((n) => list.indexOf(n) >= 0);
  }
  const isBoss = (state, m) => trait(state, m, 'boss');
  // The Color Dragon, or any boss whose data gives it a glow.
  const isDragon = (state, m) => m.type === DRAGON.type || (isBoss(state, m) && mdata(state, m).glow != null);
  // A habit's number: the monster's own field, else PHASE-2.md's.
  const habit = (state, m, field) => (mdata(state, m)[field] != null ? mdata(state, m)[field] : HABIT[field]);
  const isBrazier = (p) => p.type === 'brazier';
  const isChest = (p) => p.type === 'chest' || !!p.mimic;
  const blocks = (state, p) => pdata(state, p).blocks !== false;
  const braziers = (state) => state.props.filter(isBrazier);

  // ---------- dice ----------

  function hashSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return seed >>> 0;
    const s = String(seed);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  // mulberry32: small, fast and plenty random for dice. Its whole state is one 32-bit number.
  function rand(state) {
    state.rng = (state.rng + 0x6d2b79f5) >>> 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const die = (state, sides) => 1 + Math.floor(rand(state) * sides);
  const randInt = (state, lo, hi) => lo + Math.floor(rand(state) * (hi - lo + 1));

  // Dice are { n, d, plus }; n: 0 (or a plain number) is a flat amount.
  function dice(x, fallback) {
    if (x == null) return fallback || { n: 0, d: 0, plus: 0 };
    if (typeof x === 'number') return { n: 0, d: 0, plus: x };
    return { n: x.n || 0, d: x.d || 0, plus: x.plus || 0 };
  }
  // A critical doubles the number of dice, not the bonus.
  function rollDice(state, spec, crit, extra) {
    const count = crit ? spec.n * 2 : spec.n;
    const rolls = [];
    let total = spec.plus + (extra || 0);
    for (let i = 0; i < count; i++) {
      const v = die(state, spec.d);
      rolls.push(v);
      total += v;
    }
    return { rolls, total: Math.max(0, total) };
  }
  function goldAmount(state, spec) {
    const g = spec || RULE.gold;
    if (g.d) return rollDice(state, dice(g)).total;
    const lo = g.min != null ? g.min : RULE.gold.min;
    const hi = g.max != null ? g.max : RULE.gold.max;
    return randInt(state, lo, Math.max(lo, hi));
  }
  // Friendly lines take turns (each list keeps its own place), so they don't repeat back to
  // back and don't use up dice.
  function lineFrom(state, name, list, fallback) {
    const lines = Array.isArray(list) && list.length ? list : typeof list === 'string' ? [list] : fallback;
    if (!lines || !lines.length) return null;
    if (!state.lines || typeof state.lines !== 'object') state.lines = {};
    const n = state.lines[name] || 0;
    state.lines[name] = n + 1;
    return lines[n % lines.length];
  }

  // ---------- grid geometry ----------

  const inside = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
  const keyOf = (c, r) => r * COLS + c;
  const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  const dist2 = (a, p) => (a[0] - p[0]) * (a[0] - p[0]) + (a[1] - p[1]) * (a[1] - p[1]);
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function cellsOf(at, size) {
    if (!at) return [];
    const n = size || 1;
    const out = [];
    for (let dr = 0; dr < n; dr++) for (let dc = 0; dc < n; dc++) out.push([at[0] + dc, at[1] + dr]);
    return out;
  }
  // The smallest distance between two footprints (lists of squares); 0 means they overlap.
  function gap(a, b) {
    let best = Infinity;
    for (const x of a) for (const y of b) best = Math.min(best, cheb(x, y));
    return best;
  }
  // Distance from a size x size footprint (top-left at `at`) to one square.
  function reach(at, size, sq) {
    const dx = Math.max(0, at[0] - sq[0], sq[0] - (at[0] + size - 1));
    const dy = Math.max(0, at[1] - sq[1], sq[1] - (at[1] + size - 1));
    return Math.max(dx, dy);
  }
  // Squares within `radius` of `at`, inside the grid, row by row.
  function around(at, radius) {
    const out = [];
    for (let r = at[1] - radius; r <= at[1] + radius; r++) {
      for (let c = at[0] - radius; c <= at[0] + radius; c++) if (inside(c, r)) out.push([c, r]);
    }
    return out;
  }
  function centerOf(cells) {
    let x = 0;
    let y = 0;
    for (const [c, r] of cells) {
      x += c;
      y += r;
    }
    return [x / cells.length, y / cells.length];
  }
  const isSquare = (at) => Array.isArray(at) && at.length >= 2 && inside(at[0], at[1]);

  // ---------- light ----------

  function brazierRadius(state) {
    const b = (dataOf(state).props || {}).brazier || {};
    return typeof b.light === 'number' ? b.light : RULE.brazierLight;
  }
  // light[col][row]: 0 dark, 1 lantern light, 2 bright light (lit braziers and Fireburst).
  function lightMap(state) {
    const won = state.status === 'victory'; // the Heart Lantern fills the whole room
    const map = [];
    for (let c = 0; c < COLS; c++) map.push(new Array(ROWS).fill(won ? 2 : 0));
    if (won) return map;
    const paint = (at, radius, level) => {
      if (!at) return;
      const r0 = Math.max(0, at[1] - radius);
      const r1 = Math.min(ROWS - 1, at[1] + radius);
      for (let c = Math.max(0, at[0] - radius); c <= Math.min(COLS - 1, at[0] + radius); c++) {
        for (let r = r0; r <= r1; r++) if (map[c][r] < level) map[c][r] = level;
      }
    };
    // A knocked-down hero's lantern still glows beside them.
    for (const h of heroList(state)) paint(h.at, h.light, 1);
    const radius = brazierRadius(state);
    for (const p of state.props) if (isBrazier(p) && p.lit) paint(p.at, radius, 2);
    for (const f of state.flares || []) paint(f.at, f.radius, 2);
    return map;
  }
  const brightOn = (map, cells) => cells.some(([c, r]) => inside(c, r) && map[c][r] >= 2);
  const litOn = (map, cells) => cells.some(([c, r]) => inside(c, r) && map[c][r] >= 1);

  // A monster can be seen and targeted once it's spotted, or while any square of it is lit.
  // A sneaky one (the Greyling) needs bright light; lantern light alone doesn't show it.
  function seen(state, m, map) {
    if (m.spotted) return true;
    const L = map || lightMap(state);
    return trait(state, m, 'sneaky') ? brightOn(L, mcells(m)) : litOn(L, mcells(m));
  }

  // ---------- colored light (Chapter 2) ----------

  // Everything that colors squares: lit colored braziers (their bright-light radius) and tinted
  // lanterns (the hero's lantern radius). Chapter 1 rooms have none, so all of this stays quiet.
  function colorSources(state) {
    const out = [];
    const radius = brazierRadius(state);
    for (const p of state.props) {
      if (isBrazier(p) && p.lit && p.color && isSquare(p.at)) out.push({ at: p.at, radius, color: p.color });
    }
    for (const h of heroList(state)) {
      if (h.at && h.status && h.status.tint) out.push({ at: h.at, radius: h.light, color: h.status.tint });
    }
    return out;
  }
  // The colors on any of these squares (a unit is "in" a color if any square it covers has it).
  function colorsOn(state, cells) {
    const out = [];
    for (const s of colorSources(state)) {
      if (out.indexOf(s.color) < 0 && gap(cells, [s.at]) <= s.radius) out.push(s.color);
    }
    return out;
  }
  const inColor = (state, cells, color) => colorsOn(state, cells).indexOf(color) >= 0;
  // colors[col][row]: the colors on each square, [] where there are none, in blue-green-red-violet order.
  function colorMap(state) {
    const map = [];
    for (let c = 0; c < COLS; c++) {
      map.push([]);
      for (let r = 0; r < ROWS; r++) map[c].push([]);
    }
    for (const s of colorSources(state)) {
      for (const [c, r] of around(s.at, s.radius)) if (map[c][r].indexOf(s.color) < 0) map[c][r].push(s.color);
    }
    for (const col of map) {
      for (const cell of col) if (cell.length > 1) cell.sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b));
    }
    return map;
  }
  // Red light: +1 damage on a hero's attacks and Fireburst.
  const emberBonus = (state, h) => (h.at && inColor(state, [h.at], 'red') ? flameOf(state, 'red').damage || 0 : 0);

  // ---------- who stands where, and how to get around ----------

  // unit[k] is the uid standing on square k; prop[k] is the uid of a blocking prop there.
  function occupancy(state) {
    const unit = new Array(COLS * ROWS).fill(null);
    const prop = new Array(COLS * ROWS).fill(null);
    for (const h of heroList(state)) if (h.at) unit[keyOf(h.at[0], h.at[1])] = h.id;
    for (const m of state.monsters) for (const [c, r] of mcells(m)) if (inside(c, r)) unit[keyOf(c, r)] = m.uid;
    for (const p of state.props) if (blocks(state, p) && isSquare(p.at)) prop[keyOf(p.at[0], p.at[1])] = p.uid;
    return { unit, prop };
  }
  // A test for "could `uid` (size x size, top-left at `at`) be here?". Nobody passes through
  // another unit; fliers pass over props but never stop on one (they use overProps only to pass).
  function fits(occ, uid, size, overProps) {
    return (at) => {
      for (const [c, r] of cellsOf(at, size)) {
        if (!inside(c, r)) return false;
        const k = keyOf(c, r);
        if (occ.unit[k] && occ.unit[k] !== uid) return false;
        if (!overProps && occ.prop[k]) return false;
      }
      return true;
    };
  }
  // Breadth-first search from `start` through squares where pass(at) holds, up to maxSteps.
  // Returns a Map: square key -> { at, steps, prev } (prev is the previous key, -1 at the start).
  function bfs(start, maxSteps, pass) {
    const nodes = new Map();
    const k0 = keyOf(start[0], start[1]);
    nodes.set(k0, { at: [start[0], start[1]], steps: 0, prev: -1 });
    const queue = [k0];
    for (let i = 0; i < queue.length; i++) {
      const node = nodes.get(queue[i]);
      if (node.steps >= maxSteps) continue;
      for (const [dc, dr] of DIRS) {
        const c = node.at[0] + dc;
        const r = node.at[1] + dr;
        if (!inside(c, r)) continue;
        const k = keyOf(c, r);
        if (nodes.has(k) || !pass([c, r])) continue;
        nodes.set(k, { at: [c, r], steps: node.steps + 1, prev: queue[i] });
        queue.push(k);
      }
    }
    return nodes;
  }
  // The squares stepped onto to reach key k, not counting the start.
  function pathTo(nodes, k) {
    const path = [];
    for (let node = nodes.get(k); node && node.prev !== -1; node = nodes.get(node.prev)) path.push(node.at);
    return path.reverse();
  }
  // Steps from every square to the nearest goal square, moving only where pass(at) holds.
  function distanceField(goals, pass) {
    const dist = new Array(COLS * ROWS).fill(Infinity);
    const queue = [];
    for (const g of goals) {
      const k = keyOf(g[0], g[1]);
      if (dist[k] === Infinity) {
        dist[k] = 0;
        queue.push(g);
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i];
      const d = dist[keyOf(at[0], at[1])] + 1;
      for (const [dc, dr] of DIRS) {
        const c = at[0] + dc;
        const r = at[1] + dr;
        if (!inside(c, r)) continue;
        const k = keyOf(c, r);
        if (dist[k] !== Infinity || !pass([c, r])) continue;
        dist[k] = d;
        queue.push([c, r]);
      }
    }
    return dist;
  }
  function lexLess(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  }
  // The free square nearest to `want` (searching outward), for placing heroes and summons.
  function nearestFree(want, taken) {
    for (let radius = 0; radius < COLS; radius++) {
      for (const at of around(want, radius)) {
        if (cheb(at, want) === radius && !taken.has(keyOf(at[0], at[1]))) return at;
      }
    }
    return [want[0], want[1]];
  }

  // ---------- numbers for heroes, monsters, abilities and items ----------

  function heroStat(state, h) {
    const d = hdata(state, h);
    const g = h.gear || {};
    const s = h.status || {};
    const range = d.range || 1;
    // Violet light: +1 Defense while standing in it.
    const star = h.at && inColor(state, [h.at], 'violet') ? flameOf(state, 'violet').defense || 0 : 0;
    return {
      attack: (d.attack || 0) + (g.attack || 0),
      damage: dice(d.damage, { n: 1, d: 6, plus: 0 }),
      dmgBonus: (g.damage || 0) + emberBonus(state, h),
      range,
      kind: d.attackKind || (range > 1 ? 'arrow' : 'melee'),
      defense: (d.defense || 10) + (g.defense || 0) + (s.shield || 0) + star,
      move: Math.max(0, (d.move || 4) + (g.move || 0) + (s.feather || 0)),
    };
  }
  function monsterStat(state, m) {
    const d = mdata(state, m);
    const range = d.range || 1;
    return {
      attack: d.attack || 0,
      damage: dice(d.damage, { n: 1, d: 4, plus: 0 }),
      range,
      kind: d.attackKind || (range > 1 ? 'sling' : 'melee'),
      defense: d.defense || 10,
      move: d.move == null ? 3 : d.move,
    };
  }
  const baseLight = (state, h) => (hdata(state, h).light == null ? 2 : hdata(state, h).light);
  // A hero's lantern as they walk into a room: their own light plus any Lantern Lens they keep.
  const lanternOf = (state, h) => baseLight(state, h) + ((h.gear || {}).light || 0);

  // The hero's ability: `kind` says how it works, `id` is what events call it.
  function abilityOf(state, h) {
    const a = hdata(state, h).ability || {};
    const kind = ABILITY[a.id] ? a.id : ABILITY_BY_HERO[h.id];
    if (!kind) return null;
    const info = Object.assign({}, ABILITY[kind], a, { kind, id: a.id || kind, name: a.name || ABILITY_NAMES[kind] });
    if (info.damage) info.damage = dice(info.damage);
    if (info.heal) info.heal = dice(info.heal);
    return info;
  }
  // Mend, the Lightbringer's everyday heal, or null for heroes who can't.
  function mendOf(state, h) {
    const m = hdata(state, h).mend;
    if (m === false || (!m && h.id !== 'lightbringer')) return null;
    const o = typeof m === 'object' && m ? m : {};
    return { id: o.id || 'mend', name: o.name || 'Mend', range: o.range != null ? o.range : MEND.range,
      heal: dice(o.heal || (o.d ? o : null), MEND.heal) };
  }
  function itemOf(state, id) {
    const d = (dataOf(state).items || {})[id] || {};
    const base = ITEM[id] || {};
    const info = Object.assign({}, base, d);
    info.id = id;
    info.kind = base.kind || d.kind || 'none';
    info.range = info.range != null ? info.range : 1;
    info.radius = info.radius != null ? info.radius : 1;
    if (info.heal != null) info.heal = dice(info.heal);
    if (info.damage != null) info.damage = dice(info.damage);
    return info;
  }

  // ---------- a new game, rooms, retry ----------

  // names: { knight: 'Player name', ... } (optional). Without a seed the clock picks one.
  // chapter: a chapter id (or number) from data.chapters; the first chapter when left out.
  function newGame(opts) {
    const o = opts || {};
    const data = o.data || globalData();
    if (!data) throw new Error('LB_RULES.newGame needs { data }.');
    const seed = o.seed == null ? Date.now() % 2147483647 : o.seed;
    const names = o.names || {};
    const state = {
      v: 1, seed, rng: hashSeed(seed), chapter: pickChapter(data, o.chapter), roomId: null, visited: [],
      round: 0, side: 'party', status: 'playing',
      heroes: {}, monsters: [], props: [], flares: [], bag: [], gold: 0,
      stats: { defeated: 0, crits: 0, helps: 0, rooms: 0, helped: [], heroes: {} },
      found: { items: [], gold: 0 }, bossRoom: false, uidSeq: 0, lines: {}, roomStart: null, shop: null,
    };
    attach(state, data);
    const ids = HERO_ORDER.filter((id) => data.heroes[id])
      .concat(Object.keys(data.heroes).filter((id) => HERO_ORDER.indexOf(id) < 0));
    for (const id of ids) {
      const d = data.heroes[id];
      state.heroes[id] = {
        id, name: d.name || id, player: names[id] ? String(names[id]) : '', hp: d.hearts, maxHp: d.hearts, at: null,
        moved: false, acted: false, abilityUsed: false, down: false, status: {},
        gear: { defense: 0, damage: 0, move: 0, attack: 0, hearts: 0, light: 0 }, light: d.light == null ? 2 : d.light,
      };
      state.stats.heroes[id] = { damage: 0, healing: 0, defeated: 0, crits: 0, helps: 0 };
    }
    return state;
  }

  // Sets up a room: monsters, props, heroes on their start squares. The boss room opens
  // with its big reveal. Hearts, gear, the bag and gold carry over from room to room.
  function enterRoom(state, roomId) {
    const room = (dataOf(state).rooms || []).find((r) => r.id === roomId);
    if (!room) return [];
    const ev = [];
    const bossRoom = !!room.boss || (room.monsters || []).some((s) => isBoss(state, { type: s.type }));
    if (bossRoom) ev.push({ t: 'bossReveal' });
    state.roomId = roomId;
    if (state.visited.indexOf(roomId) < 0) state.visited.push(roomId);
    state.round = 1;
    state.side = 'party';
    state.status = 'playing';
    state.bossRoom = bossRoom;
    state.shop = null;
    state.flares = [];
    state.found = { items: [], gold: 0 };
    state.uidSeq = 0;
    state.props = (room.props || []).map((p, i) => {
      const prop = { uid: 'p' + (i + 1), type: p.type, at: [p.at[0], p.at[1]], lit: !!p.lit, opened: false,
        mimic: !!p.mimic, loot: p.loot || null };
      if (p.color) prop.color = p.color; // a colored brazier (Chapter 2); gold ones have no color
      return prop;
    });
    state.monsters = [];
    for (const s of room.monsters || []) addMonster(state, s.type, s.at);
    placeHeroes(state, room.start || []);
    state.roomStart = snapshot(state);
    ev.push({ t: 'room', roomId });
    glowEvents(state, ev);
    ev.push({ t: 'turn', side: 'party', round: 1 });
    return ev;
  }
  // The board draws a glowing boss's aura from the start, so its color is announced with the room.
  function glowEvents(state, ev) {
    for (const m of state.monsters) if (m.glow) ev.push({ t: 'glow', uid: m.uid, color: m.glow });
  }

  // Heroes walk in on the room's start squares. Anyone still knocked down is helped up on
  // the way, and per-room things (abilities, Bright Oil, statuses) reset.
  function placeHeroes(state, starts) {
    const taken = new Set();
    for (const p of state.props) if (blocks(state, p)) taken.add(keyOf(p.at[0], p.at[1]));
    for (const m of state.monsters) for (const [c, r] of mcells(m)) taken.add(keyOf(c, r));
    heroList(state).forEach((h, i) => {
      const want = isSquare(starts[i]) ? starts[i] : [Math.min(COLS - 1, 2 + i * 2), ROWS - 1];
      const at = nearestFree(want, taken);
      taken.add(keyOf(at[0], at[1]));
      h.at = [at[0], at[1]];
      h.moved = false;
      h.acted = false;
      h.abilityUsed = false;
      h.status = {};
      h.light = lanternOf(state, h);
      if (h.down || h.hp <= 0) {
        h.down = false;
        h.hp = Math.min(h.maxHp, RULE.helpUpHearts);
      }
    });
  }

  // What a retry restores: the room exactly as the party walked in.
  const SNAP_KEYS = ['heroes', 'monsters', 'props', 'bag', 'gold', 'uidSeq', 'found'];
  function snapshot(state) {
    const snap = {};
    for (const k of SNAP_KEYS) snap[k] = clone(state[k]);
    return snap;
  }

  // After everyone is knocked down: back to the room's starting snapshot with full hearts.
  // Nothing from earlier rooms is lost, and the dice keep rolling, so the fight plays fresh.
  function retry(state) {
    if (state.status !== 'partyDown' || !state.roomStart) return [];
    const snap = clone(state.roomStart);
    for (const k of SNAP_KEYS) state[k] = snap[k];
    for (const h of heroList(state)) {
      h.hp = h.maxHp;
      h.down = false;
      h.status = {};
      h.moved = false;
      h.acted = false;
      h.abilityUsed = false;
      h.light = lanternOf(state, h);
    }
    state.flares = [];
    state.round = 1;
    state.side = 'party';
    state.status = 'playing';
    state.shop = null; // Purchases belong to the previous cleared room; its bag and gold are in the snapshot.
    const ev = [{ t: 'room', roomId: state.roomId, retry: true }];
    glowEvents(state, ev);
    ev.push({ t: 'turn', side: 'party', round: 1 });
    return ev;
  }

  // Through a doorway, once the room is cleared. With one exit, arch can be left out.
  function leave(state, arch) {
    if (state.status !== 'cleared') return [];
    const exitsHere = (roomOf(state) || {}).exits || [];
    const exit = exitsHere.find((e) => e.arch === arch) || (arch == null && exitsHere.length === 1 ? exitsHere[0] : null);
    if (!exit) return [];
    return enterRoom(state, exit.to);
  }

  // Where each doorway leads, for the room-cleared screen: [{ arch, to, name }].
  function exits(state) {
    const rooms = dataOf(state).rooms || [];
    return (((roomOf(state) || {}).exits) || []).map((e) => {
      const to = rooms.find((r) => r.id === e.to);
      return { arch: e.arch, to: e.to, name: (to && to.name) || e.to };
    });
  }

  function serialize(state) {
    return JSON.stringify(state);
  }
  // A saved game. Saves from before Phase 2 get a chapter (Chapter 1) and the new gear fields.
  function deserialize(text, data) {
    const state = typeof text === 'string' ? JSON.parse(text) : clone(text);
    attach(state, data || globalData());
    const d = state._data || {};
    if (state.chapter === undefined) state.chapter = d.chapters && d.chapters.length ? d.chapters[0].id : 'deep-lanterns';
    if (state.shop === undefined) {
      state.shop = null;
      if (state.status === 'cleared' && !state.bossRoom) stockShop(state);
    }
    for (const h of Object.values(state.heroes || {})) {
      const gear = {};
      for (const k of GEAR_KEYS) gear[k] = 0;
      h.gear = Object.assign(gear, h.gear || {});
    }
    return state;
  }

  // Draw without replacement from the room's table, after its last treasure roll.
  function stockShop(state) {
    const items = dataOf(state).items || {};
    const pool = [...new Set((roomOf(state).loot || []).filter((id) => id !== 'gold' && items[id] && items[id].kind !== 'gold'))];
    const stock = [];
    while (stock.length < 3 && pool.length) {
      const item = pool.splice(Math.floor(rand(state) * pool.length), 1)[0];
      stock.push({ item, price: items[item].price, sold: false });
    }
    state.shop = { roomId: state.roomId, stock };
  }

  function buy(state, itemId) {
    if (state.status !== 'cleared' || state.bossRoom || !state.shop || state.shop.roomId !== state.roomId) return [];
    const offer = state.shop.stock.find((s) => s.item === itemId);
    if (!offer || offer.sold || !Number.isInteger(offer.price) || offer.price < 0 || state.gold < offer.price) return [];
    state.gold -= offer.price;
    state.bag.push(itemId);
    offer.sold = true;
    return [{ t: 'purchase', item: itemId, price: offer.price }];
  }

  // ---------- combat ----------

  function credit(state, heroId, field, amount) {
    const s = state.stats.heroes[heroId];
    if (s && amount > 0) s[field] += amount;
  }
  function spot(state, ev, m) {
    if (m.spotted || state.monsters.indexOf(m) < 0) return;
    m.spotted = true;
    ev.push({ t: 'spotted', uid: m.uid });
  }

  // One attack roll: d20 + Attack (+2 if the target stands in bright light) against Defense.
  // A 20 always hits and doubles the damage dice; a 1 always misses, with a friendly line.
  // a: { uid, attack, damage, dmgBonus, kind, hero | monster }  t: { uid, defense, cells, hero | monster }
  function strike(state, ev, a, t) {
    // Attacking or being attacked spots a monster; it's revealed first so the board can show it lunge.
    if (a.monster) spot(state, ev, a.monster);
    if (t.monster) spot(state, ev, t.monster);
    ev.push({ t: 'attack', uid: a.uid, target: t.uid, kind: a.kind });
    const lit = brightOn(lightMap(state), t.cells);
    const bonus = a.attack + (lit ? RULE.litBonus : 0); // so total is always value + bonus
    const value = die(state, 20);
    const crit = value === 20;
    const fumble = value === 1;
    const total = value + bonus;
    const hit = crit || (!fumble && total >= t.defense);
    const tx = textOf(state);
    const line = fumble ? lineFrom(state, 'fumble', tx.fumble, TEXT.fumble) : crit ? lineFrom(state, 'crit', tx.crit, TEXT.crit) : null;
    ev.push({ t: 'roll', uid: a.uid, target: t.uid, d: 20, value, bonus, lit, total, need: t.defense, hit, crit, fumble, line });
    if (!hit) return false;
    if (crit && a.hero) {
      state.stats.crits += 1;
      credit(state, a.uid, 'crits', 1);
    }
    const dmg = rollDice(state, a.damage, crit, a.dmgBonus);
    hurt(state, ev, t.uid, dmg.total, dmg.rolls, crit, a.uid);
    return true;
  }
  function heroStrike(state, ev, h, m) {
    const s = heroStat(state, h);
    return strike(state, ev, { uid: h.id, hero: h, attack: s.attack, damage: s.damage, dmgBonus: s.dmgBonus, kind: s.kind },
      { uid: m.uid, monster: m, defense: monsterStat(state, m).defense, cells: mcells(m) });
  }
  // Sporecaps' spores make a hero they hit Sleepy: no moving on their next turn. A Frostcub's
  // snowball knocks the hero it hits straight back, when there's room.
  function monsterStrike(state, ev, m, h, kind) {
    const s = monsterStat(state, m);
    const hit = strike(state, ev, { uid: m.uid, monster: m, attack: s.attack, damage: s.damage, dmgBonus: 0, kind: kind || s.kind },
      { uid: h.id, hero: h, defense: heroStat(state, h).defense, cells: [h.at] });
    if (hit && !h.down && trait(state, m, 'sleepy') && !h.status.sleepy) {
      h.status.sleepy = true;
      ev.push({ t: 'status', uid: h.id, status: 'sleepy', on: true });
      sayKey(state, ev, 'sleepy');
    }
    if (hit && !h.down && trait(state, m, 'knockback')) {
      if (pushUnit(state, ev, h, centerOf(mcells(m)), habit(state, m, 'knockback'), 'knockback', m.uid)) sayKey(state, ev, 'knockback');
    }
    return hit;
  }

  // Takes hearts away, then whatever follows: knocked down, defeated, the boss's call.
  // `spec` (optional) names the dice behind a roll-less hit, such as a breath, for the dice tray.
  function hurt(state, ev, uid, amount, rolls, crit, by, spec) {
    const h = state.heroes[uid];
    if (h) {
      if (h.down) return;
      h.hp = Math.max(0, h.hp - amount);
      const e = { t: 'damage', target: uid, amount, rolls, crit: !!crit, hp: h.hp, by };
      if (spec) e.dice = spec;
      ev.push(e);
      if (h.hp === 0) knockDown(state, ev, h);
      return;
    }
    const m = monsterBy(state, uid);
    if (!m) return;
    const before = m.hp;
    const e = { t: 'damage', target: uid, amount, rolls, crit: !!crit, hp: m.hp, by };
    if (trait(state, m, 'armored')) { // thick brass: each hit does `armor` less, but always at least 1
      e.armored = habit(state, m, 'armor');
      amount = Math.max(1, amount - e.armored);
      e.amount = amount;
    }
    m.hp = Math.max(0, m.hp - amount);
    e.hp = m.hp;
    ev.push(e);
    if (e.armored && !m.clanged) { // the line explains the smaller number once per monster
      m.clanged = true;
      sayKey(state, ev, 'armored');
    }
    credit(state, by, 'damage', before - m.hp);
    if (m.hp === 0) defeat(state, ev, m, by);
    else if (isBoss(state, m)) maybeSummon(state, ev, m);
  }
  function knockDown(state, ev, h) {
    h.down = true;
    ev.push({ t: 'down', uid: h.id, line: lineFrom(state, 'down', textOf(state).down, null) });
    for (const s of ['sleepy', 'shield', 'feather', 'frozen']) {
      if (!h.status[s]) continue;
      delete h.status[s];
      ev.push({ t: 'status', uid: h.id, status: s, on: false });
    }
  }
  function defeat(state, ev, m, by) {
    state.monsters.splice(state.monsters.indexOf(m), 1);
    state.stats.defeated += 1;
    credit(state, by, 'defeated', 1);
    ev.push({ t: 'defeated', uid: m.uid, type: m.type, at: m.at, by });
    if (isBoss(state, m)) return; // the boss's fall ends the game once the action is done
    if (trait(state, m, 'splits')) split(state, ev, m);
    if (rand(state) < RULE.goldChance) giveGold(state, ev, goldAmount(state, itemOf(state, 'gold').gold), by, m.uid, m.at);
    const md = mdata(state, m);
    const drops = md.drops != null ? md.drops : m.type === 'mimic' ? 2 : 0;
    for (let i = 0; i < drops; i++) giveLoot(state, ev, rollLoot(state), by, m.uid, m.at);
  }

  // ---------- loot, healing, light ----------

  function rollLoot(state) {
    const table = (roomOf(state) || {}).loot || [];
    return table.length ? table[Math.floor(rand(state) * table.length)] : 'gold';
  }
  // An item from a chest or a monster. Gear goes straight onto a hero; the rest into the bag.
  function giveLoot(state, ev, item, by, from, at) {
    const info = itemOf(state, item);
    if (info.kind === 'gold') {
      const amount = goldAmount(state, info.gold);
      ev.push({ t: 'loot', item, by, from, at, amount });
      giveGold(state, ev, amount, by, from, at);
      return;
    }
    state.found.items.push(item);
    if (info.kind === 'gear') {
      wearGear(state, ev, state.heroes[by] || state.heroes[nearestHero(state, at)], info.gear || {}, item, from, at);
      return;
    }
    state.bag.push(item);
    ev.push({ t: 'loot', item, by, from, at });
  }
  function giveGold(state, ev, amount, by, from, at) {
    state.gold += amount;
    state.found.gold += amount;
    ev.push({ t: 'gold', amount, by, from, at });
  }
  function nearestHero(state, at) {
    const list = standing(state).length ? standing(state) : heroList(state);
    let best = list[0];
    for (const h of list) if (h.at && at && cheb(h.at, at) < cheb(best.at || at, at)) best = h;
    return best.id;
  }
  const helpLine = (state) => lineFrom(state, 'helpUp', textOf(state).helpUp, null);
  // A friendly message from data.text (say-event lines such as text.mimic), when data has one.
  function sayKey(state, ev, key) {
    const text = textOf(state)[key];
    const line = Array.isArray(text) ? lineFrom(state, key, text, null) : text;
    if (line) ev.push({ t: 'say', text: line, key });
  }
  function countHelp(state, by, who) {
    if (!state.heroes[by] || by === who) return;
    state.stats.helps += 1;
    state.stats.helped.push({ by, who });
    credit(state, by, 'helps', 1);
  }
  // Heals a hero. Healing a knocked-down hero also gets them back up.
  // `source` (optional) tags where a roll-less heal came from, such as 'green' for green light.
  function healHero(state, ev, h, roll, by, source) {
    const tag = (e) => (source ? Object.assign(e, { source }) : e);
    if (h.down) {
      h.down = false;
      h.hp = Math.min(h.maxHp, Math.max(1, roll.total));
      ev.push(tag({ t: 'heal', target: h.id, amount: h.hp, rolls: roll.rolls, hp: h.hp, by }));
      ev.push({ t: 'up', uid: h.id, by, hp: h.hp, line: helpLine(state) });
      credit(state, by, 'healing', h.hp);
      countHelp(state, by, h.id);
      return;
    }
    const amount = Math.min(roll.total, h.maxHp - h.hp);
    h.hp += amount;
    ev.push(tag({ t: 'heal', target: h.id, amount, rolls: roll.rolls, hp: h.hp, by }));
    credit(state, by, 'healing', amount);
  }
  // Gear goes straight onto a hero and keeps for the whole adventure. The Heart Locket raises max
  // hearts and heals the same right away; the Lantern Lens makes the lantern bigger from now on.
  function wearGear(state, ev, h, g, item, from, at) {
    for (const k of GEAR_KEYS) h.gear[k] = (h.gear[k] || 0) + (g[k] || 0);
    ev.push({ t: 'loot', item, by: h.id, from, at, keeps: true });
    if (g.hearts) {
      h.maxHp += g.hearts;
      healHero(state, ev, h, { rolls: [], total: g.hearts }, h.id);
    }
    if (g.light) h.light += g.light;
  }
  function lightProp(state, ev, p, by) {
    p.lit = true;
    ev.push({ t: 'light', prop: p.uid, by });
  }
  // When the last brazier is lit, the room is bright and each standing hero heals a little.
  // It can happen again if a brazier goes out and gets relit.
  function checkBright(state, ev) {
    const all = braziers(state);
    if (!all.length || all.some((p) => !p.lit)) return;
    ev.push({ t: 'bright' });
    for (const h of standing(state)) {
      if (h.hp < h.maxHp) healHero(state, ev, h, { rolls: [], total: RULE.brightHeal }, null);
    }
  }

  // ---------- monsters appearing ----------

  function addMonster(state, type, at) {
    const d = dataOf(state).monsters[type] || {};
    const size = d.size || 1;
    state.uidSeq += 1;
    const m = {
      uid: 'm' + state.uidSeq, type, hp: d.hearts || 1, maxHp: d.hearts || 1,
      at: [Math.min(Math.max(0, at[0]), COLS - size), Math.min(Math.max(0, at[1]), ROWS - size)],
      spotted: false, status: {}, size,
    };
    m.spotted = isBoss(state, m); // the boss had its big reveal, so it's never hidden
    if (isDragon(state, m)) m.glow = glowStart(d);
    state.monsters.push(m);
    return m;
  }
  // Where the Color Dragon's glow begins: data glow.start, a plain color string, or blue.
  function glowStart(d) {
    const g = d.glow;
    if (typeof g === 'string') return g;
    if (g && typeof g === 'object') return g.start || (Array.isArray(g.cycle) && g.cycle[0]) || DRAGON.cycle[0];
    return DRAGON.cycle[0];
  }
  // `count` free squares around a footprint, nearest first (the footprint itself first when `self`).
  function freeNear(state, cells, count, self) {
    const free = fits(occupancy(state), null, 1, false);
    const out = [];
    const looked = new Set(cells.map(([c, r]) => keyOf(c, r)));
    if (self) for (const at of cells) if (out.length < count && free(at)) out.push(at);
    let ring = cells;
    while (ring.length && out.length < count) {
      const next = [];
      for (const at of ring) {
        for (const [dc, dr] of DIRS) {
          const sq = [at[0] + dc, at[1] + dr];
          if (!inside(sq[0], sq[1]) || looked.has(keyOf(sq[0], sq[1]))) continue;
          looked.add(keyOf(sq[0], sq[1]));
          next.push(sq);
          if (out.length < count && free(sq)) out.push(sq);
        }
      }
      ring = next;
    }
    return out;
  }
  function bossOf(state, m) {
    const d = mdata(state, m);
    const moves = d.moves || [];
    const move = (id) => moves.find((x) => x.id === id) || {};
    const gust = move('wing-gust');
    const swoop = move('swoop');
    const eat = move('eat-the-light');
    const s = d.summon || {};
    return {
      gustRadius: gust.radius != null ? gust.radius : BOSS.gustRadius,
      gustPush: gust.push != null ? gust.push : BOSS.gustPush,
      gust: dice(gust.damage, BOSS.gust),
      eatHeal: eat.heal != null ? eat.heal : BOSS.eatHeal,
      eatAt: d.eatAt || BOSS.eatAt,
      summonType: s.type || (isDragon(state, m) ? DRAGON.summonType : BOSS.summonType),
      summonCount: s.count != null ? s.count : BOSS.summonCount,
      summonBelow: s.below != null ? s.below : BOSS.summonBelow,
      name: { gust: gust.name || 'Wing Gust', swoop: swoop.name || 'Swoop', eat: eat.name || 'Eat the Light' },
      id: { gust: gust.id || 'wing-gust', swoop: swoop.id || 'swoop', eat: eat.id || 'eat-the-light' },
    };
  }
  // At half hearts Gloamwing calls Gloomlings, once.
  function maybeSummon(state, ev, m) {
    const b = bossOf(state, m);
    if (m.called || m.hp > m.maxHp * b.summonBelow) return;
    m.called = true;
    sayKey(state, ev, 'summon');
    for (const at of freeNear(state, mcells(m), b.summonCount)) {
      const s = addMonster(state, b.summonType, at);
      s.spotted = true;
      ev.push({ t: 'summon', uid: s.uid, at: s.at, type: s.type, by: m.uid });
    }
  }
  // A Magma Blob pops into Blobbits on the nearest free squares (its own square first). They are
  // spotted already and act on the next monster turn.
  function split(state, ev, m) {
    const into = Object.assign({}, HABIT.splitInto, mdata(state, m).splitInto || {});
    const kids = freeNear(state, mcells(m), into.count, true).map((at) => addMonster(state, into.type, at));
    for (const k of kids) k.spotted = true;
    ev.push({ t: 'split', uid: m.uid, into: kids.map((k) => k.uid), at: m.at, type: into.type });
    for (const k of kids) ev.push({ t: 'summon', uid: k.uid, at: k.at, type: k.type, by: m.uid });
    sayKey(state, ev, 'split');
  }
  // A chest that was a Mimic all along: the prop goes away and the monster stands in its place.
  function wakeMimic(state, ev, p) {
    state.props.splice(state.props.indexOf(p), 1);
    const m = addMonster(state, 'mimic', p.at);
    m.spotted = true;
    ev.push({ t: 'mimic', uid: m.uid, prop: p.uid, at: m.at });
    sayKey(state, ev, 'mimic');
    return m;
  }
  function openChest(state, ev, p, by) {
    p.opened = true;
    giveLoot(state, ev, p.loot || rollLoot(state), by, p.uid, p.at);
  }

  // ---------- the end of a fight ----------

  // After every hero action: has the boss fallen, is the room clear, or is the only monster
  // left a Mimic still pretending to be a chest? (Then it gives up pretending.)
  function settle(state, ev) {
    if (state.status !== 'playing') return;
    if (state.bossRoom) {
      if (!state.monsters.some((m) => isBoss(state, m))) win(state, ev);
      return;
    }
    if (state.monsters.length) return;
    const sleepers = state.props.filter((p) => p.mimic);
    if (sleepers.length) {
      for (const p of sleepers) wakeMimic(state, ev, p);
      return;
    }
    clearRoom(state, ev);
  }
  // Room cleared: the braziers light themselves, friends get everyone up, and any chest
  // nobody reached opens for the nearest hero, so no treasure is left behind.
  function clearRoom(state, ev) {
    state.status = 'cleared';
    state.stats.rooms += 1;
    state.flares = [];
    ev.push({ t: 'cleared' });
    sayKey(state, ev, 'cleared');
    celebrate(state, ev);
    standUp(state, ev);
    for (const p of state.props.slice()) {
      if (isChest(p) && !p.opened && !p.mimic) openChest(state, ev, p, nearestHero(state, p.at));
    }
    stockShop(state);
  }
  function celebrate(state, ev) {
    const unlit = braziers(state).filter((p) => !p.lit);
    for (const p of unlit) lightProp(state, ev, p, null);
    if (unlit.length) checkBright(state, ev);
  }
  function standUp(state, ev) {
    for (const h of heroList(state)) {
      if (!h.down) continue;
      h.down = false;
      h.hp = Math.min(h.maxHp, RULE.helpUpHearts);
      ev.push({ t: 'up', uid: h.id, by: null, hp: h.hp, line: helpLine(state) });
    }
  }
  // Gloamwing is defeated: its Gloomlings pop into wisps, every light in the chamber blazes,
  // and the Heart Lantern shines again.
  function win(state, ev) {
    for (const m of state.monsters.slice()) {
      state.monsters.splice(state.monsters.indexOf(m), 1);
      ev.push({ t: 'defeated', uid: m.uid, type: m.type, at: m.at, by: null });
    }
    state.flares = [];
    celebrate(state, ev);
    // The Heart Lantern (Chapter 1) or the Prism Crystal (Chapter 2) blazes again.
    for (const p of state.props) if (!isBrazier(p) && /lantern|prism-heart/.test(p.type) && !p.lit) lightProp(state, ev, p, null);
    standUp(state, ev);
    state.status = 'victory';
    state.stats.rooms += 1;
    ev.push({ t: 'victory' });
  }

  // ---------- what a hero can do right now ----------

  const canPlay = (state, h) => !!h && !h.down && !!h.at && state.status === 'playing' && state.side === 'party';
  // Visible monsters within `range` of a hero.
  function targetsFor(state, h, range, map) {
    return state.monsters.filter((m) => seen(state, m, map) && gap([h.at], mcells(m)) <= range);
  }
  // Heroes within `range` (counting the hero themself) who are hurt or knocked down.
  function healTargets(state, h, range) {
    return heroList(state).filter((o) => o.at && cheb(o.at, h.at) <= range && (o.down || o.hp < o.maxHp));
  }
  const nearProps = (state, h, test) => state.props.filter((p) => test(p) && cheb(p.at, h.at) <= 1);
  const uniq = (list) => list.filter((x, i) => list.indexOf(x) === i);
  const uids = (list) => list.map((x) => x.uid || x.id);

  // { moves: [{ at, path }], actions: [...] }. Anything impossible right now is left out.
  function options(state, heroId) {
    const out = { moves: [], actions: [] };
    const h = state.heroes[heroId];
    if (!canPlay(state, h)) return out;
    if (!h.moved && !h.status.sleepy && !h.status.frozen) {
      const nodes = heroReach(state, h);
      for (const [k, node] of nodes) if (node.steps > 0) out.moves.push({ at: node.at, path: pathTo(nodes, k) });
    }
    if (h.acted) {
      if (!h.moved) out.actions.push({ kind: 'wait' });
      return out;
    }
    const map = lightMap(state);
    const reach = targetsFor(state, h, heroStat(state, h).range, map);
    if (reach.length) out.actions.push({ kind: 'attack', targets: uids(reach) });
    const ability = abilityOption(state, h, map);
    if (ability) out.actions.push(ability);
    const mend = mendOf(state, h);
    const mendable = mend ? healTargets(state, h, mend.range) : [];
    if (mendable.length) out.actions.push({ kind: 'mend', targets: uids(mendable) });
    for (const item of uniq(state.bag)) {
      const o = itemOption(state, h, item, map);
      if (o) out.actions.push(o);
    }
    const unlit = nearProps(state, h, (p) => isBrazier(p) && !p.lit);
    if (unlit.length) out.actions.push({ kind: 'light', props: uids(unlit) });
    const chests = nearProps(state, h, (p) => isChest(p) && !p.opened);
    if (chests.length) out.actions.push({ kind: 'open', props: uids(chests) });
    const fallen = heroList(state).filter((o) => o.down && o.at && cheb(o.at, h.at) <= 1);
    if (fallen.length) out.actions.push({ kind: 'help', heroes: uids(fallen) });
    out.actions.push({ kind: 'wait' });
    return out;
  }
  // Fireburst offers every square within 5 as `area` (and `radius` for the 3x3 preview);
  // Sunburst's `area` is the squares it will touch.
  function abilityOption(state, h, map) {
    if (h.abilityUsed) return null;
    const ab = abilityOf(state, h);
    if (!ab) return null;
    if (ab.kind === 'shield-wall') return { kind: 'ability', id: ab.id };
    if (ab.kind === 'twin-arrows') {
      const t = targetsFor(state, h, heroStat(state, h).range, map);
      return t.length ? { kind: 'ability', id: ab.id, targets: uids(t) } : null;
    }
    if (ab.kind === 'fireburst') return { kind: 'ability', id: ab.id, area: around(h.at, ab.range), radius: ab.radius };
    if (ab.kind === 'sunburst') return { kind: 'ability', id: ab.id, area: around(h.at, ab.radius) };
    return null;
  }
  function itemOption(state, h, item, map) {
    const info = itemOf(state, item);
    switch (info.kind) {
      case 'gear':
        return { kind: 'item', item };
      case 'heal': {
        const t = healTargets(state, h, info.range);
        return t.length ? { kind: 'item', item, targets: uids(t) } : null;
      }
      case 'bomb':
        return { kind: 'item', item, area: around(h.at, info.range), radius: info.radius };
      case 'zap': {
        const t = targetsFor(state, h, info.range, map);
        return t.length ? { kind: 'item', item, targets: uids(t) } : null;
      }
      case 'lantern':
        return h.status['bright-oil'] ? null : { kind: 'item', item };
      case 'speed':
        return h.moved || h.status.sleepy || h.status.frozen || h.status.feather ? null : { kind: 'item', item };
      case 'sunbeam':
        return braziers(state).some((p) => !p.lit) ? { kind: 'item', item } : null;
      // Chapter 2: a crystal of a color the lantern doesn't already have; the Snow Globe aims like
      // the Firebomb; the Rainbow Cake needs someone hurt; the Phoenix Feather someone down.
      case 'tint':
        return info.color && h.status.tint !== info.color ? { kind: 'item', item } : null;
      case 'freeze':
        return { kind: 'item', item, area: around(h.at, info.range), radius: info.radius };
      case 'feast':
        return heroList(state).some((o) => o.at && (o.down || o.hp < o.maxHp)) ? { kind: 'item', item } : null;
      case 'revive': {
        const fallen = heroList(state).filter((o) => o.down && o.at);
        return fallen.length ? { kind: 'item', item, heroes: uids(fallen) } : null;
      }
      default:
        return null;
    }
  }
  function heroReach(state, h) {
    return bfs(h.at, heroStat(state, h).move, fits(occupancy(state), h.id, 1, false));
  }

  // ---------- hero turns ----------

  // One move per turn, up to Move squares, never through units or blocking props.
  function move(state, heroId, at) {
    const h = state.heroes[heroId];
    if (!canPlay(state, h) || h.moved || h.status.sleepy || h.status.frozen || !isSquare(at)) return [];
    const nodes = heroReach(state, h);
    const k = keyOf(at[0], at[1]);
    const node = nodes.get(k);
    if (!node || node.steps === 0) return [];
    const path = pathTo(nodes, k);
    h.at = [at[0], at[1]];
    h.moved = true;
    return [{ t: 'move', uid: heroId, path }];
  }

  // action = { kind, target?, targets?, at?, item? }. A missing target means the first valid
  // one. An impossible action changes nothing and returns []. 'wait' ends the hero's turn.
  function act(state, heroId, action) {
    const h = state.heroes[heroId];
    if (!canPlay(state, h) || !action) return [];
    if (action.kind === 'wait') {
      h.moved = true;
      h.acted = true;
      return [];
    }
    const fn = ACTIONS[action.kind];
    if (h.acted || !fn) return [];
    const ev = [];
    if (!fn(state, ev, h, action)) return [];
    h.acted = true;
    settle(state, ev);
    return ev;
  }

  const targetOf = (a) => (a.target != null ? a.target : a.uid != null ? a.uid : a.prop != null ? a.prop : a.hero);
  // The chosen thing from the valid ones; with no choice given, the first valid one.
  function choose(list, id) {
    if (id == null) return list[0] || null;
    return list.find((x) => x.uid === id || x.id === id) || null;
  }
  // Heal targets default to the hero themself when they need it.
  function chooseHero(list, id, self) {
    if (id == null && list.indexOf(self) >= 0) return self;
    return choose(list, id);
  }

  const ACTIONS = {
    attack(state, ev, h, a) {
      const m = choose(targetsFor(state, h, heroStat(state, h).range), targetOf(a));
      if (!m) return false;
      heroStrike(state, ev, h, m);
      return true;
    },
    ability(state, ev, h, a) {
      const ab = abilityOf(state, h);
      if (h.abilityUsed || !ab || !ABILITY_FNS[ab.kind](state, ev, h, a, ab)) return false;
      h.abilityUsed = true;
      return true;
    },
    mend(state, ev, h, a) {
      const mend = mendOf(state, h);
      const o = mend && chooseHero(healTargets(state, h, mend.range), targetOf(a), h);
      if (!o) return false;
      ev.push({ t: 'ability', uid: h.id, id: mend.id, name: mend.name, at: o.at, area: [o.at] });
      healHero(state, ev, o, rollDice(state, mend.heal), h.id);
      return true;
    },
    item(state, ev, h, a) {
      if (state.bag.indexOf(a.item) < 0) return false;
      const info = itemOf(state, a.item);
      const fn = ITEM_FNS[info.kind];
      if (!fn || !fn(state, ev, h, a, info)) return false;
      state.bag.splice(state.bag.indexOf(a.item), 1);
      return true;
    },
    light(state, ev, h, a) {
      const p = choose(nearProps(state, h, (x) => isBrazier(x) && !x.lit), targetOf(a));
      if (!p) return false;
      lightProp(state, ev, p, h.id);
      if (p.color) sayKey(state, ev, 'colorBack'); // color floods back into the room
      checkBright(state, ev);
      return true;
    },
    // Opening a Mimic wakes it, and it bites the opener (a free attack).
    open(state, ev, h, a) {
      const p = choose(nearProps(state, h, (x) => isChest(x) && !x.opened), targetOf(a));
      if (!p) return false;
      if (p.mimic) monsterStrike(state, ev, wakeMimic(state, ev, p), h, 'bite');
      else openChest(state, ev, p, h.id);
      return true;
    },
    help(state, ev, h, a) {
      const o = choose(heroList(state).filter((x) => x.down && x.at && cheb(x.at, h.at) <= 1), targetOf(a));
      if (!o) return false;
      o.down = false;
      o.hp = Math.min(o.maxHp, RULE.helpUpHearts);
      ev.push({ t: 'up', uid: o.id, by: h.id, hp: o.hp, line: helpLine(state) });
      countHelp(state, h.id, o.id);
      return true;
    },
  };

  // Each ability checks its choice first and only then changes anything.
  const ABILITY_FNS = {
    // +2 Defense until the party's next turn; monsters after a friend beside her must attack her.
    'shield-wall'(state, ev, h, a, ab) {
      h.status.shield = ab.defense;
      ev.push({ t: 'ability', uid: h.id, id: ab.id, name: ab.name, at: h.at, area: around(h.at, 1) });
      ev.push({ t: 'status', uid: h.id, status: 'shield', on: true });
      return true;
    },
    // Two attacks; if the first target falls, the next arrow flies at the nearest other target.
    'twin-arrows'(state, ev, h, a, ab) {
      const range = heroStat(state, h).range;
      const wanted = (a.targets && a.targets.length ? a.targets : [targetOf(a)]).filter((x) => x != null);
      const first = choose(targetsFor(state, h, range), wanted[0]);
      if (!first) return false;
      if (!wanted.length) wanted.push(first.uid);
      ev.push({ t: 'ability', uid: h.id, id: ab.id, name: ab.name, at: first.at, area: mcells(first) });
      for (let shot = 0; shot < (ab.attacks || 2); shot++) {
        const now = targetsFor(state, h, range);
        if (!now.length) break;
        const want = wanted[shot] != null ? wanted[shot] : wanted[0];
        const m = now.find((x) => x.uid === want) || nearestTo(now, h.at);
        heroStrike(state, ev, h, m);
      }
      return true;
    },
    // A square within 5: every monster on it or next to it takes 2d6 with no roll, and the
    // burst lights that area brightly until the end of the round.
    fireburst(state, ev, h, a, ab) {
      const at = a.at;
      if (!isSquare(at) || cheb(at, h.at) > ab.range) return false;
      const area = around(at, ab.radius);
      ev.push({ t: 'ability', uid: h.id, id: ab.id, name: ab.name, at: [at[0], at[1]], area });
      state.flares.push({ at: [at[0], at[1]], radius: ab.radius });
      blast(state, ev, h.id, area, ab.damage, emberBonus(state, h));
      return true;
    },
    // Heroes within 2 heal d6+3 (a knocked-down one gets up); monsters within 2 are pushed away.
    sunburst(state, ev, h, a, ab) {
      ev.push({ t: 'ability', uid: h.id, id: ab.id, name: ab.name, at: h.at, area: around(h.at, ab.radius) });
      for (const o of healTargets(state, h, ab.radius)) healHero(state, ev, o, rollDice(state, ab.heal), h.id);
      const near = state.monsters.filter((m) => gap(mcells(m), [h.at]) <= ab.radius)
        .sort((x, y) => dist2(centerOf(mcells(y)), h.at) - dist2(centerOf(mcells(x)), h.at));
      for (const m of near) pushUnit(state, ev, m, h.at, ab.push);
      return true;
    },
  };
  function nearestTo(list, at) {
    let best = list[0];
    for (const m of list) if (gap(mcells(m), [at]) < gap(mcells(best), [at])) best = m;
    return best;
  }
  // Area damage with no roll to hit: every monster touching the area, hidden or not.
  // `extra` is a flat bonus on each hit (red light under the Wizard's feet).
  function blast(state, ev, by, area, spec, extra) {
    for (const m of state.monsters.filter((x) => gap(mcells(x), area) === 0)) {
      if (state.monsters.indexOf(m) < 0) continue;
      spot(state, ev, m);
      const dmg = rollDice(state, spec, false, extra || 0);
      hurt(state, ev, m.uid, dmg.total, dmg.rolls, false, by);
    }
  }

  // Using an item takes the user's action. Firebombs hurt monsters only, like Fireburst.
  const ITEM_FNS = {
    // Shop gear waits in the bag until a hero chooses to wear it.
    gear(state, ev, h, a, info) {
      wearGear(state, ev, h, info.gear || {}, info.id, 'bag', h.at);
      return true;
    },
    heal(state, ev, h, a, info) {
      const o = chooseHero(healTargets(state, h, info.range), targetOf(a), h);
      if (!o) return false;
      ev.push({ t: 'ability', uid: h.id, id: info.id, name: info.name || info.id, at: o.at, area: [o.at], item: info.id });
      healHero(state, ev, o, rollDice(state, info.heal || dice(4)), h.id);
      return true;
    },
    bomb(state, ev, h, a, info) {
      const m = a.at == null && a.target != null ? monsterBy(state, a.target) : null;
      const at = a.at || (m && m.at);
      if (!isSquare(at) || cheb(at, h.at) > info.range) return false;
      const area = around(at, info.radius);
      ev.push({ t: 'ability', uid: h.id, id: info.id, name: info.name || 'Firebomb', at: [at[0], at[1]], area, item: info.id });
      blast(state, ev, h.id, area, info.damage || dice({ n: 2, d: 6 }));
      return true;
    },
    zap(state, ev, h, a, info) {
      const m = choose(targetsFor(state, h, info.range), targetOf(a));
      if (!m) return false;
      ev.push({ t: 'attack', uid: h.id, target: m.uid, kind: 'spark', item: info.id });
      spot(state, ev, m);
      const dmg = rollDice(state, info.damage || dice({ n: 3, d: 6 }), false);
      hurt(state, ev, m.uid, dmg.total, dmg.rolls, false, h.id);
      return true;
    },
    lantern(state, ev, h, a, info) {
      if (h.status['bright-oil']) return false;
      const more = info.light || 2;
      h.status['bright-oil'] = more;
      h.light += more;
      ev.push({ t: 'status', uid: h.id, status: 'bright-oil', on: true, item: info.id });
      return true;
    },
    speed(state, ev, h, a, info) {
      if (h.moved || h.status.sleepy || h.status.frozen || h.status.feather) return false;
      h.status.feather = info.move || 2;
      ev.push({ t: 'status', uid: h.id, status: 'feather', on: true, item: info.id });
      return true;
    },
    sunbeam(state, ev, h, a, info) {
      const unlit = braziers(state).filter((p) => !p.lit);
      if (!unlit.length) return false;
      ev.push({ t: 'ability', uid: h.id, id: info.id, name: info.name || info.id, at: h.at, area: [], item: info.id });
      for (const p of unlit) lightProp(state, ev, p, h.id);
      if (unlit.some((p) => p.color)) sayKey(state, ev, 'colorBack');
      checkBright(state, ev);
      return true;
    },
    // A color crystal: the lantern glows that color until the hero enters a room or retries it.
    tint(state, ev, h, a, info) {
      if (!info.color || h.status.tint === info.color) return false;
      h.status.tint = info.color;
      ev.push({ t: 'tint', uid: h.id, color: info.color, item: info.id });
      return true;
    },
    // The Snow Globe: every monster on or next to the square is frozen (it skips its next move and
    // can't blink or flutter off). Ice shows where a hidden monster stands, so it's spotted too.
    freeze(state, ev, h, a, info) {
      const m = a.at == null && a.target != null ? monsterBy(state, a.target) : null;
      const at = a.at || (m && m.at);
      if (!isSquare(at) || cheb(at, h.at) > info.range) return false;
      const area = around(at, info.radius);
      ev.push({ t: 'ability', uid: h.id, id: info.id, name: info.name || 'Snow Globe', at: [at[0], at[1]], area, item: info.id });
      const caught = state.monsters.filter((x) => gap(mcells(x), area) === 0);
      for (const x of caught) {
        spot(state, ev, x);
        x.status.frozen = true;
        ev.push({ t: 'status', uid: x.uid, status: 'frozen', on: true });
      }
      if (caught.length) sayKey(state, ev, 'frozen');
      return true;
    },
    // The Rainbow Cake: every hero who needs it heals a flat amount, anywhere in the room, and a
    // knocked-down hero gets up with it.
    feast(state, ev, h, a, info) {
      const needy = heroList(state).filter((o) => o.at && (o.down || o.hp < o.maxHp));
      if (!needy.length) return false;
      ev.push({ t: 'ability', uid: h.id, id: info.id, name: info.name || 'Rainbow Cake', at: h.at, area: needy.map((o) => o.at), item: info.id });
      const spec = info.heal || dice({ n: 0, d: 4, plus: 3 });
      const roll = spec.n ? rollDice(state, spec) : { rolls: [], total: spec.plus };
      for (const o of needy) healHero(state, ev, o, { rolls: roll.rolls, total: roll.total }, h.id);
      return true;
    },
    // The Phoenix Feather: one knocked-down hero, anywhere, stands up with full hearts.
    revive(state, ev, h, a, info) {
      const o = choose(heroList(state).filter((x) => x.down && x.at), targetOf(a));
      if (!o) return false;
      ev.push({ t: 'ability', uid: h.id, id: info.id, name: info.name || 'Phoenix Feather', at: o.at, area: [o.at], item: info.id });
      healHero(state, ev, o, { rolls: [], total: o.maxHp }, h.id);
      return true;
    },
  };

  // ---------- the monsters' turn ----------

  // Every monster acts, one at a time, then a new party turn starts. Sleepy and the Feather
  // Charm last for the party turn just ended; Shield Wall and Fireburst light last the round.
  function endPartyTurn(state) {
    if (state.status !== 'playing' || state.side !== 'party') return [];
    const ev = [];
    for (const h of heroList(state)) {
      for (const s of ['sleepy', 'feather', 'frozen']) {
        if (!h.status[s]) continue;
        delete h.status[s];
        ev.push({ t: 'status', uid: h.id, status: s, on: false });
      }
    }
    state.side = 'monsters';
    ev.push({ t: 'turn', side: 'monsters', round: state.round });
    for (const uid of state.monsters.map((m) => m.uid)) {
      const m = monsterBy(state, uid);
      if (!m || !standing(state).length) continue;
      if (isBoss(state, m)) bossTurn(state, ev, m);
      else monsterTurn(state, ev, m);
    }
    if (!standing(state).length) {
      state.status = 'partyDown';
      sayKey(state, ev, 'partyDown');
      ev.push({ t: 'partyDown' });
      return ev;
    }
    state.flares = [];
    for (const h of heroList(state)) {
      if (!h.status.shield) continue;
      delete h.status.shield;
      ev.push({ t: 'status', uid: h.id, status: 'shield', on: false });
    }
    state.round += 1;
    state.side = 'party';
    for (const h of heroList(state)) {
      h.moved = false;
      h.acted = false;
    }
    growHeal(state, ev); // green light heals before the new turn is announced
    ev.push({ t: 'turn', side: 'party', round: state.round });
    return ev;
  }

  // A normal monster: pick the closest hero, walk toward them by the shortest path, attack if
  // in range. Goblins snuff braziers, Gloomlings are shy of bright light, Slingers keep away.
  // Chapter 2: blue light chills, a frozen monster skips its move, a Vine Snapper pulls a hero in,
  // and Chillbats flutter off and Starwisps blink away after they attack.
  function monsterTurn(state, ev, m) {
    const s = monsterStat(state, m);
    const frozen = startTurn(state, ev, m, s);
    let mayAttack = true;
    if (trait(state, m, 'snuffer')) {
      const b = braziers(state).find((p) => p.lit && gap(mcells(m), [p.at]) <= 1);
      if (b) {
        b.lit = false;
        ev.push({ t: 'snuff', prop: b.uid, by: m.uid });
        sayKey(state, ev, 'snuff');
        mayAttack = false; // it puts the brazier out instead of attacking
      }
    }
    if (!frozen && trait(state, m, 'grabby')) grab(state, ev, m);
    const target = chooseTarget(state, m);
    if (target) {
      if (!frozen && !trait(state, m, 'rooted')) {
        const step = trait(state, m, 'keepAway') ? keepAwayStep(state, m, target, s)
          : approachStep(state, m, target, s, trait(state, m, 'shy'));
        if (step) walk(state, ev, m, step);
      }
      if (mayAttack && gap(mcells(m), [target.at]) <= s.range) {
        monsterStrike(state, ev, m, target);
        if (!frozen) afterAttack(state, ev, m, target);
      }
    }
    thaw(state, ev, m, frozen);
  }
  // `kind` tags a special flight ('hit-and-run'); an ordinary walk has none.
  function walk(state, ev, m, step, kind) {
    m.at = [step.at[0], step.at[1]];
    const e = { t: 'move', uid: m.uid, path: step.path };
    if (kind) e.kind = kind;
    ev.push(e);
  }
  // The closest standing hero by walking distance (props are in the way, other units aren't,
  // so a hero behind a friend still counts as close). Ties go to the fewest hearts, then party order.
  function chooseTarget(state, m) {
    const heroes = standing(state);
    if (!heroes.length) return null;
    const occ = occupancy(state);
    const terrain = (at) => inside(at[0], at[1]) && !occ.prop[keyOf(at[0], at[1])];
    const walking = (m.size || 1) === 1 && !trait(state, m, 'flying') ? distanceField([m.at], terrain) : null;
    const far = (h) => {
      const d = walking ? walking[keyOf(h.at[0], h.at[1])] : Infinity;
      return d === Infinity ? 100 + gap(mcells(m), [h.at]) : d;
    };
    const ranked = heroes.map((h, i) => ({ h, i, d: far(h) }))
      .sort((x, y) => x.d - y.d || x.h.hp - y.h.hp || x.i - y.i);
    return shieldRedirect(state, ranked[0].h);
  }
  // Shield Wall: a monster going after a hero beside the shielding Knight must attack her instead.
  function shieldRedirect(state, h) {
    const knight = standing(state).find((o) => o.status.shield && o !== h && cheb(o.at, h.at) <= 1);
    return knight || h;
  }
  // Squares from which the target is in range and where this monster could stand.
  function attackSquares(size, stand, target, range) {
    const goals = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (reach([c, r], size, target.at) <= range && stand([c, r])) goals.push([c, r]);
      }
    }
    return goals;
  }
  // Walk toward the nearest square that has the target in range, by the shortest path.
  // A shy monster first of all prefers to end its move outside bright light.
  function approachStep(state, m, target, s, shy) {
    const size = m.size || 1;
    const occ = occupancy(state);
    const pass = fits(occ, m.uid, size, trait(state, m, 'flying'));
    const stand = fits(occ, m.uid, size, false);
    const nodes = bfs(m.at, s.move, pass);
    const dist = distanceField(attackSquares(size, stand, target, s.range), pass);
    const map = shy ? lightMap(state) : null;
    let best = null;
    for (const [k, node] of nodes) {
      if (!stand(node.at)) continue;
      const cells = cellsOf(node.at, size);
      const score = [
        shy && brightOn(map, cells) ? 1 : 0,
        dist[k] === Infinity ? 1000 + reach(node.at, size, target.at) : dist[k],
        node.steps,
      ];
      if (!best || lexLess(score, best.score)) best = { k, node, score };
    }
    if (!best || best.node.steps === 0) return null;
    return { at: best.node.at, path: pathTo(nodes, best.k) };
  }
  // A slinger with a hero next to it steps back first; otherwise it only walks to get in range,
  // preferring squares where no hero is next to it.
  function keepAwayStep(state, m, target, s) {
    const heroes = standing(state);
    const nearest = (cells) => Math.min.apply(null, heroes.map((h) => gap(cells, [h.at])));
    const crowded = nearest(mcells(m)) <= 1;
    if (!crowded && gap(mcells(m), [target.at]) <= s.range) return null;
    const occ = occupancy(state);
    const pass = fits(occ, m.uid, 1, false);
    const nodes = bfs(m.at, s.move, pass);
    const dist = distanceField(attackSquares(1, pass, target, s.range), pass);
    let best = null;
    for (const [k, node] of nodes) {
      const cells = [node.at];
      const d = dist[k] === Infinity ? 1000 + gap(cells, [target.at]) : dist[k];
      const adjacent = nearest(cells) <= 1 ? 1 : 0;
      const score = crowded ? [adjacent, d, node.steps, -nearest(cells)] : [d, adjacent, node.steps];
      if (!best || lexLess(score, best.score)) best = { k, node, score };
    }
    if (!best || best.node.steps === 0) return null;
    return { at: best.node.at, path: pathTo(nodes, best.k) };
  }

  // Gloamwing does one thing a turn: Wing Gust when two or more heroes crowd it, Eat the Light
  // when the chamber gets bright (never twice in a row), and otherwise Swoop. If no hero has a
  // square it could land beside (a hero tucked in a corner behind a brazier), it gusts whoever
  // is close instead of swooping at nothing.
  function bossTurn(state, ev, m) {
    if (isDragon(state, m)) return dragonTurn(state, ev, m);
    const b = bossOf(state, m);
    const s = monsterStat(state, m);
    const frozen = startTurn(state, ev, m, s);
    const near = standing(state).filter((h) => gap(mcells(m), [h.at]) <= b.gustRadius);
    const all = braziers(state);
    const lit = all.filter((p) => p.lit);
    const prey = standing(state).filter((h) => huntable(state, m, h, s));
    let choice = 'swoop';
    if (near.length >= 2 || (near.length && !prey.length)) choice = 'gust';
    else if (lit.length && lit.length >= Math.min(b.eatAt, all.length) && m.last !== 'eat') choice = 'eat';
    m.last = choice;
    const name = mdata(state, m).name || 'Gloamwing';
    ev.push({ t: 'say', text: name + ' uses ' + b.name[choice] + '!', uid: m.uid, move: b.id[choice] });
    if (choice === 'gust') wingGust(state, ev, m, b, near);
    else if (choice === 'eat') eatLight(state, ev, m, b, lit);
    else swoop(state, ev, m, s, prey, frozen);
    thaw(state, ev, m, frozen);
  }
  // Could this monster ever get a square from which it reaches hero h, by any path?
  function huntable(state, m, h, s) {
    const size = m.size || 1;
    const occ = occupancy(state);
    const pass = fits(occ, m.uid, size, trait(state, m, 'flying'));
    const goals = attackSquares(size, fits(occ, m.uid, size, false), h, s.range);
    return goals.length > 0 && distanceField(goals, pass)[keyOf(m.at[0], m.at[1])] !== Infinity;
  }
  // Every hero within 2 is blown 2 squares away and takes d4. No roll: wind always hits.
  function wingGust(state, ev, m, b, near) {
    const from = centerOf(mcells(m));
    const order = near.slice().sort((x, y) => dist2(y.at, from) - dist2(x.at, from)); // farthest first
    for (const h of order) {
      ev.push({ t: 'attack', uid: m.uid, target: h.id, kind: 'gust' });
      pushUnit(state, ev, h, from, b.gustPush);
      const dmg = rollDice(state, b.gust);
      hurt(state, ev, h.id, dmg.total, dmg.rolls, false, m.uid);
    }
  }
  function eatLight(state, ev, m, b, lit) {
    const cells = mcells(m);
    const p = lit.slice().sort((x, y) => gap(cells, [x.at]) - gap(cells, [y.at]))[0];
    p.lit = false;
    ev.push({ t: 'snuff', prop: p.uid, by: m.uid });
    const amount = Math.min(b.eatHeal, m.maxHp - m.hp);
    m.hp += amount;
    ev.push({ t: 'heal', target: m.uid, amount, rolls: [], hp: m.hp, by: m.uid });
  }
  // Fly toward the hero with the fewest hearts (of those it can reach), then attack the weakest
  // hero in reach.
  function swoop(state, ev, m, s, prey, frozen) {
    const rank = (list) => list.map((h, i) => ({ h, i }))
      .sort((x, y) => x.h.hp - y.h.hp || gap(mcells(m), [x.h.at]) - gap(mcells(m), [y.h.at]) || x.i - y.i)
      .map((x) => x.h);
    const step = frozen ? null : approachStep(state, m, rank(prey && prey.length ? prey : standing(state))[0], s, false);
    if (step) walk(state, ev, m, step);
    const reach = standing(state).filter((h) => gap(mcells(m), [h.at]) <= s.range);
    for (const h of rank(reach)) {
      const t = shieldRedirect(state, h);
      if (reach.indexOf(t) >= 0) {
        monsterStrike(state, ev, m, t);
        return;
      }
    }
  }
  // Slide a unit up to `steps` squares straight away from point `from`, sliding around a
  // corner when it can and stopping at anything in the way. `kind` ('knockback') tags the event;
  // a plain push carries none. A rooted monster never budges. Returns how far the unit went.
  function pushUnit(state, ev, unit, from, steps, kind, by) {
    const hero = state.heroes[unit.id] === unit;
    if (!hero && trait(state, unit, 'rooted')) return 0;
    const uid = hero ? unit.id : unit.uid;
    const size = hero ? 1 : unit.size || 1;
    const path = [];
    for (let i = 0; i < steps; i++) {
      const stand = fits(occupancy(state), uid, size, false);
      const c = centerOf(cellsOf(unit.at, size));
      const ring = RING.findIndex(([x, y]) => x === Math.sign(c[0] - from[0]) && y === Math.sign(c[1] - from[1]));
      const tries = ring < 0 ? [[0, 1]] : [RING[ring], RING[(ring + 1) % 8], RING[(ring + 7) % 8]];
      const d0 = dist2(c, from);
      const next = tries.map(([x, y]) => [unit.at[0] + x, unit.at[1] + y])
        .find((at) => stand(at) && dist2(centerOf(cellsOf(at, size)), from) > d0);
      if (!next) break;
      unit.at = next;
      path.push(next);
    }
    if (path.length) {
      const e = { t: 'push', uid, path };
      if (kind) e.kind = kind;
      if (by) e.by = by;
      ev.push(e);
    }
    return path.length;
  }

  // ---------- Chapter 2 habits, in the monsters' turn ----------

  // The start of a monster's turn: blue light chills it (fewer squares to move this turn), and a
  // frozen monster is about to skip its move. Returns whether it is frozen.
  function startTurn(state, ev, m, s) {
    const chilled = s.move > 0 && colorSources(state).length > 0 && inColor(state, mcells(m), 'blue');
    if (chilled) {
      s.move = Math.max(1, s.move - Math.abs(flameOf(state, 'blue').move || 0));
      if (!m.status.chilled) {
        m.status.chilled = true;
        ev.push({ t: 'status', uid: m.uid, status: 'chilled', on: true });
        sayKey(state, ev, 'chilled');
      }
    } else if (m.status.chilled) {
      delete m.status.chilled;
      ev.push({ t: 'status', uid: m.uid, status: 'chilled', on: false });
    }
    return !!m.status.frozen;
  }
  // A frozen monster's turn is over: the ice melts.
  function thaw(state, ev, m, frozen) {
    if (!frozen || !m.status.frozen || state.monsters.indexOf(m) < 0) return;
    delete m.status.frozen;
    ev.push({ t: 'status', uid: m.uid, status: 'frozen', on: false });
  }
  // Green light: just before each new party turn, every standing hero in it heals a little.
  function growHeal(state, ev) {
    if (!colorSources(state).length) return;
    const amount = flameOf(state, 'green').heal || 0;
    if (!amount) return;
    for (const h of standing(state)) {
      if (h.hp < h.maxHp && inColor(state, [h.at], 'green')) healHero(state, ev, h, { rolls: [], total: amount }, null, 'green');
    }
  }
  // After a Chillbat or Starwisp attacks: the flutter away, or the blink.
  function afterAttack(state, ev, m, h) {
    if (trait(state, m, 'hitAndRun')) flee(state, ev, m, h, habit(state, m, 'hitAndRun'));
    else if (trait(state, m, 'blink')) blinkAway(state, ev, m, h, Object.assign({}, HABIT.blink, mdata(state, m).blink || {}));
  }
  // Hit-and-run: fly up to `steps` squares to the square farthest from every hero, darker when
  // tied, over props (it flies) but never onto one.
  function flee(state, ev, m, h, steps) {
    const size = m.size || 1;
    const occ = occupancy(state);
    const nodes = bfs(m.at, steps, fits(occ, m.uid, size, true));
    const stand = fits(occ, m.uid, size, false);
    const map = lightMap(state);
    const heroes = standing(state).length ? standing(state) : [h];
    let best = null;
    for (const [k, node] of nodes) {
      if (!stand(node.at)) continue;
      const cells = cellsOf(node.at, size);
      const nearest = Math.min.apply(null, heroes.map((o) => gap(cells, [o.at])));
      const light = Math.max.apply(null, cells.map(([c, r]) => map[c][r]));
      const score = [-nearest, light, node.steps];
      if (!best || lexLess(score, best.score)) best = { k, node, score };
    }
    if (!best || best.node.steps === 0) return;
    walk(state, ev, m, { at: best.node.at, path: pathTo(nodes, best.k) }, 'hit-and-run');
  }
  // Blink: to a free square `min` to `max` squares from the hero it attacked, the darkest squares
  // first, picked with the seeded dice among equals. It stays spotted.
  function blinkAway(state, ev, m, h, spec) {
    const size = m.size || 1;
    const stand = fits(occupancy(state), m.uid, size, false);
    const map = lightMap(state);
    const cands = [];
    for (let r = 0; r <= ROWS - size; r++) {
      for (let c = 0; c <= COLS - size; c++) {
        const at = [c, r];
        const d = reach(at, size, h.at);
        if (d < spec.min || d > spec.max || (c === m.at[0] && r === m.at[1]) || !stand(at)) continue;
        cands.push({ at, light: Math.max.apply(null, cellsOf(at, size).map(([x, y]) => map[x][y])) });
      }
    }
    if (!cands.length) return;
    const darkest = Math.min.apply(null, cands.map((x) => x.light));
    const pool = cands.filter((x) => x.light === darkest);
    const to = pool[Math.floor(rand(state) * pool.length)].at;
    const from = m.at;
    m.at = to;
    ev.push({ t: 'blink', uid: m.uid, from, to });
    sayKey(state, ev, 'blink');
  }
  // Vine Snapper: with nobody beside it, it pulls the nearest standing hero within reach straight
  // to a square next to it (a blocked pull stops early), then says so.
  function grab(state, ev, m) {
    const cells = mcells(m);
    const heroes = standing(state);
    if (heroes.some((h) => gap(cells, [h.at]) <= 1)) return;
    const range = (habit(state, m, 'grab') || HABIT.grab).range || HABIT.grab.range;
    const near = heroes.map((h, i) => ({ h, i, d: gap(cells, [h.at]) })).filter((x) => x.d <= range)
      .sort((x, y) => x.d - y.d || x.h.hp - y.h.hp || x.i - y.i);
    if (near.length && pullUnit(state, ev, m, near[0].h, range)) sayKey(state, ev, 'grab');
  }
  // Drag a hero toward a monster one square at a time, straight at it, until they're next to it
  // or something is in the way. One 'push' event with kind: 'pull' and `by`. Returns how far they came.
  function pullUnit(state, ev, m, h, maxSteps) {
    if (!h || h.down || !h.at) return 0;
    const size = m.size || 1;
    const path = [];
    for (let i = 0; i < maxSteps && reach(m.at, size, h.at) > 1; i++) {
      const dx = h.at[0] < m.at[0] ? 1 : h.at[0] > m.at[0] + size - 1 ? -1 : 0;
      const dy = h.at[1] < m.at[1] ? 1 : h.at[1] > m.at[1] + size - 1 ? -1 : 0;
      const next = [h.at[0] + dx, h.at[1] + dy];
      if (!fits(occupancy(state), h.id, 1, false)(next)) break;
      h.at = next;
      path.push(next);
    }
    if (path.length) ev.push({ t: 'push', uid: h.id, path, kind: 'pull', by: m.uid });
    return path.length;
  }

  // ---------- the Color Dragon ----------

  // The dragon's numbers: DRAGON's defaults under data.monsters['color-dragon'] (moves matched by
  // color or id, the glow cycle, eatAt for the gobble).
  function dragonOf(state, m) {
    const d = mdata(state, m);
    const list = d.moves || [];
    const g = d.glow;
    const cycle = g && typeof g === 'object' && Array.isArray(g.cycle) && g.cycle.length ? g.cycle : DRAGON.cycle;
    const moves = {};
    for (const color of cycle) {
      const base = DRAGON.moves[color] || {};
      const own = list.find((x) => x.color === color) || list.find((x) => base.id && x.id === base.id) || {};
      const mv = Object.assign({}, base, own);
      mv.id = own.id || base.id || color;
      mv.name = own.name || base.name || mv.id;
      mv.kind = moveKind(base, own);
      mv.freeze = own.status != null ? own.status === 'frozen' : !!base.freeze;
      if (mv.damage) mv.damage = dice(mv.damage);
      moves[color] = mv;
    }
    const own = list.find((x) => x.id === DRAGON.gobble.id) || list.find((x) => !x.color && x.heal != null) || {};
    const gobble = Object.assign({}, DRAGON.gobble, own);
    gobble.at = d.eatAt != null ? d.eatAt : own.at != null ? own.at : DRAGON.gobble.at;
    return { cycle, moves, gobble };
  }
  // How a color move works, from the data's hints or the default for that color.
  function moveKind(base, own) {
    if (own.kind && DRAGON_MOVES[own.kind]) return own.kind;
    if (own.pull) return 'yank';
    if (own.blink) return 'hop';
    if (own.radius != null || own.damage) return 'breath';
    return base.kind || 'breath';
  }
  // The Color Dragon does one thing a turn: Gobble Color when the room is bright enough (never
  // twice in a row; the glow stays put), otherwise its glow color's move, flying toward its target
  // first when it needs to. Then the glow moves on and it telegraphs what comes next.
  function dragonTurn(state, ev, m) {
    const b = dragonOf(state, m);
    const s = monsterStat(state, m);
    const frozen = startTurn(state, ev, m, s);
    const name = mdata(state, m).name || 'The Color Dragon';
    const all = braziers(state);
    const lit = all.filter((p) => p.lit);
    if (!m.glow) m.glow = b.cycle[0];
    if (lit.length && lit.length >= Math.min(b.gobble.at, all.length) && m.last !== 'gobble') {
      m.last = 'gobble';
      ev.push({ t: 'say', text: name + ' uses ' + b.gobble.name + '!', uid: m.uid, move: b.gobble.id });
      eatLight(state, ev, m, { eatHeal: b.gobble.heal }, lit);
    } else {
      const color = m.glow;
      const mv = b.moves[color] || b.moves[b.cycle[0]];
      m.last = mv.id;
      ev.push({ t: 'say', text: name + ' uses ' + mv.name + '!', uid: m.uid, move: mv.id, color });
      DRAGON_MOVES[mv.kind](state, ev, m, s, mv, color, frozen);
      const next = b.cycle[(b.cycle.indexOf(color) + 1) % b.cycle.length];
      m.glow = next;
      ev.push({ t: 'glow', uid: m.uid, color: next });
      const tele = textOf(state).telegraph;
      const line = tele && typeof tele === 'object' ? tele[next] : null;
      if (line) ev.push({ t: 'say', text: line, key: 'telegraph', color: next, uid: m.uid });
    }
    thaw(state, ev, m, frozen);
  }
  // The squares within `radius` of a monster's footprint, not counting its own.
  function aura(m, radius) {
    const size = m.size || 1;
    const out = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const d = reach(m.at, size, [c, r]);
        if (d >= 1 && d <= radius) out.push([c, r]);
      }
    }
    return out;
  }
  // Standing heroes by distance from the dragon (ties: fewest hearts, then party order).
  function byNearness(state, m) {
    return standing(state).map((h, i) => ({ h, i, d: gap(mcells(m), [h.at]) }))
      .sort((x, y) => x.d - y.d || x.h.hp - y.h.hp || x.i - y.i).map((x) => x.h);
  }
  // A bite at `want` if it's in reach (the Knight's Shield Wall can take it instead), else at the
  // weakest hero in reach. Returns whether anyone was bitten.
  function bite(state, ev, m, s, want) {
    const reachable = standing(state).filter((h) => gap(mcells(m), [h.at]) <= s.range);
    const order = [want].concat(reachable.filter((h) => h !== want).sort((x, y) => x.hp - y.hp));
    for (const h of order) {
      if (!h || reachable.indexOf(h) < 0) continue;
      const t = shieldRedirect(state, h);
      if (reachable.indexOf(t) >= 0) {
        monsterStrike(state, ev, m, t, 'bite');
        return true;
      }
    }
    return false;
  }
  // The free 2x2 spot beside hero h that's closest to where the dragon is now, or null.
  function hopSquare(state, m, h) {
    const size = m.size || 1;
    const stand = fits(occupancy(state), m.uid, size, false);
    let best = null;
    for (let r = 0; r <= ROWS - size; r++) {
      for (let c = 0; c <= COLS - size; c++) {
        const at = [c, r];
        if (reach(at, size, h.at) !== 1 || !stand(at)) continue;
        const score = [cheb(at, m.at), c, r];
        if (!best || lexLess(score, best.score)) best = { at, score };
      }
    }
    return best && best.at;
  }
  const DRAGON_MOVES = {
    // Breath: fly toward the nearest hero when nobody is within the radius, then every standing
    // hero within it takes the damage (no roll); frost also freezes their feet.
    breath(state, ev, m, s, mv, color, frozen) {
      const radius = mv.radius != null ? mv.radius : 2;
      const inReach = () => standing(state).filter((h) => reach(m.at, m.size || 1, h.at) <= radius);
      if (!frozen && !inReach().length) {
        const target = byNearness(state, m)[0];
        const step = target && approachStep(state, m, target, Object.assign({}, s, { range: radius }), false);
        if (step) walk(state, ev, m, step);
      }
      ev.push({ t: 'breath', uid: m.uid, color, cells: aura(m, radius) });
      const spec = mv.damage || dice({ n: 1, d: 4 });
      let froze = false;
      for (const h of inReach()) {
        const dmg = rollDice(state, spec, false);
        hurt(state, ev, h.id, dmg.total, dmg.rolls, false, m.uid, spec);
        if (mv.freeze && !h.down && !h.status.frozen) {
          h.status.frozen = true;
          ev.push({ t: 'status', uid: h.id, status: 'frozen', on: true });
          froze = true;
        }
      }
      if (froze) sayKey(state, ev, 'frozen');
    },
    // Vine Yank: the farthest standing hero is dragged to a square beside it, then bitten.
    yank(state, ev, m, s, mv, color, frozen) {
      const h = standing(state).map((x, i) => ({ x, i, d: gap(mcells(m), [x.at]) }))
        .sort((a, b) => b.d - a.d || a.x.hp - b.x.hp || a.i - b.i).map((a) => a.x)[0];
      if (!h) return;
      if (!frozen) pullUnit(state, ev, m, h, COLS + ROWS);
      bite(state, ev, m, s, h);
    },
    // Star Hop: blink to a free square beside the standing hero with the fewest hearts, then bite.
    // Boxed in with nowhere to land beside them, it flies closer instead.
    hop(state, ev, m, s, mv, color, frozen) {
      const h = standing(state).map((x, i) => ({ x, i })).sort((a, b) => a.x.hp - b.x.hp || a.i - b.i).map((a) => a.x)[0];
      if (!h) return;
      if (!frozen && reach(m.at, m.size || 1, h.at) > 1) {
        const to = hopSquare(state, m, h);
        if (to) {
          const from = m.at;
          m.at = to;
          ev.push({ t: 'blink', uid: m.uid, from, to });
        } else {
          const step = approachStep(state, m, h, s, false);
          if (step) walk(state, ev, m, step);
        }
      }
      bite(state, ev, m, s, h);
    },
  };
  // For the HUD: which move the Color Dragon's glow telegraphs, or null when no such boss is here.
  function bossNext(state) {
    const m = (state.monsters || []).find((x) => isDragon(state, x));
    if (!m) return null;
    const b = dragonOf(state, m);
    const color = m.glow || b.cycle[0];
    const mv = b.moves[color] || b.moves[b.cycle[0]];
    return { uid: m.uid, color, move: { id: mv.id, name: mv.name, text: mv.text || '' } };
  }

  // ---------- reading the board ----------

  function light(state) {
    return lightMap(state);
  }
  function visible(state, uid) {
    if (state.heroes[uid]) return true;
    const m = monsterBy(state, uid);
    return !!m && seen(state, m);
  }
  // Has this hero finished for the turn (moved and acted, or knocked down)?
  function done(state, heroId) {
    const h = state.heroes[heroId];
    return !h || h.down || (h.moved && h.acted);
  }

  return {
    newGame, enterRoom, options, move, act, endPartyTurn, leave, retry, buy, light, visible, serialize, deserialize,
    // Helpers for the board, the UI and the tools.
    exits, done, heroIds,
    // Phase 2: the chapter being played, its first room, the colors on each square, and the HUD's
    // "Next: <move>" for the Color Dragon.
    chapterOf, startRoom, colors: colorMap, bossNext,
    blast: (at, radius) => around(at, radius == null ? 1 : radius), // e.g. the Fireburst 3x3 preview
    cells: (m) => mcells(m),
    distance: cheb,
    COLS, ROWS, HERO_ORDER, RULE,
  };
});
