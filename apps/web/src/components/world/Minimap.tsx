import { memo, useEffect, useRef, useState } from 'react';
import { getTopology, type GameState, type Terrain } from '@hexfall/engine';
import { COLOR_HEX } from '../../lexicon';
import { RES_COLOR } from '../../art/icons/Icon';
import { R } from './terrain';
import type { MapState } from './world';

const topo = getTopology();
const LAND: Record<Terrain, string> = {
  witchwood: '#3f7a3a',
  ashen: '#b8673f',
  moors: '#8fbf5a',
  fields: '#dcb94a',
  peaks: '#8d97a0',
  waste: '#d8c08c',
};
const SIZE = 188;
/** The nearby view's zoom over the whole-island view. */
const ZOOM = 2.6;
/** The island art is painted once at this multiple of the dial, so the nearby view stays sharp. */
const DETAIL = ZOOM;

interface Props {
  state: GameState;
  seat: number;
  /** Reads where everyone is (the world's mapState), polled ten times a second. */
  read(): MapState | null;
  /** A duel opponent to ring on the map, if any. */
  foe: number | null;
}

type Mode = 'island' | 'nearby';

/** A small deterministic scatter per hex, so its glyphs never jump between redraws. */
function seeded(seed: number) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/**
 * The 3D walk's minimap, top left: the island painted from above (terrain, number tokens,
 * harbours, every road, settlement and city in its owner's colour, the robber), with horses,
 * unopened weapon chests, the other players and you, an arrow with a cone for where you look,
 * inside a compass bezel. Click it or press M to switch between the whole island (north up)
 * and a closer view that turns with you. The island is painted once per change; the moving
 * marks redraw ten times a second.
 */
