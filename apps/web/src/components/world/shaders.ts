import * as THREE from 'three';

/**
 * Shader patches for the 3D walk, all built on three's standard materials so lighting, shadows
 * and fog stay consistent: plant wind and sway, distance fade, soft back-lighting for thin
 * leaves and stalks, the sky dome, the sea and the ground's detail blending. Motion runs on the
 * GPU from one shared clock (`uTime`), so nothing is updated per stalk on the CPU.
 */

/** The one wind direction for wheat, grass, flowers and trees (x, z). */
export const WIND_DIR = new THREE.Vector2(0.82, 0.57).normalize();

/**
 * Gusting wind for stalks (wheat, grass, flowers): a slow gust envelope and a travelling wave
 * in the wind's direction plus per-stalk flutter, bending more towards the tips. `uWindH` is the
 * height at which a stalk bends fully. Applied in instance space so every clump bends the same way.
 */
const WIND_GLSL = `
  #ifdef USE_INSTANCING
    vec3 wIp = vec3(modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0));
    mat3 wM = mat3(instanceMatrix);
  #else
    vec3 wIp = vec3(modelMatrix[3]);
    mat3 wM = mat3(1.0);
  #endif
  float wH = clamp(position.y / uWindH, 0.0, 1.4);
  float wBend = wH * wH;
  float wAlong = dot(wIp.xz, uWindDir);
  float wGust = 0.55 + 0.45 * sin(wAlong * 0.06 - uTime * 0.45);
  float wWave = sin(wAlong * 0.42 - uTime * 1.7 + wphase * 1.2);
  float wFl = sin(uTime * 3.6 + wphase * 6.2832 + wIp.x * 1.3 + wIp.z) * 0.16;
  float wAmt = (0.3 + 0.7 * (wWave * 0.5 + 0.5) + wFl) * wGust * uWind * wBend * uWindH;
  vec3 wDir = transpose(wM) * vec3(uWindDir.x, 0.0, uWindDir.y);
  wDir /= max(dot(wM[0], wM[0]), 1e-4);
  transformed += wDir * wAmt;
  transformed.y -= wAmt * wAmt * 1.3 / uWindH * wH;
`;

/** A gentle sway for tree crowns and shrubs (taller vertices move more). */
const SWAY_GLSL = `
  #ifdef USE_INSTANCING
    vec3 sIp = vec3(instanceMatrix[3]);
  #else
    vec3 sIp = vec3(0.0);
  #endif
  float sH = max(transformed.y - 1.0, 0.0);
  float sG = 0.6 + 0.4 * sin(dot(sIp.xz, uWindDir) * 0.05 - uTime * 0.5);
  transformed.x += (sin(uTime * 1.3 + sIp.x * 0.31 + sIp.z * 0.23) * 0.6 + uWindDir.x * 0.5) * sH * uSway * sG;
  transformed.z += (cos(uTime * 1.1 + sIp.x * 0.19) * 0.6 + uWindDir.y * 0.5) * sH * uSway * sG;
`;

/** Shrinks each instance into the ground between `uFade.x` and `uFade.y` metres from the eye. */
const FADE_GLSL = `
  #ifdef USE_INSTANCING
    vec3 fIp = vec3(modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0));
    float fK = 1.0 - smoothstep(uFade.x, uFade.y, distance(fIp.xz, cameraPosition.xz));
    transformed *= fK;
  #endif
`;

export interface FoliageOpts {
  uTime: { value: number };
  /** Stalk wind strength (0 = still) and the height a stalk bends fully at. */
  wind?: { amount: number; height: number };
  /** Crown sway strength (0 = still). */
  sway?: number;
  /** Fade-out distances (metres) for small plants. */
  fade?: [number, number];
  /** Light through thin leaves when looking towards the sun (0-1). */
  translucency?: number;
}

/**
 * Turns a standard material into foliage: wind or sway, optional fade, and lighting suited to
 * thin, double-sided parts (both faces keep the authored normals, back-lit leaves glow softly).
 * Mutates and returns `m` (use a per-world clone of shared materials).
 */
