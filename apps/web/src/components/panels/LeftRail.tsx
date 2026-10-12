import { useMemo } from 'react';
import {
  HOST_MIN,
  LONGEST_MIN,
  activeActor,
  handTotal,
  privacyEnabled,
  relicCount,
  victoryPoints,
  type GameState,
} from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { PlayerDisc } from '../../art/pieces/Sigil';
import { BOT_NAME, HOST, LONGEST, TERRAIN_NAME } from '../../lexicon';
import { describeEvent } from '../../state/log';
import { useStore } from '../../state/store';
import { LogLineView, NAME_COLOR } from './LogLineView';
import { OmenCardBack } from './RightRail';

export function PlayersPanel({ state, seat, horizontal = false }: { state: GameState; seat: number; horizontal?: boolean }) {
  const setHover = useStore((s) => s.setHoverPlayer);
  const actor = activeActor(state);
  const n = state.players.length;
  const order = Array.from({ length: n }, (_, k) => (state.firstPlayer + k) % n);
  const next = (state.currentPlayer + 1) % n;
  return (
    <section className="panel rivets px-4 py-3" aria-label="Players">
      <h2 className="panel-title mb-2">Players</h2>
      <ul className={horizontal ? 'grid grid-cols-2 gap-2 lg:grid-cols-4' : 'flex flex-col gap-2'}>
        {order.map((i) => {
          const p = state.players[i];
          const vp = victoryPoints(state, i, false);
          const hidden = i === seat ? relicCount(p) : 0;
          const playing = i === state.currentPlayer && state.phase.kind !== 'ended';
          const acting = i === actor && !playing;
          const pending = state.phase.kind === 'discard' && state.phase.pending[i] > 0;
          return (
            <li
              key={i}
              className={`relative border px-2.5 py-2 transition-colors ${playing ? 'border-tarnish bg-[#1f1b12]' : 'border-iron/60 bg-surface-2/60'}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${p.name}, ${vp} of ${state.config.targetVp} points, ${handTotal(p)} cards, ${p.omens.length} omens${playing ? ', playing' : ''}`}
            >
              <div className="flex items-center gap-2">
                <PlayerDisc color={p.color} sigil={p.sigil} size={30} active={playing} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-display text-[14px] tracking-[0.06em]" style={{ color: NAME_COLOR[p.color] }}>
                      {p.name}
                    </span>
                    {p.kind === 'bot' && (
                      <span className="text-muted" title={`Bot · ${BOT_NAME[p.bot ?? 'warlord']}`}>
                        <Icon name="bot" size={13} />
                      </span>
                    )}
                    {i === seat && privacyEnabled(state) && <span className="text-[11px] text-muted">(you)</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    {playing && <span className="chip border-gold !py-0 text-[10px] text-gold">Playing</span>}
                    {!playing && i === next && state.phase.kind !== 'setup' && <span className="chip !py-0 text-[10px] text-muted">Next</span>}
                    {pending && <span className="chip border-blood !py-0 text-[10px] text-ember">Discarding</span>}
                    {acting && !pending && <span className="chip !py-0 text-[10px] text-frost">Deciding</span>}
                    {p.kind === 'bot' && i === actor && state.handoff === null && state.phase.kind !== 'ended' && (
                      <span className="text-[14px] text-muted anim-pulse" aria-hidden>
                        thinking…
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="num text-[20px] leading-none text-gold">
                    {vp}
                    {hidden > 0 && <span className="text-[14px] text-gold" title="Hidden Relics (only you see these)">+{hidden}</span>}
                    <span className="text-[14px] text-muted">/{state.config.targetVp}</span>
                  </div>
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[14px] text-muted">
                <span className="inline-flex items-center gap-1" title="Resource cards">
                  <Icon name="scroll" size={13} /> <span className="num text-bone">{handTotal(p)}</span>
                </span>
                <span className="inline-flex items-center gap-1" title="Omen cards in hand (face down)">
                  <OmenCardBack size={17} /> <span className="num text-bone">{p.omens.length}</span>
                </span>
                <span className="inline-flex items-center gap-1" title="Wardens played">
                  <Icon name="sword" size={13} /> <span className="num text-bone">{p.playedWardens}</span>
                </span>
                <span className="inline-flex items-center gap-1" title="Longest causeway">
                  <Icon name="causeway" size={13} /> <span className="num text-bone">{state.longestCauseway.lengths[i] ?? 0}</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden bg-black/50" aria-hidden>
                <div
                  className="h-full transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, (vp / state.config.targetVp) * 100)}%`,
                    background: 'linear-gradient(90deg, #8a6d2f, #c9a24b)',
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function BonusPanel({ state }: { state: GameState }) {
  const lc = state.longestCauseway;
  const gh = state.greatestHost.holder;
  const bestHost = Math.max(...state.players.map((p) => p.playedWardens));
  const chip = (label: string, holder: number | null, detail: string, icon: 'causeway' | 'sword') => (
    <div className={`flex items-center gap-2 border px-2.5 py-1.5 ${holder !== null ? 'border-tarnish bg-[#1f1b12]' : 'border-iron/60'}`}>
      <Icon name={icon} size={18} className={holder !== null ? 'text-gold' : 'text-muted'} />
      <div className="min-w-0 flex-1">
        <div className="font-display text-[12px] uppercase tracking-[0.1em] text-bone">{label}</div>
        <div className="text-[14px] text-muted">{detail}</div>
      </div>
      {holder !== null ? (
        <PlayerDisc color={state.players[holder].color} sigil={state.players[holder].sigil} size={24} label={state.players[holder].name} />
      ) : (
        <span className="text-[13px] text-muted">unclaimed</span>
      )}
      <span className="num text-[14px] text-gold">+2</span>
    </div>
  );
  return (
    <section className="panel rivets flex flex-col gap-2 px-4 py-3" aria-label="Bonuses">
      <h2 className="panel-title">Claims</h2>
      {chip(
        LONGEST,
        lc.holder,
        lc.holder !== null
          ? `${state.players[lc.holder].name} · ${lc.lengths[lc.holder]} long`
          : `Needs ${LONGEST_MIN}+ · best ${Math.max(0, ...lc.lengths)}`,
        'causeway',
      )}
      {chip(
        HOST,
        gh,
        gh !== null ? `${state.players[gh].name} · ${state.players[gh].playedWardens} Wardens` : `Needs ${HOST_MIN}+ Wardens · best ${bestHost}`,
        'sword',
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
    <section className="panel rivets flex min-h-0 flex-1 flex-col px-4 py-3" aria-label="Recent events">
      <div className="mb-2 flex items-center">
        <h2 className="panel-title flex-1">Recent</h2>
        <button className="ml-2 font-display text-[11px] uppercase tracking-[0.14em] text-gold hover:underline" onClick={() => openModal('log')}>
          Full log
        </button>
      </div>
      <div className="scroll-thin flex min-h-0 flex-col gap-1.5 overflow-y-auto">
        {lines.map(({ seq, line }) => (
          <LogLineView key={seq} line={line} players={state.players} compact />
        ))}
      </div>
    </section>
  );
}
