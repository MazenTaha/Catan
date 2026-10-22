/**
 * Synthesized placeholder sounds (WebAudio). Every SFX in the manifest has a recipe here so
 * the game is never silent-broken when no audio files are present.
 */

export type SfxName =
  | 'dice'
  | 'card'
  | 'collect'
  | 'causeway'
  | 'outpost'
  | 'citadel'
  | 'wraith'
  | 'steal'
  | 'trade'
  | 'omen'
  | 'warden'
  | 'tithe'
  | 'turn'
  | 'victory'
  | 'error'
  | 'click'
  | 'discard'
  | 'bleat';

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

type Out = AudioNode;

function env(ctx: AudioContext, out: Out, t: number, a: number, d: number, peak: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  g.connect(out);
  return g;
}

function tone(
  ctx: AudioContext,
  out: Out,
  t: number,
  freq: number,
  dur: number,
  peak = 0.3,
  type: OscillatorType = 'sine',
  attack = 0.005,
  endFreq?: number,
) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  o.connect(env(ctx, out, t, attack, dur, peak));
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function burst(
  ctx: AudioContext,
  out: Out,
  t: number,
  dur: number,
  peak: number,
  filter: BiquadFilterType,
  freq: number,
  endFreq?: number,
  q = 1,
) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  f.Q.value = q;
  src.connect(f);
  f.connect(env(ctx, out, t, 0.004, dur, peak));
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

function bell(ctx: AudioContext, out: Out, t: number, f: number, dur: number, peak: number) {
  const partials = [1, 2.76, 5.4, 8.93];
  partials.forEach((p, i) => tone(ctx, out, t, f * p, dur / (1 + i * 0.7), peak / (1 + i * 1.6)));
}

/** A brick set down on another: a hard click with a short, low body. */
function brick(ctx: AudioContext, out: Out, t: number, level = 1) {
  burst(ctx, out, t, 0.035, 0.32 * level, 'bandpass', 2200 + Math.random() * 900, undefined, 5);
  burst(ctx, out, t, 0.05, 0.18 * level, 'bandpass', 700 + Math.random() * 200, undefined, 3);
  tone(ctx, out, t, 240 + Math.random() * 40, 0.05, 0.16 * level, 'triangle', 0.001, 150);
}

/** A low impact, like stone or a timber frame settling. */
function thud(ctx: AudioContext, out: Out, t: number, f: number, peak: number) {
  tone(ctx, out, t, f, 0.2, peak, 'sine', 0.002, f * 0.5);
  burst(ctx, out, t, 0.07, peak * 0.4, 'lowpass', 500);
}

/** A hammer on wood: a pitched knock with a little noise on the attack. */
function knock(ctx: AudioContext, out: Out, t: number, f: number, peak: number) {
  tone(ctx, out, t, f, 0.07, peak, 'triangle', 0.001, f * 0.7);
  tone(ctx, out, t, f * 2.3, 0.03, peak * 0.3, 'sine', 0.001);
  burst(ctx, out, t, 0.03, peak * 0.6, 'bandpass', 1600, undefined, 2.5);
}

/** A sheep's "baa": a buzzy nasal tone with a fast wobble, falling at the end. */
function bleat(ctx: AudioContext, out: Out, t: number) {
  const f = 330 + Math.random() * 120;
  const dur = 0.55 + Math.random() * 0.25;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * 1.06, t + dur * 0.3);
  o.frequency.exponentialRampToValueAtTime(f * 0.82, t + dur);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 22 + Math.random() * 6;
  const depth = ctx.createGain();
  depth.gain.value = f * 0.05;
  lfo.connect(depth);
  depth.connect(o.frequency);
  const formant = ctx.createBiquadFilter();
  formant.type = 'bandpass';
  formant.frequency.value = 1100;
  formant.Q.value = 1.4;
  o.connect(formant);
  formant.connect(env(ctx, out, t, 0.06, dur, 0.22));
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.12);
  lfo.stop(t + dur + 0.12);
}