export const Minimap = memo(function Minimap({ state, seat, read, foe }: Props) {
  const base = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('island');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.round(SIZE * dpr);
  const bp = Math.round(px * DETAIL);

  // The island's centre and size in world metres (with a margin of sea).
  const fit = useRef({ cx: 0, cz: 0, span: 1 });
  useEffect(() => {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const p of topo.hexPos) {
      minX = Math.min(minX, p.x * R - R);
      maxX = Math.max(maxX, p.x * R + R);
      minZ = Math.min(minZ, p.y * R - R);
      maxZ = Math.max(maxZ, p.y * R + R);
    }
    fit.current = { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, span: Math.max(maxX - minX, maxZ - minZ) * 1.22 };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyM' || e.repeat || (e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable]')) return;
      setMode((m) => (m === 'island' ? 'nearby' : 'island'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------------------------------------------------------------- the island, painted once
  const piecesKey = JSON.stringify([state.buildings, state.causeways, state.wraithHex]);
  useEffect(() => {
    const c = base.current ?? document.createElement('canvas');
    base.current = c;
    c.width = c.height = bp;
    const g = c.getContext('2d')!;
    const { cx, cz, span } = fit.current;
    const k = bp / span;
    const u = k; // pixels per metre
    const P = (x: number, z: number): [number, number] => [(x - cx) * k + bp / 2, (z - cz) * k + bp / 2];
    const V = (v: string) => P(topo.vertexPos[v].x * R, topo.vertexPos[v].y * R);
    const hexPath = (i: number) => {
      g.beginPath();
      topo.hexVertices[i].forEach((v, j) => {
        const [x, y] = V(v);
        if (j) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.closePath();
    };

    // Sea: deep at the rim, clearer towards the island, with a few swell lines.
    const sea = g.createRadialGradient(bp / 2, bp / 2, bp * 0.22, bp / 2, bp / 2, bp * 0.62);
    sea.addColorStop(0, '#2f8db3');
    sea.addColorStop(1, '#123f5e');
    g.fillStyle = sea;
    g.fillRect(0, 0, bp, bp);
    g.strokeStyle = 'rgba(210,240,255,0.10)';
    g.lineWidth = 0.35 * u;
    const rnd = seeded(7);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2;
      const r = bp * (0.4 + rnd() * 0.12);
      const x = bp / 2 + Math.cos(a) * r;
      const y = bp / 2 + Math.sin(a) * r;
      g.beginPath();
      g.arc(x, y, 2.2 * u, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
    // Shallows and beach round the coast.
    state.board.hexes.forEach((_, i) => {
      hexPath(i);
      g.strokeStyle = 'rgba(126,206,224,0.45)';
      g.lineWidth = 7 * u;
      g.lineJoin = 'round';
      g.stroke();
    });
    state.board.hexes.forEach((_, i) => {
      hexPath(i);
      g.strokeStyle = '#e6d3a1';
      g.lineWidth = 2.2 * u;
      g.stroke();
    });

    // Land: each terrain lit from the upper left, shaded lower right, with its own glyphs.
    state.board.hexes.forEach((hex, i) => {
      const [hx, hy] = P(topo.hexPos[i].x * R, topo.hexPos[i].y * R);
      hexPath(i);
      g.fillStyle = LAND[hex.terrain];
      g.fill();
      const light = g.createLinearGradient(hx - R * u, hy - R * u, hx + R * u, hy + R * u);
      light.addColorStop(0, 'rgba(255,248,225,0.22)');
      light.addColorStop(0.55, 'rgba(255,255,255,0)');
      light.addColorStop(1, 'rgba(10,30,40,0.22)');
      g.fillStyle = light;
      g.fill();
      g.save();
      hexPath(i);
      g.clip();
      glyphs(g, hex.terrain, hx, hy, u, seeded(i + 3));
      g.restore();
      hexPath(i);
      g.strokeStyle = 'rgba(24,28,22,0.35)';
      g.lineWidth = 0.35 * u;
      g.stroke();
    });

    // Harbours: a jetty off the coast with its rate (2:1 in the resource's colour).
    for (const h of state.board.harbors) {
      const [a, b] = h.vertices;
      const [ax, ay] = V(a);
      const [bx, by] = V(b);
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const [hx, hy] = P(topo.hexPos[h.hex].x * R, topo.hexPos[h.hex].y * R);
      const len = Math.hypot(mx - hx, my - hy) || 1;
      const ox = mx + ((mx - hx) / len) * 4.2 * u;
      const oy = my + ((my - hy) / len) * 4.2 * u;
      g.strokeStyle = '#7a5638';
      g.lineWidth = 0.8 * u;
      g.beginPath();
      g.moveTo(mx, my);
      g.lineTo(ox, oy);
      g.stroke();
      g.fillStyle = h.kind === 'any' ? '#f3e6d6' : RES_COLOR[h.kind];
      g.strokeStyle = '#1b1d1e';
      g.lineWidth = 0.4 * u;
      g.beginPath();
      g.arc(ox, oy, 2.1 * u, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = h.kind === 'any' ? '#2a2420' : '#ffffff';
      g.font = `700 ${2.1 * u}px Cinzel, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(h.kind === 'any' ? '3:1' : '2:1', ox, oy + 0.15 * u);
    }

    // Number tokens: aged ivory discs, 6 and 8 in red.
    state.board.hexes.forEach((hex, i) => {
      if (hex.token === null) return;
      const [x, y] = P(topo.hexPos[i].x * R, topo.hexPos[i].y * R);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.arc(x + 0.35 * u, y + 0.45 * u, 3.1 * u, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#f1e4c6';
      g.strokeStyle = '#8a7650';
      g.lineWidth = 0.35 * u;
      g.beginPath();
      g.arc(x, y, 3.1 * u, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = hex.token === 6 || hex.token === 8 ? '#b0302a' : '#2a2420';
      g.font = `700 ${3.4 * u}px Cinzel, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(hex.token), x, y + 0.25 * u);
    });

    // Roads: the owner's colour over a dark kerb.
    for (const [e, owner] of Object.entries(state.causeways)) {
      const [a, b] = topo.edgeVertices[e];
      const [ax, ay] = V(a);
      const [bx, by] = V(b);
      const sx = (bx - ax) * 0.12;
      const sy = (by - ay) * 0.12;
      g.lineCap = 'round';
      g.strokeStyle = '#141617';
      g.lineWidth = 1.9 * u;
      g.beginPath();
      g.moveTo(ax + sx, ay + sy);
      g.lineTo(bx - sx, by - sy);
      g.stroke();
      g.strokeStyle = COLOR_HEX[state.players[owner].color];
      g.lineWidth = 1.1 * u;
      g.stroke();
    }
    // Settlements and cities: a little house and a hall with its tower; yours ringed in light.
    for (const [v, b] of Object.entries(state.buildings)) {
      const [x, y] = V(v);
      const s = (b.kind === 'citadel' ? 1.35 : 1) * 2.6 * u;
      const mine = b.owner === seat;
      if (mine) {
        g.fillStyle = 'rgba(255,240,200,0.35)';
        g.beginPath();
        g.arc(x, y, s * 1.7, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      if (b.kind === 'citadel') {
        g.moveTo(x - s, y + s * 0.8);
        g.lineTo(x - s, y - s * 0.1);
        g.lineTo(x - s * 0.1, y - s * 0.1);
        g.lineTo(x - s * 0.1, y - s * 0.9);
        g.lineTo(x + s * 0.45, y - s * 1.35);
        g.lineTo(x + s, y - s * 0.9);
        g.lineTo(x + s, y + s * 0.8);
      } else {
        g.moveTo(x - s * 0.8, y + s * 0.7);
        g.lineTo(x - s * 0.8, y - s * 0.15);
        g.lineTo(x, y - s * 0.9);
        g.lineTo(x + s * 0.8, y - s * 0.15);
        g.lineTo(x + s * 0.8, y + s * 0.7);
      }
      g.closePath();
      g.fillStyle = COLOR_HEX[state.players[b.owner].color];
      g.strokeStyle = mine ? '#fff6dc' : '#141617';
      g.lineWidth = 0.55 * u;
      g.fill();
      g.stroke();
    }
    // The robber: a hooded charcoal figure over the token.
    const rh = topo.hexPos[state.wraithHex];
    if (rh) {
      const [x, y] = P(rh.x * R, rh.y * R);
      g.fillStyle = '#26282b';
      g.strokeStyle = '#d9cfb8';
      g.lineWidth = 0.4 * u;
      g.beginPath();
      g.moveTo(x - 2.4 * u, y + 3 * u);
      g.quadraticCurveTo(x - 2.2 * u, y - 1 * u, x, y - 3.4 * u);
      g.quadraticCurveTo(x + 2.2 * u, y - 1 * u, x + 2.4 * u, y + 3 * u);
      g.closePath();
      g.fill();
      g.stroke();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piecesKey, bp, seat, state.board]);

  // ---------------------------------------------------------------- moving marks and the dial
  useEffect(() => {
    const draw = () => {
      const c = live.current;
      const m = read();
      if (!c || !base.current || !m) return;
      const g = c.getContext('2d')!;
      const { cx, cz, span } = fit.current;
      const nearby = mode === 'nearby';
      const scale = (px / span) * (nearby ? ZOOM : 1);
      const ox = nearby ? m.x : cx;
      const oz = nearby ? m.z : cz;
      const rot = nearby ? m.yaw : 0;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      // World metres to dial pixels.
      const S = (x: number, z: number): [number, number] => {
        const dx = (x - ox) * scale;
        const dz = (z - oz) * scale;
        return [px / 2 + dx * cos - dz * sin, px / 2 + dx * sin + dz * cos];
      };
      const half = px / 2;
      const inner = half - 9 * dpr;
      g.clearRect(0, 0, px, px);
      g.save();
      g.beginPath();
      g.arc(half, half, inner, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = '#123f5e';
      g.fillRect(0, 0, px, px);
      g.save();
      g.translate(half, half);
      g.rotate(rot);
      g.scale(scale, scale);
      g.translate(-ox, -oz);
      const bk = bp / span;
      g.imageSmoothingQuality = 'high';
      g.drawImage(base.current, cx - bp / 2 / bk, cz - bp / 2 / bk, bp / bk, bp / bk);
      g.restore();

      // Where you look: a soft cone ahead of the arrow.
      const [x, y] = S(m.x, m.z);
      const head = Math.atan2(-Math.cos(m.yaw), -Math.sin(m.yaw)) + rot;
      const reach = 46 * dpr;
      const cone = g.createRadialGradient(x, y, 0, x, y, reach);
      cone.addColorStop(0, 'rgba(255,214,140,0.42)');
      cone.addColorStop(1, 'rgba(255,214,140,0)');
      g.fillStyle = cone;
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, reach, head - 0.6, head + 0.6);
      g.closePath();
      g.fill();

      const now = performance.now();
      for (const ch of m.chests) {
        const [hx, hy] = S(ch.x, ch.z);
        const glow = 0.5 + 0.5 * Math.sin(now / 260);
        g.fillStyle = `rgba(255,200,90,${0.25 + 0.25 * glow})`;
        g.beginPath();
        g.arc(hx, hy, (5 + glow * 2) * dpr, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#c78a2c';
        g.strokeStyle = '#1b1208';
        g.lineWidth = 1.2 * dpr;
        g.fillRect(hx - 3.4 * dpr, hy - 2.4 * dpr, 6.8 * dpr, 4.8 * dpr);
        g.strokeRect(hx - 3.4 * dpr, hy - 2.4 * dpr, 6.8 * dpr, 4.8 * dpr);
      }
      for (const h of m.horses) {
        const [hx, hy] = S(h.x, h.z);
        g.fillStyle = '#7a4a2a';
        g.strokeStyle = '#f3e6d6';
        g.lineWidth = 1 * dpr;
        g.beginPath();
        g.ellipse(hx, hy, 3.2 * dpr, 2.2 * dpr, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      for (const o of m.others) {
        const [hx, hy] = S(o.x, o.z);
        g.fillStyle = COLOR_HEX[state.players[o.seat].color];
        g.strokeStyle = '#090a0b';
        g.lineWidth = 1.6 * dpr;
        g.beginPath();
        g.arc(hx, hy, 4.4 * dpr, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        if (o.seat === foe) {
          g.strokeStyle = '#ff5a4a';
          g.lineWidth = 2 * dpr;
          g.beginPath();
          g.arc(hx, hy, (8 + Math.sin(now / 160) * 1.5) * dpr, 0, Math.PI * 2);
          g.stroke();
        }
      }
      // You: a gold arrow pointing where you look.
      const fx = Math.cos(head);
      const fy = Math.sin(head);
      const s = 8 * dpr;
      g.shadowColor = 'rgba(0,0,0,0.6)';
      g.shadowBlur = 4 * dpr;
      g.fillStyle = '#f2ac52';
      g.strokeStyle = '#090a0b';
      g.lineWidth = 1.6 * dpr;
      g.beginPath();
      g.moveTo(x + fx * s, y + fy * s);
      g.lineTo(x - fx * s * 0.6 - fy * s * 0.62, y - fy * s * 0.6 + fx * s * 0.62);
      g.lineTo(x - fx * s * 0.22, y - fy * s * 0.22);
      g.lineTo(x - fx * s * 0.6 + fy * s * 0.62, y - fy * s * 0.6 - fx * s * 0.62);
      g.closePath();
      g.fill();
      g.shadowBlur = 0;
      g.stroke();
      // A vignette towards the rim.
      const vig = g.createRadialGradient(half, half, inner * 0.62, half, half, inner);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.38)');
      g.fillStyle = vig;
      g.fillRect(0, 0, px, px);
      g.restore();

      // The bezel: a dark ring between two gold lines, ticks, and north.
      g.lineWidth = 9 * dpr;
      g.strokeStyle = '#141617';
      g.beginPath();
      g.arc(half, half, half - 4.5 * dpr, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 1.2 * dpr;
      g.strokeStyle = '#d6b270';
      for (const r of [half - 0.8 * dpr, inner]) {
        g.beginPath();
        g.arc(half, half, r, 0, Math.PI * 2);
        g.stroke();
      }
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + rot;
        const long = i % 6 === 0;
        const r0 = half - (long ? 7.5 : 5.5) * dpr;
        const r1 = half - 2.5 * dpr;
        g.strokeStyle = long ? '#d6b270' : 'rgba(214,178,112,0.5)';
        g.lineWidth = (long ? 1.4 : 1) * dpr;
        g.beginPath();
        g.moveTo(half + Math.cos(a) * r0, half + Math.sin(a) * r0);
        g.lineTo(half + Math.cos(a) * r1, half + Math.sin(a) * r1);
        g.stroke();
      }
      // North (world -z) sits at the top when the map is north up and turns with you nearby.
      const na = -Math.PI / 2 + rot;
      const nx = half + Math.cos(na) * (half - 4.5 * dpr);
      const ny = half + Math.sin(na) * (half - 4.5 * dpr);
      g.fillStyle = '#b0364a';
      g.strokeStyle = '#f3e6d6';
      g.lineWidth = 1 * dpr;
      g.beginPath();
      g.arc(nx, ny, 6.2 * dpr, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#f3e6d6';
      g.font = `700 ${8 * dpr}px Cinzel, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('N', nx, ny + 0.5 * dpr);
    };
    draw();
    const id = window.setInterval(draw, 100);
    return () => window.clearInterval(id);
  }, [read, px, bp, foe, state.players, dpr, mode]);

  return (
    <div className="pointer-events-auto relative" style={{ width: SIZE, height: SIZE }}>
      <canvas
        ref={live}
        width={px}
        height={px}
        data-testid="minimap"
        aria-label={mode === 'island' ? 'Minimap: the whole island, north up' : 'Minimap: nearby, turning with you'}
        role="img"
        title="Click or press M: whole island / nearby"
        className="cursor-pointer rounded-full shadow-panel"
        style={{ width: SIZE, height: SIZE }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setMode((m) => (m === 'island' ? 'nearby' : 'island'))}
      />
      <span className="pointer-events-none absolute bottom-[3px] left-1/2 -translate-x-1/2 rounded-full bg-abyss/90 px-2 font-display text-[9px] uppercase tracking-[0.16em] text-[rgb(var(--antique))]">
        {mode === 'island' ? 'Island' : 'Nearby'} · M
      </span>
    </div>
  );
});

/** Small painted marks per terrain: trees, wheat rows, sheep, clay pits, peaks, dunes. */
function glyphs(g: CanvasRenderingContext2D, t: Terrain, x: number, y: number, u: number, rnd: () => number) {
  const spot = (): [number, number] => {
    for (;;) {
      const a = rnd() * Math.PI * 2;
      const r = (0.32 + rnd() * 0.5) * 12 * u;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (Math.hypot(px - x, py - y) > 4.2 * u) return [px, py];
    }
  };
  if (t === 'witchwood') {
    for (let i = 0; i < 16; i++) {
      const [px, py] = spot();
      const r = (1.3 + rnd() * 0.7) * u;
      g.fillStyle = 'rgba(14,40,18,0.45)';
      g.beginPath();
      g.arc(px + 0.4 * u, py + 0.5 * u, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = rnd() < 0.5 ? '#2d6330' : '#3b7a36';
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(190,230,140,0.35)';
      g.beginPath();
      g.arc(px - r * 0.3, py - r * 0.3, r * 0.45, 0, Math.PI * 2);
      g.fill();
    }
  } else if (t === 'fields') {
    g.strokeStyle = 'rgba(150,104,30,0.45)';
    g.lineWidth = 0.45 * u;
    for (let i = -6; i <= 6; i++) {
      g.beginPath();
      g.moveTo(x - 13 * u, y + i * 2.1 * u - 4 * u);
      g.lineTo(x + 13 * u, y + i * 2.1 * u + 4 * u);
      g.stroke();
    }
  } else if (t === 'moors') {
    for (let i = 0; i < 7; i++) {
      const [px, py] = spot();
      g.fillStyle = '#f6f2e6';
      g.strokeStyle = 'rgba(40,50,30,0.5)';
      g.lineWidth = 0.25 * u;
      g.beginPath();
      g.ellipse(px, py, 1.1 * u, 0.8 * u, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  } else if (t === 'ashen') {
    for (let i = 0; i < 6; i++) {
      const [px, py] = spot();
      g.fillStyle = 'rgba(120,52,26,0.55)';
      g.beginPath();
      g.ellipse(px, py, 2.4 * u, 1.4 * u, rnd(), 0, Math.PI * 2);
      g.fill();
    }
  } else if (t === 'peaks') {
    for (let i = 0; i < 5; i++) {
      const [px, py] = spot();
      const h = (3 + rnd() * 2) * u;
      g.fillStyle = '#6d7880';
      g.beginPath();
      g.moveTo(px - h * 0.8, py + h * 0.5);
      g.lineTo(px, py - h * 0.6);
      g.lineTo(px + h * 0.8, py + h * 0.5);
      g.closePath();
      g.fill();
      g.fillStyle = '#eef2f4';
      g.beginPath();
      g.moveTo(px - h * 0.25, py - h * 0.2);
      g.lineTo(px, py - h * 0.6);
      g.lineTo(px + h * 0.25, py - h * 0.2);
      g.closePath();
      g.fill();
    }
  } else if (t === 'waste') {
    g.strokeStyle = 'rgba(150,118,60,0.5)';
    g.lineWidth = 0.5 * u;
    for (let i = 0; i < 6; i++) {
      const [px, py] = spot();
      g.beginPath();
      g.arc(px, py, 2.4 * u, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
    }
  }
}
