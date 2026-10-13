import { AnimatePresence, motion } from 'framer-motion';
import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  TERRAIN_RESOURCE,
  activeActor,
  isDistanceLegal,
  legalCausewaySpots,
  legalCitadelSpots,
  legalOutpostSpots,
  pips,
  touchesOwnCauseway,
  type Action,
  type Board as BoardT,
  type EdgeId,
  type GameState,
  type PlayerColor,
  type Sigil,
  type VertexId,
} from '@hexfall/engine';
import { ResGlyphSvg, CausewayPiece, CitadelPiece, NumberToken, OutpostPiece, WraithPawn } from '../../art/pieces/Pieces';
import { TerrainArt } from '../../art/terrain/TerrainArt';
import { HARBOR_NAME, TERRAIN_NAME } from '../../lexicon';
import { useStore, type Fx } from '../../state/store';
import { BoardDefs } from './BoardDefs';
import {
  HEX_PATH,
  ISLAND_PATH,
  VIEWBOX,
  VIEWBOX_STR,
  edgeXY,
  hexCenter,
  hexPoints,
  toPercent,
  topo,
  vertexXY,
} from './geometry';
import { HexTooltip } from './HexTooltip';
import { Ambient, Harbors, MoonShimmer, Moonlight, Sea, Shore } from './Scenery';

/** Fades the square sea into the page so the board floats in the dark. */
const SEA_MASK = {
  maskImage: 'radial-gradient(ellipse 62% 62% at 50% 50%, #000 70%, transparent 100%)',
  WebkitMaskImage: 'radial-gradient(ellipse 62% 62% at 50% 50%, #000 70%, transparent 100%)',
};

/** Promote each board layer so the browser caches it independently. */
const LAYER = {} as const;

type Targets =
  | { kind: 'vertex'; spots: VertexId[]; piece: 'outpost' | 'citadel'; make: (v: VertexId) => Action }
  | { kind: 'edge'; spots: EdgeId[]; make: (e: EdgeId) => Action }
  | { kind: 'hex'; spots: number[]; make: (h: number) => Action }
  | null;

export function useTargets(state: GameState | undefined, canAct: boolean): Targets {
  const mode = useStore((s) => s.mode);
  return useMemo(() => {
    if (!state || !canAct) return null;
    const p = activeActor(state);
    const ph = state.phase;
    if (ph.kind === 'setup') {
      return ph.step === 'outpost'
        ? { kind: 'vertex', piece: 'outpost', spots: legalOutpostSpots(state, p), make: (vertex) => ({ type: 'PlaceSetupOutpost', player: p, vertex }) }
        : { kind: 'edge', spots: legalCausewaySpots(state, p), make: (edge) => ({ type: 'PlaceSetupCauseway', player: p, edge }) };
    }
    if (ph.kind === 'decree') {
      return { kind: 'edge', spots: legalCausewaySpots(state, p), make: (edge) => ({ type: 'BuildCauseway', player: p, edge }) };
    }
    if (ph.kind === 'move-wraith') {
      return {
        kind: 'hex',
        spots: state.board.hexes.map((h) => h.id).filter((h) => h !== state.wraithHex),
        make: (hex) => ({ type: 'MoveWraith', player: p, hex }),
      };
    }
    if (ph.kind === 'main' && mode) {
      if (mode === 'causeway') {
        return { kind: 'edge', spots: legalCausewaySpots(state, p), make: (edge) => ({ type: 'BuildCauseway', player: p, edge }) };
      }
      if (mode === 'outpost') {
        return { kind: 'vertex', piece: 'outpost', spots: legalOutpostSpots(state, p), make: (vertex) => ({ type: 'BuildOutpost', player: p, vertex }) };
      }
      return { kind: 'vertex', piece: 'citadel', spots: legalCitadelSpots(state, p), make: (vertex) => ({ type: 'BuildCitadel', player: p, vertex }) };
    }
    return null;
  }, [state, canAct, mode]);
}

// ------------------------------------------------------------------ static layers

