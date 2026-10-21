import { motion } from 'framer-motion';
import { useMemo, type ReactNode } from 'react';
import {
  HOST_MIN,
  LONGEST_MIN,
  activeActor,
  handTotal,
  relicCount,
  victoryPoints,
  type GameState,
} from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { PlayerDisc } from '../../art/pieces/Sigil';
import { BOT_NAME, HOST, LONGEST, TERRAIN_NAME } from '../../lexicon';
import { ProgressRing, Tooltip } from '../ui/primitives';
import { describeEvent } from '../../state/log';
import { useStore } from '../../state/store';
import { LogLineView, NAME_COLOR } from './LogLineView';

/** How many settlements, cities and roads a player has on the board. */
function piecesOf(state: GameState, player: number) {
  let outposts = 0;
  let citadels = 0;
  for (const b of Object.values(state.buildings)) {
    if (b.owner !== player) continue;
    if (b.kind === 'citadel') citadels++;
    else outposts++;
  }
  const roads = Object.values(state.causeways).filter((o) => o === player).length;
  return { outposts, citadels, roads };
}

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
  const actor = activeActor(state);
  const n = state.players.length;
  const order = Array.from({ length: n }, (_, k) => (state.firstPlayer + k) % n);
  if (horizontal) return <PlayersStrip state={state} seat={seat} order={order} />;
  return (
    <section className="panel px-3 py-2.5" aria-label="Players">
      <h2 className="panel-title mb-2 px-0.5">Players</h2>
      <ul className="flex flex-col gap-1.5">
        {order.map((i) => {
          const p = state.players[i];
          const vp = victoryPoints(state, i, false);
          const hidden = i === seat ? relicCount(p) : 0;
          const playing = i === state.currentPlayer && state.phase.kind !== 'ended';
          const busy = i === actor && state.phase.kind !== 'ended';
          const pieces = piecesOf(state, i);
          const color = NAME_COLOR[p.color];
          return (
            <li
              key={i}
              className={`tile px-2.5 py-1.5 ${playing ? 'tile-selected' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              aria-label={`${p.name}, ${vp} of ${state.config.targetVp} points, ${handTotal(p)} cards, ${pieces.outposts} settlements, ${pieces.citadels} cities, ${pieces.roads} roads${playing ? ', playing' : ''}`}
            >
              <div className="flex items-center gap-2">
                <PlayerDisc color={p.color} sigil={p.sigil} size={24} active={playing} />
                <span
                  className="min-w-0 flex-1 truncate font-display text-[13px] tracking-[0.02em]"
                  style={{ color }}
                  title={p.kind === 'bot' ? `Bot · ${BOT_NAME[p.bot ?? 'warlord']}` : undefined}
                >
                  {p.name}
                  {i === seat && <span className="ml-1 text-[10px] text-muted">you</span>}
                </span>
                {busy && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold anim-pulse" aria-hidden />
                )}
                <span className="num shrink-0 text-[18px] leading-none text-gold" title="Victory points">
                  {vp}
                  {hidden > 0 && (
                    <span className="text-[11px]" title="Hidden Victory Point cards (only you see these)">
                      +{hidden}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between pl-8 text-[12px] text-muted">
                <Stat icon={<Icon name="omen" size={12} />} value={handTotal(p)} label="Cards in hand" />
                <Stat icon={<Icon name="outpost" size={12} />} value={pieces.outposts} label="Settlements" />
                <Stat icon={<Icon name="citadel" size={12} />} value={pieces.citadels} label="Cities" />
                <Stat icon={<Icon name="causeway" size={12} />} value={pieces.roads} label="Roads" />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Narrow layouts: one slim row of players — avatar, name, status dot and score. */
function PlayersStrip({ state, seat, order }: { state: GameState; seat: number; order: number[] }) {
  const setHover = useStore((s) => s.setHoverPlayer);
  const actor = activeActor(state);
  return (
    <section className="panel px-2 py-1.5" aria-label="Players">
      <ul className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        {order.map((i) => {
          const p = state.players[i];
          const vp = victoryPoints(state, i, false);
          const playing = i === state.currentPlayer && state.phase.kind !== 'ended';
          const busy = i === actor && state.phase.kind !== 'ended';
          const color = NAME_COLOR[p.color];
          return (
            <li
              key={i}
              className={`flex min-w-0 items-center gap-2 rounded-xl border px-2 py-1 transition-colors ${
                playing
                  ? 'border-gold/70 bg-gold/10 shadow-[0_0_14px_-6px_rgb(var(--gold)/0.8)]'
                  : 'border-iron/50 bg-black/15'
              }`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              aria-label={`${p.name}, ${vp} of ${state.config.targetVp} points, ${handTotal(p)} cards, ${p.omens.length} omens${playing ? ', playing' : ''}`}
              title={`${p.name}${p.kind === 'bot' ? ` · Bot (${BOT_NAME[p.bot ?? 'warlord']})` : ''} · ${handTotal(p)} cards · ${p.omens.length} dev. cards`}
            >
              <ProgressRing value={vp / state.config.targetVp} size={26} stroke={2.5} color={color}>
                <PlayerDisc color={p.color} sigil={p.sigil} size={18} />
              </ProgressRing>
              <span className="min-w-0 flex-1 truncate font-display text-[12px]" style={{ color }}>
                {p.name}
                {i === seat && <span className="ml-1 text-[10px] text-muted">you</span>}
              </span>
              {busy && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold anim-pulse"
                  aria-hidden
                />
              )}
              <span className="num shrink-0 text-[14px] text-gold">
                {vp}
                <span className="text-[10px] text-muted">/{state.config.targetVp}</span>
              </span>
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
