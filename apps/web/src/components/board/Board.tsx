import { AnimatePresence, motion } from 'framer-motion';
import { memo, useCallback, useMemo, useState, type KeyboardEvent } from 'react';
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
  type VertexId,
} from '@hexfall/engine';
import { ResGlyphSvg, CausewayPiece, CitadelPiece, HarborBadge, NumberToken, OutpostPiece, WraithPawn } from '../../art/pieces/Pieces';
import { TerrainArt } from '../../art/terrain/TerrainArt';
import { HARBOR_NAME, RESOURCE_NAME, TERRAIN_NAME } from '../../lexicon';
import { useStore } from '../../state/store';
import { BoardDefs } from './BoardDefs';
import {
  HEX_PATH,
  ISLAND_PATH,
  VIEWBOX,
  VIEWBOX_STR,
  edgeXY,
  harborGeometry,
  hexCenter,
  hexPoints,
  toPercent,
  topo,
  vertexXY,
} from './geometry';
import { HexTooltip } from './HexTooltip';

/** Fades the square sea into the page so the isle floats in the dark. */
const SEA_MASK = {
  maskImage: 'radial-gradient(ellipse 62% 62% at 50% 50%, #000 70%, transparent 100%)',
  WebkitMaskImage: 'radial-gradient(ellipse 62% 62% at 50% 50%, #000 70%, transparent 100%)',
};

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

const Sea = memo(function Sea() {
  return (
    <g aria-hidden>
      <rect x={VIEWBOX.x} y={VIEWBOX.y} width={VIEWBOX.w} height={VIEWBOX.h} fill="url(#g-sea)" />
      <rect x={VIEWBOX.x} y={VIEWBOX.y} width={VIEWBOX.w} height={VIEWBOX.h} fill="url(#g-sea-light)" />
      {/* distant jagged silhouettes at the board's edge */}
      <path
        d="M-575 -380L-540 -420L-520 -400L-495 -455L-470 -410L-450 -430L-430 -390L-410 -405V-545H-575Z M575 420L545 380L520 405L500 360L470 410L455 395L430 440L410 425V545H575Z M-575 380L-548 352L-530 372L-505 330L-488 360L-470 345L-455 385V545H-575Z M575 -420L550 -445L532 -425L510 -470L490 -430L470 -445L450 -400V-545H575Z"
        fill="#05090b"
        opacity={0.85}
      />
      <g className="anim-drift" opacity={0.5}>
        {[...Array(9)].map((_, i) => {
          const y = -480 + i * 120;
          return (
            <path
              key={i}
              d={`M-600 ${y}q40 -10 80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0t80 0`}
              stroke="#4f8890"
              strokeOpacity={0.18}
              strokeWidth={1.4}
              fill="none"
              strokeDasharray="60 60"
              className="anim-wave"
              style={{ animationDuration: `${8 + (i % 3) * 3}s` }}
            />
          );
        })}
      </g>
    </g>
  );
});

/** The board is a pure function of (seed, mode); state clones must not re-render it. */
const sameBoard = (a: { board: BoardT }, b: { board: BoardT }) =>
  a.board.seed === b.board.seed && a.board.mode === b.board.mode;

const Island = memo(function Island({ board }: { board: BoardT }) {
  return (
    <g>
      {/* foam rim and dark shallows */}
      <path d={ISLAND_PATH} fill="none" stroke="#1d3a40" strokeWidth={70} strokeLinejoin="round" opacity={0.7} />
      <path d={ISLAND_PATH} fill="none" stroke="#a9c3c0" strokeWidth={26} strokeLinejoin="round" opacity={0.16} filter="url(#f-blur6)" />
      <path d={ISLAND_PATH} fill="none" stroke="#6d6250" strokeWidth={12} strokeLinejoin="round" opacity={0.9} />
      <path d={ISLAND_PATH} fill="#000" />
      {board.hexes.map((h) => {
        const c = hexCenter(h.id);
        return (
          <g key={h.id} transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}>
            <g clipPath="url(#hexClip)">
              <TerrainArt type={h.terrain} seed={`${board.seed}:${h.id}`} />
              <path d={HEX_PATH} fill="url(#g-tile-vignette)" />
            </g>
            {/* bevel: dark inner edge, light upper-left rim */}
            <polygon points={hexPoints(96)} fill="none" stroke="#000" strokeOpacity={0.55} strokeWidth={6} />
            <polygon points={hexPoints(98.5)} fill="none" stroke="url(#g-bevel-light)" strokeWidth={2.4} />
          </g>
        );
      })}
      {/* one shared grain pass over the whole isle */}
      <path d={ISLAND_PATH} fill="#fff" filter="url(#f-noise)" opacity={0.55} style={{ mixBlendMode: 'multiply' }} />
      {/* iron seams between tiles */}
      {board.hexes.map((h) => {
        const c = hexCenter(h.id);
        return (
          <polygon
            key={h.id}
            points={hexPoints(100)}
            transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}
            fill="none"
            stroke="#0b0c0f"
            strokeWidth={2.5}
          />
        );
      })}
    </g>
  );
}, sameBoard);

