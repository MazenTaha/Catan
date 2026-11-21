// Renders the Hall & Chart art to PNGs for the Unreal UI (Slate loads them by path).
//
//   node apps/catnight/Tools/render_ui.mjs
//
// Sources: the Hall & Chart kit's SVGs (design/hall-chart/assets, the owner's design pack), the
// web game's sigil shapes and card illustrations. Uses the repo's pinned Playwright Chromium to
// rasterise at 2x (menu banners 3x), sharp up to 4K. Output: apps/catnight/Content/Slate/HallKit.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const kit = join(repo, 'design/hall-chart/assets');
const out = join(repo, 'apps/catnight/Content/Slate/HallKit');
const require = createRequire(join(repo, 'apps/web/package.json'));
const { chromium } = require('@playwright/test');
// 2x is enough for most art at 4K; the large menu banners get 3x.
const scaleFor = (name) => (name.startsWith('banners/menu-') ? 3 : 2);

for (const d of ['', 'banners', 'arms', 'ornaments', 'dice', 'cards', 'textures', 'fx']) mkdirSync(join(out, d), { recursive: true });

// --- colours -------------------------------------------------------------------------------
const PLAYER = { crimson: '#c4302b', frost: '#3f7fd4', bone: '#e8e2d0', violet: '#e8842c' };
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
// Banner cloth: the player colour about 15 % darker (Hall & Chart rule), and a deeper middle fold.
const CLOTH = Object.fromEntries(Object.entries(PLAYER).map(([k, v]) => [k, [shade(v, 0.85), shade(v, 0.7)]]));
const TINCTURE = { gules: '#8a1a16', azure: '#1f3a7a', vert: '#24543a', sable: '#1f1b18', purpure: '#4f2560' };

// --- sigils (apps/web/src/art/pieces/Sigil.tsx, 20x20 box) ----------------------------------
const SIGIL = {
  skull: 'M10 2.5a6.5 6.5 0 0 0-6.5 6.5c0 2.1 1 3.6 2.5 4.6V16h8v-2.4c1.5-1 2.5-2.5 2.5-4.6A6.5 6.5 0 0 0 10 2.5zM7.3 8.2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm5.4 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM9 12.4h2l-1 1.6zM8 16v1.5h1V16zm3 0v1.5h1V16z',
  moon: 'M12.5 2.6a7.5 7.5 0 1 0 4.9 12.3A6 6 0 0 1 12.5 2.6z',
  eye: 'M10 5C5.5 5 2 10 2 10s3.5 5 8 5 8-5 8-5-3.5-5-8-5zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6zM10 8.8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4z',
  thorn: 'M10 1.5 12 7l5.5-1.5L13.5 10l4 4.5L12 13l-2 5.5L8 13l-5.5 1.5L6.5 10 2.5 5.5 8 7z',
};

