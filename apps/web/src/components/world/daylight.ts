import * as THREE from 'three';
import { daylight } from './daytime';

// The 3D walk's light for each hour of the day; the clock itself is in daytime.ts.

interface Key {
  h: number;
  zenith: string;
  upper: string;
  horizon: string;
  glow: string;
  light: string;
  intensity: number;
  env: number;
  exposure: number;
  cloudLit: string;
  cloudShade: string;
}

// Early Chapter 1 reference: warm keys, blue skylight and lavender twilight.
// Original colors, applied through lighting rather than a global color filter.
const KEYS: Key[] = [
  {
    h: 0,
    zenith: '#050a1c',
    upper: '#0d1834',
    horizon: '#1d2a48',
    glow: '#2b3a66',
    light: '#9fb6ff',
    intensity: 0.8,
    env: 0.65,
    exposure: 1.0,
    cloudLit: '#3a4566',
    cloudShade: '#141b30',
  },
  {
    h: 4.5,
    zenith: '#0a1430',
    upper: '#1b2850',
    horizon: '#3a3f63',
    glow: '#5a4a6a',
    light: '#a9b8ff',
    intensity: 0.7,
    env: 0.65,
    exposure: 1.0,
    cloudLit: '#4d5170',
    cloudShade: '#1d2238',
  },
  {
    h: 6,
    zenith: '#3a5f9c',
    upper: '#8a9cc8',
    horizon: '#f2b98f',
    glow: '#ffb070',
    light: '#ffc58f',
    intensity: 1.95,
    env: 0.85,
    exposure: 1.05,
    cloudLit: '#ffd9b8',
    cloudShade: '#8a7d99',
  },
  {
    h: 9,
    zenith: '#2c6cc0',
    upper: '#6aa6e4',
    horizon: '#d4e4ee',
    glow: '#ffe8c4',
    light: '#fff0d8',
    intensity: 2.75,
    env: 1.1,
    exposure: 1.05,
    cloudLit: '#fffaf0',
    cloudShade: '#a2b2c8',
  },
  {
    h: 13,
    zenith: '#287ac7',
    upper: '#78b4e6',
    horizon: '#d4e6ee',
    glow: '#fff0d0',
    light: '#fff0d6',
    intensity: 2.8,
    env: 1.12,
    exposure: 1.05,
    cloudLit: '#fffaf0',
    cloudShade: '#9fb0c8',
  },
  {
    h: 16.5,
    zenith: '#2d68b4',
    upper: '#7aa8d8',
    horizon: '#e8dcc4',
    glow: '#ffd29a',
    light: '#ffe3b5',
    intensity: 2.75,
    env: 1.05,
    exposure: 1.05,
    cloudLit: '#fff2dc',
    cloudShade: '#a8a8bc',
  },
  {
    h: 18.3,
    zenith: '#34507e',
    upper: '#b0789a',
    horizon: '#ff9c5c',
    glow: '#ffb566',
    light: '#ffc489',
    intensity: 1.95,
    env: 0.85,
    exposure: 1.08,
    cloudLit: '#ffb27a',
    cloudShade: '#7a5a78',
  },
  {
    h: 20.2,
    zenith: '#141e44',
    upper: '#3a3466',
    horizon: '#8a5a6a',
    glow: '#b0604a',
    light: '#bdbeed',
    intensity: 0.8,
    env: 0.65,
    exposure: 1.02,
    cloudLit: '#7a5a78',
    cloudShade: '#2a2440',
  },
];

/** Interpolated look for an hour (wrapping round midnight). */
function sample(hour: number) {
  hour = ((hour % 24) + 24) % 24;
  const ks = KEYS;
  let i = ks.length - 1;
  while (i > 0 && ks[i].h > hour) i--;
  const a = ks[i];
  const b = ks[(i + 1) % ks.length];
  const span = (b.h <= a.h ? b.h + 24 : b.h) - a.h;
  const t = THREE.MathUtils.clamp((hour - a.h + (hour < a.h ? 24 : 0)) / span, 0, 1);
  const c = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    zenith: c(a.zenith, b.zenith),
    upper: c(a.upper, b.upper),
    horizon: c(a.horizon, b.horizon),
    glow: c(a.glow, b.glow),
    light: c(a.light, b.light),
    intensity: n(a.intensity, b.intensity),
    env: n(a.env, b.env),
    exposure: n(a.exposure, b.exposure),
    cloudLit: c(a.cloudLit, b.cloudLit),
    cloudShade: c(a.cloudShade, b.cloudShade),
  };
}

/**
 * Light for an hour: where the sun (or, at night, the moon) is, its colour and strength, the
 * sky's colours, the fill light's strength and the exposure.
 */
export function lightAt(hour: number) {
  hour = ((hour % 24) + 24) % 24;
  const k = sample(hour);
  const day = daylight(hour);
  const sunAngle = ((hour - 6) / 12) * Math.PI;
  const sun = new THREE.Vector3(
    Math.cos(sunAngle),
    Math.max(0.12, Math.sin(sunAngle)),
    0.55,
  ).normalize();
  // A continuous handover avoids the old dawn/dusk shadow-direction jump.
  const moon = new THREE.Vector3(-0.4, 0.75, 0.55).normalize();
  const dir = moon.lerp(sun, THREE.MathUtils.smoothstep(day, 0, 0.7)).normalize();
  // Fill is softer than the visible sky. Night has cool bounce, never the meadow's noon tint.
  const fillSky = new THREE.Color('#526eab').lerp(new THREE.Color('#88b4e2'), day);
  const fillHorizon = new THREE.Color('#8a98c6').lerp(new THREE.Color('#d4e0ea'), day);
  const fillGround = new THREE.Color('#44445b').lerp(new THREE.Color('#8b8966'), day);
  const twilight = 1 - Math.abs(day * 2 - 1);
  fillHorizon.lerp(k.horizon, twilight * 0.25);
  return { dir, day, ...k, sunColor: k.light, fillSky, fillHorizon, fillGround };
}