const Harbors = memo(function Harbors({ board }: { board: BoardT }) {
  return (
    <g>
      {board.harbors.map((hb) => {
        const g = harborGeometry(hb);
        return (
          <g key={hb.id}>
            {[g.a, g.b].map((p, i) => (
              <g key={i}>
                <path d={`M${p.x} ${p.y}L${g.badge.x} ${g.badge.y}`} stroke="#120d08" strokeWidth={8} strokeLinecap="round" />
                <path
                  d={`M${p.x} ${p.y}L${g.badge.x} ${g.badge.y}`}
                  stroke="#5d4630"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeDasharray="5 2"
                />
              </g>
            ))}
            <g transform={`translate(${g.badge.x.toFixed(1)} ${g.badge.y.toFixed(1)}) scale(1.3)`}>
              <title>{`${HARBOR_NAME[hb.kind]} — ${hb.kind === 'any' ? '3:1 any resource' : `2:1 ${RESOURCE_NAME[hb.kind]}`}`}</title>
              <HarborBadge kind={hb.kind} />
            </g>
          </g>
        );
      })}
    </g>
  );
}, sameBoard);

const Tokens = memo(function Tokens({ board, glowRoll, colorblind }: { board: BoardT; glowRoll: number | null; colorblind: boolean }) {
  return (
    <g pointerEvents="none">
      {board.hexes.map((h) => {
        const c = hexCenter(h.id);
        const res = TERRAIN_RESOURCE[h.terrain];
        return (
          <g key={h.id} transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}>
            {h.token !== null && (
              <g transform="translate(0 6)">
                <NumberToken n={h.token} glow={glowRoll === h.token} />
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
}, (a, b) => sameBoard(a, b) && a.glowRoll === b.glowRoll && a.colorblind === b.colorblind);

// ------------------------------------------------------------------ board

export interface BoardProps {
  state: GameState;
  canAct: boolean;
  decorative?: boolean;
  onAction?: (a: Action) => void;
}

export const BoardView = memo(function BoardView({ state, canAct, decorative = false, onAction }: BoardProps) {
  const targets = useTargets(decorative ? undefined : state, canAct);
  const fx = useStore((s) => s.fx);
  const hoverPlayer = useStore((s) => s.hoverPlayer);
  const hoverHex = useStore((s) => s.hoverHex);
  const setHoverHex = useStore((s) => s.setHoverHex);
  const showWhy = useStore((s) => s.settings.showWhy);
  const colorblind = useStore((s) => s.settings.colorblind);
  const [hoverTarget, setHoverTarget] = useState<string | number | null>(null);

  const actor = activeActor(state);
  const me = state.players[actor];
  const production = fx.production;

  const fire = useCallback(
    (a: Action) => {
      setHoverTarget(null);
      onAction?.(a);
    },
    [onAction],
  );

  const keyFire = (a: Action) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fire(a);
    }
  };

  const dim = (owner: number) => (hoverPlayer !== null && hoverPlayer !== owner ? 0.3 : 1);

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
            ? 'Too close to another outpost'
            : !touchesOwnCauseway(state, actor, v)
              ? 'Not connected to your causeway'
              : 'Not allowed',
      }));
  }, [showWhy, targets, state, actor]);

  return (
    <div className="relative mx-auto w-full" style={{ aspectRatio: `${VIEWBOX.w} / ${VIEWBOX.h}` }}>
      <svg
        viewBox={VIEWBOX_STR}
        className="absolute inset-0 h-full w-full select-none"
        style={decorative ? undefined : SEA_MASK}
        role="group"
        aria-label="The Isle"
        onMouseLeave={() => setHoverHex(null)}
      >
        <BoardDefs />
        <Sea />
        <Island board={state.board} />
        <Harbors board={state.board} />

        {/* hex hover / wraith targets */}
        {!decorative &&
          state.board.hexes.map((h) => {
            const c = hexCenter(h.id);
            const isTarget = targets?.kind === 'hex' && targets.spots.includes(h.id);
            const action = isTarget && targets?.kind === 'hex' ? targets.make(h.id) : null;
            return (
              <path
                key={h.id}
                d={HEX_PATH}
                transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}
                fill={isTarget && hoverTarget === `h${h.id}` ? 'rgba(160,210,255,0.16)' : 'transparent'}
                stroke={isTarget ? '#9fd2ff' : 'none'}
                strokeOpacity={isTarget ? (hoverTarget === `h${h.id}` ? 0.9 : 0.3) : 0}
                strokeWidth={isTarget ? 3 : 0}
                className={isTarget ? 'cursor-pointer' : undefined}
                onMouseEnter={() => {
                  setHoverHex(h.id);
                  if (isTarget) setHoverTarget(`h${h.id}`);
                }}
                onMouseLeave={() => isTarget && setHoverTarget(null)}
                onClick={action ? () => fire(action) : undefined}
                onKeyDown={action ? keyFire(action) : undefined}
                onFocus={() => isTarget && setHoverTarget(`h${h.id}`)}
                tabIndex={isTarget ? 0 : -1}
                role={isTarget ? 'button' : undefined}
                aria-label={
                  isTarget
                    ? `Send the Wraith to ${TERRAIN_NAME[h.terrain]}${h.token ? ` (${h.token})` : ''}`
                    : undefined
                }
              />
            );
          })}

        {/* gold rim on hexes that paid out */}
        {production &&
          production.hexes.map((h) => {
            const c = hexCenter(h);
            return (
              <polygon
                key={`${production.seq}-${h}`}
                points={hexPoints(93)}
                transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}
                fill="rgba(255,215,120,0.08)"
                stroke="#e8c26a"
                strokeWidth={5}
                className="anim-rim pointer-events-none"
              />
            );
          })}

        <Tokens board={state.board} glowRoll={production ? production.roll : null} colorblind={colorblind} />

        {/* torchlight pooled around buildings */}
        <g className="pointer-events-none" style={{ mixBlendMode: 'screen' }}>
          {Object.keys(state.buildings).map((v) => {
            const p = vertexXY(v);
            return <circle key={v} cx={p.x} cy={p.y} r={state.buildings[v].kind === 'citadel' ? 90 : 70} fill="url(#g-torchlight)" />;
          })}
        </g>

        {/* causeways */}
        <g className="pointer-events-none">
          {Object.entries(state.causeways).map(([e, owner]) => {
            const g = edgeXY(e);
            const pl = state.players[owner];
            return (
              <motion.g
                key={e}
                initial={fx.placed?.key === e ? { opacity: 0, scale: 1.4 } : false}
                animate={{ opacity: dim(owner), scale: 1 }}
                transition={{ duration: 0.28, ease: 'easeIn' }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              >
                <g transform={`translate(${g.mid.x.toFixed(1)} ${g.mid.y.toFixed(1)}) rotate(${g.angle.toFixed(1)})`}>
                  <CausewayPiece color={pl.color} rim={owner === state.currentPlayer && !decorative} />
                </g>
              </motion.g>
            );
          })}
        </g>

        {/* buildings */}
        <g className="pointer-events-none">
          {Object.entries(state.buildings)
            .sort((a, b) => vertexXY(a[0]).y - vertexXY(b[0]).y)
            .map(([v, b]) => {
              const p = vertexXY(v);
              const pl = state.players[b.owner];
              const fresh = fx.placed?.key === v;
              return (
                <motion.g
                  key={`${v}-${b.kind}`}
                  initial={fresh ? { y: -40, opacity: 0 } : false}
                  animate={{ y: 0, opacity: dim(b.owner) }}
                  transition={{ duration: 0.32, ease: [0.5, 0, 0.9, 0.6] }}
                >
                  <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(1.3)`}>
                    {b.kind === 'outpost' ? (
                      <OutpostPiece color={pl.color} sigil={pl.sigil} rim={b.owner === state.currentPlayer && !decorative} />
                    ) : (
                      <CitadelPiece color={pl.color} sigil={pl.sigil} rim={b.owner === state.currentPlayer && !decorative} />
                    )}
                  </g>
                  {fresh && <DustPuff x={p.x} y={p.y} />}
                </motion.g>
              );
            })}
        </g>

        {/* the Wraith */}
        <AnimatePresence initial={false}>
          <motion.g
            key={state.wraithHex}
            className="pointer-events-none"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.6 }}
          >
            {(() => {
              const c = hexCenter(state.wraithHex);
              return (
                <g transform={`translate(${(c.x + 34).toFixed(1)} ${(c.y - 18).toFixed(1)})`}>
                  <title>The Wraith</title>
                  <WraithPawn />
                </g>
              );
            })()}
          </motion.g>
        </AnimatePresence>

        {/* show-why: illegal spots */}
        {whyVertices.map(({ v, why }) => {
          const p = vertexXY(v);
          return (
            <circle key={v} cx={p.x} cy={p.y} r={7} fill="#3a1015" stroke="#8b1e2d" strokeWidth={1} opacity={0.6}>
              <title>{why}</title>
            </circle>
          );
        })}

        {/* placement targets */}
        {targets?.kind === 'vertex' &&
          targets.spots.map((v) => {
            const p = vertexXY(v);
            const hovered = hoverTarget === v;
            const a = targets.make(v);
            return (
              <g
                key={v}
                transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`${targets.piece === 'citadel' ? 'Upgrade to a Citadel' : 'Place an Outpost'} at ${vertexLabel(state, v)}`}
                onMouseEnter={() => setHoverTarget(v)}
                onMouseLeave={() => setHoverTarget(null)}
                onFocus={() => setHoverTarget(v)}
                onBlur={() => setHoverTarget(null)}
                onClick={() => fire(a)}
                onKeyDown={keyFire(a)}
              >
                <g pointerEvents="none">
                  {hovered ? (
                    <g transform="scale(1.3)">
                      {targets.piece === 'outpost' ? (
                        <OutpostPiece color={me.color} sigil={me.sigil} ghost />
                      ) : (
                        <CitadelPiece color={me.color} sigil={me.sigil} ghost />
                      )}
                    </g>
                  ) : (
                    <g className="anim-pulse">
                      <circle r={12} fill="url(#g-ember)" />
                      <circle r={5} fill="#ffcf8a" stroke="#e0702a" strokeWidth={1.5} />
                    </g>
                  )}
                </g>
                {/* persistent hit target on top so re-renders never swallow the click */}
                <circle r={22} fill="transparent" />
              </g>
            );
          })}
        {targets?.kind === 'edge' &&
          targets.spots.map((e) => {
            const g = edgeXY(e);
            const hovered = hoverTarget === e;
            const a = targets.make(e);
            return (
              <g
                key={e}
                transform={`translate(${g.mid.x.toFixed(1)} ${g.mid.y.toFixed(1)}) rotate(${g.angle.toFixed(1)})`}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`Lay a Causeway ${edgeLabel(state, e)}`}
                onMouseEnter={() => setHoverTarget(e)}
                onMouseLeave={() => setHoverTarget(null)}
                onFocus={() => setHoverTarget(e)}
                onBlur={() => setHoverTarget(null)}
                onClick={() => fire(a)}
                onKeyDown={keyFire(a)}
              >
                <g pointerEvents="none">
                  {hovered ? (
                    <CausewayPiece color={me.color} ghost />
                  ) : (
                    <g className="anim-pulse">
                      <rect x={-24} y={-3.5} width={48} height={7} rx={3.5} fill="#ffcf8a" opacity={0.85} />
                      <rect x={-27} y={-7} width={54} height={14} rx={7} fill="url(#g-ember)" opacity={0.8} />
                    </g>
                  )}
                </g>
                <rect x={-30} y={-13} width={60} height={26} fill="transparent" />
              </g>
            );
          })}

        {/* floating gain chips over owners' pieces */}
        {production && <GainChips key={production.seq} state={state} hexes={production.hexes} />}

        {/* slow fog over the sea edges */}
        <g className="pointer-events-none anim-drift" opacity={0.5}>
          <ellipse cx={-380} cy={-430} rx={260} ry={50} fill="#9fb3b6" opacity={0.12} filter="url(#f-blur14)" />
          <ellipse cx={360} cy={460} rx={300} ry={60} fill="#9fb3b6" opacity={0.12} filter="url(#f-blur14)" />
          <ellipse cx={480} cy={-120} rx={90} ry={200} fill="#9fb3b6" opacity={0.08} filter="url(#f-blur14)" />
        </g>
      </svg>
      {!decorative && hoverHex !== null && !targets && <HexTooltip state={state} hex={hoverHex} />}
    </div>
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
