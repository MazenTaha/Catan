import type { Terrain } from '@hexfall/engine';

/**
 * Asset manifest. Point any entry at an image URL (e.g. files in `public/art/`) to replace
 * the procedural SVG art without touching game code. `null` keeps the built-in art.
 *
 *   terrain: { witchwood: '/art/witchwood.webp', ... }
 *
 * Terrain images are drawn into a 174×200 box centered on the hex and clipped to it.
 */
export const ART_MANIFEST: {
  terrain: Record<Terrain, string | null>;
} = {
  terrain: {
    witchwood: null,
    ashen: null,
    moors: null,
    fields: null,
    peaks: null,
    waste: null,
  },
};