const SHIELD = 'M2 2 H118 V63.7 C118 110.4 86.4 130.3 60 139.6 C33.6 130.3 2 110.4 2 63.7 Z';
function arms(color, sigil) {
  const field = PLAYER[color];
  const charge = color === 'bone' ? '#7a1912' : '#f3d27a';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 128 150" width="128" height="150">
  <defs>
    <linearGradient id="lit" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d77e"/><stop offset=".45" stop-color="#c9962f"/><stop offset=".7" stop-color="#f0cf6e"/><stop offset="1" stop-color="#9c6d1c"/></linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .18 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <clipPath id="c"><path d="${SHIELD}"/></clipPath>
  </defs>
  <path d="${SHIELD}" fill="#000" opacity=".45" transform="translate(3,5)"/>
  <path d="${SHIELD}" fill="${field}"/>
  <g clip-path="url(#c)"><rect x="0" y="0" width="120" height="142" filter="url(#grain)" fill="#000"/><rect width="120" height="142" fill="url(#lit)"/></g>
  <path d="${SIGIL[sigil]}" fill="${charge}" stroke="#1a120b" stroke-width=".35" fill-rule="evenodd" transform="translate(60,64) scale(3.3) translate(-10,-10)"/>
  <path d="${SHIELD}" fill="none" stroke="url(#gold)" stroke-width="6"/>
  <path d="${SHIELD}" fill="none" stroke="#1a120b" stroke-width="1.2"/>
</svg>`;
}

// Soft effects drawn as SVG.
const FX = {
  glow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs><radialGradient id="g"><stop offset="0" stop-color="#ffb04a" stop-opacity=".9"/><stop offset=".35" stop-color="#ff9a3a" stop-opacity=".35"/><stop offset="1" stop-color="#ff9a3a" stop-opacity="0"/></radialGradient></defs><rect width="256" height="256" fill="url(#g)"/></svg>`,
  moonglow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs><radialGradient id="g"><stop offset="0" stop-color="#b9cdf0" stop-opacity=".6"/><stop offset="1" stop-color="#b9cdf0" stop-opacity="0"/></radialGradient></defs><rect width="256" height="256" fill="url(#g)"/></svg>`,
  shadow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter></defs><rect x="28" y="28" width="72" height="72" rx="6" fill="#000" opacity=".75" filter="url(#b)"/></svg>`,
  vignette: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" preserveAspectRatio="none"><defs><radialGradient id="v" cx=".5" cy=".45" r=".75"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".85"/></radialGradient></defs><rect width="512" height="512" fill="url(#v)"/></svg>`,
  ring: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="28" fill="none" stroke="#f3d27a" stroke-width="3"/><circle cx="32" cy="32" r="31" fill="none" stroke="#ffb04a" stroke-opacity=".35" stroke-width="2"/></svg>`,
};

// Engraved icon family (100x100): gold with a dark cut line, the one style for every icon
// (docs/CATNIGHT_UI_PLAN.md §4.5). Paths are original.
const ICON = {
  crown: 'M14 72 L19 32 L36 50 L50 20 L64 50 L81 32 L86 72 Z M14 77 H86 V87 H14 Z',
  book: 'M50 28 C40 21 25 21 12 26 V78 C25 73 40 73 50 80 C60 73 75 73 88 78 V26 C75 21 60 21 50 28 Z M47 32 V74 H53 V32 Z',
  key: 'M34 36 A15 15 0 1 0 34 66 A15 15 0 1 0 34 36 Z M34 44 A7 7 0 1 1 34 58 A7 7 0 1 1 34 44 Z M47 47 H90 V55 H84 V66 H76 V55 H68 V63 H61 V55 H47 Z',
  hourglass: 'M28 14 H72 V22 C72 38 57 45 57 50 C57 55 72 62 72 78 V86 H28 V78 C28 62 43 55 43 50 C43 45 28 38 28 22 Z M36 76 H64 C64 70 54 64 50 62 C46 64 36 70 36 76 Z',
  scroll: 'M22 20 H70 C78 20 82 26 82 32 V76 C82 84 76 88 70 88 H30 C22 88 18 82 18 76 V70 H62 V76 C62 80 66 82 70 82 C74 82 76 79 76 76 V32 C76 29 74 26 70 26 H28 V64 H22 Z M34 36 H68 V41 H34 Z M34 47 H68 V52 H34 Z M34 58 H58 V63 H34 Z',
  undo: 'M40 18 L14 40 L40 62 V48 C60 46 74 54 80 80 C88 50 72 30 40 32 Z',
  door: 'M24 88 V26 C24 16 34 10 50 10 C66 10 76 16 76 26 V88 Z M32 80 H68 V28 C68 22 60 18 50 18 C40 18 32 22 32 28 Z M58 50 A4 4 0 1 1 58 58 A4 4 0 1 1 58 50 Z',
  hex: 'M50 10 L86 30 V70 L50 90 L14 70 V30 Z M50 22 L24 37 V63 L50 78 L76 63 V37 Z',
  eye: 'M50 28 C28 28 12 50 12 50 C12 50 28 72 50 72 C72 72 88 50 88 50 C88 50 72 28 50 28 Z M50 38 A12 12 0 1 1 50 62 A12 12 0 1 1 50 38 Z',
};
function icon(path) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dc93"/><stop offset=".5" stop-color="#d9a93f"/><stop offset="1" stop-color="#8a6018"/></linearGradient></defs>
  <path d="${path}" fill="#000" opacity=".5" transform="translate(2,3)" fill-rule="evenodd"/>
  <path d="${path}" fill="url(#g)" stroke="#1a120b" stroke-width="3" stroke-linejoin="round" fill-rule="evenodd"/>
</svg>`;
}
const ROUNDEL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d77e"/><stop offset=".45" stop-color="#c9962f"/><stop offset=".7" stop-color="#f0cf6e"/><stop offset="1" stop-color="#9c6d1c"/></linearGradient>
  <radialGradient id="d" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#2e2823"/><stop offset="1" stop-color="#120d0a"/></radialGradient></defs>
  <circle cx="62" cy="63" r="55" fill="#000" opacity=".45"/>
  <circle cx="60" cy="60" r="54" fill="url(#d)" stroke="url(#b)" stroke-width="7"/>
  <circle cx="60" cy="60" r="44" fill="none" stroke="#d9a93f" stroke-width="1.5" stroke-dasharray="3 4"/>
  <circle cx="60" cy="60" r="57.5" fill="none" stroke="#1a120b" stroke-width="1.5"/>
</svg>`;

// --- jobs ----------------------------------------------------------------------------------
const jobs = [];
const svgFile = (p) => readFileSync(join(kit, p), 'utf8');
const add = (name, svg) => jobs.push({ name, svg });

for (const f of ['play', 'continue', 'settings', 'how-to-play', 'character', 'my-kingdom']) add(`banners/menu-${f}`, svgFile(`banners/banner-${f}.svg`));
for (const [k] of Object.entries(TINCTURE)) add(`banners/plain-${k}`, svgFile(`banners/banner-plain-${k}.svg`));
const template = svgFile('banners/banner-player-1-template.svg');
for (const [k, [cloth, fold]] of Object.entries(CLOTH)) add(`banners/player-${k}`, template.replaceAll('#8a1a16', cloth).replaceAll('#6e1210', fold));
for (const c of Object.keys(PLAYER)) for (const s of Object.keys(SIGIL)) add(`arms/${c}-${s}`, arms(c, s));
for (const f of ['banner-pole-800', 'candle', 'coin-stack', 'compass-rose', 'crest', 'iron-corner', 'night-window', 'ribbon-label', 'ribbon-title', 'scale-bar-meter', 'scroll-frame-600x400', 'spear-finial', 'stone-column', 'torch', 'wax-seal-small', 'wax-seal']) add(`ornaments/${f}`, svgFile(`ornaments/${f}.svg`));
for (let i = 1; i <= 6; i++) add(`dice/die-${i}`, svgFile(`dice/bone-die-${i}.svg`));
for (const f of ['fleur', 'lion', 'star', 'tower']) add(`ornaments/charge-${f}`, svgFile(`heraldry/charge-${f}.svg`));
for (const [k, v] of Object.entries(FX)) add(`fx/${k}`, v);
mkdirSync(join(out, 'icons'), { recursive: true });
for (const [k, v] of Object.entries(ICON)) add(`icons/${k}`, icon(v));
add('ornaments/roundel', ROUNDEL);

function size(svg) {
  const m = svg.match(/viewBox="([-\d.]+)[ ,]+([-\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)"/);
  return m ? [Number(m[3]), Number(m[4])] : [256, 256];
}

const browser = await chromium.launch();
const pages = { 2: await browser.newPage({ deviceScaleFactor: 2 }), 3: await browser.newPage({ deviceScaleFactor: 3 }) };
const page = pages[2];
for (const { name, svg } of jobs) {
  const pg = pages[scaleFor(name)];
  const [w, h] = size(svg);
  const sized = svg.replace(/<svg([^>]*?)>/, (m, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="${w}" height="${h}">`);
  await pg.setViewportSize({ width: Math.ceil(w), height: Math.ceil(h) });
  await pg.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  const png = await pg.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: Math.ceil(w), height: Math.ceil(h) } });
  writeFileSync(join(out, `${name}.png`), png);
}

