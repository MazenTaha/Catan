/** Small colour helpers for the procedural art (hex strings in, hex strings out). */

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const hex2 = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');

/** Linear blend from `a` (t = 0) to `b` (t = 1). */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return `#${hex2(ar + (br - ar) * t)}${hex2(ag + (bg - ag) * t)}${hex2(ab + (bb - ab) * t)}`;
}

/** Warm sunlit tint of a colour (the light comes from the upper left). */
export const lit = (c: string, t = 0.22) => mix(c, '#fff1cf', t);

/** Cool shaded tint of a colour (shadows lean blue-green, never plum). */
export const shade = (c: string, t = 0.38) => mix(c, '#14211f', t);
