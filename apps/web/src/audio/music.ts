import { audio } from './engine';

/**
 * Classical music for the menus and the 2D board (DECISIONS #40, #42), synthesized like the
 * sound effects: public-domain Mozart and Beethoven (Eine kleine Nachtmusik, the Moonlight
 * sonata, Rondo alla Turca, the Pathétique's Adagio, the Sonata facile, Ode to Joy) played by
 * a soft WebAudio piano with a little room reverb. No audio files. The notes are copied from
 * Mutopia Project editions (docs/CREDITS.md) in LilyPond's own syntax, read by `voice` below.
 * It pauses with a fade while the 3D walk is open and picks up where it left off.
 */

type Note = [time: number, midi: number, dur: number, vel: number];
interface Piece {
  name: string;
  notes: Note[];
  length: number;
}

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const N: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
/** "C#4" → MIDI 61. */
const m = (name: string) => {
  const [, p, o] = name.match(/^([A-G][#b]?)(-?\d)$/)!;
  return 12 * (Number(o) + 1) + N[p];
};

const LETTERS = 'cdefgab';
const SEMI = [0, 2, 4, 5, 7, 9, 11];

/**
 * One LilyPond pitch ("fis'", "bes,,", "as"): its diatonic step and MIDI number. Relative to
 * the step `from` (the nearest such letter, within a fourth), or absolute (c = C3) without it.
 */
export function pitch(s: string, from: number | null): [step: number, midi: number] {
  const [, l, acc, oct] = s.match(/^([a-g])((?:is|es|s)*)([',]*)/)!;
  const letter = LETTERS.indexOf(l);
  let step = from === null ? 21 + letter : from + ((letter - (from % 7) + 10) % 7) - 3;
  for (const c of oct) step += c === "'" ? 7 : -7;
  let alter = 0;
  for (const a of acc.match(/is|es|s/g) ?? []) alter += a === 'is' ? 1 : -1;
  return [step, 12 * (Math.floor(step / 7) + 1) + SEMI[step % 7] + alter];
}

interface Voice {
  /** LilyPond notes, chords and rests, plus `\rel <pitch>` (relative mode), `\abs`, `\oct n`. */
  text: string;
  vel: number;
  /** Sounding length as a share of the written one. */
  hold?: number;
  /** Time scale, e.g. 2/3 for a voice written all in triplets. */
  scale?: number;
}

/** Adds a voice's notes (seconds, at `q` seconds a quarter) and returns where it ends. */
export function voice(v: Voice, q: number, out: Note[]): number {
  const scale = (v.scale ?? 1) * q;
  const hold = v.hold ?? 0.95;
  let prev: number | null = null;
  let relative = false;
  let shift = 0;
  let beats = 1;
  let t = 0;
  const length = (s: string) => {
    const [, n, dots] = s.match(/(\d*)(\.*)$/)!;
    if (!n) return;
    beats = 4 / Number(n);
    for (let i = 0, add = beats / 2; i < dots.length; i++, add /= 2) beats += add;
  };
  for (const tok of v.text.replace(/[!?~]/g, '').match(/\\(?:rel|oct) \S+|\\\w+|<[^>]*>[\d.]*|[^\s|]+/g) ?? []) {
    if (tok.startsWith('\\rel')) {
      relative = true;
      prev = pitch(tok.slice(5), null)[0];
    } else if (tok === '\\abs') relative = false;
    else if (tok.startsWith('\\oct')) shift = 12 * Number(tok.slice(5));
    else if (/^[rsR]/.test(tok)) {
      length(tok);
      t += beats;
    } else {
      const chord = tok.startsWith('<');
      const close = tok.indexOf('>');
      length(chord ? tok.slice(close + 1) : tok);
      // In a chord each pitch is relative to the one before; the next note, to the chord's first.
      let from = relative ? prev : null;
      (chord ? tok.slice(1, close) : tok).split(/\s+/).filter(Boolean).forEach((p, i) => {
        const [step, midi] = pitch(p, from);
        if (relative) from = step;
        if (relative && i === 0) prev = step;
        out.push([t * scale, midi + shift, beats * scale * hold, v.vel]);
      });
      t += beats;
    }
  }
  return t * scale;
}

/** A piece from its voices, played `repeat` times, ending on a held chord. */
function piece(name: string, q: number, voices: Voice[], end: string[], repeat = 1): Piece {
  const once: Note[] = [];
  const len = Math.max(...voices.map((v) => voice(v, q, once)));
  const notes: Note[] = [];
  for (let r = 0; r < repeat; r++) for (const [t, midi, dur, vel] of once) notes.push([t + r * len, midi, dur, vel]);
  const at = len * repeat;
  end.forEach((n, i) => notes.push([at + i * 0.04, m(n), 3.5, 0.38]));
  return { name, notes, length: at + 4.5 };
}

/** Mozart, Eine kleine Nachtmusik K.525, I: bars 1–10, first violin over the cello, twice. */
const nachtmusik = () =>
  piece(
    'Eine kleine Nachtmusik',
    0.42,
    [
      {
        text: `\\rel g'' <g b, d,>4 r8 d8 g4 r8 d8 | g8 d g b d4 r4 | c4 r8 a8 c4 r8 a8 | c8 a fis a d,4 r4 |
          <g b, d,>8 r8 g4. b8 a g | g8 fis fis4. a8 c fis, | a8 g g4. b8 a g | g8 fis fis4. a8 c fis, |
          g8 g fis e16 fis g8 g a g16 a | b8 b c b16 c d4 r4`,
        vel: 0.44,
      },
      {
        text: `\\rel g g4 r8 d8 g4 r8 d8 | g8 d g b d4 r4 | c4 r8 a8 c4 r8 a8 | c8 a fis a d,4 r4 |
          g8 g g g g g g g | g g g g g g g g | g g g g g g g g | g g g g g g g g |
          g g a a b b fis fis | g g a a b4 r4`,
        vel: 0.3,
      },
    ],
    ['G2', 'G3', 'D4', 'G4', 'B4'],
    2,
  );

/** Beethoven, Moonlight sonata, I: bars 1–15, then the opening bars again to close in C♯ minor. */
const moonlight = () => {
  const intro = `gis8 cis e gis, cis e gis, cis e gis, cis e | gis, cis e gis, cis e gis, cis e gis, cis e |
    a, cis e a, cis e a, d fis a, d fis | gis, bis fis' gis, cis e gis, cis dis fis, bis dis`;
  const introBass = '<cis cis,>1 | <b b,>1 | <a a,>2 <fis fis,>2 | <gis gis,>2 <gis gis,>2';
  return piece(
    'Moonlight Sonata',
    0.62,
    [
      {
        text: `\\rel c' s1 s1 s1 s1 | s2 r4 gis'8. gis16 | gis2. gis8. gis16 | gis2 a2 | gis2 fis4 b | e,4 r4 r2 |
          r2 r4 g8. g16 | g2. g8. g16 | g2. fis4 | fis2 g4 e | fis2 fis2 | b,4 r4 r2`,
        vel: 0.5,
      },
      {
        text: `\\rel c' ${intro} |
          e, gis cis gis, cis e gis, cis e gis, cis e | gis, dis' fis gis, dis' fis gis, dis' fis gis, dis' fis |
          gis, cis e gis, cis e a, cis fis a, cis fis | gis, b e gis, b e a, b dis a b dis |
          gis, b e gis, b e gis, b e gis, b e | g, b e g, b e g, b e g, b e | g, b f' g, b f' g, b f' g, b f' |
          g, c e g, b e g, cis e fis, cis' e | fis, b d fis, b d g, b cis e, b' cis |
          fis, b d fis, b d fis, ais cis fis, ais cis | b d fis b, d fis b, dis fis b, dis fis |
          \\rel c' ${intro}`,
        vel: 0.24,
        hold: 1.6,
        scale: 2 / 3,
      },
      {
        text: `\\rel c ${introBass} | <cis gis cis,>1 | <bis gis bis,>1 | <cis cis,>2 <fis, fis,>2 | <b b,>2 <b b,>2 |
          <e e,>1 | <e e,>1 | <d d,>1 | <c c,>4 <b b,>4 <ais ais,>2 | <b b,>2 e,4 g4 | fis2 <fis fis,>2 | <b b,>1 |
          \\rel c ${introBass}`,
        vel: 0.3,
        hold: 1,
      },
    ],
    ['C#2', 'C#3', 'G#3', 'C#4', 'E4'],
  );
};

/** Mozart, Rondo alla Turca (Sonata K.331, III): the pickup and bars 1–24, twice. */
const turca = () =>
  piece(
    'Rondo alla Turca',
    0.42,
    [
      {
        text: `\\abs \\oct 2 b,16 a, gis, a, | c8 r8 d16 c b, c | e8 r8 f16 e dis e | b16 a gis a b a gis a |
          c'4 a8 c' | b8 <fis a> <e g> <fis a> | b8 <fis a> <e g> <fis a> | b8 <fis a> <e g> <dis fis> |
          e4 <c e>8 <d f> | <e g>8 <e g> a16 g f e | <b, d>8 <g, d> <c e>8 <d f> | <e g>8 <e g> a16 g f e |
          <b, d>4 <a, c>8 <b, d> | <c e>8 <c e> f16 e d c | <gis, b,>8 <e, b,> <a, c>8 <b, d> |
          <c e>8 <c e> f16 e d c | <gis, b,>4 b,16 a, gis, a, | c8 r8 d16 c b, c | e8 r8 f16 e dis e |
          b16 a gis a b a gis a | c'8 r8 a8 b | c'8 b a gis | a8 e f d | c4 b,8. a,32 b, | a,4`,
        vel: 0.42,
      },
      {
        text: `\\abs r4 | a8 <c' e'> <c' e'> <c' e'> | a8 <c' e'> <c' e'> <c' e'> | a8 <c' e'> a <c' e'> |
          a8 <c' e'> <c' e'> <c' e'> | e8 <b e'> <b e'> <b e'> | e8 <b e'> <b e'> <b e'> | e8 <b e'> b, b |
          e4 r4 | c8 c' e e' | g4 r4 | c8 c' e e' | g4 r4 | a,8 a c c' | e4 r4 | a,8 a c c' | e4 r4 |
          a8 <c' e'> <c' e'> <c' e'> | a8 <c' e'> <c' e'> <c' e'> | a8 <c' e'> a <c' e'> |
          f8 <a dis'> <a dis'> <a dis'> | e8 <a e'> d <f b> | c8 <e a> d <f b> | <e a>8 <e a> <e gis> <e gis> | <a, a>4`,
        vel: 0.26,
      },
    ],
    ['A2', 'A3', 'C4', 'E4', 'A4'],
    2,
  );

/** Beethoven, Pathétique sonata, II (Adagio cantabile): the theme, bars 1–8, twice. */
const pathetique = () =>
  piece(
    'Pathétique, Adagio cantabile',
    0.95,
    [
      {
        text: `\\rel c' c4 bes | es4. des8 | c8 es as bes | es,4. e8 | f4 bes,8. c32 des32 | es4 a, |
          des4 c16 bes as g | <bes g>4 as8 r8`,
        vel: 0.48,
        hold: 1,
      },
      {
        text: `\\rel c' as16 es as es g es g es | as es as es bes' es, bes' es, | as es bes' es, c' as d as |
          g bes g bes g bes g bes | g bes g bes g es g es | as es as es es c es c | f des f des des des des des |
          des es des es r4`,
        vel: 0.18,
        hold: 1.4,
      },
      {
        text: `\\rel c as4 des | c g | as8 g f f' | es4 es, | des4 des' | c f, | bes, es | as,8 as' as, r8`,
        vel: 0.3,
        hold: 1.2,
      },
    ],
    ['Ab2', 'Ab3', 'C4', 'Eb4', 'Ab4'],
    2,
  );

/** Mozart, Sonata facile K.545, I: bars 1–12, home to C. */
const facile = () =>
  piece(
    'Sonata facile',
    0.5,
    [
      {
        text: `\\rel c'' c2 e4 g4 | b,4. c16 d c4 r4 | a'2 g4 c4 | g4 f8 e16 f e4 r4 |
          a,8 b16 c d e f g a g f e d c b a | g8 a16 b c d e f g f e d c b a g |
          f8 g16 a b c d e f e d c b a g f | e8 f16 g a b c d e d c b a g f e |
          \\rel c' d8 e16 f g a b cis d a b cis d e f g | a16 b c b a g f e f g a g f e d c |
          \\rel c'' b8 g' e c d g e c | d4 <b d g>4 g4 r4`,
        vel: 0.42,
      },
      {
        text: `\\rel c'' c,8 g' e g c, g' e g | d g f g c, g' e g | c, a' f a c, g' e g | b, g' d g c, g' e g |
          f4 r4 r4 <f, c'>4 | <e c'>4 r4 r4 <e c'>4 | <d c'>4 r4 r4 <d b'>4 |
          \\rel c <c c'>4 r4 r4 <c e>4 | <f a>1 | f4. g8 a4. fis8 |
          \\rel c' g,16 b d g g, c e g g, b d g g, c e g | g,4 g' g, r4`,
        vel: 0.24,
      },
    ],
    ['C3', 'G3', 'C4', 'E4', 'C5'],
  );

/** Beethoven, Ode to Joy (Symphony No. 9, IV): the theme in D over broken chords. */
const odeToJoy = () => {
  const D = "d8 a d' a";
  const A = 'a,8 e a e';
  const lh = [D, D, D, A, D, D, A, A, D, D, D, A, D, D, A, D, A, A, A, D, A, A, D, A, D, D, D, A, D, D, A, D];
  return piece(
    'Ode to Joy',
    0.5,
    [
      {
        text: `\\rel c' fis4 fis g a | a g fis e | d d e fis | fis4. e8 e2 | fis4 fis g a | a g fis e | d d e fis |
          e4. d8 d2 | e4 e fis d | e fis8 g fis4 d | e fis8 g fis4 e | d4 e a,2 | fis'4 fis g a | a g fis e |
          d d e fis | e4. d8 d2`,
        vel: 0.46,
      },
      { text: `\\abs ${lh.join(' ')}`, vel: 0.22, hold: 1.3 },
    ],
    ['D2', 'D3', 'A3', 'D4', 'F#4'],
  );
};

const PIECES = [nachtmusik, moonlight, turca, pathetique, facile, odeToJoy];

class Music {
  private want = false;
  private gain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private piece = 0;
  private notes: Note[] = [];
  private index = 0;
  /** Context time the current piece's beat 0 maps to. */
  private origin = 0;
  private reverb: ConvolverNode | null = null;

  /** Should music play now (menus or the 2D board, not muted, not in the 3D walk)? */
  setWanted(on: boolean) {
    if (on === this.want) return;
    this.want = on;
    audio.whenUnlocked(() => this.apply());
  }

  private setup() {
    const out = audio.musicOut();
    if (!out || this.gain) return out;
    const { ctx, bus } = out;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    // A small room: a decaying noise impulse, mixed in quietly.
    const len = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3600;
    this.gain.connect(tone);
    tone.connect(bus);
    tone.connect(this.reverb);
    this.reverb.connect(wet);
    wet.connect(bus);
    return out;
  }

  private apply() {
    const out = this.setup();
    if (!out || !this.gain) return;
    const { ctx } = out;
    const now = ctx.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(this.want ? 1 : 0, now, this.want ? 0.6 : 0.35);
    if (this.want && !this.timer) {
      if (!this.notes.length) this.load(this.piece);
      // Resume where it paused: shift the timeline so the next note plays shortly.
      const next = this.notes[this.index]?.[0] ?? 0;
      this.origin = now + 0.3 - next;
      this.timer = setInterval(() => this.pump(), 60);
    } else if (!this.want && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private load(i: number) {
    const p = PIECES[i % PIECES.length]();
    this.notes = p.notes.slice().sort((a, b) => a[0] - b[0]);
    this.index = 0;
    this.length = p.length;
  }
  private length = 0;

  /** Schedules the notes falling in the next 250 ms. */
  private pump() {
    const out = audio.musicOut();
    if (!out || !this.gain) return;
    const { ctx } = out;
    const horizon = ctx.currentTime + 0.25;
    while (this.index < this.notes.length && this.origin + this.notes[this.index][0] < horizon) {
      const [t, midi, dur, vel] = this.notes[this.index++];
      this.play(ctx, Math.max(ctx.currentTime, this.origin + t), midi, dur, vel);
    }
    if (this.index >= this.notes.length && ctx.currentTime > this.origin + this.length) {
      // A breath between pieces, then the next one.
      this.piece = (this.piece + 1) % PIECES.length;
      this.load(this.piece);
      this.origin = ctx.currentTime + 2.5;
    }
  }

  /** One piano note: a few partials with a hammer-like attack and a pitch-dependent decay. */
  private play(ctx: AudioContext, t: number, midi: number, dur: number, vel: number) {
    const f = hz(midi);
    const env = ctx.createGain();
    const decay = Math.max(0.5, 2.6 - (midi - 36) * 0.035);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel * 0.32, t + 0.006);
    env.gain.setTargetAtTime(0, t + 0.006, decay / 3);
    const release = t + Math.max(dur, 0.12);
    env.gain.setTargetAtTime(0, release, 0.12);
    env.connect(this.gain!);
    const partials: [number, number, OscillatorType][] = [
      [1, 1, 'sine'],
      [2, 0.32, 'sine'],
      [3, 0.12, 'triangle'],
      [4, 0.05, 'sine'],
    ];
    for (const [k, g, type] of partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * k * (1 + (k - 1) * 0.0006);
      const pg = ctx.createGain();
      pg.gain.value = g;
      o.connect(pg).connect(env);
      o.start(t);
      o.stop(release + 0.8);
    }
  }
}

export const music = new Music();