export function playSynth(ctx: AudioContext, out: Out, name: SfxName): void {
  const t = ctx.currentTime + 0.01;
  switch (name) {
    case 'dice': {
      let at = t;
      for (let i = 0; i < 7; i++) {
        burst(ctx, out, at, 0.05, 0.35, 'bandpass', 1800 + Math.random() * 1600, undefined, 3);
        tone(ctx, out, at, 300 + Math.random() * 200, 0.04, 0.08, 'triangle');
        at += 0.045 + i * 0.018;
      }
      tone(ctx, out, at, 120, 0.18, 0.4, 'sine', 0.003, 60);
      break;
    }
    case 'card':
      burst(ctx, out, t, 0.12, 0.25, 'highpass', 2500, 6000);
      break;
    case 'collect':
      tone(ctx, out, t, 1568, 0.25, 0.12, 'triangle');
      tone(ctx, out, t + 0.07, 2093, 0.3, 0.1, 'triangle');
      burst(ctx, out, t, 0.03, 0.08, 'highpass', 5000);
      break;
    case 'causeway': {
      // Road: three hammer blows on a wooden plank, the last one firmest.
      [0, 0.13, 0.25].forEach((dt, i) => knock(ctx, out, t + dt + Math.random() * 0.015, 380 + Math.random() * 60, i === 2 ? 0.42 : 0.3));
      burst(ctx, out, t + 0.32, 0.12, 0.05, 'bandpass', 2400, 1200, 2);
      break;
    }
    case 'outpost': {
      // Settlement: bricks laid quickly one on another, a trowel scrape, then a settling thump.
      let at = t;
      for (let i = 0; i < 5; i++) {
        brick(ctx, out, at, 0.85 + i * 0.05);
        at += 0.085 + Math.random() * 0.03;
      }
      burst(ctx, out, at + 0.02, 0.16, 0.07, 'bandpass', 1500, 3800, 2.5);
      thud(ctx, out, at + 0.2, 110, 0.4);
      break;
    }
    case 'citadel': {
      // City: heavy stone blocks set in place, a run of bricks, then a bell from the new tower.
      [0, 0.22, 0.42].forEach((dt) => {
        thud(ctx, out, t + dt, 80, 0.55);
        burst(ctx, out, t + dt, 0.09, 0.2, 'lowpass', 900);
        brick(ctx, out, t + dt + 0.02, 0.7);
      });
      for (let i = 0; i < 4; i++) brick(ctx, out, t + 0.62 + i * 0.07, 0.7);
      bell(ctx, out, t + 0.95, 196, 1.8, 0.22);
      break;
    }
    case 'wraith':
      burst(ctx, out, t, 1.1, 0.22, 'bandpass', 500, 1800, 6);
      burst(ctx, out, t + 0.2, 0.9, 0.15, 'bandpass', 1600, 400, 8);
      tone(ctx, out, t + 0.5, 622, 0.6, 0.06, 'sawtooth', 0.05);
      tone(ctx, out, t + 0.5, 659, 0.6, 0.06, 'sawtooth', 0.05);
      break;
    case 'steal':
      burst(ctx, out, t, 0.22, 0.35, 'bandpass', 3000, 700, 1.5);
      burst(ctx, out, t + 0.1, 0.15, 0.25, 'highpass', 1800, 4000);
      break;
    case 'trade':
      tone(ctx, out, t, 1318, 0.2, 0.12, 'triangle');
      tone(ctx, out, t + 0.1, 1760, 0.35, 0.12, 'triangle');
      tone(ctx, out, t, 220, 0.12, 0.2, 'sine', 0.003, 160);
      break;
    case 'omen': {
      // Development card: a card slid off the deck, then a soft chime.
      burst(ctx, out, t, 0.16, 0.22, 'highpass', 1800, 7000, 0.8);
      const notes = [880, 1108, 1318, 1760];
      notes.forEach((f, i) => tone(ctx, out, t + i * 0.07, f, 0.8, 0.07, 'sine', 0.02));
      burst(ctx, out, t, 0.9, 0.05, 'highpass', 6000);
      break;
    }
    case 'warden':
      burst(ctx, out, t, 0.35, 0.3, 'highpass', 1500, 7000, 2);
      tone(ctx, out, t + 0.28, 2217, 0.9, 0.08, 'sine');
      tone(ctx, out, t + 0.28, 3322, 0.6, 0.04, 'sine');
      break;
    case 'tithe':
      tone(ctx, out, t, 62, 0.18, 0.6, 'sine', 0.004, 40);
      tone(ctx, out, t + 0.22, 58, 0.25, 0.5, 'sine', 0.004, 36);
      tone(ctx, out, t + 0.9, 62, 0.18, 0.45, 'sine', 0.004, 40);
      tone(ctx, out, t + 1.12, 58, 0.25, 0.4, 'sine', 0.004, 36);
      break;
    case 'turn':
      bell(ctx, out, t, 392, 1.6, 0.16);
      break;
    case 'victory': {
      const chord = [220, 261.63, 329.63, 440, 523.25];
      chord.forEach((f, i) => {
        for (const det of [-4, 4]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = det;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(400, t);
          lp.frequency.linearRampToValueAtTime(2200, t + 2.5);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.035, t + 1.2 + i * 0.15);
          g.gain.linearRampToValueAtTime(0.0001, t + 5);
          o.connect(lp).connect(g).connect(out);
          o.start(t);
          o.stop(t + 5.1);
        }
      });
      bell(ctx, out, t + 0.1, 196, 4, 0.25);
      break;
    }
    case 'error':
      tone(ctx, out, t, 110, 0.15, 0.12, 'square', 0.005, 90);
      break;
    case 'click':
      burst(ctx, out, t, 0.02, 0.12, 'bandpass', 2600, undefined, 4);
      break;
    case 'bleat':
      bleat(ctx, out, t);
      break;
    case 'discard':
      burst(ctx, out, t, 0.18, 0.2, 'bandpass', 1200, 300, 1);
      break;
  }
}
