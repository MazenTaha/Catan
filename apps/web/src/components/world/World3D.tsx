import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { TERRAIN_RESOURCE, getTopology, type GameState } from '@hexfall/engine';
import { audio } from '../../audio/engine';
import { COLOR_HEX, RESOURCE_NAME, TERRAIN_NAME } from '../../lexicon';
import { liteEffects, prefersReducedMotion, useStore } from '../../state/store';
import { World } from './world';

const topo = getTopology();
const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
]);

/** Land tiles touching the seat's settlements and cities, pastures first. */
function landsOf(state: GameState, seat: number): number[] {
  const set = new Set<number>();
  for (const [v, b] of Object.entries(state.buildings))
    if (b.owner === seat) topo.vertexHexes[v].forEach((h) => set.add(h));
  const all = set.size ? [...set] : state.board.hexes.map((h) => h.id);
  const rank = (h: number) => (state.board.hexes[h].terrain === 'moors' ? 0 : 1);
  return all.sort((a, b) => rank(a) - rank(b) || a - b);
}

interface Props {
  state: GameState;
  seat: number;
  /** True when the seat has to place something on the board (only possible in 2D). */
  needsBoard: boolean;
  onExit(): void;
}

/**
 * First-person walk over the island: WASD / arrows to move, drag to look, a thumb-stick on
 * touch screens. The 3D world mirrors the live game (roads, settlements, cities, robber).
 */
