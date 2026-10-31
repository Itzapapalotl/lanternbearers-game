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
//   animation easier. Status names: 'sleepy', 'shield', 'feather', 'bright-oil'.
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
  };
  const BOSS = {
    gustRadius: 2, gustPush: 2, gust: { n: 1, d: 4, plus: 0 }, eatHeal: 4,
    eatAt: 3, // Eat the Light once this many braziers are lit (or all of them, in a smaller room)
    summonType: 'gloomling', summonCount: 2, summonBelow: 0.5,
  };
  // Monster habits: a trait name in data.js, or the monster type that has it in DESIGN.md.
  const TRAITS = {
    shy: { names: ['shy'], types: ['gloomling'] },
    snuffer: { names: ['snuffer'], types: ['goblin'] },
    keepAway: { names: ['keeps-away', 'keep-away', 'keepaway'], types: ['slinger'] },
    sleepy: { names: ['sleepy-spores', 'sleepy', 'spores'], types: ['sporecap'] },
    flying: { names: ['flying'], types: ['gloamwing'] },
    boss: { names: ['boss'], types: ['gloamwing'] },
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
  const textOf = (state) => dataOf(state).text || {};
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
  function seen(state, m, map) {
    return !!m.spotted || litOn(map || lightMap(state), mcells(m));
  }

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
    return {
      attack: d.attack || 0,
      damage: dice(d.damage, { n: 1, d: 6, plus: 0 }),
      dmgBonus: g.damage || 0,
      range,
      kind: d.attackKind || (range > 1 ? 'arrow' : 'melee'),
      defense: (d.defense || 10) + (g.defense || 0) + (s.shield || 0),
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
  function newGame(opts) {
    const o = opts || {};
    const data = o.data || globalData();
    if (!data) throw new Error('LB_RULES.newGame needs { data }.');
    const seed = o.seed == null ? Date.now() % 2147483647 : o.seed;
    const names = o.names || {};
    const state = {
      v: 1, seed, rng: hashSeed(seed), roomId: null, visited: [], round: 0, side: 'party', status: 'playing',
      heroes: {}, monsters: [], props: [], flares: [], bag: [], gold: 0,
      stats: { defeated: 0, crits: 0, helps: 0, rooms: 0, helped: [], heroes: {} },
      found: { items: [], gold: 0 }, bossRoom: false, uidSeq: 0, lines: {}, roomStart: null,
    };
    attach(state, data);
    const ids = HERO_ORDER.filter((id) => data.heroes[id])
      .concat(Object.keys(data.heroes).filter((id) => HERO_ORDER.indexOf(id) < 0));
    for (const id of ids) {
      const d = data.heroes[id];
      state.heroes[id] = {
        id, name: d.name || id, player: names[id] ? String(names[id]) : '', hp: d.hearts, maxHp: d.hearts, at: null,
        moved: false, acted: false, abilityUsed: false, down: false, status: {},
        gear: { defense: 0, damage: 0, move: 0 }, light: d.light == null ? 2 : d.light,
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
    state.flares = [];
    state.found = { items: [], gold: 0 };
    state.uidSeq = 0;
    state.props = (room.props || []).map((p, i) => ({
      uid: 'p' + (i + 1), type: p.type, at: [p.at[0], p.at[1]], lit: !!p.lit, opened: false,
      mimic: !!p.mimic, loot: p.loot || null,
    }));
    state.monsters = [];
    for (const s of room.monsters || []) addMonster(state, s.type, s.at);
    placeHeroes(state, room.start || []);
    state.roomStart = snapshot(state);
    ev.push({ t: 'room', roomId });
    ev.push({ t: 'turn', side: 'party', round: 1 });
    return ev;
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
      h.light = baseLight(state, h);
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
      h.light = baseLight(state, h);
    }
    state.flares = [];
    state.round = 1;
    state.side = 'party';
    state.status = 'playing';
    return [{ t: 'room', roomId: state.roomId, retry: true }, { t: 'turn', side: 'party', round: 1 }];
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
  function deserialize(text, data) {
    const state = typeof text === 'string' ? JSON.parse(text) : clone(text);
    return attach(state, data || globalData());
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
  // Sporecaps' spores make a hero they hit Sleepy: no moving on their next turn.
  function monsterStrike(state, ev, m, h, kind) {
    const s = monsterStat(state, m);
    const hit = strike(state, ev, { uid: m.uid, monster: m, attack: s.attack, damage: s.damage, dmgBonus: 0, kind: kind || s.kind },
      { uid: h.id, hero: h, defense: heroStat(state, h).defense, cells: [h.at] });
    if (hit && !h.down && trait(state, m, 'sleepy') && !h.status.sleepy) {
      h.status.sleepy = true;
      ev.push({ t: 'status', uid: h.id, status: 'sleepy', on: true });
      sayKey(state, ev, 'sleepy');
    }
    return hit;
  }

  // Takes hearts away, then whatever follows: knocked down, defeated, the boss's call.
  function hurt(state, ev, uid, amount, rolls, crit, by) {
    const h = state.heroes[uid];
    if (h) {
      if (h.down) return;
      h.hp = Math.max(0, h.hp - amount);
      ev.push({ t: 'damage', target: uid, amount, rolls, crit: !!crit, hp: h.hp, by });
      if (h.hp === 0) knockDown(state, ev, h);
      return;
    }
    const m = monsterBy(state, uid);
    if (!m) return;
    const before = m.hp;
    m.hp = Math.max(0, m.hp - amount);
    ev.push({ t: 'damage', target: uid, amount, rolls, crit: !!crit, hp: m.hp, by });
    credit(state, by, 'damage', before - m.hp);
    if (m.hp === 0) defeat(state, ev, m, by);
    else if (isBoss(state, m)) maybeSummon(state, ev, m);
  }
  function knockDown(state, ev, h) {
    h.down = true;
    ev.push({ t: 'down', uid: h.id, line: lineFrom(state, 'down', textOf(state).down, null) });
    for (const s of ['sleepy', 'shield', 'feather']) {
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
      const h = state.heroes[by] || state.heroes[nearestHero(state, at)];
      const g = info.gear || {};
      for (const k of ['defense', 'damage', 'move']) h.gear[k] += g[k] || 0;
      ev.push({ t: 'loot', item, by: h.id, from, at, keeps: true });
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
  function healHero(state, ev, h, roll, by) {
    if (h.down) {
      h.down = false;
      h.hp = Math.min(h.maxHp, Math.max(1, roll.total));
      ev.push({ t: 'heal', target: h.id, amount: h.hp, rolls: roll.rolls, hp: h.hp, by });
      ev.push({ t: 'up', uid: h.id, by, hp: h.hp, line: helpLine(state) });
      credit(state, by, 'healing', h.hp);
      countHelp(state, by, h.id);
      return;
    }
    const amount = Math.min(roll.total, h.maxHp - h.hp);
    h.hp += amount;
    ev.push({ t: 'heal', target: h.id, amount, rolls: roll.rolls, hp: h.hp, by });
    credit(state, by, 'healing', amount);
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
    state.monsters.push(m);
    return m;
  }
  // `count` free squares around a footprint, nearest first.
  function freeNear(state, cells, count) {
    const free = fits(occupancy(state), null, 1, false);
    const out = [];
    const looked = new Set(cells.map(([c, r]) => keyOf(c, r)));
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
      summonType: s.type || BOSS.summonType,
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
    for (const p of state.props) if (!isBrazier(p) && /lantern/.test(p.type) && !p.lit) lightProp(state, ev, p, null);
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
    if (!h.moved && !h.status.sleepy) {
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
        return h.moved || h.status.sleepy || h.status.feather ? null : { kind: 'item', item };
      case 'sunbeam':
        return braziers(state).some((p) => !p.lit) ? { kind: 'item', item } : null;
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
    if (!canPlay(state, h) || h.moved || h.status.sleepy || !isSquare(at)) return [];
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
      blast(state, ev, h.id, area, ab.damage);
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
  function blast(state, ev, by, area, spec) {
    for (const m of state.monsters.filter((x) => gap(mcells(x), area) === 0)) {
      if (state.monsters.indexOf(m) < 0) continue;
      spot(state, ev, m);
      const dmg = rollDice(state, spec, false);
      hurt(state, ev, m.uid, dmg.total, dmg.rolls, false, by);
    }
  }

  // Using an item takes the user's action. Firebombs hurt monsters only, like Fireburst.
  const ITEM_FNS = {
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
      if (h.moved || h.status.sleepy || h.status.feather) return false;
      h.status.feather = info.move || 2;
      ev.push({ t: 'status', uid: h.id, status: 'feather', on: true, item: info.id });
      return true;
    },
    sunbeam(state, ev, h, a, info) {
      const unlit = braziers(state).filter((p) => !p.lit);
      if (!unlit.length) return false;
      ev.push({ t: 'ability', uid: h.id, id: info.id, name: info.name || info.id, at: h.at, area: [], item: info.id });
      for (const p of unlit) lightProp(state, ev, p, h.id);
      checkBright(state, ev);
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
      for (const s of ['sleepy', 'feather']) {
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
    ev.push({ t: 'turn', side: 'party', round: state.round });
    return ev;
  }

  // A normal monster: pick the closest hero, walk toward them by the shortest path, attack if
  // in range. Goblins snuff braziers, Gloomlings are shy of bright light, Slingers keep away.
  function monsterTurn(state, ev, m) {
    const s = monsterStat(state, m);
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
    const target = chooseTarget(state, m);
    if (!target) return;
    const step = trait(state, m, 'keepAway') ? keepAwayStep(state, m, target, s)
      : approachStep(state, m, target, s, trait(state, m, 'shy'));
    if (step) walk(state, ev, m, step);
    if (mayAttack && gap(mcells(m), [target.at]) <= s.range) monsterStrike(state, ev, m, target);
  }
  function walk(state, ev, m, step) {
    m.at = [step.at[0], step.at[1]];
    ev.push({ t: 'move', uid: m.uid, path: step.path });
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
    const b = bossOf(state, m);
    const s = monsterStat(state, m);
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
    else swoop(state, ev, m, s, prey);
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
  function swoop(state, ev, m, s, prey) {
    const rank = (list) => list.map((h, i) => ({ h, i }))
      .sort((x, y) => x.h.hp - y.h.hp || gap(mcells(m), [x.h.at]) - gap(mcells(m), [y.h.at]) || x.i - y.i)
      .map((x) => x.h);
    const step = approachStep(state, m, rank(prey && prey.length ? prey : standing(state))[0], s, false);
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
  // corner when it can and stopping at anything in the way.
  function pushUnit(state, ev, unit, from, steps) {
    const hero = state.heroes[unit.id] === unit;
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
    if (path.length) ev.push({ t: 'push', uid, path });
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
    newGame, enterRoom, options, move, act, endPartyTurn, leave, retry, light, visible, serialize, deserialize,
    // Helpers for the board, the UI and the tools.
    exits, done, heroIds,
    blast: (at, radius) => around(at, radius == null ? 1 : radius), // e.g. the Fireburst 3x3 preview
    cells: (m) => mcells(m),
    distance: cheb,
    COLS, ROWS, HERO_ORDER, RULE,
  };
});
