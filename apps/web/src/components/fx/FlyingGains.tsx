import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { RESOURCES, TERRAIN_RESOURCE, type GameState, type Resource } from '@hexfall/engine';
import { RES_COLOR, ResourceGlyph } from '../../art/icons/Icon';
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
          <motion.div
            key={f.id}
            className="absolute grid h-11 w-8 place-items-center rounded-[3px] border"
            style={{
              left: 0,
              top: 0,
              borderColor: RES_COLOR[f.res],
              background: '#15171d',
              color: RES_COLOR[f.res],
              boxShadow: `0 0 14px ${RES_COLOR[f.res]}88`,
            }}
            initial={{ x: f.from.x - 16, y: f.from.y - 22, scale: 0.4, opacity: 0, rotate: -20 }}
            animate={{ x: f.to.x - 16, y: f.to.y - 22, scale: 1, opacity: [0, 1, 1, 0], rotate: 0 }}
            transition={{ duration: 0.9, delay: f.delay, ease: [0.4, 0, 0.2, 1], opacity: { duration: 0.9, delay: f.delay, times: [0, 0.15, 0.85, 1] } }}
          >
            <ResourceGlyph res={f.res} size={18} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