export default function World3D({ state, seat, needsBoard, onExit }: Props) {
  const lite = useStore((s) => liteEffects(s.settings));
  const reduce = useStore((s) => prefersReducedMotion(s.settings));
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const [hex, setHex] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const touch = useMemo(
    () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches,
    [],
  );
  const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const lands = useMemo(() => landsOf(state, seat), [state, seat]);
  const landIdx = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const landsRef = useRef(lands);
  landsRef.current = lands;

  // The world is built once per board; pieces are synced below.
  const boardSeed = state.board.seed;
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let world: World;
    try {
      world = new World(canvas, stateRef.current.board, {
        lite,
        reduceMotion: reduce,
        onHexChange: setHex,
        onBleat: () => audio.play('bleat'),
      });
    } catch {
      setFailed(true);
      return;
    }
    worldRef.current = world;
    world.setPieces(stateRef.current);
    landIdx.current = 0;
    world.goTo(landsRef.current[0] ?? 0);
    const ro = new ResizeObserver(() => world.resize(wrap.clientWidth, wrap.clientHeight));
    ro.observe(wrap);
    world.resize(wrap.clientWidth, wrap.clientHeight);
    wrap.focus({ preventScroll: true });
    return () => {
      ro.disconnect();
      world.dispose();
      worldRef.current = null;
    };
  }, [boardSeed, lite, reduce]);

  const piecesKey = useMemo(
    () => JSON.stringify([state.buildings, state.causeways, state.wraithHex]),
    [state.buildings, state.causeways, state.wraithHex],
  );
  useEffect(() => {
    worldRef.current?.setPieces(stateRef.current);
  }, [piecesKey]);

  useEffect(() => {
    if (!showHelp) return;
    const id = window.setTimeout(() => setShowHelp(false), 9000);
    return () => window.clearTimeout(id);
  }, [showHelp]);

  // ------------------------------------------------------------ input

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!MOVE_KEYS.has(e.code)) return;
    e.preventDefault();
    worldRef.current?.keys.add(e.code);
  };
  const onKeyUp = (e: React.KeyboardEvent) => worldRef.current?.keys.delete(e.code);
  const clearKeys = () => worldRef.current?.keys.clear();

  const drags = useRef(
    new Map<number, { x: number; y: number; stick: boolean; ox: number; oy: number }>(),
  );
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const wrap = wrapRef.current!;
    wrap.focus({ preventScroll: true });
    const r = wrap.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    // On touch screens the lower-left area is a thumb-stick; everywhere else drags the view.
    const isStick = e.pointerType !== 'mouse' && x < r.width * 0.45 && y > r.height * 0.45;
    if (isStick) setStick({ ox: x, oy: y, x, y });
    drags.current.set(e.pointerId, { x: e.clientX, y: e.clientY, stick: isStick, ox: x, oy: y });
    wrap.setPointerCapture(e.pointerId);
    setShowHelp(false);
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drags.current.get(e.pointerId);
    const world = worldRef.current;
    if (!d || !world) return;
    if (d.stick) {
      const r = wrapRef.current!.getBoundingClientRect();
      const max = 46;
      let dx = e.clientX - r.left - d.ox;
      let dy = e.clientY - r.top - d.oy;
      const l = Math.hypot(dx, dy);
      if (l > max) {
        dx = (dx / l) * max;
        dy = (dy / l) * max;
      }
      world.joy.x = dx / max;
      world.joy.y = dy / max;
      setStick({ ox: d.ox, oy: d.oy, x: d.ox + dx, y: d.oy + dy });
    } else {
      world.look(e.clientX - d.x, e.clientY - d.y);
      d.x = e.clientX;
      d.y = e.clientY;
    }
  };
  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drags.current.get(e.pointerId);
    drags.current.delete(e.pointerId);
    if (d?.stick) {
      setStick(null);
      if (worldRef.current) worldRef.current.joy.x = worldRef.current.joy.y = 0;
    }
  };

  const nextLand = () => {
    const list = landsRef.current;
    if (!list.length) return;
    landIdx.current = (landIdx.current + 1) % list.length;
    worldRef.current?.goTo(list[landIdx.current]);
    wrapRef.current?.focus({ preventScroll: true });
  };

  // ------------------------------------------------------------ HUD

  const tile = hex !== null ? state.board.hexes[hex] : null;
  const owners =
    hex !== null
      ? [
          ...new Set(
            topo.hexVertices[hex]
              .map((v) => state.buildings[v]?.owner)
              .filter((o): o is number => o !== undefined),
          ),
        ]
      : [];
  const res = tile ? TERRAIN_RESOURCE[tile.terrain] : null;

  return (
    <div
      ref={wrapRef}
      data-world3d
      tabIndex={0}
      role="application"
      aria-label="3D walk. Use W A S D or the arrow keys to walk, drag to look around."
      className="relative h-full w-full touch-none select-none overflow-hidden rounded-lg outline-none ring-gold/60 focus-visible:ring-2"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={clearKeys}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ cursor: 'grab', background: '#cfeaff' }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-abyss/90 p-6 text-center text-bone">
          <div>
            <p className="font-display text-lg text-gold">3D view unavailable</p>
            <p className="mt-1 text-sm text-muted">
              This browser couldn’t start WebGL. The 2D board still has everything you need.
            </p>
            <button className="btn mt-3" onClick={onExit}>
              Back to the 2D board
            </button>
          </div>
        </div>
      )}

      {!failed && (
        <>
          <div
            className="pointer-events-none absolute left-2 top-2 max-w-[70%] rounded-md bg-abyss/75 px-3 py-1.5 text-bone shadow-panel backdrop-blur-sm"
            aria-live="polite"
            data-testid="world-location"
          >
            {tile ? (
              <>
                <div className="font-display text-[15px] tracking-wide text-gold">
                  {TERRAIN_NAME[tile.terrain]}
                  {tile.token !== null && <span className="num ml-2 text-bone">{tile.token}</span>}
                </div>
                <div className="text-[12px] text-muted">
                  {res ? `Produces ${RESOURCE_NAME[res]}` : 'Produces nothing'}
                  {state.wraithHex === hex && (
                    <span className="text-ember"> · The robber is here</span>
                  )}
                </div>
                {owners.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-[12px]">
                    {owners.map((o) => (
                      <span key={o} className="flex items-center gap-1">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: COLOR_HEX[state.players[o].color] }}
                        />
                        {o === seat ? 'You' : state.players[o].name}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="font-display text-[15px] tracking-wide text-gold">The shore</div>
            )}
          </div>

          <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
            <button
              className="btn !px-3 !py-1 text-[12px]"
              onClick={nextLand}
              title="Jump to the next of your lands"
            >
              Next land
            </button>
          </div>

          {needsBoard && (
            <div className="absolute inset-x-0 top-14 mx-auto w-fit max-w-[90%] rounded-md bg-ember/90 px-3 py-1.5 text-center text-[13px] font-semibold text-abyss shadow-panel">
              Switch to the 2D board to place your pieces
            </div>
          )}

          {showHelp && (
            <div className="pointer-events-none absolute inset-x-0 bottom-12 mx-auto w-fit max-w-[92%] rounded-md bg-abyss/75 px-3 py-1.5 text-center text-[12px] text-bone backdrop-blur-sm">
              {touch ? (
                <>
                  Press and drag at the <b className="text-gold">bottom-left</b> to walk ·{' '}
                  <b className="text-gold">drag</b> elsewhere to look
                </>
              ) : (
                <>
                  <b className="text-gold">W A S D</b> or <b className="text-gold">arrows</b> to
                  walk · <b className="text-gold">drag</b> to look ·{' '}
                  <b className="text-gold">Shift</b> to run
                </>
              )}
            </div>
          )}

          {stick && (
            <div
              className="pointer-events-none absolute"
              style={{ left: stick.ox - 52, top: stick.oy - 52 }}
            >
              <div className="h-[104px] w-[104px] rounded-full border-2 border-white/60 bg-white/15" />
              <div
                className="absolute h-11 w-11 rounded-full bg-white/80 shadow-panel"
                style={{
                  left: 52 - 22 + (stick.x - stick.ox),
                  top: 52 - 22 + (stick.y - stick.oy),
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
