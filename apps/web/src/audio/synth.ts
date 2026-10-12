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
  | 'discard';

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
    case 'causeway':
      tone(ctx, out, t, 190, 0.12, 0.35, 'triangle', 0.002, 120);
      burst(ctx, out, t, 0.06, 0.25, 'bandpass', 900, undefined, 2);
      tone(ctx, out, t + 0.09, 230, 0.08, 0.2, 'triangle', 0.002, 150);
      break;
    case 'outpost':
      tone(ctx, out, t, 95, 0.35, 0.55, 'sine', 0.002, 45);
      burst(ctx, out, t, 0.15, 0.3, 'lowpass', 600);
      burst(ctx, out, t + 0.08, 0.45, 0.18, 'bandpass', 400, 2400, 0.8);
      break;
    case 'citadel':
      bell(ctx, out, t, 98, 3.2, 0.32);
      tone(ctx, out, t, 49, 1.2, 0.3, 'sine', 0.01);
      break;
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
    case 'discard':
      burst(ctx, out, t, 0.18, 0.2, 'bandpass', 1200, 300, 1);
      break;
  }
}

/** Ambient bed: low drone, wind, sparse crows and fire crackle, plus a slow choir-ish pad. */
export function startAmbientSynth(ctx: AudioContext, out: AudioNode): () => void {
  const nodes: AudioScheduledSourceNode[] = [];
  const timers: number[] = [];

  // Drone
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.06;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 180;
  lp.connect(droneGain).connect(out);
  for (const [f, det] of [
    [55, 0],
    [55, 7],
    [82.4, -5],
  ]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = det;
    o.connect(lp);
    o.start();
    nodes.push(o);
  }
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 60;
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start();
  nodes.push(lfo);

  // Wind
  const wind = ctx.createBufferSource();
  wind.buffer = noise(ctx);
  wind.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = 'bandpass';
  wf.frequency.value = 500;
  wf.Q.value = 0.7;
  const wg = ctx.createGain();
  wg.gain.value = 0.035;
  wind.connect(wf).connect(wg).connect(out);
  wind.start();
  nodes.push(wind);
  const wlfo = ctx.createOscillator();
  wlfo.frequency.value = 0.08;
  const wlg = ctx.createGain();
  wlg.gain.value = 300;
  wlfo.connect(wlg).connect(wf.frequency);
  wlfo.start();
  nodes.push(wlfo);

  // Sparse pad (dark-folk / choir-ish): slow chords every ~12s
  const padChords = [
    [110, 130.81, 164.81],
    [98, 116.54, 146.83],
    [87.31, 110, 130.81],
    [82.41, 98, 123.47],
  ];
  let ci = 0;
  const pad = () => {
    const t = ctx.currentTime;
    for (const f of padChords[ci++ % padChords.length]) {
      for (const mult of [1, 2]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f * mult;
        o.detune.value = (Math.random() - 0.5) * 10;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.012 / mult, t + 3);
        g.gain.linearRampToValueAtTime(0.0001, t + 10);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 10.2);
      }
    }
  };
  pad();
  timers.push(window.setInterval(pad, 12000));

  // Crows & crackle
  const crow = () => {
    const t = ctx.currentTime;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      burst(ctx, out, t + i * 0.32, 0.18, 0.025, 'bandpass', 1400 + Math.random() * 300, 900, 9);
    }
  };
  const crackle = () => {
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      burst(ctx, out, t + Math.random() * 0.8, 0.012, 0.03, 'highpass', 3000);
    }
  };
  timers.push(window.setInterval(() => Math.random() < 0.35 && crow(), 7000));
  timers.push(window.setInterval(crackle, 1300));

  return () => {
    timers.forEach((id) => clearInterval(id));
    for (const n of nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    droneGain.disconnect();
    wg.disconnect();
  };
}
