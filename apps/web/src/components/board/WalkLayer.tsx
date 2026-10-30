import { memo, useEffect, useRef, useState } from 'react';
import type { GameState } from '@hexfall/engine';
import { COLOR_HEX } from '../../lexicon';
import { usePresence } from '../../state/presence';
import { Icon } from '../../art/icons/Icon';
import { hourOf } from '../world/daytime';
import { toPercent } from './geometry';

/** The sea's soft edge (Board.tsx SEA_MASK), so the wash never shows as a rectangle. */
const FADE = {
  maskImage: 'radial-gradient(ellipse 72% 72% at 50% 50%, #000 80%, transparent 100%)',
  WebkitMaskImage: 'radial-gradient(ellipse 72% 72% at 50% 50%, #000 80%, transparent 100%)',
};

/** World metres (the 3D walk) to board units: the walk's hex radius is 14 m, the board's 100. */
const TO_BOARD = 100 / 14;

/**
 * The time of day over the board: a wash of colour at sunrise and sunset and a blue night,
 * as one whole-layer opacity change per turn (DECISIONS #40). Below the pieces, so they stay
 * as easy to read at midnight as at noon.
 */
export const DaylightTint = memo(function DaylightTint({ state }: { state: GameState }) {
  const hour = hourOf(state);
  // A plain translucent wash: blend modes don't reach across the board's cached layers.
  const tone =
    hour >= 20.5 || hour < 5
      ? { c: 'rgb(8 18 52)', o: 0.4 }
      : hour >= 17.5
        ? { c: 'rgb(255 128 64)', o: 0.13 }
        : hour < 7.5
          ? { c: 'rgb(255 170 110)', o: 0.1 }
          : { c: 'rgb(255 255 255)', o: 0 };
  return (
    <div
      className="pointer-events-none absolute inset-0 transition-opacity duration-1000"
      style={{ zIndex: 4, background: tone.c, opacity: tone.o, ...FADE }}
      aria-hidden
      data-testid="daylight-tint"
    />
  );
});

/**
 * A quiet hint of what is happening in the 3D walk (online): a small marker for each player
 * walking the island, where they are, and crossed swords where a fight is going on.
 */
export const WalkPresence = memo(function WalkPresence({ state }: { state: GameState }) {
  const poses = usePresence((s) => s.poses);
  // When each seat last attacked, from the attack counter changing.
  const last = useRef<{ attacks: number; at: number }[]>([]);
  const [, tick] = useState(0);
  useEffect(() => {
    const now = performance.now();
    poses.forEach((p, i) => {
      if (!p) return;
      const l = last.current[i];
      if (!l || l.attacks !== p.attacks) last.current[i] = { attacks: p.attacks, at: l ? now : -Infinity };
    });
  }, [poses]);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const here = poses.map((p, i) => (p && state.players[i] ? { seat: i, p } : null)).filter((x): x is NonNullable<typeof x> => !!x);
  const duel = state.phase.kind === 'duel' ? state.phase : null;
  const now = performance.now();
  const fighting = (a: number) => now - (last.current[a]?.at ?? -Infinity) < 2500;
  const fights: { x: number; y: number }[] = [];
  for (let i = 0; i < here.length; i++)
    for (let j = i + 1; j < here.length; j++) {
      const a = here[i];
      const b = here[j];
      const near = Math.hypot(a.p.x - b.p.x, a.p.z - b.p.z) < 9;
      const inDuel = duel && [a.seat, b.seat].every((s) => s === duel.challenger || s === duel.target);
      if ((near && (fighting(a.seat) || fighting(b.seat))) || (inDuel && near))
        fights.push({ x: ((a.p.x + b.p.x) / 2) * TO_BOARD, y: ((a.p.z + b.p.z) / 2) * TO_BOARD });
    }
  if (!here.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 8 }} data-testid="walk-presence">
      {here.map(({ seat, p }) => {
        const pos = toPercent({ x: p.x * TO_BOARD, y: p.z * TO_BOARD });
        const color = COLOR_HEX[state.players[seat].color];
        return (
          <div
            key={seat}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: pos.left, top: pos.top }}
            title={`${state.players[seat].name} is in the 3D walk`}
          >
            <span className="walk-ripple absolute inset-0 rounded-full" style={{ borderColor: color }} />
            <span
              className="grid h-4 w-4 place-items-center rounded-full border border-[#090a0b] text-[#090a0b] opacity-85 shadow-panel"
              style={{ background: color }}
            >
              <Icon name="user" size={10} />
            </span>
          </div>
        );
      })}
      {fights.map((f, i) => {
        const pos = toPercent(f);
        return (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-[140%] rounded-full border border-blood bg-abyss/85 p-0.5 text-ember"
            style={{ left: pos.left, top: pos.top }}
            title="A fight in the 3D walk"
          >
            <Icon name="duel" size={14} />
          </div>
        );
      })}
    </div>
  );
});
