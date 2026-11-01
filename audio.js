// Lanternbearers sound: every effect is synthesized with WebAudio, no audio files.
// LB_AUDIO.play(name), LB_AUDIO.setMuted(bool), LB_AUDIO.unlock()
// Music too: LB_AUDIO.music(mood), setMusic(bool), musicLight(0..1), duck(bool).
// Sounds stay soft on purpose: the family plays together, often in the evening.
(function (root) {
  'use strict';
  const MUTE_KEY = 'lanternbearers:v1:muted';
  const VOLUME = 0.32;
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = readMuted();
  let volume = VOLUME;

  function readMuted() {
    try { return root.localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }
  function saveMuted() {
    try { root.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* private window: fine */ }
  }

  // The context is made lazily: browsers only allow sound after a tap.
  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = chain(ctx, muted ? 0 : volume);
      noiseBuf = makeNoise(ctx);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }
  // master -> a gentle compressor -> the speakers.
  function chain(ac, level) {
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    const m = ac.createGain();
    m.gain.value = level;
    m.connect(comp);
    comp.connect(ac.destination);
    return m;
  }
  function makeNoise(ac) {
    const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // One shaped oscillator note.
  function tone(o) {
    const t0 = ctx.currentTime + (o.at || 0);
    const dur = o.dur || 0.2;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    if (o.detune) osc.detune.value = o.detune;
    const peak = o.gain == null ? 0.5 : o.gain;
    const atk = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let out = g;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      g.connect(f);
      out = f;
    }
    osc.connect(g);
    out.connect(master);
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = o.vibrato;
      lg.gain.value = o.freq * 0.012;
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // A burst of filtered noise, for clicks, whooshes and rumbles.
  function noise(o) {
    const t0 = ctx.currentTime + (o.at || 0);
    const dur = o.dur || 0.1;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    f.Q.value = o.q == null ? 1 : o.q;
    const g = ctx.createGain();
    const peak = o.gain == null ? 0.4 : o.gain;
    const atk = o.attack || 0.003;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  const NOTE = { G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };

  const SOUNDS = {
    // A handful of clacks that slow down as the die settles.
    dice() {
      let t = 0;
      for (let i = 0; i < 7; i++) {
        const g = 0.5 * (1 - i / 9);
        noise({ at: t, dur: 0.035, freq: 2200 + Math.random() * 2400, q: 4, gain: g });
        tone({ at: t, dur: 0.04, freq: 1300 + Math.random() * 900, gain: g * 0.25, type: 'triangle' });
        t += 0.05 + i * 0.022 + Math.random() * 0.03;
      }
    },
    hit() {
      tone({ freq: 150, to: 48, dur: 0.22, gain: 0.9, type: 'sine' });
      noise({ dur: 0.09, freq: 500, filter: 'lowpass', gain: 0.5 });
    },
    crit() {
      [NOTE.C6, NOTE.E6, NOTE.G6].forEach((f, i) => {
        tone({ at: i * 0.07, freq: f, dur: 1.1, gain: 0.22, type: 'sine' });
        tone({ at: i * 0.07, freq: f * 2.01, dur: 0.6, gain: 0.06, type: 'sine' });
      });
      noise({ at: 0.05, dur: 0.5, freq: 7000, filter: 'highpass', gain: 0.08 });
      tone({ freq: 120, to: 50, dur: 0.25, gain: 0.6 });
    },
    miss() {
      noise({ dur: 0.38, freq: 380, to: 2400, q: 1.6, gain: 0.32, attack: 0.12 });
    },
    coin() {
      tone({ freq: NOTE.E6, dur: 0.12, gain: 0.16, type: 'triangle' });
      tone({ at: 0.08, freq: NOTE.G6 * 1.335, dur: 0.35, gain: 0.16, type: 'triangle' });
      noise({ at: 0.08, dur: 0.25, freq: 8000, filter: 'highpass', gain: 0.05 });
    },
    brazier() {
      noise({ dur: 0.7, freq: 180, to: 1400, filter: 'lowpass', q: 0.8, gain: 0.55, attack: 0.12 });
      tone({ freq: 70, to: 45, dur: 0.5, gain: 0.5, attack: 0.05 });
      noise({ at: 0.25, dur: 0.6, freq: 3000, q: 0.7, gain: 0.06 });
    },
    step() {
      noise({ dur: 0.06, freq: 420, filter: 'lowpass', gain: 0.45 });
      tone({ freq: 95, to: 60, dur: 0.07, gain: 0.25 });
    },
    heal() {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => {
        tone({ at: i * 0.09, freq: f, dur: 0.7, gain: 0.13, type: 'sine', vibrato: 6, attack: 0.04 });
      });
      noise({ at: 0.1, dur: 0.8, freq: 9000, filter: 'highpass', gain: 0.035, attack: 0.2 });
    },
    down() {
      tone({ freq: 220, to: 70, dur: 0.45, gain: 0.45, type: 'triangle', lowpass: 900 });
      tone({ at: 0.12, freq: 90, to: 45, dur: 0.3, gain: 0.6 });
    },
    boss() {
      noise({ dur: 2.6, freq: 110, filter: 'lowpass', q: 0.9, gain: 0.85, attack: 0.6 });
      tone({ freq: 41, to: 33, dur: 2.6, gain: 0.5, type: 'sawtooth', lowpass: 160, attack: 0.5 });
      tone({ at: 0.4, freq: 55, to: 40, dur: 2.0, gain: 0.35, type: 'sine', attack: 0.4 });
    },
    victory() {
      const seq = [NOTE.G4, NOTE.C5, NOTE.E5, NOTE.G5];
      seq.forEach((f, i) => tone({ at: i * 0.14, freq: f, dur: 0.22, gain: 0.2, type: 'triangle' }));
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f) => {
        tone({ at: 0.6, freq: f, dur: 1.5, gain: 0.13, type: 'triangle', vibrato: 5, attack: 0.03 });
      });
      noise({ at: 0.6, dur: 1.2, freq: 8000, filter: 'highpass', gain: 0.04, attack: 0.3 });
    },
    click() {
      tone({ freq: 900, to: 650, dur: 0.05, gain: 0.12, type: 'sine' });
    },

    // ---------- Phase 2: the Prism Deeps ----------
    // Color floods back into a room: three bright bells climbing, with a soft shimmer on top.
    chime() {
      [NOTE.E6, NOTE.G6, NOTE.C6 * 2].forEach((f, i) => {
        tone({ at: i * 0.09, freq: f, dur: 0.9, gain: 0.16, type: 'sine', attack: 0.006 });
        tone({ at: i * 0.09, freq: f * 2.76, dur: 0.35, gain: 0.03, type: 'sine' });
      });
      noise({ at: 0.1, dur: 0.7, freq: 9000, filter: 'highpass', gain: 0.05, attack: 0.15 });
    },
    // Frozen feet or a Snow Globe: an icy crackle and a falling glassy tinkle.
    freeze() {
      noise({ dur: 0.25, freq: 5200, q: 2.5, gain: 0.28, attack: 0.004 });
      [2200, 1760, 1320, 990].forEach((f, i) => tone({ at: 0.04 + i * 0.07, freq: f, dur: 0.45, gain: 0.1, type: 'triangle' }));
      tone({ at: 0.02, freq: 420, to: 180, dur: 0.3, gain: 0.25, type: 'sine', lowpass: 900 });
    },
    // A Magma Blob splitting: two wet plops, the second a little higher and smaller.
    split() {
      tone({ freq: 320, to: 110, dur: 0.16, gain: 0.55, type: 'sine' });
      noise({ dur: 0.08, freq: 600, filter: 'lowpass', gain: 0.3 });
      tone({ at: 0.17, freq: 420, to: 150, dur: 0.14, gain: 0.42, type: 'sine' });
      noise({ at: 0.17, dur: 0.07, freq: 800, filter: 'lowpass', gain: 0.22 });
    },
    // The Clanker's armor: a metal clang with a ringing overtone and a dull thud under it.
    clank() {
      tone({ freq: 1870, to: 1700, dur: 0.5, gain: 0.22, type: 'square', lowpass: 3200, attack: 0.002 });
      tone({ freq: 2660, dur: 0.3, gain: 0.08, type: 'triangle' });
      noise({ dur: 0.06, freq: 3000, q: 1.2, gain: 0.5 });
      tone({ freq: 130, to: 60, dur: 0.18, gain: 0.5, type: 'sine' });
    },
    // A Starwisp blinking away: a rising pop and a sprinkle of sparkle.
    blink() {
      tone({ freq: 520, to: 2100, dur: 0.16, gain: 0.3, type: 'sine', attack: 0.004 });
      tone({ at: 0.12, freq: 2600, dur: 0.3, gain: 0.08, type: 'triangle' });
      noise({ at: 0.08, dur: 0.3, freq: 8000, filter: 'highpass', gain: 0.07 });
    },
    // A vine yanking a hero in: a stretchy twang that swoops down, then snaps back up.
    grab() {
      tone({ freq: 360, to: 120, dur: 0.22, gain: 0.4, type: 'sawtooth', lowpass: 1400, attack: 0.01 });
      tone({ at: 0.2, freq: 140, to: 620, dur: 0.14, gain: 0.35, type: 'triangle' });
      noise({ at: 0.3, dur: 0.05, freq: 1800, q: 1.5, gain: 0.3 });
    },
    // A snowball landing: a soft fwump with a powdery hiss.
    snowball() {
      noise({ dur: 0.18, freq: 320, filter: 'lowpass', gain: 0.6, attack: 0.006 });
      tone({ freq: 170, to: 55, dur: 0.2, gain: 0.5, type: 'sine' });
      noise({ at: 0.05, dur: 0.3, freq: 6000, filter: 'highpass', gain: 0.07, attack: 0.03 });
    },
  };

  // Friendly aliases, so callers can use the words from DESIGN.md and the Phase 2 event names.
  // Anything not listed here or in SOUNDS stays silent, so a new board sound never breaks the game.
  const ALIAS = {
    roll: 'dice', clatter: 'dice', thud: 'hit', critical: 'crit', whoosh: 'miss',
    gold: 'coin', jingle: 'coin', light: 'brazier', whoomph: 'brazier', footstep: 'step', footsteps: 'step',
    tap: 'click', shimmer: 'heal', mend: 'heal', thump: 'down', rumble: 'boss', fanfare: 'victory',
    // Phase 2
    colorBack: 'chime', tint: 'chime', glow: 'chime', telegraph: 'chime', frozen: 'freeze', frost: 'freeze', chilled: 'freeze',
    knockback: 'snowball', pull: 'grab', yank: 'grab', armored: 'clank', clang: 'clank', teleport: 'blink',
    breath: 'miss', gobble: 'boss',
  };

  function play(name) {
    if (muted) return;
    const key = SOUNDS[name] ? name : ALIAS[name];
    if (!key || !ensure()) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      SOUNDS[key]();
    } catch (e) { /* sound is never allowed to break the game */ }
  }

  function setMuted(on) {
    muted = !!on;
    saveMuted();
    if (master && ctx) {
      try { master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05); } catch (e) { /* ignore */ }
    }
  }

  // ---------- Music ----------
  // Gentle music made on the spot, a moment ahead on the audio clock: no files. One mood plays at
  // a time and cross-fades into the next. In the dungeon it starts dim and sparse, and grows
  // brighter, busier and higher as the braziers are lit (musicLight).
  const MUSIC_LEVEL = 0.4; // of the sound-effect level: music sits underneath
  const MIN = [0, 3, 7, 10], MAJ = [0, 4, 7, 11], SUS = [0, 5, 7, 10], TMIN = [0, 3, 7], TMAJ = [0, 4, 7];
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const lift = (n, lo) => { while (n < lo) n += 12; return n; };
  // A chord's triad over three octaves, from a base note: the notes a melody can use.
  function tones(base, q) {
    const out = [];
    for (let o = 0; o < 3; o++) for (let i = 0; i < 3; i++) out.push(base + o * 12 + q[i]);
    return out;
  }

  // Each mood: tempo, bars per chord, chords as [bass root (MIDI), shape], and what plays on each
  // eighth note (s = 0..7 within the bar).
  const MOODS = {
    // The title, party and story: a rising harp, a bell on each new chord. Wonder, setting out.
    title: { bpm: 76, hold: 2, cutoff: 1500, pad: 0.03, bass: 0.15,
      chords: [[38, MIN], [34, MAJ], [41, MAJ], [36, MAJ]],
      play(p, s, t, r, q, bar) {
        const pool = tones(lift(r + 24, 58), q);
        pluck(p, pool[[0, 1, 2, 3, 4, 5, 4, 2][s]], t, 0.07, 1.6);
        if (s === 0 && bar % 2 === 0) bell(p, pool[3] + 12, t, 0.035);
      } },
    // A dark room: a few wandering notes. With light: more notes, an octave up, and bells.
    explore: { bpm: 58, hold: 2, cutoff: 520, lit: 1800, pad: 0.034, bass: 0.13,
      chords: [[33, MIN], [29, MAJ], [38, MIN], [40, SUS]],
      play(p, s, t, r, q, bar) {
        const pool = tones(lift(r + 24, 55) + (light > 0.6 ? 12 : 0), q);
        if ((s % 2 === 0 || light > 0.3) && Math.random() < 0.2 + light * 0.4) {
          p.walk = Math.max(0, Math.min(pool.length - 1, p.walk + [-2, -1, 1, 2][Math.floor(Math.random() * 4)]));
          pluck(p, pool[p.walk], t, 0.06 + light * 0.02, 2.4);
        }
        if (s === 4 && bar % 2 === 1 && Math.random() < light * 0.8) bell(p, pool[3] + 12, t, 0.03 * light);
      } },
    // Gloamwing: a low driving pattern and a heartbeat drum. Exciting, never frightening.
    boss: { bpm: 92, hold: 1, cutoff: 760, pad: 0.022, bass: 0.14,
      chords: [[40, TMIN], [36, TMAJ], [33, TMIN], [35, TMAJ]],
      play(p, s, t, r, q) {
        pluck(p, lift(r + 12, 50) + [0, 7, 12, 7, q[1], 7, 12, 7][s], t, s === 0 ? 0.07 : 0.05, 0.6);
        if (s === 0 || s === 4) drum(p, t, s === 0 ? 0.3 : 0.2);
        if (s === 7) drum(p, t, 0.1);
      } },
    // Camp: a slow lullaby, one note a beat.
    camp: { bpm: 66, hold: 2, cutoff: 1200, pad: 0.03, bass: 0.12,
      chords: [[29, MAJ], [38, MIN], [34, MAJ], [36, SUS]],
      play(p, s, t, r, q, bar) {
        if (s % 2) return;
        const pool = tones(lift(r + 24, 57), q);
        pluck(p, pool[s / 2 + (bar % 2 ? 2 : 0)], t, 0.065, 2.4);
        if (s === 0 && bar % 4 === 0) bell(p, pool[3] + 12, t, 0.025);
      } },
    // Victory: bright arpeggios up and down, a bell on every bar.
    victory: { bpm: 100, hold: 1, cutoff: 2400, pad: 0.026, bass: 0.17,
      chords: [[36, MAJ], [31, MAJ], [33, MIN], [29, MAJ]],
      play(p, s, t, r, q) {
        const pool = tones(lift(r + 24, 60), q);
        pluck(p, pool[[0, 1, 2, 3, 4, 3, 2, 1][s]], t, 0.07, 1.2);
        if (s === 0) bell(p, pool[3] + 12, t, 0.04);
      } },
    // Chapter 2, the Prism Deeps: brighter and sparklier than explore. A climbing arpeggio over
    // major chords, with high bells that come out as the colors come back (musicLight).
    prism: { bpm: 72, hold: 2, cutoff: 900, lit: 2600, pad: 0.03, bass: 0.13,
      chords: [[36, MAJ], [41, MAJ], [33, MIN], [43, MAJ]],
      play(p, s, t, r, q, bar) {
        const pool = tones(lift(r + 24, 60) + (light > 0.6 ? 12 : 0), q);
        if (s % 2 === 0 || light > 0.4) pluck(p, pool[[0, 2, 4, 6, 7, 5, 3, 1][s]], t, 0.055 + light * 0.025, 1.8);
        if (s === 0 && bar % 2 === 0) bell(p, pool[4] + 12, t, 0.03 + light * 0.02);
        if (s === 6 && light > 0.5 && Math.random() < 0.6) bell(p, pool[7] + 12, t, 0.02);
      } },
  };

  let musicOn = true;
  let musicIn = null; // each mood's fader -> here -> dry + reverb -> musicBus -> master
  let musicBus = null;
  let wanted = null; // the mood asked for, kept until a tap allows sound
  let player = null;
  let light = 0;
  let ducked = false;
  let timer = null;

  // A soft held chord: two slightly detuned voices a note, through a low-pass filter.
  function pad(p, notes, t, len, cutoff, gain) {
    const end = t + len + 1.6;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(1.4, len * 0.5));
    g.gain.setValueAtTime(gain, t + len);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    f.connect(g);
    g.connect(p.fader);
    notes.forEach((n) => [-7, 7].forEach((cents, j) => {
      const o = ctx.createOscillator();
      o.type = j ? 'sawtooth' : 'triangle';
      o.frequency.value = hz(n);
      o.detune.value = cents;
      o.connect(f);
      o.start(t);
      o.stop(end + 0.05);
    }));
  }
  // A harp-like note.
  function pluck(p, n, t, gain, dur) {
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.value = hz(n);
    o2.frequency.value = hz(n) * 2;
    g2.gain.value = 0.25;
    f.type = 'lowpass';
    f.frequency.value = 3200;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(f);
    f.connect(p.fader);
    [o, o2].forEach((x) => { x.start(t); x.stop(t + dur + 0.05); });
  }
  // A small chime: a sine with two bell-like overtones.
  function bell(p, n, t, gain) {
    [[1, 1, 3.2], [2.76, 0.35, 1.6], [5.4, 0.12, 0.8]].forEach(([mul, amp, dur]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = hz(n) * mul;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(p.fader);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }
  function bassNote(p, n, t, len, gain) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = hz(n);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.08);
    g.gain.setValueAtTime(gain, t + len * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.4);
    o.connect(g);
    g.connect(p.fader);
    o.start(t);
    o.stop(t + len + 0.45);
  }
  // A soft low drum, like a heartbeat.
  function drum(p, t, gain) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(78, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g);
    g.connect(p.fader);
    o.start(t);
    o.stop(t + 0.5);
  }

  // One eighth note of the current mood: a new chord (pad and bass) when one is due, then the tune.
  function musicStep(p) {
    const m = MOODS[p.mood];
    const t = p.next;
    const s = p.step % 8;
    const bar = Math.floor(p.step / 8);
    const [r, q] = m.chords[Math.floor(bar / m.hold) % m.chords.length];
    const eighth = 30 / m.bpm;
    if (s === 0 && bar % m.hold === 0) {
      const len = eighth * 8 * m.hold;
      pad(p, q.map((i) => lift(r + 24, 55) + i), t, len, m.cutoff + (m.lit || 0) * light, m.pad);
      bassNote(p, r + 12, t, len, m.bass);
    }
    m.play(p, s, t, r, q, bar);
    p.step += 1;
    p.next += eighth;
  }

  function musicTick() {
    if (!ctx || !player || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (muted || !musicOn || (root.document && root.document.hidden)) { player.next = now + 0.1; return; }
    if (player.next < now) player.next = now + 0.05; // a sleeping tab fell behind: carry on from now
    try {
      while (player.next < now + 1) musicStep(player);
    } catch (e) { /* music is never allowed to break the game */ }
  }

  function ensureMusicBus() {
    if (musicIn) return;
    const made = musicChain(ctx, master);
    musicIn = made.input;
    musicBus = made.bus;
    musicBus.gain.value = musicLevel();
  }
  // input -> (dry, plus a soft stone-hall reverb) -> bus -> out
  function musicChain(ac, out) {
    const bus = ac.createGain();
    bus.connect(out);
    const input = ac.createGain();
    input.connect(bus);
    const n = Math.floor(ac.sampleRate * 2.8);
    const ir = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    }
    const verb = ac.createConvolver();
    verb.buffer = ir;
    const wet = ac.createGain();
    wet.gain.value = 0.32;
    input.connect(verb);
    verb.connect(wet);
    wet.connect(bus);
    return { input, bus };
  }
  const musicLevel = () => (musicOn ? MUSIC_LEVEL * (ducked ? 0.35 : 1) : 0);
  function setMusicLevel() {
    if (musicBus) try { musicBus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.25); } catch (e) { /* ignore */ }
  }

  function startMood(mood) {
    if (player && player.mood === mood) return;
    ensureMusicBus();
    const now = ctx.currentTime;
    if (player) {
      const old = player.fader;
      old.gain.cancelScheduledValues(now);
      old.gain.setValueAtTime(old.gain.value, now);
      old.gain.linearRampToValueAtTime(0, now + 1.8);
      setTimeout(() => { try { old.disconnect(); } catch (e) { /* ignore */ } }, 6000);
    }
    const fader = ctx.createGain();
    fader.gain.setValueAtTime(0, now);
    fader.gain.linearRampToValueAtTime(1, now + 2.5);
    fader.connect(musicIn);
    player = { mood, fader, step: 0, next: now + 0.1, walk: 3 };
    if (!timer) timer = setInterval(musicTick, 200);
    musicTick();
  }
  function startWanted() {
    try { if (wanted && ctx && ctx.state === 'running') startMood(wanted); } catch (e) { /* ignore */ }
  }

  // Ask for a mood: 'title', 'explore', 'prism' (Chapter 2 rooms), 'boss', 'camp' or 'victory'.
  // It starts at the first tap. An unknown mood is ignored, so a chapter's `music` can't break anything.
  function music(mood) {
    if (!MOODS[mood]) return;
    wanted = mood;
    startWanted();
  }
  function setMusic(on) {
    musicOn = !!on;
    setMusicLevel();
  }
  // How lit the room is, 0..1.
  function musicLight(v) {
    light = Math.max(0, Math.min(1, Number(v) || 0));
  }
  // Quieter while read-aloud is speaking.
  function duck(on) {
    ducked = !!on;
    setMusicLevel();
  }

  // For checking levels without speakers: renders a mood (or a sound) offline through the same
  // chain and measures it. LB_AUDIO.measure('music', 'explore', 20, 0.5) -> {rms, peak} in dBFS.
  function measure(kind, name, seconds, lightLevel) {
    const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    if (!OAC) return Promise.resolve(null);
    const keep = { ctx, master, noiseBuf, light };
    const off = new OAC(2, Math.ceil(44100 * seconds), 44100);
    try {
      ctx = off;
      master = chain(off, volume);
      noiseBuf = makeNoise(off);
      if (kind === 'music') {
        light = lightLevel || 0;
        const made = musicChain(off, master);
        made.bus.gain.value = MUSIC_LEVEL;
        const p = { mood: name, fader: made.input, step: 0, next: 0.05, walk: 3 };
        while (p.next < seconds - 2) musicStep(p);
      } else {
        SOUNDS[ALIAS[name] || name]();
      }
    } finally {
      ctx = keep.ctx;
      master = keep.master;
      noiseBuf = keep.noiseBuf;
      light = keep.light;
    }
    return off.startRendering().then((buf) => {
      let sum = 0;
      let peak = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
      }
      const db = (x) => Math.round(20 * Math.log10(Math.max(x, 1e-9)) * 10) / 10;
      return { rms: db(Math.sqrt(sum / (buf.length * buf.numberOfChannels))), peak: db(peak) };
    });
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v)) * VOLUME; // v is 0..1 of the soft default
    if (master && !muted) master.gain.value = volume;
  }

  function unlock() {
    if (!ensure()) return;
    try {
      if (ctx.state === 'suspended') ctx.resume().then(startWanted, () => {});
      const b = ctx.createBufferSource();
      b.buffer = ctx.createBuffer(1, 1, 22050);
      b.connect(ctx.destination);
      b.start(0);
      startWanted();
    } catch (e) { /* ignore */ }
  }

  root.LB_AUDIO = {
    play,
    setMuted,
    isMuted: () => muted,
    setVolume,
    unlock,
    music,
    setMusic,
    musicLight,
    duck,
    measure,
    moods: Object.keys(MOODS),
    names: Object.keys(SOUNDS),
  };
})(typeof self !== 'undefined' ? self : this);
