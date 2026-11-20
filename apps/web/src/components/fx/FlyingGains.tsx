import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { RESOURCES, TERRAIN_RESOURCE, type GameState, type Resource } from '@hexfall/engine';
import { cardArt } from '../../art/cards/cardArt';
import { VIEWBOX, hexCenter, topo } from '../board/geometry';
import { useStore } from '../../state/store';

interface Flyer {
  id: string;
  res: Resource;
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
}

/** Resource cards fly from producing tiles into the shown hand. */
export function FlyingGains({ state, seat, disabled }: { state: GameState; seat: number; disabled: boolean }) {
  const production = useStore((s) => s.fx.production);
  const [flyers, setFlyers] = useState<Flyer[]>([]);

  useEffect(() => {
    if (!production || disabled) return;
    const gains = production.gains[seat];
    if (!gains || !RESOURCES.some((r) => gains[r] > 0)) return;
    const svg = document.querySelector('[data-board] [role=group]');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / VIEWBOX.w, rect.height / VIEWBOX.h);
    const ox = rect.left + (rect.width - VIEWBOX.w * scale) / 2;
    const oy = rect.top + (rect.height - VIEWBOX.h * scale) / 2;
    const out: Flyer[] = [];
    let k = 0;
    for (const h of production.hexes) {
      const res = TERRAIN_RESOURCE[state.board.hexes[h].terrain];
      if (!res || gains[res] <= 0) continue;
      const mine = topo.hexVertices[h].filter((v) => state.buildings[v]?.owner === seat);
      if (!mine.length) continue;
      const card = document.querySelector(`[data-res="${res}"]`);
      if (!card) continue;
      const cr = card.getBoundingClientRect();
      const c = hexCenter(h);
      for (const v of mine) {
        const n = state.buildings[v].kind === 'citadel' ? 2 : 1;
        for (let i = 0; i < n; i++) {
          out.push({
            id: `${production.seq}-${h}-${v}-${i}`,
            res,
            from: { x: ox + (c.x - VIEWBOX.x) * scale, y: oy + (c.y - VIEWBOX.y) * scale },
            to: { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2 },
            delay: 0.8 + k++ * 0.12,
          });
        }
      }
    }
    setFlyers(out);
    const id = window.setTimeout(() => setFlyers([]), 2600);
    return () => window.clearTimeout(id);
    // Only fire on a new production event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [production?.seq]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40" aria-hidden>
      <AnimatePresence>
        {flyers.map((f) => (
          // a small parchment card with the resource's own art, flying to the hand
          <motion.div
            key={f.id}
            className="hc-card absolute h-11 w-9 justify-center p-[3px]"
            style={{ left: 0, top: 0 }}
            initial={{ x: f.from.x - 18, y: f.from.y - 22, scale: 0.4, opacity: 0, rotate: -20 }}
            animate={{ x: f.to.x - 18, y: f.to.y - 22, scale: 1, opacity: [0, 1, 1, 0], rotate: 0 }}
            transition={{ duration: 0.9, delay: f.delay, ease: [0.4, 0, 0.2, 1], opacity: { duration: 0.9, delay: f.delay, times: [0, 0.15, 0.85, 1] } }}
          >
            <img src={cardArt(f.res)} alt="" className="h-full w-full object-cover" draggable={false} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
