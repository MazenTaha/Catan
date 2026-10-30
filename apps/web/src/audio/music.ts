import { audio } from './engine';

/**
 * Classical music for the menus and the 2D board (DECISIONS #40), synthesized like the sound
 * effects: public-domain keyboard pieces (Bach's Prelude in C, the Minuet in G from the Anna
 * Magdalena notebook, Beethoven's Für Elise) played by a soft WebAudio piano with a little
 * room reverb. No audio files. It pauses with a fade while the 3D walk is open and picks up
 * where it left off when the board returns.
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

/** Prelude in C, BWV 846: each bar's five-note chord broken in the familiar figure, twice. */
function prelude(): Piece {
  const bars = [
    'C4 E4 G4 C5 E5', 'C4 D4 A4 D5 F5', 'B3 D4 G4 D5 F5', 'C4 E4 G4 C5 E5',
    'C4 E4 A4 E5 A5', 'C4 D4 F#4 A4 D5', 'B3 D4 G4 D5 G5', 'B3 C4 E4 G4 C5',
    'A3 C4 E4 G4 C5', 'D3 A3 D4 F#4 C5', 'G3 B3 D4 G4 B4', 'G3 Bb3 E4 G4 C#5',
    'F3 A3 D4 A4 D5', 'F3 Ab3 D4 F4 B4', 'E3 G3 C4 G4 C5', 'E3 F3 A3 C4 F4',
    'D3 F3 A3 C4 F4', 'G2 D3 G3 B3 F4', 'C3 E3 G3 C4 E4', 'C3 G3 Bb3 C4 E4',
    'F2 F3 A3 C4 E4', 'F#2 C3 A3 C4 Eb4', 'Ab2 F3 B3 C4 D4', 'G2 F3 G3 B3 D4',
    'G2 E3 G3 C4 E4', 'G2 D3 G3 C4 F4', 'G2 D3 G3 B3 F4', 'G2 Eb3 A3 C4 F#4',
    'G2 E3 G3 C4 G4', 'G2 D3 G3 C4 F4', 'G2 D3 G3 B3 F4', 'C2 C3 G3 Bb3 E4',
  ];
  const s = 0.23;
  const notes: Note[] = [];
  bars.forEach((bar, b) => {
    const c = bar.split(' ').map(m);
    for (let half = 0; half < 2; half++) {
      const t0 = (b * 16 + half * 8) * s;
      // The bass and tenor are held under the figure; the upper three repeat.
      notes.push([t0, c[0], 8 * s, 0.5], [t0 + s, c[1], 7 * s, 0.42]);
      [2, 3, 4, 2, 3, 4].forEach((k, i) => notes.push([t0 + (2 + i) * s, c[k], s * 1.6, 0.36 + (k === 4 ? 0.04 : 0)]));
    }
  });
  const end = bars.length * 16 * s;
  for (const [i, n] of ['C2', 'C3', 'E3', 'G3', 'C4', 'E4'].entries()) notes.push([end + i * 0.05, m(n), 3.5, 0.4]);
  return { name: 'Prelude in C', notes, length: end + 4 };
}