// Card illustrations: webp to png (Slate's image loader has no webp).
const cards = join(repo, 'apps/web/public/art/cards');
for (const f of ['wood', 'clay', 'wool', 'grain', 'ore', 'warden', 'relic', 'decree', 'harvest', 'tithe', 'manup']) {
  const b64 = readFileSync(join(cards, `${f}.webp`)).toString('base64');
  await page.setViewportSize({ width: 10, height: 10 });
  await page.setContent(`<img id="i" src="data:image/webp;base64,${b64}">`);
  const dims = await page.$eval('#i', async (img) => {
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  });
  const p2 = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: dims[0], height: dims[1] } });
  await p2.setContent(`<body style="margin:0"><img src="data:image/webp;base64,${b64}" style="display:block"></body>`);
  writeFileSync(join(out, `cards/${f}.png`), await p2.screenshot({ clip: { x: 0, y: 0, width: dims[0], height: dims[1] } }));
  await p2.close();
}
await browser.close();

for (const f of ['parchment', 'vellum', 'letter-paper', 'oak-tile', 'stone-wall-tile']) {
  const src = join(kit, `textures/${f}.png`);
  if (existsSync(src)) copyFileSync(src, join(out, `textures/${f}.png`));
}
console.log(`[ui] ${jobs.length} images + 11 cards + textures -> ${out}`);