export function foliage<T extends THREE.Material>(m: T, o: FoliageOpts): T {
  const wind = o.wind?.amount ?? 0;
  const sway = o.sway ?? 0;
  const fade = o.fade;
  const tl = o.translucency ?? 0;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = o.uTime;
    sh.uniforms.uWind = { value: wind };
    sh.uniforms.uWindH = { value: o.wind?.height ?? 1 };
    sh.uniforms.uWindDir = { value: WIND_DIR };
    sh.uniforms.uSway = { value: sway };
    sh.uniforms.uFade = { value: new THREE.Vector2(...(fade ?? [1e5, 1e5 + 1])) };
    sh.uniforms.uTransl = { value: tl };
    let body = '';
    if (wind) body += WIND_GLSL;
    if (sway) body += SWAY_GLSL;
    if (fade) body += FADE_GLSL;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime; uniform float uWind; uniform float uWindH; uniform vec2 uWindDir;
        uniform float uSway; uniform vec2 uFade;
        attribute float wphase;`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${body}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTransl;')
      // Thin parts: both faces use the authored (outward, upward) normal.
      .replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n#if defined(DOUBLE_SIDED) && !defined(FLAT_SHADED)\nnormal *= faceDirection;\n#endif',
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Leaves and stalks are matte: no white Fresnel sheen at grazing angles.
        reflectedLight.directSpecular *= 0.3;
        reflectedLight.indirectSpecular *= 0.5;
        #if NUM_DIR_LIGHTS > 0
          float tlBack = max(dot(-normalize(vViewPosition), directionalLights[0].direction), 0.0);
          reflectedLight.indirectDiffuse += diffuseColor.rgb * directionalLights[0].color * uTransl * (0.03 + pow(tlBack, 6.0) * 0.2);
        #endif`,
      );
  };
  m.customProgramCacheKey = () => `foliage|${wind > 0}|${sway > 0}|${!!fade}|${tl > 0}`;
  return m;
}

/**
 * A depth-only twin of a foliage material for a pre-pass: same motion, same cut-out, a trivial
 * fragment shader. Drawn first, it fills the depth buffer, so the lit pass then shades only the
 * front-most leaf or stalk at each pixel instead of every overlapping layer. Pushed back a hair
 * (polygon offset) so the lit pass still passes on the same surface despite rounding between
 * programs.
 */