/** Swell lines (and, on the first set, fog banks). The wrapper drifts them with a compositor-only transform. */
const Swell = memo(function Swell({ rows, fog }: { rows: number[]; fog?: boolean }) {
  return (
    <svg viewBox={VIEWBOX_STR} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
      {rows.map((i) => {
        const y = -480 + i * 120;
        return (
          <path
            key={i}
            d={`M-760 ${y}q40 -10 80 0${'t80 0'.repeat(18)}`}
            stroke="#4f8890"
            strokeOpacity={0.18}
            strokeWidth={1.4}
            fill="none"
            strokeDasharray="60 60"
            strokeDashoffset={i * 37}
          />
        );
      })}
      {fog && (
        <>
          <ellipse cx={-380} cy={-430} rx={300} ry={80} fill="url(#g-fog)" opacity={0.7} />
          <ellipse cx={360} cy={460} rx={340} ry={90} fill="url(#g-fog)" opacity={0.7} />
          <ellipse cx={480} cy={-120} rx={120} ry={230} fill="url(#g-fog)" opacity={0.45} />
        </>
      )}
    </svg>
  );
});

/** The board is a pure function of (seed, mode); state clones must not re-render it. */
const sameBoard = (a: { board: BoardT }, b: { board: BoardT }) =>
  a.board.seed === b.board.seed && a.board.mode === b.board.mode;

const Island = memo(function Island({ board }: { board: BoardT }) {
  return (
    <g>
      <Shore />
      {board.hexes.map((h) => {
        const c = hexCenter(h.id);
        return (
          <g key={h.id} transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}>
            <g clipPath="url(#hexClip)">
              <TerrainArt type={h.terrain} seed={`${board.seed}:${h.id}`} />
              <path d={HEX_PATH} fill="url(#g-tile-vignette)" />
            </g>
            {/* bevel: soft inner edge, light upper-left rim */}
            <polygon points={hexPoints(96.5)} fill="none" stroke="#000" strokeOpacity={0.3} strokeWidth={4} />
            <polygon points={hexPoints(98.5)} fill="none" stroke="url(#g-bevel-light)" strokeWidth={2.4} />
          </g>
        );
      })}
      {/* one shared grain pass over the whole board */}
      <path d={ISLAND_PATH} fill="#fff" filter="url(#f-noise)" opacity={0.22} style={{ mixBlendMode: 'multiply' }} />
      <Moonlight />
      {/* iron seams between tiles */}
      {board.hexes.map((h) => {
        const c = hexCenter(h.id);
        return (
          <polygon
            key={h.id}
            points={hexPoints(100)}
            transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}
            fill="none"
            stroke="#15110a"
            strokeOpacity={0.85}
            strokeWidth={2}
          />
        );
      })}
    </g>
  );
}, sameBoard);

