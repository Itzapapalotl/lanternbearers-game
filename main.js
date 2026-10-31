// Lanternbearers glue (main.js): the state machine that wires the rules, the board and the screens
// together. Title -> party -> story -> rooms (play, cleared, camp) -> boss reveal -> boss -> victory.
//
// Every rules call returns events. main.js adds dice-tray moments, HUD checkpoints and ribbon words
// to that list (as extra 'say' events, which the board hands straight to hooks.say), then the board
// plays it. That keeps the canvas, the dice tray and the hero bar telling the same story at the
// same moment: hearts drop in the hero bar when the number pops on the board, not before.
//
// URL options: ?test=1 exposes window.LB_TEST for automated playtests, ?room=<id> jumps straight
// into a room, ?fast=1 speeds up animations (?fast=2: fastest, no dice tray), ?seed=<n> fixes the
// dice, ?intro=0 skips the room intro banners and the boss reveal, ?reset=1 forgets the saved game.
(function (root) {
  'use strict';

  const SAVE_KEY = 'lanternbearers:v1:save';
  const DATA = root.LB_DATA;
  const R = root.LB_RULES;
  const params = new URLSearchParams((root.location && root.location.search) || '');
  const TEST = params.get('test') === '1';
  const START_ROOM = params.get('room');
  const SEED = params.get('seed');
  let skipIntro = params.get('intro') === '0';

  // The board names its sounds after what happens; audio.js has a smaller, softer palette.
  const SOUND = {
    swing: 'miss', arrow: 'miss', sunbolt: 'miss', throw: 'miss', gust: 'miss', swoop: 'miss', poof: 'miss', spark: 'miss', snuff: 'miss',
    chomp: 'hit', boom: 'hit', push: 'hit', bones: 'dice',
    up: 'heal', sparkle: 'heal', sunburst: 'heal', shield: 'heal', bright: 'heal', sunbeam: 'heal',
    zap: 'crit', cleared: 'crit', fire: 'brazier', charge: 'brazier',
    chest: 'coin', loot: 'coin', spot: 'click', yawn: 'click', summon: 'boss', eat: 'boss', partyDown: 'down',
  };

  // Everything the glue knows. phase says what the game is waiting for:
  // boot | title | party | story | boss | intro | play | anim | monsters | cleared | camp | victory
  const app = {
    state: null,
    phase: 'boot',
    selected: null,
    pending: null, // the action being aimed: { action, kind, item, area, aimAt }
    busy: 0,
    fast: false,
    turbo: false, // ?fast=2: the quickest board and no dice tray, for whole-game playtests
    view: null, // the state the hero bar shows while events animate
    waiting: null, // which screen waits for a tap: title, party, story, boss, intro, cleared, camp, victory
    cheering: false, // the big "Room cleared!" is up, so the ribbon doesn't say it too
    lastPointer: 'mouse',
    errors: [],
  };
  let board = null;
  let ui = null;

  // ---------- small helpers ----------

  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const same = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
  const hasCell = (list, at) => (list || []).some((x) => same(x, at));
  const pause = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms * (app.turbo ? 0.05 : app.fast ? 0.3 : 1))));
  const roomDef = (id) => (DATA.rooms || []).find((r) => r.id === id) || null;
  const itemDef = (id) => (DATA.items || {})[id] || { id, name: String(id || '').replace(/-/g, ' ') };
  const textOf = (key, fallback) => {
    const t = (DATA.text || {})[key];
    return t == null ? fallback : t;
  };
  const an = (name) => (/^[aeiou]/i.test(name) ? 'an ' : 'a ') + name;

  // Where a square (fractions are fine) is on screen, in viewport CSS pixels, lifted by `lift`
  // squares: the centre for the lantern iris and the victory light (polish pass).
  function screenPoint(at, lift) {
    const canvas = root.document && document.getElementById('board');
    if (!board || !canvas || !at || !board.cellToScreen) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return null;
    const p = board.cellToScreen(at[0], at[1]);
    const up = board.cellToScreen(at[0], at[1] - 1);
    return { x: rect.left + p.x, y: rect.top + p.y - (p.y - up.y) * (lift || 0) };
  }
  // The middle of the party, at about chest height.
  function partyFocus(st) {
    const hs = Object.values(((st || app.state) || {}).heroes || {}).filter((h) => h && h.at);
    if (!hs.length) return null;
    const mean = (k) => hs.reduce((s, h) => s + h.at[k], 0) / hs.length;
    return screenPoint([mean(0), mean(1)], 0.8);
  }
  // The Heart Lantern's flame (or the middle of the back wall when there is none).
  function lanternFocus(st) {
    const hl = (((st || app.state) || {}).props || []).find((p) => p.type === 'heart-lantern');
    return screenPoint(hl ? hl.at : [5.5, 0], hl ? 1.4 : 1);
  }

  function heroName(id, st) {
    const h = ((st || app.state || {}).heroes || {})[id];
    return (h && h.name) || ((DATA.heroes || {})[id] || {}).name || id;
  }
  function monsterDef(type) {
    return (DATA.monsters || {})[type] || { name: String(type || 'monster') };
  }
  // "The Gloomling", but just "Gloamwing" for the boss.
  function theMonster(type) {
    const d = monsterDef(type);
    return d.boss ? d.name : 'the ' + d.name;
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function log(err) {
    app.errors.push(String((err && err.stack) || err));
    if (root.console) console.error(err);
  }

  // ---------- saving: one slot, plain JSON, never allowed to break the game ----------

  function save() {
    if (!app.state) return;
    try {
      root.localStorage.setItem(SAVE_KEY, R.serialize(app.state));
    } catch (err) { /* private window or full storage: the game still plays */ }
  }
  function clearSave() {
    try {
      root.localStorage.removeItem(SAVE_KEY);
    } catch (err) { /* ignore */ }
  }
  // A saved game that still fits today's data, or null.
  function loadSave() {
    try {
      const text = root.localStorage.getItem(SAVE_KEY);
      if (!text) return null;
      const st = R.deserialize(text, DATA);
      const ok = st && st.heroes && Object.keys(st.heroes).length && roomDef(st.roomId) &&
        ['playing', 'cleared', 'partyDown'].indexOf(st.status) >= 0;
      return ok ? st : null;
    } catch (err) {
      return null;
    }
  }

  // ---------- speed and settings ----------

  function setFast(on) {
    app.fast = !!on;
    app.turbo = on === 2;
    if (board) board.setSpeed(app.turbo ? 4 : app.fast ? 3 : 1);
    applyDiceSpeed();
  }
  function applyDiceSpeed() {
    const s = ui ? ui.settings() : {};
    if (root.LB_DICE) root.LB_DICE.setSpeed(app.fast || s.diceSpeed === 'fast' ? 2 : 1);
  }
  function applySettings(s) {
    s = s || (ui ? ui.settings() : {});
    if (board) board.setReducedMotion(!!s.reducedMotion);
    applyDiceSpeed();
  }

  // ---------- music (audio.js) ----------

  function music(mood) {
    try { if (root.LB_AUDIO && root.LB_AUDIO.music) root.LB_AUDIO.music(mood); } catch (err) { /* never breaks the game */ }
  }
  // Each room has its dungeon music, or the boss's.
  function roomMusic(st) {
    music(roomDef(st.roomId).boss ? 'boss' : 'explore');
    musicLight();
  }
  // The dungeon's music brightens as the room's braziers are lit.
  function musicLight() {
    const st = app.state;
    if (!st || !st.props || !root.LB_AUDIO || !root.LB_AUDIO.musicLight) return;
    const all = st.props.filter((p) => p.type === 'brazier');
    root.LB_AUDIO.musicLight(all.length ? all.filter((p) => p.lit).length / all.length : 1);
  }

  // ---------- who is where ----------

  // The uid a tap on square [c, r] would report, like the board does: a hero, a monster the party
  // can see, or a prop.
  function uidAt(c, r) {
    const st = app.state;
    if (!st) return undefined;
    for (const id of R.heroIds(st)) if (same(st.heroes[id].at, [c, r])) return id;
    for (const m of st.monsters) {
      if (hasCell(R.cells(m), [c, r])) return R.visible(st, m.uid) ? m.uid : undefined;
    }
    for (const p of st.props) if (same(p.at, [c, r])) return p.uid;
    return undefined;
  }
  function monsterAt(c, r) {
    return ((app.state && app.state.monsters) || []).find((m) => hasCell(R.cells(m), [c, r])) || null;
  }
  function standingHeroes(st) {
    return R.heroIds(st).filter((id) => !st.heroes[id].down && st.heroes[id].at);
  }
  // Heroes who can still do something this turn, in party order.
  function readyHeroes(st) {
    return standingHeroes(st).filter((id) => !R.done(st, id));
  }

  // ---------- turning rules events into a show ----------

  // uid -> monster type, for names in the dice tray and the ribbon (defeated monsters are already
  // gone from the state, so the snapshot from before the action fills in).
  function typeMap(before, events) {
    const map = {};
    const add = (list) => (list || []).forEach((m) => { if (m && m.uid) map[m.uid] = m.type; });
    add(before && before.monsters);
    add(app.state && app.state.monsters);
    for (const e of events) {
      if (e.t === 'summon' || e.t === 'defeated') map[e.uid] = e.type || map[e.uid];
      if (e.t === 'mimic') map[e.uid] = 'mimic';
    }
    return map;
  }

  // uid -> the square a monster stood on when the action began (for "the left Gloomling").
  function spotMap(before) {
    const map = {};
    const add = (list) => (list || []).forEach((m) => { if (m && m.uid && m.at) map[m.uid] = m.at; });
    add(app.state && app.state.monsters);
    add(before && before.monsters);
    return map;
  }

  // Dice labels for a blast's targets. Two dice both labelled "The Gloomling" can't be told apart,
  // so say which one: "The left Gloomling", "The right Gloomling" (ux #12).
  function blastLabels(e) {
    const out = e.dice.map((x) => cap(theMonster(e.types[x.target])));
    const at = (k) => (e.spots || {})[e.dice[k].target] || [0, 0];
    const groups = {};
    e.dice.forEach((x, k) => { (groups[out[k]] = groups[out[k]] || []).push(k); });
    Object.values(groups).forEach((ks) => {
      if (ks.length < 2) return;
      const oneColumn = ks.every((k) => at(k)[0] === at(ks[0])[0]);
      ks.sort((a, b) => (oneColumn ? at(a)[1] - at(b)[1] : at(a)[0] - at(b)[0] || at(a)[1] - at(b)[1]));
      const words = oneColumn ? ['back', 'middle', 'front'] : ['left', 'middle', 'right'];
      const name = monsterDef(e.types[e.dice[ks[0]].target]).name;
      ks.forEach((k, i) => { out[k] = `The ${words[ks.length === 2 && i === 1 ? 2 : Math.min(i, 2)]} ${name}`; });
    });
    return out;
  }

  // The dice that decided an ability's or item's numbers.
  function effectSpec(cause) {
    if (cause.item) {
      const it = itemDef(cause.item);
      return it.damage || it.heal || null;
    }
    const hd = (DATA.heroes || {})[cause.uid] || {};
    if (cause.id === 'mend' || (hd.mend && hd.mend.id === cause.id)) return (hd.mend || {}).heal || null;
    const ab = hd.ability || {};
    return ab.damage || ab.heal || null;
  }
  function attackSpec(uid, types) {
    if ((DATA.heroes || {})[uid]) return DATA.heroes[uid].damage;
    return monsterDef(types[uid]).damage || null;
  }
  // Events that start something new; a damage or heal belongs to the nearest one before it.
  const CAUSES = { roll: 1, attack: 1, ability: 1, turn: 1, room: 1, light: 1, bright: 1 };

  // A dice-tray moment to play just before events[i], or null.
  function diceBefore(events, i, types, shown) {
    const e = events[i];
    if ((e.t !== 'damage' && e.t !== 'heal') || !e.rolls || !e.rolls.length) return null;
    for (let j = i - 1; j >= 0; j--) {
      const p = events[j];
      if (!CAUSES[p.t]) continue;
      if (p.t === 'roll') {
        if (!p.hit || p.uid !== e.by) return null;
        const spec = attackSpec(p.uid, types);
        return { t: 'say', dice: [e], d: spec && spec.d };
      }
      if (p.t === 'attack' && p.item) {
        const spec = effectSpec(p);
        return { t: 'say', dice: [e], d: spec && spec.d, name: itemDef(p.item).name };
      }
      if (p.t !== 'ability' || shown.has(p)) return null;
      // An ability or item: all its dice share one tray (a Fireburst on three monsters).
      shown.add(p);
      const group = [];
      for (let k = j + 1; k < events.length && group.length < 3; k++) {
        const x = events[k];
        if (CAUSES[x.t] && x !== p) break;
        if (x.t === e.t && x.by === p.uid && x.rolls && x.rolls.length) group.push(x);
      }
      const spec = effectSpec(p);
      const name = p.name || (p.item ? itemDef(p.item).name : null);
      return { t: 'say', dice: group, d: spec && spec.d, plus: spec ? spec.plus : undefined, name, cause: p };
    }
    return null;
  }

  // Does this event change something the hero bar shows?
  function touchesHud(e, st) {
    const hero = (id) => !!(st.heroes || {})[id];
    switch (e.t) {
      case 'damage': case 'heal': return hero(e.target);
      case 'down': case 'up': case 'status': return hero(e.uid);
      case 'turn': case 'loot': case 'gold': case 'cleared': case 'victory': case 'partyDown': return true;
      case 'ability': case 'attack': return !!e.item;
      default: return false;
    }
  }

  // Ribbon words for an event, or null. Lines from data.text arrive as rules 'say' events.
  function wordsFor(e) {
    const hero = (id) => heroName(id);
    switch (e.t) {
      case 'light': return e.by && app.state.heroes[e.by] ? `${hero(e.by)} lit a brazier!` : null;
      case 'bright': return textOf('bright', 'The room is bright!');
      // The last word on the board before the victory light: the big news, not "the room is bright".
      case 'victory': return textOf('victoryTitle', 'The Heart Lantern blazes again!');
      case 'down': return app.state.heroes[e.uid] ? `${hero(e.uid)}: ${e.line || 'Oof! Knocked down.'}` : null;
      case 'up': return app.state.heroes[e.uid] ? `${hero(e.uid)}: ${e.line || 'Back on your feet!'}` : null;
      case 'turn':
        if (e.side === 'monsters') return "The monsters' turn!";
        return e.round > 1 ? `Round ${e.round}: your turn!` : null;
      case 'ability': case 'attack': case 'status':
        if (!e.item || e.on === false || !app.state.heroes[e.uid]) return null;
        return `${hero(e.uid)} uses the ${itemDef(e.item).name}!`;
      default: return null;
    }
  }

  // Builds the list the board plays: the rules events, plus 'say' events that roll dice in the
  // tray (dice), move the hero bar forward (hud) and put words in the ribbon (text). Checkpoints go
  // after a run of same-type events, so the board still plays a burst of hits together.
  function direct(events, before) {
    const st = app.state;
    const types = typeMap(before, events);
    const spots = spotMap(before);
    const shown = new Set();
    groupPrizes(events);
    const out = [];
    let hud = [];
    let words = [];
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e || !e.t) continue;
      const dice = diceBefore(events, i, types, shown);
      if (dice && dice.dice.length) {
        dice.types = types;
        dice.spots = spots;
        // An ability's or item's dice start rolling with its spell (the Fireburst's flight, the
        // Sunburst's glow), and the numbers wait for both: the hits land with the boom instead
        // of a second and a half after it (polish pass).
        const at = dice.cause ? out.indexOf(dice.cause) : -1;
        if (at >= 0) {
          dice.early = true;
          out.splice(at, 0, dice);
          out.push({ t: 'say', after: dice });
        } else {
          out.push(dice);
        }
      }
      // The room-cleared cheer bursts in just as the light floods the room.
      if (e.t === 'cleared') out.push({ t: 'say', cheer: true });
      if (e.t === 'roll') e.label = rollLabel(e, types);
      out.push(e);
      if (touchesHud(e, st)) hud.push(e);
      const w = wordsFor(e);
      if (w) words.push(w);
      const next = events[i + 1];
      if (!next || next.t !== e.t) {
        if (hud.length || words.length) out.push({ t: 'say', hud, text: words[words.length - 1] || null, quiet: true });
        hud = [];
        words = [];
      }
    }
    return out;
  }

  function rollLabel(e, types) {
    if (app.state.heroes[e.uid]) return `${heroName(e.uid)} rolls to hit ${theMonster(types[e.target])}`;
    const who = cap(theMonster(types[e.uid]));
    return app.state.heroes[e.target] ? `${who} attacks ${heroName(e.target)}` : `${who} attacks`;
  }

  // Moves the hero bar's copy of the state forward by these events.
  function applyView(list) {
    const v = app.view;
    if (!v) return;
    const dropItem = (item) => {
      const k = v.bag.indexOf(item);
      if (k >= 0) v.bag.splice(k, 1);
    };
    for (const e of list) {
      const h = v.heroes[e.target] || v.heroes[e.uid];
      switch (e.t) {
        case 'damage': case 'heal':
          if (v.heroes[e.target] && e.hp != null) v.heroes[e.target].hp = e.hp;
          // A heal on a knocked-down hero gets them up (the 'up' event follows): never "down" with hearts.
          if (e.t === 'heal' && v.heroes[e.target] && e.hp > 0) v.heroes[e.target].down = false;
          break;
        case 'down': if (h) { h.down = true; h.hp = 0; } break;
        case 'up': if (h) { h.down = false; if (e.hp != null) h.hp = e.hp; } break;
        case 'status':
          if (h) {
            if (e.on) h.status[e.status] = true;
            else delete h.status[e.status];
          }
          if (e.item && e.on) dropItem(e.item);
          break;
        case 'turn':
          v.side = e.side;
          v.round = e.round;
          if (e.side === 'party') Object.keys(v.heroes).forEach((id) => { v.heroes[id].moved = false; v.heroes[id].acted = false; });
          break;
        case 'loot':
          if (e.keeps && v.heroes[e.by]) {
            // Gear shows on its hero's card as the ribbon names it (playtest L2).
            const g = itemDef(e.item).gear || {};
            const gear = v.heroes[e.by].gear = Object.assign({ defense: 0, damage: 0, move: 0 }, v.heroes[e.by].gear);
            for (const k of Object.keys(g)) gear[k] = (gear[k] || 0) + g[k];
          } else if (e.item !== 'gold' && !e.keeps) v.bag.push(e.item);
          break;
        case 'gold': v.gold = (v.gold || 0) + (e.amount || 0); break;
        case 'ability': case 'attack': if (e.item) dropItem(e.item); break;
        case 'cleared': v.status = 'cleared'; break;
        case 'victory': v.status = 'victory'; break;
        case 'partyDown': v.status = 'partyDown'; break;
        default: break;
      }
    }
  }

  // ---------- the board's hooks ----------

  // The dice tray docks in the hero bar (ui.js), off the board, so the hit itself stays in view.
  const hooks = {
    roll: (e) => (app.turbo ? undefined : ui.showDice(e, { label: e.label })),
    say: onSay,
    loot: onLoot,
    sound: (name) => {
      try {
        if (root.LB_AUDIO) root.LB_AUDIO.play(SOUND[name] || name);
      } catch (err) { /* sound never breaks the game */ }
    },
  };

  function onSay(e) {
    if (e.hud && e.hud.length) {
      applyView(e.hud);
      refreshHud();
    }
    if (e.cheer) {
      // The big golden "Room cleared!" says the rules' line, so the ribbon keeps quiet for it.
      if (!app.turbo) {
        app.cheering = true;
        ui.cheer(textOf('cleared', 'Room cleared!'));
      }
      return undefined;
    }
    if (e.after) return e.after.job; // the numbers wait for dice that started early
    if (e.dice) {
      if (app.turbo) return undefined;
      const job = rollEffect(e);
      if (!e.early) return job;
      e.job = job;
      return undefined;
    }
    if (e.key === 'cleared' && app.cheering) return pause(1000);
    if (e.text) ui.message(e.text);
    if (e.move) return pause(700); // Gloamwing's move: a beat to read it
    // Story lines ("Surprise! That chest was a Mimic!") get a real beat before the next dice roll (ux #2).
    if (e.text && !e.quiet) return pause(e.key ? 1000 : 350);
    return undefined;
  }

  // Damage or healing dice in the tray. A heal that tops a hero up shows the dice as rolled.
  function rollEffect(e) {
    const many = e.dice.length > 1;
    const names = many && e.dice[0].t !== 'heal' ? blastLabels(e) : [];
    const jobs = e.dice.map((x, k) => {
      const ev = Object.assign({}, x);
      const rolled = (x.rolls || []).reduce((a, b) => a + b, 0) + (e.plus || 0);
      let label = e.name || undefined;
      if (x.t === 'heal') {
        label = many ? heroName(x.target) : e.name || 'Healing roll';
        if (e.plus != null && rolled > x.amount) {
          ev.amount = rolled;
          label = `${heroName(x.target)} only needed ${x.amount}`;
        }
      } else if (many) {
        label = names[k] || cap(theMonster(e.types[x.target]));
      }
      // Early dice let go as soon as they settle; the tray keeps showing them as the hits land.
      return ui.showDice(ev, { d: e.d, append: k > 0, label, linger: e.early ? 150 : undefined });
    });
    return Promise.all(jobs);
  }

  // Prizes from one place (a Mimic's two drops) share one ribbon line, said with the first prize,
  // so the second never hides the first (playtest L2).
  function onLoot(e) {
    if (e.joined) return;
    const list = e.together || [e];
    const first = list[0];
    const who = first.by && app.state && app.state.heroes[first.by] ? heroName(first.by) : 'The party';
    const name = (x) => (x.item === 'gold' ? `${x.amount || 'some'} gold` : x.keeps ? `the ${itemDef(x.item).name}` : an(itemDef(x.item).name));
    const line = `${who} found ${joinAnd(list.map(name))}!`;
    const it = itemDef(first.item);
    if (list.length > 1 || first.item === 'gold') ui.message(line);
    else if (first.keeps) ui.message(`${line} ${it.text || ''}`.trim());
    else ui.message(`${line} It goes in the party bag.`);
  }
  function groupPrizes(events) {
    const from = {};
    for (const e of events) {
      if (!e || e.t !== 'loot') continue;
      const k = String(e.from || e.by || '');
      (from[k] = from[k] || []).push(e);
    }
    Object.values(from).forEach((list) => {
      if (list.length < 2) return;
      list[0].together = list;
      list.slice(1).forEach((x) => { x.joined = true; });
    });
  }

  // Plays events on the board. `before` is the state as it was before the rules call, for the
  // hero bar to count down from; without it the hero bar shows the state as it is.
  async function animate(events, before, keepFlags) {
    if (!events || !events.length) return;
    app.view = before ? clone(before) : null;
    if (app.view && app.state) {
      // Who has moved or acted isn't dramatic, so the hero bar shows it straight away.
      for (const id of Object.keys(app.view.heroes)) {
        const now = app.state.heroes[id];
        if (now && keepFlags) {
          app.view.heroes[id].moved = now.moved;
          app.view.heroes[id].acted = now.acted;
        }
      }
    }
    refreshHud();
    const list = direct(events, before);
    board.setState(app.state);
    try {
      await board.play(list, hooks);
    } finally {
      app.view = null;
    }
  }

  // ---------- the hero bar and the glowing squares ----------

  function optionsFor(id) {
    if (!app.state || !id || app.phase !== 'play') return null;
    return R.options(app.state, id);
  }

  function refreshHud() {
    const st = app.view || app.state;
    if (!ui || !st || !st.roomId) return;
    const live = !app.view && app.phase === 'play';
    const opts = live ? optionsFor(app.selected) : null;
    if (opts) opts.actions = opts.actions.filter((a) => a.kind !== 'wait');
    const armed = live && app.pending && app.pending.confirm ? app.pending.action : null;
    ui.updateHud(st, {
      selected: app.selected,
      options: opts,
      endConfirm: live && !!app.endConfirm,
      pending: live && app.pending ? app.pending.kind : null,
      // An armed ability's name, so the hero bar can say "tap Sunburst again".
      armed: armed ? ((DATA.heroes[app.selected] || {}).ability || {}).name || 'it' : null,
    });
    const allDone = live && app.state.status === 'playing' && !readyHeroes(app.state).length;
    ui.root.classList.toggle('lb-all-done', allDone);
  }

  // Gold squares, red rings and badges for the selected hero (or the aim squares while aiming).
  function showChoices() {
    if (!board) return;
    if (app.phase !== 'play' || !app.selected) {
      board.clearOptions();
      return;
    }
    if (app.pending) {
      board.showOptions({ moves: [], actions: [app.pending.show || app.pending.action] }, app.selected);
      if (app.pending.aimAt) board.previewArea(R.blast(app.pending.aimAt, app.pending.action.radius));
      return;
    }
    board.showOptions(optionsFor(app.selected) || { moves: [], actions: [] }, app.selected);
  }

  function refresh() {
    app.endConfirm = false; // any other tap puts the "Monsters go?" question away
    showChoices();
    refreshHud();
    musicLight();
  }

  function setAnim(on) {
    if (ui) ui.root.classList.toggle('lb-anim', !!on);
  }

  // Keeps the current hero if they can still act; otherwise the next ready hero in party order.
  function pickHero(prefer) {
    const st = app.state;
    const ready = readyHeroes(st);
    if (prefer && ready.indexOf(prefer) >= 0) return prefer;
    if (!ready.length) return null;
    const order = R.heroIds(st);
    const from = order.indexOf(app.selected);
    for (let k = 1; k <= order.length; k++) {
      const id = order[(from + k + order.length) % order.length];
      if (ready.indexOf(id) >= 0) return id;
    }
    return ready[0];
  }

  function select(id) {
    if (!app.state || !app.state.heroes[id]) return;
    app.selected = id;
    app.pending = null;
    ui.hideDice(); // the last roll is old news once someone picks what to do next (ux #2)
    refresh();
  }

  function cancelPending() {
    if (!app.pending) return;
    app.pending = null;
    board.previewArea(null);
    refresh();
  }

  // After a hero's move or action: carry on with them, or hand over to the next ready hero.
  function nextStep() {
    const st = app.state;
    app.pending = null;
    if (app.selected && !R.done(st, app.selected)) {
      const o = R.options(st, app.selected);
      if (o.moves.length || o.actions.some((a) => a.kind !== 'wait')) {
        refresh();
        return;
      }
      R.act(st, app.selected, { kind: 'wait' }); // nothing left to do: their turn ends by itself
      save();
    }
    const next = pickHero(null);
    if (next) {
      app.selected = next;
      refresh();
      return;
    }
    // Everyone has had their go. Keep the last hero highlighted and point at the party's button.
    refresh();
    ui.message('Everyone is done! Tap the gold Monsters go button.');
  }

  // "Rowan, Fennick and Oren": words joined the way people say them.
  function joinAnd(words) {
    return words.length < 2 ? words.join('') : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
  }
  function nameList(ids) {
    return joinAnd(ids.map((id) => heroName(id)));
  }

  // The party's button. If a standing hero hasn't moved or acted at all yet, the first tap only
  // asks; the second lets the monsters go. Any other tap in between puts the question away (ux #3).
  function askEndPartyTurn() {
    if (app.phase !== 'play' || app.busy || !app.state) return;
    const fresh = readyHeroes(app.state).filter((id) => !app.state.heroes[id].moved && !app.state.heroes[id].acted);
    if (fresh.length && !app.endConfirm) {
      if (app.pending) cancelPending();
      app.endConfirm = true;
      refreshHud();
      ui.hint(`${nameList(fresh)} ${fresh.length > 1 ? "haven't" : "hasn't"} had a go yet. Tap Monsters go again to let the monsters go.`);
      return;
    }
    endPartyTurn().catch(log);
  }

  // Marks which screen waits for a tap while its promise is open (the test hooks read it).
  async function waitFor(name, promise) {
    app.waiting = name;
    try {
      return await promise;
    } finally {
      if (app.waiting === name) app.waiting = null;
    }
  }

  // ---------- doing things (one at a time) ----------

  // Runs a rules call and plays its events while the controls rest. Returns the events, or null
  // if something else is still playing or the rules said no.
  async function perform(fn, phase) {
    if (app.busy || !app.state) return null;
    app.busy++;
    setAnim(true);
    const before = clone(app.state);
    const back = app.phase;
    let events = null;
    try {
      events = fn(app.state) || [];
      if (!events.length) return events;
      save();
      app.phase = phase || 'anim';
      board.clearOptions();
      await animate(events, before, app.phase === 'anim');
    } catch (err) {
      log(err);
    } finally {
      if (app.phase === 'anim' || app.phase === 'monsters') app.phase = back === 'play' ? 'play' : back;
      app.busy--;
      setAnim(false);
    }
    return events;
  }

  async function doMove(id, at) {
    if (app.phase !== 'play') return false;
    app.pending = null;
    ui.hideDice();
    const events = await perform((st) => R.move(st, id, at));
    if (!events || !events.length) return false;
    afterHeroTurn().catch(log);
    return true;
  }

  async function doAct(id, action) {
    if (app.phase !== 'play') return false;
    app.pending = null;
    board.previewArea(null);
    const events = await perform((st) => R.act(st, id, action));
    if (!events) return false;
    // 'wait' changes the state without any events.
    if (!events.length && action.kind !== 'wait') {
      refresh();
      return false;
    }
    afterHeroTurn().catch(log);
    return true;
  }

  // What happens after a hero moves or acts: a cleared room, victory, or the next hero's go.
  async function afterHeroTurn() {
    const st = app.state;
    if (st.status === 'cleared') return roomCleared();
    if (st.status === 'victory') return victory();
    save();
    // A Mimic's bite can knock down the last hero standing: then the monsters' turn comes at once.
    if (!standingHeroes(st).length) return endPartyTurn();
    nextStep();
    return undefined;
  }

  async function endPartyTurn() {
    if (app.phase !== 'play' || app.busy) return false;
    app.pending = null;
    board.previewArea(null);
    const events = await perform((st) => R.endPartyTurn(st), 'monsters');
    if (!events || !events.length) return false;
    if (app.state.status === 'partyDown') {
      camp().catch(log);
      return true;
    }
    startPartyTurn();
    return true;
  }

  // A new party turn: save, then hand the first ready hero their go.
  function startPartyTurn() {
    app.phase = 'play';
    app.waiting = null;
    app.pending = null;
    save();
    app.selected = pickHero(app.selected);
    if (!app.selected) app.selected = R.heroIds(app.state)[0];
    refresh();
  }

  // ---------- rooms ----------

  // Plays a room's arrival: the boss reveal (if the rules sent one), the room fading in, then its
  // intro banner. Ends with the party's first turn.
  async function arrive(events) {
    const st = app.state;
    app.selected = null;
    app.pending = null;
    board.clearOptions();
    ui.message('');
    roomMusic(st);
    if (events.some((e) => e.t === 'bossReveal') && !skipIntro) {
      app.phase = 'boss';
      ui.fadeIn();
      await waitFor('boss', ui.showBossReveal());
    } else {
      ui.clearScreens();
      ui.fadeIn(partyFocus(st)); // the lantern iris opens where the party walks in
    }
    app.phase = 'intro';
    // The rules' room snapshot (for a retry after camp) leaves out the adventure's numbers, so keep
    // a copy beside it: a retried room then doesn't count the failed try twice (playtest L5).
    if (st.roomStart) st.roomStart.stats = clone(st.stats);
    const peek = !skipIntro;
    if (peek) board.peek(true);
    board.setState(st);
    refreshHud();
    save();
    app.busy++;
    setAnim(true);
    try {
      await animate(events, null);
      if (peek) await peekAtRoom();
    } catch (err) {
      log(err);
    } finally {
      if (peek) board.peek(false); // never leave a room stuck in its lit opening shot
      app.busy--;
      setAnim(false);
    }
    if (!skipIntro) {
      await waitFor('intro', ui.showRoomIntro(roomDef(st.roomId)));
      ui.message('');
    }
    startPartyTurn();
  }

  // Each room's opening shot (ux #8): its painting, lit, for a moment, so the family sees what the
  // light will bring back and can spot braziers and chests. Then the Gloam creeps back in.
  async function peekAtRoom() {
    const calm = !!ui.settings().reducedMotion;
    await pause(calm ? 800 : 1500);
    ui.message('The Gloam swallows the light!');
    board.peek(false);
    await pause(1300);
  }

  async function enterRoom(roomId) {
    const events = R.enterRoom(app.state, roomId);
    if (!events.length) throw new Error('No such room: ' + roomId);
    await arrive(events);
  }

  // Room cleared: the board's celebration plays first, then the loot and the doorway choice.
  async function roomCleared() {
    const st = app.state;
    // The lit room gets a long look before any panel (ux #9). Meanwhile the game counts as busy,
    // so the test hooks wait for the doorway choice itself.
    app.phase = 'anim';
    app.pending = null;
    app.selected = null; // nobody's turn while the party picks a door
    board.clearOptions();
    refreshHud();
    save();
    app.busy++;
    try {
      await pause(2500);
    } finally {
      app.busy--;
    }
    app.phase = 'cleared';
    ui.message('');
    ui.endCheer(); // gone by now at normal speed; quicker speeds cut it short
    app.cheering = false;
    const found = st.found || { items: [], gold: 0 };
    // focus: where the lantern iris closes in when they walk through the door.
    const arch = await waitFor('cleared', ui.showCleared({ loot: found.items.slice(), gold: found.gold, focus: partyFocus(st) }, R.exits(st)));
    const events = R.leave(st, arch);
    if (!events.length) {
      // No doorway matched (it shouldn't happen): try the first one so nobody gets stuck.
      const first = R.exits(st)[0];
      if (first) return arrive(R.leave(st, first.arch));
      return startPartyTurn();
    }
    return arrive(events);
  }

  // Everyone knocked down: rest at camp, then try the room again with full hearts.
  async function camp() {
    app.phase = 'camp';
    app.pending = null;
    board.clearOptions();
    save();
    music('camp');
    await pause(600);
    await waitFor('camp', ui.showCamp());
    const stats = app.state.roomStart && app.state.roomStart.stats;
    const events = R.retry(app.state);
    if (events.length && stats) app.state.stats = clone(stats);
    roomMusic(app.state);
    app.phase = 'intro';
    app.busy++;
    setAnim(true);
    try {
      await animate(events, null);
    } catch (err) {
      log(err);
    } finally {
      app.busy--;
      setAnim(false);
    }
    startPartyTurn();
    ui.message('Fresh hearts, fresh try. You can do it!');
  }

  async function victory() {
    const st = app.state;
    app.phase = 'victory';
    app.pending = null;
    app.selected = null;
    board.clearOptions();
    refreshHud();
    clearSave(); // the adventure is complete; the title offers a new one
    await pause(1600);
    // The Heart Lantern's light swells until it fills the screen, and carries the party into the
    // victory painting (calm motion and the quickest test speed simply cut to it).
    const glowing = app.turbo ? false : await ui.flareIn(lanternFocus(st));
    ui.hideHud();
    music('victory');
    ui.showVictory(Object.assign({ gold: st.gold }, st.stats));
    if (glowing) ui.flareOut();
    app.waiting = 'victory';
  }

  // ---------- input: taps on the board ----------

  function targetsOf(a) {
    return a.targets || a.props || a.heroes || [];
  }
  // How a chosen action picks its target: an area to aim at, a list to tap, or nothing at all.
  function aimOf(a) {
    if (a.radius != null && Array.isArray(a.area)) return 'area';
    if (targetsOf(a).length) return 'list';
    return 'none';
  }
  function actionFrom(a, extra) {
    const out = { kind: a.kind };
    if (a.id) out.id = a.id;
    if (a.item) out.item = a.item;
    return Object.assign(out, extra || {});
  }

  function onCellTap(t) {
    if (app.phase !== 'play' || app.busy || !t) return;
    handleTap(t.c, t.r, t.uid);
  }

  function handleTap(c, r, uid) {
    const st = app.state;
    const sel = app.selected;
    const at = [c, r];
    if (app.pending && sel) {
      const p = app.pending;
      if (p.confirm) {
        // An armed ability: a tap inside its glow uses it.
        if (hasCell(p.show && p.show.area, at)) {
          doAct(sel, actionFrom(p.action));
          return;
        }
      } else if (p.area) {
        if (hasCell(p.action.area, at)) {
          // On a touch screen there is no hover preview, so the first tap shows the burst.
          if (app.lastPointer === 'touch' && !same(p.aimAt, at)) {
            p.aimAt = at;
            board.previewArea(R.blast(at, p.action.radius));
            ui.hint('Tap the same square again to let it fly!');
            return;
          }
          doAct(sel, actionFrom(p.action, { at }));
          return;
        }
      } else if (uid && targetsOf(p.action).indexOf(uid) >= 0) {
        doAct(sel, actionFrom(p.action, { target: uid }));
        return;
      }
      cancelPending(); // a tap anywhere else stops aiming and counts as a normal tap
    }
    const opts = (sel && R.options(st, sel)) || { moves: [], actions: [] };
    const find = (kind) => opts.actions.find((a) => a.kind === kind) || null;
    if (uid && st.heroes[uid]) {
      const help = find('help');
      if (help && help.heroes.indexOf(uid) >= 0) {
        doAct(sel, { kind: 'help', target: uid });
        return;
      }
      if (uid !== sel) select(uid);
      else if (st.heroes[uid].down) ui.hint(dizzyLine(uid));
      return;
    }
    const monster = uid && st.monsters.find((m) => m.uid === uid);
    if (monster) {
      const attack = find('attack');
      if (attack && attack.targets.indexOf(uid) >= 0) {
        doAct(sel, { kind: 'attack', target: uid });
        return;
      }
      const md = monsterDef(monster.type);
      const why = !sel ? 'Tap a hero first.' : 'Too far away to hit from here.';
      ui.hint(md.name + ': ' + monster.hp + ' of ' + monster.maxHp + ' hearts. ' + why);
      return;
    }
    const prop = uid && st.props.find((p) => p.uid === uid);
    if (prop) {
      for (const kind of ['light', 'open']) {
        const a = find(kind);
        if (a && a.props.indexOf(uid) >= 0) {
          doAct(sel, { kind, target: uid });
          return;
        }
      }
      ui.hint(propHint(prop));
      return;
    }
    const mv = opts.moves.find((m) => same(m.at, at));
    if (mv) {
      doMove(sel, at);
      return;
    }
    if (monsterAt(c, r)) ui.hint('Something is hiding in the dark there. Light it up to see it!');
  }

  // A knocked-down hero is "dizzy", never lost: a friend can help (no-shame rule).
  function dizzyLine(id) {
    return `${heroName(id)} is dizzy! A friend next to ${heroName(id)} can tap Help up.`;
  }

  function propHint(p) {
    const name = ((DATA.props || {})[p.type] || {}).name || p.type;
    if (p.type === 'brazier') return p.lit ? 'This brazier is blazing!' : 'Stand next to the brazier, then light it.';
    if (p.type === 'chest' || p.mimic) return p.opened ? 'Empty now. You already found the treasure!' : 'Stand next to the chest to open it.';
    return cap(an(name)) + '.';
  }

  // ---------- input: the hero bar ----------

  // What an ability with nothing to aim at (Shield Wall, Sunburst) would touch right now, for the
  // armed preview: { area, heal: [heroIds], push: [monster uids] }.
  function abilityReach(id, a) {
    const st = app.state;
    const h = st.heroes[id];
    if (!h || !h.at) return { area: [], heal: [], push: [] };
    if (a.id !== 'sunburst') return { area: R.blast(h.at, 1), heal: [], push: [] };
    const r = (((DATA.heroes || {})[id] || {}).ability || {}).radius || 2;
    const heal = R.heroIds(st).filter((o) => {
      const x = st.heroes[o];
      return x.at && R.distance(x.at, h.at) <= r && (x.down || x.hp < x.maxHp);
    });
    const push = st.monsters.filter((m) => R.cells(m).some((c) => R.distance(c, h.at) <= r)).map((m) => m.uid);
    return { area: Array.isArray(a.area) ? a.area : R.blast(h.at, r), heal, push };
  }

  // Shield Wall and Sunburst work once per room, so the first tap only arms them: their squares
  // glow and the ribbon says what they do. A second tap (on the button or inside the glow) uses
  // it; any other tap puts it away. Sunburst with nobody to help or push is never used up.
  function armAbility(sel, a) {
    const name = ((DATA.heroes[sel] || {}).ability || {}).name || 'It';
    const reach = abilityReach(sel, a);
    if (a.id === 'sunburst' && !reach.heal.length && !reach.push.length) {
      ui.hint(`Nobody is close enough yet! ${name} helps hurt friends and pushes monsters within 2 squares of ${heroName(sel)}.`);
      return;
    }
    const show = Object.assign({}, a, { area: reach.area, targets: reach.heal });
    app.pending = { action: a, kind: a.kind, item: null, area: false, aimAt: null, confirm: true, show };
    refresh();
    const what = a.id === 'sunburst'
      ? `${name} heals friends and pushes monsters in the glow.`
      : `${name}: ${heroName(sel)} gets +2 Defense and guards friends next to her.`;
    ui.hint(`${what} Tap ${name} again to use it!`);
  }

  // A button in the hero bar: actions with one possible target happen at once, others glow
  // their targets and wait for a tap.
  function chooseAction(a) {
    const sel = app.selected;
    if (!a || !sel) return;
    ui.hideDice();
    if (app.pending && app.pending.action.kind === a.kind && app.pending.action.item === a.item) {
      // Tapping an armed ability again uses it; tapping any other glowing button again puts it away.
      if (app.pending.confirm) doAct(sel, actionFrom(app.pending.action));
      else cancelPending();
      return;
    }
    const aim = aimOf(a);
    if (aim === 'none' && a.kind === 'ability') {
      armAbility(sel, a);
      return;
    }
    if (aim === 'none') {
      doAct(sel, actionFrom(a));
      return;
    }
    if (aim === 'list' && targetsOf(a).length === 1) {
      doAct(sel, actionFrom(a, { target: targetsOf(a)[0] }));
      return;
    }
    app.pending = { action: a, kind: a.kind, item: a.item || null, area: aim === 'area', aimAt: null };
    refresh();
    const heroesOnly = targetsOf(a).every((x) => !!app.state.heroes[x]);
    if (aim === 'area') ui.hint('Tap a glowing square to aim.');
    else if (a.kind === 'help') ui.hint('Tap the friend to help up.');
    else if (heroesOnly) ui.hint('Tap the hero to heal.');
    else if (a.kind === 'light' || a.kind === 'open') ui.hint('Tap the one you want.');
    else ui.hint('Tap a monster with a red ring.');
  }

  const handlers = {
    onNewGame: () => {
      if (app.busy) return;
      app.phase = 'party';
      app.waiting = 'party';
      ui.showParty(DATA.heroes);
    },
    onContinue: () => { continueGame().catch(log); },
    onStart: (names) => { newAdventure(names).catch(log); },
    onSelectHero: (id) => {
      if (app.phase !== 'play' || app.busy) return;
      if (id === app.selected && app.pending) cancelPending();
      else select(id);
    },
    onAction: (kind) => {
      if (app.phase !== 'play' || app.busy || !app.selected) return;
      if (kind === 'wait') {
        doAct(app.selected, { kind: 'wait' });
        return;
      }
      const opts = R.options(app.state, app.selected);
      chooseAction(opts.actions.find((x) => x.kind === kind));
    },
    onItem: (item) => {
      if (app.phase !== 'play' || app.busy || !app.selected) return;
      const opts = R.options(app.state, app.selected);
      chooseAction(opts.actions.find((x) => x.kind === 'item' && x.item === item));
    },
    onEndHeroTurn: () => {
      if (app.phase !== 'play' || app.busy || !app.selected) return;
      doAct(app.selected, { kind: 'wait' });
    },
    onEndPartyTurn: () => askEndPartyTurn(),
    // ui.showCleared() and ui.showCamp() resolve promises too, and main.js uses those, so these
    // two stay empty: a room must never be left or retried twice.
    onLeave: () => {},
    onRetry: () => {},
    onSettings: (s) => applySettings(s),
  };

  // ---------- title, party, story, continue ----------

  function showTitle() {
    app.phase = 'title';
    app.selected = null;
    app.pending = null;
    if (board) board.clearOptions();
    app.waiting = 'title';
    music('title');
    ui.showTitle({ canContinue: !!loadSave() });
  }

  function newState(names) {
    const seed = SEED != null && SEED !== '' ? Number(SEED) : TEST ? 1 : undefined;
    return R.newGame({ data: DATA, seed, names: names || {} });
  }

  async function newAdventure(names) {
    if (app.busy) return;
    app.state = newState(names);
    app.selected = null;
    board.setState(app.state);
    app.phase = 'story';
    if (!skipIntro) await waitFor('story', ui.showStory(DATA.story));
    await enterRoom(DATA.startRoom || DATA.rooms[0].id);
  }

  // Back to where the saved game left off.
  async function continueGame() {
    const st = loadSave();
    if (!st) {
      showTitle();
      return;
    }
    app.state = st;
    app.selected = null;
    app.pending = null;
    board.setState(st);
    ui.clearScreens();
    if (st.status === 'cleared') {
      app.phase = 'cleared';
      refreshHud();
      await animate([{ t: 'room', roomId: st.roomId }], null);
      await roomCleared();
      return;
    }
    if (st.status === 'partyDown') {
      refreshHud();
      await camp();
      return;
    }
    app.phase = 'intro';
    refreshHud();
    roomMusic(st);
    await animate([{ t: 'room', roomId: st.roomId }], null);
    startPartyTurn();
    ui.message('Welcome back, Lanternbearers!');
  }

  function savedNames() {
    try {
      return JSON.parse(root.localStorage.getItem('lanternbearers:v1:names') || 'null') || {};
    } catch (err) {
      return {};
    }
  }

  // ---------- test hooks (?test=1) ----------

  // What the game is waiting for right now, or null while it is busy.
  function waitingFor() {
    if (app.busy) return null;
    if (app.phase === 'play') return 'play';
    return app.waiting || null;
  }
  // Resolves once the game waits for input again. `from` = the waiting state before a click:
  // first wait for that to change, so a click on a slow-closing screen isn't mistaken for done.
  function settle(from, timeout) {
    const t0 = Date.now();
    const limit = timeout || 120000;
    let moved = !from || from === 'play';
    return new Promise((resolve) => {
      const tick = () => {
        const w = waitingFor();
        if (!moved && w !== from) moved = true;
        if (moved && w) return resolve(w);
        if (Date.now() - t0 > limit) return resolve('timeout:' + (w || app.phase));
        setTimeout(tick, 40);
      };
      setTimeout(tick, 30);
    });
  }

  // act(kind, target, heroId): kind is an action kind ('attack', 'ability', 'light', ...), 'move',
  // 'wait', or an item id. target is a uid, a square [c, r], or { item, target, at }.
  async function testAct(kind, target, heroId) {
    await settle();
    if (heroId) select(heroId);
    const id = app.selected;
    if (!id || app.phase !== 'play') return false;
    if (kind === 'move') return doMove(id, target).then(settled);
    if (kind === 'wait' || kind === 'end') return doAct(id, { kind: 'wait' }).then(settled);
    const opts = R.options(app.state, id);
    const wantItem = kind === 'item' ? (target && target.item) || target : null;
    const a = kind === 'item'
      ? opts.actions.find((x) => x.kind === 'item' && x.item === wantItem)
      : opts.actions.find((x) => x.kind === kind) || opts.actions.find((x) => x.kind === 'item' && x.item === kind);
    if (!a) return false;
    const t = target && typeof target === 'object' && !Array.isArray(target) ? (target.at || target.target) : target;
    const extra = {};
    if (Array.isArray(t)) extra.at = t;
    else if (t != null && t !== a.item) extra.target = t;
    const aim = aimOf(a);
    if (aim === 'area' && !extra.at) {
      const m = extra.target && app.state.monsters.find((x) => x.uid === extra.target);
      if (!m) return false;
      extra.at = m.at;
      delete extra.target;
    }
    if (aim === 'list' && extra.target == null) extra.target = targetsOf(a)[0];
    return doAct(id, actionFrom(a, extra)).then(settled);
  }
  // Passes a result through once the game waits for input again.
  function settled(result) {
    return settle().then(() => result);
  }

  async function goRoom(id, opts) {
    if (!roomDef(id)) return false;
    await settle();
    const keep = skipIntro;
    skipIntro = !(opts && opts.intro);
    if (!app.state || (opts && opts.fresh)) app.state = newState(savedNames());
    app.selected = null;
    board.setState(app.state);
    const run = enterRoom(id).catch(log).then(() => { skipIntro = keep; });
    if (!skipIntro) {
      // With the intro on, report back as soon as the banner (or the boss reveal) waits.
      return settle();
    }
    await run;
    return settle();
  }

  // Taps the main button on whichever screen is waiting (story, intro, boss reveal, cleared, camp).
  function next() {
    const w = waitingFor();
    const pick = {
      title: '.lb-title [data-k="new"]', party: '.lb-party [data-k="start"]', story: '.lb-story [data-k="go"]',
      intro: '.lb-intro [data-k="go"]', boss: '.lb-boss [data-k="fight"]', cleared: '.lb-cleared [data-arch], .lb-cleared [data-k="onward"]',
      camp: '.lb-camp [data-k="retry"]', victory: '.lb-victory [data-k="again"]',
    }[w];
    return pick ? click(pick) : settle();
  }
  function click(selector) {
    const from = waitingFor();
    const b = document.querySelector(selector);
    if (!b) return Promise.resolve('missing:' + selector);
    b.click();
    return settle(from);
  }

  function exposeTest() {
    root.addEventListener('error', (e) => app.errors.push(String((e.error && e.error.stack) || e.message)));
    root.addEventListener('unhandledrejection', (e) => app.errors.push('promise: ' + String((e.reason && e.reason.stack) || e.reason)));
    root.LB_TEST = {
      ready: false,
      state: () => clone(app.state),
      options: (id) => (app.state ? R.options(app.state, id || app.selected) : null),
      tap: (c, r) => {
        if (app.phase === 'play' && !app.busy) handleTap(c, r, uidAt(c, r));
        return settle();
      },
      act: testAct,
      endTurn: () => {
        endPartyTurn().catch(log);
        return settle();
      },
      goRoom,
      fast: (on) => {
        setFast(on === 2 ? 2 : on !== false);
        return app.turbo ? 2 : app.fast;
      },
      hover: (c, r) => board.hoverCell(c, r),
      // A real pointer press and release on square [c, r], through the board's own hit testing.
      pointer: (c, r, type) => {
        const canvas = document.getElementById('board');
        const rect = canvas.getBoundingClientRect();
        const p = board.cellToScreen(c, r);
        const init = { pointerType: type || 'mouse', pointerId: 7, isPrimary: true, bubbles: true,
          clientX: rect.left + p.x, clientY: rect.top + p.y - 6 };
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
        canvas.dispatchEvent(new PointerEvent('pointerup', init));
        return settle();
      },
      // Extras for the playtest tools.
      phase: () => waitingFor() || app.phase,
      selected: () => app.selected,
      select: (id) => {
        if (app.phase === 'play' && !app.busy) select(id);
        return app.selected;
      },
      idle: () => settle(),
      next,
      click,
      choose: (arch) => click(arch ? `.lb-cleared [data-arch="${arch}"]` : '.lb-cleared [data-arch], .lb-cleared [data-k="onward"]'),
      retry: () => click('.lb-camp [data-k="retry"]'),
      // Changes the live state (tests only), then redraws everything.
      patch: (fn) => {
        if (typeof fn === 'function' && app.state) fn(app.state);
        if (app.state) board.setState(app.state);
        refresh();
        return clone(app.state);
      },
      message: () => {
        const r = document.querySelector('.lb-ribbon');
        return r ? r.textContent : '';
      },
      saved: () => {
        try {
          return root.localStorage.getItem(SAVE_KEY);
        } catch (err) {
          return null;
        }
      },
      board: () => (board ? board.stats() : null),
      errors: app.errors,
    };
  }

  // ---------- boot ----------

  function boot() {
    // ?test=1&noart=1 plays with every picture missing, to check the stand-ins.
    if (TEST && params.get('noart') === '1') root.LB_ART = {};
    const canvas = document.getElementById('board');
    board = root.LB_BOARD.create(canvas, { layout: root.LB_LAYOUT, data: DATA, art: root.LB_ART || {}, rules: R });
    ui = root.LB_UI.create(document.getElementById('ui-root'), handlers);
    board.onCellTap(onCellTap);
    // The board reports taps but not what tapped, and aiming works differently on touch screens.
    canvas.addEventListener('pointerdown', (e) => { app.lastPointer = e.pointerType || 'mouse'; }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && app.pending) cancelPending();
    });
    applySettings();
    if (params.get('fast') === '1' || params.get('fast') === '2') setFast(params.get('fast') === '2' ? 2 : true);
    if (params.get('reset') === '1') clearSave();
    if (TEST) exposeTest();
    if (START_ROOM && roomDef(START_ROOM)) {
      app.state = newState(savedNames());
      board.setState(app.state);
      enterRoom(START_ROOM).catch(log);
    } else {
      showTitle();
    }
    if (root.LB_TEST) root.LB_TEST.ready = true;
  }

  try {
    boot();
  } catch (err) {
    log(err);
  }
})(typeof self !== 'undefined' ? self : this);
