// Lanternbearers dice tray: a d20 that tumbles, bounces, flickers through numbers and
// settles with a pop, then the math and a big HIT / MISS / CRITICAL! stamp.
// Damage and heal dice (d4 to d12) roll the same way.
//   LB_DICE.roll(container, rollEvent, opts?) -> Promise
//   rollEvent: a rules 'roll' event { uid, d: 20, value, bonus, lit, total, need, hit, crit, fumble, line }
//           or a 'damage' / 'heal' event { target, amount, rolls, crit, by } (die size from opts.d or e.d)
//   opts: { keep, append, monster, d, plus, label, sound }
// Visual randomness (the flicker) uses Math.random on purpose: it never touches the game's seeded dice.
(function (root) {
  'use strict';
  const LIT_BONUS = 2;
  let uidCounter = 0;
  let fadeTimer = 0;

  const SHAPES = {
    // Each die: the outline, shaded facets (0 bright .. 1 dark), the face that shows the number.
    20: {
      outline: '50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5',
      facets: [
        ['9,26.5 50,3 50,21', 0.15], ['50,3 91,26.5 50,21', 0.3], ['9,26.5 50,21 23,67', 0.35],
        ['91,26.5 77,67 50,21', 0.5], ['9,26.5 23,67 9,73.5', 0.6], ['91,26.5 91,73.5 77,67', 0.72],
        ['9,73.5 23,67 50,97', 0.8], ['91,73.5 50,97 77,67', 0.88], ['23,67 77,67 50,97', 0.62],
      ],
      face: '50,21 77,67 23,67',
      num: [50, 55, 25],
      tiny: [['7', 29, 40, -30], ['13', 72, 41, 32], ['19', 50, 84, 0]],
    },
    12: {
      outline: '50,3 79,12 96,38 90,72 66,95 34,95 10,72 4,38 21,12',
      facets: [
        ['50,3 79,12 74,41 50,24', 0.2], ['50,3 50,24 26,41 21,12', 0.12], ['79,12 96,38 74,41', 0.45],
        ['21,12 26,41 4,38', 0.3], ['96,38 90,72 65,68 74,41', 0.65], ['4,38 26,41 35,68 10,72', 0.5],
        ['90,72 66,95 65,68', 0.85], ['10,72 35,68 34,95', 0.75], ['35,68 65,68 66,95 34,95', 0.8],
      ],
      face: '50,24 74,41 65,68 35,68 26,41',
      num: [50, 49, 25],
      tiny: [],
    },
    10: {
      outline: '50,3 93,40 86,62 50,97 14,62 7,40',
      facets: [
        ['50,3 7,40 26,46', 0.2], ['50,3 93,40 74,46', 0.45], ['7,40 26,46 50,64 14,62', 0.55],
        ['93,40 86,62 50,64 74,46', 0.7], ['14,62 50,64 50,97', 0.8], ['86,62 50,97 50,64', 0.9],
      ],
      face: '50,3 74,46 50,64 26,46',
      num: [50, 44, 25],
      tiny: [],
    },
    8: {
      outline: '50,3 93,50 50,97 7,50',
      facets: [
        ['50,3 20,50 7,50', 0.3], ['50,3 93,50 80,50', 0.55], ['7,50 20,50 50,97', 0.7],
        ['93,50 50,97 80,50', 0.9], ['20,50 80,50 50,97', 0.6],
      ],
      face: '50,3 80,50 20,50',
      num: [50, 37, 25],
      tiny: [],
    },
    6: {
      outline: '14,30 32,12 88,12 88,70 70,88 14,88',
      facets: [['14,30 32,12 88,12 70,30', 0.15], ['70,30 88,12 88,70 70,88', 0.7]],
      face: '14,30 70,30 70,88 14,88',
      num: [42, 60, 34],
      tiny: [],
    },
    4: {
      outline: '50,4 95,88 5,88',
      facets: [['50,4 95,88 72,88', 0.75], ['50,4 28,88 5,88', 0.4]],
      face: '50,14 72,88 28,88',
      num: [50, 66, 26],
      tiny: [],
    },
  };

  function shapeFor(d) {
    if (SHAPES[d]) return SHAPES[d];
    const sizes = [4, 6, 8, 10, 12, 20];
    return SHAPES[sizes.find((s) => s >= d) || 20];
  }

  // Inline SVG for a die; colors come from CSS variables so style.css owns the palette.
  function dieSvg(d, value) {
    const s = shapeFor(d);
    const id = 'dz' + (++uidCounter);
    const facets = s.facets.map(([pts, dark]) =>
      `<polygon points="${pts}" fill="url(#${id}g)" opacity="1"/>` +
      `<polygon points="${pts}" fill="var(--dz-shade, #1a1238)" opacity="${(dark * 0.55).toFixed(2)}"/>`).join('');
    const tiny = s.tiny.map(([t, x, y, r]) =>
      `<text x="${x}" y="${y}" class="dz-tiny" transform="rotate(${r} ${x} ${y})">${t}</text>`).join('');
    const [nx, ny, fs] = s.num;
    return `<svg class="dz-svg" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="${id}g" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" style="stop-color: var(--dz-a, #fff6d8)"/>
          <stop offset="1" style="stop-color: var(--dz-b, #e0a53c)"/>
        </linearGradient>
        <radialGradient id="${id}f" cx="0.45" cy="0.3" r="0.8">
          <stop offset="0" style="stop-color: var(--dz-face-a, #fffaf0)"/>
          <stop offset="1" style="stop-color: var(--dz-face-b, #f2c86a)"/>
        </radialGradient>
      </defs>
      <polygon points="${s.outline}" class="dz-outline"/>
      ${facets}
      <polygon points="${s.face}" fill="url(#${id}f)" class="dz-face"/>
      <polygon points="${s.outline}" class="dz-rim"/>
      ${tiny}
      <text x="${nx}" y="${ny}" class="dz-num" style="font-size:${fs}px">${value == null ? '' : value}</text>
    </svg>`;
  }

  function isHero(uid) {
    const data = root.LB_DATA;
    return !!(uid && data && data.heroes && data.heroes[uid]);
  }

  function heroName(uid) {
    const h = root.LB_DATA && root.LB_DATA.heroes && root.LB_DATA.heroes[uid];
    return h ? h.name : '';
  }

  function sum(list) { return (list || []).reduce((a, b) => a + (Number(b) || 0), 0); }

  // The smallest standard die that could have rolled every value we saw.
  function guessDie(rolls) {
    const top = Math.max.apply(null, (rolls || [1]).concat([1]));
    return [4, 6, 8, 10, 12, 20].find((s) => s >= top) || 20;
  }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function wait(ms) { return new Promise((r) => setTimeout(r, Math.max(0, ms))); }

  function sound(name, opts) {
    if (opts && opts.sound === false) return;
    try { if (root.LB_AUDIO) root.LB_AUDIO.play(name); } catch (e) { /* ignore */ }
  }

  // Every animation that holds its end pose is cancelled once it has finished, so the element
  // falls back to its plain resting style. That keeps the final picture right even when a
  // browser's animation clock stalls (background tabs, headless screenshots).
  function anim(node, frames, o) {
    if (!node || !node.animate) return null;
    try {
      const a = node.animate(frames, o);
      if (o && (o.fill === 'both' || o.fill === 'forwards')) {
        setTimeout(() => { try { a.cancel(); } catch (e) { /* ignore */ } }, (o.delay || 0) + (o.duration || 0) + 40);
      }
      return a;
    } catch (e) { return null; }
  }

  // Durations: fast mode halves them; monster rolls are quicker still.
  function pace(monster) {
    return (LB_DICE.speed >= 2 ? 0.5 : 1) * (monster ? 0.62 : 1);
  }

  function calm() {
    if (LB_DICE.calm) return true;
    const doc = root.document && root.document.documentElement;
    return !!(doc && doc.classList.contains('lb-calm'));
  }

  // The tumble: the die flies in on an arc, bounces twice, spins in 3D, and the
  // number flickers, slowing down until it lands on the real value.
  function tumble(die, d, value, ms, delay) {
    const num = die.querySelector('.dz-num');
    const svg = die.querySelector('.dz-svg');
    const quiet = calm();
    let gap = 40;
    let stopAt = 0;
    let landed = false;
    let timer = 0;
    // The flicker stops by the clock, and never after the landing: timers run late while the
    // board animates, and a late flicker used to overwrite the face the die landed on.
    const flick = () => {
      if (landed || Date.now() >= stopAt) return;
      if (num) num.textContent = String(1 + Math.floor(Math.random() * d));
      gap = Math.min(150, gap * 1.13);
      timer = setTimeout(flick, gap);
    };
    return wait(delay || 0).then(() => {
      die.style.opacity = '1';
      stopAt = Date.now() + ms * 0.86;
      flick();
      if (quiet) {
        anim(die, [{ opacity: 0.2 }, { opacity: 1 }], { duration: ms * 0.4, fill: 'both' });
      } else {
        const dir = Math.random() < 0.5 ? -1 : 1;
        anim(die, [
          { transform: `translate(${-170 * dir}%, -55%) rotate(${-300 * dir}deg) scale(.6)`, opacity: 0, offset: 0 },
          { transform: `translate(${-95 * dir}%, 10%) rotate(${-140 * dir}deg) scale(1.08, .9)`, opacity: 1, offset: 0.28 },
          { transform: `translate(${-48 * dir}%, -24%) rotate(${10 * dir}deg) scale(1)`, offset: 0.47 },
          { transform: `translate(${-14 * dir}%, 5%) rotate(${150 * dir}deg) scale(1.05, .94)`, offset: 0.66 },
          { transform: `translate(${-3 * dir}%, -7%) rotate(${250 * dir}deg) scale(1)`, offset: 0.82 },
          { transform: `translate(0, 0) rotate(${360 * dir}deg) scale(1)`, offset: 1 },
        ], { duration: ms, easing: 'cubic-bezier(.25,.6,.35,1)', fill: 'both' });
        anim(svg, [
          { transform: 'perspective(400px) rotate3d(1, .6, .2, 900deg)' },
          { transform: 'perspective(400px) rotate3d(1, .6, .2, 0deg)' },
        ], { duration: ms, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
      }
      return wait(ms);
    }).then(() => {
      landed = true;
      clearTimeout(timer);
      if (num) num.textContent = String(value);
    });
  }

  // The settle: a quick swell, a ring of light, and a soft click.
  function pop(slot, glow) {
    const die = slot.querySelector('.dz-die');
    const burst = slot.querySelector('.dz-burst');
    slot.classList.add('dz-settled');
    if (glow) slot.classList.add('dz-glow-' + glow);
    sound('click');
    if (calm()) return;
    anim(die, [{ transform: 'scale(1)' }, { transform: 'scale(1.3)', offset: 0.35 }, { transform: 'scale(1)' }],
      { duration: 300, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    anim(burst, [{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(1.9)', opacity: 0 }],
      { duration: 560, easing: 'ease-out', fill: 'both' });
  }

  function sparkles(slot, n) {
    if (calm()) return;
    for (let i = 0; i < n; i++) {
      const s = el('span', 'dz-spark');
      slot.appendChild(s);
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const r = 70 + Math.random() * 60;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      const p = anim(s, [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(.2)`, opacity: 0 },
      ], { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'both' });
      if (!p) s.remove();
      setTimeout(() => s.remove(), 1100);
    }
  }

  function stampIn(node, ms, tilt, from) {
    node.style.opacity = '1';
    if (calm()) return;
    const t = tilt == null ? -6 : tilt;
    anim(node, [
      { transform: `scale(${from || 2.6}) rotate(${t - 10}deg)`, opacity: 0 },
      { transform: `scale(.9) rotate(${t}deg)`, opacity: 1, offset: 0.7 },
      { transform: `scale(1) rotate(${t}deg)`, opacity: 1 },
    ], { duration: ms, easing: 'cubic-bezier(.2,1.3,.4,1)', fill: 'both' });
  }

  function shake(node) {
    if (calm()) return;
    anim(node, [
      { transform: 'translate(0,0)' }, { transform: 'translate(-7px, 3px)' }, { transform: 'translate(6px, -4px)' },
      { transform: 'translate(-4px, -2px)' }, { transform: 'translate(3px, 3px)' }, { transform: 'translate(0,0)' },
    ], { duration: 380, easing: 'ease-out' });
  }

  // Golden rays spinning up behind a natural 20 (the spin is CSS, on the inner layer).
  function rays(slot) {
    if (calm()) return;
    const r = el('div', 'dz-rays', '<i></i>');
    slot.insertBefore(r, slot.firstChild);
    anim(r, [
      { opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)', offset: 0.22 },
      { opacity: 1, transform: 'scale(1)', offset: 0.7 }, { opacity: 0, transform: 'scale(1.12)' },
    ], { duration: 2100, easing: 'ease-out', fill: 'both' });
    setTimeout(() => r.remove(), 2150);
  }

  // The tray's rim flares gold for a critical hit.
  function flare(container) {
    if (calm() || !container.classList) return;
    container.classList.remove('dz-crit-flash');
    void container.offsetWidth;
    container.classList.add('dz-crit-flash');
    setTimeout(() => container.classList.remove('dz-crit-flash'), 1300);
  }

  // A natural 1: the die wobbles like a dizzy top before it settles (funny, never sad).
  function wobble(die) {
    if (calm() || !die) return;
    anim(die, [
      { transform: 'rotate(0deg)' }, { transform: 'rotate(-18deg) translateX(-5%)' }, { transform: 'rotate(14deg) translateX(4%)' },
      { transform: 'rotate(-9deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(0deg)' },
    ], { duration: 900, delay: 320, easing: 'ease-in-out' });
  }

  // Counts a number up (the attack's total), then gives it a little pop.
  function countTo(node, from, to, delay, dur) {
    node.textContent = String(from);
    setTimeout(() => {
      const t0 = Date.now();
      const tick = () => {
        const k = Math.min(1, (Date.now() - t0) / Math.max(1, dur));
        node.textContent = String(Math.round(from + (to - from) * k));
        if (k < 1) setTimeout(tick, 28);
        else node.classList.add('is-final');
      };
      tick();
    }, delay);
  }

  function slotFor(d, cls) {
    const slot = el('div', 'dz-slot' + (cls ? ' ' + cls : ''));
    const burst = el('div', 'dz-burst');
    const die = el('div', 'dz-die', dieSvg(d, ''));
    die.style.opacity = '0';
    slot.append(burst, die);
    return slot;
  }

  function rollAttack(container, e, opts) {
    const monster = opts.monster != null ? !!opts.monster : !isHero(e.uid);
    const p = pace(monster);
    const wrap = el('div', 'dz-roll dz-attack ' + (monster ? 'dz-monster' : 'dz-hero'));
    const slot = slotFor(20, 'dz-main');
    const info = el('div', 'dz-info');
    const who = opts.label || (isHero(e.uid) ? heroName(e.uid) + ' rolls to hit' : 'The monster rolls');
    info.innerHTML = '<div class="dz-who"></div><div class="dz-math"></div><div class="dz-stamp"></div><div class="dz-line"></div>';
    info.querySelector('.dz-who').textContent = who;
    wrap.append(slot, info);
    container.appendChild(wrap);
    sound('dice', opts);
    let total = null;
    return tumble(slot.querySelector('.dz-die'), 20, e.value, 950 * p, 0).then(() => {
      const kind = e.crit ? 'crit' : e.hit ? 'hit' : 'miss';
      pop(slot, kind);
      if (e.crit) {
        // A natural 20: golden rays spin up behind the die and the tray's rim flares.
        sparkles(slot, 14);
        rays(slot);
        flare(container);
      }
      if (e.fumble) wobble(slot.querySelector('.dz-die'));
      const litAmt = e.lit ? (typeof e.lit === 'number' ? e.lit : LIT_BONUS) : 0;
      // rules.js folds the lit bonus into `bonus`; show it separately so kids see why light helps.
      const base = litAmt && e.value + e.bonus === e.total ? e.bonus - litAmt : e.bonus;
      const sign = (n) => (n < 0 ? '−' + Math.abs(n) : '+' + n);
      const math = info.querySelector('.dz-math');
      math.innerHTML = '<span class="dz-op dz-step">' + sign(base || 0) + '</span>' +
        (litAmt ? '<span class="dz-lit dz-step">(+' + litAmt + ' lit)</span>' : '') +
        '<span class="dz-sum dz-step"><span class="dz-op">=</span><span class="dz-total">' + e.total + '</span></span>' +
        // "needs 12" matches How to Play's "match the Defense number or beat it" (ux #12).
        '<span class="dz-vs dz-step">needs ' + e.need + '</span>';
      // The sum reads in steps, and its total counts up from the die's own number.
      const steps = math.querySelectorAll('.dz-step');
      const quiet = calm();
      const gap = quiet ? 0 : 90 * p;
      steps.forEach((s, k) => anim(s, [{ opacity: 0, transform: 'translateY(8px) scale(.85)' }, { opacity: 1, transform: 'none' }],
        { duration: 220 * p, delay: k * gap, easing: 'cubic-bezier(.2,1.3,.4,1)', fill: 'both' }));
      total = math.querySelector('.dz-total');
      if (!quiet && e.total !== e.value) countTo(total, e.value, e.total, (steps.length - 2) * gap, 200 * p);
      else total.classList.add('is-final');
      return wait(quiet ? 260 * p : 120 * p + steps.length * gap).then(() => kind);
    }).then((kind) => {
      if (total) total.textContent = String(e.total); // late timers never leave a half-counted sum
      const stamp = info.querySelector('.dz-stamp');
      stamp.className = 'dz-stamp dz-' + kind;
      stamp.textContent = kind === 'crit' ? 'CRITICAL!' : kind === 'hit' ? 'HIT!' : 'MISS';
      stampIn(stamp, 340 * Math.max(p, 0.7));
      const line = info.querySelector('.dz-line');
      if (e.fumble && e.line) line.textContent = e.line;
      else if (e.crit) line.textContent = 'Double damage dice!';
      else if (!e.hit) line.textContent = 'So close! Next time.';
      if (kind === 'crit') { sound('crit', opts); shake(container); }
      if (kind === 'miss') sound('miss', opts);
      container.__dzHit = e.hit ? Date.now() : 0;
      return wait(760 * p);
    }).then(() => e);
  }

  function rollDamage(container, e, opts) {
    const heal = !!(opts.heal || e.t === 'heal');
    const monster = opts.monster != null ? !!opts.monster : (e.by ? !isHero(e.by) : false);
    const p = pace(monster);
    const rolls = e.rolls && e.rolls.length ? e.rolls.slice(0, 8) : [e.amount || 0];
    const d = opts.d || e.d || (e.dice && e.dice.d) || guessDie(rolls);
    const amount = e.amount != null ? e.amount : sum(rolls);
    const plus = opts.plus != null ? opts.plus : e.plus != null ? e.plus : amount - sum(rolls);
    const wrap = el('div', 'dz-roll dz-dmg ' + (heal ? 'dz-heal' : 'dz-damage') + (monster ? ' dz-monster' : ''));
    const row = el('div', 'dz-row' + (rolls.length > 3 ? ' dz-many' : ''));
    const slots = rolls.map(() => slotFor(d, 'dz-small'));
    slots.forEach((s) => row.appendChild(s));
    const info = el('div', 'dz-info');
    info.innerHTML = '<div class="dz-who"></div><div class="dz-math"></div><div class="dz-big"></div>';
    info.querySelector('.dz-who').textContent = opts.label || (heal ? 'Healing roll' : e.crit ? 'Critical damage!' : 'Damage roll');
    wrap.append(row, info);
    container.appendChild(wrap);
    if (!opts.append) sound('dice', opts);
    const spins = slots.map((s, i) => tumble(s.querySelector('.dz-die'), d, rolls[i], 760 * p, i * 90 * p));
    return Promise.all(spins).then(() => {
      slots.forEach((s) => pop(s, heal ? 'heal' : 'dmg'));
      const parts = rolls.map(String);
      if (plus) parts.push(String(plus));
      const math = info.querySelector('.dz-math');
      math.innerHTML = parts.map((x) => '<span class="dz-op">' + x + '</span>').join('<span class="dz-plus">+</span>') +
        '<span class="dz-op">=</span>';
      const big = info.querySelector('.dz-big');
      big.textContent = heal ? '+' + amount + ' hearts' : amount + ' damage';
      // A smaller swell than the HIT stamp, so the number never balloons back over the dice.
      stampIn(big, 300 * Math.max(p, 0.7), 0, 1.7);
      // opts.linger: dice that rolled alongside a spell let go sooner (the tray stays up anyway).
      return wait(opts.linger != null ? opts.linger : 700 * p);
    }).then(() => e);
  }

  function clear(container) {
    if (!container) return;
    container.innerHTML = '';
    container.__dzHit = 0;
  }

  function hide(container) {
    if (!container) return;
    container.classList.remove('dz-show');
    setTimeout(() => { if (!container.classList.contains('dz-show')) clear(container); }, 400);
  }

  function roll(container, e, opts) {
    opts = opts || {};
    if (!container || !e) return Promise.resolve(e);
    clearTimeout(fadeTimer);
    const isAttack = e.t === 'roll' || e.d === 20 || e.need != null;
    // Damage right after a hit joins the same tray, so the whole attack reads left to right.
    const follow = !isAttack && container.__dzHit && Date.now() - container.__dzHit < 6000;
    if (!opts.append && !follow) clear(container);
    if (follow) opts = Object.assign({ append: true }, opts);
    container.classList.add('dz-show');
    const run = isAttack ? rollAttack(container, e, opts) : rollDamage(container, e, opts);
    return run.catch(() => e).then((res) => {
      if (!opts.keep && !LB_DICE.keep) {
        fadeTimer = setTimeout(() => hide(container), 1700 * pace(false));
      }
      return res;
    });
  }

  const LB_DICE = {
    speed: 1,
    calm: false,
    keep: false,
    roll,
    clear,
    hide,
    svg: dieSvg,
    setSpeed(n) { LB_DICE.speed = n >= 2 || n === 'fast' ? 2 : 1; },
    setCalm(on) { LB_DICE.calm = !!on; },
  };
  root.LB_DICE = LB_DICE;
})(typeof self !== 'undefined' ? self : this);