const Tokens = memo(function Tokens({ board, colorblind }: { board: BoardT; colorblind: boolean }) {
  return (
    <g pointerEvents="none">
      {board.hexes.map((h) => {
        const c = hexCenter(h.id);
        const res = TERRAIN_RESOURCE[h.terrain];
        return (
          <g key={h.id} transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}>
            {h.token !== null && (
              <g transform="translate(0 6)">
                <NumberToken n={h.token} />
              </g>
            )}
            {colorblind && res && (
              <g transform="translate(0 -66)">
                <circle r={11} fill="#0d0e12" stroke="#c9a24b" strokeWidth={1} opacity={0.9} />
                <ResGlyphSvg res={res} size={14} color="#e6dfcf" />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}, (a, b) => sameBoard(a, b) && a.colorblind === b.colorblind);

// ------------------------------------------------------------------ board

export interface BoardProps {
  state: GameState;
  canAct: boolean;
  decorative?: boolean;
  onAction?: (a: Action) => void;
}

/** Stacking order of the board layers (all absolutely positioned in one box). */
const Z = { sea: 0, swell: 1, land: 2, ambient: 3, glow: 4, pulse: 5, pieces: 6, wraith: 7, chips: 8, hits: 9, tip: 10 } as const;
const layer = (z: number) => ({ zIndex: z }) as const;

export const BoardView = memo(function BoardView({ state, canAct, decorative = false, onAction }: BoardProps) {
  const targets = useTargets(decorative ? undefined : state, canAct);
  const production = useStore((s) => (decorative ? null : s.fx.production));
  const colorblind = useStore((s) => s.settings.colorblind);
  const fire = useCallback((a: Action) => onAction?.(a), [onAction]);

  return (
    <div
      className="relative mx-auto w-full"
      style={{ aspectRatio: `${VIEWBOX.w} / ${VIEWBOX.h}` }}
      role={decorative ? undefined : 'group'}
      aria-label={decorative ? undefined : 'The board'}
      aria-hidden={decorative || undefined}
    >
      {/* Static layers are painted once and cached. Nothing inside a large SVG animates:
          motion is limited to opacity/transform on whole layers, which the compositor
          applies without repainting (cheap even without GPU rasterisation). */}
      <div className="pointer-events-none absolute inset-0" style={{ ...layer(Z.sea), ...(decorative ? null : SEA_MASK) }}>
        <svg viewBox={VIEWBOX_STR} className="absolute inset-0 h-full w-full" style={LAYER} aria-hidden>
          <BoardDefs />
          <Sea />
        </svg>
      </div>
      {!decorative && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ ...layer(Z.swell), ...SEA_MASK }}>
          <div className="anim-swell absolute inset-0">
            <Swell rows={[0, 2, 4, 6, 8]} fog />
          </div>
          <div className="anim-swell-slow absolute inset-0">
            <Swell rows={[1, 3, 5, 7]} />
          </div>
          <MoonShimmer />
        </div>
      )}
      <svg viewBox={VIEWBOX_STR} className="pointer-events-none absolute inset-0 h-full w-full" style={{ ...LAYER, ...layer(Z.land) }} aria-hidden>
        <Island board={state.board} />
        <Harbors board={state.board} />
        <Tokens board={state.board} colorblind={colorblind} />
      </svg>

      <div className="pointer-events-none absolute inset-0" style={layer(Z.ambient)}>
        <Ambient board={state.board} still={decorative} />
      </div>
      <Torchlight buildings={state.buildings} still={decorative} />
      {production && <ProductionGlow board={state.board} production={production} />}
      <PiecesLayer state={state} decorative={decorative} />
      <WraithLayer hex={state.wraithHex} />
      {production && (
        <svg viewBox={VIEWBOX_STR} className="pointer-events-none absolute inset-0 h-full w-full" style={layer(Z.chips)} aria-hidden>
          <GainChips key={production.seq} state={state} hexes={production.hexes} />
        </svg>
      )}
      {!decorative && <HitLayer state={state} targets={targets} fire={fire} />}
    </div>
  );
});

/** Pools of torchlight under the holdings; the whole layer flickers as one. */
const Torchlight = memo(function Torchlight({ buildings, still }: { buildings: GameState['buildings']; still: boolean }) {
  const keys = Object.keys(buildings);
  if (!keys.length) return null;
  return (
    <svg
      viewBox={VIEWBOX_STR}
      className={`pointer-events-none absolute inset-0 h-full w-full ${still ? '' : 'anim-torchlight'}`}
      style={layer(Z.glow)}
      aria-hidden
    >
      {keys.map((v) => {
        const p = vertexXY(v);
        return <circle key={v} cx={p.x} cy={p.y} r={buildings[v].kind === 'citadel' ? 90 : 70} fill="url(#g-torchlight)" />;
      })}
    </svg>
  );
});

/** Gold rims on the hexes that paid out and halos on the rolled number, pulsing as one layer. */
const ProductionGlow = memo(
  function ProductionGlow({ board, production }: { board: BoardT; production: NonNullable<Fx['production']> }) {
    return (
      <svg viewBox={VIEWBOX_STR} className="anim-pulse pointer-events-none absolute inset-0 h-full w-full" style={layer(Z.pulse)} aria-hidden>
        {production.hexes.map((h) => {
          const c = hexCenter(h);
          return (
            <polygon
              key={h}
              points={hexPoints(93)}
              transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}
              fill="rgba(255,215,120,0.08)"
              stroke="#e8c26a"
              strokeWidth={5}
            />
          );
        })}
        {board.hexes
          .filter((h) => h.token === production.roll)
          .map((h) => {
            const c = hexCenter(h.id);
            return (
              <g key={h.id} transform={`translate(${c.x.toFixed(1)} ${(c.y + 6).toFixed(1)})`}>
                <circle r={30} fill="none" stroke="#ffd77a" strokeOpacity={0.5} strokeWidth={6} />
                <circle r={24.5} fill="none" stroke="#f3cf73" strokeWidth={2.5} />
              </g>
            );
          })}
      </svg>
    );
  },
  (a, b) => a.production.seq === b.production.seq && sameBoard(a, b),
);

/** Causeways and holdings. Only a freshly placed piece animates. */
const PiecesLayer = memo(function PiecesLayer({ state, decorative }: { state: GameState; decorative: boolean }) {
  const placed = useStore((s) => (decorative ? null : s.fx.placed));
  const hoverPlayer = useStore((s) => (decorative ? null : s.hoverPlayer));
  const dim = (owner: number) => (hoverPlayer !== null && hoverPlayer !== owner ? 0.3 : 1);
  const fade = { transition: 'opacity 160ms ease' };
  return (
    <svg viewBox={VIEWBOX_STR} className="pointer-events-none absolute inset-0 h-full w-full" style={layer(Z.pieces)} aria-hidden>
      {Object.entries(state.causeways).map(([e, owner]) => {
        const g = edgeXY(e);
        const pl = state.players[owner];
        const piece = (
          <g transform={`translate(${g.mid.x.toFixed(1)} ${g.mid.y.toFixed(1)}) rotate(${g.angle.toFixed(1)})`}>
            <CausewayPiece color={pl.color} rim={owner === state.currentPlayer && !decorative} />
          </g>
        );
        return placed?.key === e ? (
          <motion.g
            key={e}
            initial={{ opacity: 0, scale: 1.4 }}
            animate={{ opacity: dim(owner), scale: 1 }}
            transition={{ duration: 0.28, ease: 'easeIn' }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          >
            {piece}
          </motion.g>
        ) : (
          <g key={e} opacity={dim(owner)} style={fade}>
            {piece}
          </g>
        );
      })}
      {Object.entries(state.buildings)
        .sort((a, b) => vertexXY(a[0]).y - vertexXY(b[0]).y)
        .map(([v, b]) => {
          const p = vertexXY(v);
          const pl = state.players[b.owner];
          const rim = b.owner === state.currentPlayer && !decorative;
          const piece = (
            <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(1.3)`}>
              {b.kind === 'outpost' ? (
                <OutpostPiece color={pl.color} sigil={pl.sigil} rim={rim} />
              ) : (
                <CitadelPiece color={pl.color} sigil={pl.sigil} rim={rim} />
              )}
            </g>
          );
          return placed?.key === v ? (
            <motion.g
              key={`${v}-${b.kind}`}
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: dim(b.owner) }}
              transition={{ duration: 0.32, ease: [0.5, 0, 0.9, 0.6] }}
            >
              {piece}
              <DustPuff x={p.x} y={p.y} />
            </motion.g>
          ) : (
            <g key={`${v}-${b.kind}`} opacity={dim(b.owner)} style={fade}>
              {piece}
            </g>
          );
        })}
    </svg>
  );
});

/** The Wraith floats in its own small layer so its bobbing never repaints the board. */
const WRAITH_BOX = 110;
const WraithLayer = memo(function WraithLayer({ hex }: { hex: number }) {
  const c = hexCenter(hex);
  const pos = toPercent({ x: c.x + 34, y: c.y - 18 });
  const w = `${(WRAITH_BOX / VIEWBOX.w) * 100}%`;
  return (
    <div className="pointer-events-none absolute inset-0" style={layer(Z.wraith)}>
      <AnimatePresence initial={false}>
        <motion.div
          key={hex}
          className="absolute"
          style={{ left: `calc(${pos.left} - ${w} / 2)`, top: `calc(${pos.top} - ${(WRAITH_BOX / VIEWBOX.h) * 50}%)`, width: w, aspectRatio: '1' }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.5 }}
          transition={{ duration: 0.6 }}
        >
          <div className="anim-bob h-full w-full">
            <svg viewBox={`${-WRAITH_BOX / 2} ${-WRAITH_BOX / 2} ${WRAITH_BOX} ${WRAITH_BOX}`} className="h-full w-full overflow-visible">
              <title>The robber</title>
              <WraithPawn />
            </svg>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

/**
 * Everything interactive: hex hit areas (Wraith targets + tooltips), placement targets and
 * their ghost previews. Hover state lives here and each spot is memoised, so moving the mouse
 * re-renders at most the two spots whose hover state changed.
 */
function HitLayer({ state, targets, fire }: { state: GameState; targets: Targets; fire: (a: Action) => void }) {
  const setHoverHex = useStore((s) => s.setHoverHex);
  const hoverHex = useStore((s) => s.hoverHex);
  const showWhy = useStore((s) => s.settings.showWhy);
  const [hoverTarget, setHoverTarget] = useState<string | null>(null);
  const actor = activeActor(state);
  const me = state.players[actor];

  // Stable handlers: spots only re-render when their own props change.
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const fireSpot = useCallback(
    (id: string) => {
      const t = targetsRef.current;
      if (!t) return;
      setHoverTarget(null);
      if (t.kind === 'hex') fire(t.make(Number(id.slice(1))));
      else if (t.kind === 'vertex') fire(t.make(id));
      else fire(t.make(id));
    },
    [fire],
  );
  const hover = useCallback((id: string | null) => setHoverTarget(id), []);
  const enterHex = useCallback(
    (hex: number, isTarget: boolean) => {
      setHoverHex(hex);
      if (isTarget) setHoverTarget(`h${hex}`);
    },
    [setHoverHex],
  );

  // Illegal vertices with reasons ("show why" mode).
  const whyVertices = useMemo(() => {
    if (!showWhy || !targets || targets.kind !== 'vertex' || targets.piece !== 'outpost') return [];
    const legal = new Set(targets.spots);
    return topo.vertices
      .filter((v) => !legal.has(v))
      .map((v) => ({
        v,
        why: state.buildings[v]
          ? 'Occupied'
          : !isDistanceLegal(state, v)
            ? 'Too close to another settlement'
            : !touchesOwnCauseway(state, actor, v)
              ? 'Not connected to your road'
              : 'Not allowed',
      }));
  }, [showWhy, targets, state, actor]);

  // Accessible names are worth computing once per set of targets, not per hover.
  const labels = useMemo(() => {
    if (!targets || targets.kind === 'hex') return null;
    const out: Record<string, string> = {};
    for (const id of targets.spots) {
      out[id] =
        targets.kind === 'vertex'
          ? `${targets.piece === 'citadel' ? 'Upgrade to a City' : 'Place a Settlement'} at ${vertexLabel(state, id)}`
          : `Build a Road ${edgeLabel(state, id)}`;
    }
    return out;
    // Labels depend only on the board and the spots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, state.board.seed]);

  const hexTargets = targets?.kind === 'hex' ? new Set(targets.spots) : null;

  return (
    <>
      {targets && targets.kind !== 'hex' && <TargetMarkers kind={targets.kind} spots={targets.spots} />}

      <svg viewBox={VIEWBOX_STR} className="absolute inset-0 h-full w-full select-none" style={layer(Z.hits)} onMouseLeave={() => setHoverHex(null)}>
        {/* hex hover / wraith targets */}
        {state.board.hexes.map((h) => (
          <HexHit
            key={h.id}
            hex={h.id}
            label={hexTargets?.has(h.id) ? `Move the robber to ${TERRAIN_NAME[h.terrain]}${h.token ? ` (${h.token})` : ''}` : null}
            hovered={hoverTarget === `h${h.id}`}
            onEnter={enterHex}
            onHover={hover}
            onFire={fireSpot}
          />
        ))}

        {/* show-why: illegal spots */}
        {whyVertices.map(({ v, why }) => {
          const p = vertexXY(v);
          return (
            <circle key={v} cx={p.x} cy={p.y} r={7} fill="#3a1015" stroke="#8b1e2d" strokeWidth={1} opacity={0.6}>
              <title>{why}</title>
            </circle>
          );
        })}

        {/* placement targets: a ghost of the piece while hovered, otherwise only a hit area */}
        {targets &&
          targets.kind !== 'hex' &&
          labels &&
          targets.spots.map((id) => (
            <Spot
              key={id}
              id={id}
              kind={targets.kind === 'vertex' ? targets.piece : 'causeway'}
              label={labels[id] ?? ''}
              hovered={hoverTarget === id}
              color={me.color}
              sigil={me.sigil}
              onHover={hover}
              onFire={fireSpot}
            />
          ))}
      </svg>
      {hoverHex !== null && !targets && (
        <div className="pointer-events-none absolute inset-0" style={layer(Z.tip)}>
          <HexTooltip state={state} hex={hoverHex} />
        </div>
      )}
    </>
  );
}

/** Pulsing markers on every legal spot, drawn as one layer whose opacity the compositor animates. */
const TargetMarkers = memo(function TargetMarkers({ kind, spots }: { kind: 'vertex' | 'edge'; spots: string[] }) {
  return (
    <svg viewBox={VIEWBOX_STR} className="anim-pulse pointer-events-none absolute inset-0 h-full w-full" style={layer(Z.pulse)} aria-hidden>
      {kind === 'vertex'
        ? spots.map((v) => {
            const p = vertexXY(v);
            return (
              <g key={v} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
                <circle r={12} fill="url(#g-ember)" />
                <circle r={5} fill="#ffcf8a" stroke="#e0702a" strokeWidth={1.5} />
              </g>
            );
          })
        : spots.map((e) => {
            const g = edgeXY(e);
            return (
              <g key={e} transform={`translate(${g.mid.x.toFixed(1)} ${g.mid.y.toFixed(1)}) rotate(${g.angle.toFixed(1)})`}>
                <rect x={-24} y={-3.5} width={48} height={7} rx={3.5} fill="#ffcf8a" opacity={0.85} />
                <rect x={-27} y={-7} width={54} height={14} rx={7} fill="url(#g-ember)" opacity={0.8} />
              </g>
            );
          })}
    </svg>
  );
});

const onKey = (fire: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fire();
  }
};

const HexHit = memo(function HexHit({
  hex,
  label,
  hovered,
  onEnter,
  onHover,
  onFire,
}: {
  hex: number;
  label: string | null;
  hovered: boolean;
  onEnter: (hex: number, isTarget: boolean) => void;
  onHover: (id: string | null) => void;
  onFire: (id: string) => void;
}) {
  const c = hexCenter(hex);
  const isTarget = label !== null;
  const id = `h${hex}`;
  return (
    <path
      d={HEX_PATH}
      transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}
      fill={isTarget && hovered ? 'rgba(160,210,255,0.16)' : 'transparent'}
      stroke={isTarget ? '#9fd2ff' : 'none'}
      strokeOpacity={isTarget ? (hovered ? 0.9 : 0.3) : 0}
      strokeWidth={isTarget ? 3 : 0}
      className={isTarget ? 'cursor-pointer' : undefined}
      onMouseEnter={() => onEnter(hex, isTarget)}
      onMouseLeave={isTarget ? () => onHover(null) : undefined}
      onClick={isTarget ? () => onFire(id) : undefined}
      onKeyDown={isTarget ? onKey(() => onFire(id)) : undefined}
      onFocus={isTarget ? () => onHover(id) : undefined}
      tabIndex={isTarget ? 0 : -1}
      role={isTarget ? 'button' : undefined}
      aria-label={label ?? undefined}
    />
  );
});

const Spot = memo(function Spot({
  id,
  kind,
  label,
  hovered,
  color,
  sigil,
  onHover,
  onFire,
}: {
  id: string;
  kind: 'outpost' | 'citadel' | 'causeway';
  label: string;
  hovered: boolean;
  color: PlayerColor;
  sigil: Sigil;
  onHover: (id: string | null) => void;
  onFire: (id: string) => void;
}) {
  let transform: string;
  if (kind === 'causeway') {
    const g = edgeXY(id);
    transform = `translate(${g.mid.x.toFixed(1)} ${g.mid.y.toFixed(1)}) rotate(${g.angle.toFixed(1)})`;
  } else {
    const p = vertexXY(id);
    transform = `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`;
  }
  return (
    <g
      transform={transform}
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={label}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
      onClick={() => onFire(id)}
      onKeyDown={onKey(() => onFire(id))}
    >
      {hovered && (
        <g pointerEvents="none">
          {kind === 'causeway' ? (
            <CausewayPiece color={color} ghost />
          ) : (
            <g transform="scale(1.3)">
              {kind === 'outpost' ? <OutpostPiece color={color} sigil={sigil} ghost /> : <CitadelPiece color={color} sigil={sigil} ghost />}
            </g>
          )}
        </g>
      )}
      {/* persistent hit target on top so re-renders never swallow the click */}
      {kind === 'causeway' ? <rect x={-30} y={-13} width={60} height={26} fill="transparent" /> : <circle r={22} fill="transparent" />}
    </g>
  );
});

function DustPuff({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y + 12})`}>
      {[-1, 1].map((d) => (
        <motion.circle
          key={d}
          r={6}
          fill="#cbbfa6"
          initial={{ opacity: 0.6, cx: 0, cy: 0, scale: 0.5 }}
          animate={{ opacity: 0, cx: d * 22, cy: -6, scale: 1.8 }}
          transition={{ duration: 0.7, delay: 0.28 }}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <motion.circle
          key={`e${i}`}
          r={1.6}
          fill="#ffb066"
          initial={{ opacity: 1, cx: 0, cy: 0 }}
          animate={{ opacity: 0, cx: (i - 1) * 14, cy: -26 - i * 6 }}
          transition={{ duration: 0.9, delay: 0.3 }}
        />
      ))}
    </g>
  );
}

function GainChips({ state, hexes }: { state: GameState; hexes: number[] }) {
  const chips: { key: string; x: number; y: number; n: number; res: NonNullable<(typeof TERRAIN_RESOURCE)[keyof typeof TERRAIN_RESOURCE]> }[] = [];
  for (const h of hexes) {
    const res = TERRAIN_RESOURCE[state.board.hexes[h].terrain];
    if (!res) continue;
    const c = hexCenter(h);
    for (const v of topo.hexVertices[h]) {
      const b = state.buildings[v];
      if (!b) continue;
      const p = vertexXY(v);
      // nudge the chip toward the producing hex so chips from different hexes don't overlap
      chips.push({ key: `${h}-${v}`, x: p.x + (c.x - p.x) * 0.32, y: p.y + (c.y - p.y) * 0.32, n: b.kind === 'citadel' ? 2 : 1, res });
    }
  }
  return (
    <g className="pointer-events-none">
      {chips.map((c, i) => (
        <motion.g
          key={c.key}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 1, 1, 0], y: [-0, -26, -34, -44] }}
          transition={{ duration: 2.6, delay: 0.75 + i * 0.05, times: [0, 0.15, 0.75, 1] }}
        >
          <g transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}>
            <rect x={-25} y={-13} width={50} height={26} rx={13} fill="#14160f" stroke="#6fa058" strokeWidth={1.5} />
            <text x={-9} y={6} textAnchor="middle" fontFamily="Cinzel, serif" fontWeight={700} fontSize={15} fill="#9fd07f">
              +{c.n}
            </text>
            <g transform="translate(10 0)">
              <ResGlyphSvg res={c.res} size={16} />
            </g>
          </g>
        </motion.g>
      ))}
    </g>
  );
}

function vertexLabel(state: GameState, v: VertexId): string {
  const parts = topo.vertexHexes[v].map((h) => {
    const hex = state.board.hexes[h];
    return `${TERRAIN_NAME[hex.terrain]}${hex.token ? ` ${hex.token}` : ''}`;
  });
  const harbor = state.board.harbors.find((hb) => hb.vertices.includes(v));
  return `${parts.join(', ')}${harbor ? `, ${HARBOR_NAME[harbor.kind]}` : ''}`;
}

function edgeLabel(state: GameState, e: EdgeId): string {
  const hs = topo.edgeHexes[e].map((h) => TERRAIN_NAME[state.board.hexes[h].terrain]);
  return `along ${hs.join(' and ')}`;
}

export { toPercent, pips };
