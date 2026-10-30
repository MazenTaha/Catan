import { memo, useEffect, useRef } from 'react';
import { getTopology, type GameState, type Terrain } from '@hexfall/engine';
import { COLOR_HEX } from '../../lexicon';
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
const SIZE = 172;

interface Props {
  state: GameState;
  seat: number;
  /** Reads where everyone is (the world's mapState), polled ten times a second. */
  read(): MapState | null;
  /** A duel opponent to ring on the map, if any. */
  foe: number | null;
}

/**
 * The 3D walk's minimap, top left: the island from above, north up, with every road,
 * settlement and city in its owner's colour, the robber, horses, the other players and an
 * arrow for you. The board is drawn once per change; the moving marks redraw on a timer.
 */
export const Minimap = memo(function Minimap({ state, seat, read, foe }: Props) {
  const base = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<HTMLCanvasElement>(null);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.round(SIZE * dpr);

  // World metres to canvas pixels, fitted round the island with a little sea.
  const fit = useRef({ cx: 0, cz: 0, k: 1 });
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
    const span = Math.max(maxX - minX, maxZ - minZ) * 1.1;
    fit.current = { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, k: px / span };
  }, [px]);

  const piecesKey = JSON.stringify([state.buildings, state.causeways, state.wraithHex]);
  useEffect(() => {
    const c = base.current ?? document.createElement('canvas');
    base.current = c;
    c.width = c.height = px;
    const g = c.getContext('2d')!;
    const { cx, cz, k } = fit.current;
    const P = (x: number, z: number): [number, number] => [(x - cx) * k + px / 2, (z - cz) * k + px / 2];
    g.fillStyle = '#1d5f86';
    g.fillRect(0, 0, px, px);
    state.board.hexes.forEach((hex, i) => {
      g.beginPath();
      topo.hexVertices[i].forEach((v, j) => {
        const [x, y] = P(topo.vertexPos[v].x * R, topo.vertexPos[v].y * R);
        if (j) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.closePath();
      g.fillStyle = LAND[hex.terrain];
      g.fill();
      g.strokeStyle = 'rgba(20,24,20,0.35)';
      g.lineWidth = dpr;
      g.stroke();
    });
    for (const [e, owner] of Object.entries(state.causeways)) {
      const [a, b] = topo.edgeVertices[e];
      const [ax, ay] = P(topo.vertexPos[a].x * R, topo.vertexPos[a].y * R);
      const [bx, by] = P(topo.vertexPos[b].x * R, topo.vertexPos[b].y * R);
      g.strokeStyle = COLOR_HEX[state.players[owner].color];
      g.lineWidth = 3 * dpr;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
    }
    for (const [v, b] of Object.entries(state.buildings)) {
      const [x, y] = P(topo.vertexPos[v].x * R, topo.vertexPos[v].y * R);
      const r = (b.kind === 'citadel' ? 4.5 : 3.2) * dpr;
      g.fillStyle = COLOR_HEX[state.players[b.owner].color];
      g.strokeStyle = b.owner === seat ? '#fff6dc' : '#141617';
      g.lineWidth = 1.4 * dpr;
      g.beginPath();
      g.rect(x - r, y - r, r * 2, r * 2);
      g.fill();
      g.stroke();
    }
    const rh = topo.hexPos[state.wraithHex];
    if (rh) {
      const [x, y] = P(rh.x * R, rh.y * R);
      g.fillStyle = '#26282b';
      g.beginPath();
      g.arc(x, y, 3.4 * dpr, 0, Math.PI * 2);
      g.fill();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piecesKey, px, seat, dpr]);

  useEffect(() => {
    const draw = () => {
      const c = live.current;
      const m = read();
      if (!c || !base.current || !m) return;
      const g = c.getContext('2d')!;
      const { cx, cz, k } = fit.current;
      const P = (x: number, z: number): [number, number] => [(x - cx) * k + px / 2, (z - cz) * k + px / 2];
      g.drawImage(base.current, 0, 0);
      g.fillStyle = '#6b4429';
      for (const h of m.horses) {
        const [x, y] = P(h.x, h.z);
        g.beginPath();
        g.ellipse(x, y, 2.6 * dpr, 1.7 * dpr, 0, 0, Math.PI * 2);
        g.fill();
      }
      for (const o of m.others) {
        const [x, y] = P(o.x, o.z);
        g.fillStyle = COLOR_HEX[state.players[o.seat].color];
        g.strokeStyle = '#090a0b';
        g.lineWidth = 1.5 * dpr;
        g.beginPath();
        g.arc(x, y, 4 * dpr, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        if (o.seat === foe) {
          g.strokeStyle = '#ff5a4a';
          g.lineWidth = 2 * dpr;
          g.beginPath();
          g.arc(x, y, (7 + Math.sin(performance.now() / 160) * 1.5) * dpr, 0, Math.PI * 2);
          g.stroke();
        }
      }
      // You: an arrow pointing where you look.
      const [x, y] = P(m.x, m.z);
      const fx = -Math.sin(m.yaw);
      const fz = -Math.cos(m.yaw);
      const s = 7 * dpr;
      g.fillStyle = '#f2ac52';
      g.strokeStyle = '#090a0b';
      g.lineWidth = 1.5 * dpr;
      g.beginPath();
      g.moveTo(x + fx * s, y + fz * s);
      g.lineTo(x - fx * s * 0.6 + fz * s * 0.6, y - fz * s * 0.6 - fx * s * 0.6);
      g.lineTo(x - fx * s * 0.25, y - fz * s * 0.25);
      g.lineTo(x - fx * s * 0.6 - fz * s * 0.6, y - fz * s * 0.6 + fx * s * 0.6);
      g.closePath();
      g.fill();
      g.stroke();
    };
    draw();
    const id = window.setInterval(draw, 100);
    return () => window.clearInterval(id);
  }, [read, px, foe, state.players, dpr]);

  return (
    <canvas
      ref={live}
      width={px}
      height={px}
      data-testid="minimap"
      aria-label="Minimap"
      role="img"
      className="pointer-events-none rounded-full border-2 border-[#e6d3a3]/70 shadow-panel"
      style={{ width: SIZE, height: SIZE }}
    />
  );
});
