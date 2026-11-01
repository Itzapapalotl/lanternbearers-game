// Lanternbearers board (LB_BOARD): the canvas that shows the room painting, props and units,
// the darkness and lantern light, particles, floating numbers and screen shake, and plays rules
// events as awaitable animations. The contract is in ARCHITECTURE.md; fx.js (LB_FX) holds the
// reusable effect parts. Everything is drawn in painting coordinates (1536 x 1024).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./fx.js'));
  else root.LB_BOARD = factory(root.LB_FX);
})(typeof self !== 'undefined' ? self : this, function (FX) {
  'use strict';

  const G = typeof self !== 'undefined' ? self : globalThis;
  const { TAU, clamp, lerp, ease, smoothstep, rand, range, pick } = FX;

  const FULL_DARK = 0.78; // darkness over unlit squares: walls, doors and props stay faint moonlit shapes (ux #8)
  const CLEAR_DARK = 0.12; // what's left once a room is cleared
  const DARK_RGB = '5,7,20'; // deep blue-black
  const UNIT_H = 1.45; // figures stand this many squares tall
  const BOSS_W = 3.2; // the boss is this many squares wide
  const WARM = '255,176,86';
  const GOLD = '255,212,110';
  const HERO_COLORS = { knight: '#4a7be0', ranger: '#4fb06a', wizard: '#a36bf0', lightbringer: '#f0a63a' };
  // Chapter 2's colored flames (data.flames wins; these are the plan's colors for when it's missing).
  const FLAME_HEX = { blue: '#6ec8ff', green: '#7be07b', red: '#ff7a52', violet: '#c08bff' };
  const COLOR_IDX = { blue: 0, green: 1, red: 2, violet: 3 };
  const COLOR_NAMES = ['blue', 'green', 'red', 'violet'];
  const NCOL = 4;
  const TINT_A = 0.3; // how strongly colored light tints the squares it falls on

  // Spots inside each painting as fractions of its width and height (as painted, facing right):
  // lantern = where the lantern glows, tip = where shots start, eyes = the pair that shows in
  // the dark (gap = eye spacing as a fraction of the width), spots = the boss's wing eyespots.
  const LOOKS = {
    knight: { lantern: [0.6, 0.47], tip: [0.12, 0.72] },
    ranger: { lantern: [0.5, 0.45], tip: [0.88, 0.44] },
    wizard: { lantern: [0.53, 0.47], tip: [0.1, 0.08] },
    lightbringer: { lantern: [0.08, 0.13], tip: [0.08, 0.13] },
    gloomling: { eyes: [0.72, 0.425], gap: 0.145, eye: '196,120,255', gloom: true, defeat: 'wisps', color: '#4b3a8c' },
    rattlebones: { eyes: [0.5, 0.205], gap: 0.1, eye: '80,200,255', defeat: 'bones', color: '#cfc4a2' },
    goblin: { eyes: [0.6, 0.245], gap: 0.075, eye: '255,166,40', defeat: 'poof', color: '#5d8f3a', tip: [0.86, 0.8] },
    slinger: { eyes: [0.62, 0.26], gap: 0.075, eye: '255,190,50', defeat: 'poof', color: '#7f9a3a', tip: [0.06, 0.47] },
    sporecap: { eyes: [0.545, 0.365], gap: 0.15, eye: '255,210,90', defeat: 'spores', color: '#8a5cc4' },
    mimic: { eyes: [0.5, 0.3], gap: 0.25, eye: '255,226,110', defeat: 'poof', color: '#8a5a2a' },
    gloamwing: {
      eyes: [0.67, 0.37], gap: 0.085, eye: '140,226,255', gloom: true, defeat: 'boss', color: '#3b2a6a',
      spots: [[0.21, 0.17], [0.28, 0.4], [0.27, 0.72], [0.88, 0.3], [0.85, 0.49], [0.82, 0.73], [0.64, 0.52]],
    },
    // Chapter 2 (Phase 2), measured on the accepted art with qa/harness/measure.html (a 10% grid, so
    // about 0.02 precision). smoke = the puff colors a summon of this monster swirls in; rim = the
    // violet outline for dark-on-dark figures; flying = floats and flutters; mouth = where vines,
    // breath and gobbled flames come from; belly = the dragon's glowing tummy.
    greyling: { eyes: [0.64, 0.52], gap: 0.24, eye: '240,240,255', defeat: 'smudge', color: '#8a8a98', smoke: ['120,120,138', '88,88,104'], rim: true },
    chillbat: { eyes: [0.59, 0.5], gap: 0.14, eye: '120,220,255', defeat: 'frost', color: '#8fd4ff', flying: true },
    frostcub: { eyes: [0.575, 0.27], gap: 0.11, eye: '110,200,255', defeat: 'frost', color: '#e8f4ff', tip: [0.15, 0.17] },
    'magma-blob': { eyes: [0.67, 0.45], gap: 0.22, eye: '255,210,120', defeat: 'blob', color: '#ff7a3a' },
    blobbit: { eyes: [0.67, 0.45], gap: 0.22, eye: '255,210,120', defeat: 'blob', color: '#ff9a5a' },
    clanker: { eyes: [0.57, 0.19], gap: 0.14, eye: '255,160,60', defeat: 'clank', color: '#c8903a' },
    'vine-snapper': { eyes: [0.615, 0.11], gap: 0.13, eye: '220,240,120', defeat: 'petals', color: '#5fbf4a', mouth: [0.62, 0.3] },
    starwisp: { eyes: [0.51, 0.36], gap: 0.18, eye: '240,220,255', defeat: 'twinkle', color: '#c9a0ff', flying: true, tip: [0.85, 0.47] },
    // Pebblebelly faces right: head top right, open mouth beside it, the rainbow belly low center.
    'color-dragon': { eyes: [0.7, 0.2], gap: 0.08, eye: '255,235,170', defeat: 'dragon', color: '#8c8ca0', dragon: true,
      mouth: [0.83, 0.26], belly: [0.6, 0.66] },
  };
  // Action poses: '<art>-attack' (a lunge, shot or spell) and 'hero-<id>-down' (sitting and
  // dazed, stars painted in). Every file is trimmed to 512 px tall, so each pose has its own
  // height against the idle figure (h, matched by head and body on art/board.html). ax = where the
  // feet are across the picture, so the figure doesn't jump sideways; lantern and tip are the
  // LOOKS spots for this picture. Missing entries mean h 1 (0.74 for down) and ax 0.5.
  const POSES = {
    'hero-knight-attack': { lantern: [0.667, 0.52], tip: [0.95, 0.53] },
    'hero-knight-down': { h: 0.74, lantern: [0.563, 0.674] },
    'hero-ranger-attack': { ax: 0.45, lantern: [0.456, 0.537], tip: [0.97, 0.25] },
    'hero-ranger-down': { h: 0.74, lantern: [0.7, 0.73] },
    'hero-wizard-attack': { ax: 0.45, lantern: [0.432, 0.478], tip: [0.836, 0.127] },
    'hero-wizard-down': { h: 0.74, ax: 0.55, lantern: [0.424, 0.752] },
    'hero-lightbringer-attack': { h: 1.28, ax: 0.52, lantern: [0.238, 0.107], tip: [0.238, 0.107] },
    'hero-lightbringer-down': { h: 0.8, lantern: [0.187, 0.8] },
    'monster-slinger-attack': { tip: [0.93, 0.13] },
    'monster-sporecap-attack': { ax: 0.4 },
    // Chapter 2 poses whose shape changes (measured on qa/harness/measure.html): the Starwisp's
    // bolt extends to the right of its body, the Magma Blob squashes long and low, the Chillbat
    // folds its wings, the Frostcub winds up with the snowball in its right hand.
    'monster-starwisp-attack': { ax: 0.35, tip: [0.9, 0.5] },
    'monster-magma-blob-attack': { ax: 0.42 },
    'monster-chillbat-attack': { ax: 0.55 },
    'monster-frostcub-attack': { ax: 0.5, tip: [0.86, 0.3] },
  };
  const RIM_RGB = '#a27bff'; // the violet rim light on shadow monsters

  // Floating text styles. Sizes are painting pixels.
  const TEXT = {
    dmg: { size: 54, fill: '#ff8a76', fill2: '#e0281c', outline: '#2a0808', rise: 66, life: 1050, pop: 0.3, font: FX.NUM_FONT },
    critdmg: { size: 74, fill: '#fff09a', fill2: '#ff7426', outline: '#3a1004', rise: 84, life: 1350, pop: 0.2, glow: '255,170,60', font: FX.NUM_FONT },
    crit: { size: 66, fill: '#fff6b8', fill2: '#ffb21e', outline: '#3a1a02', rise: 46, life: 1550, pop: 2.4, glow: '255,200,80', dy: -96 },
    heal: { size: 54, fill: '#c8ffd2', fill2: '#3ad866', outline: '#062a12', rise: 66, life: 1150, pop: 0.3, font: FX.NUM_FONT },
    miss: { size: 44, fill: '#f0f0f6', fill2: '#9a9cb0', outline: '#1a1a26', rise: 48, life: 1050, pop: 0.3 },
    gold: { size: 40, fill: '#fff2a8', fill2: '#ffbe2e', outline: '#3a2402', rise: 74, life: 1350, pop: 0.3, font: FX.NUM_FONT },
    ability: { size: 40, fill: '#fff6cc', fill2: '#ffc94a', outline: '#2a1606', rise: 52, life: 1500, pop: 0.4, glow: '255,210,120', dy: -30 },
    alert: { size: 64, fill: '#fff3a0', fill2: '#ffb21e', outline: '#2a1600', rise: 30, life: 900, pop: 0.2 },
    status: { size: 36, fill: '#efe2ff', fill2: '#b48cff', outline: '#1a1030', rise: 44, life: 1350, pop: 0.4 },
    up: { size: 40, fill: '#fff8c0', fill2: '#8dff9e', outline: '#10240e', rise: 54, life: 1350, pop: 0.4, glow: '255,230,140' },
    info: { size: 36, fill: '#ffffff', outline: '#151020', rise: 40, life: 1300, pop: 0.5 },
  };
  // '' = no label (Shield Wall already announced itself as an ability).
  const STATUS_LABEL = { sleepy: 'Sleepy!', shield: '', 'shield-wall': '', feather: 'Bouncy!', 'feather-charm': 'Bouncy!',
    'bright-oil': 'Brighter!', frozen: 'Frozen!', chilled: 'Chilled!' };
  // Same-type events in a row play together, each starting this many ms after the last.
  const GROUP = { damage: 110, heal: 90, push: 0, defeated: 140, light: 260, status: 60, spotted: 120 };

  function create(canvas, opts) {
    opts = opts || {};
    const L = opts.layout || G.LB_LAYOUT;
    const data = opts.data || G.LB_DATA || {};
    const ART = opts.art || G.LB_ART || {};
    const rules = opts.rules || G.LB_RULES || null;
    const artBase = opts.artBase || '';
    if (!canvas || !canvas.getContext || !L) throw new Error('LB_BOARD.create needs a canvas and LB_LAYOUT');
    const ctx = canvas.getContext('2d');
    const W = L.W;
    const H = L.H;
    const CW = L.cellW;
    const CH = L.cellH;
    const COLS = L.COLS;
    const ROWS = L.ROWS;
    const FX0 = L.FLOOR.x0 * W;
    const FY0 = L.FLOOR.y0 * H;

    const clock = new FX.Clock();
    const parts = new FX.Particles(opts.maxParticles || 700);
    const floaters = new FX.Floaters();
    const shake = new FX.Shake();

    // Everything the board knows. Units and props are its own animated copies of the state.
    const S = {
      state: null, roomId: null, room: null,
      units: new Map(), props: new Map(),
      opt: null, activeId: null, area: null, hover: null, optT0: 0,
      speed: 1, reduced: false, paused: false,
      dark: FULL_DARK, darkGoal: FULL_DARK, darkBoost: 0, lift: null,
      peek: '', // 'on': a new room shows its lit painting; 'out': the darkness creeps back in (ux #8)
      temps: [], fx: [], wash: 0, flash: 0, flashRgb: '255,255,255', curtain: 0,
      playing: 0, queue: Promise.resolve(), hooks: null, pending: null, lastBy: null, lastDefeat: null,
      taps: [], rulesGrid: null, rulesAt: -1e9, gustAt: -1e9,
      lit: new Float32Array(COLS * ROWS), model: new Uint8Array(COLS * ROWS), corr: new Float32Array(COLS * ROWS),
      // Colored light per square (Chapter 2): NCOL amounts per cell, eased toward colGoal.
      col: new Float32Array(COLS * ROWS * NCOL), colGoal: new Float32Array(COLS * ROWS * NCOL), rulesColors: null,
      t: 0, last: 0, destroyed: false,
    };
    let view = { cssW: 0, cssH: 0, dpr: 1, s: 1, ox: 0, oy: 0, k: 1 };

    // ------------------------------------------------------------ colored flames (Chapter 2)
    // A flame color's hex, 'r,g,b' and flame palette, from data.flames or the plan's defaults.
    function flameHex(color) {
      if (!color) return null;
      const f = data.flames && data.flames[color];
      return (f && f.hex) || FLAME_HEX[color] || null;
    }
    const flameRgb = (color) => {
      const hex = flameHex(color);
      return hex ? FX.rgbOf(hex) : null;
    };
    const flamePal = (color) => FX.flamePalette(flameHex(color));
    const isColor = (v) => typeof v === 'string' && COLOR_IDX[v] != null && !!flameHex(v);
    // The hero's lantern tint, whatever field the rules keep it in.
    function tintOf(src) {
      if (!src) return null;
      for (const v of [src.tint, src.tintColor, src.lanternColor, src.status && src.status.tint]) if (isColor(v)) return v;
      return null;
    }

    // ------------------------------------------------------------ art
    const images = {};
    let staticCv = null;
    let staticKey = '';
    function image(id) {
      if (!id) return null;
      let rec = images[id];
      if (!rec) {
        rec = images[id] = { ok: false, failed: false, img: null };
        const meta = ART[id];
        if (meta && meta.src && typeof Image !== 'undefined') {
          const img = new Image();
          img.onload = () => {
            rec.ok = true;
            rec.img = img;
          };
          img.onerror = () => { rec.failed = true; };
          img.src = artBase + meta.src;
        }
      }
      return rec.ok ? rec.img : null;
    }
    // Pictures are pre-scaled once to their on-screen size (sharp at any devicePixelRatio).
    let sprites = {};
    function sprite(id, hPaint) {
      const img = image(id);
      if (!img) return null;
      const hDev = Math.max(8, Math.round(hPaint * view.k));
      const key = id + '@' + hDev;
      let sp = sprites[key];
      if (!sp) {
        const wDev = Math.max(4, Math.round((hDev * img.naturalWidth) / img.naturalHeight));
        sp = sprites[key] = { cv: FX.scaled(img, wDev, hDev), w: wDev / view.k, h: hDev / view.k };
      }
      return sp;
    }
    // Hand-drawn stand-ins, cached the same way so flashes and greying work on them too.
    function drawn(key, wPaint, hPaint, paint) {
      const k = view.k;
      const full = key + '@' + Math.round(hPaint * k);
      let sp = sprites[full];
      if (!sp) {
        const cv = FX.canvas(wPaint * k, hPaint * k);
        const g = cv.getContext('2d');
        g.scale(k, k);
        paint(g, wPaint, hPaint);
        sp = sprites[full] = { cv, w: cv.width / k, h: cv.height / k };
      }
      return sp;
    }
    function variant(sp, kind) {
      if (!sp[kind]) {
        if (kind === 'grey') sp.grey = FX.greyed(sp.cv);
        else sp[kind] = FX.silhouette(sp.cv, kind === 'white' ? '#ffffff' : kind === 'red' ? '#ff3b2b' : kind === 'ice' ? '#9ad8ff' : '#070914');
      }
      return sp[kind];
    }
    // A soft halo hugging a sprite's outline with its inside cut away (drawn additively, so the
    // creature's own colours stay as painted): violet for shadow monsters, or the given 'r,g,b'
    // (the Color Dragon's glow). One halo is cached per color. pad is in painting pixels.
    function rimOf(sp, rgb) {
      const color = rgb ? `rgb(${rgb})` : RIM_RGB;
      sp.rims = sp.rims || {};
      if (sp.rims[color]) return sp.rims[color];
      const k = view.k;
      const pad = Math.max(3, Math.round(6 * k));
      const cv = FX.canvas(sp.cv.width + pad * 2, sp.cv.height + pad * 2);
      const g = cv.getContext('2d');
      const sil = FX.silhouette(sp.cv, color);
      g.filter = `blur(${Math.max(1, Math.round(pad * 0.4))}px)`;
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TAU;
        g.drawImage(sil, pad + Math.cos(ang) * pad * 0.5, pad + Math.sin(ang) * pad * 0.5);
      }
      g.filter = 'none';
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(sp.cv, pad, pad);
      sp.rims[color] = { cv, pad: pad / k };
      return sp.rims[color];
    }
    // Every action pose loads up front (a Mimic only appears mid-fight), so the first lunge or
    // fall already has its picture. Ids with no art are skipped by image().
    for (const book of [data.heroes, data.monsters]) {
      for (const def of Object.values(book || {})) {
        if (def && def.art) {
          image(def.art + '-attack');
          image(def.art + '-down');
        }
      }
    }

    // ------------------------------------------------------------ geometry
    const idx = (c, r) => r * COLS + c;
    const inGrid = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
    const key = (c, r) => c + ',' + r;
    function cellOf(v) {
      if (Array.isArray(v) && v.length >= 2 && isFinite(v[0]) && isFinite(v[1])) return [Math.round(v[0]), Math.round(v[1])];
      if (v && typeof v === 'object' && isFinite(v.c) && isFinite(v.r)) return [Math.round(v.c), Math.round(v.r)];
      return null;
    }
    function cellAt(x, y) {
      const c = Math.floor((x - FX0) / CW);
      const r = Math.floor((y - FY0) / CH);
      return inGrid(c, r) ? { c, r } : null;
    }
    // Where a unit stands. The boss hovers over the middle of its 2x2 block.
    function anchor(size, c, r) {
      if (size >= 2) return { x: FX0 + (c + 1) * CW, y: FY0 + (r + 2) * CH - CH * 0.2 };
      return L.footPoint(c, r);
    }
    const centerOf = (c, r) => ({ x: FX0 + (c + 0.5) * CW, y: FY0 + (r + 0.5) * CH });
    // A monster's data `scale` (a Blobbit is a Magma Blob at 0.65) shrinks the whole figure.
    function unitH(u) {
      const k = u.baseScale || 1;
      if (!u.boss) return UNIT_H * CH * k;
      const img = image(u.art);
      return BOSS_W * CW * k * (img ? img.naturalHeight / img.naturalWidth : u.look.dragon ? 0.85 : 0.9);
    }
    function unitW(u) {
      if (u.boss) return BOSS_W * CW * (u.baseScale || 1);
      const img = image(u.art);
      return img ? (unitH(u) * img.naturalWidth) / img.naturalHeight : unitH(u) * 0.56;
    }
    // Flying things float above their square: the boss high, bats and wisps a little (they're
    // painted in the air, claws and comet tails at the bottom, so they sit off the foot point).
    const hover = (u) => (u.boss ? CH * 0.22 : u.flying ? CH * 0.2 : 0);
    function headY(u) {
      const h = unitH(u) * (u.scale || 1);
      if (u.downAmt > 0.5) {
        // A painted sitting pose stands upright: its top (the dizzy stars) is the top of the figure.
        const dp = downPose(u);
        return dp ? u.y + u.oy - h * dp.h : u.y - h * 0.42;
      }
      return u.y + u.oy - u.hop - hover(u) - h;
    }
    function chestOf(u) {
      const dp = u.downAmt > 0.5 ? downPose(u) : null;
      const k = u.boss ? 0.5 : dp ? dp.h * 0.45 : u.downAmt > 0.5 ? 0.15 : 0.52;
      return { x: u.x + u.ox, y: u.y + u.oy - u.hop - hover(u) - unitH(u) * k };
    }
    const groundOf = (u) => ({ x: u.x + u.ox, y: u.boss ? u.y - CH * 0.38 : u.y });
    // Map a point inside a unit's picture (fractions, as painted) to the board, using how it was
    // last drawn (pose, flip, breathing, tilt).
    function spot(u, nx, ny) {
      const w = u.dw || unitW(u);
      const h = u.dh || unitH(u);
      const lx = (nx - (u.dax != null ? u.dax : 0.5)) * w * (u.dsx || 1) * (u.dflip || u.facing);
      const ly = (ny - 1) * h * (u.dsy || 1);
      const rot = u.drot || 0;
      const x0 = u.dx != null ? u.dx : u.x;
      const y0 = u.dy != null ? u.dy : u.y - hover(u);
      if (!rot) return { x: x0 + lx, y: y0 + ly };
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      return { x: x0 + lx * c - ly * s, y: y0 + lx * s + ly * c };
    }

    // ------------------------------------------------------------ the board's copy of the state
    const num = (...vals) => {
      for (const v of vals) if (typeof v === 'number' && isFinite(v)) return v;
      return 0;
    };
    function defOf(kind, type) {
      const book = kind === 'hero' ? data.heroes : data.monsters;
      return (book && book[type]) || {};
    }
    function makeUnit(kind, uid, type) {
      const def = defOf(kind, type);
      const look = LOOKS[type] || {};
      const boss = kind === 'monster' && (!!def.boss || (def.size || 1) >= 2);
      const art = def.art || (kind === 'hero' ? 'hero-' : boss ? 'boss-' : 'monster-') + type;
      // Start loading the action poses now, so the first lunge or fall already has its picture.
      image(art + '-attack');
      if (kind === 'hero') image(art + '-down');
      const traits = Array.isArray(def.traits) ? def.traits : [];
      const has = (name) => traits.indexOf(name) >= 0;
      return {
        uid, kind, type, def, look, boss, size: boss ? Math.max(2, def.size || 2) : 1, art, pose: '', poseUntil: 0,
        color: def.color || look.color || HERO_COLORS[type] || '#7a6a9a',
        letter: String(def.name || type || '?').charAt(0).toUpperCase(),
        baseScale: num(def.scale) > 0 ? num(def.scale) : 1,
        flying: !boss && kind === 'monster' && (has('flying') || !!look.flying),
        sneaky: kind === 'monster' && (has('sneaky') || type === 'greyling'),
        grabby: kind === 'monster' && (has('grabby') || !!def.grab),
        c: 0, r: 0, x: 0, y: 0, placed: false, facing: 1, hp: 1, maxHp: 1, hpShown: 1,
        down: false, downAmt: 0, alpha: 1, scale: 1, collapse: 0, reveal: 1, vis: true, spotted: false,
        flash: 0, tint: 0, glowHeal: 0, ox: 0, oy: 0, hop: 0, rot: 0, squash: 0,
        light: 2, lightR: null, status: {}, shield: false, dying: false, dim: 0, feed: 0, flapFast: 0,
        // Chapter 2: a crystal-tinted lantern (heroes) and the boss's glow color, each with a crossfade.
        lanternColor: null, lanternRgb: null, lanternPrev: null, lanternMix: 1,
        glowColor: null, glowRgb: null, glowPrev: null, glowMix: 1, glowPulse: 0, belly: 0,
        phase: rand() * TAU, blinkAt: 0, blinkEnd: 0, wispAcc: rand(), zAcc: rand(), flakeAcc: 0, // not rand(): keeps Chapter 1's idle phases exactly as before
      };
    }
    // Set a hero's lantern tint or the boss's glow; animate = crossfade from the old color.
    function setLantern(u, color, animate) {
      const rgb = flameRgb(color);
      if (!rgb) {
        u.lanternColor = u.lanternRgb = u.lanternPrev = null;
        u.lanternMix = 1;
        return Promise.resolve();
      }
      if (rgb === u.lanternRgb) return Promise.resolve();
      u.lanternPrev = animate ? u.lanternRgb : null;
      u.lanternColor = color;
      u.lanternRgb = rgb;
      u.lanternMix = animate ? 0 : 1;
      if (!animate) return Promise.resolve();
      return clock.tween(D(600), (v) => { u.lanternMix = v; }).then(() => { u.lanternPrev = null; });
    }
    function setGlow(u, color, animate) {
      const rgb = flameRgb(color);
      if (!rgb || rgb === u.glowRgb) return Promise.resolve();
      u.glowPrev = animate && u.glowRgb ? u.glowRgb : null;
      u.glowColor = color;
      u.glowRgb = rgb;
      u.glowMix = u.glowPrev ? 0 : 1;
      if (!u.glowPrev) return Promise.resolve();
      return clock.tween(D(700), (v) => { u.glowMix = v; }).then(() => { u.glowPrev = null; });
    }
    // The color a tinted lantern or glowing boss shows right now (mid-crossfade included).
    const lanternRgbOf = (u) => (u.lanternRgb ? FX.mixRgb(u.lanternPrev || u.lanternRgb, u.lanternRgb, u.lanternMix) : null);
    const glowRgbOf = (u) => (u.glowRgb ? FX.mixRgb(u.glowPrev || u.glowRgb, u.glowRgb, u.glowMix) : null);
    function placeUnit(u, c, r) {
      const a = anchor(u.size, c, r);
      u.c = c;
      u.r = r;
      u.x = a.x;
      u.y = a.y;
      u.placed = true;
    }
    function syncUnit(u, src) {
      const at = cellOf(src.at);
      if (at && (!u.placed || u.c !== at[0] || u.r !== at[1])) placeUnit(u, at[0], at[1]);
      u.maxHp = num(src.maxHp, src.hp, u.maxHp);
      u.hp = num(src.hp, u.hp);
      u.hpShown = u.hp;
      u.status = Object.assign({}, src.status || {});
      if (u.kind === 'hero') {
        u.down = !!src.down;
        u.downAmt = u.down ? 1 : 0;
        const l = num(src.light);
        u.light = l >= 1 ? l : num(u.def.light, 2);
        u.lightR = null;
        u.dimGoal = !!(src.moved && src.acted && !src.down);
        setLantern(u, tintOf(src), false);
      } else {
        u.spotted = !!src.spotted;
        // The boss's aura follows m.glow; before the rules set it, data's glow.start stands in.
        const glow = isColor(src.glow) ? src.glow : u.def.glow && u.def.glow.start;
        if (isColor(glow)) setGlow(u, glow, false);
      }
    }
    function makeProp(src, uid) {
      const def = (data.props && data.props[src.type]) || {};
      const at = cellOf(src.at) || [0, 0];
      const q = L.cellRect(at[0], at[1]);
      // rules.js doesn't copy `nudge` into state props, so look it up in the room's own list.
      const rp = S.room && (S.room.props || []).find((x) => x && x.type === src.type && sameCell(cellOf(x.at), at));
      const nudge = Array.isArray(src.nudge) ? src.nudge : rp && Array.isArray(rp.nudge) ? rp.nudge : [0, 0];
      const brazier = src.type === 'brazier';
      // A colored brazier (Chapter 2): the placement's color, looked up like nudge when the rules
      // don't copy it. Its own painting (colorArt) is tried first, then the gold brazier's.
      const color = brazier ? (isColor(src.color) ? src.color : rp && isColor(rp.color) ? rp.color : null) : null;
      const art = def.art || 'prop-' + src.type;
      const colorArt = color ? (def.colorArt && def.colorArt[color]) || 'prop-brazier-' + color : null;
      const pal = color ? flamePal(color) : null;
      return {
        uid, type: src.type, def, c: at[0], r: at[1], brazier,
        x: q.x + q.w / 2 + num(nudge[0]) * CW, y: q.y + q.h * 0.9 + num(nudge[1]) * CH,
        sortY: q.y + q.h * 0.62 + num(nudge[1]) * CH,
        art, arts: colorArt && ART[colorArt] ? [colorArt, art] : [art], openArt: def.openArt || null, h: num(def.height, 1) * CH,
        lightR: brazier ? num(def.light, 4) : 0, lit: !!src.lit, litAmt: src.lit ? 1 : 0, bloom: 0, flare: 0,
        opened: !!src.opened, shake: 0, seed: rand() * 100, emberAcc: 0, openT: -1e9,
        glow: def.glow ? FX.rgbOf(def.glow) : null,
        color, hex: color ? flameHex(color) : null, rgb: pal ? pal.rgb : null, pal, colorIdx: color ? COLOR_IDX[color] : -1,
      };
    }
    const roomOf = (id) => (data.rooms || []).find((r) => r && r.id === id) || null;
    function sameCell(a, b) { return a && b && a[0] === b[0] && a[1] === b[1]; }
    function mimicAwake(st, at) {
      return (st.monsters || []).some((m) => m && m.type === 'mimic' && m.hp > 0 && sameCell(cellOf(m.at), at));
    }
    // Rebuild the board's copy from the state. fresh = a new scene (no carry-over).
    function sync(fresh) {
      const st = S.state;
      if (!st) return;
      if (st.roomId !== S.roomId) {
        S.roomId = st.roomId;
        S.room = roomOf(st.roomId);
        S.units.clear();
        S.props.clear();
        S.temps = [];
        S.fx = [];
        S.lift = null;
        parts.clear();
        floaters.clear();
        staticKey = '';
        fresh = true;
      }
      const seen = new Set();
      const heroes = st.heroes || {};
      for (const id of Object.keys(heroes)) {
        const h = heroes[id];
        if (!h || !cellOf(h.at)) continue;
        seen.add(id);
        let u = S.units.get(id);
        if (!u) S.units.set(id, (u = makeUnit('hero', id, h.type || id)));
        syncUnit(u, h);
      }
      for (const m of st.monsters || []) {
        if (!m || !m.uid || !cellOf(m.at) || !(m.hp > 0) || m.defeated || m.gone) continue;
        seen.add(m.uid);
        let u = S.units.get(m.uid);
        if (!u) S.units.set(m.uid, (u = makeUnit('monster', m.uid, m.type)));
        syncUnit(u, m);
      }
      for (const uid of [...S.units.keys()]) if (!seen.has(uid)) S.units.delete(uid);
      // A cleared room keeps every brazier blazing, even if the rules leave some unlit.
      const calm = st.status === 'cleared' || st.status === 'victory';
      const seenP = new Set();
      (st.props || []).forEach((src, i) => {
        const at = src && cellOf(src.at);
        if (!at || src.gone || src.removed) return;
        if (src.mimic && (src.revealed || src.opened || mimicAwake(st, at))) return;
        const uid = src.uid || `p${i}`;
        seenP.add(uid);
        let p = S.props.get(uid);
        if (!p || p.type !== src.type) S.props.set(uid, (p = makeProp(src, uid)));
        p.lit = !!src.lit || (calm && p.brazier);
        p.litAmt = p.lit ? 1 : 0;
        if (src.opened && !p.opened) p.openT = clock.now;
        p.opened = !!src.opened;
      });
      for (const uid of [...S.props.keys()]) if (!seenP.has(uid)) S.props.delete(uid);
      S.spores = /grotto/.test(S.roomId || '') || [...S.props.values()].some((p) => p.type === 'mushrooms');
      S.darkGoal = calm || S.peek === 'on' ? CLEAR_DARK : st.status === 'partyDown' ? 0.93 : FULL_DARK;
      if (calm) for (const p of S.props.values()) if (isHeart(p) && st.status === 'victory') heartOn(p, 1);
      S.rulesAt = -1e9;
      S.print = printOf(st);
      S.agree = true;
      modelGrid();
      if (fresh) {
        S.dark = S.darkGoal;
        faceDefaults();
        refreshVisibility(true);
        S.lit.fill(0);
        S.corr.fill(0);
        S.colSnap = true; // the colored light is simply there in a new scene, no fade-in
      }
    }
    // The great lantern at the back of a boss room: Chapter 1's Heart Lantern or Chapter 2's Prism Heart.
    const isHeart = (p) => p.type === 'heart-lantern' || p.type === 'prism-heart';
    function heartOn(p, amt) {
      p.lightR = 6;
      p.lit = true;
      p.litAmt = amt;
    }
    function faceDefaults() {
      const all = [...S.units.values()];
      for (const u of all) {
        let best = null;
        let bd = 1e9;
        for (const o of all) {
          if (o.kind === u.kind) continue;
          const d = Math.abs(o.x - u.x) + Math.abs(o.y - u.y) * 0.6;
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
        if (best && Math.abs(best.x - u.x) > 4) u.facing = best.x > u.x ? 1 : -1;
        else u.facing = u.kind === 'hero' ? 1 : -1;
      }
    }
    function faceTo(u, x) {
      if (!u || u.downAmt > 0.5) return;
      if (Math.abs(x - u.x) > 4) u.facing = x > u.x ? 1 : -1;
    }

    // ------------------------------------------------------------ light
    // Hole stamps: [shape exponent, solid inner fraction]. A lantern pool is a rounded square,
    // because the rules count light in squares (diagonals count as 1).
    const STAMP = { lantern: [3, 0.34], brazier: [2.4, 0.5], cell: [4, 0.42], flood: [2, 0.55] };
    const stamps = {};
    const stamp = (name) => stamps[name] || (stamps[name] = FX.hole(STAMP[name][0], STAMP[name][1]));

    // This frame's light sources. rx/ry are stamp radii in painting pixels, a its strength.
    function sources() {
      const out = [];
      const t = S.t;
      for (const u of S.units.values()) {
        if (u.kind !== 'hero' || u.alpha < 0.05) continue;
        const f = FX.flicker(t, u.phase);
        const rad = (u.lightR != null ? u.lightR : u.light) + 1.05;
        const k = 1 + 0.035 * f;
        out.push({ x: u.x + u.ox, y: u.y + u.oy - CH * 0.15, rx: rad * CW * k, ry: rad * CH * k,
          a: (u.downAmt > 0.5 ? 0.8 : 0.9) + 0.04 * f, st: 'lantern' });
      }
      for (const p of S.props.values()) {
        if (!p.lightR || p.litAmt <= 0.001) continue;
        const f = FX.flicker(t * 1.3, p.seed);
        const rad = (p.lightR + 1.25) * p.litAmt * (1 + p.bloom) * (1 + 0.03 * f);
        out.push({ x: p.x, y: p.y - CH * 0.38, rx: rad * CW, ry: rad * CH, a: Math.min(1, p.litAmt * 1.5) * (0.97 + 0.03 * f), st: 'brazier' });
      }
      for (const tl of S.temps) {
        if (tl.amt > 0.001) out.push({ x: tl.x, y: tl.y, rx: tl.rad * CW, ry: tl.rad * CH, a: tl.amt, st: 'brazier' });
      }
      // Gloamwing shines in its own eerie light, so the boss fight opens on the moth, not a dark
      // smudge (ux #7). Only the picture: the rules' light (who can be seen and hit) is unchanged.
      for (const u of S.units.values()) {
        if (!u.boss || u.dying || u.alpha < 0.05 || u.reveal < 0.05) continue;
        const b = bossGlow(u);
        out.push({ x: b.x, y: b.y, rx: 2.5 * CW, ry: 2.2 * CH, a: (0.52 + 0.04 * FX.flicker(t * 0.7, u.phase)) * u.alpha * u.reveal, st: 'flood' });
      }
      return out;
    }
    // The middle of the moth as drawn (it hovers and bobs above its 2x2 squares).
    function bossGlow(u) {
      return { x: u.x + u.ox, y: u.y + u.oy - u.hop - hover(u) - unitH(u) * 0.5 };
    }
    function mark(g, c0, r0, R, v) {
      for (let r = Math.max(0, r0 - R); r <= Math.min(ROWS - 1, r0 + R); r++) {
        for (let c = Math.max(0, c0 - R); c <= Math.min(COLS - 1, c0 + R); c++) if (g[idx(c, r)] < v) g[idx(c, r)] = v;
      }
    }
    // The board's own light map from what it is showing right now (used while animating).
    function modelGrid() {
      const g = S.model;
      g.fill(0);
      for (const u of S.units.values()) {
        if (u.kind === 'hero' && u.alpha > 0.05) mark(g, u.c, u.r, Math.round(u.lightR != null ? u.lightR : u.light), 1);
      }
      for (const p of S.props.values()) if (p.lightR && p.litAmt >= 0.95) mark(g, p.c, p.r, Math.round(p.lightR), 2);
      for (const tl of S.temps) {
        if (tl.cells && tl.amt > 0.3) for (const [c, r] of tl.cells) if (inGrid(c, r)) g[idx(c, r)] = 2;
      }
      return g;
    }
    // Colored light (Chapter 2). The board's own map while animating: each lit colored brazier
    // colors the squares within its light, and a crystal-tinted lantern colors the hero's.
    function markCol(g, c0, r0, R, k, v) {
      if (k < 0 || k >= NCOL) return;
      for (let r = Math.max(0, r0 - R); r <= Math.min(ROWS - 1, r0 + R); r++) {
        for (let c = Math.max(0, c0 - R); c <= Math.min(COLS - 1, c0 + R); c++) {
          const i = idx(c, r) * NCOL + k;
          if (g[i] < v) g[i] = v;
        }
      }
    }
    function modelColors() {
      const g = S.colGoal;
      g.fill(0);
      for (const p of S.props.values()) {
        if (p.colorIdx >= 0 && p.lightR && p.litAmt > 0.001) markCol(g, p.c, p.r, Math.round(p.lightR), p.colorIdx, Math.min(1, p.litAmt * 1.25));
      }
      for (const u of S.units.values()) {
        if (u.kind !== 'hero' || !u.lanternColor || u.alpha < 0.05) continue;
        markCol(g, u.c, u.r, Math.round(u.lightR != null ? u.lightR : u.light), COLOR_IDX[u.lanternColor], 1);
      }
      return g;
    }
    // The rules' color map (LB_RULES.colors: a 12x7 grid of color-name lists), read while idle.
    function readRulesColors() {
      if (!rules || typeof rules.colors !== 'function' || !S.state) return null;
      try {
        const m = rules.colors(S.state);
        if (!Array.isArray(m) || !m.length) return null;
        let at = null;
        if (m.length === COLS && Array.isArray(m[0]) && m[0].length === ROWS) at = (c, r) => m[c][r];
        else if (m.length === ROWS && Array.isArray(m[0]) && m[0].length === COLS) at = (c, r) => m[r][c];
        else if (m.length === COLS * ROWS) at = (c, r) => m[idx(c, r)];
        if (!at) return null;
        const out = new Float32Array(COLS * ROWS * NCOL);
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const list = at(c, r);
            if (!Array.isArray(list)) continue;
            for (const name of list) if (COLOR_IDX[name] != null) out[idx(c, r) * NCOL + COLOR_IDX[name]] = 1;
          }
        }
        return out;
      } catch (err) {
        return null;
      }
    }
    // The rules' light map, read while idle so the board shows exactly what the rules see.
    function readRules() {
      if (!rules || typeof rules.light !== 'function' || !S.state) return null;
      try {
        const m = rules.light(S.state);
        if (!m || !m.length) return null;
        let at = null;
        if (m.length === ROWS && Array.isArray(m[0])) at = (c, r) => m[r][c];
        else if (m.length === COLS && Array.isArray(m[0])) at = (c, r) => m[c][r];
        else if (m.length === COLS * ROWS) at = (c, r) => m[idx(c, r)];
        if (!at) return null;
        const out = new Uint8Array(COLS * ROWS);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) out[idx(c, r)] = clamp(Number(at(c, r)) | 0, 0, 2);
        return out;
      } catch (err) {
        return null;
      }
    }
    // How much the light pools already clear the darkness at a square's center (0..1).
    function coverage(src, c, r) {
      const p = centerOf(c, r);
      let keep = 1;
      for (const s of src) {
        const dx = Math.abs(p.x - s.x) / s.rx;
        const dy = Math.abs(p.y - s.y) / s.ry;
        if (dx >= 1 || dy >= 1) continue;
        const [pe, inner] = STAMP[s.st];
        const d = Math.pow(Math.pow(dx, pe) + Math.pow(dy, pe), 1 / pe);
        keep *= 1 - (1 - smoothstep(inner, 1, d)) * s.a;
      }
      return 1 - keep;
    }
    // A cheap fingerprint of what the board shows. If the rules have changed the state since the
    // board last read it (events not played yet), the board trusts its own picture, not the rules.
    function printOf(st) {
      let s = (st.status || '') + '|' + (st.roomId || '') + '|';
      const hs = st.heroes || {};
      for (const id in hs) {
        const h = hs[id];
        if (h) s += id + (h.at || '') + (h.down ? 'd' : '') + h.light + ';';
      }
      for (const m of st.monsters || []) if (m) s += m.uid + (m.at || '') + m.hp + (m.spotted ? 's' : '') + (m.glow || '') + ';';
      for (const p of st.props || []) if (p) s += (p.uid || '') + (p.lit ? 'L' : '') + (p.opened ? 'O' : '') + ';';
      for (const id in hs) if (hs[id]) s += tintOf(hs[id]) || '';
      return s + (st.flares || []).length;
    }
    function updateLight(dt) {
      const model = modelGrid();
      let target = model;
      let colTarget = null;
      if (!S.playing && rules && S.state) {
        if (clock.now - S.rulesAt > 250) {
          S.agree = printOf(S.state) === S.print;
          S.rulesGrid = S.agree ? readRules() : null;
          S.rulesColors = S.agree ? readRulesColors() : null;
          S.rulesAt = clock.now;
          refreshVisibility(false);
        }
        if (S.rulesGrid) target = S.rulesGrid;
        if (S.rulesColors) colTarget = S.rulesColors;
      } else {
        S.agree = false;
        refreshVisibility(false);
      }
      if (!colTarget) colTarget = modelColors();
      const src = sources();
      S.src = src;
      const k1 = Math.min(1, dt / 160);
      const k2 = Math.min(1, dt / 240);
      const kc = S.colSnap ? 1 : Math.min(1, dt / 220);
      S.colSnap = false;
      S.colAny = false;
      for (let i = 0; i < S.col.length; i++) {
        S.col[i] += (colTarget[i] - S.col[i]) * kc;
        if (S.col[i] > 0.01) S.colAny = true;
      }
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const i = idx(c, r);
          const lvl = target[i];
          S.lit[i] += ((lvl >= 2 ? 1 : lvl >= 1 ? 0.8 : 0) - S.lit[i]) * k1;
          // Top up squares the rules call lit where a round pool's corner leaves them dim.
          const want = lvl >= 2 ? 0.9 : lvl >= 1 ? 0.6 : 0;
          let goal = 0;
          if (want > 0) {
            const cov = coverage(src, c, r);
            goal = cov >= want ? 0 : 1 - (1 - want) / Math.max(0.001, 1 - cov);
          }
          S.corr[i] += (goal - S.corr[i]) * k2;
        }
      }
    }
    // 0..1 brightness for dust motes and the highlight glow.
    function lightAt(x, y) {
      if (S.dark < 0.3) return 1;
      const c = clamp(Math.floor((x - FX0) / CW), 0, COLS - 1);
      const r = clamp(Math.floor((y - FY0) / CH), 0, ROWS - 1);
      return S.lit[idx(c, r)];
    }
    function visibleNow(u, useRules) {
      if (u.kind !== 'monster' || u.forceShow) return true;
      // A bright room shows everyone, except during a new room's peek: monsters stay hidden then.
      if (S.dark < 0.3 && !S.peek) return true;
      if (useRules && rules && typeof rules.visible === 'function' && S.state) {
        try {
          return !!rules.visible(S.state, u.uid);
        } catch (err) { /* fall back to the board's own map */ }
      }
      if (u.spotted) return true;
      // A sneaky Greyling shows only in bright brazier light; lantern light alone doesn't reveal it.
      const need = u.sneaky ? 2 : 1;
      for (let r = u.r; r < u.r + u.size; r++) {
        for (let c = u.c; c < u.c + u.size; c++) if (inGrid(c, r) && S.model[idx(c, r)] >= need) return true;
      }
      return false;
    }
    function refreshVisibility(snap) {
      const useRules = !S.playing && !!S.agree;
      for (const u of S.units.values()) {
        u.vis = visibleNow(u, useRules);
        if (snap) u.reveal = u.vis ? 1 : 0;
      }
    }

    // ------------------------------------------------------------ size and the static layer
    // Sharp at devicePixelRatio, but capped near 4.5 megapixels: the paintings are 1536 wide, so
    // a bigger backing store adds no detail, only work (it matters on machines without GPU canvas).
    const MAX_PIXELS = 4.5e6;
    function resize() {
      // A hidden canvas (display: none) has no size; keep the last one until it shows again.
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (cssW < 2 || cssH < 2) return;
      const dpr = Math.max(1, Math.min(3, G.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (cssW * cssH))));
      const pw = Math.round(cssW * dpr);
      const ph = Math.round(cssH * dpr);
      if (canvas.width !== pw) canvas.width = pw;
      if (canvas.height !== ph) canvas.height = ph;
      const s = Math.min(cssW / W, cssH / H);
      const k = s * dpr;
      if (Math.abs(k - view.k) > 1e-6) {
        sprites = {};
        staticKey = '';
      }
      view = { cssW, cssH, dpr, s, k, ox: (cssW - W * s) / 2, oy: (cssH - H * s) / 2 };
    }
    let roomPh = null;
    let roomPhKey = null;
    function placeholderRoom() {
      if (roomPh && roomPhKey === S.roomId) return roomPh;
      roomPhKey = S.roomId;
      const arches = ((S.room && S.room.exits) || []).map((x) => x && x.arch).filter(Boolean);
      roomPh = FX.stoneRoom(L, arches.length ? arches : ['center'], S.roomId || 'room');
      return roomPh;
    }
    // The room painting (or stone tiles) plus a faint square grid, pre-scaled to the screen. If a
    // fully lit copy of the painting exists (room-<id>-lit), it is prepared too (see drawLitPainting).
    let staticLit = null;
    function buildStatic() {
      const id = (S.room && S.room.art) || (S.roomId ? 'room-' + S.roomId : null);
      const img = image(id);
      const lit = id ? image(id + '-lit') : null;
      const k = view.k;
      const want = `${id}|${k}|${img ? 1 : 0}|${lit ? 1 : 0}`;
      if (staticCv && staticKey === want) return;
      staticKey = want;
      staticCv = paintStatic(img);
      staticLit = img && lit ? paintStatic(lit) : null;
    }
    function paintStatic(img) {
      const k = view.k;
      const cv = FX.canvas(W * k, H * k);
      const g = cv.getContext('2d');
      g.imageSmoothingQuality = 'high';
      if (img) g.drawImage(FX.scaled(img, cv.width, cv.height), 0, 0);
      else g.drawImage(placeholderRoom(), 0, 0, cv.width, cv.height);
      g.setTransform(k, 0, 0, k, 0, 0);
      g.strokeStyle = 'rgba(255,236,200,0.075)';
      g.lineWidth = 1.5;
      g.beginPath();
      for (let c = 0; c <= COLS; c++) {
        g.moveTo(FX0 + c * CW, FY0);
        g.lineTo(FX0 + c * CW, FY0 + ROWS * CH);
      }
      for (let r = 0; r <= ROWS; r++) {
        g.moveTo(FX0, FY0 + r * CH);
        g.lineTo(FX0 + COLS * CW, FY0 + r * CH);
      }
      g.stroke();
      return cv;
    }

    // ------------------------------------------------------------ options (what you can do now)
    function isHeroId(id) {
      return !!(S.state && S.state.heroes && S.state.heroes[id]) || (S.units.get(id) || {}).kind === 'hero';
    }
    function addAims(o, cells, id, radius) {
      if (!Array.isArray(cells)) return;
      for (const v of cells) {
        const at = cellOf(v);
        if (at && inGrid(at[0], at[1])) o.aims.set(key(at[0], at[1]), { at, id, radius });
      }
    }
    function showOptions(opts, heroId) {
      const o = { moves: new Map(), targets: new Map(), marks: new Map(), aims: new Map(), effect: null, focus: false };
      const moves = (opts && Array.isArray(opts.moves) && opts.moves) || [];
      const actions = ((opts && opts.actions) || []).filter((a) => a && a.kind !== 'wait');
      // A single action with no moves means the player picked it, so its aim squares show.
      o.focus = moves.length === 0 && actions.length === 1;
      for (const m of moves) {
        const at = m && cellOf(m.at);
        if (at) o.moves.set(key(at[0], at[1]), { at, path: (m.path || []).map(cellOf).filter(Boolean) });
      }
      for (const a of actions) {
        const list = Array.isArray(a.targets) ? a.targets : [];
        if (a.kind === 'attack') {
          for (const t of list) o.targets.set(t, 'attack');
        } else if (a.kind === 'ability') {
          for (const t of list) {
            if (isHeroId(t)) o.marks.set(t, 'heal');
            else o.targets.set(t, 'attack');
          }
          // Fireburst lists the squares it can aim at (with a radius); Sunburst lists what it touches.
          if (o.focus && a.radius != null) addAims(o, a.area, a.id, a.radius);
          else if (o.focus && Array.isArray(a.area)) o.effect = a.area.map(cellOf).filter((v) => v && inGrid(v[0], v[1]));
        } else if (a.kind === 'mend') {
          for (const t of list) o.marks.set(t, 'heal');
        } else if (a.kind === 'help') {
          for (const t of a.heroes || list) o.marks.set(t, 'help');
        } else if (a.kind === 'light' || a.kind === 'open') {
          for (const p of a.props || list) o.marks.set(p, a.kind);
        } else if (a.kind === 'item' && o.focus) {
          if (Array.isArray(a.area)) addAims(o, a.area, a.item, a.radius);
          for (const t of list) {
            if (typeof t !== 'string') addAims(o, [t], a.item, a.radius);
            else if (isHeroId(t)) o.marks.set(t, 'heal');
            else o.targets.set(t, 'attack');
          }
        }
      }
      S.opt = o;
      S.activeId = heroId || null;
      S.optT0 = clock.now;
    }
    function clearOptions() {
      S.opt = null;
      S.activeId = null;
      S.area = null;
    }
    function previewArea(cells) {
      const list = (Array.isArray(cells) ? cells : []).map(cellOf).filter((v) => v && inGrid(v[0], v[1]));
      S.area = list.length ? list : null;
    }
    function aimRadius(id) {
      for (const h of Object.values(data.heroes || {})) if (h && h.ability && h.ability.id === id) return num(h.ability.radius, 1);
      const it = data.items && data.items[id];
      return it ? num(it.radius, 0) : 1;
    }
    function areaAround(c, r, R) {
      const out = [];
      for (let y = r - R; y <= r + R; y++) for (let x = c - R; x <= c + R; x++) if (inGrid(x, y)) out.push([x, y]);
      return out;
    }
    function hoverMove() {
      if (!S.opt || !S.hover) return null;
      return S.opt.moves.get(key(S.hover.c, S.hover.r)) || null;
    }
    function hoverArea() {
      if (!S.opt || !S.hover) return null;
      const aim = S.opt.aims.get(key(S.hover.c, S.hover.r));
      return aim ? areaAround(aim.at[0], aim.at[1], aim.radius != null ? aim.radius : aimRadius(aim.id)) : null;
    }

    // ------------------------------------------------------------ floor marks (under the units)
    function square(g, at, a, hot, wave, fillRgb, lineRgb, dashed) {
      const q = L.cellRect(at[0], at[1]);
      const inset = 8 + (1 - a) * 18;
      FX.roundRect(g, q.x + inset, q.y + inset, q.w - inset * 2, q.h - inset * 2, 14);
      g.fillStyle = `rgba(${fillRgb},${clamp((hot ? 0.38 : 0.09 + 0.07 * wave) * a, 0, 1)})`;
      g.fill();
      g.lineWidth = hot ? 4.5 : 2.6;
      g.strokeStyle = `rgba(${lineRgb},${clamp((hot ? 1 : 0.42 + 0.26 * wave) * a, 0, 1)})`;
      if (dashed) g.setLineDash([10, 8]);
      g.stroke();
      if (dashed) g.setLineDash([]);
    }
    // An aim square (Fireburst, Firebomb, the Snow Globe) in rainbow light: a dark edge under a
    // thick, pulsing orange line and a deeper fill, so four colors of light can't wash it out
    // (polish-2). Rooms without colored light keep the thin square above.
    function aimSquare(g, at, hot, wave) {
      const q = L.cellRect(at[0], at[1]);
      FX.roundRect(g, q.x + 9, q.y + 9, q.w - 18, q.h - 18, 14);
      g.fillStyle = `rgba(110,34,4,${hot ? 0.5 : 0.3 + 0.08 * wave})`;
      g.fill();
      g.fillStyle = `rgba(255,150,60,${hot ? 0.34 : 0.14 + 0.1 * wave})`;
      g.fill();
      g.setLineDash([12, 8]);
      g.lineWidth = hot ? 10 : 8;
      g.strokeStyle = 'rgba(40,14,2,0.7)';
      g.stroke();
      g.lineWidth = hot ? 6 : 3.5 + 1.5 * wave;
      g.strokeStyle = `rgba(255,${hot ? 204 : 170},88,${hot ? 1 : 0.88 + 0.12 * wave})`;
      g.stroke();
      g.setLineDash([]);
    }
    function ellipseRing(g, x, y, rx, ry, rgb, t) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 5.5);
      g.fillStyle = `rgba(${rgb},${0.12 + 0.1 * pulse})`;
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, TAU);
      g.fill();
      const grow = 1 + 0.07 * pulse;
      g.lineWidth = 4;
      g.strokeStyle = `rgba(${rgb},${0.68 + 0.3 * pulse})`;
      g.beginPath();
      g.ellipse(x, y, rx * grow, ry * grow, 0, 0, TAU);
      g.stroke();
    }
    function footRing(g, u, rgb, t, k) {
      const gp = groundOf(u);
      ellipseRing(g, gp.x, gp.y, (u.boss ? 1.2 : 0.44) * CW * k, (u.boss ? 0.5 : 0.19) * CH * k, rgb, t);
    }
    function activeRing(g, u, t) {
      const gp = groundOf(u);
      const rx = 0.47 * CW;
      const ry = 0.2 * CH;
      ellipseRing(g, gp.x, gp.y, rx, ry, '255,214,96', t);
      const p = (t % 1.4) / 1.4;
      g.lineWidth = 3;
      g.strokeStyle = `rgba(255,226,140,${0.6 * (1 - p)})`;
      g.beginPath();
      g.ellipse(gp.x, gp.y, rx * (1 + p * 0.6), ry * (1 + p * 0.6), 0, 0, TAU);
      g.stroke();
    }
    function pathPreview(g, hero, mv) {
      let path = mv.path.slice();
      if (path.length && sameCell(path[0], [hero.c, hero.r])) path.shift();
      if (!path.length) path = [mv.at];
      const pts = [L.footPoint(hero.c, hero.r)].concat(path.map(([c, r]) => L.footPoint(c, r)));
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.setLineDash([1, 17]);
      g.lineDashOffset = -S.t * 36;
      g.strokeStyle = 'rgba(40,22,4,0.6)';
      g.lineWidth = 13;
      g.stroke();
      g.strokeStyle = 'rgba(255,232,150,0.98)';
      g.lineWidth = 8;
      g.stroke();
      g.setLineDash([]);
      g.restore();
    }
    function drawFloorMarks() {
      const t = S.t;
      const g = ctx;
      const o = S.opt;
      const hero = S.activeId ? S.units.get(S.activeId) : null;
      const hk = S.hover ? key(S.hover.c, S.hover.r) : '';
      if (o) {
        for (const [k2, m] of o.moves) {
          const d = hero ? Math.max(Math.abs(m.at[0] - hero.c), Math.abs(m.at[1] - hero.r)) : 1;
          const appear = clamp((clock.now - S.optT0 - d * 55) / 240, 0, 1);
          if (appear <= 0) continue;
          // Steady squares, no ripple; only the one under the pointer brightens (ux #11).
          square(g, m.at, ease.outBack(appear), k2 === hk, 0.6, '255,206,92', '255,226,140');
        }
        for (const [k2, aim] of o.aims) {
          const wave = 0.5 + 0.5 * Math.sin(t * 3 + aim.at[0]);
          if (S.colAny) aimSquare(g, aim.at, k2 === hk, wave);
          else square(g, aim.at, 1, k2 === hk, wave, '255,140,60', '255,176,96', true);
        }
        for (const at of o.effect || []) square(g, at, 1, false, 0.5 + 0.5 * Math.sin(t * 4), '255,214,110', '255,236,170');
      }
      const area = S.area || hoverArea();
      if (area) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 6);
        const rainbow = S.colAny; // colored light washes the preview out, so it gets a deeper fill and a dark edge
        let c0 = 99;
        let c1 = -1;
        let r0 = 99;
        let r1 = -1;
        for (const [c, r] of area) {
          const q = L.cellRect(c, r);
          g.fillStyle = `rgba(255,110,34,${0.27 + 0.1 * pulse + (rainbow ? 0.12 : 0)})`;
          g.fillRect(q.x + 2, q.y + 2, q.w - 4, q.h - 4);
          c0 = Math.min(c0, c);
          c1 = Math.max(c1, c);
          r0 = Math.min(r0, r);
          r1 = Math.max(r1, r);
        }
        if ((c1 - c0 + 1) * (r1 - r0 + 1) === area.length) {
          const a = L.cellRect(c0, r0);
          FX.roundRect(g, a.x + 2, a.y + 2, (c1 - c0 + 1) * CW - 4, (r1 - r0 + 1) * CH - 4, 12);
          if (rainbow) {
            g.lineWidth = 10;
            g.strokeStyle = 'rgba(40,14,2,0.7)';
            g.stroke();
          }
          g.lineWidth = 5;
          g.strokeStyle = `rgba(255,170,80,${0.7 + 0.3 * pulse})`;
          g.stroke();
        }
      }
      if (o) {
        for (const uid of o.targets.keys()) {
          const u = S.units.get(uid);
          if (u && u.reveal > 0.5 && !u.dying) footRing(g, u, '255,78,58', t, 1);
        }
        for (const [id, kind] of o.marks) {
          const u = S.units.get(id);
          if (u) footRing(g, u, kind === 'help' || kind === 'heal' ? '110,255,150' : '255,206,92', t, 0.9);
          const p = S.props.get(id);
          if (p) ellipseRing(g, p.x, p.y - CH * 0.1, CW * 0.5, CH * 0.21, '255,206,92', t);
        }
        const mv = hoverMove();
        if (mv && hero && !S.playing) pathPreview(g, hero, mv);
      }
      if (hero && !hero.dying) activeRing(g, hero, t);
      // The monster taking its go right now stands on a violet ring: gold for the party, violet
      // for the monsters (ux #4).
      const actor = S.acting ? S.units.get(S.acting) : null;
      if (actor && !actor.dying && actor.reveal > 0.5) footRing(g, actor, '169,133,255', t, 1.05);
    }
    function drawShadows() {
      const tex = FX.shadow();
      for (const p of S.props.values()) {
        const sp = propSprite(p);
        const rx = Math.min(sp.w, CW * 1.15) * 0.52;
        const ry = CH * 0.16;
        ctx.globalAlpha = 0.8;
        ctx.drawImage(tex, p.x - rx, p.y - ry * 1.15, rx * 2, ry * 2);
      }
      for (const u of S.units.values()) {
        const a = u.alpha * (u.kind === 'monster' ? u.reveal : 1);
        if (a < 0.02) continue;
        const gp = groundOf(u);
        const lift = u.hop + (u.boss ? CH * 0.5 : u.flying ? CH * 0.3 : 0);
        const k = 1 / (1 + lift / (CH * 1.6));
        const lying = u.downAmt;
        const rx = (u.boss ? 1.25 * CW : (0.36 + 0.22 * lying) * CW) * k;
        const ry = (u.boss ? 0.48 * CH : 0.13 * CH) * k;
        ctx.globalAlpha = a * 0.92;
        ctx.drawImage(tex, gp.x - rx, gp.y - ry, rx * 2, ry * 2);
      }
      ctx.globalAlpha = 1;
    }

    // ------------------------------------------------------------ props and units
    function propSprite(p) {
      if (p.opened && p.openArt && image(p.openArt)) {
        const osp = sprite(p.openArt, p.h);
        if (osp) return osp;
      }
      // A colored brazier tries its own painting first, then the gold brazier's (p.arts).
      for (const id of p.arts || [p.art]) {
        const sp = sprite(id, p.h);
        if (sp) return sp;
      }
      const hex = p.hex || null;
      return drawn('prop:' + p.type + (hex ? ':' + hex : ''), CW, p.h, (g, w, h) => FX.prop(g, p.type, w / 2, h, w, h, { color: hex }));
    }
    function firePos(p) {
      const sp = propSprite(p);
      return { x: p.x + p.shake, y: p.y - sp.h * 0.7 };
    }
    function drawProp(p) {
      const sp = propSprite(p);
      const x = p.x + p.shake;
      ctx.drawImage(sp.cv, x - sp.w / 2, p.y - sp.h, sp.w, sp.h);
      // No open-chest picture yet: dim the chest so it reads as already opened.
      if (p.opened && sp.cv !== (sprite(p.openArt, p.h) || {}).cv) {
        ctx.globalAlpha = 0.5;
        ctx.drawImage(variant(sp, 'dark'), x - sp.w / 2, p.y - sp.h, sp.w, sp.h);
        ctx.globalAlpha = 1;
      }
      if (p.brazier && p.litAmt > 0.01) {
        const fp = firePos(p);
        FX.flame(ctx, fp.x, fp.y, CH * 0.72 * Math.min(1, p.litAmt * 1.3) * (1 + p.bloom * 1.6), S.t, p.seed, p.pal);
      }
    }
    function unitSprite(u) {
      const h = unitH(u);
      const sp = sprite(u.art, h);
      if (sp) return sp;
      if (u.boss) {
        const bw = BOSS_W * CW * (u.baseScale || 1);
        if (u.look.dragon) return drawn('dragon', bw, bw * 0.85, (g, w, h2) => FX.dragon(g, w / 2, h2 / 2, w, h2));
        return drawn('moth', bw, bw * 0.9, (g, w, h2) => FX.moth(g, w / 2, h2 / 2, w, h2, 0));
      }
      if (u.type === 'mimic') {
        const chest = image('prop-chest');
        return drawn('mimic' + (chest ? 1 : 0), CW * 1.05, CH * 1.15, (g, w, h2) => paintMimic(g, w, h2, chest));
      }
      // A token has a letter on it, so it never flips.
      const tk = drawn('token:' + u.type, h * 0.58, h, (g, w, h2) => FX.token(g, w / 2, h2, h2 * 0.9, u.color, u.letter));
      tk.noFlip = true;
      return tk;
    }
    // The chest picture with googly eyes and a tongue, until the Mimic's own art arrives.
    function paintMimic(g, w, h, chest) {
      const ch = h * 0.72;
      const cw = chest ? (ch * chest.naturalWidth) / chest.naturalHeight : w * 0.9;
      if (chest) g.drawImage(chest, (w - cw) / 2, h - ch, cw, ch);
      else FX.prop(g, 'chest', w / 2, h, w * 0.9, ch);
      g.fillStyle = '#e04866';
      g.strokeStyle = '#3a0a14';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(w * 0.42, h - ch * 0.5);
      g.quadraticCurveTo(w * 0.36, h - ch * 0.12, w * 0.5, h - ch * 0.08);
      g.quadraticCurveTo(w * 0.62, h - ch * 0.14, w * 0.56, h - ch * 0.5);
      g.closePath();
      g.fill();
      g.stroke();
      for (const [ex, er, look] of [[0.36, 0.13, 0.04], [0.63, 0.105, 0.03]]) {
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(w * ex, h - ch * 1.0, w * er, 0, TAU);
        g.fill();
        g.stroke();
        g.fillStyle = '#111018';
        g.beginPath();
        g.arc(w * (ex + look), h - ch * 0.98, w * er * 0.48, 0, TAU);
        g.fill();
      }
    }
    function activeHop(t) {
      const p = (t % 1.6) / 0.36;
      return p < 1 ? Math.sin(p * Math.PI) * 10 : 0;
    }
    // Which picture a unit shows right now: its painted knocked-down pose, a short attack pose, or
    // the idle sprite. A pose that is missing or still loading falls back to the idle sprite.
    const IDLE = { kind: 'idle', h: 1, ax: 0.5 };
    function poseInfo(id, kind) {
      const p = POSES[id] || {};
      return { id, kind, h: p.h || (kind === 'down' ? 0.74 : 1), ax: p.ax != null ? p.ax : 0.5, lantern: p.lantern, tip: p.tip };
    }
    function downPose(u) {
      if (u.kind !== 'hero') return null;
      const id = u.art + '-down';
      return image(id) ? poseInfo(id, 'down') : null;
    }
    function poseOf(u) {
      if (u.downAmt > 0.5) return downPose(u) || IDLE;
      if (u.pose && clock.now < u.poseUntil && !u.boss) {
        const id = u.art + '-' + u.pose;
        if (image(id)) return poseInfo(id, u.pose);
      }
      return IDLE;
    }
    function drawUnit(u) {
      const vis = u.kind === 'monster' ? u.reveal : 1;
      const a = u.alpha * vis;
      if (a < 0.01) return;
      let pose = poseOf(u);
      let sp = pose === IDLE ? null : sprite(pose.id, unitH(u) * pose.h);
      if (!sp) {
        pose = IDLE;
        sp = unitSprite(u);
      }
      const t = S.t;
      const breath = Math.sin((t * TAU) / (u.boss ? 2.2 : 2.6) + u.phase);
      let sx = u.scale * (1 - breath * 0.006);
      let sy = u.scale * (1 + breath * 0.016);
      let lift = u.hop;
      if (u.boss && u.look.dragon) {
        // The dragon's round belly breathes, and it bobs on its stubby wings.
        sy *= 1 + 0.02 * Math.sin(t * TAU * (u.flapFast ? 2.4 : 0.6) + u.phase);
        lift += hover(u) + Math.sin((t * TAU) / 2.3 + u.phase) * 7;
      } else if (u.boss) {
        // Wing flap: a slow sideways breathing of the whole moth, faster when it swoops.
        const flap = Math.sin(t * TAU * (u.flapFast ? 2.8 : 0.85) + u.phase);
        sx *= 1 + 0.035 * flap;
        sy *= 1 - 0.012 * flap;
        lift += hover(u) + Math.sin((t * TAU) / 2.3 + u.phase) * 7;
      } else if (u.flying) {
        // Bats and wisps float with a light wing-beat bob.
        sy *= 1 + 0.03 * Math.sin(t * TAU * (u.flapFast ? 3.5 : 1.6) + u.phase);
        lift += hover(u) + Math.sin((t * TAU) / 1.7 + u.phase) * 5;
      }
      if (u.uid === S.activeId) lift += activeHop(t);
      if (u.squash) {
        sx *= 1 + u.squash * 0.12;
        sy *= 1 - u.squash * 0.12;
      }
      if (u.collapse) {
        sx *= 1 + u.collapse * 0.25;
        sy *= 1 - u.collapse * 0.62;
      }
      const down = u.downAmt;
      // With a painted knocked-down pose the hero sits up in full colour (stars painted in); the
      // idle figure only starts to tip before the pose takes over. Without one, the idle figure
      // tips over and turns grey.
      const sitting = pose.kind === 'down';
      const grey = !sitting && !(down > 0 && downPose(u));
      const tilt = sitting ? 0 : grey ? down : Math.min(down, 0.5);
      if (tilt) {
        sx *= 1 - 0.12 * Math.min(1, tilt);
        sy *= 1 - 0.12 * Math.min(1, tilt);
      }
      if (sitting && down < 1) {
        // The bounce of the fall squashes the sitting figure a little as it lands.
        const k = clamp((1 - down) * 2, 0, 1);
        sx *= 1 + 0.08 * k;
        sy *= 1 - 0.12 * k;
      }
      const x = u.x + u.ox + tilt * u.facing * sp.h * 0.36;
      const y = u.y + u.oy - lift;
      const rot = -1.25 * tilt * u.facing + u.rot;
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      const flip = sp.noFlip ? 1 : u.facing;
      ctx.scale(sx * flip, sy);
      const dx = -sp.w * pose.ax;
      const dy = -sp.h;
      ctx.globalAlpha = Math.min(1, a);
      // A knocked-down hero without a painted pose gets a dark rim so the grey figure stands out.
      if (down > 0.5 && grey) {
        ctx.globalAlpha = Math.min(1, a) * 0.85;
        ctx.drawImage(variant(sp, 'dark'), dx - sp.w * 0.03, dy - sp.h * 0.03, sp.w * 1.06, sp.h * 1.04);
        ctx.globalAlpha = Math.min(1, a);
      }
      ctx.drawImage(down >= 0.99 && grey ? variant(sp, 'grey') : sp.cv, dx, dy, sp.w, sp.h);
      const over = (kind, amt) => {
        if (amt <= 0.01) return;
        ctx.globalAlpha = a * Math.min(1, amt);
        ctx.drawImage(variant(sp, kind), dx, dy, sp.w, sp.h);
      };
      if (grey && down > 0.02 && down < 0.99) over('grey', down);
      over('dark', u.dim * 0.38);
      // Frozen: a cold blue cast (and ice at the feet, drawn below); chilled: a hint of it.
      // A hero keeps a light cold cast: at 0.4 the pale silhouette read as "knocked out" (playtest-2 L6).
      if (u.status.frozen) over('ice', (u.kind === 'hero' ? 0.16 : 0.4) + 0.08 * Math.sin(t * 4 + u.phase));
      else if (u.status.chilled) over('ice', 0.18);
      over('red', u.tint * 0.6);
      over('white', u.flash * 0.92);
      ctx.restore();
      if (u.status.frozen && down < 0.5) drawIce(u, a, t);
      u.dx = x;
      u.dy = y;
      u.dsx = sx;
      u.dsy = sy;
      u.dw = sp.w;
      u.dh = sp.h;
      u.drot = rot;
      u.dflip = flip;
      u.dax = pose.ax;
      u.dpose = pose;
      u.dsp = sp;
    }
    // Ice shards around a frozen unit's feet (the frozen status).
    function drawIce(u, a, t) {
      const g = groundOf(u);
      const w = (u.dw || unitW(u)) * 0.5;
      ctx.save();
      ctx.globalAlpha = Math.min(1, a) * 0.9;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(230,248,255,0.9)';
      const shards = [[-0.55, 0.42, 0.55], [-0.2, 0.7, 0.9], [0.18, 0.62, 0.75], [0.52, 0.4, 0.5], [0, 0.4, 0.45]];
      shards.forEach(([dx, hk, wk], i) => {
        const x = g.x + dx * w;
        const h = CH * 0.42 * hk * (1 + 0.04 * Math.sin(t * 3 + i));
        const sw = w * 0.22 * wk;
        ctx.fillStyle = i % 2 ? 'rgba(150,215,255,0.78)' : 'rgba(190,235,255,0.72)';
        ctx.beginPath();
        ctx.moveTo(x - sw, g.y + CH * 0.06);
        ctx.lineTo(x - sw * 0.35, g.y - h);
        ctx.lineTo(x + sw * 0.25, g.y - h * 0.85);
        ctx.lineTo(x + sw, g.y + CH * 0.06);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }
    function drawGhost(gh) {
      const sp = unitSprite(gh.u);
      ctx.save();
      ctx.translate(gh.x, gh.y);
      ctx.scale(sp.noFlip || gh.x >= gh.u.x ? 1 : -1, 1);
      ctx.globalAlpha = 0.48 + 0.1 * Math.sin(S.t * 4);
      ctx.drawImage(sp.cv, -sp.w / 2, -sp.h, sp.w, sp.h);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    function drawThings() {
      const list = [];
      for (const p of S.props.values()) list.push({ y: p.sortY, p });
      for (const u of S.units.values()) list.push({ y: u.y - (u.boss ? CH * 0.4 : 0), u });
      const mv = hoverMove();
      const hero = S.activeId && S.units.get(S.activeId);
      if (mv && hero && !S.playing) {
        const a = anchor(1, mv.at[0], mv.at[1]);
        list.push({ y: a.y, ghost: { x: a.x, y: a.y, u: hero } });
      }
      list.sort((a, b) => a.y - b.y);
      for (const it of list) {
        if (it.p) drawProp(it.p);
        else if (it.u) drawUnit(it.u);
        else drawGhost(it.ghost);
      }
      ctx.globalAlpha = 1;
    }

    // ------------------------------------------------------------ darkness and light
    // The darkness is drawn small (it's all soft gradients) and stretched over the room.
    const DW = 384;
    const DH = 256;
    const darkCv = typeof document !== 'undefined' ? FX.canvas(DW, DH) : null;
    const dg = darkCv && darkCv.getContext('2d');
    const brightCv = typeof document !== 'undefined' ? FX.canvas(DW, DH) : null;
    const bg = brightCv && brightCv.getContext('2d');
    let darkOn = false;
    function holeIn(g, st, x, y, rx, ry, a) {
      if (a <= 0.003) return;
      g.globalAlpha = Math.min(1, a);
      g.drawImage(stamp(st), ((x - rx) * DW) / W, ((y - ry) * DH) / H, (rx * 2 * DW) / W, (ry * 2 * DH) / H);
    }
    // Builds this frame's darkness: blue-black with soft holes for every light.
    function buildDarkness() {
      const base = clamp(S.dark + S.darkBoost, 0, 0.97);
      darkOn = base >= 0.005 && !!dg;
      if (!darkOn) return;
      dg.globalCompositeOperation = 'source-over';
      dg.globalAlpha = 1;
      dg.clearRect(0, 0, DW, DH);
      dg.fillStyle = `rgba(${DARK_RGB},${base})`;
      dg.fillRect(0, 0, DW, DH);
      dg.globalCompositeOperation = 'destination-out';
      for (const s of S.src || []) holeIn(dg, s.st, s.x, s.y, s.rx, s.ry, s.a);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const a = S.corr[idx(c, r)];
          if (a > 0.01) {
            const p = centerOf(c, r);
            holeIn(dg, 'cell', p.x, p.y, CW * 0.95, CH * 0.95, a);
          }
        }
      }
      if (S.lift) holeIn(dg, 'flood', S.lift.cx, S.lift.cy, S.lift.r, S.lift.r * 0.85, S.lift.a);
      dg.globalCompositeOperation = 'source-over';
      dg.globalAlpha = 1;
      tintDarkness();
    }
    function drawDarkness() {
      if (darkOn) ctx.drawImage(darkCv, 0, 0, W, H);
    }
    // A monster the party has spotted but can't light (the Snow Globe's mist spots it where it
    // stands) is smothered by the darkness, a faint ghost. Draw it once more, mostly through the
    // dark, so it reads as a real shape. Chapter 2 and later only (polish-2).
    function drawSpottedInDark() {
      if (!darkOn || !laterChapter()) return;
      for (const u of S.units.values()) {
        if (u.kind !== 'monster' || !u.spotted || u.dying || u.reveal < 0.5 || u.alpha < 0.3) continue;
        const k = (1 - lightAt(u.x + u.ox, u.y - 4)) * 0.72;
        if (k < 0.08) continue;
        const keep = u.alpha;
        u.alpha = keep * k;
        drawUnit(u);
        u.alpha = keep;
      }
      ctx.globalAlpha = 1;
    }
    // Colored light (Chapter 2): a 12x7 picture with one pixel per square, blended across the
    // floor by the browser's smoothing, so the tint follows the rules' squares with soft edges.
    // Squares with two colors show the blend, the way the rules let different colors combine.
    const tintCv = typeof document !== 'undefined' ? FX.canvas(COLS, ROWS) : null;
    const tg = tintCv && tintCv.getContext('2d');
    const tintImg = tg && tg.createImageData(COLS, ROWS);
    let colTab = null;
    function colorTable() {
      const key = COLOR_NAMES.map(flameHex).join('|');
      if (colTab && colTab.key === key) return colTab.rgb;
      colTab = { key, rgb: COLOR_NAMES.map((n) => String(flameRgb(n) || '0,0,0').split(',').map(Number)) };
      return colTab.rgb;
    }
    function tintDarkness() {
      if (!S.colAny || !tg) return;
      const tab = colorTable();
      const d = tintImg.data;
      for (let i = 0; i < COLS * ROWS; i++) {
        let sum = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let k = 0; k < NCOL; k++) {
          const a = S.col[i * NCOL + k];
          if (a <= 0.01) continue;
          sum += a;
          r += tab[k][0] * a;
          g += tab[k][1] * a;
          b += tab[k][2] * a;
        }
        const o = i * 4;
        if (sum <= 0.01) {
          d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0;
          continue;
        }
        d[o] = Math.round(r / sum);
        d[o + 1] = Math.round(g / sum);
        d[o + 2] = Math.round(b / sum);
        d[o + 3] = Math.round(Math.min(1, sum) * 255);
      }
      tg.putImageData(tintImg, 0, 0);
      dg.globalCompositeOperation = 'source-over';
      dg.globalAlpha = TINT_A;
      dg.imageSmoothingEnabled = true;
      dg.imageSmoothingQuality = 'high';
      dg.drawImage(tintCv, (FX0 * DW) / W, (FY0 * DH) / H, (COLS * CW * DW) / W, (ROWS * CH * DH) / H);
      dg.globalAlpha = 1;
    }
    // The Prism Heart's light cycles through the four flame colors.
    function rainbowRgb(t) {
      const k = (t * 0.35) % NCOL;
      const i = Math.floor(k);
      return FX.mixRgb(flameRgb(COLOR_NAMES[i]) || GOLD, flameRgb(COLOR_NAMES[(i + 1) % NCOL]) || GOLD, k - i);
    }
    // The fully lit painting shows inside bright brazier light (so it blooms outward as each
    // brazier is lit) and everywhere once the room is cleared. The masked copy is cached and only
    // rebuilt when a brazier's light changes, so a calm frame costs one blit.
    let litLayer = null;
    let litKey = '';
    function brightHoles() {
      const out = [];
      for (const p of S.props.values()) {
        if (!p.lightR || p.litAmt <= 0.001) continue;
        const rad = (p.lightR + 1.25) * p.litAmt * (1 + p.bloom) * 0.92;
        out.push([p.x, p.y - CH * 0.38, rad * CW, rad * CH, Math.min(1, p.litAmt * 1.5)]);
      }
      for (const tl of S.temps) if (tl.amt > 0.001) out.push([tl.x, tl.y, tl.rad * CW * 0.92, tl.rad * CH * 0.92, tl.amt]);
      return out;
    }
    function drawLitPainting() {
      if (!staticLit) return;
      if (!S.lift && S.dark <= CLEAR_DARK + 0.02) {
        ctx.drawImage(staticLit, 0, 0, W, H);
        return;
      }
      // After a new room's peek the lit painting fades out as the darkness creeps back.
      if (S.peek) {
        const k = 1 - smoothstep(CLEAR_DARK, 0.62, S.dark);
        if (k > 0.01) {
          ctx.globalAlpha = k;
          ctx.drawImage(staticLit, 0, 0, W, H);
          ctx.globalAlpha = 1;
        }
      }
      const holes = brightHoles();
      if (!holes.length && !S.lift) return;
      const key = holes.map((h) => h.map((v) => Math.round(v * 10)).join(',')).join('|') +
        (S.lift ? '|L' + Math.round(S.lift.r / 6) : '') + '|' + staticLit.width + 'x' + staticLit.height;
      if (key !== litKey || !litLayer) {
        litKey = key;
        bg.globalCompositeOperation = 'source-over';
        bg.globalAlpha = 1;
        bg.clearRect(0, 0, DW, DH);
        bg.fillStyle = '#000';
        bg.fillRect(0, 0, DW, DH);
        bg.globalCompositeOperation = 'destination-out';
        for (const [x, y, rx, ry, al] of holes) holeIn(bg, 'brazier', x, y, rx, ry, al);
        if (S.lift) holeIn(bg, 'flood', S.lift.cx, S.lift.cy, S.lift.r, S.lift.r * 0.85, 1);
        if (!litLayer || litLayer.width !== staticLit.width || litLayer.height !== staticLit.height) {
          litLayer = FX.canvas(staticLit.width, staticLit.height);
        }
        const g = litLayer.getContext('2d');
        g.globalCompositeOperation = 'copy';
        g.drawImage(staticLit, 0, 0);
        g.globalCompositeOperation = 'destination-out';
        g.drawImage(brightCv, 0, 0, litLayer.width, litLayer.height);
        g.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(litLayer, 0, 0, W, H);
    }
    // Small, crisp glows go straight onto the board; big soft pools are gathered on a small
    // canvas and blended once, which keeps big high-DPI screens fast.
    function glowAt(rgb, x, y, rx, ry, a) {
      if (a <= 0.003) return;
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(FX.glow(rgb), x - rx, y - ry, rx * 2, ry * 2);
    }
    const softCv = typeof document !== 'undefined' ? FX.canvas(DW, DH) : null;
    const sg = softCv && softCv.getContext('2d');
    let softN = 0;
    function soft(rgb, x, y, rx, ry, a) {
      if (a <= 0.003 || !sg) return;
      sg.globalAlpha = Math.min(1, a);
      sg.drawImage(FX.glow(rgb), ((x - rx) * DW) / W, ((y - ry) * DH) / H, (rx * 2 * DW) / W, (ry * 2 * DH) / H);
      softN++;
    }
    // Additive warm light: lantern cores, brazier fires and pools, magic, the boss's eyespots.
    function drawGlow() {
      const t = S.t;
      if (sg) {
        sg.globalCompositeOperation = 'source-over';
        sg.globalAlpha = 1;
        sg.clearRect(0, 0, DW, DH);
        sg.globalCompositeOperation = 'lighter';
      }
      softN = 0;
      ctx.globalCompositeOperation = 'lighter';
      // Pools matter in the dark; in a bright, cleared room they would wash the picture out.
      const calm = 0.25 + 0.75 * smoothstep(0.15, 0.8, S.dark);
      for (const u of S.units.values()) {
        if (u.kind !== 'hero' || u.alpha < 0.05) continue;
        const f = FX.flicker(t, u.phase);
        const lp = spot(u, ...((u.dpose && u.dpose.lantern) || u.look.lantern || [0.55, 0.5]));
        // A crystal-tinted lantern glows in its color; its pool is a little stronger so the tint reads.
        const lr = lanternRgbOf(u);
        const warm = lr || WARM;
        soft(warm, lp.x, lp.y, CW * 0.62, CW * 0.62, (0.5 + 0.12 * f) * u.alpha * (0.45 + 0.55 * calm));
        glowAt(lr ? FX.mixRgb(lr, '255,255,255', 0.55) : '255,236,190', lp.x, lp.y, CW * 0.16, CW * 0.16, (0.55 + 0.15 * f) * u.alpha);
        soft(warm, u.x + u.ox, u.y - CH * 0.15, CW * 2.3, CH * 2.0, (0.1 + 0.02 * f) * calm * u.alpha * (lr ? 1.7 : 1));
        if (u.lanternFlare > 0.01) soft(warm, lp.x, lp.y, CW * 1.8, CW * 1.8, u.lanternFlare * 0.8 * u.alpha);
        if (u.glowHeal > 0.01) soft(u.glowHealRgb || '120,255,160', u.x + u.ox, u.y - unitH(u) * 0.45, CW * 0.9, CH * 1.2, u.glowHeal * 0.6);
        if (u.shield || hasShield(u)) {
          const p = 0.5 + 0.5 * Math.sin(t * 3 + u.phase);
          soft('110,170,255', u.x + u.ox, u.y - unitH(u) * 0.45, CW * 0.8, CH * 1.15, 0.22 + 0.12 * p);
        }
      }
      for (const p of S.props.values()) {
        if (p.litAmt > 0.01) {
          const f = FX.flicker(t * 1.3, p.seed);
          if (p.brazier) {
            // A colored brazier's fire and pool glow in its flame color (Chapter 2); gold stays orange.
            const fp = firePos(p);
            soft(p.rgb ? FX.mixRgb(p.rgb, '255,255,255', 0.25) : '255,150,60', fp.x, fp.y - CH * 0.2, CW * 1.15, CW * 1.15,
              (0.62 + 0.12 * f) * p.litAmt * (0.5 + 0.5 * calm));
            soft(p.rgb || '255,140,60', p.x, p.y - CH * 0.3, CW * 3.6, CH * 3.2, (0.15 + 0.03 * f) * p.litAmt * calm * (p.rgb ? 1.5 : 1));
          } else if (isHeart(p)) {
            const sp = propSprite(p);
            const hc = p.type === 'prism-heart' ? rainbowRgb(t) : GOLD;
            soft(hc, p.x, p.y - sp.h * 0.5, CW * 2.2, CW * 2.2, (0.6 + 0.1 * f) * p.litAmt * (0.6 + 0.4 * calm));
            glowAt(p.type === 'prism-heart' ? FX.mixRgb(hc, '255,255,255', 0.6) : '255,250,220', p.x, p.y - sp.h * 0.5, CW * 0.6, CW * 0.6, 0.9 * p.litAmt);
          }
        }
        if (p.flare > 0.01) soft(p.rgb || GOLD, p.x, p.y - p.h * 0.6, CW * 1.6, CW * 1.6, p.flare);
        if (p.glow) {
          const sp = propSprite(p);
          const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + p.seed);
          soft(p.glow, p.x, p.y - sp.h * 0.68, CW * 0.95, CW * 0.8, 0.26 + 0.1 * pulse);
        }
      }
      for (const u of S.units.values()) {
        if (!u.boss || u.alpha < 0.05 || u.reveal < 0.05) continue;
        const bg2 = bossGlow(u);
        const ba = u.alpha * u.reveal;
        const gr = glowRgbOf(u);
        if (gr) {
          // The Color Dragon's aura in its current glow color (the telegraph): a pool around it,
          // a ring on the floor under it, and its belly lit up with the trapped flames.
          const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + u.phase) + u.glowPulse;
          soft(gr, bg2.x, bg2.y, CW * 2.8, CH * 2.4, (0.42 + 0.1 * pulse) * calm * ba);
          const gp = groundOf(u);
          glowAt(gr, gp.x, gp.y, CW * 1.9 * (1 + 0.05 * pulse), CH * 0.7 * (1 + 0.05 * pulse), (0.5 + 0.15 * pulse) * ba);
          // A crisp ring on the floor in the glow color, so the telegraph reads from across the room.
          ctx.globalAlpha = clamp((0.5 + 0.3 * pulse) * ba, 0, 1);
          ctx.lineWidth = 6;
          ctx.strokeStyle = `rgb(${gr})`;
          ctx.beginPath();
          ctx.ellipse(gp.x, gp.y, CW * 1.35 * (1 + 0.03 * pulse), CH * 0.5 * (1 + 0.03 * pulse), 0, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          if (u.look.belly) {
            const bp = spot(u, u.look.belly[0], u.look.belly[1]);
            const bw = u.dw || unitW(u);
            const r = bw * 0.17 * (1 + 0.08 * pulse + u.feed * 0.4 + u.belly * 0.5);
            glowAt(gr, bp.x, bp.y, r, r * 0.85, Math.min(1, 0.5 + 0.2 * pulse + u.belly) * ba);
            glowAt(FX.mixRgb(gr, '255,255,255', 0.6), bp.x, bp.y, r * 0.45, r * 0.4, Math.min(1, 0.5 + u.belly) * ba);
          }
        } else {
          // A soft violet pool around the moth, under its gold eyespots (ux #7).
          soft('150,110,255', bg2.x, bg2.y, CW * 2.4, CH * 2.1, (0.2 + 0.05 * Math.sin(t * 1.4)) * calm * ba);
        }
        const spots = u.look.spots || [];
        const w = u.dw || unitW(u);
        spots.forEach(([nx, ny], i) => {
          const p = spot(u, nx, ny);
          const pulse = 0.5 + 0.5 * Math.sin(t * 2.3 + i * 1.7);
          const r = w * (i === spots.length - 1 ? 0.06 : 0.075) * (1 + 0.15 * pulse + u.feed * 0.4);
          glowAt(GOLD, p.x, p.y, r, r, (0.3 + 0.32 * pulse + u.feed * 0.5) * u.alpha * u.reveal);
        });
      }
      // Shadow monsters (Gloomlings, Gloamwing) are dark on a dark floor, so a faint violet rim
      // traces them once they're seen; it's strongest in the dark and softer in lit squares.
      // The Color Dragon gets the same rim in its glow color, crossfading as the glow moves on; the
      // charcoal-ink Greyling gets the violet rim too (look.rim) without the shadow wisps.
      for (const u of S.units.values()) {
        const gr = u.boss ? u.glowRgb : null;
        if ((!u.look.gloom && !u.look.rim && !gr) || u.dying || !u.dsp || u.dsp.noFlip) continue;
        const a = u.alpha * u.reveal;
        if (a < 0.05) continue;
        const dim = 1 - lightAt(u.x, u.y - CH * 0.4);
        const pulse = 0.85 + 0.15 * Math.sin(t * 2.2 + u.phase);
        ctx.save();
        ctx.translate(u.dx, u.dy);
        if (u.drot) ctx.rotate(u.drot);
        ctx.scale(u.dsx * u.dflip, u.dsy);
        const rimDraw = (rgb, k) => {
          const rim = rimOf(u.dsp, rgb);
          ctx.globalAlpha = clamp(a * k * pulse * (0.45 + 0.55 * dim) * (u.boss ? 0.7 : 0.8), 0, 1);
          ctx.drawImage(rim.cv, -u.dw * u.dax - rim.pad, -u.dh - rim.pad, u.dw + rim.pad * 2, u.dh + rim.pad * 2);
        };
        if (gr) {
          if (u.glowPrev && u.glowMix < 1) rimDraw(u.glowPrev, 1 - u.glowMix);
          rimDraw(gr, u.glowMix);
        } else rimDraw(null, 1);
        ctx.restore();
      }
      for (const tl of S.temps) {
        if (tl.amt > 0.01 && tl.rgb) soft(tl.rgb, tl.x, tl.y, tl.rad * CW * 0.75, tl.rad * CH * 0.7, tl.amt * 0.5);
      }
      if (softN) {
        ctx.globalAlpha = 1;
        ctx.drawImage(softCv, 0, 0, W, H);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    function hasShield(u) {
      for (const k in u.status) if (u.status[k] && /shield/i.test(k)) return true;
      return false;
    }
    // Hidden monsters: only a pair of glowing eyes that blink now and then and drift a little.
    function blinkAmt(u, ms) {
      if (!u.blinkAt) u.blinkAt = ms + range(600, 3200);
      if (ms >= u.blinkAt) {
        u.blinkEnd = ms + 160;
        u.blinkAt = ms + (rand() < 0.25 ? 300 : range(1800, 4600));
      }
      if (ms < u.blinkEnd) return 0.1 + 0.9 * Math.abs(Math.cos((1 - (u.blinkEnd - ms) / 160) * Math.PI));
      return 1;
    }
    function drawEyes() {
      const t = S.t;
      // During a new room's peek the eyes only open as the darkness comes back.
      const peekK = S.peek ? smoothstep(0.35, 0.75, S.dark) : 1;
      ctx.globalCompositeOperation = 'lighter';
      for (const u of S.units.values()) {
        const a = (1 - u.reveal) * u.alpha * peekK;
        if (a < 0.02 || u.dying) continue;
        const e = u.look.eyes || [0.55, 0.3];
        const h = unitH(u);
        const w = unitW(u);
        const blink = blinkAmt(u, clock.now);
        const cx = u.x + u.ox + (e[0] - 0.5) * w * u.facing + Math.sin(t * 0.7 + u.phase) * 5;
        const cy = u.y + u.oy - u.hop - hover(u) - (1 - e[1]) * h + Math.sin(t * 0.93 + u.phase * 1.7) * 3.5;
        const er = Math.max(6, Math.min(h * 0.04, 11)) * (1 + u.feed * 0.4);
        // Keep the two eyes apart, even when they swell.
        const gap = Math.max(((u.look.gap || 0.12) * w) / 2, h * 0.05, er * 1.75);
        const rgb = u.look.eye || '255,220,120';
        const pulse = 0.85 + 0.15 * Math.sin(t * 2.1 + u.phase);
        // The eyes float at head height, a square above where the monster stands, so a faint pool
        // of their light marks its real square on the floor (ux #17).
        glowAt(rgb, u.x + u.ox, u.y - CH * 0.06, CW * 0.42, CH * 0.14, a * 0.32 * pulse);
        glowAt(rgb, cx, cy, gap + er * 7, er * 5.5, a * (0.5 + u.feed * 0.45) * pulse);
        for (const side of [-1, 1]) {
          const ex = cx + side * gap;
          glowAt(rgb, ex, cy, er * 3.2, er * 2.6, a * 0.75 * pulse);
          ctx.globalAlpha = a;
          ctx.fillStyle = `rgb(${rgb})`;
          ctx.beginPath();
          ctx.ellipse(ex, cy, er * 1.35, Math.max(0.8, er * 0.82 * blink), side * 0.32 * u.facing, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.ellipse(ex + u.facing * er * 0.3, cy, er * 0.42, Math.max(0.5, er * 0.36 * blink), 0, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // Move squares glow through the dark so every choice stays visible.
    function drawMarkGlow() {
      const o = S.opt;
      if (!o || S.dark < 0.3) return;
      const t = S.t;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 3;
      for (const m of o.moves.values()) {
        const cp = centerOf(m.at[0], m.at[1]);
        const dim = 1 - lightAt(cp.x, cp.y);
        if (dim < 0.05) continue;
        const q = L.cellRect(m.at[0], m.at[1]);
        const a = clamp((clock.now - S.optT0) / 400, 0, 1) * dim * (0.42 + 0.12 * Math.sin(t * 3.4 + m.at[0]));
        FX.roundRect(ctx, q.x + 8, q.y + 8, q.w - 16, q.h - 16, 14);
        ctx.strokeStyle = `rgba(255,200,90,${a})`;
        ctx.stroke();
        ctx.fillStyle = `rgba(255,190,80,${a * 0.18})`;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // ------------------------------------------------------------ overheads: bars, badges, stars
    // Polish that only Chapter 2 and later get, so Chapter 1 looks exactly as it always did.
    function laterChapter() {
      const list = data.chapters;
      return !!(S.state && S.state.chapter && Array.isArray(list) && list.length > 1 && list[0] && list[0].id !== S.state.chapter);
    }
    // Where the boss's bar and its name label are, so a small monster's bar (a summoned Greyling
    // right under the dragon's chin) steps below them instead of landing on the words (polish-2).
    function bossLabelBox() {
      if (!laterChapter()) return null;
      for (const u of S.units.values()) {
        if (!u.boss || u.dying || u.alpha < 0.3 || u.reveal < 0.5 || u.downAmt > 0.5) continue;
        const y = headY(u);
        return { x0: u.x + u.ox - 125, x1: u.x + u.ox + 125, y0: y - 34, y1: y + 22 };
      }
      return null;
    }
    // Screen-space bounds use the last painted transform, including screen shake. The canvas
    // clips the painting, so only the visible part of an overhanging figure can cover the HUD.
    let paintedOffset = { x: 0, y: 0 };
    function screenBox(b) {
      if (!b) return null;
      const rect = canvas.getBoundingClientRect();
      const sx = rect.width / (view.cssW || rect.width || 1);
      const sy = rect.height / (view.cssH || rect.height || 1);
      return { left: Math.max(rect.left, rect.left + (paintedOffset.x + b.x0 * view.s) * sx),
        right: Math.min(rect.right, rect.left + (paintedOffset.x + b.x1 * view.s) * sx),
        top: Math.max(rect.top, rect.top + (paintedOffset.y + b.y0 * view.s) * sy),
        bottom: Math.min(rect.bottom, rect.top + (paintedOffset.y + b.y1 * view.s) * sy) };
    }
    function bossFigureScreen() {
      for (const u of S.units.values()) {
        if (!u.boss || u.alpha * u.reveal < 0.01 || !u.dsp) continue;
        // The sprite's four corners include its pose, flip, breath, squash, rotation and hop.
        const points = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => spot(u, x, y));
        return screenBox({ x0: Math.min(...points.map((p) => p.x)), x1: Math.max(...points.map((p) => p.x)),
          y0: Math.min(...points.map((p) => p.y)), y1: Math.max(...points.map((p) => p.y)) });
      }
      return null;
    }
    // Layout checks use the same painted geometry as the canvas, including off-square art.
    function boardBounds() {
      const squares = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const b = L.cellRect(c, r);
        squares.push({ c, r, ...screenBox({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }) });
      }
      const figures = [...S.units.values()].map((u) => {
        const points = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => spot(u, x, y));
        return { uid: u.uid, kind: u.kind, ...screenBox({ x0: Math.min(...points.map((p) => p.x)),
          x1: Math.max(...points.map((p) => p.x)), y0: Math.min(...points.map((p) => p.y)), y1: Math.max(...points.map((p) => p.y)) }) };
      });
      const props = [...S.props.values()].map((p) => {
        const sp = propSprite(p), x = p.x + p.shake;
        return { uid: p.uid, ...screenBox({ x0: x - sp.w / 2, x1: x + sp.w / 2, y0: p.y - sp.h, y1: p.y }) };
      });
      return { squares, figures, props };
    }
    function hpBar(u, avoid) {
      const boss = u.boss;
      const w = boss ? 220 : 76;
      const h = boss ? 16 : 10;
      const x = u.x + u.ox - w / 2;
      let y = u.downAmt > 0.5 ? u.y - CH * 0.72 : headY(u) - (boss ? 0 : 14);
      if (avoid && !boss && x + w + 3 > avoid.x0 && x - 3 < avoid.x1 && y + h + 3 > avoid.y0 && y - 3 < avoid.y1) y = avoid.y1 + 12;
      const f = clamp(u.hp / Math.max(1, u.maxHp), 0, 1);
      const fs = clamp(u.hpShown / Math.max(1, u.maxHp), 0, 1);
      ctx.fillStyle = 'rgba(8,6,16,0.86)';
      FX.roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 7);
      ctx.fill();
      if (fs > f + 0.002) {
        ctx.fillStyle = 'rgba(255,236,214,0.92)';
        FX.roundRect(ctx, x, y, w * fs, h, 4);
        ctx.fill();
      }
      if (f > 0) {
        const gr = ctx.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, u.kind === 'hero' ? '#a6ffb6' : '#ff8f7a');
        gr.addColorStop(1, u.kind === 'hero' ? '#1f9c48' : '#bd1f18');
        ctx.fillStyle = gr;
        FX.roundRect(ctx, x, y, Math.max(h, w * f), h, 4);
        ctx.fill();
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.42)';
      FX.roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 5);
      ctx.stroke();
      if (boss) {
        ctx.font = `800 22px ${FX.NUM_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#120a1e';
        // The boss's bar carries its name, so everyone knows what they're fighting (ux #7).
        const label = `${u.def.name || 'Gloamwing'}  ${Math.max(0, Math.ceil(u.hp))} / ${u.maxHp}`;
        ctx.strokeText(label, u.x + u.ox, y - 5);
        ctx.fillStyle = '#ffe9b0';
        ctx.fillText(label, u.x + u.ox, y - 5);
      }
    }
    function chevron(x, y) {
      ctx.fillStyle = '#ff5a40';
      ctx.strokeStyle = 'rgba(40,6,4,0.92)';
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 15, y - 13);
      ctx.lineTo(x + 15, y - 13);
      ctx.lineTo(x, y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    function dizzy(u, t) {
      const hp = spot(u, 0.5, 0.1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.95;
      for (let i = 0; i < 3; i++) {
        const ang = t * 3.2 + (i * TAU) / 3;
        const x = hp.x + Math.cos(ang) * 26;
        const y = hp.y - 22 + Math.sin(ang) * 8;
        ctx.drawImage(FX.star(GOLD), x - 11, y - 11, 22, 22);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    function drawOverheads() {
      const t = S.t;
      const avoid = bossLabelBox();
      for (const u of S.units.values()) {
        if (u.dying || u.alpha < 0.3) continue;
        if (u.kind === 'monster' && u.reveal < 0.5) continue;
        // A painted knocked-down pose already has its dizzy stars.
        if (u.downAmt > 0.5) {
          if (!downPose(u)) dizzy(u, t);
        } else if (u.kind === 'monster' || u.hp < u.maxHp) hpBar(u, avoid);
      }
      const o = S.opt;
      if (!o) return;
      const bob = Math.sin(t * 4.2) * 6;
      for (const uid of o.targets.keys()) {
        const u = S.units.get(uid);
        if (u && u.reveal > 0.5 && !u.dying) chevron(u.x + u.ox, headY(u) - 34 + bob);
      }
      for (const [id, kind] of o.marks) {
        const u = S.units.get(id);
        const p = S.props.get(id);
        const sitting = u && u.downAmt > 0.5 && downPose(u);
        if (u) FX.badge(ctx, u.x + u.ox, (sitting ? headY(u) - 28 : u.downAmt > 0.5 ? u.y - CH * 1.05 : headY(u) - 46) + bob, 21, kind);
        else if (p) FX.badge(ctx, p.x, p.y - propSprite(p).h - 30 + bob, 23, kind);
      }
    }
    function drawFx(layer) {
      for (const f of S.fx) {
        if (f.done || f.layer !== layer) continue;
        try {
          f.draw(ctx);
        } catch (err) {
          f.done = true;
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    function drawScreen() {
      ctx.globalCompositeOperation = 'lighter';
      if (S.wash > 0.005) {
        ctx.fillStyle = `rgba(255,200,90,${S.wash})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (S.flash > 0.005) {
        ctx.fillStyle = `rgba(${S.flashRgb},${S.flash})`;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalCompositeOperation = 'source-over';
      if (S.curtain > 0.005) {
        ctx.fillStyle = `rgba(2,3,8,${S.curtain})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    // ------------------------------------------------------------ ambient life
    const env = { lightAt };
    function ambient(dt) {
      if (parts.room() < parts.cap * 0.3) return; // leave room for bursts
      const s = dt / 1000;
      for (const p of S.props.values()) {
        // Embers rise from lit braziers.
        if (p.brazier && p.litAmt > 0.3) {
          p.emberAcc += s * 13 * p.litAmt;
          while (p.emberAcc >= 1) {
            p.emberAcc -= 1;
            const fp = firePos(p);
            // Colored braziers (Chapter 2) throw embers in their flame color with a pale heart.
            const pal = p.pal;
            parts.add({ kind: 'ember', x: fp.x + range(-0.18, 0.18) * CW, y: fp.y - range(0.1, 0.4) * CH, vx: range(-14, 14),
              vy: range(-95, -45), ay: -12, size: range(4, 7), size1: 1.5,
              rgb: pal ? pick([pal.rgb, pal.pale, pal.deep]) : pick(['255,150,50', '255,190,80', '255,120,40']), core: pal ? pal.pale : null,
              life: range(1100, 2300), sway: range(5, 14), swayF: range(0.6, 1.4), fadeIn: 0.05 });
          }
        }
        // Glowing mushrooms puff a few spores.
        if (p.glow) {
          p.emberAcc += s * 1.6;
          if (p.emberAcc >= 1) {
            p.emberAcc -= 1;
            const sp = propSprite(p);
            parts.add({ kind: 'glow', x: p.x + range(-0.35, 0.35) * sp.w, y: p.y - sp.h * range(0.5, 0.9), vx: range(-6, 6), vy: range(-24, -10),
              size: range(2.5, 5), rgb: p.glow, alpha: range(0.4, 0.8), life: range(2500, 4500), sway: range(5, 10), swayF: 0.3, fadeIn: 0.2 });
          }
        }
      }
      // Dust motes drift; they only show where there's light.
      S.moteAcc = (S.moteAcc || 0) + s * 4.2;
      while (S.moteAcc >= 1) {
        S.moteAcc -= 1;
        parts.add({ kind: 'mote', x: range(FX0, FX0 + COLS * CW), y: range(FY0 - CH * 0.6, FY0 + ROWS * CH), vx: range(-7, 7), vy: range(-6, 3),
          size: range(1.8, 3.4), rgb: '255,238,205', alpha: range(0.35, 0.7), life: range(6000, 10000), sway: range(4, 9),
          swayF: range(0.1, 0.3), fadeIn: 0.2, fadeOut: 0.3 });
      }
      // Soft glowing spores float up through the grotto.
      if (S.spores) {
        S.sporeAcc = (S.sporeAcc || 0) + s * 4.5;
        while (S.sporeAcc >= 1) {
          S.sporeAcc -= 1;
          parts.add({ kind: 'glow', x: range(FX0, FX0 + COLS * CW), y: range(FY0, FY0 + ROWS * CH), vx: range(-6, 6), vy: range(-22, -8),
            size: range(4, 8), rgb: pick(['120,255,220', '190,150,255', '150,240,255']), alpha: range(0.45, 0.85),
            life: range(4000, 7000), sway: range(6, 14), swayF: range(0.2, 0.5), fadeIn: 0.25, fadeOut: 0.35 });
        }
      }
      for (const u of S.units.values()) {
        // Gloom wisps curl around shadow monsters.
        if (u.look.gloom && !u.dying && u.reveal > 0.1 && u.alpha > 0.3) {
          u.wispAcc += s * (u.boss ? 14 : 7);
          while (u.wispAcc >= 1) {
            u.wispAcc -= 1;
            const h = unitH(u);
            const w = unitW(u);
            const big = u.boss ? 1.8 : 1;
            parts.add({ kind: 'smoke', x: u.x + u.ox + range(-0.4, 0.4) * w, y: u.y - hover(u) - range(0.05, 0.8) * h, vx: range(-10, 10),
              vy: range(-26, -10), size: range(8, 14) * big, size1: range(18, 26) * big, rgb: pick(['46,24,92', '30,18,64', '70,40,120']),
              alpha: 0.4 * u.reveal, life: range(900, 1500), layer: 'world', fadeIn: 0.2 });
            if (u.boss && rand() < 0.3) {
              parts.add({ kind: 'star', x: u.x + range(-0.5, 0.5) * w, y: u.y - hover(u) - range(0.2, 0.9) * h, vy: range(-14, -4),
                size: range(4, 8), rgb: '170,220,255', life: range(700, 1300), alpha: 0.8 * u.reveal });
            }
          }
        }
        // Snowflakes drift down around chilled monsters and frozen heroes (Chapter 2).
        if (u.status && (u.status.chilled || u.status.frozen) && !u.dying && u.alpha > 0.3 && u.reveal > 0.3) {
          u.flakeAcc += s * (u.status.chilled ? 3.2 : 1.6);
          while (u.flakeAcc >= 1) {
            u.flakeAcc -= 1;
            const h = unitH(u);
            const w = unitW(u);
            parts.add({ kind: 'flake', x: u.x + u.ox + range(-0.6, 0.6) * w, y: u.y - hover(u) - range(0.3, 1.15) * h, vx: range(-8, 8),
              vy: range(14, 30), size: range(4, 8), rgb: pick(['200,240,255', '160,220,255', '255,255,255']), alpha: 0.85,
              life: range(1200, 2000), sway: range(6, 12), swayF: range(0.5, 1), vr: range(-1.5, 1.5), fadeIn: 0.15 });
          }
        }
        // Sleepy heroes snore little z's.
        if (u.status && u.status.sleepy) {
          u.zAcc += s * 0.9;
          if (u.zAcc >= 1) {
            u.zAcc -= 1;
            parts.add({ kind: 'char', ch: 'z', x: u.x + u.facing * 20, y: headY(u) + 12, vx: u.facing * 12, vy: -26, size: 22, size1: 36,
              rgb: '214,196,255', life: 1500, sway: 6, add: false });
          }
        }
      }
    }

    // ------------------------------------------------------------ animation helpers
    const D = (ms) => ms / S.speed;
    function snd(name) {
      const h = S.hooks;
      if (!h || typeof h.sound !== 'function') return;
      try {
        const r = h.sound(name);
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch (err) { /* sound is optional */ }
    }
    async function callHook(name, e) {
      const fn = S.hooks && S.hooks[name];
      if (typeof fn !== 'function') return;
      try {
        await fn(e);
      } catch (err) {
        console.warn('LB_BOARD hook', name, err);
      }
    }
    function say(u, text, style, extra) {
      const st = TEXT[style] || TEXT.info;
      const x = u ? u.x + u.ox : W / 2;
      const y = (u ? headY(u) - 18 : H * 0.45) + (st.dy || 0);
      return floaters.add(Object.assign({}, st, { text: String(text), x, y }, extra || {}));
    }
    // Calmer by default for a family that plays for an hour: shakes stay under 8 px and flashes
    // under 20% (ux #11). Calm motion turns both off.
    const shakeIt = (amp, ms) => { if (!S.reduced) shake.add(Math.min(amp, 8), ms); };
    function flashIt(rgb, a) {
      if (S.reduced) return;
      S.flashRgb = rgb;
      S.flash = Math.max(S.flash, Math.min(a, 0.2));
    }
    // n particles flying out of (x, y). o: speed [a, b], life [a, b], size [a, b], rgb (or list),
    // ang + spread for a cone, flat (squash vertical speed), up (extra rise), jitter, extra fields.
    function burst(x, y, n, o) {
      for (let i = 0; i < n; i++) {
        const ang = o.ang != null ? o.ang + range(-o.spread, o.spread) : rand() * TAU;
        const sp = range(o.speed[0], o.speed[1]);
        const j = o.jitter || 0;
        const p = parts.add(Object.assign({
          x: x + range(-j, j), y: y + range(-j, j) * 0.6, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * (o.flat || 1) - (o.up || 0),
          life: range(o.life[0], o.life[1]), size: range(o.size[0], o.size[1]), rgb: Array.isArray(o.rgb) ? pick(o.rgb) : o.rgb,
        }, o.extra || {}));
        if (p && o.spin) p.vr = range(-o.spin, o.spin);
      }
    }
    const sparks = (x, y, n, rgb) => burst(x, y, n, { speed: [170, 430], life: [200, 460], size: [2.5, 4.5],
      rgb: rgb || ['255,244,214', '255,200,120'], extra: { kind: 'spark', drag: 3, ay: 320 } });
    const stars = (x, y, n, rgb, speed) => burst(x, y, n, { speed: speed || [60, 230], life: [520, 1050], size: [6, 13],
      rgb: rgb || GOLD, extra: { kind: 'star', drag: 2.2, ay: -24 } });
    const smoke = (x, y, n, rgb, size) => burst(x, y, n, { speed: [30, 130], life: [600, 1100], size: [size * 0.6, size], rgb, up: 30,
      jitter: 22, extra: { kind: 'smoke', drag: 2, size1: size * 2, layer: 'world', alpha: 0.78, fadeIn: 0.05 } });
    const dust = (x, y, n) => burst(x, y, n, { speed: [20, 75], life: [350, 650], size: [5, 9], rgb: '176,166,154', flat: 0.35, up: 12,
      extra: { kind: 'smoke', size1: 17, layer: 'world', alpha: 0.42, drag: 3 } });
    const ringAt = (x, y, r0, r1, rgb, life, width) => parts.add({ kind: 'ring', x, y, size: r0, size1: r1, squash: 0.46, rgb,
      width: width || 6, life: life || 650, alpha: 0.85, fadeIn: 0.02, fadeOut: 0.6 });
    // A snowball's splat: a white puff with a few snowflakes (Chapter 2).
    const snowPuff = (x, y, n) => {
      burst(x, y, n || 10, { speed: [40, 150], life: [500, 900], size: [10, 18], rgb: ['240,250,255', '200,235,255'], up: 30, jitter: 12,
        extra: { kind: 'smoke', size1: 34, drag: 2.2, alpha: 0.8, add: false, fadeIn: 0.03 } });
      burst(x, y, 8, { speed: [60, 200], life: [600, 1100], size: [4, 7], rgb: ['220,245,255', '255,255,255'], up: 60, spin: 3,
        extra: { kind: 'flake', drag: 1.6, ay: 120 } });
    };
    // Lava droplets from a Magma Blob.
    const lavaDrops = (x, y, n) => burst(x, y, n, { speed: [120, 340], life: [500, 950], size: [5, 11], rgb: ['255,120,40', '255,170,60', '255,90,30'],
      up: 140, extra: { kind: 'glow', ay: 760, drag: 1.1, size1: 2 } });
    // Where a creature's mouth is (vines, breath and gobbled flames), else its chest.
    const mouthOf = (u) => (u.look.mouth ? spot(u, u.look.mouth[0], u.look.mouth[1]) : chestOf(u));
    function hitFlash(u) {
      clock.tween(D(560), (v, raw) => {
        u.flash = S.reduced ? 0 : raw < 0.18 ? 1 : Math.max(0, 1 - (raw - 0.18) * 5);
        u.tint = raw < 0.12 ? 0 : (1 - (raw - 0.12) / 0.88) * 0.9;
      }).then(() => {
        u.flash = 0;
        u.tint = 0;
      });
    }
    function recoil(u, from, px) {
      const dir = from ? Math.sign(u.x - from.x) || -u.facing : -u.facing;
      clock.tween(D(280), (v, raw) => { u.ox = dir * px * Math.sin(raw * Math.PI); }).then(() => { u.ox = 0; });
    }
    // Strike the attack pose for a moment (a lunge, a shot, a spell); drawUnit falls back to the
    // idle sprite when the pose is missing. Its size and spots apply at once, so a shot leaves
    // from where the bow or staff is in the new picture.
    function setPose(u, name, ms) {
      if (!u || u.boss || u.downAmt > 0.5) return;
      u.pose = name;
      u.poseUntil = clock.now + D(ms);
      const p = poseOf(u);
      const sp = p === IDLE ? null : sprite(p.id, unitH(u) * p.h);
      if (!sp) return;
      u.dw = sp.w;
      u.dh = sp.h;
      u.dax = p.ax;
      u.dpose = p;
    }
    function tipOf(u) {
      const tip = (u.dpose && u.dpose.tip) || (u.look && u.look.tip);
      return tip ? spot(u, tip[0], tip[1]) : chestOf(u);
    }
    function drawShot(g) {
      const f = this;
      g.save();
      g.translate(f.x, f.y);
      g.rotate(f.ang);
      g.globalAlpha = clamp(f.a, 0, 1);
      if (f.kind === 'arrow') {
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = 'rgba(255,240,200,0.35)';
        g.lineWidth = 6;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(-80, 0);
        g.lineTo(-24, 0);
        g.stroke();
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = '#3a2412';
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(-38, 0);
        g.lineTo(10, 0);
        g.stroke();
        g.strokeStyle = '#d29a58';
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = '#eef3fb';
        g.strokeStyle = '#26304a';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(22, 0);
        g.lineTo(6, -7);
        g.lineTo(6, 7);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = '#7fd68f';
        g.beginPath();
        g.moveTo(-36, 0);
        g.lineTo(-46, -8);
        g.lineTo(-28, 0);
        g.lineTo(-46, 8);
        g.closePath();
        g.fill();
      } else if (f.kind === 'spark' || f.kind === 'fireball' || f.kind === 'sunbolt') {
        const hot = f.kind === 'spark' ? ['170,130,255', '140,230,255'] : f.kind === 'sunbolt' ? ['255,190,70', '255,240,170'] : ['255,110,30', '255,214,120'];
        g.globalCompositeOperation = 'lighter';
        g.drawImage(FX.glow(hot[0]), -30, -30, 60, 60);
        g.drawImage(FX.glow(hot[1]), -16, -16, 32, 32);
        g.drawImage(FX.glow('255,255,255'), -7, -7, 14, 14);
      } else if (f.kind === 'bomb') {
        g.rotate(-f.ang + f.spin);
        g.fillStyle = '#3a2a3a';
        g.strokeStyle = '#120a12';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, 13, 0, TAU);
        g.fill();
        g.stroke();
        g.fillStyle = '#ff6a2a';
        g.fillRect(-4, -20, 8, 8);
        g.globalCompositeOperation = 'lighter';
        g.drawImage(FX.glow('255,170,60'), -14, -34, 28, 28);
      } else if (f.kind === 'snowball' || f.kind === 'globe') {
        // A packed snowball, or the Snow Globe: a glass ball on a wooden base with flakes inside.
        const r = f.kind === 'globe' ? 16 : 11;
        g.rotate(-f.ang + (f.spin || 0));
        g.fillStyle = f.kind === 'globe' ? 'rgba(200,235,255,0.75)' : '#eef7ff';
        g.strokeStyle = '#6aa8d8';
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(0, 0, r, 0, TAU);
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath();
        g.arc(-r * 0.35, -r * 0.35, r * 0.28, 0, TAU);
        g.fill();
        if (f.kind === 'globe') {
          g.fillStyle = '#7a4a25';
          g.fillRect(-r * 0.6, r * 0.75, r * 1.2, r * 0.4);
          g.fillStyle = '#ffffff';
          for (const [dx, dy] of [[-0.3, 0.2], [0.25, -0.1], [0.05, 0.45]]) {
            g.beginPath();
            g.arc(dx * r, dy * r, r * 0.08, 0, TAU);
            g.fill();
          }
        }
      } else {
        g.fillStyle = '#a4a9bc';
        g.strokeStyle = '#1c1e2a';
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(0, 0, 7, 0, TAU);
        g.fill();
        g.stroke();
      }
      g.restore();
    }
    // Fly a shot from a to t. Resolves at impact (or when a miss sails past).
    function shoot(a, t, hit, kind) {
      setPose(a, 'attack', 400);
      const from = tipOf(a);
      const tc = chestOf(t);
      let to = { x: tc.x, y: tc.y };
      if (!hit) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        to = { x: to.x + (dx / len) * CW * 0.9, y: to.y + (dy / len) * CW * 0.9 - CH * 0.35 };
      }
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const base = kind === 'arrow' ? 250 : kind === 'spark' || kind === 'sunbolt' ? 320 : 360;
      const arc = kind === 'sling' ? CH * 0.9 : kind === 'snowball' ? CH * 1.05 : kind === 'arrow' ? CH * 0.28 : CH * 0.1;
      const fx = { layer: 'top', kind, x: from.x, y: from.y, ang: Math.atan2(to.y - from.y, to.x - from.x), a: 1, done: false, draw: drawShot };
      S.fx.push(fx);
      snd(kind);
      clock.tween(D(220), (v) => { a.squash = 0.6 * (1 - v); });
      return clock.tween(D(base * clamp(dist / (CW * 5), 0.6, 1.4)), (v, raw) => {
        const px = lerp(from.x, to.x, raw);
        const py = lerp(from.y, to.y, raw) - Math.sin(raw * Math.PI) * arc;
        if (raw > 0) fx.ang = Math.atan2(py - fx.y, px - fx.x);
        fx.x = px;
        fx.y = py;
        if (!hit) fx.a = 1 - smoothstep(0.7, 1, raw);
        if (kind === 'spark' || kind === 'sunbolt') {
          const trail = kind === 'spark' ? ['170,140,255', '120,220,255', '255,255,255'] : ['255,200,90', '255,236,160', '255,255,255'];
          parts.add({ kind: 'glow', x: px + range(-4, 4), y: py + range(-4, 4), vx: range(-30, 30), vy: range(-30, 30), size: range(6, 11),
            size1: 1, rgb: pick(trail), life: range(220, 420) });
        } else if (kind === 'sling' && rand() < 0.5) {
          parts.add({ kind: 'glow', x: px, y: py, size: 4, size1: 1, rgb: '200,200,220', alpha: 0.5, life: 200 });
        } else if (kind === 'snowball' && rand() < 0.4) {
          parts.add({ kind: 'flake', x: px, y: py, vx: range(-20, 20), vy: range(0, 30), size: 4, rgb: '230,245,255', alpha: 0.7, life: 400, vr: 3 });
        }
      }).then(() => {
        fx.done = true;
        if (!hit) return;
        if (kind === 'spark') {
          stars(to.x, to.y, 12, ['190,160,255', '140,230,255']);
          sparks(to.x, to.y, 10, ['210,190,255', '255,255,255']);
        } else if (kind === 'sunbolt') {
          stars(to.x, to.y, 12, ['255,214,110', '255,244,200']);
          sparks(to.x, to.y, 10, ['255,230,150', '255,255,255']);
        } else if (kind === 'sling') {
          dust(to.x, to.y, 6);
        } else if (kind === 'snowball') {
          snowPuff(to.x, to.y, 12);
        } else {
          sparks(to.x, to.y, 8);
        }
      });
    }
    function slash(t, a, bite) {
      const c = chestOf(t);
      const dir = a.x <= t.x ? 1 : -1;
      const fx = { layer: 'top', p: 0, done: false, draw(g) {
        const p = this.p;
        g.save();
        g.translate(c.x, c.y);
        g.scale(dir, 1);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 1 - p;
        g.strokeStyle = 'rgba(255,250,232,0.95)';
        g.lineCap = 'round';
        g.lineWidth = 12 * (1 - p) + 2;
        g.beginPath();
        if (bite) {
          // Two jaws snapping shut.
          const o = 30 * (1 - p) + 3;
          g.arc(0, -o - 34, 34, 0.3 * Math.PI, 0.7 * Math.PI);
          g.moveTo(34 * Math.cos(1.3 * Math.PI), o + 34 + 34 * Math.sin(1.3 * Math.PI));
          g.arc(0, o + 34, 34, 1.3 * Math.PI, 1.7 * Math.PI);
        } else {
          g.arc(-10, 0, 50, -1.9 + p * 0.5, 0.6 + p * 0.7);
        }
        g.stroke();
        g.restore();
      } };
      S.fx.push(fx);
      clock.tween(D(260), (v) => { fx.p = v; }, ease.outQuad).then(() => { fx.done = true; });
    }
    // A melee lunge. Resolves at the moment of impact; the step back finishes on its own.
    async function lunge(a, t, hit, bite) {
      const dx = t.x - a.x;
      const dy = t.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.min(dist * 0.42, CW * (a.boss ? 0.9 : 0.5));
      const nx = (dx / dist) * reach;
      const ny = (dy / dist) * reach * 0.6;
      setPose(a, 'attack', 380);
      snd(bite ? 'chomp' : 'swing');
      await clock.tween(D(130), (v) => {
        a.ox = nx * v;
        a.oy = ny * v;
      }, ease.inQuad);
      if (hit) slash(t, a, bite);
      clock.tween(D(190), (v) => {
        a.ox = nx * (1 - v);
        a.oy = ny * (1 - v);
      }, ease.outQuad).then(() => {
        a.ox = 0;
        a.oy = 0;
      });
    }
    function strike(pa, hit) {
      const { a, t, kind } = pa;
      S.lastBy = a;
      if (!a || !t) return Promise.resolve();
      faceTo(a, t.x);
      if (kind === 'arrow' || kind === 'spark' || kind === 'sunbolt' || kind === 'sling' || kind === 'snowball') return shoot(a, t, hit, kind);
      if (kind === 'gust') return gust(a);
      return lunge(a, t, hit, kind === 'bite');
    }
    async function missed(t, a) {
      if (!t) return;
      say(t, 'Miss', 'miss');
      snd('miss');
      const dir = a ? Math.sign(t.x - a.x) || 1 : 1;
      await clock.tween(D(300), (v, raw) => {
        t.ox = Math.sin(raw * Math.PI) * dir * CW * 0.17;
        t.hop = Math.sin(raw * Math.PI) * 6;
      });
      t.ox = 0;
      t.hop = 0;
    }
    async function gust(b) {
      if (clock.now - S.gustAt < D(900)) return; // one big gust per wing beat, however many it hits
      S.gustAt = clock.now;
      snd('gust');
      b.flapFast = 1;
      const c = chestOf(b);
      for (let i = 0; i < 46; i++) {
        const ang = rand() * TAU;
        const sp = range(380, 720);
        parts.add({ kind: 'streak', x: c.x + Math.cos(ang) * CW * 0.6, y: c.y + Math.sin(ang) * CH * 0.4 + CH * 0.3,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.55, size: range(2, 4), rgb: pick(['220,220,255', '190,170,255', '255,255,255']),
          alpha: 0.75, life: range(380, 640), drag: 1.5, len: 0.05 });
      }
      ringAt(b.x, b.y - CH * 0.6, CW * 0.5, CW * 3.2, '200,190,255', 620, 7);
      shakeIt(8, 450);
      await clock.wait(D(450));
      b.flapFast = 0;
    }

    // ------------------------------------------------------------ event players (one per event type)
    const P = {};
    P.room = async (e) => {
      S.curtain = 1;
      if (S.state && (!e.roomId || S.state.roomId === e.roomId)) sync(true);
      await clock.tween(D(750), (v) => { S.curtain = 1 - v; }, ease.inOutQuad);
      S.curtain = 0;
      if (S.bossIntro) await bossIntro();
    };
    // The boss's eyes flare in the dark and the chamber rumbles.
    async function bossIntro() {
      S.bossIntro = false;
      const b = [...S.units.values()].find((u) => u.boss);
      if (!b) return;
      snd('rumble');
      shakeIt(11, 1300);
      const g = groundOf(b);
      ringAt(g.x, g.y, CW * 0.5, CW * 3.6, b.glowRgb || '170,120,255', 900, 8);
      await clock.tween(D(1000), (v, raw) => { b.feed = Math.sin(raw * Math.PI); });
      b.feed = 0;
    }
    function fadeTemp(tl) {
      const a0 = tl.amt;
      clock.tween(D(600), (v) => { tl.amt = a0 * (1 - v); }).then(() => { S.temps = S.temps.filter((x) => x !== tl); });
    }
    P.turn = async (e) => {
      if (e.side === 'monsters') clearOptions();
      if (e.side === 'party') {
        // Fireburst light and Shield Wall last until the party's next turn.
        for (const tl of S.temps) if (tl.round) fadeTemp(tl);
        for (const u of S.units.values()) u.shield = false;
      }
      await clock.wait(D(140));
    };
    async function hopTo(u, c, r) {
      const a = anchor(u.size, c, r);
      const x0 = u.x;
      const y0 = u.y;
      faceTo(u, a.x);
      snd('step');
      await clock.tween(D(200), (v, raw) => {
        u.x = lerp(x0, a.x, v);
        u.y = lerp(y0, a.y, v);
        u.hop = Math.sin(raw * Math.PI) * CH * 0.17;
      }, ease.inOutQuad);
      u.hop = 0;
      u.c = c;
      u.r = r;
      if (u.reveal > 0.5) dust(u.x, u.y, 3);
    }
    async function swoop(u, dest) {
      const a = anchor(u.size, dest[0], dest[1]);
      const x0 = u.x;
      const y0 = u.y;
      faceTo(u, a.x);
      snd('swoop');
      u.flapFast = 1;
      // The moth trails shadow; the Color Dragon trails its glow color.
      const trail = glowRgbOf(u) || '40,22,84';
      await clock.tween(D(820), (v, raw) => {
        u.x = lerp(x0, a.x, v);
        u.y = lerp(y0, a.y, v);
        u.hop = Math.sin(raw * Math.PI) * CH * 0.95;
        u.scale = 1 + Math.sin(raw * Math.PI) * 0.08;
        if (rand() < 0.6) {
          parts.add({ kind: 'smoke', x: u.x + range(-1.2, 1.2) * CW, y: u.y - u.hop - range(0.4, 1.6) * CH, vx: range(-20, 20),
            vy: range(-10, 10), size: 16, size1: 34, rgb: trail, alpha: 0.45, life: 900, layer: 'world' });
        }
      }, ease.inOutCubic);
      u.hop = 0;
      u.scale = 1;
      u.c = dest[0];
      u.r = dest[1];
      u.flapFast = 0;
      shakeIt(5, 300);
      ringAt(u.x, u.y - CH * 0.6, CW * 0.6, CW * 2.4, glowRgbOf(u) || '180,170,255', 600, 5);
      dust(u.x - CW * 0.6, u.y - CH * 0.5, 4);
      dust(u.x + CW * 0.6, u.y - CH * 0.5, 4);
    }
    // A flying monster (Chillbat, Starwisp) glides along its whole path in one go with a wing-beat
    // bob and a pale trail: the Chillbat's hit-and-run flutter away.
    async function flutter(u, path) {
      const dest = path[path.length - 1];
      const a = anchor(u.size, dest[0], dest[1]);
      const x0 = u.x;
      const y0 = u.y;
      faceTo(u, a.x);
      snd('swoop');
      u.flapFast = 1;
      await clock.tween(D(180 + 110 * path.length), (v, raw) => {
        u.x = lerp(x0, a.x, v);
        u.y = lerp(y0, a.y, v);
        u.hop = Math.sin(raw * Math.PI) * CH * 0.3;
        if (rand() < 0.5) {
          parts.add({ kind: 'glow', x: u.x + range(-8, 8), y: u.y - hover(u) - unitH(u) * 0.5 + range(-8, 8), vx: range(-20, 20),
            vy: range(-10, 20), size: range(4, 8), size1: 1, rgb: u.look.eye || '220,220,255', alpha: 0.6, life: range(250, 450) });
        }
      }, ease.inOutSine);
      u.hop = 0;
      u.flapFast = 0;
      u.c = dest[0];
      u.r = dest[1];
    }
    P.move = async (e) => {
      const u = S.units.get(e.uid);
      if (!u || !Array.isArray(e.path)) return;
      let path = e.path.map(cellOf).filter(Boolean);
      if (path.length && sameCell(path[0], [u.c, u.r])) path = path.slice(1);
      if (!path.length) return;
      if (u.boss) return swoop(u, path[path.length - 1]);
      if (u.flying) return flutter(u, path);
      for (const [c, r] of path) await hopTo(u, c, r);
      clock.tween(D(170), (v, raw) => { u.squash = Math.sin(raw * Math.PI) * 0.7; }).then(() => { u.squash = 0; });
    };
    // Is a dice roll for this attacker coming before anything else happens?
    function rollAhead(uid, rest) {
      for (const ev of rest) {
        if (!ev) continue;
        if (ev.t === 'roll') return ev.uid === uid;
        if (ev.t !== 'spotted' && ev.t !== 'say') return false;
      }
      return false;
    }
    P.attack = async (e, rest) => {
      const a = S.units.get(e.uid);
      if (!a) return;
      const t = S.units.get(e.target);
      const kind = e.kind || (a.def && a.def.attackKind) || 'melee';
      if (t) {
        faceTo(a, t.x);
        if (!t.boss) faceTo(t, a.x);
      }
      if (kind === 'gust') {
        await gust(a);
        return;
      }
      if (e.item === 'lightning-scroll') {
        S.lastBy = a;
        await lightning(a, e);
        return;
      }
      S.pending = { a, t, kind };
      await clock.tween(D(150), (v, raw) => { a.squash = Math.sin(raw * Math.PI) * 0.8; });
      a.squash = 0;
      // No dice coming (an automatic hit): strike right away.
      if (!rollAhead(e.uid, rest)) {
        const pa = S.pending;
        S.pending = null;
        if (pa) await strike(pa, true);
      }
    };
    P.roll = async (e) => {
      await callHook('roll', e);
      const pa = S.pending && S.pending.a && S.pending.a.uid === e.uid ? S.pending : null;
      S.pending = null;
      if (!pa) return;
      const hit = e.hit !== false;
      await strike(pa, hit);
      if (hit) return;
      if (e.fumble) {
        const a = pa.a;
        clock.tween(D(520), (v, raw) => { a.rot = Math.sin(raw * Math.PI * 4) * 0.16 * (1 - raw); }).then(() => { a.rot = 0; });
      }
      await missed(pa.t, pa.a);
    };
    P.damage = async (e) => {
      if (S.pending) {
        const pa = S.pending;
        S.pending = null;
        await strike(pa, true);
      }
      const t = S.units.get(e.target);
      if (!t) return;
      const amt = num(e.amount);
      t.hp = e.hp != null ? num(e.hp) : Math.max(0, t.hp - amt);
      hitFlash(t);
      const by = S.units.get(e.by) || S.lastBy;
      recoil(t, by, e.crit ? 24 : 12);
      const c = chestOf(t);
      if (num(e.armored) > 0) clang(t, c, num(e.armored), by);
      sparks(c.x, c.y, e.crit ? 26 : 12);
      if (e.crit) {
        say(t, amt, 'critdmg');
        say(t, 'CRITICAL!', 'crit');
        stars(c.x, c.y, 22, [GOLD, '255,255,220'], [140, 420]);
        shakeIt(16, 560);
        flashIt('255,236,190', 0.42);
        snd('crit');
      } else {
        say(t, amt, 'dmg');
        snd('hit');
        if (t.boss || (by && by.boss)) shakeIt(7, 320);
      }
      await clock.wait(D(e.crit ? 720 : 420));
    };
    // Armor (the Clanker): a bright clang spark and a small brass shield showing the damage it
    // blocked, popping up beside the hit and drifting away.
    function clang(t, c, blocked, by) {
      snd('clank');
      sparks(c.x, c.y, 16, ['255,250,200', '255,220,120', '255,255,255']);
      ringAt(c.x, c.y, CW * 0.1, CW * 0.7, '255,230,150', 420, 5);
      const side = by && by.x > t.x ? -1 : 1;
      const fx = { layer: 'top', x: c.x + side * CW * 0.42, y: c.y - CH * 0.1, s: 0, a: 1, done: false, draw(g) {
        const k = 26 * this.s;
        if (k < 1) return;
        g.save();
        g.translate(this.x, this.y);
        g.globalAlpha = clamp(this.a, 0, 1);
        g.lineJoin = 'round';
        g.beginPath();
        g.moveTo(-k, -k * 0.9);
        g.lineTo(k, -k * 0.9);
        g.lineTo(k, k * 0.1);
        g.quadraticCurveTo(k, k * 0.8, 0, k * 1.15);
        g.quadraticCurveTo(-k, k * 0.8, -k, k * 0.1);
        g.closePath();
        g.fillStyle = '#d9a648';
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = '#4a2e0c';
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(-k * 0.7, -k * 0.7, k * 0.5, k * 1.2);
        g.font = `800 ${Math.round(k * 1.05)}px ${FX.NUM_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 4;
        g.strokeStyle = '#2a1606';
        g.strokeText('-' + blocked, 0, k * 0.05);
        g.fillStyle = '#fff6d6';
        g.fillText('-' + blocked, 0, k * 0.05);
        g.restore();
      } };
      S.fx.push(fx);
      const y0 = fx.y;
      clock.tween(D(1100), (v, raw) => {
        fx.s = raw < 0.2 ? ease.outBack(raw / 0.2) : 1;
        fx.y = y0 - raw * 40;
        fx.a = 1 - smoothstep(0.7, 1, raw);
      }).then(() => { fx.done = true; });
    }
    P.heal = async (e) => {
      const t = S.units.get(e.target);
      if (!t) return;
      const amt = num(e.amount);
      t.hp = e.hp != null ? num(e.hp) : Math.min(t.maxHp, t.hp + amt);
      say(t, '+' + amt, 'heal');
      snd('heal');
      const g = groundOf(t);
      // Healing from green flame light (source 'green') sparkles in that green.
      const src = isColor(e.source) ? flameRgb(e.source) : null;
      const rgbs = src ? [src, FX.mixRgb(src, '255,255,255', 0.5), '200,255,210'] : ['140,255,170', '200,255,210', '120,240,255'];
      t.glowHealRgb = src;
      burst(g.x, g.y - CH * 0.2, 16, { speed: [20, 60], life: [700, 1200], size: [6, 11], rgb: rgbs,
        jitter: CW * 0.3, up: 60, extra: { kind: 'star', ay: -40, drag: 1 } });
      ringAt(g.x, g.y, CW * 0.2, CW * 0.7, rgbs[0], 600, 4);
      clock.tween(D(800), (v, raw) => { t.glowHeal = Math.sin(raw * Math.PI); }).then(() => { t.glowHeal = 0; });
      await clock.wait(D(460));
    };
    function lean(a, x) {
      const dx = clamp(x - a.x, -CW, CW) * 0.2;
      clock.tween(D(320), (v, raw) => { a.ox = dx * Math.sin(raw * Math.PI); }).then(() => { a.ox = 0; });
    }
    P.down = async (e) => {
      const u = S.units.get(e.uid);
      if (!u) return;
      u.down = true;
      snd('down');
      await clock.tween(D(560), (v) => { u.downAmt = v; }, ease.outBounce);
      u.downAmt = 1;
      const g = groundOf(u);
      dust(g.x, g.y, 6);
      await clock.wait(D(200));
    };
    P.up = async (e) => {
      const u = S.units.get(e.uid);
      if (!u) return;
      const by = S.units.get(e.by);
      if (by) {
        faceTo(by, u.x);
        lean(by, u.x);
      }
      snd('up');
      if (e.hp != null) u.hp = num(e.hp);
      const g = groundOf(u);
      stars(g.x, g.y - CH * 0.5, 22, [GOLD, '255,255,220', '140,255,170'], [80, 260]);
      ringAt(g.x, g.y, CW * 0.3, CW * 1.1, GOLD, 700, 6);
      await clock.tween(D(520), (v) => { u.downAmt = 1 - v; }, ease.outBack);
      u.downAmt = 0;
      u.down = false;
      say(u, 'Back up!', 'up');
      await clock.wait(D(260));
    };
    async function wisps(u) {
      snd('poof');
      const c = chestOf(u);
      burst(c.x, c.y, 26, { speed: [40, 190], life: [700, 1200], size: [10, 18], rgb: ['50,26,96', '70,40,120', '30,18,64'], up: 40,
        jitter: 20, extra: { kind: 'smoke', size1: 34, drag: 1.8, alpha: 0.75, add: false, fadeIn: 0.05 } });
      stars(c.x, c.y, 12, ['200,170,255', '160,220,255']);
      await clock.tween(D(560), (v) => {
        u.alpha = 1 - v;
        u.scale = 1 + v * 0.3;
        u.oy = -v * 16;
      }, ease.outQuad);
    }
    async function clatter(u) {
      snd('bones');
      await clock.tween(D(420), (v, raw) => {
        u.ox = Math.sin(raw * 70) * 5 * (1 - raw * 0.4);
        u.rot = Math.sin(raw * 53) * 0.07;
      });
      u.ox = 0;
      u.rot = 0;
      const c = chestOf(u);
      burst(c.x, c.y, 9, { speed: [120, 290], life: [1100, 1500], size: [9, 14], rgb: '0,0,0', ang: -Math.PI / 2, spread: 1.3, spin: 12,
        extra: { kind: 'bone', ay: 1100, floor: u.y + 6, fadeOut: 0.25 } });
      dust(u.x, u.y, 8);
      await clock.tween(D(380), (v) => {
        u.alpha = 1 - v;
        u.collapse = v;
      }, ease.inQuad);
    }
    async function poof(u, spores) {
      snd('poof');
      const c = chestOf(u);
      burst(c.x, c.y, 12, { speed: [60, 200], life: [600, 900], size: [16, 26], up: 30, jitter: 26,
        rgb: spores ? ['190,240,140', '220,200,255'] : ['235,232,245', '200,200,215'],
        extra: { kind: 'smoke', size1: 46, drag: 2.4, alpha: 0.85, add: false, fadeIn: 0.03 } });
      stars(c.x, c.y, 10, spores ? ['200,255,170', '255,230,140'] : [GOLD, '255,255,230']);
      await clock.tween(D(420), (v) => {
        u.alpha = 1 - v;
        u.scale = 1 - v * 0.4;
      }, ease.inQuad);
    }
    async function bossDefeat(u) {
      snd('poof');
      shakeIt(12, 900);
      flashIt('255,240,210', 0.32);
      const c = chestOf(u);
      burst(c.x, c.y, 50, { speed: [60, 300], life: [900, 1500], size: [16, 30], rgb: ['50,26,96', '70,40,120', '30,18,64'], up: 30,
        jitter: CW, extra: { kind: 'smoke', size1: 60, drag: 1.6, alpha: 0.7, add: false, fadeIn: 0.05 } });
      stars(c.x, c.y, 40, [GOLD, '170,220,255', '255,255,230'], [100, 420]);
      // Gloamwing shrinks into a tiny moth and flutters away.
      const x0 = u.x;
      const y0 = u.y;
      await clock.tween(D(1500), (v, raw) => {
        u.scale = lerp(1, 0.1, v);
        u.x = x0 + Math.sin(raw * 9) * CW * 0.3 * raw + raw * CW * 1.2;
        u.y = y0 - raw * CH * 2.2;
        u.alpha = 1 - smoothstep(0.75, 1, raw);
      }, ease.inOutQuad);
    }
    // Chapter 2 defeats. A Greyling smudges away in grey ink; icy things puff into snow; a lava
    // blob pops into droplets (the split event then grows the Blobbits); the Clanker rattles apart
    // in bolts and steam; the Vine Snapper wilts into petals; a Starwisp twinkles out.
    async function smudge(u) {
      snd('poof');
      const c = chestOf(u);
      burst(c.x, c.y, 22, { speed: [30, 150], life: [600, 1100], size: [12, 20], rgb: u.look.smoke || ['120,120,138', '88,88,104'], up: 20,
        jitter: 18, extra: { kind: 'smoke', size1: 38, drag: 2, alpha: 0.8, add: false, fadeIn: 0.04 } });
      stars(c.x, c.y, 6, ['240,240,255', '255,255,255'], [40, 140]);
      await clock.tween(D(460), (v) => {
        u.alpha = 1 - v;
        u.collapse = v * 0.5;
        u.scale = 1 + v * 0.3;
      }, ease.inQuad);
    }
    async function frostPop(u) {
      snd('freeze');
      const c = chestOf(u);
      snowPuff(c.x, c.y, 14);
      stars(c.x, c.y, 10, ['200,240,255', '255,255,255'], [60, 200]);
      await clock.tween(D(420), (v) => {
        u.alpha = 1 - v;
        u.scale = 1 + v * 0.25;
      }, ease.inQuad);
    }
    async function blobPop(u) {
      snd('split');
      const c = chestOf(u);
      await clock.tween(D(200), (v, raw) => { u.squash = Math.sin(raw * Math.PI) * 1.2; });
      u.squash = 0;
      lavaDrops(c.x, c.y, 24);
      ringAt(u.x, u.y, CW * 0.2, CW * 1.1, '255,150,60', 450, 6);
      await clock.tween(D(260), (v) => {
        u.alpha = 1 - v;
        u.scale = 1 + v * 0.5;
        u.collapse = v * 0.7;
      }, ease.outQuad);
    }
    async function clankApart(u) {
      snd('clank');
      await clock.tween(D(380), (v, raw) => {
        u.ox = Math.sin(raw * 70) * 5 * (1 - raw * 0.4);
        u.rot = Math.sin(raw * 53) * 0.06;
      });
      u.ox = 0;
      u.rot = 0;
      const c = chestOf(u);
      sparks(c.x, c.y, 18, ['255,230,150', '255,255,255']);
      burst(c.x, c.y, 10, { speed: [120, 300], life: [1000, 1400], size: [5, 8], rgb: '0,0,0', ang: -Math.PI / 2, spread: 1.3, spin: 10,
        extra: { kind: 'coin', fill: '#b7b9c6', edge: '#2a2c38', ay: 1100, floor: u.y + 6, fadeOut: 0.25 } });
      burst(c.x, c.y + 10, 12, { speed: [30, 90], life: [800, 1300], size: [12, 20], rgb: ['220,225,235', '190,195,210'], up: 70, jitter: 16,
        extra: { kind: 'smoke', size1: 40, drag: 1.4, alpha: 0.7, add: false, fadeIn: 0.05 } });
      await clock.tween(D(400), (v) => {
        u.alpha = 1 - v;
        u.collapse = v;
      }, ease.inQuad);
    }
    async function petals(u) {
      snd('poof');
      const c = chestOf(u);
      burst(c.x, c.y, 26, { speed: [40, 170], life: [800, 1400], size: [6, 11], rgb: ['255,150,190', '255,210,120', '140,220,110', '255,120,150'],
        up: 40, jitter: 20, extra: { kind: 'glow', drag: 1.4, ay: 90, size1: 3, squash: 0.6, add: false, alpha: 0.95 } });
      stars(c.x, c.y, 8, ['200,255,170', '255,240,160']);
      await clock.tween(D(520), (v) => {
        u.alpha = 1 - v;
        u.collapse = v * 0.8;
        u.rot = v * 0.3 * u.facing;
      }, ease.inQuad);
    }
    async function twinkleOut(u) {
      snd('blink');
      const c = chestOf(u);
      stars(c.x, c.y, 26, [u.look.eye || '230,200,255', '255,255,255', '190,160,255'], [60, 260]);
      ringAt(c.x, c.y, CW * 0.1, CW * 1.2, '220,190,255', 520, 5);
      await clock.tween(D(420), (v, raw) => {
        u.alpha = 1 - v;
        u.scale = 1 + Math.sin(raw * Math.PI) * 0.35;
        u.oy = -v * 30;
      }, ease.inQuad);
    }
    // Pebblebelly hiccups the four flames out, which zoom off in their colors, and shrinks into
    // a small friendly rainbow dragon that stays, bobbing happily, until the room changes.
    async function dragonDefeat(u) {
      snd('poof');
      shakeIt(8, 700);
      flashIt('255,255,255', 0.3);
      const m = mouthOf(u);
      const c = chestOf(u);
      for (let i = 0; i < NCOL; i++) {
        const rgb = flameRgb(COLOR_NAMES[i]) || GOLD;
        const ang = -Math.PI / 2 + (i - 1.5) * 0.5;
        burst(m.x, m.y, 18, { speed: [200, 480], life: [700, 1300], size: [8, 16], rgb: [rgb, FX.mixRgb(rgb, '255,255,255', 0.5)], ang, spread: 0.25,
          extra: { kind: 'glow', drag: 1.2, ay: -60, size1: 3 } });
        burst(m.x, m.y, 8, { speed: [120, 300], life: [800, 1400], size: [8, 14], rgb, ang, spread: 0.4, extra: { kind: 'star', drag: 1.4, ay: -40 } });
      }
      stars(c.x, c.y, 30, [GOLD, '255,255,230'], [80, 360]);
      const k0 = u.scale;
      await clock.tween(D(1300), (v, raw) => {
        u.scale = lerp(k0, 0.36, v);
        u.hop = Math.abs(Math.sin(raw * Math.PI * 3)) * CH * 0.25 * (1 - raw);
      }, ease.inOutQuad);
      u.hop = 0;
      // The little dragon lives on as a decoration drawn where the big one stood.
      const sp = u.dsp;
      if (sp) {
        const x = u.x;
        const y = u.y - hover(u) * 0.4;
        const w = (u.dw || unitW(u)) * 0.36;
        const h = (u.dh || unitH(u)) * 0.36;
        const facing = sp.noFlip ? 1 : u.facing;
        const ax = u.dax != null ? u.dax : 0.5;
        const belly = u.look.belly || [0.5, 0.6];
        const t0 = clock.now;
        S.fx.push({ layer: 'world', done: false, draw(g) {
          const t = (clock.now - t0) / 1000;
          const bob = Math.sin(t * 3) * 4;
          g.save();
          g.translate(x, y - bob);
          g.scale(facing, 1);
          g.drawImage(sp.cv, -w * ax, -h, w, h);
          g.globalCompositeOperation = 'lighter';
          const r = w * 0.3;
          g.drawImage(FX.glow(rainbowRgb(t)), (belly[0] - ax) * w - r, (belly[1] - 1) * h - r, r * 2, r * 2);
          g.restore();
        } });
      }
      u.alpha = 0;
      ringAt(u.x, u.y, CW * 0.3, CW * 2.5, GOLD, 800, 7);
    }
    P.defeated = async (e) => {
      const u = S.units.get(e.uid);
      if (!u || u.dying) return;
      u.dying = true;
      if (S.opt) S.opt.targets.delete(u.uid);
      const c = chestOf(u);
      S.lastDefeat = { x: c.x, y: c.y, floor: u.y };
      const style = u.look.defeat || (u.boss ? 'boss' : 'poof');
      if (style === 'bones') await clatter(u);
      else if (style === 'wisps') await wisps(u);
      else if (style === 'boss') await bossDefeat(u);
      else if (style === 'dragon') await dragonDefeat(u);
      else if (style === 'smudge') await smudge(u);
      else if (style === 'frost') await frostPop(u);
      else if (style === 'blob') await blobPop(u);
      else if (style === 'clank') await clankApart(u);
      else if (style === 'petals') await petals(u);
      else if (style === 'twinkle') await twinkleOut(u);
      else await poof(u, style === 'spores');
      S.units.delete(u.uid);
    };
    P.spotted = async (e, rest) => {
      const u = S.units.get(e.uid);
      if (!u) return;
      u.spotted = true;
      u.vis = true;
      if (u.reveal > 0.9) return;
      snd('spot');
      say(u, '!', 'alert');
      // Mid-attack (a roll or a hit comes next) the reveal is quick, so the fight keeps its pace.
      const quick = rest[0] && (rest[0].t === 'roll' || rest[0].t === 'damage');
      await clock.tween(D(quick ? 160 : 380), (v) => { u.reveal = Math.max(u.reveal, v); }, ease.outQuad);
    };
    P.summon = async (e) => {
      const src = S.state && (S.state.monsters || []).find((m) => m && m.uid === e.uid);
      let u = S.units.get(e.uid);
      if (!u) S.units.set(e.uid, (u = makeUnit('monster', e.uid, (src && src.type) || 'gloomling')));
      const at = cellOf(e.at) || (src && cellOf(src.at));
      if (at) placeUnit(u, at[0], at[1]);
      if (src) syncUnit(u, src);
      u.reveal = visibleNow(u, false) ? 1 : 0;
      u.alpha = 0;
      // Blobbits from a split hop out of the popped blob instead of swirling in.
      if (S.split && S.split.into.has(e.uid)) return blobHop(u, S.split);
      snd('summon');
      const c = chestOf(u);
      // Shadow things swirl in from violet smoke; Greylings from grey ink (look.smoke).
      burst(c.x, c.y, 18, { speed: [20, 60], life: [500, 900], size: [12, 20], rgb: u.look.smoke || ['50,26,96', '80,50,140'], jitter: CW * 0.5,
        extra: { kind: 'smoke', size1: 6, alpha: 0.8, add: false, layer: 'top' } });
      stars(c.x, c.y, 10, u.look.smoke ? ['240,240,255', '200,200,220'] : ['190,160,255', '150,220,255']);
      await clock.tween(D(520), (v) => {
        u.alpha = v;
        u.scale = 0.4 + 0.6 * v;
      }, ease.outBack);
      u.alpha = 1;
      u.scale = 1;
    };
    async function blobHop(u, from) {
      u.reveal = 1;
      u.alpha = 1;
      const x1 = u.x;
      const y1 = u.y;
      const x0 = from.x;
      const y0 = from.y + CH * 0.3;
      u.x = x0;
      u.y = y0;
      faceTo(u, x1);
      await clock.tween(D(460), (v, raw) => {
        u.x = lerp(x0, x1, v);
        u.y = lerp(y0, y1, v);
        u.hop = Math.sin(raw * Math.PI) * CH * 0.8;
        u.scale = 0.5 + 0.5 * v;
        u.squash = raw < 0.5 ? -0.3 * Math.sin(raw * Math.PI) : 0;
      }, ease.outQuad);
      u.hop = 0;
      u.scale = 1;
      lavaDrops(u.x, u.y - CH * 0.2, 8);
      snd('split');
      clock.tween(D(260), (v, raw) => { u.squash = Math.sin(raw * Math.PI) * 0.9; }).then(() => { u.squash = 0; });
    }

    // The Heart Lantern blazes back to life (victory).
    async function heartBloom(p) {
      if (p.lightR && p.litAmt > 0) return;
      heartOn(p, 0);
      snd('whoomph');
      const top = { x: p.x, y: p.y - propSprite(p).h * 0.5 };
      flashIt('255,240,200', 0.3);
      stars(top.x, top.y, 40, [GOLD, '255,255,230'], [100, 380]);
      ringAt(p.x, p.y - CH * 0.3, CW * 0.4, CW * 4.5, GOLD, 1000, 10);
      await clock.tween(D(1400), (v) => { p.litAmt = v; }, ease.outCubic);
      p.litAmt = 1;
    }
    P.light = async (e) => {
      const p = S.props.get(e.prop);
      if (!p || (p.lit && p.litAmt >= 1)) return;
      if (!p.brazier) return heartBloom(p);
      const by = S.units.get(e.by);
      if (by) {
        faceTo(by, p.x);
        lean(by, p.x);
        await clock.wait(D(140));
      }
      p.lit = true;
      // A colored brazier (Chapter 2) chimes and floods its color back; gold goes whoomph.
      const pal = p.pal;
      snd(pal ? 'chime' : 'whoomph');
      const fp = firePos(p);
      if (!S.reduced) {
        const flRgb = pal ? pal.rgb : '255,214,140';
        const flCore = pal ? FX.mixRgb(pal.rgb, '255,255,255', 0.7) : '255,255,240';
        const fl = { layer: 'top', a: 1, done: false, draw(g) {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = clamp(this.a, 0, 1);
          g.drawImage(FX.glow(flRgb), fp.x - CW * 2.4, fp.y - CW * 2.4, CW * 4.8, CW * 4.8);
          g.drawImage(FX.glow(flCore), fp.x - CW * 0.7, fp.y - CW * 0.7, CW * 1.4, CW * 1.4);
        } };
        S.fx.push(fl);
        clock.tween(D(560), (v) => { fl.a = 1 - v; }, ease.outQuad).then(() => { fl.done = true; });
        if (pal) flashIt(pal.pale, 0.14);
      }
      burst(fp.x, fp.y, 44, { speed: [120, 380], life: [700, 1500], size: [2.5, 5], rgb: pal ? [pal.rgb, pal.pale, pal.deep] : ['255,170,60', '255,220,120', '255,130,40'],
        ang: -Math.PI / 2, spread: 1.25, extra: { kind: 'ember', ay: 140, drag: 1.6, size1: 0.8, fadeIn: 0.02, core: pal ? pal.pale : null } });
      if (pal) stars(fp.x, fp.y, 14, [pal.rgb, pal.pale, '255,255,255'], [80, 320]);
      ringAt(p.x, p.y - CH * 0.2, CW * 0.3, CW * 2.4, pal ? pal.pale : '255,196,110', 640, 6);
      // The light blooms outward with easing and a little overshoot.
      await clock.tween(D(950), (v, raw) => {
        p.litAmt = v;
        p.bloom = Math.sin(raw * Math.PI) * 0.16;
      }, ease.outCubic);
      p.litAmt = 1;
      p.bloom = 0;
    };
    // Light sucked along curving paths from one point into another (Eat the Light).
    function stream(from, to, n, dur, rgb, big) {
      const t0 = clock.now;
      const motes = [];
      for (let i = 0; i < n; i++) {
        motes.push({ delay: rand() * dur * 0.65, life: dur * range(0.35, 0.5), size: range(5, 11) * (big || 1),
          cx: lerp(from.x, to.x, 0.5) + range(-1.6, 1.6) * CW, cy: Math.min(from.y, to.y) - range(0.3, 1.8) * CH });
      }
      S.fx.push({ layer: 'top', done: false, draw(g) {
        const t = clock.now - t0;
        g.globalCompositeOperation = 'lighter';
        for (const m of motes) {
          const k = (t - m.delay) / m.life;
          if (k < 0 || k > 1) continue;
          const q = ease.inQuad(k);
          const x = (1 - q) * (1 - q) * from.x + 2 * (1 - q) * q * m.cx + q * q * to.x;
          const y = (1 - q) * (1 - q) * from.y + 2 * (1 - q) * q * m.cy + q * q * to.y;
          g.globalAlpha = Math.sin(k * Math.PI) * 0.95;
          g.drawImage(FX.glow(rgb), x - m.size, y - m.size, m.size * 2, m.size * 2);
        }
        if (t > dur * 1.3) this.done = true;
      } });
    }
    // Eat the Light (Gloamwing) and Gobble Color (Pebblebelly): the brazier's flame streams into
    // the boss's mouth in the flame's own color, and the dragon's belly lights up with it.
    async function eatLight(b, p) {
      snd(b.look.dragon ? 'gobble' : 'eat');
      const fp = firePos(p);
      const to = mouthOf(b);
      const rgb = p.rgb || '255,200,100';
      const pale = p.pal ? p.pal.pale : '255,240,190';
      faceTo(b, p.x);
      stream(fp, to, 70, D(1100), rgb, 1.6);
      stream({ x: fp.x, y: fp.y - CH * 0.3 }, to, 26, D(1100), pale, 1.2);
      const rib = { layer: 'top', a: 0, done: false, draw(g) {
        g.globalCompositeOperation = 'lighter';
        g.lineCap = 'round';
        const mx = (fp.x + to.x) / 2;
        const my = Math.min(fp.y, to.y) - CH * 0.8;
        for (const [w, al] of [[34, 0.16], [12, 0.4], [4, 0.8]]) {
          g.globalAlpha = clamp(this.a * al, 0, 1);
          g.strokeStyle = `rgb(${p.rgb ? pale : '255,214,130'})`;
          g.lineWidth = w;
          g.beginPath();
          g.moveTo(fp.x, fp.y);
          g.quadraticCurveTo(mx, my, to.x, to.y);
          g.stroke();
        }
      } };
      S.fx.push(rib);
      clock.tween(D(1250), (v, raw) => { rib.a = Math.sin(raw * Math.PI) * (0.75 + 0.25 * Math.sin(raw * 40)); }).then(() => { rib.done = true; });
      await clock.tween(D(1150), (v, raw) => {
        p.litAmt = 1 - ease.inCubic(raw);
        b.feed = Math.sin(raw * Math.PI * 0.5);
        b.belly = raw * 0.9;
        S.darkBoost = Math.sin(raw * Math.PI) * 0.08;
      });
      p.lit = false;
      p.litAmt = 0;
      S.darkBoost = 0;
      stars(to.x, to.y, 16, [p.rgb || GOLD, pale], [60, 200]);
      await clock.tween(D(420), (v, raw) => {
        b.scale = 1 + Math.sin(raw * Math.PI) * 0.08;
        b.feed = 1 - raw;
        b.belly = (1 - raw) * 0.9;
      });
      b.scale = 1;
      b.feed = 0;
      b.belly = 0;
    }
    P.snuff = async (e) => {
      const p = S.props.get(e.prop);
      if (!p) return;
      const by = S.units.get(e.by);
      if (by && by.boss) return eatLight(by, p);
      if (by) {
        faceTo(by, p.x);
        setPose(by, 'attack', 420); // the Lantern Goblin jabs its bell snuffer at the flame
        lean(by, p.x);
        await clock.wait(D(160));
      }
      snd('snuff');
      const fp = firePos(p);
      burst(fp.x, fp.y - CH * 0.15, 14, { speed: [20, 70], life: [800, 1300], size: [8, 14], rgb: ['130,130,145', '100,100,118'], up: 50,
        jitter: 10, extra: { kind: 'smoke', size1: 30, drag: 1, alpha: 0.7, add: false, fadeIn: 0.05 } });
      await clock.tween(D(520), (v) => { p.litAmt = 1 - v; }, ease.inQuad);
      p.lit = false;
      p.litAmt = 0;
    };
    P.bright = async () => {
      snd('bright');
      if (!S.reduced) clock.tween(D(1100), (v, raw) => { S.wash = Math.sin(raw * Math.PI) * 0.16; }).then(() => { S.wash = 0; });
      for (const u of S.units.values()) {
        if (u.kind !== 'hero') continue;
        const c = chestOf(u);
        stars(c.x, c.y, 8, [GOLD, '255,255,220'], [40, 140]);
      }
      await clock.wait(D(650));
    };

    // ------------------------------------------------------------ abilities and items
    const titleCase = (s) => String(s).replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
    function abilityName(u, id) {
      if (u && u.def) {
        if (u.def.ability && u.def.ability.id === id) return u.def.ability.name;
        if (u.def.mend && u.def.mend.id === id) return u.def.mend.name;
        for (const m of u.def.moves || []) if (m && m.id === id) return m.name;
      }
      const it = data.items && data.items[id];
      return it ? it.name : '';
    }
    function unitOn(at) {
      for (const u of S.units.values()) {
        if (!u.dying && at[0] >= u.c && at[0] < u.c + u.size && at[1] >= u.r && at[1] < u.r + u.size) return u;
      }
      return null;
    }
    async function flourish(u, rgb) {
      if (!u) return;
      snd('sparkle');
      const c = chestOf(u);
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * TAU;
        parts.add({ kind: 'star', x: c.x + Math.cos(ang) * 30, y: c.y + Math.sin(ang) * 30, vx: Math.cos(ang + 1.4) * 140,
          vy: Math.sin(ang + 1.4) * 140 - 30, size: range(6, 10), rgb: pick(rgb), life: range(500, 800), drag: 2.5 });
      }
      await clock.wait(D(380));
    }
    async function fireburst(u, e, bomb) {
      const area = Array.isArray(e.area) ? e.area.map(cellOf).filter(Boolean) : [];
      const at = cellOf(e.at) || (area.length ? area[Math.floor(area.length / 2)] : null);
      if (!at) return flourish(u, ['255,150,60']);
      const cells = area.length ? area : areaAround(at[0], at[1], 1);
      const center = centerOf(at[0], at[1]);
      if (u && !bomb) setPose(u, 'attack', 420); // the staff thrusts out for the charge and throw
      const from = u ? (bomb ? chestOf(u) : tipOf(u)) : { x: center.x, y: -40 };
      if (u) faceTo(u, center.x);
      if (u && !bomb) {
        snd('charge');
        for (let i = 0; i < 18; i++) {
          const ang = rand() * TAU;
          const d = range(40, 90);
          parts.add({ kind: 'glow', x: from.x + Math.cos(ang) * d, y: from.y + Math.sin(ang) * d, vx: -Math.cos(ang) * d * 3.2,
            vy: -Math.sin(ang) * d * 3.2, size: range(4, 8), size1: 2, rgb: pick(['255,150,60', '255,210,120']), life: 300 });
        }
        await clock.wait(D(300));
      }
      snd(bomb ? 'throw' : 'fire');
      const fx = { layer: 'top', kind: bomb ? 'bomb' : 'fireball', x: from.x, y: from.y, ang: 0, a: 1, spin: 0, done: false, draw: drawShot };
      S.fx.push(fx);
      await clock.tween(D(440), (v, raw) => {
        const px = lerp(from.x, center.x, raw);
        const py = lerp(from.y, center.y, raw) - Math.sin(raw * Math.PI) * CH * 1.3;
        fx.ang = Math.atan2(py - fx.y, px - fx.x);
        fx.x = px;
        fx.y = py;
        fx.spin = raw * 12;
        parts.add({ kind: 'glow', x: px, y: py, vx: range(-20, 20), vy: range(-20, 20), size: range(8, 14), size1: 2,
          rgb: pick(['255,120,40', '255,190,80']), life: range(200, 380) });
      });
      fx.done = true;
      snd('boom');
      shakeIt(10, 500);
      flashIt('255,170,90', 0.3);
      const flare = { layer: 'top', a: 1, done: false, draw(g) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = clamp(this.a, 0, 1);
        g.drawImage(FX.glow('255,150,60'), center.x - CW * 2.2, center.y - CH * 2, CW * 4.4, CH * 4);
        g.drawImage(FX.glow('255,240,200'), center.x - CW * 0.9, center.y - CH * 0.9, CW * 1.8, CH * 1.8);
      } };
      S.fx.push(flare);
      clock.tween(D(520), (v) => { flare.a = 1 - v; }, ease.outQuad).then(() => { flare.done = true; });
      burst(center.x, center.y, 16, { speed: [40, 120], life: [700, 1200], size: [16, 28], rgb: ['90,70,70', '70,60,64'], up: 50, jitter: CW * 0.6,
        extra: { kind: 'smoke', size1: 46, drag: 1.4, alpha: 0.5, add: false, fadeIn: 0.25 } });
      ringAt(center.x, center.y, CW * 0.3, CW * 1.9, '255,170,80', 600, 9);
      for (const [c, r] of cells) {
        const p = centerOf(c, r);
        burst(p.x, p.y, 8, { speed: [30, 150], life: [450, 950], size: [12, 24], rgb: ['255,120,40', '255,190,80', '255,230,150'], up: 50,
          jitter: CW * 0.3, extra: { kind: 'glow', drag: 2, size1: 3, ay: -60 } });
      }
      burst(center.x, center.y, 30, { speed: [150, 420], life: [500, 1000], size: [2.5, 5], rgb: ['255,180,70', '255,230,140'],
        extra: { kind: 'ember', drag: 2, ay: 200, size1: 0.8 } });
      // Fireburst keeps its square lit until the end of the round; a firebomb just flashes.
      const tl = { x: center.x, y: center.y, rad: 2.7, amt: 0, cells: bomb ? null : cells, rgb: '255,130,50', round: !bomb };
      S.temps.push(tl);
      clock.tween(D(700), (v, raw) => { tl.amt = raw < 0.2 ? raw / 0.2 : 1 - 0.35 * ((raw - 0.2) / 0.8); }).then(() => {
        if (bomb) fadeTemp(tl);
      });
      await clock.wait(D(260));
    }
    async function sunburst(u) {
      if (!u) return;
      setPose(u, 'attack', 450); // the lantern staff raised high
      snd('sunburst');
      const g = groundOf(u);
      const c = chestOf(u);
      flashIt('255,226,150', 0.25);
      ringAt(g.x, g.y, CW * 0.3, CW * 2.6, GOLD, 800, 9);
      ringAt(g.x, g.y, CW * 0.2, CW * 2.0, '255,250,220', 650, 5);
      stars(c.x, c.y, 34, [GOLD, '255,255,230', '255,190,90'], [120, 380]);
      const tl = { x: g.x, y: g.y - CH * 0.2, rad: 3.4, amt: 0, rgb: '255,200,110' };
      S.temps.push(tl);
      clock.tween(D(1100), (v, raw) => { tl.amt = Math.sin(raw * Math.PI) * 0.9; }).then(() => {
        S.temps = S.temps.filter((x) => x !== tl);
      });
      await clock.wait(D(520));
    }
    async function shieldWall(u) {
      if (!u) return;
      snd('shield');
      u.shield = true;
      const g = groundOf(u);
      const c = chestOf(u);
      ringAt(g.x, g.y, CW * 0.2, CW * 0.95, '120,180,255', 650, 7);
      stars(c.x, c.y, 16, ['130,190,255', '220,240,255'], [60, 200]);
      await clock.wait(D(420));
    }
    async function lightning(u, e) {
      const at = cellOf(e.at);
      const t = S.units.get(e.target) || (at && unitOn(at));
      const c = t ? chestOf(t) : at ? centerOf(at[0], at[1]) : null;
      if (!c) return flourish(u, ['150,220,255']);
      snd('zap');
      const pts = [];
      let x = c.x + range(-80, 80);
      for (let i = 0; i <= 10; i++) {
        const k = i / 10;
        x = lerp(x, c.x, 0.35) + (i < 10 ? range(-26, 26) : 0);
        pts.push([i < 10 ? x : c.x, lerp(-30, c.y, k)]);
      }
      const fx = { layer: 'top', a: 1, done: false, draw(g) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = clamp(this.a, 0, 1);
        g.lineJoin = 'round';
        g.lineCap = 'round';
        for (const [w, col] of [[16, 'rgba(120,200,255,0.45)'], [5, 'rgba(255,255,255,0.95)']]) {
          g.lineWidth = w;
          g.strokeStyle = col;
          g.beginPath();
          pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
          g.stroke();
        }
      } };
      S.fx.push(fx);
      flashIt('200,230,255', 0.45);
      shakeIt(7, 300);
      sparks(c.x, c.y, 18, ['200,240,255', '255,255,255']);
      await clock.tween(D(380), (v, raw) => { fx.a = raw < 0.15 ? 1 : raw < 0.3 ? 0.45 : 1 - raw; });
      fx.done = true;
    }
    async function sunbeam(u) {
      snd('sunbeam');
      const c = u ? chestOf(u) : { x: W / 2, y: H / 2 };
      const fx = { layer: 'top', a: 0, done: false, draw(g) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = clamp(this.a, 0, 1);
        const gr = g.createLinearGradient(c.x, 0, c.x, c.y);
        gr.addColorStop(0, 'rgba(255,230,150,0)');
        gr.addColorStop(1, 'rgba(255,230,150,0.8)');
        g.fillStyle = gr;
        g.fillRect(c.x - 44, 0, 88, c.y);
      } };
      S.fx.push(fx);
      stars(c.x, c.y, 30, [GOLD, '255,255,230'], [80, 300]);
      await clock.tween(D(700), (v, raw) => { fx.a = Math.sin(raw * Math.PI); });
      fx.done = true;
    }
    async function brightOil(u) {
      if (!u) return;
      snd('sparkle');
      const from = u.light;
      const c = chestOf(u);
      stars(c.x, c.y, 16, [GOLD, '255,255,220'], [60, 220]);
      await clock.tween(D(700), (v) => { u.lightR = lerp(from, from + 2, v); }, ease.outBack);
      u.light = from + 2;
      u.lightR = null;
    }
    async function bossCall(b) {
      snd('summon');
      shakeIt(8, 600);
      const g = groundOf(b);
      ringAt(g.x, g.y, CW * 0.5, CW * 3.4, '170,120,255', 800, 8);
      await clock.wait(D(500));
    }
    P.ability = async (e) => {
      const u = S.units.get(e.uid);
      const id = String(e.id || '');
      const name = e.name || abilityName(u, id);
      if (u && name && (u.kind === 'hero' || u.boss)) say(u, name + '!', 'ability');
      switch (id) {
        case 'fireburst': return fireburst(u, e, false);
        case 'firebomb': return fireburst(u, e, true);
        case 'sunburst': return sunburst(u);
        case 'shield-wall': return shieldWall(u);
        case 'twin-arrows': return flourish(u, ['140,255,170', '255,240,160']);
        case 'mend':
          setPose(u, 'attack', 420); // Oren raises his lantern staff to heal
          return flourish(u, ['140,255,170', '220,255,230', '255,240,190']);
        case 'potion':
        case 'big-potion':
        case 'star-biscuit': return flourish(u, ['140,255,170', '220,255,230', '255,240,190']);
        case 'lightning-scroll': return lightning(u, e);
        case 'bottled-sunbeam': return sunbeam(u);
        case 'bright-oil': return brightOil(u);
        case 'wing-gust': return u ? gust(u) : undefined;
        case 'eat-the-light':
          if (u) await clock.tween(D(380), (v) => { u.feed = v * 0.6; });
          return undefined;
        case 'swoop': return undefined;
        case 'summon':
        case 'call': return u ? bossCall(u) : undefined;
        // Chapter 2. The dragon's breaths: a big breath in here, the mist comes with the breath event.
        case 'frost-breath':
        case 'ember-breath':
          if (u) {
            await clock.tween(D(360), (v, raw) => {
              u.scale = 1 + Math.sin(raw * Math.PI) * 0.08;
              u.belly = Math.sin(raw * Math.PI) * 0.6;
            });
            u.scale = 1;
            u.belly = 0;
          }
          return undefined;
        case 'vine-yank':
        case 'star-hop': return undefined;
        case 'gobble-color':
          if (u) await clock.tween(D(380), (v) => { u.feed = v * 0.6; u.belly = v * 0.4; });
          return undefined;
        case 'snow-globe': return snowGlobe(u, e);
        case 'rainbow-cake': return feast(u);
        case 'phoenix-feather': return phoenix(u, e);
        case 'frost-crystal':
        case 'grove-crystal':
        case 'ember-crystal':
        case 'star-crystal': return flourish(u, [flameRgb(crystalColor(id)) || GOLD, '255,255,240']);
        default: return flourish(u, [GOLD, '255,255,230']);
      }
    };
    // The flame color a crystal item carries (data.items[id].color wins over the name).
    function crystalColor(id) {
      const it = data.items && data.items[id];
      if (it && isColor(it.color)) return it.color;
      return { 'frost-crystal': 'blue', 'grove-crystal': 'green', 'ember-crystal': 'red', 'star-crystal': 'violet' }[id] || null;
    }
    // The Snow Globe: thrown to a square, it bursts into cold mist over the squares around it.
    async function snowGlobe(u, e) {
      const area = Array.isArray(e.area) ? e.area.map(cellOf).filter(Boolean) : [];
      const at = cellOf(e.at) || (area.length ? area[Math.floor(area.length / 2)] : null);
      if (!at) return flourish(u, ['200,240,255']);
      const center = centerOf(at[0], at[1]);
      const cells = area.length ? area : areaAround(at[0], at[1], 1);
      const from = u ? chestOf(u) : { x: center.x, y: -40 };
      if (u) faceTo(u, center.x);
      snd('throw');
      const fx = { layer: 'top', kind: 'globe', x: from.x, y: from.y, ang: 0, a: 1, spin: 0, done: false, draw: drawShot };
      S.fx.push(fx);
      await clock.tween(D(460), (v, raw) => {
        fx.x = lerp(from.x, center.x, raw);
        fx.y = lerp(from.y, center.y, raw) - Math.sin(raw * Math.PI) * CH * 1.2;
        fx.spin = raw * 8;
      });
      fx.done = true;
      snd('freeze');
      flashIt('200,235,255', 0.2);
      snowPuff(center.x, center.y, 16);
      ringAt(center.x, center.y, CW * 0.3, CW * 1.9, '180,230,255', 600, 8);
      for (const [c, r] of cells) {
        const p = centerOf(c, r);
        burst(p.x, p.y, 5, { speed: [20, 90], life: [600, 1100], size: [4, 7], rgb: ['220,245,255', '255,255,255'], up: 60, jitter: CW * 0.3, spin: 3,
          extra: { kind: 'flake', drag: 1.5, ay: 100 } });
      }
      fog(cells, '150,215,255', 1000);
      await clock.wait(D(300));
    }
    // The Rainbow Cake: every hero gets a shower of stars in all four colors.
    async function feast(u) {
      snd('sparkle');
      for (const h of S.units.values()) {
        if (h.kind !== 'hero' || h.dying) continue;
        const c = chestOf(h);
        for (let i = 0; i < NCOL; i++) stars(c.x, c.y, 5, [flameRgb(COLOR_NAMES[i]) || GOLD], [40, 160]);
      }
      if (u) ringAt(u.x, u.y, CW * 0.3, CW * 1.4, GOLD, 600, 6);
      await clock.wait(D(420));
    }
    // The Phoenix Feather: warm fire streams to the knocked-down hero, who then gets up (the up event).
    async function phoenix(u, e) {
      const id = e.target || (Array.isArray(e.targets) && e.targets[0]);
      let t = id ? S.units.get(id) : null;
      if (!t) for (const h of S.units.values()) if (h.kind === 'hero' && h.downAmt > 0.5) t = t || h;
      snd('fire');
      const from = u ? chestOf(u) : { x: W / 2, y: H / 2 };
      const to = t ? { x: t.x + t.ox, y: t.y - CH * 0.6 } : from;
      stream(from, to, 40, D(800), '255,170,60', 1.3);
      stream(from, to, 20, D(800), '255,240,180', 1);
      await clock.wait(D(750));
      stars(to.x, to.y, 26, ['255,190,80', '255,120,50', '255,240,180'], [80, 300]);
      ringAt(t ? t.x : to.x, t ? t.y : to.y, CW * 0.2, CW * 1.4, '255,170,60', 650, 7);
      await clock.wait(D(200));
    }

    // push: a shove (Sunburst, Wing Gust), a pull (a vine reels the hero in) or a knockback (a
    // snowball's splat sends them skidding). Chapter 1 pushes have no kind and slide as before.
    P.push = async (e) => {
      const u = S.units.get(e.uid);
      if (!u || !Array.isArray(e.path)) return;
      let path = e.path.map(cellOf).filter(Boolean);
      if (path.length && sameCell(path[0], [u.c, u.r])) path = path.slice(1);
      if (!path.length) return;
      const kind = e.kind || 'push';
      if (kind === 'pull') return pull(u, path, e);
      if (kind === 'knockback') {
        snd('snowball');
        const c = chestOf(u);
        snowPuff(c.x, c.y, 10);
      } else snd('push');
      await slide(u, path, kind === 'knockback' ? 150 : 170);
    };
    async function slide(u, path, ms) {
      for (const [c, r] of path) {
        const a = anchor(u.size, c, r);
        const x0 = u.x;
        const y0 = u.y;
        await clock.tween(D(ms), (v) => {
          u.x = lerp(x0, a.x, v);
          u.y = lerp(y0, a.y, v);
        }, ease.outQuad);
        u.c = c;
        u.r = r;
        dust(u.x, u.y, 4);
      }
      clock.tween(D(200), (v, raw) => { u.squash = Math.sin(raw * Math.PI) * 0.6; }).then(() => { u.squash = 0; });
    }
    // Who is pulling: the event's `by`, else the monster taking its go if it can grab, else the
    // nearest grabber (a rooted snapper emits nothing before its pull, so `acting` may be stale).
    function pullerOf(u, e) {
      const by = e.by && S.units.get(e.by);
      if (by) return by;
      const act = S.acting && S.units.get(S.acting);
      if (act && (act.grabby || act.boss) && !act.dying) return act;
      let best = null;
      for (const m of S.units.values()) {
        if (m.kind !== 'monster' || m.dying || !(m.grabby || m.boss)) continue;
        if (!best || Math.hypot(m.x - u.x, m.y - u.y) < Math.hypot(best.x - u.x, best.y - u.y)) best = m;
      }
      return best;
    }
    // A vine whips out from the puller to the hero, then reels them in along the path.
    async function pull(u, path, e) {
      const puller = pullerOf(u, e);
      snd('grab');
      const from = puller ? mouthOf(puller) : null;
      const vine = { layer: 'top', ext: 0, done: false, draw(g) {
        const end = chestOf(u);
        const tx = lerp(from.x, end.x, this.ext);
        const ty = lerp(from.y, end.y, this.ext);
        // The vine sags and sways a little, so it reads as a living tendril, not a rope.
        const mx = (from.x + tx) / 2 + Math.sin(S.t * 9 + 1) * CW * 0.14 * this.ext;
        const my = (from.y + ty) / 2 + CH * 0.35 * this.ext + Math.cos(S.t * 7) * CH * 0.08 * this.ext;
        g.lineCap = 'round';
        for (const [w, col] of [[14, '#1e4a1a'], [8, '#4f9a3c'], [3, '#a6e07a']]) {
          g.strokeStyle = col;
          g.lineWidth = w;
          g.beginPath();
          g.moveTo(from.x, from.y);
          g.quadraticCurveTo(mx, my, tx, ty);
          g.stroke();
        }
        g.fillStyle = '#6fc14f';
        for (let k = 0.25; k < this.ext; k += 0.25) {
          const px = (1 - k) * (1 - k) * from.x + 2 * (1 - k) * k * mx + k * k * tx;
          const py = (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * my + k * k * ty;
          g.beginPath();
          g.ellipse(px, py - 8, 9, 5, -0.6, 0, TAU);
          g.fill();
        }
      } };
      if (from) {
        faceTo(puller, u.x);
        S.fx.push(vine);
        await clock.tween(D(260), (v) => { vine.ext = v; }, ease.outCubic);
        setPose(puller, 'attack', 500);
      }
      if (from) faceTo(u, from.x);
      await slide(u, path, 95);
      if (from) {
        await clock.tween(D(200), (v) => { vine.ext = 1 - v; }, ease.inQuad);
        vine.done = true;
      }
    }
    P.status = async (e) => {
      const u = S.units.get(e.uid);
      if (!u || !e.status) return;
      u.status[e.status] = !!e.on;
      if (!e.on) return;
      const label = STATUS_LABEL[e.status];
      if (label !== '') say(u, label || titleCase(e.status) + '!', 'status');
      // Bright Oil: the lantern's light swells two squares wider.
      if (e.status === 'bright-oil' && u.kind === 'hero') await brightOil(u);
      if (/sleep/i.test(e.status)) {
        snd('yawn');
        const c = chestOf(u);
        burst(c.x, c.y - 20, 14, { speed: [20, 70], life: [700, 1200], size: [4, 7], rgb: ['255,230,140', '230,200,255'], up: 20,
          extra: { kind: 'glow', drag: 1.5, ay: -20 } });
      } else if (e.status === 'frozen') {
        // Ice grips the feet (drawn while the status lasts) with a cold puff.
        snd('freeze');
        const c = chestOf(u);
        snowPuff(c.x, c.y, 8);
        stars(c.x, c.y, 10, ['200,240,255', '255,255,255'], [40, 160]);
        ringAt(u.x, u.y, CW * 0.15, CW * 0.8, '180,230,255', 500, 5);
      } else if (e.status === 'chilled') {
        snd('freeze');
        const c = chestOf(u);
        burst(c.x, c.y, 10, { speed: [20, 80], life: [900, 1400], size: [4, 8], rgb: ['200,240,255', '255,255,255'], up: 30, jitter: 16, spin: 3,
          extra: { kind: 'flake', drag: 1.2, ay: 60 } });
      }
      await clock.wait(D(260));
    };
    async function openChest(p, by) {
      if (by) {
        faceTo(by, p.x);
        lean(by, p.x);
      }
      snd('chest');
      await clock.tween(D(300), (v, raw) => { p.shake = Math.sin(raw * 42) * 3.5 * (1 - raw); });
      p.shake = 0;
      p.opened = true;
      p.openT = clock.now;
      p.flare = 1;
      const top = { x: p.x, y: p.y - p.h * 0.7 };
      stars(top.x, top.y, 18, [GOLD, '255,255,220'], [80, 260]);
      burst(top.x, top.y, 16, { speed: [80, 240], life: [500, 900], size: [2, 4], rgb: '255,220,120', ang: -Math.PI / 2, spread: 0.9,
        extra: { kind: 'spark', drag: 2, ay: 260 } });
    }
    P.loot = async (e) => {
      const by = S.units.get(e.by);
      const fromProp = S.props.get(e.from);
      const fromUnit = S.units.get(e.from);
      let o;
      if (fromProp) {
        if (fromProp.type === 'chest' && !fromProp.opened) await openChest(fromProp, by);
        o = { x: fromProp.x, y: fromProp.y - fromProp.h * 0.7 };
      } else if (fromUnit) o = chestOf(fromUnit);
      else if (S.lastDefeat) o = { x: S.lastDefeat.x, y: S.lastDefeat.y };
      else if (by) o = { x: by.x, y: headY(by) };
      else o = { x: W / 2, y: H / 2 };
      const def = (data.items && data.items[e.item]) || {};
      const art = def.art || 'loot-' + e.item;
      let label = def.name || titleCase(e.item || 'Treasure');
      if (e.item === 'gold' && e.amount) {
        label = `+${num(e.amount)} gold`;
        S.goldShown = true;
      }
      const fx = { layer: 'top', x: o.x, y: o.y, s: 0, a: 1, label: null, done: false, draw(g) {
        const sz = 78 * this.s;
        if (sz < 1) return;
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = clamp(this.a * 0.9, 0, 1);
        g.drawImage(FX.glow(GOLD), this.x - sz * 1.25, this.y - sz * 1.25, sz * 2.5, sz * 2.5);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = clamp(this.a, 0, 1);
        const sp = sprite(art, 78);
        if (sp) {
          const k = sz / Math.max(sp.w, sp.h);
          g.drawImage(sp.cv, this.x - (sp.w * k) / 2, this.y - (sp.h * k) / 2, sp.w * k, sp.h * k);
        } else {
          FX.badge(g, this.x, this.y, sz * 0.42, 'open');
        }
        if (this.label) {
          g.font = `700 30px ${FX.FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'top';
          g.lineJoin = 'round';
          g.lineWidth = 6;
          g.strokeStyle = '#1e1206';
          g.strokeText(this.label, this.x, this.y + sz * 0.62);
          g.fillStyle = '#ffe9a6';
          g.fillText(this.label, this.x, this.y + sz * 0.62);
        }
      } };
      S.fx.push(fx);
      snd('loot');
      stars(o.x, o.y, 14, [GOLD, '255,255,220'], [60, 220]);
      const y0 = o.y;
      await clock.tween(D(520), (v) => {
        fx.y = y0 - v * CH * 0.85;
        fx.s = v;
      }, ease.outBack);
      fx.label = label;
      await callHook('loot', e);
      await clock.wait(D(420));
      fx.label = null;
      if (by) {
        const x0 = fx.x;
        const y1 = fx.y;
        const tx = by.x + by.ox;
        const ty = headY(by) + CH * 0.3;
        await clock.tween(D(380), (v) => {
          fx.x = lerp(x0, tx, v);
          fx.y = lerp(y1, ty, v) - Math.sin(v * Math.PI) * 30;
          fx.s = 1 - 0.65 * v;
        }, ease.inQuad);
        stars(tx, ty, 10, [GOLD, '255,255,220'], [40, 160]);
      } else {
        await clock.tween(D(300), (v) => { fx.a = 1 - v; });
      }
      fx.done = true;
    };
    P.gold = async (e) => {
      const by = S.units.get(e.by);
      const at = cellOf(e.at);
      let o = S.lastDefeat || (by ? chestOf(by) : { x: W / 2, y: H / 2 });
      if (at) {
        const f = L.footPoint(at[0], at[1]);
        o = { x: f.x, y: f.y - CH * 0.5, floor: f.y };
      }
      snd('coin');
      const floor = o.floor != null ? o.floor : o.y + CH * 0.5;
      burst(o.x, o.y, 14, { speed: [80, 220], life: [900, 1300], size: [7, 10], rgb: '0,0,0', ang: -Math.PI / 2, spread: 1.1, up: 160,
        extra: { kind: 'coin', ay: 1200, floor, fadeOut: 0.3 } });
      stars(o.x, o.y, 8, [GOLD]);
      // A chest's gold already floated its amount up with the loot.
      if (!S.goldShown) floaters.add(Object.assign({}, TEXT.gold, { text: `+${num(e.amount)} gold`, x: o.x, y: o.y - 40 }));
      S.goldShown = false;
      await clock.wait(D(560));
    };
    P.mimic = async (e) => {
      const p = S.props.get(e.prop);
      const src = S.state && (S.state.monsters || []).find((m) => m && m.uid === e.uid);
      const at = (src && cellOf(src.at)) || (p ? [p.c, p.r] : null);
      if (p) {
        snd('rumble');
        await clock.tween(D(480), (v, raw) => { p.shake = Math.sin(raw * 60) * 5 * (0.4 + raw); });
        p.shake = 0;
        S.props.delete(p.uid);
      }
      if (!at) return;
      let u = S.units.get(e.uid);
      if (!u) S.units.set(e.uid, (u = makeUnit('monster', e.uid, (src && src.type) || 'mimic')));
      placeUnit(u, at[0], at[1]);
      if (src) syncUnit(u, src);
      u.spotted = true;
      u.vis = true;
      u.reveal = 1;
      let near = null;
      for (const h of S.units.values()) if (h.kind === 'hero' && (!near || Math.abs(h.x - u.x) < Math.abs(near.x - u.x))) near = h;
      if (near) faceTo(u, near.x);
      setPose(u, 'attack', 450); // the chest lunges, tongue out
      say(u, 'Surprise!', 'alert', { size: 46 });
      snd('chomp');
      const c = chestOf(u);
      stars(c.x, c.y, 12, [GOLD, '255,255,220']);
      await clock.tween(D(380), (v, raw) => {
        u.scale = lerp(0.75, 1, v);
        u.hop = Math.sin(raw * Math.PI) * 34;
      }, ease.outBack);
      u.hop = 0;
      u.scale = 1;
    };
    // Gloamwing announces its move with a say event; the board adds a small wind-up meanwhile.
    P.say = async (e) => {
      const b = e.uid && S.units.get(e.uid);
      const jobs = [callHook('say', e)];
      if (b && b.boss && e.move) {
        if (/eat/.test(e.move)) jobs.push(clock.tween(D(500), (v) => { b.feed = v * 0.7; }));
        else if (/gobble/.test(e.move)) jobs.push(clock.tween(D(500), (v) => { b.feed = v * 0.7; b.belly = v * 0.4; }));
        else if (/gust/.test(e.move)) {
          b.flapFast = 1;
          jobs.push(clock.wait(D(400)));
        }
      }
      // The dragon's aura pulses as it announces its next color (the telegraph).
      if (b && b.boss && b.glowRgb && (e.key === 'telegraph' || isColor(e.color))) {
        jobs.push(clock.tween(D(600), (v, raw) => { b.glowPulse = Math.sin(raw * Math.PI) * 0.8; }).then(() => { b.glowPulse = 0; }));
      }
      await Promise.all(jobs);
    };

    // ------------------------------------------------------------ Chapter 2 events
    // A color crystal: the hero's lantern changes color with a little burst.
    P.tint = async (e) => {
      const u = S.units.get(e.uid);
      if (!u || !isColor(e.color)) return;
      const rgb = flameRgb(e.color);
      snd('tint');
      const lp = spot(u, ...((u.dpose && u.dpose.lantern) || u.look.lantern || [0.55, 0.5]));
      stars(lp.x, lp.y, 18, [rgb, FX.mixRgb(rgb, '255,255,255', 0.5), '255,255,255'], [50, 220]);
      ringAt(u.x, u.y, CW * 0.2, CW * 1.3, rgb, 650, 6);
      clock.tween(D(700), (v, raw) => { u.lanternFlare = Math.sin(raw * Math.PI); }).then(() => { u.lanternFlare = 0; });
      await setLantern(u, e.color, true);
    };
    // The boss's glow moves on to its next color.
    P.glow = async (e) => {
      const u = S.units.get(e.uid);
      if (!u || !isColor(e.color)) return;
      const rgb = flameRgb(e.color);
      snd('glow');
      const c = chestOf(u);
      const g = groundOf(u);
      stars(c.x, c.y, u.boss ? 30 : 12, [rgb, FX.mixRgb(rgb, '255,255,255', 0.5)], [80, 300]);
      ringAt(g.x, g.y, CW * 0.5, CW * (u.boss ? 3 : 1.5), rgb, 750, 7);
      await setGlow(u, e.color, true);
    };
    // Blink: sparkle out, appear somewhere else, sparkle in.
    P.blink = async (e) => {
      const u = S.units.get(e.uid);
      const to = cellOf(e.to);
      if (!u || !to) return;
      const rgb = (u.boss && glowRgbOf(u)) || u.look.eye || '230,200,255';
      const pale = FX.mixRgb(rgb, '255,255,255', 0.6);
      const n = u.boss ? 30 : 16;
      snd('blink');
      let c = chestOf(u);
      stars(c.x, c.y, n, [rgb, pale, '255,255,255'], [60, 240]);
      ringAt(u.x, u.y, CW * 0.2, CW * (u.boss ? 2 : 1), rgb, 500, 5);
      await clock.tween(D(260), (v) => {
        u.alpha = 1 - v;
        u.scale = 1 - 0.6 * v;
        u.oy = -v * 18;
      }, ease.inQuad);
      placeUnit(u, to[0], to[1]);
      u.oy = 0;
      let near = null;
      for (const h of S.units.values()) if (h.kind === 'hero' && !h.down && (!near || Math.abs(h.x - u.x) < Math.abs(near.x - u.x))) near = h;
      if (near) faceTo(u, near.x);
      c = chestOf(u);
      stars(c.x, c.y, n, [rgb, pale, '255,255,255'], [60, 240]);
      ringAt(u.x, u.y, CW * 0.2, CW * (u.boss ? 2 : 1), rgb, 500, 5);
      await clock.tween(D(300), (v) => {
        u.alpha = v;
        u.scale = 0.4 + 0.6 * v;
      }, ease.outBack);
      u.alpha = 1;
      u.scale = 1;
    };
    // A Magma Blob pops into two: a jelly burst, then the Blobbits hop out (blobHop, on their summon).
    P.split = async (e) => {
      const at = cellOf(e.at);
      const o = at ? centerOf(at[0], at[1]) : S.lastDefeat ? { x: S.lastDefeat.x, y: S.lastDefeat.y } : null;
      if (!o) return;
      snd('split');
      S.split = { x: o.x, y: o.y, into: new Set(Array.isArray(e.into) ? e.into : []) };
      lavaDrops(o.x, o.y, 20);
      ringAt(o.x, o.y + CH * 0.25, CW * 0.2, CW * 1.4, '255,150,60', 520, 7);
      // Two little blobs squirt apart and vanish where the Blobbits will land.
      const fx = { layer: 'top', p: 0, done: false, draw(g) {
        const p = this.p;
        g.globalAlpha = 1 - smoothstep(0.6, 1, p);
        for (const side of [-1, 1]) {
          const x = o.x + side * p * CW * 0.7;
          const y = o.y - Math.sin(p * Math.PI) * CH * 0.6;
          const r = 16 * (1 - p * 0.4);
          g.fillStyle = '#ff7a3a';
          g.strokeStyle = '#7a2a08';
          g.lineWidth = 3;
          g.beginPath();
          g.ellipse(x, y, r * (1 + 0.3 * p), r * (1 - 0.2 * p), 0, 0, TAU);
          g.fill();
          g.stroke();
          g.fillStyle = '#ffd27a';
          g.beginPath();
          g.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
      } };
      S.fx.push(fx);
      await clock.tween(D(380), (v) => { fx.p = v; }, ease.outQuad);
      fx.done = true;
    };
    // Breath: colored mist rolls over the squares it covers, from the dragon's mouth outward, with
    // snowflakes (blue), embers (red), leaves (green) or stars (violet) riding it.
    P.breath = async (e) => {
      const b = S.units.get(e.uid);
      const cells = (Array.isArray(e.cells) ? e.cells : []).map(cellOf).filter((v) => v && inGrid(v[0], v[1]));
      if (!cells.length) return;
      const color = isColor(e.color) ? e.color : null;
      const rgb = (color && flameRgb(color)) || '220,220,255';
      const pale = FX.mixRgb(rgb, '255,255,255', 0.55);
      let cx = 0;
      let cy = 0;
      for (const [c, r] of cells) {
        const p = centerOf(c, r);
        cx += p.x / cells.length;
        cy += p.y / cells.length;
      }
      if (b) {
        faceTo(b, cx);
        await clock.tween(D(320), (v, raw) => {
          b.scale = 1 + Math.sin(raw * Math.PI) * 0.07;
          b.belly = Math.sin(raw * Math.PI) * 0.6;
        });
        b.scale = 1;
        b.belly = 0;
      }
      const from = b ? mouthOf(b) : { x: cx, y: cy };
      snd(color === 'red' ? 'fire' : 'breath');
      shakeIt(4, 300);
      flashIt(pale, 0.12);
      const mist = fog(cells, rgb, 1000);
      for (const [c, r] of cells) {
        const p = centerOf(c, r);
        const dx = p.x - from.x;
        const dy = p.y - from.y;
        for (let i = 0; i < 3; i++) {
          parts.add({ kind: 'smoke', x: lerp(from.x, p.x, 0.25) + range(-12, 12), y: lerp(from.y, p.y, 0.25) + range(-12, 12),
            vx: dx * 1.3 + range(-20, 20), vy: dy * 1.3 + range(-20, 20), drag: 2.4, size: range(24, 36), size1: range(44, 60),
            rgb: pick([rgb, pale]), alpha: 0.6, life: range(900, 1400), layer: 'top', fadeIn: 0.1, fadeOut: 0.5 });
        }
        if (color === 'blue') {
          burst(p.x, p.y, 2, { speed: [10, 50], life: [900, 1500], size: [4, 7], rgb: ['220,245,255', '255,255,255'], up: 20, jitter: CW * 0.3, spin: 3,
            extra: { kind: 'flake', drag: 1.2, ay: 60 } });
        } else if (color === 'red') {
          burst(p.x, p.y, 3, { speed: [40, 160], life: [500, 900], size: [2.5, 4.5], rgb: ['255,180,70', '255,230,140'], jitter: CW * 0.3,
            extra: { kind: 'ember', drag: 1.5, ay: 160, size1: 0.8 } });
        } else if (color === 'green') {
          burst(p.x, p.y, 2, { speed: [20, 80], life: [700, 1200], size: [5, 9], rgb: ['140,230,110', '200,255,170'], up: 40, jitter: CW * 0.3,
            extra: { kind: 'glow', drag: 1.5, ay: 40, squash: 0.6 } });
        } else {
          burst(p.x, p.y, 2, { speed: [20, 80], life: [600, 1000], size: [5, 9], rgb: [rgb, pale], up: 30, jitter: CW * 0.3, extra: { kind: 'star', drag: 1.5 } });
        }
      }
      await mist;
    };
    // A soft colored cloud over a list of squares: a fog glow per square (big enough to melt into
    // its neighbours) with a thin additive shine, breathing a little so it reads as vapour rather
    // than a grid. Resolves when it has faded.
    function fog(cells, rgb, life) {
      const tex = FX.glow(rgb);
      const fx = { layer: 'top', a: 0, done: false, draw(g) {
        const t = S.t;
        for (const pass of [0, 1]) {
          g.globalCompositeOperation = pass ? 'lighter' : 'source-over';
          for (const [c, r] of cells) {
            const p = centerOf(c, r);
            const k = 1.25 + 0.1 * Math.sin(t * 5 + c * 1.3 + r * 0.7);
            g.globalAlpha = clamp((pass ? 0.18 : 0.5) * this.a * (0.85 + 0.15 * Math.sin(t * 7 + c + r * 2)), 0, 1);
            g.drawImage(tex, p.x - CW * k, p.y - CH * k, CW * 2 * k, CH * 2 * k);
          }
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      } };
      S.fx.push(fx);
      return clock.tween(D(life), (v, raw) => { fx.a = Math.sin(raw * Math.PI); }).then(() => { fx.done = true; });
    }
    // The darkness lifts in a wave from (cx, cy), with golden sparkles riding the edge.
    async function flood(cx, cy) {
      const maxR = Math.hypot(W, H) * 1.05;
      S.lift = { cx, cy, r: 0, a: 1 - CLEAR_DARK / Math.max(0.05, S.dark) };
      await clock.tween(D(1700), (v) => {
        S.lift.r = v * maxR;
        const r = S.lift.r * 0.78;
        for (let i = 0; i < 7; i++) {
          const ang = rand() * TAU;
          const x = cx + Math.cos(ang) * r;
          const y = cy + Math.sin(ang) * r * 0.85;
          if (x > 0 && x < W && y > 0 && y < H) {
            parts.add({ kind: 'star', x, y, vx: range(-20, 20), vy: range(-60, -20), size: range(7, 15),
              rgb: pick([GOLD, '255,250,220', '255,190,90']), life: range(600, 1100), drag: 1 });
          }
        }
      }, ease.inOutSine);
      S.dark = S.darkGoal = CLEAR_DARK;
      S.lift = null;
    }
    function partyCenter() {
      const hs = [...S.units.values()].filter((u) => u.kind === 'hero');
      if (!hs.length) return { x: W / 2, y: H / 2 };
      return { x: hs.reduce((s, u) => s + u.x, 0) / hs.length, y: hs.reduce((s, u) => s + u.y, 0) / hs.length - CH };
    }
    // Every standing hero hops for joy, one after another, in a puff of golden stars: a crouch,
    // a big jump, a little one (polish pass). Calm motion keeps the stars and skips the jumps.
    async function cheer(delay) {
      const hs = [...S.units.values()].filter((u) => u.kind === 'hero' && !u.down && !u.dying && u.downAmt < 0.5);
      await clock.wait(D(delay || 0));
      await Promise.all(hs.map((u, i) => clock.wait(D(i * 140)).then(async () => {
        const c = chestOf(u);
        stars(c.x, c.y - CH * 0.3, 12, [GOLD, '255,255,225', '255,200,120'], [90, 260]);
        if (S.reduced) return;
        await clock.tween(D(110), (v) => { u.squash = v * 0.9; });
        for (const [ms, k] of [[360, 0.36], [260, 0.15]]) {
          const s0 = u.squash;
          // Stretch on the way up, round in the air, squash on landing.
          await clock.tween(D(ms), (v, raw) => {
            u.hop = Math.sin(raw * Math.PI) * CH * k;
            u.squash = raw < 0.25 ? lerp(s0, -0.6, raw / 0.25) : raw < 0.8 ? lerp(-0.6, 0, (raw - 0.25) / 0.55) : lerp(0, 0.7, (raw - 0.8) / 0.2);
          });
          u.hop = 0;
        }
        await clock.tween(D(140), (v) => { u.squash = 0.7 * (1 - v); });
        u.squash = 0;
      })));
    }
    P.cleared = async () => {
      clearOptions();
      snd('cleared');
      for (const u of S.units.values()) u.vis = true;
      const jobs = [...S.props.values()].filter((p) => p.brazier && !p.lit)
        .map((p, i) => clock.wait(D(150 + i * 260)).then(() => P.light({ prop: p.uid })));
      const c = partyCenter();
      jobs.push(flood(c.x, c.y));
      jobs.push(cheer(450));
      await Promise.all(jobs);
    };
    P.partyDown = async () => {
      clearOptions();
      S.darkGoal = 0.94;
      snd('partyDown');
      await clock.wait(D(900));
    };
    // The rules send this just before the boss room's 'room' event; the intro plays once it shows.
    P.bossReveal = async () => {
      S.bossIntro = true;
      if (S.state && S.state.roomId === S.roomId && [...S.units.values()].some((u) => u.boss)) await bossIntro();
    };
    P.victory = async () => {
      clearOptions();
      snd('victory');
      const hl = [...S.props.values()].find(isHeart);
      const jobs = [];
      if (hl) jobs.push(heartBloom(hl));
      [...S.props.values()].filter((p) => p.brazier && !p.lit)
        .forEach((p, i) => jobs.push(clock.wait(D(300 + i * 220)).then(() => P.light({ prop: p.uid }))));
      jobs.push(flood(hl ? hl.x : W / 2, hl ? hl.y - CH : H / 2));
      jobs.push(cheer(700));
      await Promise.all(jobs);
      for (let i = 0; i < 60; i++) {
        parts.add({ kind: 'star', x: range(0, W), y: range(-40, H * 0.5), vx: range(-20, 20), vy: range(30, 90), size: range(6, 12),
          rgb: pick([GOLD, '255,250,220']), life: range(1400, 2600), sway: 20, swayF: 0.5 });
      }
    };

    // ------------------------------------------------------------ playing event lists
    // Players get the event and the events after it (to peek, e.g. is a dice roll coming?).
    async function runOne(e, rest) {
      try {
        await P[e.t](e, rest || []);
      } catch (err) {
        console.warn('LB_BOARD event', e && e.t, err);
      }
    }
    async function runEvents(events) {
      S.lastDefeat = null;
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (!e || !e.t || !P[e.t]) continue;
        // Remember which monster is taking its go, for its violet floor ring.
        if (e.t === 'turn') S.acting = null;
        else if (e.uid && (e.t === 'move' || e.t === 'attack' || e.t === 'roll' || e.t === 'ability' || e.t === 'breath' || e.t === 'blink' || e.t === 'glow')) {
          const au = S.units.get(e.uid);
          S.acting = au && au.kind === 'monster' ? e.uid : null;
        }
        const gap = GROUP[e.t];
        let j = i + 1;
        if (gap != null) while (j < events.length && events[j] && events[j].t === e.t) j++;
        if (j - i > 1) {
          // A burst that hits several monsters, or several heroes healed at once, plays together.
          if (e.t === 'damage' && S.pending) {
            const pa = S.pending;
            S.pending = null;
            await strike(pa, true);
          }
          const batch = events.slice(i, j);
          await Promise.all(batch.map((ev, k) => clock.wait(D(gap * k)).then(() => runOne(ev, events.slice(i + k + 1)))));
          i = j - 1;
        } else {
          await runOne(e, events.slice(i + 1));
        }
      }
      S.acting = null;
      await clock.wait(D(60));
    }
    // Calls queue up, so a second list waits for the first. The board re-reads the state at the end.
    function play(events, hooks) {
      S.playing++;
      const list = Array.isArray(events) ? events.slice() : [];
      const job = S.queue
        .then(() => {
          S.hooks = hooks || {};
          return runEvents(list);
        })
        .catch((err) => console.warn('LB_BOARD play', err))
        .then(() => {
          S.playing = Math.max(0, S.playing - 1);
          if (!S.playing) {
            S.pending = null;
            S.hooks = null;
            sync(false);
          }
        });
      S.queue = job;
      return job;
    }

    // ------------------------------------------------------------ the frame
    function update(dt) {
      const pdt = S.paused ? 0 : dt;
      clock.step(pdt);
      S.t = clock.now / 1000;
      if (pdt <= 0) return;
      parts.update(pdt);
      floaters.update(pdt);
      shake.update(pdt);
      updateLight(pdt);
      S.dark += (S.darkGoal - S.dark) * Math.min(1, pdt / 700);
      if (S.peek === 'out' && S.dark >= S.darkGoal - 0.08) S.peek = '';
      S.flash = Math.max(0, S.flash - pdt / 260);
      const busy = S.playing > 0 || (S.state && S.state.side === 'monsters');
      for (const u of S.units.values()) {
        if (!u.dying) u.reveal += ((u.vis ? 1 : 0) - u.reveal) * Math.min(1, pdt / 260);
        u.hpShown += (u.hp - u.hpShown) * Math.min(1, pdt / 420);
        u.dim += ((u.dimGoal && !busy ? 1 : 0) - u.dim) * Math.min(1, pdt / 300);
      }
      for (const p of S.props.values()) if (p.flare > 0) p.flare = Math.max(0, p.flare - pdt / 900);
      if (S.fx.length) S.fx = S.fx.filter((f) => !f.done);
      ambient(pdt);
    }
    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!S.roomId && !S.units.size) return;
      buildStatic();
      buildDarkness();
      const k = view.k;
      const sh = S.reduced ? { x: 0, y: 0 } : shake.offset();
      const bx = Math.round(view.ox * view.dpr);
      const by = Math.round(view.oy * view.dpr);
      paintedOffset = { x: bx / view.dpr + sh.x * view.s, y: by / view.dpr + sh.y * view.s };
      ctx.setTransform(k, 0, 0, k, bx + sh.x * k, by + sh.y * k);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      ctx.drawImage(staticCv, 0, 0, W, H);
      drawLitPainting();
      drawFloorMarks();
      drawShadows();
      drawThings();
      parts.draw(ctx, 'world', env);
      drawFx('world');
      drawDarkness();
      drawSpottedInDark();
      drawGlow();
      drawEyes();
      drawMarkGlow();
      parts.draw(ctx, 'top', env);
      drawFx('top');
      drawOverheads();
      floaters.draw(ctx);
      ctx.restore();
      ctx.setTransform(k, 0, 0, k, bx, by);
      drawScreen();
    }
    let lastTs = 0;
    let rafAt = 0;
    let rafId = 0;
    let frames = 0;
    let needResize = true;
    const nowMs = () => (G.performance && G.performance.now ? G.performance.now() : Date.now());
    function tick() {
      if (S.destroyed) return;
      const now = nowMs();
      const dt = clamp(lastTs ? now - lastTs : 16, 0, 100);
      lastTs = now;
      if (dt > 0) S.fps = S.fps ? S.fps * 0.95 + (1000 / dt) * 0.05 : 60;
      if (needResize || (frames & 31) === 0) {
        needResize = false;
        resize();
      }
      frames++;
      try {
        const t0 = nowMs();
        update(dt);
        // Time keeps running while the canvas is hidden, so play() still finishes; drawing waits.
        if (canvas.clientWidth > 1) draw();
        S.cost = (S.cost || 0) * 0.95 + (nowMs() - t0) * 0.05;
      } catch (err) {
        if (!S.errored) console.error('LB_BOARD frame', err);
        S.errored = true;
      }
    }
    function raf() {
      rafAt = nowMs();
      tick();
      rafId = G.requestAnimationFrame ? G.requestAnimationFrame(raf) : 0;
    }
    // Hidden tabs and headless browsers can starve requestAnimationFrame; this slow timer keeps
    // the animations (and the promises waiting on them) moving anyway.
    const timer = setInterval(() => {
      if (nowMs() - rafAt > 120) tick();
    }, 33);

    // ------------------------------------------------------------ input
    function toPaint(ev) {
      const rect = canvas.getBoundingClientRect();
      const fx = rect.width / (view.cssW || rect.width || 1);
      const fy = rect.height / (view.cssH || rect.height || 1);
      return {
        x: ((ev.clientX - rect.left) / fx - view.ox) / view.s,
        y: ((ev.clientY - rect.top) / fy - view.oy) / view.s,
      };
    }
    function occupant(c, r) {
      const u = unitOn([c, r]);
      // A monster hidden in the dark stays secret: its square reads as empty.
      if (u) return u.kind === 'monster' && u.reveal < 0.5 ? undefined : u.uid;
      for (const p of S.props.values()) if (p.c === c && p.r === r) return p.uid;
      return undefined;
    }
    // The figure painted at this point, front-most first (heroes, and monsters the party can see).
    // Uses where the figure was last drawn (hop, pose, flip); the box is narrower at the head, so
    // the gold square peeking out beside a figure still reads as that square.
    function unitAtPoint(x, y) {
      let best = null;
      for (const u of S.units.values()) {
        if (u.dying || (u.kind === 'monster' && u.reveal < 0.5)) continue;
        const w = (u.dw || unitW(u)) * Math.abs(u.dsx || 1);
        const h = (u.dh || unitH(u)) * Math.abs(u.dsy || 1);
        const foot = u.dy != null ? u.dy : u.y - hover(u);
        const ax = u.dax != null ? u.dax : 0.5;
        const cx = (u.dx != null ? u.dx : u.x) + (0.5 - ax) * w * (u.dflip || 1);
        if (y < foot - h || y > foot + CH * 0.08) continue;
        const k = y < foot - h * 0.76 ? 0.5 : 0.78;
        if (Math.abs(x - cx) > (w * k) / 2) continue;
        if (!best || u.y > best.y) best = u;
      }
      return best;
    }
    // A reachable square wins over a figure leaning across it. The figure still owns its feet.
    function hit(x, y) {
      const u = unitAtPoint(x, y);
      const cell = cellAt(x, y);
      if (cell && S.opt && S.opt.moves.has(key(cell.c, cell.r)) &&
          (!u || unitOn([cell.c, cell.r]) !== u)) {
        return { c: cell.c, r: cell.r, uid: occupant(cell.c, cell.r) };
      }
      if (u) return { c: u.c, r: u.r, uid: u.uid };
      return cell ? { c: cell.c, r: cell.r, uid: occupant(cell.c, cell.r) } : null;
    }
    function interactive(cell) {
      const id = occupant(cell.c, cell.r);
      const o = S.opt;
      if (!o) return !!id && isHeroId(id);
      const k2 = key(cell.c, cell.r);
      return o.moves.has(k2) || o.aims.has(k2) || (!!id && (o.targets.has(id) || o.marks.has(id) || isHeroId(id)));
    }
    function setHover(cell) {
      const k2 = cell ? key(cell.c, cell.r) : '';
      const old = S.hover ? key(S.hover.c, S.hover.r) : '';
      if (k2 === old) return;
      S.hover = cell ? { c: cell.c, r: cell.r } : null;
      canvas.style.cursor = cell && interactive(cell) ? 'pointer' : '';
    }
    let press = null;
    const onDown = (ev) => { press = { x: ev.clientX, y: ev.clientY, id: ev.pointerId }; };
    const onUp = (ev) => {
      if (!press || press.id !== ev.pointerId) return;
      const moved = Math.hypot(ev.clientX - press.x, ev.clientY - press.y);
      press = null;
      if (moved > 18) return;
      const p = toPaint(ev);
      const h = hit(p.x, p.y);
      if (!h) return;
      for (const fn of S.taps.slice()) {
        try {
          fn(h);
        } catch (err) {
          console.error('LB_BOARD tap handler', err);
        }
      }
    };
    const onMove = (ev) => {
      if (ev.pointerType === 'touch') return;
      const p = toPaint(ev);
      // Hover what a click would pick: over a figure's head, that figure's own square.
      const h = hit(p.x, p.y);
      setHover(h && inGrid(h.c, h.r) ? { c: h.c, r: h.r } : null);
    };
    const onLeave = () => setHover(null);
    const onCancel = () => { press = null; };
    const onWinResize = () => { needResize = true; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointercancel', onCancel);
    if (G.addEventListener) G.addEventListener('resize', onWinResize);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onWinResize);
      ro.observe(canvas);
    }
    if (!canvas.style.touchAction) canvas.style.touchAction = 'manipulation';
    // A canvas sized only by its width/height attributes would grow on every resize at
    // devicePixelRatio > 1, so pin its CSS size once.
    if (!canvas.style.width && !canvas.style.height && canvas.clientWidth === canvas.width && canvas.clientHeight === canvas.height) {
      canvas.style.width = canvas.width + 'px';
      canvas.style.height = canvas.height + 'px';
    }

    // ------------------------------------------------------------ the public board
    const board = {
      // The board catches up a moment later (a microtask), so setState(state) followed straight
      // away by play(events) still animates from the old picture instead of jumping to the end.
      setState(state) {
        if (!state) return;
        S.state = state;
        if (S.playing || S.syncQueued) return;
        S.syncQueued = true;
        Promise.resolve().then(() => {
          S.syncQueued = false;
          if (!S.playing && !S.destroyed && S.state) sync(false);
        });
      },
      showOptions,
      previewArea,
      clearOptions,
      play,
      onCellTap(fn) {
        if (typeof fn !== 'function') return () => {};
        S.taps.push(fn);
        return () => { S.taps = S.taps.filter((f) => f !== fn); };
      },
      setSpeed(n) { S.speed = clamp(Number(n) || 1, 0.25, 4); },
      setReducedMotion(on) {
        S.reduced = !!on;
        if (S.reduced) {
          shake.amp = 0;
          S.flash = 0;
          S.wash = 0;
        }
      },
      // Extras beyond the contract: freeze time (pause menus, screenshots), a keyboard or test
      // hover, where a square is on screen (CSS pixels in the canvas), and some numbers for QA.
      setPaused(on) { S.paused = !!on; },
      // A new room's opening shot (ux #8): peek(true) before the room's events shows its lit
      // painting (monsters stay hidden); peek(false) lets the darkness creep back in.
      peek(on) {
        if (on) {
          S.peek = 'on';
          S.dark = S.darkGoal = CLEAR_DARK;
        } else if (S.peek) {
          S.peek = 'out';
          const st = S.state || {};
          S.darkGoal = st.status === 'cleared' || st.status === 'victory' ? CLEAR_DARK : FULL_DARK;
        }
      },
      hoverCell(c, r) { setHover(c == null ? null : { c, r }); },
      cellToScreen(c, r) {
        const p = L.footPoint(c, r);
        return { x: view.ox + p.x * view.s, y: view.oy + p.y * view.s };
      },
      resize() { needResize = true; },
      stats() {
        return { fps: Math.round(S.fps || 0), frameMs: Math.round((S.cost || 0) * 100) / 100, particles: parts.list.length,
          units: S.units.size, props: S.props.size,
          playing: S.playing, time: Math.round(clock.now), errored: !!S.errored,
          hover: S.hover, bossLabel: screenBox(bossLabelBox()), bossFigure: bossFigureScreen(), bounds: boardBounds() };
      },
      destroy() {
        S.destroyed = true;
        clearInterval(timer);
        if (rafId && G.cancelAnimationFrame) G.cancelAnimationFrame(rafId);
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerleave', onLeave);
        canvas.removeEventListener('pointercancel', onCancel);
        if (G.removeEventListener) G.removeEventListener('resize', onWinResize);
        if (ro) ro.disconnect();
      },
    };
    resize();
    raf();
    return board;
  }

  return { create, version: 1 };
});
