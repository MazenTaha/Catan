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

// Midday matches the walk's original look; the others are painted to the same palette.
const KEYS: Key[] = [
  { h: 0, zenith: '#050a1c', upper: '#0d1834', horizon: '#1d2a48', glow: '#2b3a66', light: '#9fb6ff', intensity: 0.55, env: 0.22, exposure: 1.0, cloudLit: '#3a4566', cloudShade: '#141b30' },
  { h: 4.5, zenith: '#0a1430', upper: '#1b2850', horizon: '#3a3f63', glow: '#5a4a6a', light: '#a9b8ff', intensity: 0.5, env: 0.25, exposure: 1.0, cloudLit: '#4d5170', cloudShade: '#1d2238' },
  { h: 6, zenith: '#3a5f9c', upper: '#8a9cc8', horizon: '#f2b98f', glow: '#ffb070', light: '#ffc58f', intensity: 2.0, env: 0.55, exposure: 1.05, cloudLit: '#ffd9b8', cloudShade: '#8a7d99' },
  { h: 9, zenith: '#2c6cc0', upper: '#6aa6e4', horizon: '#d4e4ee', glow: '#ffe8c4', light: '#fff0d8', intensity: 3.1, env: 0.82, exposure: 1.05, cloudLit: '#fffaf0', cloudShade: '#a2b2c8' },
  { h: 13, zenith: '#2f73c4', upper: '#6eaae6', horizon: '#cfe2ee', glow: '#ffe2b4', light: '#ffe2b8', intensity: 3.3, env: 0.85, exposure: 1.05, cloudLit: '#fffaf0', cloudShade: '#9fb0c8' },
  { h: 16.5, zenith: '#2d68b4', upper: '#7aa8d8', horizon: '#e8dcc4', glow: '#ffd29a', light: '#ffd9a8', intensity: 3.0, env: 0.8, exposure: 1.05, cloudLit: '#fff2dc', cloudShade: '#a8a8bc' },
  { h: 18.3, zenith: '#34507e', upper: '#b0789a', horizon: '#ff9c5c', glow: '#ff8a40', light: '#ffa060', intensity: 2.1, env: 0.55, exposure: 1.08, cloudLit: '#ffb27a', cloudShade: '#7a5a78' },
  { h: 20.2, zenith: '#141e44', upper: '#3a3466', horizon: '#8a5a6a', glow: '#b0604a', light: '#c8a0c8', intensity: 0.9, env: 0.32, exposure: 1.02, cloudLit: '#7a5a78', cloudShade: '#2a2440' },
];

/** Interpolated look for an hour (wrapping round midnight). */
function sample(hour: number) {
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
  const k = sample(hour);
  // The sun rises in the east (+x), crosses the south (+z) and sets in the west.
  const day = daylight(hour);
  const sunAngle = ((hour - 6) / 12) * Math.PI;
  const night = hour < 5.5 || hour > 19.5;
  // At night the moon takes over, high in the south-west, so shadows still read.
  const angle = night ? (((hour + 12) % 24) - 6) / 12 * Math.PI : sunAngle;
  const elev = Math.max(night ? 0.55 : 0.12, Math.sin(angle));
  const dir = new THREE.Vector3(Math.cos(angle), elev, 0.55).normalize();
  return { dir, day, ...k, sunColor: k.light };
}