/** Minuet in G (BWV Anh. 114): the A section, twice, with its walking bass. */
function minuet(): Piece {
  const q = 0.5;
  // [note, beats] per voice; '-' is a rest.
  const rh: [string, number][] = [
    ['D5', 1], ['G4', 0.5], ['A4', 0.5], ['B4', 0.5], ['C5', 0.5],
    ['D5', 1], ['G4', 1], ['G4', 1],
    ['E5', 1], ['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['F#5', 0.5],
    ['G5', 1], ['G4', 1], ['G4', 1],
    ['C5', 1], ['D5', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5],
    ['B4', 1], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 0.5],
    ['F#4', 1], ['G4', 0.5], ['A4', 0.5], ['B4', 0.5], ['G4', 0.5],
    ['A4', 3],
    ['D5', 1], ['G4', 0.5], ['A4', 0.5], ['B4', 0.5], ['C5', 0.5],
    ['D5', 1], ['G4', 1], ['G4', 1],
    ['E5', 1], ['C5', 0.5], ['D5', 0.5], ['E5', 0.5], ['F#5', 0.5],
    ['G5', 1], ['G4', 1], ['G4', 1],
    ['C5', 1], ['D5', 0.5], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5],
    ['B4', 1], ['C5', 0.5], ['B4', 0.5], ['A4', 0.5], ['G4', 0.5],
    ['A4', 1], ['B4', 0.5], ['A4', 0.5], ['G4', 0.5], ['F#4', 0.5],
    ['G4', 3],
  ];
  const lh: [string, number][] = [
    ['G3', 2], ['A3', 1], ['B3', 3], ['C4', 3], ['B3', 3], ['A3', 3], ['G3', 3],
    ['D4', 1], ['B3', 1], ['G3', 1], ['D4', 1], ['D3', 0.5], ['C4', 0.5], ['B3', 0.5], ['A3', 0.5],
    ['B3', 2], ['A3', 1], ['G3', 1], ['B3', 1], ['G3', 1], ['C4', 3],
    ['B3', 1], ['C4', 0.5], ['B3', 0.5], ['A3', 0.5], ['G3', 0.5],
    ['A3', 2], ['F#3', 1], ['G3', 2], ['B3', 1], ['C4', 1], ['D4', 1], ['D3', 1], ['G3', 2], ['G2', 1],
  ];
  const notes: Note[] = [];
  const voice = (v: [string, number][], vel: number, offset: number) => {
    let t = offset;
    for (const [n, beats] of v) {
      if (n !== '-') notes.push([t, m(n), beats * q * 0.95, vel]);
      t += beats * q;
    }
    return t;
  };
  let end = 0;
  for (let rep = 0; rep < 2; rep++) {
    const at = rep * 48 * q;
    end = Math.max(voice(rh, 0.42, at), voice(lh, 0.3, at));
  }
  return { name: 'Minuet in G', notes, length: end + 2 };
}

/** Für Elise (WoO 59): the famous opening section, twice. */
function furElise(): Piece {
  const s = 0.19;
  const notes: Note[] = [];
  let t = 0;
  const run = (names: string, vel = 0.4) => {
    for (const n of names.split(' ')) {
      notes.push([t, m(n), s * 1.8, vel]);
      t += s;
    }
  };
  // A bar of the left-hand broken chord under a held right-hand note, then three more notes.
  const arp = (top: string, bass: string, rhAfter: string) => {
    const [b1, b2, b3] = bass.split(' ');
    notes.push([t, m(top), s * 2.6, 0.42]);
    notes.push([t, m(b1), s * 3, 0.3], [t + s, m(b2), s * 2, 0.26], [t + 2 * s, m(b3), s * 1.5, 0.26]);
    t += 3 * s;
    run(rhAfter, 0.36);
  };
  for (let rep = 0; rep < 2; rep++) {
    run('E5 D#5');
    run('E5 D#5 E5 B4 D5 C5');
    arp('A4', 'A2 E3 A3', 'C4 E4 A4');
    arp('B4', 'E2 E3 G#3', 'E4 G#4 B4');
    arp('C5', 'A2 E3 A3', 'E4 E5 D#5');
    run('E5 D#5 E5 B4 D5 C5');
    arp('A4', 'A2 E3 A3', 'C4 E4 A4');
    arp('B4', 'E2 E3 G#3', 'E4 C5 B4');
    notes.push([t, m('A4'), s * 6, 0.44], [t, m('A2'), s * 6, 0.3], [t + s, m('E3'), s * 5, 0.26], [t + 2 * s, m('A3'), s * 4, 0.26]);
    t += 6 * s;
  }
  return { name: 'Für Elise', notes, length: t + 2 };
}

const PIECES = [prelude, minuet, furElise];

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