export function foliageDepth(m: THREE.MeshStandardMaterial, o: FoliageOpts): THREE.MeshBasicMaterial {
  const d = new THREE.MeshBasicMaterial({
    map: m.map,
    // Solid stalks need no cut-out, which keeps early depth testing on for the pre-pass.
    alphaTest: m.map ? m.alphaTest || 0.5 : 0,
    side: m.side,
    colorWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  d.name = `${m.name}-depth`;
  return foliage(d, { uTime: o.uTime, sway: o.sway, wind: o.wind, fade: o.fade });
}

// ------------------------------------------------------------------ noise

let noiseTex: THREE.DataTexture | null = null;

/**
 * A 256 px tiling noise texture shared by the sky, sea and ground: R and G hold two different
 * fractal value noises, B a finer one. Built once per page from fixed seeds.
 */
export function noiseTexture(): THREE.DataTexture {
  if (noiseTex) return noiseTex;
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const lattice = (period: number, seed: number) => {
    const g = new Float32Array(period * period);
    let s = seed >>> 0;
    for (let i = 0; i < g.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      g[i] = s / 4294967296;
    }
    return (x: number, y: number) => {
      const fx = (x / S) * period;
      const fy = (y / S) * period;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const u = tx * tx * (3 - 2 * tx);
      const v = ty * ty * (3 - 2 * ty);
      const at = (a: number, b: number) => g[((b + period) % period) * period + ((a + period) % period)];
      const a = at(ix, iy);
      const b = at(ix + 1, iy);
      const c = at(ix, iy + 1);
      const d = at(ix + 1, iy + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  };
  const fbm = (seed: number, base: number, oct: number) => {
    const layers = Array.from({ length: oct }, (_, i) => lattice(base << i, seed + i * 7919));
    return (x: number, y: number) => {
      let sum = 0;
      let amp = 0.5;
      let norm = 0;
      for (const l of layers) {
        sum += l(x, y) * amp;
        norm += amp;
        amp *= 0.5;
      }
      return sum / norm;
    };
  };
  const r = fbm(11, 4, 5);
  const gch = fbm(23, 4, 5);
  const b = fbm(37, 16, 3);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      data[i] = Math.round(r(x, y) * 255);
      data[i + 1] = Math.round(gch(x, y) * 255);
      data[i + 2] = Math.round(b(x, y) * 255);
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  t.userData.shared = true;
  noiseTex = t;
  return t;
}

// ------------------------------------------------------------------ sky

export interface SkyColours {
  zenith: THREE.Color;
  upper: THREE.Color;
  horizon: THREE.Color;
  glow: THREE.Color;
  sun: THREE.Color;
  cloudLit: THREE.Color;
  cloudShade: THREE.Color;
}

/**
 * The sky dome: a blue gradient paling to a hazy horizon, warmer towards the sun, a soft sun
 * disc and halo, and drifting cumulus painted from the noise texture with lit tops and cool
 * undersides. One cheap fragment shader on a sphere that follows the camera.
 */
export function makeSky(sunDir: THREE.Vector3, uTime: { value: number }, c: SkyColours, clouds: boolean): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: sunDir },
      uTime,
      uNoise: { value: noiseTexture() },
      uZenith: { value: c.zenith },
      uUpper: { value: c.upper },
      uHorizon: { value: c.horizon },
      uGlow: { value: c.glow },
      uSunCol: { value: c.sun },
      uCloudLit: { value: c.cloudLit },
      uCloudShade: { value: c.cloudShade },
      uClouds: { value: clouds ? 1 : 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uSun; uniform float uTime; uniform sampler2D uNoise;
      uniform vec3 uZenith; uniform vec3 uUpper; uniform vec3 uHorizon; uniform vec3 uGlow;
      uniform vec3 uSunCol; uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform float uClouds;
      varying vec3 vDir;
      float cloudField(vec2 p) {
        float n = texture2D(uNoise, p).r * 0.62 + texture2D(uNoise, p * 2.7 + 0.37).g * 0.28 + texture2D(uNoise, p * 7.1 + 0.71).b * 0.1;
        return n;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float hc = max(h, 0.0);
        vec3 col = mix(uHorizon, uUpper, smoothstep(0.0, 0.2, hc));
        col = mix(col, uZenith, smoothstep(0.15, 0.95, hc));
        float sd = max(dot(d, uSun), 0.0);
        col = mix(col, uGlow, pow(sd, 5.0) * pow(1.0 - hc, 2.5) * 0.55);
        if (h < 0.0) col = uHorizon * (1.0 - 0.06 * smoothstep(0.0, -0.25, h));
        if (uClouds > 0.5 && h > -0.02) {
          vec2 uv = d.xz / (hc + 0.12) * 0.055 + vec2(uTime * 0.0016, uTime * 0.0007);
          float n = cloudField(uv);
          float cov = smoothstep(0.5, 0.68, n);
          // Light from the sun's side of each cloud: sample a little towards the sun.
          float ns = cloudField(uv + normalize(uSun.xz + 1e-4) * 0.012);
          float lit = clamp(0.62 + (n - ns) * 6.0, 0.0, 1.0);
          vec3 cc = mix(uCloudShade, uCloudLit, lit * (0.7 + 0.3 * smoothstep(0.5, 0.8, n)));
          // Thin edges catch the light (silver lining) when near the sun.
          cc += uSunCol * pow(sd, 10.0) * (1.0 - smoothstep(0.5, 0.62, n)) * 0.6;
          cov *= smoothstep(-0.01, 0.14, h);
          col = mix(col, mix(cc, uHorizon, smoothstep(0.25, 0.0, hc) * 0.55), cov * 0.95);
        }
        col += uSunCol * (smoothstep(0.99965, 0.99985, sd) * 6.0 + pow(sd, 350.0) * 0.9 + pow(sd, 18.0) * 0.12);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  return sky;
}

// ------------------------------------------------------------------ ground

/**
 * Ground detail: the tiling texture is mixed with itself at a second, rotated scale and
 * modulated by low-frequency noise, so no repeat is visible; the normal map adds relief.
 */
export function groundDetail(m: THREE.MeshStandardMaterial): void {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNoise = { value: noiseTexture() };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uNoise;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec2 gUv2 = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.41 + vec2(0.31, 0.17);
          vec4 gA = texture2D(map, vMapUv);
          vec4 gB = texture2D(map, gUv2);
          float gMacro = texture2D(uNoise, vMapUv * 0.021).r;
          float gMix = smoothstep(0.3, 0.7, texture2D(uNoise, vMapUv * 0.06 + 0.5).g);
          vec4 gC = mix(gA, gB, 0.35 + 0.3 * gMix);
          gC.rgb *= 0.88 + 0.26 * gMacro;
          diffuseColor *= gC;
        #endif`,
      );
  };
  m.customProgramCacheKey = () => 'ground';
}
