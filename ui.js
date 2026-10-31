// Lanternbearers UI: every screen, the HUD, the dice tray and read-aloud. DOM only; no game rules here.
//   const ui = LB_UI.create(rootEl, handlers)
//   handlers: onNewGame, onContinue, onStart(names), onSelectHero(id), onAction(kind), onItem(item),
//             onEndHeroTurn(), onEndPartyTurn(), onLeave(arch), onRetry(), onSettings(settings)
// House rules: everything visible, one tap at a time, kind words, no timers.
(function (root) {
  'use strict';
  const NAMES_KEY = 'lanternbearers:v1:names';
  const SETTINGS_KEY = 'lanternbearers:v1:settings';
  const HERO_ORDER = ['knight', 'ranger', 'wizard', 'lightbringer'];
  const ACTION_ORDER = ['ability', 'attack', 'mend', 'light', 'open', 'help', 'wait'];

  // ---------- Icons: small hand-drawn SVG paths on a 24px grid ----------
  const ICONS = {
    heart: { fill: true, d: 'M12 20.5S3 15.2 3 9.3C3 6.4 5.3 4.3 7.9 4.3c1.8 0 3.2 1 4.1 2.4.9-1.4 2.3-2.4 4.1-2.4 2.6 0 4.9 2.1 4.9 5 0 5.9-9 11.2-9 11.2z' },
    shield: { d: 'M12 3l7.5 3v5.2c0 4.9-3.3 8.3-7.5 9.8-4.2-1.5-7.5-4.9-7.5-9.8V6z M12 7.5v9' },
    boot: { d: 'M8 3h5v8.5l5.2 2.4c1.3.6 1.8 1.6 1.8 2.8V19H5V16l3-2.5z M5 16h15' },
    sword: { d: 'M19.5 4.5L10 14 M19.5 4.5h-3.3 M19.5 4.5v3.3 M7 11l6 6 M9.8 15.2L5 20 M3.8 21.2l1.2-1.2' },
    arrow: { d: 'M4 20L19.5 4.5 M19.5 4.5h-5.5 M19.5 4.5V10 M4 20h3.5 M4 20v-3.5' },
    burst: { d: 'M12 2.5v4 M12 17.5v4 M2.5 12h4 M17.5 12h4 M5.3 5.3l2.8 2.8 M15.9 15.9l2.8 2.8 M5.3 18.7l2.8-2.8 M15.9 8.1l2.8-2.8 M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z' },
    sparkle: { fill: true, d: 'M12 2l2.2 6.4L20.5 10.6l-6.3 2.2L12 19.2l-2.2-6.4L3.5 10.6l6.3-2.2z M19 15l.9 2.4 2.4.9-2.4.9L19 21.6l-.9-2.4-2.4-.9 2.4-.9z' },
    mend: { d: 'M12 20.5S3 15.2 3 9.3C3 6.4 5.3 4.3 7.9 4.3c1.8 0 3.2 1 4.1 2.4.9-1.4 2.3-2.4 4.1-2.4 2.6 0 4.9 2.1 4.9 5 0 5.9-9 11.2-9 11.2z M12 9v6 M9 12h6' },
    flame: { fill: true, d: 'M12 2.5c.8 3.3 5.5 5.6 5.5 11a5.5 5.5 0 0 1-11 0c0-3 1.6-4.6 2.5-6.6.9 1.4 1.6 2.6 1.6 4.3 1.5-1.4 1.8-4.6 1.4-8.7z' },
    chest: { d: 'M3 11h18v9H3z M3 11c0-3.3 2.2-6 5.5-6h7c3.3 0 5.5 2.7 5.5 6 M11 11v4h2v-4 M3 15h8 M13 15h8' },
    hand: { d: 'M7.5 12V6.2a1.4 1.4 0 0 1 2.8 0V11 M10.3 10.5V4.6a1.4 1.4 0 0 1 2.8 0v5.9 M13.1 10.5V5.6a1.4 1.4 0 0 1 2.8 0v6.4 M15.9 10.4a1.4 1.4 0 0 1 2.8 0v4.2c0 3.6-2.8 6.4-6.4 6.4-2.7 0-4.2-1.3-5.6-3.6l-2.4-4a1.4 1.4 0 0 1 2.4-1.4L7.5 14' },
    moon: { d: 'M20 14.5A8.2 8.2 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5z' },
    check: { d: 'M4 12.5l5 5L20 6.5' },
    endturn: { d: 'M4 5v14 M8 12h11.5 M14.5 7l5 5-5 5' },
    speaker: { d: 'M4 9.5h3.8L13 5.5v13l-5.2-4H4z M16.2 9.2a4 4 0 0 1 0 5.6 M18.8 6.6a7.6 7.6 0 0 1 0 10.8' },
    mute: { d: 'M4 9.5h3.8L13 5.5v13l-5.2-4H4z M16.5 9.5l5 5 M21.5 9.5l-5 5' },
    gear: { d: 'M10.3 2.8h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
    book: { d: 'M3.5 5.5c3-1.6 5.8-1.6 8.5 0v14c-2.7-1.6-5.5-1.6-8.5 0z M12 5.5c2.7-1.6 5.5-1.6 8.5 0v14c-3-1.6-5.8-1.6-8.5 0' },
    play: { fill: true, d: 'M8 4.8v14.4L19.5 12z' },
    star: { fill: true, d: 'M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z' },
    door: { d: 'M6 21V9a6 6 0 0 1 12 0v12 M3.5 21h17 M14 14.5h.5' },
    dice: { d: 'M6 3.5h12A2.5 2.5 0 0 1 20.5 6v12a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5z M8.5 8.5h.01 M15.5 8.5h.01 M12 12h.01 M8.5 15.5h.01 M15.5 15.5h.01' },
    wave: { d: 'M3 12c2.2-4.5 4.4-4.5 6.6 0s4.4 4.5 6.6 0 3.6-3.4 4.8-1.5' },
    sleepy: { d: 'M4 6h6l-6 7h6 M13.5 11.5h6.5l-6.5 7.5h6.5' },
    lantern: { d: 'M9 4.5h6 M12 2v2.5 M7.5 7h9l-1.2 11H8.7z M6.5 21h11 M12 10.5c1 1.2 1.5 2.1 1.5 3a1.5 1.5 0 0 1-3 0c0-.9.5-1.8 1.5-3z' },
    wisp: { d: 'M6 20.5V11a6 6 0 0 1 12 0v9.5l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z M9.5 11h.01 M14.5 11h.01' },
    feather: { d: 'M20 4C12.5 4.5 6.5 10 6.2 17.8L4 20 M6.2 17.8C13 17.5 18.5 12 20 4 M9.5 14.5h5' },
    close: { d: 'M6 6l12 12 M18 6L6 18' },
    music: { d: 'M9 18V5.5l11-2V16 M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z M20 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z' },
    bag: { d: 'M5 8.5h14l-1.2 11.5H6.2z M9 8.5V7a3 3 0 0 1 6 0v1.5' },
    left: { d: 'M15 5l-7 7 7 7' },
    right: { d: 'M9 5l7 7-7 7' },
    up: { d: 'M5 15l7-7 7 7' },
    back: { d: 'M10 6l-6 6 6 6 M4 12h16' },
    potion: { d: 'M10 3h4 M10.5 3v5L6 15.5A4.5 4.5 0 0 0 10 21h4a4.5 4.5 0 0 0 4-5.5L13.5 8V3 M7.5 14h9' },
    users: { d: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5 M16 4.5a3.5 3.5 0 0 1 0 6.5 M18 14.8c1.9.7 3.1 2.4 3.5 5.2' },
  };

  function icon(name, extra) {
    const ic = ICONS[name] || ICONS.star;
    const cls = 'lb-ico' + (ic.fill ? ' fill' : '') + (extra ? ' ' + extra : '');
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ic.d}"/></svg>`;
  }

  function coinSvg() {
    return '<svg class="lb-coin" viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9.5" fill="#f4c25a" stroke="#8a5410" stroke-width="1.6"/>' +
      '<circle cx="12" cy="12" r="6.3" fill="none" stroke="#b9771f" stroke-width="1.4"/>' +
      '<path d="M9.2 8.3l2.8-1 2.8 1" stroke="#fff3c4" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
  }

  // ---------- Small helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function h(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(root.localStorage.getItem(key) || 'null');
      root.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* private window or blocked storage: the game still works */ }
    return null;
  }

  function data() { return root.LB_DATA || {}; }
  function art() { return root.LB_ART || {}; }
  function text(key, fallback) {
    const t = data().text || {};
    return t[key] != null ? t[key] : fallback;
  }
  function pick(list, fallback) {
    if (Array.isArray(list) && list.length) return list[Math.floor(Math.random() * list.length)];
    return typeof list === 'string' ? list : fallback;
  }

  function heroList(heroes) {
    const src = heroes || data().heroes || {};
    const arr = Array.isArray(src) ? src.slice() : Object.keys(src).map((k) => Object.assign({ id: k }, src[k]));
    arr.sort((a, b) => {
      const ia = HERO_ORDER.indexOf(a.id);
      const ib = HERO_ORDER.indexOf(b.id);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return arr;
  }

  function heroDef(id) { return (data().heroes || {})[id] || { id, name: id, title: '', color: '#4a7be0' }; }
  function itemDef(id) { return (data().items || {})[id] || { id, name: String(id || '').replace(/-/g, ' '), art: 'loot-' + id }; }
  function roomDef(id) { return (data().rooms || []).find((r) => r.id === id) || { id, name: String(id || '').replace(/-/g, ' ') }; }

  // Art lookup: the manifest lists only pictures that exist, so anything else gets a placeholder.
  function artSrc(id) {
    const a = id && art()[id];
    return a && a.src ? a.src : null;
  }
  function artSrcFor(id) {
    const src = artSrc(id);
    if (!src) return null;
    // ui.js may be loaded from qa/harness too; LB_UI.artBase points back at game/.
    return (LB_UI.artBase || '') + src;
  }
  function screenArt(key) {
    const s = data().screens || {};
    return artSrcFor(s[key] || 'screen-' + key);
  }

  // An <img> that swaps itself for a tidy placeholder if the file is missing or broken.
  function imgOrPh(id, alt, phCls, phInner, color) {
    const src = artSrcFor(id);
    const ph = `<span class="lb-ph ${phCls || ''}" style="--ph:${esc(color || '#3a3488')}">${phInner || ''}</span>`;
    if (!src) return ph;
    const enc = encodeURIComponent(ph);
    return `<img src="${esc(src)}" alt="${esc(alt || '')}" draggable="false" onerror="this.outerHTML=decodeURIComponent('${enc}')">`;
  }

  function lootImg(id) {
    const it = itemDef(id);
    const glyph = it.kind === 'gold' || id === 'gold' ? coinSvg() : icon(it.kind === 'heal' ? 'potion' : it.kind === 'gear' ? 'shield' : 'sparkle');
    return imgOrPh(it.art || 'loot-' + id, it.name, '', glyph, '#4a3a8a');
  }

  // Where each hero's face sits in their sprite (fractions), so the round portrait finds it.
  const FACE = { 'hero-knight': [0.53, 0.12], 'hero-wizard': [0.52, 0.105], 'hero-ranger': [0.43, 0.1], 'hero-lightbringer': [0.47, 0.1] };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function portrait(heroId, cls) {
    const def = heroDef(heroId);
    const color = def.color || '#4a7be0';
    const wrap = (inner) => `<span class="lb-portrait ${cls || ''}" style="--hero:${esc(color)}">${inner}</span>`;
    const painted = artSrcFor('portrait-' + heroId);
    if (painted) {
      // Zoomed in on the face, so it fills the small round badge.
      return wrap(`<span class="lb-crop" style="background-image:url('${esc(painted)}');background-size:165%;background-position:50% 15%"></span>`);
    }
    const id = def.art || 'hero-' + heroId;
    const a = art()[id];
    const src = artSrcFor(id);
    if (!src || !a) return wrap(`<span class="lb-initial">${esc((def.name || heroId || '?').charAt(0))}</span>`);
    const ratio = a.w && a.h ? a.w / a.h : 0.6;
    const zoom = 4.3; // the sprite drawn 4.3 portraits tall shows head and shoulders
    const f = FACE[id] || [0.5, 0.11];
    const iw = zoom * ratio;
    const px = iw > 1 ? clamp01((iw * f[0] - 0.5) / (iw - 1)) : 0.5;
    const py = clamp01((zoom * f[1] - 0.44) / (zoom - 1));
    return wrap(`<span class="lb-initial">${esc((def.name || '?').charAt(0))}</span>` +
      `<span class="lb-crop" style="background-image:url('${esc(src)}');background-size:auto ${zoom * 100}%;` +
      `background-position:${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%"></span>`);
  }

  // ---------- The painted dungeon map (screen-map, 1920 x 1080) ----------
  // Each room's centre and half-size on the painting, as fractions (measured on the art: gate hall
  // far left, grotto above and armory below it, crypt in the middle, then library and chamber).
  const MAP_ROOMS = {
    'gate-hall': { x: 0.104, y: 0.486, rx: 0.085, ry: 0.2 },
    'mushroom-grotto': { x: 0.33, y: 0.28, rx: 0.13, ry: 0.135 },
    'old-armory': { x: 0.308, y: 0.7, rx: 0.125, ry: 0.145 },
    'sleeping-crypt': { x: 0.495, y: 0.49, rx: 0.08, ry: 0.15 },
    'lantern-library': { x: 0.668, y: 0.5, rx: 0.07, ry: 0.14 },
    'lantern-chamber': { x: 0.862, y: 0.465, rx: 0.12, ry: 0.3 },
  };
  // The part of the painting the maps show: every room, without most of the frame.
  const MAP_CROP = { x: 0.0125, y: 0.125, w: 0.975, h: 0.74 };
  const MAP_AR = (MAP_CROP.w * 1920) / (MAP_CROP.h * 1080);
  const DOOR_ICON = { left: 'left', center: 'up', right: 'right' };

  // The parchment map with markers: visited rooms glow, the current room pulses, rooms not seen
  // yet hide under parchment fog, and doorway destinations (dest: { roomId: arch }) shine cyan
  // with the same arrow as their door button. Returns '' when the painting is missing.
  function parchmentMap(opts) {
    const src = artSrcFor('screen-map');
    if (!src) return '';
    const c = MAP_CROP;
    const seen = new Set(opts.visited || []);
    const dest = opts.dest || {};
    const pct = (v) => `${(v * 100).toFixed(2)}%`;
    let marks = '';
    (data().rooms || []).forEach((room) => {
      const r = MAP_ROOMS[room.id];
      if (!r) return;
      const at = `left:${pct((r.x - c.x) / c.w)};top:${pct((r.y - c.y) / c.h)}`;
      const here = room.id === opts.here;
      const arch = dest[room.id];
      if (!seen.has(room.id) && !here && !arch) {
        marks += `<i class="pm-fog" style="${at};width:${pct((r.rx * 2) / c.w)};height:${pct((r.ry * 2) / c.h)}"></i>`;
      }
      // data-door, not data-arch: the test tools pick door buttons by [data-arch]. Each doorway's
      // marker carries its room's name (on the side with more room), and can be tapped (ux #9).
      const side = (r.x - c.x) / c.w > 0.55 ? ' is-left' : '';
      if (arch) {
        marks += `<b class="pm-dest${side}" data-door="${esc(arch)}" style="${at}" title="${esc(room.name || '')}">` +
          `${icon(DOOR_ICON[arch] || 'door')}<span class="pm-name">${esc(room.name || '')}</span></b>`;
      }
      else if (here) marks += `<i class="pm-here" style="${at}"></i>`;
      else if (seen.has(room.id)) marks += `<i class="pm-seen" style="${at}"></i>`;
    });
    const bg = `background-image:url('${esc(src)}');background-size:${pct(1 / c.w)} ${pct(1 / c.h)};` +
      `background-position:${pct(c.x / (1 - c.w))} ${pct(c.y / (1 - c.h))}`;
    return `<div class="lb-pmap ${opts.cls || ''}" style="--pm-ar:${MAP_AR.toFixed(4)}"><div class="lb-pmap-art" style="${bg}"></div>${marks}</div>`;
  }

  // ---------- Read-aloud ----------
  let voice = null;
  function chooseVoice() {
    const synth = root.speechSynthesis;
    if (!synth) return null;
    const en = (synth.getVoices() || []).filter((v) => /^en([-_]|$)/i.test(v.lang || ''));
    const prefs = [/natural/i, /aria|jenny|sonia|libby|ava|emma|michelle/i, /google uk english female/i, /google us english/i, /samantha|serena|karen|moira/i, /zira|hazel/i];
    for (const re of prefs) {
      const v = en.find((x) => re.test(x.name));
      if (v) return v;
    }
    // Otherwise a voice on the device itself (Android lists online ones that may never answer).
    return en.find((v) => v.localService && /^en[-_]US/i.test(v.lang)) || en.find((v) => v.localService) || en[0] || null;
  }
  if (root.speechSynthesis) {
    try { root.speechSynthesis.onvoiceschanged = () => { voice = chooseVoice(); }; } catch (e) { /* ignore */ }
  }

  let utter = null; // the line being read, kept referenced: Chrome can drop one it no longer sees
  // onTrouble(why) hears about a device voice that won't start, so Settings can say so.
  function speak(words, onEnd, onTrouble) {
    const synth = root.speechSynthesis;
    if (!synth) { if (onTrouble) onTrouble('none'); }
    if (!synth || !words) { if (onEnd) onEnd(); return false; }
    const duck = (on) => { try { if (root.LB_AUDIO && root.LB_AUDIO.duck) root.LB_AUDIO.duck(on); } catch (e) { /* ignore */ } };
    try {
      // Chrome on Android drops a line spoken straight after cancel(), so only cancel a line
      // that is really playing, and give it a moment to stop.
      const busy = synth.speaking || synth.pending;
      if (busy) synth.cancel();
      const u = new root.SpeechSynthesisUtterance(String(words));
      voice = voice || chooseVoice();
      if (voice) u.voice = voice;
      u.lang = voice ? voice.lang : 'en-US';
      u.rate = 0.9;
      u.pitch = 1.02;
      let started = false;
      let ended = false;
      const finish = () => { if (ended) return; ended = true; duck(false); if (onEnd) onEnd(); };
      u.onstart = () => { started = true; duck(true); };
      u.onend = finish;
      u.onerror = (e) => {
        finish();
        const why = (e && e.error) || 'error';
        if (onTrouble && why !== 'interrupted' && why !== 'canceled') onTrouble(why);
      };
      utter = u;
      const go = () => {
        try {
          synth.resume(); // it can sit paused after the page was in the background
          synth.speak(u);
        } catch (e) { if (onEnd) onEnd(); }
      };
      if (busy) setTimeout(go, 150); else go();
      // Some in-app browsers (the Claude app's on Android) have a voice that never starts and
      // never says why: after a few seconds, give up quietly and say what to do instead.
      setTimeout(() => {
        if (started || utter !== u) return;
        finish();
        if (onTrouble) onTrouble('silent');
      }, 3500);
      return true;
    } catch (e) {
      if (onEnd) onEnd();
      return false;
    }
  }
  function hush() { try { if (root.speechSynthesis) root.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }

  function speakBtn(label) {
    return `<button type="button" class="lb-speak" data-k="speak">${icon('speaker')}<span>${esc(label || 'Read aloud')}</span></button>`;
  }
  function wireSpeak(scope, words) {
    scope.querySelectorAll('[data-k="speak"]').forEach((b) => {
      b.addEventListener('click', () => {
        b.classList.add('is-speaking');
        speak(typeof words === 'function' ? words() : words, () => b.classList.remove('is-speaking'));
      });
    });
  }

  // ---------- Settings ----------
  function loadSettings() {
    let calmDefault = false;
    try { calmDefault = root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ }
    const muted = root.LB_AUDIO && root.LB_AUDIO.isMuted ? root.LB_AUDIO.isMuted() : false;
    const base = { sound: !muted, music: true, readAloud: false, diceSpeed: 'normal', reducedMotion: calmDefault };
    return Object.assign(base, store(SETTINGS_KEY) || {});
  }
  function applySettings(s) {
    try { if (root.LB_AUDIO) root.LB_AUDIO.setMuted(!s.sound); } catch (e) { /* ignore */ }
    try { if (root.LB_AUDIO && root.LB_AUDIO.setMusic) root.LB_AUDIO.setMusic(!!s.music); } catch (e) { /* ignore */ }
    try { if (root.LB_DICE) root.LB_DICE.setSpeed(s.diceSpeed === 'fast' ? 2 : 1); } catch (e) { /* ignore */ }
    document.documentElement.classList.toggle('lb-calm', !!s.reducedMotion);
    if (!s.sound) hush();
  }

  function btn(k, ic, label, cls) {
    return `<button type="button" class="lb-btn ${cls || ''}" data-k="${k}">${icon(ic)}<span>${esc(label)}</span></button>`;
  }

  // The lantern iris animates a custom property (--iris, its radius), which needs
  // CSS.registerProperty. Without it, rooms change with the plain fade.
  // The victory light's growing disc (--glow) works the same way.
  function registerLength(name) {
    try {
      if (!root.CSS || typeof root.CSS.registerProperty !== 'function') return false;
      root.CSS.registerProperty({ name, syntax: '<length>', inherits: false, initialValue: '0px' });
      return true;
    } catch (e) {
      return !!(e && e.name === 'InvalidModificationError'); // already registered: it still animates
    }
  }
  const IRIS = registerLength('--iris') && registerLength('--glow');

  function motes(n) {
    let out = '';
    for (let i = 0; i < n; i++) {
      const size = 3 + Math.random() * 6;
      out += `<i class="lb-mote" style="left:${(Math.random() * 100).toFixed(1)}%;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;` +
        `animation-duration:${(9 + Math.random() * 12).toFixed(1)}s;animation-delay:${(-Math.random() * 20).toFixed(1)}s"></i>`;
    }
    return `<div class="lb-motes">${out}</div>`;
  }

  // A full-screen scene: fallback painting underneath, the real painting on top when it exists.
  // extra.art: glows, eyes or rays pinned to spots on the painting (only with the painting);
  // extra.over: ambient layers above the shade (fireflies, moonbeams, sparkles).
  function makeScreen(cls, bgUrl, fallbackCls, moteCount, extra) {
    extra = extra || {};
    const s = h('section', 'lb-screen ' + cls);
    s.innerHTML = `<div class="lb-bg is-fallback ${fallbackCls || 'lb-fb-title'}"></div>` +
      (bgUrl ? `<div class="lb-bg" style="background-image:url('${esc(bgUrl)}')"></div>` : '') +
      '<div class="lb-shade"></div>' + (bgUrl && extra.art ? artLayer(extra.art) : '') + (extra.over || '') +
      (moteCount ? motes(moteCount) : '') + '<div class="lb-content"></div>';
    s.content = s.querySelector('.lb-content');
    return s;
  }

  // ---------- Living paintings (polish pass) ----------
  // A layer lined up with a 16:9 painting shown as background-size: cover, so a glow can sit on
  // a lantern in the picture. Spots are [x%, y%] on the painting. style.css gives the layer the
  // same zoom as the painting; it is a sibling, not a child, so the painting's dimming at the
  // start of a scene doesn't dim the glows (the boss's eyes shine first, in the dark).
  function artLayer(inner) {
    return `<div class="lb-art" aria-hidden="true"><div class="lb-art-box">${inner}</div></div>`;
  }
  const at2 = (x, y) => `left:${x}%;top:${y}%`;
  function lamps(list) {
    return list.map(([x, y, size, kind, delay]) =>
      `<i class="lb-lamp${kind ? ' is-' + kind : ''}" style="${at2(x, y)};--s:${size}%;--dl:${(delay || 0).toFixed(2)}s"></i>`).join('');
  }
  // Fireflies wander slow, looping paths and blink. zones: [x0, x1, y0, y1, count] in screen %.
  function fireflies(zones) {
    const r = (a, b) => a + Math.random() * (b - a);
    const px = () => `${r(-70, 70).toFixed(0)}px`;
    let out = '';
    for (const [x0, x1, y0, y1, n] of zones) {
      for (let i = 0; i < n; i++) {
        out += `<i class="lb-firefly" style="${at2(r(x0, x1).toFixed(1), r(y0, y1).toFixed(1))};` +
          `--x1:${px()};--y1:${px()};--x2:${px()};--y2:${px()};--x3:${px()};--y3:${px()};` +
          `--d:${r(11, 20).toFixed(1)}s;--dl:${r(-20, 0).toFixed(1)}s;--b:${r(2.2, 4.4).toFixed(1)}s;--bl:${r(-4, 0).toFixed(1)}s;` +
          `--fs:${r(0.6, 1.15).toFixed(2)}"></i>`;
      }
    }
    return `<div class="lb-fireflies" aria-hidden="true">${out}</div>`;
  }
  // Twinkling stars pinned to the painting (the boss's wings): [x0, x1, y0, y1, count] in art %.
  function twinkles(zones) {
    const r = (a, b) => a + Math.random() * (b - a);
    let out = '';
    for (const [x0, x1, y0, y1, n] of zones) {
      for (let i = 0; i < n; i++) {
        out += `<i class="lb-twinkle" style="${at2(r(x0, x1).toFixed(1), r(y0, y1).toFixed(1))};` +
          `--d:${r(2.4, 4.6).toFixed(1)}s;--dl:${r(0, 4).toFixed(1)}s;--ts:${r(0.7, 1.3).toFixed(2)}"></i>`;
      }
    }
    return out;
  }
  // Gentle bursts of golden sparks high in the victory sky, each on its own slow loop.
  function sparkBursts(spots) {
    let out = '';
    spots.forEach(([x, y, delay, hue]) => {
      let sparks = '';
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.3;
        const d = 60 + Math.random() * 50;
        sparks += `<i style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px"></i>`;
      }
      out += `<span class="lb-burst${hue ? ' is-' + hue : ''}" style="${at2(x, y)};--dl:${delay}s">${sparks}</span>`;
    });
    return `<div class="lb-bursts" aria-hidden="true">${out}</div>`;
  }
  // Counts each victory number up from zero (calm motion shows them at once).
  function countUp(nodes, delay, calm) {
    nodes.forEach((n, i) => {
      const goal = Number(n.dataset.n) || 0;
      if (calm || goal <= 0) {
        n.textContent = String(goal);
        return;
      }
      n.textContent = '0';
      setTimeout(() => {
        const t0 = Date.now();
        const step = () => {
          const k = Math.min(1, (Date.now() - t0) / 700);
          n.textContent = String(Math.round(goal * (1 - Math.pow(1 - k, 3))));
          if (k < 1) setTimeout(step, 30);
          else n.classList.add('is-done');
        };
        step();
      }, delay + i * 110);
    });
  }

  function statChips(def) {
    const dmg = def.damage ? `${def.damage.n > 1 ? def.damage.n : ''}d${def.damage.d}${def.damage.plus ? '+' + def.damage.plus : ''}` : '-';
    const chip = (k, ic, v, label) => `<span class="lb-stat s-${k}" title="${esc(label)}">${icon(ic)}<span>${esc(v)}</span><span class="lb-sr">${esc(label)}</span></span>`;
    return chip('hearts', 'heart', def.hearts, 'Hearts') + chip('move', 'boot', def.move, 'Move') +
      chip('defense', 'shield', def.defense, 'Defense') + chip('attack', 'sword', '+' + (def.attack || 0), 'Attack roll bonus') +
      chip('damage', 'burst', dmg, 'Damage') + chip('range', 'arrow', def.range, 'Range');
  }

  // One kind, true title per hero for the victory screen (ux #10). A "most" title goes only to the
  // hero who really did the most (a tie gives it to nobody); everyone else gets their hero's own.
  const ROLE_TITLES = { knight: 'Brave Shield', ranger: 'Sharp Shooter', wizard: 'Spell Spinner', lightbringer: 'Shining Light' };
  const BEST_TITLES = [['damage', 'Biggest Booms'], ['healing', 'Kindest Healer'], ['helps', 'Best Friend'],
    ['crits', 'Lucky Star'], ['defeated', 'Monster Catcher']];
  function heroTitles(ids, heroStats) {
    const out = {};
    for (const [k, title] of BEST_TITLES) {
      let top = null;
      let best = 0;
      let tie = false;
      for (const id of ids) {
        const v = Number((heroStats[id] || {})[k]) || 0;
        if (v > best) {
          best = v;
          top = id;
          tie = false;
        } else if (v > 0 && v === best) tie = true;
      }
      if (top && !tie && !out[top]) out[top] = title;
    }
    for (const id of ids) if (!out[id]) out[id] = ROLE_TITLES[id] || 'True Lanternbearer';
    return out;
  }

  // ---------- The UI object ----------
  function create(rootEl, handlers) {
    handlers = handlers || {};
    rootEl = rootEl || document.getElementById('ui-root') || document.body;
    rootEl.classList.add('lb-ui-root');
    const call = (name, a, b) => {
      try { if (typeof handlers[name] === 'function') return handlers[name](a, b); } catch (e) { console.error(e); }
      return undefined;
    };

    const settings = loadSettings();
    applySettings(settings);

    const hud = h('div', 'lb-hud');
    hud.hidden = true;
    const tray = h('div', 'lb-tray');
    tray.setAttribute('aria-live', 'polite');
    const layer = h('div', 'lb-layer');
    const fade = h('div', 'lb-fade');
    // The lantern iris between rooms, and the golden light that carries the party to victory.
    const iris = h('div', 'lb-iris');
    const flare = h('div', 'lb-flare');
    rootEl.append(hud, tray, layer, fade, iris, flare);
    // While the dice tray is up it covers the hero bar's controls, so those rest out of reach
    // (style.css .lb-dice-up): a tap can never press a button nobody can see.
    if (root.MutationObserver) {
      new root.MutationObserver(() => rootEl.classList.toggle('lb-dice-up', tray.classList.contains('dz-show')))
        .observe(tray, { attributes: true, attributeFilter: ['class'] });
    }

    let screen = null;
    let over = null;
    let modal = null;
    let titleOpts = { canContinue: false };
    let last = { state: null, ctx: {} };

    // The first tap anywhere unlocks sound; every button gives a soft click.
    rootEl.addEventListener('pointerdown', () => { try { if (root.LB_AUDIO) root.LB_AUDIO.unlock(); } catch (e) { /* ignore */ } }, { passive: true });
    rootEl.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('button') && root.LB_AUDIO) root.LB_AUDIO.play('click');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal) closeModal();
    });

    function leave(node) {
      if (!node || !node.parentNode) return;
      node.classList.add('is-leaving');
      // A screen with a longer exit (the story's dive into the deep) says how long it needs.
      setTimeout(() => node.remove(), Number(node.dataset.leaveMs) || 420);
    }
    function setScreen(node) {
      hush();
      if (node && screen && screen.parentNode && !screen.classList.contains('is-diving')) {
        // The new screen fades in over the old one, which stays put underneath until it is
        // covered: two half-faded screens let the empty board's frame show through.
        const old = screen;
        old.classList.add('is-under');
        setTimeout(() => old.remove(), 560);
      } else {
        leave(screen);
        // A screen still held underneath fades out too, so it can't flash into view (quick taps).
        if (!node) layer.querySelectorAll('.lb-screen.is-under').forEach(leave);
      }
      leave(over);
      over = null;
      rootEl.classList.remove('lb-busy');
      screen = node;
      if (node) layer.appendChild(node);
    }
    // While a banner sits on the board, the HUD rests (one thing to tap at a time).
    function setOver(node) {
      leave(over);
      over = node;
      rootEl.classList.toggle('lb-busy', !!node);
      if (node) layer.appendChild(node);
    }
    function on(scope, k, fn) {
      scope.querySelectorAll(`[data-k="${k}"]`).forEach((b) => b.addEventListener('click', fn));
    }
    function cornerTools(scope) {
      const c = h('div', 'lb-corner');
      c.innerHTML = soundBtnHtml() + `<button type="button" class="lb-icon-btn" data-k="settings" aria-label="Settings" title="Settings">${icon('gear')}</button>`;
      scope.appendChild(c);
      wireTools(c);
    }
    function soundBtnHtml() {
      const onNow = settings.sound;
      return `<button type="button" class="lb-icon-btn ${onNow ? '' : 'is-off'}" data-k="sound" aria-label="${onNow ? 'Sound on' : 'Sound off'}" title="${onNow ? 'Sound on' : 'Sound off'}">${icon(onNow ? 'speaker' : 'mute')}</button>`;
    }
    function wireTools(scope) {
      on(scope, 'sound', () => { setSetting('sound', !settings.sound); });
      on(scope, 'settings', () => ui.showSettings());
    }
    function refreshSoundButtons() {
      rootEl.querySelectorAll('[data-k="sound"]').forEach((b) => {
        b.outerHTML = soundBtnHtml();
      });
      rootEl.querySelectorAll('.lb-corner, .lb-tools').forEach((c) => {
        c.querySelectorAll('[data-k="sound"]').forEach((b) => b.addEventListener('click', () => setSetting('sound', !settings.sound)));
      });
    }
    function setSetting(key, value) {
      settings[key] = value;
      store(SETTINGS_KEY, settings);
      applySettings(settings);
      if (key === 'sound') refreshSoundButtons();
      call('onSettings', Object.assign({}, settings));
    }

    const ui = {
      root: rootEl,
      tray,
      settings: () => Object.assign({}, settings),
      speak: (words) => speak(words),
      hush,
    };

    // ---------- Title ----------
    // The title painting comes alive: the heroes' lanterns and Juniper's crystal glow and flicker,
    // the Gloam breathes in the dwarf gate, moonlight drifts down, fireflies wander in the grass,
    // and the camera slowly pushes in toward the gate (style.css .lb-title).
    const TITLE_LAMPS = [
      [6.5, 19.9, 7, '', 0.3], [22.1, 79.8, 5.5, '', 0], [43.9, 81.3, 5, '', 1.1], [46.5, 81.5, 5, '', 0.6],
      [56.7, 61.1, 6, 'cyan', 0.2], [70.9, 64.4, 5.5, '', 1.6], [78.9, 44, 18, 'violet', 0], [17.9, 14.6, 9, 'moon', 0],
    ];
    ui.showTitle = (opts) => {
      titleOpts = Object.assign({ canContinue: false }, opts || {});
      hud.hidden = true;
      const beams = '<div class="lb-beams" aria-hidden="true"><i style="--x:6%;--w:13vw;--d:12s"></i>' +
        '<i style="--x:19%;--w:8vw;--d:9s;--dl:-4s"></i><i style="--x:30%;--w:16vw;--d:14s;--dl:-7s"></i></div>';
      const s = makeScreen('lb-title', screenArt('title'), 'lb-fb-title', 10, {
        art: lamps(TITLE_LAMPS),
        over: beams + fireflies([[1, 27, 52, 96, 9], [73, 99, 58, 96, 8], [28, 72, 46, 68, 5]]),
      });
      const cont = titleOpts.canContinue;
      s.content.innerHTML = `
        <div class="lb-logo"><span class="lb-logo-word">LANTERNBEARERS</span>
          <span class="lb-logo-sub">Relight the Deep Lanterns of Gloamhold</span></div>
        <div class="lb-menu lb-panel" style="padding:18px">
          ${cont ? btn('continue', 'play', 'Continue', 'lb-btn-gold lb-btn-big') : ''}
          ${btn('new', 'sparkle', 'New Adventure', (cont ? '' : 'lb-btn-gold ') + 'lb-btn-big')}
          ${btn('howto', 'book', 'How to Play', 'lb-btn-big')}
        </div>`;
      cornerTools(s);
      on(s, 'continue', () => call('onContinue'));
      on(s, 'new', () => call('onNewGame'));
      on(s, 'howto', () => ui.showHowTo());
      setScreen(s);
      return s;
    };

    // ---------- Party ----------
    const calmWord = () => `Calm motion: ${settings.reducedMotion ? 'on' : 'off'}`;
    const calmBtn = () => `<button type="button" class="lb-btn lb-btn-ghost lb-calm-btn" data-k="calm" aria-pressed="${!!settings.reducedMotion}">` +
      `${icon('wave')}<span>${calmWord()}</span></button>`;
    ui.showParty = (heroes, savedNames) => {
      hud.hidden = true;
      const names = Object.assign({}, store(NAMES_KEY) || {}, savedNames || {});
      const list = heroList(heroes);
      const s = makeScreen('lb-party', screenArt('title'), 'lb-fb-title', 0);
      const cards = list.map((def) => {
        const color = def.color || '#4a7be0';
        const ab = def.ability || {};
        return `<article class="lb-card lb-panel" style="--hero:${esc(color)};--hero-light:color-mix(in srgb, ${esc(color)} 55%, #ffffff)">
          <div class="lb-card-art">${imgOrPh(def.art || 'hero-' + def.id, def.name, 'lb-ph-hero', esc((def.name || '?').charAt(0)), color)}</div>
          <div class="lb-card-name"><b>${esc(def.name)}</b><span>${esc(def.title || '')}</span></div>
          <p class="lb-card-blurb">${esc(def.blurb || '')}</p>
          <div class="lb-stats">${statChips(def)}</div>
          ${ab.name ? `<div class="lb-card-ability"><b>${esc(ab.name)}:</b> <span class="lb-ab-long">${esc(ab.text || '')}</span><span class="lb-ab-short">${esc(ab.short || ab.text || '')}</span></div>` : ''}
          <div class="lb-name-field"><label for="lb-name-${esc(def.id)}">Who's playing? (optional)</label>
            <input id="lb-name-${esc(def.id)}" data-hero="${esc(def.id)}" maxlength="16" autocomplete="off" spellcheck="false"
              placeholder="Player name" value="${esc(names[def.id] || '')}"></div>
        </article>`;
      }).join('');
      s.content.innerHTML = `
        <div class="lb-party-head"><h1 class="lb-h1">Meet the Lanternbearers</h1>
          <p class="lb-small">Pick who plays each hero if you like. Names are optional: you can start right away.</p></div>
        <div class="lb-cards">${cards}</div>
        <div class="lb-legend">
          <span>${icon('heart')} Hearts</span><span>${icon('boot')} Move</span><span>${icon('shield')} Defense</span>
          <span>${icon('sword')} Attack bonus</span><span>${icon('burst')} Damage dice</span><span>${icon('arrow')} Range</span></div>
        <div class="lb-party-foot">${btn('back', 'back', 'Back', 'lb-btn-ghost')}${calmBtn()}${btn('start', 'play', 'Start the adventure', 'lb-btn-gold lb-btn-big')}</div>`;
      cornerTools(s);
      // Calm motion, right where the family sets up, not only in Settings (ux #11).
      on(s, 'calm', (e) => {
        setSetting('reducedMotion', !settings.reducedMotion);
        const b = e.currentTarget;
        b.setAttribute('aria-pressed', String(!!settings.reducedMotion));
        b.querySelector('span').textContent = calmWord();
      });
      const collect = () => {
        const out = {};
        s.querySelectorAll('input[data-hero]').forEach((i) => {
          const v = i.value.trim();
          if (v) out[i.dataset.hero] = v;
        });
        return out;
      };
      s.querySelectorAll('input[data-hero]').forEach((i) => {
        i.addEventListener('change', () => store(NAMES_KEY, collect()));
        i.addEventListener('keydown', (e) => { if (e.key === 'Enter') i.blur(); });
      });
      on(s, 'back', () => ui.showTitle(titleOpts));
      on(s, 'start', () => {
        const picked = collect();
        store(NAMES_KEY, picked);
        call('onStart', picked);
      });
      setScreen(s);
      return s;
    };

    // ---------- Story ----------
    // One painted panel per read-aloud line (screen-story-1, -2, -3; the title painting stands in
    // for a missing one). Each panel slowly pushes in and cross-fades to the next, with its line
    // as a caption. Next (or a tap on the picture, or the arrow keys) moves on; Skip, and Into the
    // Deep! on the last line, start the adventure.
    ui.showStory = (lines) => new Promise((resolve) => {
      hud.hidden = true;
      lines = (lines && lines.length ? lines : data().story) || [];
      const s = makeScreen('lb-story', null, 'lb-fb-title', 10);
      const title = screenArt('title');
      const stage = h('div', 'lb-story-stage', lines.map((_, i) => {
        const src = artSrcFor('screen-story-' + (i + 1)) || title;
        return `<div class="lb-story-panel k${i % 3}${src ? '' : ' lb-fb-title'}"${src ? ` style="background-image:url('${esc(src)}')"` : ''}></div>`;
      }).join(''));
      stage.setAttribute('aria-hidden', 'true');
      s.insertBefore(stage, s.querySelector('.lb-shade'));
      s.content.innerHTML = `<div class="lb-story-caption">
          <p class="lb-story-line" aria-live="polite"></p>
          <div class="lb-story-bar">
            <span class="lb-story-dots">${lines.map(() => '<i></i>').join('')}</span>
            ${speakBtn('Read it to me')}
            <button type="button" class="lb-btn lb-btn-ghost lb-story-skip" data-k="go">${icon('play')}<span>Skip</span></button>
            ${btn('next', 'right', 'Next', 'lb-btn-gold lb-btn-big lb-story-next')}
          </div>
        </div>`;
      cornerTools(s);
      const panels = stage.querySelectorAll('.lb-story-panel');
      const dots = s.querySelectorAll('.lb-story-dots i');
      const lineEl = s.querySelector('.lb-story-line');
      const goBtn = s.querySelector('[data-k="go"]');
      const nextBtn = s.querySelector('[data-k="next"]');
      let at = -1;
      const show = (i) => {
        if (i < 0 || i >= lines.length || i === at) return;
        at = i;
        panels.forEach((p, k) => {
          // is-shown starts a panel's slow push-in once and keeps it going while it fades out.
          if (k === i) p.classList.add('is-shown');
          p.classList.toggle('is-on', k === i);
        });
        dots.forEach((d, k) => d.classList.toggle('is-on', k <= i));
        lineEl.textContent = lines[i];
        lineEl.classList.remove('is-in');
        void lineEl.offsetWidth; // restart the caption's fade-in
        lineEl.classList.add('is-in');
        const lastLine = i === lines.length - 1;
        nextBtn.hidden = lastLine;
        goBtn.className = lastLine ? 'lb-btn lb-btn-gold lb-btn-big lb-story-go' : 'lb-btn lb-btn-ghost lb-story-skip';
        goBtn.innerHTML = lastLine ? `${icon('lantern')}<span>Into the Deep!</span>` : `${icon('play')}<span>Skip</span>`;
        if (lastLine) goBtn.focus({ preventScroll: true });
        if (settings.readAloud) setTimeout(() => { if (at === i && screen === s) speak(lines[i]); }, 500);
      };
      const onKey = (e) => {
        if (screen !== s) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown') show(at + 1);
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') show(at - 1);
      };
      document.addEventListener('keydown', onKey);
      wireSpeak(s, () => lines[at] || '');
      on(s, 'next', () => show(at + 1));
      s.addEventListener('click', (e) => {
        if (!e.target.closest('button, .lb-story-caption, .lb-corner')) show(at + 1);
      });
      on(s, 'go', () => {
        hush();
        document.removeEventListener('keydown', onKey);
        // Into the Deep!: the picture rushes closer and sinks into darkness while the first room
        // rises out of it (style.css .is-diving). Calm motion keeps the plain fade.
        if (!settings.reducedMotion) {
          s.classList.add('is-diving');
          s.dataset.leaveMs = '1150';
        }
        resolve();
      });
      setScreen(s);
      show(0);
    });

    // ---------- HUD ----------
    let hudBuilt = false;
    let ribbonTimer = 0;
    function buildHud() {
      if (hudBuilt) return;
      hudBuilt = true;
      hud.innerHTML = `
        <aside class="lb-side" aria-label="Party">
          <header class="lb-side-head">
            <div class="lb-roomname"><span class="lb-round"></span><b class="lb-room-title"></b></div>
            <div class="lb-tools">${soundBtnHtml()}<button type="button" class="lb-icon-btn" data-k="settings" aria-label="Settings" title="Settings">${icon('gear')}</button></div>
          </header>
          <div class="lb-heroes"></div>
          <div class="lb-turn"></div>
          <div class="lb-actions"></div>
          <div class="lb-endturn"></div>
          <div class="lb-bag">
            <div class="lb-bag-head"><span class="lb-section-label lb-bag-title">Party bag</span><span class="lb-gold"></span></div>
            <div class="lb-bag-items"></div>
            <div class="lb-bag-tip"></div>
          </div>
        </aside>
        <div class="lb-map" aria-hidden="true"></div>
        <div class="lb-ribbon is-empty" role="status" aria-live="polite"></div>`;
      wireTools(hud.querySelector('.lb-tools'));
      hud.querySelector('.lb-heroes').addEventListener('click', (e) => {
        const b = e.target.closest('[data-hero]');
        if (b) call('onSelectHero', b.dataset.hero);
      });
      hud.querySelector('.lb-side').addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const kind = b.dataset.act;
        if (kind === 'end-hero') call('onEndHeroTurn');
        else if (kind === 'end-party') call('onEndPartyTurn');
        else call('onAction', kind);
      });
      hud.querySelector('.lb-bag-items').addEventListener('click', (e) => {
        const b = e.target.closest('[data-item]');
        if (!b) return;
        if (b.classList.contains('is-usable')) call('onItem', b.dataset.item);
        else {
          const it = itemDef(b.dataset.item);
          ui.message(`${it.name}: ${it.text || 'Saved in the party bag.'}`);
        }
      });
    }

    function heroLabel(hs) {
      const def = heroDef(hs.id);
      return hs.name || def.name || hs.id;
    }

    function heroRow(hs, state, ctx) {
      const def = heroDef(hs.id);
      const hp = Math.max(0, hs.hp != null ? hs.hp : def.hearts || 0);
      const max = Math.max(1, hs.maxHp || def.hearts || hp || 1);
      const done = !hs.down && hs.moved && hs.acted;
      const monstersTurn = state.side === 'monsters';
      // Nobody keeps the gold "your go" border while the monsters move (ux #4).
      const selected = ctx.selected === hs.id && !monstersTurn;
      const cls = ['lb-hero', selected ? 'is-selected' : '', hs.down ? 'is-down' : done ? 'is-done' : monstersTurn ? 'is-waiting' : 'is-ready'].join(' ');
      // Knocked down reads as "Dizzy": a friend can help, nobody is lost (ux #5).
      const label = hs.down ? 'Dizzy' : done ? 'Done' : monstersTurn ? 'Wait' : selected ? 'Go!' : 'Ready';
      const status = Object.keys(hs.status || {}).filter((k) => hs.status[k]);
      if (hs.down) status.unshift('dizzy');
      const statusIcons = status.map((k) => {
        const info = STATUS[k] || { icon: 'sparkle', label: k.replace(/-/g, ' ') };
        return `<span class="lb-status-ico s-${esc(k)}" title="${esc(info.label)}">${icon(info.icon)}</span>`;
      }).join('');
      // Gear keeps working all adventure, so it shows on the card (playtest L2).
      const gear = hs.gear || {};
      const gearIcons = [['defense', 'shield', 'Shield Charm: +1 Defense'], ['damage', 'sword', 'Sharpening Stone: +1 damage'],
        ['move', 'boot', 'Boots of Bounding: +1 Move']].filter(([k]) => gear[k] > 0)
        .map(([k, ic, tip]) => `<span class="lb-gear-ico" title="${esc(tip)}">${icon(ic)}</span>`).join('');
      const who = hs.player ? `${esc(hs.player)}` : esc(def.title || '');
      const moveUsed = hs.moved || (hs.status && hs.status.sleepy);
      return `<button type="button" class="${cls}" data-hero="${esc(hs.id)}" aria-pressed="${selected}"
          aria-label="${esc(heroLabel(hs))}${hs.player ? ' (' + esc(hs.player) + ')' : ''}, ${hp} of ${max} hearts, ${label}">
        <span class="lb-face">${portrait(hs.id)}<span class="lb-status">${statusIcons}</span>${gearIcons ? `<span class="lb-gear">${gearIcons}</span>` : ''}</span>
        <span class="lb-hero-main">
          <span class="lb-hero-top"><span class="lb-hero-name" title="${who}">${esc(heroLabel(hs))}</span>${hs.player ? `<span class="lb-player">${esc(hs.player)}</span>` : ''}<span class="lb-hero-state">${label}</span></span>
          <span class="lb-hearts">${icon('heart')}<span class="lb-hp-text">${hp}/${max}</span>
            <span class="lb-hp-bar ${hp <= max / 3 ? 'is-low' : ''}"><i style="width:${Math.round((hp / max) * 100)}%"></i></span>
            <span class="lb-pips">
              <span class="lb-pip-mini ${moveUsed ? 'is-used' : ''}" title="${moveUsed ? 'Move used' : 'Move ready'}">${icon('boot')}</span>
              <span class="lb-pip-mini ${hs.acted ? 'is-used' : ''}" title="${hs.acted ? 'Action used' : 'Action ready'}">${icon('star')}</span>
            </span></span>
        </span>
      </button>`;
    }

    const STATUS = {
      dizzy: { icon: 'star', label: 'Dizzy: a friend next to this hero can help them up' },
      sleepy: { icon: 'sleepy', label: 'Sleepy: can\'t move this turn, but can still act' },
      shield: { icon: 'shield', label: 'Shield Wall: extra Defense' },
      'bright-oil': { icon: 'lantern', label: 'Bright Oil: lantern shines farther' },
      feather: { icon: 'feather', label: 'Feather Charm: extra Move this turn' },
    };

    const ACTIONS = {
      attack: { icon: 'sword', label: 'Attack' },
      ability: { icon: 'sparkle', label: 'Ability' },
      mend: { icon: 'mend', label: 'Mend' },
      light: { icon: 'flame', label: 'Light' },
      open: { icon: 'chest', label: 'Open' },
      help: { icon: 'hand', label: 'Help up' },
      wait: { icon: 'moon', label: 'Wait' },
    };

    function actionButtons(state, ctx) {
      const playing = (state.status || 'playing') === 'playing';
      if (!playing) return '<div class="lb-actions-empty">Catch your breath!</div>';
      if (state.side === 'monsters') return '<div class="lb-actions-empty">The monsters are moving...</div>';
      const hs = ctx.selected && state.heroes ? state.heroes[ctx.selected] : null;
      // Actions belong to the selected hero; with nobody selected only End party turn shows.
      const acts = hs && ctx.options && ctx.options.actions ? ctx.options.actions : [];
      const seen = {};
      const kinds = [];
      acts.forEach((a) => { if (a && a.kind !== 'item' && !seen[a.kind]) { seen[a.kind] = a; kinds.push(a.kind); } });
      const rank = (k) => (ACTION_ORDER.indexOf(k) < 0 ? 99 : ACTION_ORDER.indexOf(k));
      kinds.sort((x, y) => rank(x) - rank(y));
      let html = kinds.map((k) => {
        const base = ACTIONS[k] || { icon: 'star', label: k };
        let label = base.label;
        let ic = base.icon;
        let sub = '';
        if (k === 'ability') {
          // The ability's name plus what it does, so the coolest button is never a gamble (ux #6).
          const ab = heroDef(ctx.selected).ability || {};
          label = ab.name || 'Ability';
          sub = ab.short || '';
        }
        if (k === 'attack') {
          const def = heroDef(ctx.selected);
          const kind = def.attackKind;
          ic = kind === 'arrow' ? 'arrow' : kind === 'spark' ? 'burst' : kind === 'sunbolt' ? 'sparkle' : 'sword';
          if (def.attackName) label = def.attackName;
        }
        const active = ctx.pending === k ? ' is-active' : '';
        const wide = k === 'ability' ? ' lb-wide' : '';
        const text = sub ? `<span class="lb-act-text"><span>${esc(label)}</span><small class="lb-act-sub">${esc(sub)}</small></span>` : `<span>${esc(label)}</span>`;
        return `<button type="button" class="lb-btn lb-act-${esc(k)}${active}${wide}" data-act="${esc(k)}" title="${esc(label)}${sub ? ': ' + esc(sub) : ''}">${icon(ic)}${text}</button>`;
      }).join('');
      if (hs && !hs.down && !(hs.moved && hs.acted)) {
        // "Rowan is done" can't be mixed up with the party's button (ux #3).
        html += `<button type="button" class="lb-btn lb-btn-ghost lb-wide" data-act="end-hero">${icon('check')}<span>${esc(heroLabel(hs))} is done</span></button>`;
      }
      return html;
    }

    function everyoneDone(state) {
      return !heroIdsOf(state).some((id) => { const o = state.heroes[id]; return o && !o.down && !(o.moved && o.acted); });
    }

    // The party's end-of-turn button has its own slot. It stays a calm ghost button while heroes
    // still have a go, and turns gold once everyone is done (ux #3). In the monsters' turn the
    // slot shows a violet "Monsters' turn" chip instead, on every screen size (ux #4).
    function endTurnHtml(state, ctx) {
      if ((state.status || 'playing') !== 'playing') return '';
      if (state.side === 'monsters') return `<div class="lb-monsters-chip" role="status">${icon('moon')}<span>Monsters' turn</span></div>`;
      const ready = everyoneDone(state);
      const label = ctx.endConfirm ? 'Yes, monsters go!' : ready ? 'All done! Monsters go' : 'Monsters go';
      const cls = ready || ctx.endConfirm ? 'lb-btn-gold' : 'lb-btn-ghost lb-btn-quiet';
      return `<button type="button" class="lb-btn ${cls} lb-wide" data-act="end-party">${icon('endturn')}<span>${label}</span></button>`;
    }

    function turnHint(state, ctx) {
      if ((state.status || 'playing') !== 'playing') return '';
      if (state.side === 'monsters') return '<b>Monsters\' turn.</b> Watch what they do!';
      const hs = ctx.selected && state.heroes ? state.heroes[ctx.selected] : null;
      if (!hs) return 'Tap a hero to start their turn.';
      const nm = `<b>${esc(heroLabel(hs))}</b>${hs.player ? ` (${esc(hs.player)})` : ''}`;
      if (ctx.armed) return `${nm}: tap <b>${esc(ctx.armed)}</b> again to use it, or tap anywhere else to put it away.`;
      if (ctx.pending) return `${nm}: tap a glowing target.`;
      if (hs.down) return `${nm} is dizzy! A friend next to ${esc(heroLabel(hs))} can tap Help up.`;
      if (hs.moved && hs.acted) {
        // When nobody is left to go, point at the party's button instead of "pick another hero".
        return everyoneDone(state) ? '<b>Everyone is done!</b> Tap the gold <b>Monsters go</b> button.' : `${nm} is all done. Pick another hero!`;
      }
      const canMove = !hs.moved && ctx.options && ctx.options.moves && ctx.options.moves.length;
      if (canMove && !hs.acted) return `${nm}: tap a gold square to move, or pick an action.`;
      if (canMove) return `${nm}: tap a gold square to move.`;
      return `${nm}: pick an action.`;
    }

    function bagHtml(state, ctx) {
      const counts = {};
      const order = [];
      (state.bag || []).forEach((id) => {
        if (id === 'gold') return;
        if (!counts[id]) { counts[id] = 0; order.push(id); }
        counts[id] += 1;
      });
      const usable = {};
      ((ctx.options && ctx.options.actions) || []).forEach((a) => { if (a && a.kind === 'item') usable[a.item] = true; });
      const items = order.map((id) => {
        const it = itemDef(id);
        const use = usable[id] ? ' is-usable' : '';
        return `<button type="button" class="lb-item${use}" data-item="${esc(id)}" title="${esc(it.name)}${it.text ? ': ' + esc(it.text) : ''}"
          aria-label="${esc(it.name)}, ${counts[id]}${use ? ', tap to use' : ''}">${lootImg(id)}${counts[id] > 1 ? `<b class="lb-count">${counts[id]}</b>` : ''}</button>`;
      }).join('');
      // An empty bag shows just its name and the gold: less clutter on the back wall (ux #14).
      return {
        items,
        empty: !order.length,
        tip: Object.keys(usable).length ? 'Tap a glowing item to use it.' : '',
      };
    }

    // The dungeon map: the painted parchment map when it exists, else a tiny map of visited rooms
    // where rooms at the same distance from the start share a row.
    function mapHtml(state) {
      const rooms = data().rooms || [];
      if (!rooms.length || !state.roomId) return '';
      const painted = parchmentMap({ here: state.roomId, visited: state.visited });
      if (painted) return painted + `<span class="lb-map-label">${esc(roomDef(state.roomId).name || '')}</span>`;
      const start = data().startRoom || rooms[0].id;
      const depth = { [start]: 0 };
      const order = [start];
      for (let i = 0; i < order.length; i++) {
        (roomDef(order[i]).exits || []).forEach((e) => {
          if (depth[e.to] == null && rooms.some((r) => r.id === e.to)) { depth[e.to] = depth[order[i]] + 1; order.push(e.to); }
        });
      }
      const levels = {};
      order.forEach((id) => { (levels[depth[id]] = levels[depth[id]] || []).push(id); });
      const maxD = Math.max.apply(null, order.map((id) => depth[id]));
      const W = 96;
      const row = 20;
      const H = maxD * row + 24;
      const pos = {};
      order.forEach((id) => {
        const lv = levels[depth[id]];
        const i = lv.indexOf(id);
        pos[id] = { x: W / 2 + (i - (lv.length - 1) / 2) * 34, y: H - 12 - depth[id] * row };
      });
      const seen = new Set((state.visited || []).concat([state.roomId]));
      let lines = '';
      let dots = '';
      seen.forEach((id) => {
        if (!pos[id]) return;
        (roomDef(id).exits || []).forEach((e) => {
          if (seen.has(e.to) && pos[e.to]) lines += `<line class="m-link" x1="${pos[id].x}" y1="${pos[id].y}" x2="${pos[e.to].x}" y2="${pos[e.to].y}"/>`;
        });
      });
      seen.forEach((id) => {
        const p = pos[id];
        if (!p) return;
        const here = id === state.roomId;
        const boss = depth[id] === maxD;
        dots += `<circle class="m-room ${boss ? 'm-boss' : ''} ${here ? 'm-here' : ''}" cx="${p.x}" cy="${p.y}" r="${here ? 7 : 5.5}"/>`;
        if (here) dots += `<circle class="m-here-ring" cx="${p.x}" cy="${p.y}" r="7"/>`;
      });
      return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Map">${lines}${dots}</svg>` +
        `<span class="lb-map-label">${esc(roomDef(state.roomId).name || '')}</span>`;
    }

    function heroIdsOf(state) {
      const ids = Object.keys(state.heroes || {});
      return HERO_ORDER.filter((id) => ids.includes(id)).concat(ids.filter((id) => !HERO_ORDER.includes(id)));
    }

    ui.updateHud = (state, ctx) => {
      if (!state) return;
      ctx = ctx || {};
      last = { state, ctx };
      buildHud();
      hud.hidden = false;
      const room = roomDef(state.roomId);
      const playing = (state.status || 'playing') === 'playing';
      const turnWord = state.side === 'monsters' ? "Monsters' turn" : 'Party turn';
      hud.querySelector('.lb-room-title').textContent = playing ? turnWord : room.name || '';
      hud.querySelector('.lb-side').classList.toggle('is-monsters', state.side === 'monsters');
      // Between fights the header shows the room's name, with room for two lines instead of the
      // round number, so a long name ("The Mushroom Grotto") is never cut off.
      hud.querySelector('.lb-round').textContent = playing && state.round ? `Round ${state.round}` : '';
      hud.querySelector('.lb-roomname').classList.toggle('is-room', !playing);
      hud.querySelector('.lb-heroes').innerHTML = heroIdsOf(state)
        .map((id) => heroRow(Object.assign({ id }, state.heroes[id]), state, ctx)).join('');
      const turn = hud.querySelector('.lb-turn');
      const hint = turnHint(state, ctx);
      // The 4:3 dock has no header, so there the turn hint carries the round number too.
      turn.innerHTML = hint && state.round ? `<span class="lb-turn-round">Round ${Number(state.round)}</span>${hint}` : hint;
      turn.hidden = !hint;
      turn.classList.toggle('is-monsters', state.side === 'monsters');
      hud.querySelector('.lb-actions').innerHTML = actionButtons(state, ctx);
      hud.querySelector('.lb-endturn').innerHTML = endTurnHtml(state, ctx);
      const bag = bagHtml(state, ctx);
      hud.querySelector('.lb-bag-items').innerHTML = bag.items;
      hud.querySelector('.lb-bag').classList.toggle('is-empty', bag.empty);
      hud.querySelector('.lb-bag-tip').textContent = bag.tip;
      hud.querySelector('.lb-gold').innerHTML = `${coinSvg()}<span>${Number(state.gold) || 0}</span>`;
      // Only redraw the map when it changes, so its pulsing marker never restarts mid-beat.
      const mapEl = hud.querySelector('.lb-map');
      const map = mapHtml(state);
      if (mapEl.lbHtml !== map) {
        mapEl.lbHtml = map;
        mapEl.innerHTML = map;
        mapEl.classList.toggle('is-parchment', map.indexOf('lb-pmap') >= 0);
      }
      // A "Tap ..." hint is done once nothing is being aimed (playtest M4, ux #1).
      if (!ctx.pending && hud.querySelector('.lb-ribbon').classList.contains('is-hint')) ui.message('');
    };

    ui.hideHud = () => { hud.hidden = true; };

    ui.message = (words) => {
      buildHud();
      const r = hud.querySelector('.lb-ribbon');
      clearTimeout(ribbonTimer);
      if (!words) {
        // Fade out, then forget the words, so an old line never comes back (playtest L1).
        r.classList.remove('is-old', 'is-new', 'is-hint');
        r.classList.add('is-empty');
        ribbonTimer = setTimeout(() => { if (r.classList.contains('is-empty')) r.textContent = ''; }, 400);
        return;
      }
      r.textContent = String(words);
      r.classList.remove('is-empty', 'is-old', 'is-new', 'is-hint');
      void r.offsetWidth; // restart the entrance animation
      r.classList.add('is-new');
      // Messages never vanish while they matter; they just soften after a while.
      ribbonTimer = setTimeout(() => r.classList.add('is-old'), 7000);
    };
    // An instruction ("Tap a monster with a red ring."). It goes away by itself once nothing is
    // being aimed any more: updateHud() clears it, so the biggest words are never out of date.
    ui.hint = (words) => {
      ui.message(words);
      if (words) hud.querySelector('.lb-ribbon').classList.add('is-hint');
      // With Read aloud on, instructions are read out too, so nobody depends on reading speed (ux #18).
      if (words && settings.readAloud) speak(words);
    };

    // ---------- Dice ----------
    ui.showDice = (e, opts) => {
      if (!root.LB_DICE || !e) return Promise.resolve(e);
      const heroes = data().heroes || {};
      const isAttack = e.t === 'roll' || e.d === 20 || e.need != null;
      const who = isAttack ? e.uid : e.by;
      opts = Object.assign({}, opts);
      if (!isAttack && e.d == null && !opts.d) opts.d = damageDie(e);
      tray.classList.toggle('is-small', !!who && !heroes[who]);
      dockTray();
      const run = root.LB_DICE.roll(tray, e, opts);
      // Three rolls at once (a Fireburst on three monsters) share the tray in a tighter layout.
      tray.classList.toggle('is-crowded', tray.querySelectorAll('.dz-roll').length > 2);
      return run;
    };
    // The tray docks in the hero bar just below the hero cards (on 4:3 screens it covers the bottom
    // dock instead), so it never covers the board, the fight or the party bag (ux #2).
    function dockTray() {
      const cards = hud.hidden ? null : hud.querySelector('.lb-heroes');
      const r = cards ? cards.getBoundingClientRect() : null;
      if (r && r.height) tray.style.setProperty('--tray-top', Math.round(r.bottom + 8) + 'px');
    }
    // Damage events carry the rolls but not the die size, so look it up from whoever rolled.
    // Abilities and items roll other dice; then the tray falls back to the smallest die that fits.
    function damageDie(e) {
      if (e.t === 'heal') return null;
      const rolls = e.rolls || [];
      let spec = (heroDef(e.by) || {}).damage;
      if (!(data().heroes || {})[e.by]) {
        const m = ((last.state && last.state.monsters) || []).find((x) => x.uid === e.by);
        spec = m && ((data().monsters || {})[m.type] || {}).damage;
      }
      if (!spec || !rolls.length) return null;
      const fits = (rolls.length === spec.n || rolls.length === spec.n * 2) && rolls.every((r) => r <= spec.d);
      return fits ? spec.d : null;
    }

    ui.hideDice = () => {
      if (!tray.classList.contains('dz-show')) return;
      tray.__dzHit = 0; // the next damage roll starts a fresh tray instead of joining this one
      if (root.LB_DICE) root.LB_DICE.hide(tray);
    };

    // ---------- Room intro banner ----------
    ui.showRoomIntro = (room) => new Promise((resolve) => {
      room = typeof room === 'string' ? roomDef(room) : room || {};
      setScreen(null);
      ui.fadeIn(); // never a black (or closed) screen behind the banner
      const visited = last.state && last.state.visited ? last.state.visited.length : 0;
      const boss = (room.monsters || []).some((m) => m.type === 'gloamwing');
      const kicker = boss ? 'The final room' : visited ? `Room ${visited} of 5` : 'A new room';
      const o = h('div', 'lb-over lb-intro');
      o.innerHTML = `<div class="lb-over-dim"></div>
        <div class="lb-banner lb-panel">
          <span class="lb-kicker">${esc(kicker)}</span>
          <h1 class="lb-h1">${esc(room.name || '')}</h1>
          <p class="lb-p">${esc(room.intro || '')}</p>
          <div class="lb-row">${room.intro ? speakBtn() : ''}${btn('go', 'play', 'Let\'s go!', 'lb-btn-gold lb-btn-big')}</div>
        </div>`;
      const words = `${room.name || ''}. ${room.intro || ''}`;
      wireSpeak(o, words);
      on(o, 'go', () => {
        hush();
        leave(o);
        if (over === o) { over = null; rootEl.classList.remove('lb-busy'); }
        resolve();
      });
      setOver(o);
      if (settings.readAloud) setTimeout(() => speak(words), 500);
    });

    // ---------- Room cleared ----------
    // Resolves with the chosen arch, and also calls handlers.onLeave(arch): main.js should use one, not both.
    ui.showCleared = (summary, exits) => new Promise((resolve) => {
      summary = summary || {};
      const rawLoot = summary.loot || summary.items || [];
      const loot = rawLoot.map((x) => (typeof x === 'string' ? x : x && x.item)).filter((x) => x && x !== 'gold');
      const gold = Number(summary.gold) || 0;
      const doors = (exits || summary.exits || []).map((e) => (typeof e === 'string' ? { arch: e } : e))
        .map((e) => Object.assign({}, e, { name: e.name || (e.to ? roomDef(e.to).name : '') }));
      const sideWord = { left: 'Left door', center: 'Middle door', right: 'Right door' };
      const sideIcon = { left: 'left', center: 'up', right: 'right' };
      const lootHtml = loot.map((id, i) => `<div class="lb-loot-item" style="animation-delay:${0.25 + i * 0.12}s">${lootImg(id)}<span>${esc(itemDef(id).name)}</span></div>`).join('') +
        (gold ? `<div class="lb-loot-item" style="animation-delay:${0.25 + loot.length * 0.12}s">${lootImg('gold')}<span>${gold} gold</span></div>` : '');
      // The painted map shows where you are and where each doorway leads.
      const dest = {};
      doors.forEach((d) => { if (d.to) dest[d.to] = d.arch; });
      const st = last.state || {};
      const map = doors.length ? parchmentMap({ here: st.roomId, visited: st.visited, dest, cls: 'is-big' }) : '';
      // A slim panel low on the board, so the room blazing with light stays in view above it (ux #9):
      // the loot in one short row, then the map and the doors side by side.
      const o = h('div', 'lb-over lb-cleared');
      o.innerHTML = `<div class="lb-over-dim"></div>
        <div class="lb-cleared-box lb-panel${map ? ' has-map' : ''}">
          <div class="lb-cleared-top">
            <span class="lb-cleared-kicker">Room cleared!</span>
            <div class="lb-loot">${lootHtml || '<span class="lb-loot-none">No treasure this time, but you made it through together!</span>'}</div>
          </div>
          <h2 class="lb-h3">${doors.length ? 'Which way next?' : 'Onward!'}</h2>
          <div class="lb-cleared-way">
            ${map ? `<div class="lb-cleared-map">${map}</div>` : ''}
            <div class="lb-doors">${doors.length ? doors.map((d) => `<button type="button" class="lb-btn lb-door" data-arch="${esc(d.arch)}">
                <span class="lb-door-side">${icon(sideIcon[d.arch] || 'door')}${esc(sideWord[d.arch] || 'Doorway')}</span>
                <span class="lb-door-name">${esc(d.name || 'The next room')}</span></button>`).join('')
              : btn('onward', 'door', 'Keep going', 'lb-btn-gold lb-btn-big')}</div>
          </div>
        </div>`;
      const choose = (arch) => {
        o.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        [0, 260, 520, 780].forEach((t) => setTimeout(() => root.LB_AUDIO && root.LB_AUDIO.play('step'), t));
        // The lantern light closes in around the party as they walk on (a plain fade in calm motion).
        const shut = ui.irisClose(summary.focus);
        setTimeout(() => {
          leave(o);
          if (over === o) { over = null; rootEl.classList.remove('lb-busy'); }
          resolve(arch);
          call('onLeave', arch);
          setTimeout(() => ui.fadeIn(), 1600); // safety: never leave the screen black
        }, shut);
      };
      o.querySelectorAll('[data-arch]').forEach((b) => {
        b.addEventListener('click', () => choose(b.dataset.arch));
        // Pointing at a door lights up where it leads on the map, and a tap on that map marker
        // walks through the same door.
        const mark = o.querySelector(`.pm-dest[data-door="${b.dataset.arch}"]`);
        if (!mark) return;
        const hot = (onNow) => () => mark.classList.toggle('is-hot', onNow);
        ['mouseenter', 'focus'].forEach((ev) => b.addEventListener(ev, hot(true)));
        ['mouseleave', 'blur'].forEach((ev) => b.addEventListener(ev, hot(false)));
        mark.addEventListener('click', () => { if (!b.disabled) choose(b.dataset.arch); });
        mark.addEventListener('mouseenter', () => b.classList.add('is-hot'));
        mark.addEventListener('mouseleave', () => b.classList.remove('is-hot'));
      });
      on(o, 'onward', () => choose(null));
      setOver(o);
      if (root.LB_AUDIO && (loot.length || gold)) root.LB_AUDIO.play('coin');
    });

    // ---------- Camp (everyone knocked down) ----------
    // Resolves when they choose to try again, and also calls handlers.onRetry(): use one, not both.
    ui.showCamp = () => new Promise((resolve) => {
      const bg = screenArt('camp');
      // A quiet night outside the cave: the hanging lanterns flicker and fireflies drift.
      const s = makeScreen('lb-camp', bg, 'lb-fb-camp', 8, {
        art: lamps([[9.6, 23.6, 7, '', 0.3], [21.9, 34.3, 4.5, '', 1.1], [95.1, 35.2, 5.5, '', 0.7], [96.8, 76.9, 5, '', 1.4],
          [48.4, 73.1, 22, 'fire', 0]]),
        over: fireflies([[30, 72, 30, 58, 9], [4, 24, 40, 62, 3], [78, 96, 40, 62, 3]]),
      });
      if (!bg) s.insertBefore(h('div', 'lb-camp-fire'), s.querySelector('.lb-shade'));
      const title = text('campTitle', 'Back to Camp');
      const body = text('campText', 'Everyone rests by the fire. Hearts refilled.');
      s.content.innerHTML = `<div class="lb-camp-box lb-panel">
          <h1 class="lb-h1">${esc(title)}</h1>
          <p class="lb-p">${esc(body)}</p>
          <p class="lb-small">Nobody is in trouble. The room is ready for another try, with fresh monsters.</p>
          <div class="lb-row">${speakBtn()}${btn('retry', 'flame', 'Try the room again', 'lb-btn-gold lb-btn-big')}</div>
        </div>`;
      cornerTools(s);
      wireSpeak(s, `${title}. ${body}`);
      on(s, 'retry', () => {
        hush();
        resolve();
        call('onRetry');
        leave(s);
        if (screen === s) screen = null;
      });
      setScreen(s);
      if (settings.readAloud) setTimeout(() => speak(`${title}. ${body}`), 600);
    });

    // ---------- Boss reveal ----------
    // In the dark, two eyes open first and blink. Then the chamber rises out of the black, a soft
    // violet flash lands the name card, and the moth hovers, breathing, with twinkling wings and
    // its stolen lantern glowing (style.css .lb-boss). Everything is in by about 3 seconds.
    const BOSS_ART = '<i class="lb-boss-eye" style="left:50.1%;top:27.7%"></i><i class="lb-boss-eye" style="left:54.3%;top:29.4%"></i>' +
      lamps([[50.4, 39.6, 8, '', 0.4]]);
    ui.showBossReveal = () => new Promise((resolve) => {
      const bg = screenArt('boss');
      const s = makeScreen('lb-boss', bg, 'lb-fb-boss', 14, {
        art: BOSS_ART + twinkles([[15, 42, 6, 58, 9], [58, 86, 8, 62, 9]]),
        over: '<div class="lb-boss-flash" aria-hidden="true"></div>',
      });
      const dust = s.querySelector('.lb-motes');
      if (dust) dust.classList.add('is-violet');
      if (!bg) {
        const boss = (data().monsters || {}).gloamwing || {};
        const sprite = h('div', 'lb-fb-wrap', imgOrPh(boss.art || 'boss-gloamwing', 'Gloamwing', 'lb-fb-sprite', icon('moon'), '#4a2775'));
        const img = sprite.firstElementChild;
        if (img) img.classList.add('lb-fb-sprite');
        s.insertBefore(sprite, s.querySelector('.lb-shade'));
      }
      s.insertAdjacentHTML('beforeend', '<div class="lb-letterbox top"></div><div class="lb-letterbox bottom"></div>');
      const title = String(text('bossTitle', 'GLOAMWING, THE LANTERN-EATER'));
      const parts = title.split(',');
      const epithet = parts.slice(1).join(',').trim();
      const line = text('bossLine', 'The giant moth spreads its starry wings. It is hungry for light!');
      // The name is the big card; "The Lantern-Eater" sits under it, small and gold, so the
      // moth's face and the stolen lantern stay in view above the words.
      s.content.innerHTML = `
        <div class="lb-boss-title"><span class="lb-boss-name">${esc(parts[0].trim())}</span>` +
          `${epithet ? `<span class="lb-boss-epithet">${esc(epithet)}</span>` : ''}</div>
        <p class="lb-boss-line">${esc(line)}</p>
        <div class="lb-row">${speakBtn()}${btn('fight', 'lantern', 'Face the Lantern-Eater!', 'lb-btn-gold lb-btn-big')}</div>`;
      wireSpeak(s, `${title}. ${line}`);
      on(s, 'fight', () => {
        hush();
        leave(s);
        if (screen === s) screen = null;
        resolve();
      });
      setScreen(s);
      s.classList.add('lb-rumble');
      if (root.LB_AUDIO) root.LB_AUDIO.play('boss');
    });

    // ---------- Victory ----------
    // A beauty shot first: the painting settles, light rays turn behind the Heart Lantern, the
    // heroes' raised lanterns glow and golden sparks burst in the dawn sky. Then the panel rises
    // with the numbers counting up and each hero's title popping in, one after another.
    const VICTORY_ART = '<div class="lb-rays" style="left:50.4%;top:39.8%"></div>' +
      lamps([[50.4, 39.8, 16, '', 0], [27.5, 52, 6, '', 0.5], [43.9, 51.9, 6, '', 1.2], [58.2, 53, 6, 'cyan', 0.8], [83.9, 40.7, 6.5, '', 0.2]]);
    ui.showVictory = (stats) => {
      stats = stats || {};
      hush();
      const bg = screenArt('victory');
      const s = makeScreen('lb-victory', bg, 'lb-fb-victory', 22, {
        art: VICTORY_ART,
        over: sparkBursts([[31, 13, 0.7], [69, 9, 2.3, 'warm'], [22, 27, 3.9, 'warm'], [79, 24, 5.3]]),
      });
      if (!bg) {
        const lantern = h('div', 'lb-fb-wrap', imgOrPh('prop-heart-lantern', 'The Heart Lantern', 'lb-fb-sprite', icon('lantern'), '#b9771f'));
        if (lantern.firstElementChild) lantern.firstElementChild.classList.add('lb-fb-sprite');
        s.insertBefore(lantern, s.querySelector('.lb-shade'));
      }
      const st = (k) => Number(stats[k] != null ? stats[k] : k === 'gold' && last.state ? last.state.gold : 0) || 0;
      const tiles = [
        ['coin', st('gold'), 'gold found', 'gold found'],
        ['wisp', st('defeated'), 'monster defeated', 'monsters defeated'],
        ['star', st('crits'), 'critical hit', 'critical hits'],
        ['hand', st('helps'), 'friend helped up', 'friends helped up'],
        ['door', st('rooms'), 'room cleared', 'rooms cleared'],
      ].map(([ic, n, one, many], i) => `<div class="lb-tile-stat" style="--i:${i}">
          ${ic === 'coin' ? coinSvg().replace('lb-coin', 'lb-ico lb-coin') : icon(ic)}<b data-n="${n}">${n}</b><span>${esc(n === 1 ? one : many)}</span></div>`).join('');
      const stateHeroes = (last.state && last.state.heroes) || {};
      const ids = heroList().map((d) => d.id).filter((id) => stateHeroes[id] || (stats.heroes || {})[id] || !last.state);
      const titles = heroTitles(ids, stats.heroes || {});
      const nameOf = (id) => (stateHeroes[id] && stateHeroes[id].name) || heroDef(id).name;
      // Every hero gets one kind title for what they did best; nobody is ranked (ux #10).
      const chips = ids.map((id, i) => `<div class="lb-hero-chip" style="--i:${i}">${portrait(id)}<div><b>${esc(nameOf(id))}</b>` +
        `<span class="lb-hero-title">${icon('star')}${esc(titles[id])}</span></div></div>`).join('');
      const helps = (stats.helped || []).slice(0, 3).map((x) => {
        const by = (stateHeroes[x.by] && stateHeroes[x.by].name) || heroDef(x.by).name;
        const who = (stateHeroes[x.who] && stateHeroes[x.who].name) || heroDef(x.who).name;
        return `${esc(by)} helped ${esc(who)} up.`;
      }).join(' ');
      s.content.innerHTML = `
        <div class="lb-victory-head"><div class="lb-victory-title">${esc(text('victoryTitle', 'The Heart Lantern blazes again!'))}</div>
          <p class="lb-victory-text">${esc(text('victoryText', 'Warm light fills Gloamhold, and the valley is safe!'))}</p></div>
        <div class="lb-victory-box lb-panel">
          <div class="lb-tiles">${tiles}</div>
          ${chips ? `<div class="lb-heroes-row">${chips}</div>` : ''}
          ${helps ? `<p class="lb-helps">${helps} Teamwork!</p>` : ''}
          <div class="lb-row">${speakBtn()}${btn('again', 'sparkle', 'Play Again', 'lb-btn-gold lb-btn-big')}</div>
        </div>`;
      cornerTools(s);
      const praise = ids.map((id) => `${nameOf(id)}: ${titles[id]}.`).join(' ');
      wireSpeak(s, `${text('victoryTitle', 'The Heart Lantern blazes again!')} ${text('victoryText', '')} ${praise}`);
      on(s, 'again', () => call('onNewGame'));
      setScreen(s);
      // The numbers count up as the panel arrives (style.css delays the panel by 1.3 s).
      countUp([...s.querySelectorAll('.lb-tile-stat b')], 1500, !!settings.reducedMotion);
      if (root.LB_AUDIO) root.LB_AUDIO.play('victory');
      return s;
    };

    // ---------- How to Play: one screen, six pictures ----------
    let howto = null;
    ui.showHowTo = () => {
      if (howto) leave(howto);
      const tips = text('howTo', null);
      const say = (i, fallback) => (Array.isArray(tips) && tips[i]) || fallback;
      const heroImg = (id) => imgOrPh('hero-' + id, '', 'lb-ph-hero', esc(heroDef(id).name ? heroDef(id).name.charAt(0) : '?'), heroDef(id).color);
      const d20 = root.LB_DICE ? `<span class="dz-hero" style="display:inline-block">${root.LB_DICE.svg(20, 17)}</span>` : icon('dice');
      const pics = [
        `<div class="lb-pic-row">${heroImg('knight')}<span class="lb-tile"></span><span class="lb-tile"></span></div>`,
        `<div class="lb-pic-row" style="align-items:center;gap:16px"><span class="lb-pip" style="font-size:20px;padding:6px 12px">${icon('boot')}<span>Move</span></span><span class="lb-pip" style="font-size:20px;padding:6px 12px">${icon('star')}<span>Act</span></span></div>`,
        `<div class="lb-pic-row" style="align-items:center">${d20}<span style="font-family:var(--font-head);font-size:30px;color:var(--gold-2)">HIT!</span></div>`,
        `<div class="lb-pic-row">${imgOrPh('prop-brazier', '', '', icon('flame'), '#b9771f')}<span class="lb-eyes" style="align-self:center"><i></i><i></i></span></div>`,
        `<div class="lb-pic-row">${heroImg('lightbringer')}<span style="align-self:center;color:var(--green)">${icon('hand')}</span>${heroImg('wizard')}</div>`,
        `<div class="lb-pic-row" style="align-items:center"><span class="lb-btn lb-btn-gold" style="pointer-events:none">${icon('endturn')}<span>All done! Monsters go</span></span></div>`,
      ];
      const lines = [
        say(0, 'Tap a hero, then tap a glowing square to move.'),
        say(1, 'Each hero gets one move and one action every turn.'),
        say(2, 'To attack, roll the dice. Match the Defense number or beat it to hit!'),
        say(3, 'Monsters hide in the dark. Light braziers to see them and hit them more easily.'),
        say(4, 'Knocked down? A friend next to you can help you up.'),
        say(5, 'When every hero is done, tap the Monsters go button. Then the monsters take their turn.'),
      ];
      // The painted dungeon map is the backdrop: the whole quest, from the gate to the chamber.
      const mapArt = artSrcFor('screen-map');
      const s = makeScreen('lb-howto' + (mapArt ? ' is-map' : ''), mapArt || screenArt('title'), 'lb-fb-title', 0);
      s.style.zIndex = 30;
      s.content.innerHTML = `<div class="lb-howto-box lb-panel">
          <div class="lb-row is-split"><h1 class="lb-h2">How to Play</h1>${speakBtn()}</div>
          <div class="lb-steps">${lines.map((l, i) => `<div class="lb-step"><div class="lb-step-pic"><span class="lb-step-num">${i + 1}</span>${pics[i]}</div><p>${esc(l)}</p></div>`).join('')}</div>
          <div class="lb-row">${btn('close', 'check', 'Got it!', 'lb-btn-gold lb-btn-big')}</div>
        </div>`;
      wireSpeak(s, lines.join(' '));
      on(s, 'close', () => { hush(); leave(s); howto = null; });
      howto = s;
      layer.appendChild(s);
      return s;
    };

    // ---------- Settings ----------
    function closeModal() {
      if (!modal) return;
      leave(modal);
      modal = null;
    }
    ui.showSettings = () => {
      closeModal();
      const m = h('div', 'lb-modal');
      const sw = (key, ic, label, sub) => `<div class="lb-setting"><span class="lb-setting-label">${icon(ic)}<span>${esc(label)}<small>${esc(sub)}</small></span></span>
          <button type="button" class="lb-switch" role="switch" data-set="${key}" aria-checked="${!!settings[key]}" aria-label="${esc(label)}"></button></div>`;
      m.innerHTML = `<div class="lb-modal-box lb-panel" role="dialog" aria-modal="true" aria-label="Settings">
          <div class="lb-row is-split"><h2 class="lb-h2">Settings</h2>
            <button type="button" class="lb-icon-btn" data-k="close" aria-label="Close">${icon('close')}</button></div>
          ${sw('sound', 'speaker', 'Sound', 'Soft sound effects')}
          ${sw('music', 'music', 'Music', 'Gentle music that brightens with the light')}
          ${sw('readAloud', 'book', 'Read aloud', 'Read story text out loud by itself')}
          <div class="lb-setting"><span class="lb-setting-label">${icon('dice')}<span>Dice speed<small>Fast rolls take half the time</small></span></span>
            <span class="lb-seg"><button type="button" data-speed="normal" aria-pressed="${settings.diceSpeed !== 'fast'}">Normal</button><button type="button" data-speed="fast" aria-pressed="${settings.diceSpeed === 'fast'}">Fast</button></span></div>
          ${sw('reducedMotion', 'wave', 'Calm motion', 'Less shaking, spinning and drifting')}
          <div class="lb-row">${btn('howto', 'book', 'How to Play', '')}${btn('done', 'check', 'Done', 'lb-btn-gold')}</div>
        </div>`;
      m.addEventListener('click', (e) => { if (e.target === m) closeModal(); });
      m.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
        const key = b.dataset.set;
        setSetting(key, !settings[key]);
        b.setAttribute('aria-checked', String(!!settings[key]));
        if (key === 'readAloud' && settings.readAloud) {
          // If this device's voice won't start, say so right here instead of staying silent.
          speak('Read aloud is on.', null, (why) => {
            const sub = b.closest('.lb-setting').querySelector('small');
            if (!sub) return;
            sub.textContent = why === 'none' ? "This browser can't read aloud. Try opening the game in Chrome."
              : why === 'silent' ? 'No voice came out. In the Claude app, open the game in Chrome instead.'
              : `This device's voice didn't start (${why}). Check the phone's text-to-speech settings.`;
          });
        }
      }));
      m.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
        setSetting('diceSpeed', b.dataset.speed);
        m.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.speed === settings.diceSpeed)));
      }));
      on(m, 'close', closeModal);
      on(m, 'done', closeModal);
      on(m, 'howto', () => { closeModal(); ui.showHowTo(); });
      modal = m;
      layer.appendChild(m);
      return m;
    };

    // ---------- Small extras for main.js ----------
    ui.clearScreens = () => { setScreen(null); };

    // ---------- Transitions and celebrations (polish pass) ----------
    // A transition's centre: a viewport point { x, y } in CSS px, or the fallback.
    const centre = (p, fx, fy) => (p && isFinite(p.x) && isFinite(p.y) ? [`${Math.round(p.x)}px`, `${Math.round(p.y)}px`] : [fx, fy]);
    // How far the farthest screen corner is from a point (px): a circle that big just covers it.
    const reach = (p, fx, fy) => {
      const w = root.innerWidth || 1366;
      const hgt = root.innerHeight || 768;
      const x = p && isFinite(p.x) ? p.x : w * fx;
      const y = p && isFinite(p.y) ? p.y : hgt * fy;
      return Math.ceil(Math.hypot(Math.max(x, w - x), Math.max(y, hgt - y)));
    };
    const aimIris = (p) => {
      const [x, y] = centre(p, '50%', '62%');
      iris.style.setProperty('--ix', x);
      iris.style.setProperty('--iy', y);
      // Open is just wide enough to clear the screen (plus the soft rim), so the whole close is seen.
      iris.style.setProperty('--iris-open', reach(p, 0.5, 0.62) + 130 + 'px');
    };
    let irisTimer = 0;
    // The lantern iris between rooms: the light closes into a circle around the party, then all is
    // dark. Returns how long the close takes (ms). Calm motion, or a browser that can't animate a
    // custom property, uses the plain fade to black instead.
    ui.irisClose = (focus) => {
      clearTimeout(irisTimer);
      if (!IRIS || settings.reducedMotion) {
        fade.classList.add('is-on');
        return 700;
      }
      // Size and aim it with transitions off, so the close starts just outside the screen's
      // corners (otherwise the new size would itself glide in from far away).
      iris.classList.remove('is-opening');
      iris.classList.add('is-active', 'is-snap');
      aimIris(focus);
      void iris.offsetWidth;
      iris.classList.remove('is-snap');
      iris.classList.add('is-on');
      return 860;
    };
    ui.fadeOut = () => { fade.classList.add('is-on'); return wait(650); };
    // Lifts the fade, and opens the iris (from focus, if given) when it is closed.
    ui.fadeIn = (focus) => {
      fade.classList.remove('is-on');
      if (iris.classList.contains('is-on')) {
        if (focus) aimIris(focus);
        iris.classList.add('is-opening');
        iris.classList.remove('is-on');
        clearTimeout(irisTimer);
        irisTimer = setTimeout(() => {
          if (!iris.classList.contains('is-on')) iris.classList.remove('is-active', 'is-opening');
        }, 1100);
      }
      return wait(650);
    };

    // "Room cleared!": a big golden title bursts over the room with turning rays and sparks, then
    // floats away by itself (about 3.4 s), so the lit room shines on its own before the doorway
    // panel. words: "Room cleared! The braziers blaze with light." (title, then the line).
    let cheerNode = null;
    ui.cheer = (words) => {
      ui.endCheer();
      const all = String(words || 'Room cleared!');
      const cut = all.indexOf('!');
      const title = cut > 0 ? all.slice(0, cut + 1) : all;
      const line = cut > 0 ? all.slice(cut + 1).trim() : '';
      let sparks = '';
      for (let i = 0; i < 18; i++) {
        const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.25;
        const d = 130 + Math.random() * 120;
        sparks += `<i class="lb-cheer-spark" style="--dx:${(Math.cos(a) * d * 1.6).toFixed(0)}px;` +
          `--dy:${(Math.sin(a) * d * 0.75).toFixed(0)}px;--dl:${(0.12 + Math.random() * 0.3).toFixed(2)}s"></i>`;
      }
      const n = h('div', 'lb-cheer');
      n.setAttribute('role', 'status');
      n.innerHTML = `<div class="lb-cheer-in"><div class="lb-cheer-rays"></div>${sparks}
        <div class="lb-cheer-title">${esc(title)}</div>${line ? `<div class="lb-cheer-line">${esc(line)}</div>` : ''}</div>`;
      layer.appendChild(n);
      cheerNode = n;
      rootEl.classList.add('lb-cheering'); // the ribbon steps aside meanwhile
      setTimeout(() => { if (cheerNode === n) ui.endCheer(); }, 3500);
    };
    ui.endCheer = () => {
      rootEl.classList.remove('lb-cheering');
      if (!cheerNode) return;
      leave(cheerNode);
      cheerNode = null;
    };

    // The golden light that carries the party to victory: it blooms out of the Heart Lantern until
    // the whole screen glows warm; the victory painting is put behind it, then it melts away.
    // Calm motion skips it (the victory screen just fades in).
    ui.flareIn = (focus) => {
      if (settings.reducedMotion) return Promise.resolve(false);
      const [x, y] = centre(focus, '50%', '35%');
      flare.style.setProperty('--fx', x);
      flare.style.setProperty('--fy', y);
      // The disc of light grows until even the far corners sit in its warm middle.
      flare.classList.remove('is-off');
      flare.classList.add('is-snap');
      flare.style.setProperty('--glow-max', Math.round(reach(focus, 0.5, 0.35) * 2.4) + 'px');
      void flare.offsetWidth;
      flare.classList.remove('is-snap');
      flare.classList.add('is-on');
      return wait(1100).then(() => true);
    };
    ui.flareOut = () => {
      if (!flare.classList.contains('is-on')) return;
      flare.classList.remove('is-on');
      flare.classList.add('is-off');
      setTimeout(() => flare.classList.remove('is-off'), 1700);
    };
    ui.shake = () => {
      if (settings.reducedMotion) return;
      document.documentElement.classList.remove('lb-shake');
      void document.documentElement.offsetWidth;
      document.documentElement.classList.add('lb-shake');
      setTimeout(() => document.documentElement.classList.remove('lb-shake'), 450);
    };

    return ui;
  }

  const LB_UI = { create, icon, speak, artBase: '' };
  root.LB_UI = LB_UI;
})(typeof self !== 'undefined' ? self : this);
