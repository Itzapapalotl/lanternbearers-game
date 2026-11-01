// Lanternbearers effects kit (LB_FX): easing, an awaitable animation clock, particles,
// floating text, screen shake, glow textures and tidy placeholder painters.
// render.js (LB_BOARD) builds the board on top of it. Classic script with the same UMD
// wrapper as layout.js, so Node tests can load the pure parts (easing, noise, clock).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LB_FX = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- math
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  const ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => t * (2 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) => (t <= 0 || t >= 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBounce: (t) => {
      const n = 7.5625;
      const d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    },
  };

  // Seeded generator for visual randomness, so harness screenshots repeat.
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rnd = makeRng(20261028);
  const rand = () => rnd();
  const range = (a, b) => a + (b - a) * rnd();
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  function seed(n) { rnd = makeRng(n); }

  // Smooth 1D value noise in [-1, 1]; drives torch flicker and shake.
  function hash(i) {
    let h = Math.imul(i | 0, 374761393) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function noise(x) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return lerp(hash(i), hash(i + 1), u) * 2 - 1;
  }
  // Flame-like flicker: a slow wander plus a fast shiver.
  const flicker = (t, s) => 0.65 * noise(t * 5.3 + s * 17.1) + 0.35 * noise(t * 13.7 + s * 3.3);

  // ---------------------------------------------------------------- canvases and textures
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  const rgba = (rgb, a) => `rgba(${rgb},${a})`;
  const tex = {};

  // Soft round glow of one color; drawn with 'lighter' for light, normal for smoke.
  function glow(rgb) {
    const key = 'g' + rgb;
    if (tex[key]) return tex[key];
    const c = canvas(64, 64);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(rgb, 1));
    gr.addColorStop(0.18, rgba(rgb, 0.62));
    gr.addColorStop(0.45, rgba(rgb, 0.2));
    gr.addColorStop(0.75, rgba(rgb, 0.05));
    gr.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return (tex[key] = c);
  }

  // A light "hole" stamp: white with alpha 1 inside `inner` fading to 0 at the edge.
  // p shapes it: 2 is a circle, 3 is a rounded square that matches square-counted light.
  function hole(p, inner) {
    const key = `h${p}:${inner}`;
    if (tex[key]) return tex[key];
    const n = 128;
    const c = canvas(n, n);
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = Math.abs((x + 0.5) / (n / 2) - 1);
        const dy = Math.abs((y + 0.5) / (n / 2) - 1);
        const d = Math.pow(Math.pow(dx, p) + Math.pow(dy, p), 1 / p);
        const a = 1 - smoothstep(inner, 1, d);
        const i = (y * n + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    return (tex[key] = c);
  }

  // Soft black blob, stretched into an ellipse for drop shadows.
  function shadow() {
    if (tex.shadow) return tex.shadow;
    const c = canvas(64, 64);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.62)');
    gr.addColorStop(0.55, 'rgba(0,0,0,0.38)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return (tex.shadow = c);
  }

  // Four-point twinkle star with a glowing heart.
  function star(rgb) {
    const key = 's' + rgb;
    if (tex[key]) return tex[key];
    const c = canvas(64, 64);
    const g = c.getContext('2d');
    g.drawImage(glow(rgb), 16, 16, 32, 32);
    g.fillStyle = rgba(rgb, 0.95);
    g.beginPath();
    g.moveTo(32, 2); g.quadraticCurveTo(35, 29, 62, 32); g.quadraticCurveTo(35, 35, 32, 62);
    g.quadraticCurveTo(29, 35, 2, 32); g.quadraticCurveTo(29, 29, 32, 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.arc(32, 32, 4, 0, TAU);
    g.fill();
    return (tex[key] = c);
  }

  // High-quality downscale (halving steps) so big sprites stay crisp at board size.
  function scaled(img, w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    let src = img;
    let sw = img.naturalWidth || img.width;
    let sh = img.naturalHeight || img.height;
    while (sw / 2 >= w * 1.15 && sh / 2 >= h * 1.15) {
      const half = canvas(sw / 2, sh / 2);
      const hg = half.getContext('2d');
      hg.imageSmoothingQuality = 'high';
      hg.drawImage(src, 0, 0, half.width, half.height);
      src = half;
      sw = half.width;
      sh = half.height;
    }
    const out = canvas(w, h);
    const og = out.getContext('2d');
    og.imageSmoothingQuality = 'high';
    og.drawImage(src, 0, 0, w, h);
    return out;
  }

  // Solid-color silhouette of a sprite (hit flashes, red tint, dimming).
  // Uses compositing only, so it works even when file:// images taint the canvas.
  function silhouette(src, color) {
    const c = canvas(src.width, src.height);
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // Grey, slightly cool copy of a sprite for knocked-down heroes.
  function greyed(src) {
    const c = canvas(src.width, src.height);
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'saturation';
    g.fillStyle = '#808080';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(190,200,230,0.22)';
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(src, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------- clock
  // Board time in ms. Tweens and waits resolve as the board clock passes them, so a
  // paused board freezes every animation and speed-ups stay in step with drawing.
  function Clock() {
    this.now = 0;
    this.items = [];
  }
  Clock.prototype.step = function (dt) {
    this.now += dt;
    const list = this.items;
    if (!list.length) return;
    const keep = [];
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const it = list[i];
      const p = it.dur > 0 ? clamp((this.now - it.start) / it.dur, 0, 1) : 1;
      if (it.fn) {
        try { it.fn(it.ease(p), p); } catch (err) { console.warn('LB_FX tween', err); }
      }
      if (p >= 1) it.resolve();
      else keep.push(it);
    }
    // Tweens started by callbacks during this step were appended after index n.
    for (let i = n; i < list.length; i++) keep.push(list[i]);
    this.items = keep;
  };
  // Animate fn(easedProgress, rawProgress) over dur ms; resolves when done.
  Clock.prototype.tween = function (dur, fn, easing) {
    const e = easing || ease.linear;
    if (fn) {
      try { fn(e(0), 0); } catch (err) { console.warn('LB_FX tween', err); }
    }
    return new Promise((resolve) => {
      this.items.push({ start: this.now, dur: Math.max(0, dur), fn, ease: e, resolve });
    });
  };
  Clock.prototype.wait = function (dur) { return this.tween(dur, null); };

  // ---------------------------------------------------------------- particles
  // A particle: x, y, vx, vy (px/s), ax, ay (px/s/s), drag (1/s), life (ms), size -> size1,
  // rgb 'r,g,b', alpha, kind, and layer: 'world' draws under the darkness, 'top' above it.
  const ADDITIVE = { glow: true, ember: true, mote: true, spark: true, star: true, ring: true, flake: true };
  function Particles(cap) {
    this.list = [];
    this.cap = cap || 600;
  }
  Particles.prototype.room = function () { return this.cap - this.list.length; };
  Particles.prototype.clear = function () { this.list.length = 0; };
  Particles.prototype.add = function (o) {
    if (this.list.length >= this.cap) return null;
    const p = {
      x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, age: 0, life: 1000,
      size: 6, size1: null, rgb: '255,200,120', alpha: 1, kind: 'glow', layer: 'top',
      rot: 0, vr: 0, sway: 0, swayF: 1, phase: rand() * TAU, fadeIn: 0.12, fadeOut: 0.45, squash: 1,
    };
    for (const k in o) p[k] = o[k];
    if (p.size1 == null) p.size1 = p.size;
    if (p.add == null) p.add = !!ADDITIVE[p.kind];
    this.list.push(p);
    return p;
  };
  Particles.prototype.update = function (dt) {
    const s = dt / 1000;
    const list = this.list;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vx += p.ax * s;
      p.vy += p.ay * s;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * s);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.rot += p.vr * s;
      // Bones and coins bounce on the floor line they were given.
      if (p.floor != null && p.y > p.floor) {
        p.y = p.floor;
        p.vy *= -0.35;
        p.vx *= 0.6;
        p.vr *= 0.5;
      }
      list[w++] = p;
    }
    list.length = w;
  };
  function envelope(p) {
    const t = p.age / p.life;
    const fin = p.fadeIn > 0 ? Math.min(1, t / p.fadeIn) : 1;
    const fout = p.fadeOut > 0 ? 1 - smoothstep(1 - p.fadeOut, 1, t) : 1;
    return fin * fout;
  }
  // env.lightAt(x, y) in 0..1 makes dust motes show only where there's light.
  Particles.prototype.draw = function (g, layer, env) {
    const list = this.list;
    for (let pass = 0; pass < 2; pass++) {
      g.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.layer === layer && p.add === (pass === 1)) drawParticle(g, p, env);
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  };
  function drawParticle(g, p, env) {
    let a = p.alpha * envelope(p);
    if (p.kind === 'mote' && env && env.lightAt) a *= env.lightAt(p.x, p.y);
    if (a <= 0.004) return;
    const size = lerp(p.size, p.size1, p.age / p.life);
    const x = p.sway ? p.x + Math.sin((p.age / 1000) * p.swayF * TAU + p.phase) * p.sway : p.x;
    const y = p.y;
    g.globalAlpha = Math.min(1, a);
    switch (p.kind) {
      case 'glow':
      case 'ember':
      case 'mote':
      case 'smoke':
        g.drawImage(glow(p.rgb), x - size, y - size * p.squash, size * 2, size * 2 * p.squash);
        // An ember's hot core is cream unless a colored flame gave it its own pale heart (core).
        if (p.kind === 'ember') g.drawImage(glow(p.core || '255,248,215'), x - size * 0.4, y - size * 0.4, size * 0.8, size * 0.8);
        break;
      case 'flake': {
        // A six-armed snowflake with little barbs; it spins slowly as it drifts.
        g.save();
        g.translate(x, y);
        g.rotate(p.rot);
        g.strokeStyle = `rgb(${p.rgb})`;
        g.lineCap = 'round';
        g.lineWidth = Math.max(1, size * 0.22);
        for (let i = 0; i < 3; i++) {
          g.rotate(Math.PI / 3);
          g.beginPath();
          g.moveTo(-size, 0);
          g.lineTo(size, 0);
          g.stroke();
        }
        g.lineWidth = Math.max(0.8, size * 0.14);
        for (let i = 0; i < 6; i++) {
          g.rotate(Math.PI / 3);
          g.beginPath();
          g.moveTo(size * 0.55, 0);
          g.lineTo(size * 0.78, -size * 0.22);
          g.moveTo(size * 0.55, 0);
          g.lineTo(size * 0.78, size * 0.22);
          g.stroke();
        }
        g.restore();
        break;
      }
      case 'spark':
      case 'streak': {
        const len = p.len || (p.kind === 'spark' ? 0.035 : 0.07);
        g.strokeStyle = `rgb(${p.rgb})`;
        g.lineWidth = size;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - p.vx * len, y - p.vy * len);
        g.stroke();
        break;
      }
      case 'star': {
        const s = size * (0.72 + 0.28 * Math.sin(p.age / 85 + p.phase));
        g.save();
        g.translate(x, y);
        g.rotate(p.rot);
        g.drawImage(star(p.rgb), -s, -s, s * 2, s * 2);
        g.restore();
        break;
      }
      case 'ring': {
        const w = p.width || 4;
        g.strokeStyle = `rgb(${p.rgb})`;
        g.beginPath();
        g.ellipse(x, y, Math.max(0.1, size), Math.max(0.1, size * p.squash), 0, 0, TAU);
        g.globalAlpha = Math.min(1, a) * 0.28;
        g.lineWidth = w * 3.2;
        g.stroke();
        g.globalAlpha = Math.min(1, a) * 0.9;
        g.lineWidth = w * 0.7;
        g.stroke();
        break;
      }
      case 'bone':
        g.save();
        g.translate(x, y);
        g.rotate(p.rot);
        bone(g, size, '#2a2018', size * 0.55);
        bone(g, size, '#efe4c8', size * 0.32);
        g.restore();
        break;
      case 'coin': {
        const spin = Math.max(0.18, Math.abs(Math.cos(p.age / 70 + p.phase)));
        // Gold by default; fill and edge recolor it (the Clanker's brass bolts).
        g.fillStyle = p.fill || '#ffd24a';
        g.strokeStyle = p.edge || '#7a4b0c';
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(x, y, size * spin, size, 0, 0, TAU);
        g.fill();
        g.stroke();
        break;
      }
      case 'char':
        g.font = `700 ${Math.round(size)}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.lineWidth = size * 0.22;
        g.strokeStyle = 'rgba(18,14,36,0.92)';
        g.strokeText(p.ch, x, y);
        g.fillStyle = `rgb(${p.rgb})`;
        g.fillText(p.ch, x, y);
        break;
      default:
        break;
    }
  }
  function bone(g, s, color, w) {
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineCap = 'round';
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(-s, 0);
    g.lineTo(s, 0);
    g.stroke();
    for (const bx of [-s, s]) {
      for (const by of [-0.25, 0.25]) {
        g.beginPath();
        g.arc(bx, by * s, w * 0.62, 0, TAU);
        g.fill();
      }
    }
  }

  // ---------------------------------------------------------------- floating text
  const FONT = '"Pixelify Sans", "Lexend", "Trebuchet MS", system-ui, sans-serif';
  // Numbers use Lexend: its digits are the easiest to read (a pixel 5 can look like an S).
  const NUM_FONT = '"Lexend", "Trebuchet MS", system-ui, sans-serif';
  // Back-out with extra overshoot, for a punchy pop-in.
  const outBackBig = (t) => {
    const c1 = 3.2;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  function Floaters() { this.list = []; }
  // o: text, x, y, size, fill, fill2 (gradient bottom), outline, life, rise, pop (start scale),
  // delay, glow ('r,g,b' additive halo behind the words).
  Floaters.prototype.add = function (o) {
    const f = { text: '', x: 0, y: 0, size: 46, fill: '#ffffff', fill2: null, outline: '#170d1e',
      life: 1100, rise: 56, pop: 0.35, delay: 0, age: 0, glow: null };
    for (const k in o) f[k] = o[k];
    this.list.push(f);
    return f;
  };
  Floaters.prototype.clear = function () { this.list.length = 0; };
  Floaters.prototype.update = function (dt) {
    for (const f of this.list) f.age += dt;
    this.list = this.list.filter((f) => f.age < f.life + f.delay);
  };
  Floaters.prototype.draw = function (g) {
    for (const f of this.list) {
      const age = f.age - f.delay;
      if (age < 0) continue;
      const t = age / f.life;
      const sc = f.pop ? lerp(f.pop, 1, outBackBig(Math.min(1, age / 260))) : 1;
      const y = f.y - f.rise * ease.outCubic(t);
      g.save();
      g.translate(f.x, y);
      g.scale(sc, sc);
      g.globalAlpha = 1 - smoothstep(0.74, 1, t);
      if (f.glow) {
        g.globalCompositeOperation = 'lighter';
        const w = f.size * Math.max(2.2, f.text.length * 0.62);
        g.drawImage(glow(f.glow), -w / 2, -f.size * 0.9, w, f.size * 1.8);
        g.globalCompositeOperation = 'source-over';
      }
      g.font = `${f.font ? 800 : 700} ${f.size}px ${f.font || FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = Math.max(5, f.size * 0.2);
      g.strokeStyle = f.outline;
      g.strokeText(f.text, 0, 0);
      if (f.fill2) {
        const gr = g.createLinearGradient(0, -f.size * 0.45, 0, f.size * 0.45);
        gr.addColorStop(0, f.fill);
        gr.addColorStop(1, f.fill2);
        g.fillStyle = gr;
      } else {
        g.fillStyle = f.fill;
      }
      g.fillText(f.text, 0, 0);
      g.restore();
    }
  };

  // ---------------------------------------------------------------- screen shake
  function Shake() {
    this.amp = 0;
    this.decay = 0;
    this.t = 0;
  }
  Shake.prototype.add = function (amp, dur) {
    if (amp <= this.amp) return;
    this.amp = amp;
    this.decay = amp / Math.max(1, dur);
  };
  Shake.prototype.update = function (dt) {
    this.t += dt;
    this.amp = Math.max(0, this.amp - this.decay * dt);
  };
  Shake.prototype.offset = function () {
    if (this.amp < 0.05) return { x: 0, y: 0 };
    return { x: this.amp * noise(this.t * 0.03), y: this.amp * noise(this.t * 0.03 + 71.3) };
  };

  // ---------------------------------------------------------------- color and shape helpers
  // Lighten (amt > 0) or darken (amt < 0) a #rrggbb color.
  function shade(hex, amt) {
    const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0;
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
      Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)));
    return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
  }
  function rgbOf(hex) {
    const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0;
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }
  // shade() as an '#rrggbb' string, for building palettes from one flame color.
  function shadeHex(hex, amt) {
    const m = shade(hex, amt).match(/\d+/g).map(Number);
    return '#' + m.map((v) => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('');
  }
  // Blend two 'r,g,b' strings; t = 0 is a, t = 1 is b.
  function mixRgb(a, b, t) {
    if (!b || t <= 0) return a;
    if (!a || t >= 1) return b;
    const pa = String(a).split(',').map(Number);
    const pb = String(b).split(',').map(Number);
    return pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(',');
  }
  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  // ---------------------------------------------------------------- placeholders
  // A standing game-piece token in the unit's color with its initial, used until art arrives.
  function token(g, x, footY, h, color, letter) {
    const w = h * 0.5;
    const top = footY - h;
    g.save();
    g.fillStyle = 'rgba(8,10,22,0.85)';
    g.beginPath();
    g.ellipse(x, footY - h * 0.03, w * 0.62, w * 0.2, 0, 0, TAU);
    g.fill();
    roundRect(g, x - w / 2 - 4, top - 4, w + 8, h * 0.94 + 8, w * 0.38);
    g.fillStyle = '#f2d27e';
    g.fill();
    const gr = g.createLinearGradient(x - w / 2, top, x + w / 2, top + h);
    gr.addColorStop(0, shade(color, 0.32));
    gr.addColorStop(1, shade(color, -0.35));
    roundRect(g, x - w / 2, top, w, h * 0.94, w * 0.34);
    g.fillStyle = gr;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(12,10,26,0.85)';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(g, x - w / 2 + 6, top + 6, w * 0.32, h * 0.5, w * 0.16);
    g.fill();
    const fs = Math.round(w * 0.74);
    g.font = `800 ${fs}px ${NUM_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = fs * 0.16;
    g.strokeStyle = 'rgba(10,8,24,0.9)';
    g.strokeText(letter, x, top + h * 0.36);
    g.fillStyle = '#ffffff';
    g.fillText(letter, x, top + h * 0.36);
    g.restore();
  }

  // A colored flame's layers, built once per flame color: the color itself outside, paler in
  // the middle and almost white at the heart, the way the gold flame goes orange to cream.
  const flamePals = {};
  function flamePalette(hex) {
    if (!hex) return null;
    if (flamePals[hex]) return flamePals[hex];
    const rgb = rgbOf(hex);
    return (flamePals[hex] = {
      rgb,
      pale: rgbOf(shadeHex(hex, 0.55)),
      deep: rgbOf(shadeHex(hex, -0.3)),
      outer: rgba(rgb, 0.92),
      mid: rgba(rgbOf(shadeHex(hex, 0.38)), 0.95),
      inner: rgba(rgbOf(shadeHex(hex, 0.8)), 0.98),
      tongue: rgba(rgbOf(shadeHex(hex, 0.3)), 0.9),
    });
  }

  // Procedural flame: layered wobbling teardrops. (x, y) is the base of the fire. pal (from
  // flamePalette) colors it; without one it burns the gold brazier's orange.
  function flame(g, x, y, size, t, s, pal) {
    if (size < 1) return;
    const layers = pal ? [[pal.outer, 1, 0], [pal.mid, 0.72, 1.7], [pal.inner, 0.42, 3.1]] : [
      ['rgba(255,96,24,0.92)', 1, 0],
      ['rgba(255,170,50,0.95)', 0.72, 1.7],
      ['rgba(255,236,170,0.98)', 0.42, 3.1],
    ];
    for (const [color, k, off] of layers) {
      const h = size * k * (1 + 0.12 * Math.sin(t * 9.1 + s + off));
      const w = size * 0.34 * k * (1 + 0.08 * Math.sin(t * 6.3 + s * 2 + off));
      const tip = x + Math.sin(t * 7.3 + s + off) * w * 0.35 + noise(t * 3 + s + off) * w * 0.2;
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(x - w, y);
      g.bezierCurveTo(x - w * 1.15, y - h * 0.42, tip - w * 0.3, y - h * 0.7, tip, y - h);
      g.bezierCurveTo(tip + w * 0.3, y - h * 0.7, x + w * 1.15, y - h * 0.42, x + w, y);
      g.quadraticCurveTo(x, y + w * 0.45, x - w, y);
      g.fill();
    }
    // Two little side tongues that lick up and vanish.
    for (let i = 0; i < 2; i++) {
      const ph = ((t * 1.7 + s * 0.37 + i * 0.5) % 1 + 1) % 1;
      const side = i ? 1 : -1;
      const tx = x + side * size * (0.16 + 0.06 * Math.sin(t * 5 + i));
      const ty = y - size * (0.25 + ph * 0.7);
      const r = size * 0.1 * (1 - ph);
      if (r < 0.5) continue;
      g.fillStyle = pal ? pal.tongue : 'rgba(255,170,60,0.9)';
      g.beginPath();
      g.ellipse(tx, ty, r * 0.7, r * 1.3, 0, 0, TAU);
      g.fill();
    }
  }

  // A cluster of crystal shards standing on (x, baseY): the stand-in for Chapter 2's crystal
  // props. n shards, the tallest h high, in the given color.
  function crystals(g, x, baseY, w, h, color, n, seedKey) {
    const r = makeRng(strHash(String(seedKey || color)));
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const cx = x + (k - 0.5) * w;
      const ch = h * (0.45 + 0.55 * (1 - Math.abs(k - 0.5) * 1.6)) * (0.85 + r() * 0.3);
      const cw = w / n * 0.7;
      const lean = (k - 0.5) * 0.5;
      g.beginPath();
      g.moveTo(cx - cw / 2, baseY);
      g.lineTo(cx - cw * 0.3 + lean * ch * 0.5, baseY - ch * 0.85);
      g.lineTo(cx + lean * ch * 0.6, baseY - ch);
      g.lineTo(cx + cw * 0.35 + lean * ch * 0.5, baseY - ch * 0.8);
      g.lineTo(cx + cw / 2, baseY);
      g.closePath();
      g.fillStyle = shade(color, -0.15 + 0.3 * (i % 2));
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.moveTo(cx - cw * 0.25, baseY - ch * 0.1);
      g.lineTo(cx - cw * 0.2 + lean * ch * 0.5, baseY - ch * 0.8);
      g.lineTo(cx - cw * 0.05 + lean * ch * 0.5, baseY - ch * 0.75);
      g.lineTo(cx - cw * 0.08, baseY - ch * 0.1);
      g.closePath();
      g.fill();
    }
  }

  // Simple, tidy prop shapes for props whose art hasn't arrived. The box is w x h with its
  // base centered at (x, baseY). opts.color (an '#rrggbb' flame color) fills a colored
  // brazier's bowl with crystal of that color.
  function propShape(g, type, x, baseY, w, h, opts) {
    const top = baseY - h;
    const color = (opts && opts.color) || null;
    g.save();
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(10,10,20,0.85)';
    g.lineWidth = 3;
    const ell = (cx, cy, rx, ry, fill) => {
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      g.fillStyle = fill;
      g.fill();
      g.stroke();
    };
    const box = (bx, by, bw, bh, fill, r) => {
      roundRect(g, bx, by, bw, bh, r || 3);
      g.fillStyle = fill;
      g.fill();
      g.stroke();
    };
    switch (type) {
      case 'brazier': {
        ell(x, baseY - h * 0.1, w * 0.42, h * 0.1, '#5d6476');
        g.lineWidth = Math.max(3, w * 0.05);
        g.strokeStyle = '#2a2833';
        for (const k of [-1, 0, 1]) {
          g.beginPath();
          g.moveTo(x + k * w * 0.26, baseY - h * 0.14);
          g.quadraticCurveTo(x + k * w * 0.32, baseY - h * 0.35, x + k * w * 0.2, baseY - h * 0.5);
          g.stroke();
        }
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(10,10,20,0.85)';
        g.beginPath();
        g.ellipse(x, baseY - h * 0.64, w * 0.44, h * 0.26, 0, 0, Math.PI);
        g.fillStyle = '#3b3744';
        g.fill();
        g.stroke();
        ell(x, baseY - h * 0.64, w * 0.44, h * 0.1, '#5a5463');
        ell(x, baseY - h * 0.64, w * 0.36, h * 0.07, color ? shade(color, -0.45) : '#17151c');
        // A colored brazier's bowl holds a few crystals of its color (the game draws the flame).
        if (color) crystals(g, x, baseY - h * 0.66, w * 0.5, h * 0.3, color, 4, 'bowl' + color);
        break;
      }
      case 'flower-bed': {
        box(x - w * 0.46, baseY - h * 0.42, w * 0.92, h * 0.4, '#6b6d7c', 6);
        ell(x, baseY - h * 0.42, w * 0.42, h * 0.1, '#4a7a3c');
        const blooms = [[-0.28, 0.72, '#ff8fb0'], [-0.08, 0.86, '#ffd36a'], [0.14, 0.78, '#8fd0ff'], [0.32, 0.68, '#d09aff']];
        for (const [dx, hh, col] of blooms) {
          g.strokeStyle = '#3f7a38';
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(x + dx * w, baseY - h * 0.44);
          g.lineTo(x + dx * w, baseY - h * hh);
          g.stroke();
          g.strokeStyle = 'rgba(10,10,20,0.85)';
          ell(x + dx * w, baseY - h * hh, w * 0.07, w * 0.07, col);
        }
        break;
      }
      case 'ice-crystals':
        crystals(g, x, baseY - h * 0.04, w * 0.9, h * 0.95, color || '#8fd6ff', 5, 'ice');
        break;
      case 'anvil': {
        box(x - w * 0.22, baseY - h * 0.4, w * 0.44, h * 0.38, '#3d3f4c', 4);
        roundRect(g, x - w * 0.46, top + h * 0.12, w * 0.92, h * 0.3, 6);
        g.fillStyle = '#6f7384';
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x - w * 0.4, top + h * 0.15, w * 0.8, h * 0.06);
        break;
      }
      case 'furnace': {
        box(x - w * 0.46, top + h * 0.06, w * 0.92, h * 0.92, '#4a3a3c', 8);
        box(x - w * 0.3, top + h * 0.4, w * 0.6, h * 0.42, '#1a1014', 6);
        g.fillStyle = color ? shade(color, 0.1) : '#ff7a3a';
        g.beginPath();
        g.ellipse(x, top + h * 0.7, w * 0.2, h * 0.12, 0, 0, TAU);
        g.fill();
        box(x - w * 0.14, top, w * 0.28, h * 0.1, '#5a4a4c', 3);
        break;
      }
      case 'star-globe': {
        box(x - w * 0.2, baseY - h * 0.3, w * 0.4, h * 0.28, '#4f5366', 4);
        const gr = g.createRadialGradient(x - w * 0.1, top + h * 0.3, 4, x, top + h * 0.38, w * 0.4);
        gr.addColorStop(0, '#e9d8ff');
        gr.addColorStop(1, color || '#8a5fd6');
        ell(x, top + h * 0.38, w * 0.38, w * 0.38, gr);
        g.fillStyle = 'rgba(255,255,255,0.9)';
        for (const [sx, sy] of [[-0.18, 0.28], [0.12, 0.2], [0.2, 0.5], [-0.05, 0.55]]) {
          g.beginPath();
          g.arc(x + sx * w, top + h * sy, w * 0.025, 0, TAU);
          g.fill();
        }
        break;
      }
      case 'crystal-pillar':
        crystals(g, x, baseY - h * 0.03, w * 0.7, h * 0.97, color || '#b9a6ff', 3, 'pillar');
        break;
      case 'prism-heart': {
        box(x - w * 0.4, baseY - h * 0.22, w * 0.8, h * 0.2, '#5d6680', 4);
        const gr = g.createLinearGradient(x - w * 0.3, top, x + w * 0.3, baseY);
        ['#6ec8ff', '#7be07b', '#ff7a52', '#c08bff'].forEach((c, i) => gr.addColorStop(i / 3, c));
        g.beginPath();
        g.moveTo(x, top);
        g.lineTo(x + w * 0.3, top + h * 0.3);
        g.lineTo(x + w * 0.18, baseY - h * 0.22);
        g.lineTo(x - w * 0.18, baseY - h * 0.22);
        g.lineTo(x - w * 0.3, top + h * 0.3);
        g.closePath();
        g.fillStyle = gr;
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.beginPath();
        g.moveTo(x - w * 0.02, top + h * 0.08);
        g.lineTo(x - w * 0.22, top + h * 0.32);
        g.lineTo(x - w * 0.12, baseY - h * 0.26);
        g.lineTo(x - w * 0.06, top + h * 0.3);
        g.closePath();
        g.fill();
        break;
      }
      case 'chest': {
        const cw = w * 0.82;
        const ch = h * 0.78;
        const cx = x - cw / 2;
        const cy = baseY - ch - h * 0.04;
        box(cx, cy + ch * 0.38, cw, ch * 0.62, '#7b4a25');
        box(cx, cy, cw, ch * 0.44, '#975b2b', ch * 0.2);
        g.fillStyle = '#e2b24c';
        for (const bx of [cx + cw * 0.14, cx + cw * 0.78]) g.fillRect(bx, cy + 2, cw * 0.08, ch - 4);
        box(x - cw * 0.08, cy + ch * 0.3, cw * 0.16, ch * 0.22, '#f3cd62', 2);
        break;
      }
      case 'pillar': {
        const pw = w * 0.5;
        const gr = g.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
        gr.addColorStop(0, '#39405a');
        gr.addColorStop(0.45, '#7c86a3');
        gr.addColorStop(1, '#2c3247');
        box(x - pw / 2, top + h * 0.08, pw, h * 0.84, gr, 2);
        g.strokeStyle = 'rgba(20,22,40,0.35)';
        for (const k of [-0.25, 0, 0.25]) {
          g.beginPath();
          g.moveTo(x + k * pw, top + h * 0.1);
          g.lineTo(x + k * pw, baseY - h * 0.1);
          g.stroke();
        }
        g.strokeStyle = 'rgba(10,10,20,0.85)';
        box(x - pw * 0.66, top, pw * 1.32, h * 0.09, '#69728e', 2);
        box(x - pw * 0.66, baseY - h * 0.09, pw * 1.32, h * 0.09, '#555d78', 2);
        break;
      }
      case 'barrel': {
        const bw = w * 0.62;
        box(x - bw / 2, top + h * 0.1, bw, h * 0.88, '#8a5a2e', bw * 0.3);
        g.fillStyle = '#3a3a44';
        for (const k of [0.28, 0.72]) g.fillRect(x - bw / 2 + 2, top + h * (0.1 + 0.88 * k), bw - 4, h * 0.05);
        ell(x, top + h * 0.12, bw * 0.46, h * 0.07, '#a87342');
        break;
      }
      case 'crates': {
        box(x - w * 0.44, baseY - h * 0.55, w * 0.52, h * 0.53, '#9b6a36');
        box(x - w * 0.02, baseY - h * 0.45, w * 0.44, h * 0.43, '#8a5d2f');
        box(x - w * 0.34, top + h * 0.02, w * 0.42, h * 0.42, '#a87643');
        break;
      }
      case 'bookshelf': {
        box(x - w * 0.46, top, w * 0.92, h * 0.98, '#5b3b22');
        const colors = ['#b8433a', '#3f6fb8', '#d9a441', '#4c9a5b', '#8b5cc4'];
        for (let s = 0; s < 4; s++) {
          const sy = top + h * (0.08 + s * 0.23);
          let bx = x - w * 0.4;
          for (let b = 0; bx < x + w * 0.36; b++) {
            const bw2 = w * (0.06 + ((b * 7 + s * 3) % 4) * 0.012);
            g.fillStyle = colors[(b + s * 2) % colors.length];
            g.fillRect(bx, sy + 3, bw2 - 2, h * 0.17);
            bx += bw2;
          }
        }
        break;
      }
      case 'mushrooms': {
        ell(x, baseY - h * 0.08, w * 0.4, h * 0.1, '#3d5a3a');
        const caps = [[-0.2, 0.62, 0.2, '#5fd6c4'], [0.18, 0.82, 0.24, '#a77ae0'], [0.02, 0.45, 0.15, '#7fe0f0']];
        for (const [dx, hh, r, col] of caps) {
          const cx = x + dx * w;
          g.fillStyle = '#e8e0cc';
          g.fillRect(cx - w * 0.035, baseY - h * hh, w * 0.07, h * hh - h * 0.08);
          g.beginPath();
          g.ellipse(cx, baseY - h * hh, w * r, h * r * 0.55, 0, Math.PI, 0);
          g.closePath();
          g.fillStyle = col;
          g.fill();
          g.stroke();
        }
        break;
      }
      case 'sarcophagus': {
        box(x - w * 0.46, baseY - h * 0.7, w * 0.92, h * 0.66, '#59617a', 6);
        box(x - w * 0.42, top + h * 0.02, w * 0.84, h * 0.36, '#7a84a0', 10);
        g.fillStyle = 'rgba(20,22,40,0.35)';
        g.fillRect(x - w * 0.05, top + h * 0.08, w * 0.1, h * 0.26);
        break;
      }
      case 'weapon-rack': {
        box(x - w * 0.42, baseY - h * 0.16, w * 0.84, h * 0.12, '#6b4426');
        box(x - w * 0.42, top + h * 0.2, w * 0.84, h * 0.08, '#6b4426');
        g.lineWidth = 5;
        for (const k of [-0.26, 0, 0.26]) {
          g.strokeStyle = '#c9ced8';
          g.beginPath();
          g.moveTo(x + k * w, baseY - h * 0.18);
          g.lineTo(x + k * w, top + h * 0.04);
          g.stroke();
        }
        break;
      }
      case 'rubble':
        ell(x - w * 0.18, baseY - h * 0.25, w * 0.22, h * 0.2, '#5a6072');
        ell(x + w * 0.16, baseY - h * 0.22, w * 0.2, h * 0.18, '#4c5263');
        ell(x, baseY - h * 0.5, w * 0.18, h * 0.18, '#6a7186');
        break;
      case 'heart-lantern': {
        box(x - w * 0.34, baseY - h * 0.28, w * 0.68, h * 0.26, '#5d6680', 4);
        box(x - w * 0.26, top + h * 0.12, w * 0.52, h * 0.5, '#b8893a', 10);
        box(x - w * 0.18, top + h * 0.2, w * 0.36, h * 0.34, '#2a3a5a', 6);
        g.beginPath();
        g.moveTo(x - w * 0.3, top + h * 0.13);
        g.lineTo(x, top);
        g.lineTo(x + w * 0.3, top + h * 0.13);
        g.closePath();
        g.fillStyle = '#c99a44';
        g.fill();
        g.stroke();
        break;
      }
      default: {
        box(x - w * 0.4, top + h * 0.2, w * 0.8, h * 0.78, '#4f5770', 8);
        g.font = `700 ${Math.round(w * 0.32)}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#e8e4d8';
        g.fillText(String(type || '?').charAt(0).toUpperCase(), x, top + h * 0.58);
      }
    }
    g.restore();
  }

  // A dark stone-tile room for a missing room painting: brick back wall, arches where
  // the exits are, flagstones lined up with the 12x7 grid, and a soft vignette.
  function stoneRoom(L, arches, key) {
    const W = L.W;
    const H = L.H;
    const c = canvas(W, H);
    const g = c.getContext('2d');
    const r = makeRng(strHash(String(key || 'room')));
    const fx0 = L.FLOOR.x0 * W;
    const fy0 = L.FLOOR.y0 * H;
    const fx1 = L.FLOOR.x1 * W;
    g.fillStyle = '#0b0d1a';
    g.fillRect(0, 0, W, H);
    // Back wall bricks.
    for (let row = 0, y = 0; y < fy0; row++, y += 36) {
      for (let x = row % 2 ? -40 : 0; x < W; x += 80) {
        const v = 26 + Math.floor(r() * 14);
        g.fillStyle = `rgb(${v},${v + 4},${v + 20})`;
        g.fillRect(x + 2, y + 2, 76, 32);
      }
    }
    // Side walls.
    for (const [x0, x1] of [[0, fx0], [fx1, W]]) {
      for (let y = fy0; y < H; y += 34) {
        const v = 18 + Math.floor(r() * 10);
        g.fillStyle = `rgb(${v},${v + 3},${v + 16})`;
        g.fillRect(x0 + 2, y + 2, x1 - x0 - 4, 30);
      }
    }
    // Doorway arches in the back wall.
    for (const slot of arches || []) {
      if (!L.ARCHES[slot]) continue;
      const ax = L.archCenterX(slot);
      const aw = L.cellW * 1.5;
      g.fillStyle = '#5a6078';
      g.beginPath();
      g.moveTo(ax - aw / 2 - 16, fy0);
      g.lineTo(ax - aw / 2 - 16, fy0 - 110);
      g.arc(ax, fy0 - 110, aw / 2 + 16, Math.PI, 0);
      g.lineTo(ax + aw / 2 + 16, fy0);
      g.fill();
      g.fillStyle = '#04050b';
      g.beginPath();
      g.moveTo(ax - aw / 2, fy0);
      g.lineTo(ax - aw / 2, fy0 - 110);
      g.arc(ax, fy0 - 110, aw / 2, Math.PI, 0);
      g.lineTo(ax + aw / 2, fy0);
      g.fill();
    }
    // Floor flagstones, one or two per square.
    for (let row = 0; row < L.ROWS; row++) {
      for (let col = 0; col < L.COLS; col++) {
        const q = L.cellRect(col, row);
        const split = r() < 0.4;
        const parts = split ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] : [[0, 0, 1, 1]];
        for (const [px, py, pw, ph] of parts) {
          const v = 52 + Math.floor(r() * 16);
          g.fillStyle = `rgb(${v + 6},${v},${v + 12})`;
          roundRect(g, q.x + q.w * px + 3, q.y + q.h * py + 3, q.w * pw - 6, q.h * ph - 6, 6);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.05)';
          g.fillRect(q.x + q.w * px + 6, q.y + q.h * py + 5, q.w * pw - 12, 4);
        }
      }
    }
    const vg = g.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, W * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,8,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    return c;
  }

  // A shadow-moth silhouette for the boss before its painting arrives. Box w x h centered
  // on (cx, cy); flap in -1..1 swings the wings.
  function moth(g, cx, cy, w, h, flap) {
    g.save();
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(8,6,20,0.9)';
    const wing = (side, upper) => {
      const k = 1 + 0.06 * flap;
      const wx = cx + side * w * (upper ? 0.24 : 0.2) * k;
      const wy = cy + h * (upper ? -0.12 : 0.18);
      const rx = w * (upper ? 0.27 : 0.19) * k;
      const ry = h * (upper ? 0.3 : 0.22);
      const rot = side * (upper ? -0.45 : 0.55);
      const gr = g.createRadialGradient(wx, wy, 4, wx, wy, rx);
      gr.addColorStop(0, '#5a3d9a');
      gr.addColorStop(1, '#21163f');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(wx, wy, rx, ry, rot, 0, TAU);
      g.fill();
      g.stroke();
      // Lantern-gold eyespot.
      const ex = wx + side * rx * 0.25;
      const ey = wy - ry * (upper ? 0.1 : -0.05);
      g.fillStyle = '#f2b440';
      g.beginPath();
      g.ellipse(ex, ey, rx * 0.3, ry * 0.26, rot, 0, TAU);
      g.fill();
      g.fillStyle = '#1a1030';
      g.beginPath();
      g.ellipse(ex, ey, rx * 0.16, ry * 0.14, rot, 0, TAU);
      g.fill();
    };
    for (const side of [-1, 1]) {
      wing(side, false);
      wing(side, true);
    }
    // Feathery antennae with cyan tips.
    g.strokeStyle = '#8fd8ff';
    g.lineWidth = 5;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + side * w * 0.03, cy - h * 0.2);
      g.quadraticCurveTo(cx + side * w * 0.08, cy - h * 0.42, cx + side * w * 0.16, cy - h * 0.46);
      g.stroke();
    }
    // Furry body, glowing chest and big glossy eyes.
    g.strokeStyle = 'rgba(8,6,20,0.9)';
    g.lineWidth = 4;
    g.fillStyle = '#2e2350';
    g.beginPath();
    g.ellipse(cx, cy + h * 0.06, w * 0.08, h * 0.27, 0, 0, TAU);
    g.fill();
    g.stroke();
    g.fillStyle = '#7fe6ff';
    g.beginPath();
    g.ellipse(cx, cy + h * 0.02, w * 0.035, h * 0.07, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#3a2d63';
    g.beginPath();
    g.arc(cx, cy - h * 0.2, w * 0.075, 0, TAU);
    g.fill();
    g.stroke();
    for (const side of [-1, 1]) {
      g.fillStyle = '#0b0718';
      g.beginPath();
      g.arc(cx + side * w * 0.035, cy - h * 0.205, w * 0.026, 0, TAU);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(cx + side * w * 0.03, cy - h * 0.215, w * 0.008, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  // A chubby stone-grey dragon for the Color Dragon before its painting arrives: a round body
  // with a swirly rainbow belly, stubby wings, crystal back spikes and big curious eyes. The box
  // is w x h centered on (cx, cy); it faces right.
  function dragon(g, cx, cy, w, h) {
    g.save();
    g.lineJoin = 'round';
    const outline = 'rgba(14,12,24,0.9)';
    const blob = (x, y, rx, ry, fill, rot) => {
      g.beginPath();
      g.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
      g.fillStyle = fill;
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = outline;
      g.stroke();
    };
    // Tail curling behind.
    g.lineCap = 'round';
    g.lineWidth = w * 0.07;
    g.strokeStyle = '#6f7182';
    g.beginPath();
    g.moveTo(cx - w * 0.28, cy + h * 0.18);
    g.quadraticCurveTo(cx - w * 0.5, cy + h * 0.3, cx - w * 0.46, cy + h * 0.02);
    g.stroke();
    g.lineWidth = w * 0.03;
    g.strokeStyle = '#c5d2ff';
    g.beginPath();
    g.moveTo(cx - w * 0.47, cy + h * 0.04);
    g.lineTo(cx - w * 0.44, cy - h * 0.06);
    g.stroke();
    // Stubby wings and the round body.
    blob(cx - w * 0.1, cy - h * 0.24, w * 0.16, h * 0.09, '#5c5e70', -0.5);
    blob(cx + w * 0.12, cy - h * 0.26, w * 0.15, h * 0.08, '#5c5e70', 0.4);
    blob(cx, cy + h * 0.08, w * 0.33, h * 0.3, '#7d7f90');
    // The belly, swirling with the four trapped flames.
    blob(cx + w * 0.02, cy + h * 0.14, w * 0.22, h * 0.2, '#a9abbb');
    g.save();
    g.beginPath();
    g.ellipse(cx + w * 0.02, cy + h * 0.14, w * 0.2, h * 0.18, 0, 0, TAU);
    g.clip();
    ['#6ec8ff', '#7be07b', '#ff7a52', '#c08bff'].forEach((c, i) => {
      g.strokeStyle = c;
      g.lineWidth = w * 0.03;
      g.globalAlpha = 0.85;
      g.beginPath();
      g.arc(cx + w * 0.02, cy + h * 0.14, w * (0.04 + i * 0.045), i * 1.2, i * 1.2 + 4.2);
      g.stroke();
    });
    g.restore();
    g.globalAlpha = 1;
    // Crystal spikes along the back, little feet.
    g.fillStyle = '#c5d2ff';
    g.lineWidth = 3;
    g.strokeStyle = outline;
    for (let i = 0; i < 4; i++) {
      const sx = cx - w * 0.22 + i * w * 0.12;
      const sy = cy - h * 0.2 + Math.abs(i - 1.5) * h * 0.02;
      g.beginPath();
      g.moveTo(sx - w * 0.03, sy);
      g.lineTo(sx, sy - h * 0.1);
      g.lineTo(sx + w * 0.03, sy);
      g.closePath();
      g.fill();
      g.stroke();
    }
    blob(cx - w * 0.16, cy + h * 0.38, w * 0.09, h * 0.05, '#6a6c7c');
    blob(cx + w * 0.14, cy + h * 0.38, w * 0.09, h * 0.05, '#6a6c7c');
    // Head, snout, a friendly smile and big curious eyes.
    blob(cx + w * 0.3, cy - h * 0.18, w * 0.17, h * 0.16, '#8a8c9c');
    blob(cx + w * 0.42, cy - h * 0.12, w * 0.1, h * 0.07, '#9a9cab');
    g.lineWidth = 3;
    g.strokeStyle = outline;
    g.beginPath();
    g.arc(cx + w * 0.4, cy - h * 0.09, w * 0.05, 0.2, 2.2);
    g.stroke();
    for (const [ex, er] of [[cx + w * 0.29, w * 0.045], [cx + w * 0.38, w * 0.04]]) {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(ex, cy - h * 0.22, er, 0, TAU);
      g.fill();
      g.stroke();
      g.fillStyle = '#1a1430';
      g.beginPath();
      g.arc(ex + er * 0.25, cy - h * 0.215, er * 0.55, 0, TAU);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(ex + er * 0.4, cy - h * 0.25, er * 0.2, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  // Round marker badge above usable things: 'light' (flame), 'open' (sparkle),
  // 'help' (heart), 'heal' (plus) and 'target' (crosshair). Dark center, bright glyph.
  const BADGE = {
    light: { ring: '#ffc85a', fill: ['#4d2a12', '#21110a'] },
    open: { ring: '#ffe08a', fill: ['#4a3814', '#1f1608'] },
    help: { ring: '#8cffb0', fill: ['#16542e', '#0a2416'] },
    heal: { ring: '#8cffb0', fill: ['#16542e', '#0a2416'] },
    target: { ring: '#ff8f7a', fill: ['#5a1410', '#2a0806'] },
  };
  function flamePath(g, x, y, s) {
    g.beginPath();
    g.moveTo(x + s * 0.12, y - s * 1.15);
    g.bezierCurveTo(x + s * 0.22, y - s * 0.6, x + s * 0.95, y - s * 0.35, x + s * 0.78, y + s * 0.35);
    g.bezierCurveTo(x + s * 0.65, y + s * 0.95, x - s * 0.65, y + s * 0.95, x - s * 0.78, y + s * 0.35);
    g.bezierCurveTo(x - s * 0.88, y - s * 0.12, x - s * 0.52, y - s * 0.35, x - s * 0.44, y - s * 0.7);
    g.bezierCurveTo(x - s * 0.22, y - s * 0.36, x - s * 0.04, y - s * 0.56, x + s * 0.12, y - s * 1.15);
    g.closePath();
  }
  function badge(g, x, y, r, kind) {
    const st = BADGE[kind] || BADGE.open;
    const s = r * 0.58;
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.beginPath();
    g.arc(x, y + r * 0.2, r * 1.08, 0, TAU);
    g.fill();
    const gr = g.createLinearGradient(x, y - r, x, y + r);
    gr.addColorStop(0, st.fill[0]);
    gr.addColorStop(1, st.fill[1]);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    g.lineWidth = Math.max(2.5, r * 0.16);
    g.strokeStyle = st.ring;
    g.stroke();
    if (kind === 'light') {
      flamePath(g, x, y + s * 0.08, s);
      g.fillStyle = '#ff7a2a';
      g.fill();
      flamePath(g, x, y + s * 0.4, s * 0.55);
      g.fillStyle = '#ffe48a';
      g.fill();
    } else if (kind === 'help') {
      g.beginPath();
      g.moveTo(x, y + s * 0.85);
      g.bezierCurveTo(x - s * 1.3, y - s * 0.1, x - s * 0.6, y - s * 1.05, x, y - s * 0.4);
      g.bezierCurveTo(x + s * 0.6, y - s * 1.05, x + s * 1.3, y - s * 0.1, x, y + s * 0.85);
      g.fillStyle = '#ff8fab';
      g.fill();
    } else if (kind === 'heal') {
      const k = s * 0.34;
      g.beginPath();
      g.rect(x - k, y - s, k * 2, s * 2);
      g.rect(x - s, y - k, s * 2, k * 2);
      g.fillStyle = '#a4ffb8';
      g.fill('nonzero');
    } else if (kind === 'target') {
      g.lineWidth = Math.max(2, r * 0.12);
      g.strokeStyle = '#ff9c8a';
      g.beginPath();
      g.arc(x, y, s * 0.7, 0, TAU);
      g.moveTo(x - s, y);
      g.lineTo(x + s, y);
      g.moveTo(x, y - s);
      g.lineTo(x, y + s);
      g.stroke();
    } else {
      g.beginPath();
      g.moveTo(x, y - s * 1.15);
      g.quadraticCurveTo(x + s * 0.2, y - s * 0.2, x + s * 1.15, y);
      g.quadraticCurveTo(x + s * 0.2, y + s * 0.2, x, y + s * 1.15);
      g.quadraticCurveTo(x - s * 0.2, y + s * 0.2, x - s * 1.15, y);
      g.quadraticCurveTo(x - s * 0.2, y - s * 0.2, x, y - s * 1.15);
      g.fillStyle = '#ffe48a';
      g.fill();
    }
    g.restore();
  }

  return {
    TAU, clamp, lerp, smoothstep, ease, seed, rand, range, pick, noise, flicker,
    canvas, glow, hole, shadow, star, scaled, silhouette, greyed,
    Clock, Particles, Floaters, Shake, FONT, NUM_FONT,
    shade, shadeHex, rgbOf, mixRgb, roundRect, strHash, token, flame, flamePalette, prop: propShape, stoneRoom, moth, dragon, badge,
  };
});
