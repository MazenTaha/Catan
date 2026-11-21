// Renders the web game's synthesized sounds (apps/web/src/audio/synth.ts) to WAV for the Unreal
// game, plus the Hall & Chart UI foley (docs/CATNIGHT_UI_PLAN.md §4.7) written with the same
// helpers. The recipes run unchanged in the repo's Playwright Chromium on an OfflineAudioContext.
//
//   node apps/catnight/Tools/render_sfx.mjs
//
// Output: apps/catnight/Content/Slate/Sounds/<name>.wav (16-bit mono, 48 kHz), staged with the
// Slate folder and played by Ui/HallSound.cpp.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const out = join(repo, 'apps/catnight/Content/Slate/Sounds');
const require = createRequire(join(repo, 'apps/web/package.json'));
const { chromium } = require('@playwright/test');
const ts = require('typescript');
mkdirSync(out, { recursive: true });

const RATE = 48000;
// The game's sounds (the web's SOUND_FOR) and how long to render each.
const GAME = {
  dice: 1.2, card: 0.4, collect: 0.6, causeway: 0.8, outpost: 1.2, citadel: 3.0, wraith: 1.6,
  steal: 0.6, trade: 0.7, omen: 1.3, warden: 1.4, tithe: 1.6, turn: 1.8, victory: 5.4,
  error: 0.6, click: 0.3, discard: 0.6, duel: 2.0,
};
// UI foley, in the same style: parchment, brass, wax, cloth (plan §4.7).
const UI = `
function playUi(ctx, out, name) {
  const t = ctx.currentTime + 0.01;
  switch (name) {
    case 'ui-parchment':
      // A sheet unrolled: a few dry, papery swishes rising in pitch.
      [0, 0.06, 0.15].forEach((dt, i) => burst(ctx, out, t + dt, 0.12 + i * 0.03, 0.09 - i * 0.015, 'bandpass', 2400 + i * 700, 5200, 0.9));
      burst(ctx, out, t + 0.02, 0.28, 0.03, 'highpass', 5500);
      break;
    case 'ui-brass':
      // A brass plaque pressed: a short metallic tick with a small ring.
      burst(ctx, out, t, 0.018, 0.16, 'bandpass', 3200, undefined, 4);
      tone(ctx, out, t, 1760, 0.09, 0.05, 'triangle', 0.001);
      tone(ctx, out, t, 2640, 0.06, 0.025, 'sine', 0.001);
      break;
    case 'ui-seal':
      // A wax seal stamped: a soft low thud and a squash.
      tone(ctx, out, t, 120, 0.14, 0.32, 'sine', 0.002, 60);
      burst(ctx, out, t, 0.08, 0.16, 'lowpass', 700, 250);
      burst(ctx, out, t + 0.03, 0.06, 0.04, 'bandpass', 1800, undefined, 2);
      break;
    case 'ui-cloth':
      // A banner stirring: a slow swell of low, soft noise.
      burst(ctx, out, t, 0.35, 0.07, 'lowpass', 600, 1400, 0.7);
      burst(ctx, out, t + 0.12, 0.3, 0.05, 'bandpass', 900, 500, 0.8);
      break;
    case 'ui-tab':
      knock(ctx, out, t, 520, 0.12);
      break;
    case 'ui-horn': {
      // Your turn: a short call on a hunting horn.
      tone(ctx, out, t, 293.7, 0.5, 0.11, 'sawtooth', 0.08);
      tone(ctx, out, t, 294.5, 0.5, 0.08, 'sawtooth', 0.08);
      tone(ctx, out, t + 0.42, 440, 0.8, 0.1, 'sawtooth', 0.06);
      tone(ctx, out, t + 0.42, 441, 0.8, 0.07, 'sawtooth', 0.06);
      break;
    }
  }
}`;
const UI_SOUNDS = { 'ui-parchment': 0.6, 'ui-brass': 0.25, 'ui-seal': 0.4, 'ui-cloth': 0.7, 'ui-tab': 0.25, 'ui-horn': 1.6 };

const source = readFileSync(join(repo, 'apps/web/src/audio/synth.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } })
  .outputText.replace(/^export /gm, '');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><title>sfx</title>');
await page.addScriptTag({ content: js + UI + '\nwindow.playSynth = playSynth; window.playUi = playUi;' });

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const jobs = [...Object.entries(GAME).map(([n, d]) => [n, d, 'playSynth']), ...Object.entries(UI_SOUNDS).map(([n, d]) => [n, d, 'playUi'])];
for (const [name, seconds, fn] of jobs) {
  const samples = await page.evaluate(async ([name, seconds, fn, rate]) => {
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
    window[fn](ctx, ctx.destination, name);
    const buf = await ctx.startRendering();
    return Array.from(buf.getChannelData(0));
  }, [name, seconds, fn, RATE]);
  // Trim the silent tail, keep a 20 ms fade so it never clicks.
  let end = samples.length;
  while (end > 1 && Math.abs(samples[end - 1]) < 2e-4) end--;
  end = Math.min(samples.length, end + Math.round(0.02 * RATE));
  // The quiet UI foley is lifted so it sits with the game sounds (the web plays these louder).
  const gain = { click: 6, 'ui-cloth': 7, 'ui-parchment': 3.5, 'ui-brass': 2.5 }[name] ?? 1;
  const clip = samples.slice(0, end).map((v) => v * gain);
  const fade = Math.min(clip.length, Math.round(0.02 * RATE));
  for (let i = 0; i < fade; i++) clip[clip.length - 1 - i] *= i / fade;
  const peak = clip.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  writeFileSync(join(out, `${name}.wav`), wav(clip));
  console.log(`${name}.wav  ${(clip.length / RATE).toFixed(2)} s  peak ${peak.toFixed(2)}`);
}
await browser.close();
