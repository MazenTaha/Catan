import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState, type ReactNode } from 'react';
import {
  HOST_MIN,
  LONGEST_MIN,
  RESOURCES,
  activeActor,
  expectedYield,
  handTotal,
  relicCount,
  victoryPoints,
  vpBreakdown,
  type GameState,
} from '@hexfall/engine';
import { Icon, RES_COLOR, ResourceGlyph } from '../../art/icons/Icon';
import { PlayerDisc } from '../../art/pieces/Sigil';
import { BOT_NAME, HOST, LONGEST, RESOURCE_NAME, TERRAIN_NAME } from '../../lexicon';
import { ProgressRing, Tooltip } from '../ui/primitives';
import { describeEvent } from '../../state/log';
import { useStore } from '../../state/store';
import { LogLineView, NAME_COLOR } from './LogLineView';
import { OmenCardBack } from './RightRail';

export function PlayersPanel({
  state,
  seat,
  horizontal = false,
}: {
  state: GameState;
  seat: number;
  horizontal?: boolean;
}) {
  const setHover = useStore((s) => s.setHoverPlayer);
  const [open, setOpen] = useState<number | null>(null);
  const actor = activeActor(state);
  const n = state.players.length;
  const order = Array.from({ length: n }, (_, k) => (state.firstPlayer + k) % n);
  const next = (state.currentPlayer + 1) % n;
  return (
    <section className="panel px-3.5 py-3" aria-label="Players">
      <h2 className="panel-title mb-2.5 px-0.5">Players</h2>
      <ul className={horizontal ? 'grid grid-cols-2 gap-2 lg:grid-cols-4' : 'flex flex-col gap-2'}>
        {order.map((i) => {
          const p = state.players[i];
          const vp = victoryPoints(state, i, false);
          const hidden = i === seat ? relicCount(p) : 0;
          const playing = i === state.currentPlayer && state.phase.kind !== 'ended';
          const acting = i === actor && !playing;
          const pending = state.phase.kind === 'discard' && state.phase.pending[i] > 0;
          const expanded = open === i;
          const color = NAME_COLOR[p.color];
          return (
            <li
              key={i}
              className={`tile overflow-hidden ${playing ? 'tile-selected' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${p.name}, ${vp} of ${state.config.targetVp} points, ${handTotal(p)} cards, ${p.omens.length} omens${playing ? ', playing' : ''}`}
            >
              <button
                className={`flex w-full items-center text-left ${horizontal ? 'gap-2 px-2 py-2' : 'gap-2.5 px-2.5 pb-2 pt-2.5'}`}
                onClick={() => setOpen(expanded ? null : i)}
                aria-expanded={expanded}
                aria-label={`${p.name} details`}
              >
                <ProgressRing
                  value={vp / state.config.targetVp}
                  size={horizontal ? 34 : 42}
                  stroke={3}
                  color={color}
                >
                  <PlayerDisc
                    color={p.color}
                    sigil={p.sigil}
                    size={horizontal ? 24 : 30}
                    active={playing}
                  />
                </ProgressRing>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="truncate font-display text-[13px] tracking-[0.02em]"
                      style={{ color }}
                    >
                      {p.name}
                    </span>
                    {p.kind === 'bot' && (
                      <span className="text-muted" title={`Bot · ${BOT_NAME[p.bot ?? 'warlord']}`}>
                        <Icon name="bot" size={13} />
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {i === seat && !horizontal && (
                      <span className="chip !px-1.5 !py-0 text-[10px] text-bone">You</span>
                    )}
                    {playing && (
                      <span className="chip !px-1.5 !py-0 border-gold/70 bg-gold/15 text-[10px] text-gold">
                        Playing
                      </span>
                    )}
                    {!playing && i === next && state.phase.kind !== 'setup' && (
                      <span className="chip !py-0 text-[10px] text-muted">Next</span>
                    )}
                    {pending && (
                      <span className="chip !py-0 border-ember/70 bg-ember/10 text-[10px] text-ember">
                        Discarding
                      </span>
                    )}
                    {acting && !pending && (
                      <span className="chip !py-0 text-[10px] text-frost">Deciding</span>
                    )}
                    {p.kind === 'bot' &&
                      i === actor &&
                      state.handoff === null &&
                      state.phase.kind !== 'ended' && (
                        <span className="inline-flex gap-0.5" aria-hidden>
                          {[0, 1, 2].map((k) => (
                            <span
                              key={k}
                              className="h-1.5 w-1.5 rounded-full bg-gold anim-pulse"
                              style={{ animationDelay: `${k * 0.2}s` }}
                            />
                          ))}
                        </span>
                      )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="num text-[22px] leading-none text-gold">
                    {vp}
                    {hidden > 0 && (
                      <span
                        className="text-[13px] text-gold"
                        title="Hidden Victory Point cards (only you see these)"
                      >
                        +{hidden}
                      </span>
                    )}
                  </div>
                  <div className="num flex items-center justify-end gap-0.5 text-[11px] text-muted">
                    / {state.config.targetVp}
                    <Icon
                      name="arrow"
                      size={10}
                      className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
                    />
                  </div>
                </div>
              </button>
              <div
                className={`items-center gap-3 px-3 pb-2.5 text-[13px] text-muted ${horizontal ? 'hidden lg:flex' : 'flex'}`}
              >
                <Stat
                  icon={<Icon name="scroll" size={13} />}
                  value={handTotal(p)}
                  label="Resource cards"
                />
                <Stat
                  icon={<OmenCardBack size={16} />}
                  value={p.omens.length}
                  label="Development cards (face down)"
                />
                <Stat
                  icon={<Icon name="sword" size={13} />}
                  value={p.playedWardens}
                  label="Knights played"
                />
                <Stat
                  icon={<Icon name="causeway" size={13} />}
                  value={state.longestCauseway.lengths[i] ?? 0}
                  label="Longest road"
                />
              </div>
              <AnimatePresence initial={false}>
                {expanded && <PlayerDetails state={state} player={i} seat={seat} />}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <Tooltip label={label}>
      <span className="inline-flex items-center gap-1" tabIndex={-1}>
        {icon} <span className="num text-bone">{value}</span>
      </span>
    </Tooltip>
  );
}

function PlayerDetails({
  state,
  player,
  seat,
}: {
  state: GameState;
  player: number;
  seat: number;
}) {
  const p = state.players[player];
  const b = vpBreakdown(state, player);
  const income = expectedYield(state, player);
  const rows: [string, number][] = [
    ['Settlements', b.outposts],
    ['Cities', b.citadels],
    [LONGEST, b.longest],
    [HOST, b.host],
  ];
  if (player === seat) rows.push(['Victory cards', b.relics]);
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="overflow-hidden"
    >
      <div className="mx-2.5 mb-2.5 grid gap-2 rounded-xl bg-black/25 p-2.5 text-[13px]">
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-muted">{k}</span>
              <span className={`num ${v ? 'text-gold' : 'text-muted'}`}>{v ? `+${v}` : '0'}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1 font-display text-[10px] uppercase tracking-[0.14em] text-muted">
            Income per roll
          </div>
          <div className="grid grid-cols-5 gap-1">
            {RESOURCES.map((r) => (
              <span
                key={r}
                className="flex flex-col items-center rounded-lg bg-black/20 py-1"
                title={`${RESOURCE_NAME[r]} per roll`}
              >
                <span style={{ color: RES_COLOR[r] }}>
                  <ResourceGlyph res={r} size={13} />
                </span>
                <span className="num text-[11px] text-bone">{income[r].toFixed(1)}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between text-muted">
          <span>Pieces left</span>
          <span className="flex items-center gap-2 text-bone">
            <span className="inline-flex items-center gap-0.5" title="Roads left">
              <Icon name="causeway" size={12} className="text-muted" />
              <span className="num">{p.supply.causeways}</span>
            </span>
            <span className="inline-flex items-center gap-0.5" title="Settlements left">
              <Icon name="outpost" size={12} className="text-muted" />
              <span className="num">{p.supply.outposts}</span>
            </span>
            <span className="inline-flex items-center gap-0.5" title="Cities left">
              <Icon name="citadel" size={12} className="text-muted" />
              <span className="num">{p.supply.citadels}</span>
            </span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export function BonusPanel({ state }: { state: GameState }) {
  const lc = state.longestCauseway;
  const gh = state.greatestHost.holder;
  const bestRoad = Math.max(0, ...lc.lengths);
  const bestHost = Math.max(...state.players.map((p) => p.playedWardens));
  const claim = (
    label: string,
    holder: number | null,
    detail: string,
    icon: 'causeway' | 'sword',
    progress: number,
  ) => (
    <div className={`tile px-2.5 py-2.5 ${holder !== null ? 'tile-selected' : ''}`}>
      <div className="flex items-center gap-2">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${holder !== null ? 'bg-gold/20 text-gold' : 'bg-black/25 text-muted'}`}
        >
          <Icon name={icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="whitespace-nowrap font-display text-[11px] uppercase tracking-[0.04em] text-bone">
            {label}
          </div>
          <div className="truncate text-[12px] text-muted" title={detail}>
            {detail}
          </div>
        </div>
        {holder !== null && (
          <PlayerDisc
            color={state.players[holder].color}
            sigil={state.players[holder].sigil}
            size={26}
            label={state.players[holder].name}
          />
        )}
        <span className="num rounded-lg bg-gold/15 px-1.5 text-[13px] text-gold">+2</span>
      </div>
      {holder === null && (
        <div className="meter mt-2" aria-hidden>
          <span style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>
      )}
    </div>
  );
  return (
    <section className="panel flex flex-col gap-2 px-3.5 py-3" aria-label="Bonuses">
      <h2 className="panel-title px-0.5">Claims</h2>
      {claim(
        LONGEST,
        lc.holder,
        lc.holder !== null
          ? `${state.players[lc.holder].name} · ${lc.lengths[lc.holder]} long`
          : `Needs ${LONGEST_MIN}+ · best ${bestRoad}`,
        'causeway',
        bestRoad / LONGEST_MIN,
      )}
      {claim(
        HOST,
        gh,
        gh !== null
          ? `${state.players[gh].name} · ${state.players[gh].playedWardens} Knights`
          : `Needs ${HOST_MIN}+ Knights · best ${bestHost}`,
        'sword',
        bestHost / HOST_MIN,
      )}
    </section>
  );
}

export function RecentLog({ state, seat }: { state: GameState; seat: number }) {
  const log = useStore((s) => s.session?.log);
  const openModal = useStore((s) => s.openModal);
  const lines = useMemo(() => {
    if (!log) return [];
    const ctx = {
      players: state.players,
      viewer: seat,
      terrainName: (h: number) => TERRAIN_NAME[state.board.hexes[h].terrain],
    };
    const out = [];
    for (let i = log.length - 1; i >= 0 && out.length < 7; i--) {
      const line = describeEvent(log[i].event, ctx);
      if (line) out.push({ seq: log[i].seq, line });
    }
    return out;
  }, [log, state.players, state.board, seat]);
  return (
    <section className="panel flex min-h-0 flex-1 flex-col px-3.5 py-3" aria-label="Recent events">
      <div className="mb-2 flex items-center px-0.5">
        <h2 className="panel-title flex-1">Recent</h2>
        <button className="chip text-gold" onClick={() => openModal('log')}>
          Full log <Icon name="arrow" size={11} />
        </button>
      </div>
      <ol className="scroll-thin relative flex min-h-0 flex-col gap-2 overflow-y-auto pl-3">
        <span
          className="absolute bottom-1 left-[5px] top-1 w-px bg-gradient-to-b from-gold/60 via-iron/60 to-transparent"
          aria-hidden
        />
        {lines.map(({ seq, line }, k) => (
          <motion.li
            key={seq}
            className="relative pl-2"
            initial={k === 0 ? { opacity: 0, x: -6 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
          >
            <span
              className={`absolute -left-[10px] top-[7px] h-[7px] w-[7px] rounded-full ${k === 0 ? 'bg-gold shadow-[0_0_8px_rgb(var(--gold))]' : 'bg-iron'}`}
              aria-hidden
            />
            <LogLineView line={line} players={state.players} compact />
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
