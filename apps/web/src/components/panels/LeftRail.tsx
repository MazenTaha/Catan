import { motion } from 'framer-motion';
import { useMemo, type ReactNode } from 'react';
import { HOST_MIN, LONGEST_MIN, activeActor, handTotal, relicCount, victoryPoints, type GameState } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { BOT_NAME, HOST, LONGEST, TERRAIN_NAME } from '../../lexicon';
import { describeEvent } from '../../state/log';
import { useStore } from '../../state/store';
import { Arms } from '../../ui/hall/Arms';
import { Banner, BannerPole } from '../../ui/hall/Banner';
import { BoneDie } from '../../ui/hall/Controls';
import { OakPanel } from '../../ui/hall/Surfaces';
import { daylight, hourOf, stageName } from '../world/daytime';
import { LogLineView, INK_NAME } from './LogLineView';

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

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
const roman = (n: number) => ROMAN[n] ?? String(n);

/**
 * Everyone at the table as banners on a pole above the board: arms, victory points, name. The
 * player whose turn it is hangs lit; a small dot marks whoever must act now (discarding,
 * answering an offer). Cards in hand and pieces on the board ride under the ribbon. Hovering a
 * banner highlights that player's pieces on the board.
 */
export function PlayersPanel({
  state,
  seat,
  size = 'wide',
  avail = 900,
}: {
  state: GameState;
  seat: number;
  size?: 'wide' | 'mid' | 'strip';
  /** Width of the column the banners hang in; they shrink to fit it. */
  avail?: number;
}) {
  const setHover = useStore((s) => s.setHoverPlayer);
  const actor = activeActor(state);
  const n = state.players.length;
  const ended = state.phase.kind === 'ended';
  const next = (state.currentPlayer + 1) % n;
  const describe = (i: number) => {
    const p = state.players[i];
    const vp = victoryPoints(state, i, false);
    const pieces = piecesOf(state, i);
    const playing = i === state.currentPlayer && !ended;
    return {
      p,
      vp,
      hidden: i === seat ? relicCount(p) : 0,
      pieces,
      playing,
      busy: i === actor && !ended,
      kicker: i === state.currentPlayer ? (ended ? 'Last turn' : 'Playing') : i === next && !ended ? 'Next up' : '',
      aria: `${p.name}, ${vp} of ${state.config.targetVp} points, ${handTotal(p)} cards, ${pieces.outposts} settlements, ${pieces.citadels} cities, ${pieces.roads} roads${playing ? ', playing' : ''}`,
    };
  };

  if (size === 'strip') {
    // Phones: a strip of small pennants, arms and points.
    return (
      <section className="flex gap-2 overflow-x-auto pb-1" aria-label="Players">
        {state.players.map((_, i) => {
          const d = describe(i);
          return (
            <div
              key={i}
              className={`hc-oak flex shrink-0 items-center gap-2 !px-2 !py-1.5 ${d.playing ? 'outline outline-2 outline-[color:var(--gold-light)]' : ''}`}
              aria-label={d.aria}
              title={d.p.kind === 'bot' ? `Bot · ${BOT_NAME[d.p.bot ?? 'warlord']}` : undefined}
            >
              <Arms color={d.p.color} sigil={d.p.sigil} size={26} />
              <span className="flex flex-col leading-none">
                <span className="hc-label max-w-[72px] truncate text-[13px] text-[color:var(--on-dark)]">
                  {d.p.name}
                  {i === seat && ' (you)'}
                </span>
                <span className="text-[11px] text-[color:var(--on-dark-muted)]">{d.kicker || ' '}</span>
              </span>
              <span className="hc-title text-[24px] text-[color:var(--gold-light)]">
                {d.vp}
                {d.hidden > 0 && <span className="hc-body text-[12px]">+{d.hidden}</span>}
              </span>
              {d.busy && <span className="h-2 w-2 rounded-full anim-pulse" style={{ background: 'var(--gold-light)' }} aria-hidden />}
            </div>
          );
        })}
      </section>
    );
  }

  // Fit the pole to the column: banners up to 150 wide (120 on mid screens), never under 84.
  let gap = size === 'wide' ? 40 : 22;
  let overhang = 40;
  const fit = () => (avail - overhang * 2 - gap * (n - 1)) / n;
  if (fit() < 84) {
    // a tight column: hang them closer together
    gap = 10;
    overhang = 24;
  }
  const bw = Math.round(Math.max(60, Math.min(size === 'wide' ? 150 : 120, fit())));
  const bh = Math.round(bw * 1.3);
  return (
    <section aria-label="Players" className="flex justify-center">
      <BannerPole gap={gap} overhang={overhang}>
        {state.players.map((_, i) => {
          const d = describe(i);
          return (
            <Banner
              key={i}
              width={bw}
              height={bh}
              tincture={{ player: d.p.color }}
              arms={{ color: d.p.color, sigil: d.p.sigil }}
              numeral={
                <>
                  {d.vp}
                  {d.hidden > 0 && (
                    <span className="hc-body ml-0.5 text-[15px]" title="Hidden Victory Point cards (only you see these)">
                      +{d.hidden}
                    </span>
                  )}
                </>
              }
              label={i === seat ? `${d.p.name} · you` : d.p.name}
              labelSize={bw >= 140 ? 18 : bw >= 110 ? 15 : 13}
              kicker={d.kicker}
              lit={d.playing}
              aria-label={d.aria}
              role="group"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              extra={
                <>
                  {d.busy && <span className="pointer-events-none absolute right-3 top-8 h-2.5 w-2.5 rounded-full anim-pulse" style={{ background: 'var(--gold-light)', boxShadow: '0 0 6px var(--gold-light)' }} aria-hidden />}
                  {/* cards in hand and pieces on the board: a paper tag hung under the cloth, between the tassels */}
                  <span
                    className="absolute flex items-center justify-center gap-1.5 text-[color:var(--map-ink)]"
                    style={{ top: bh + 6, left: 14, right: 14, height: 22, background: 'var(--paper-card)', border: '1.2px solid var(--ink)', boxShadow: '1px 2px 0 rgba(0,0,0,0.5)' }}
                    title={d.p.kind === 'bot' ? `Bot · ${BOT_NAME[d.p.bot ?? 'warlord']}` : undefined}
                    aria-hidden
                  >
                    <Stat icon="omen" value={handTotal(d.p)} />
                    <Stat icon="outpost" value={d.pieces.outposts} />
                    <Stat icon="citadel" value={d.pieces.citadels} />
                    <Stat icon="causeway" value={d.pieces.roads} />
                  </span>
                </>
              }
            />
          );
        })}
      </BannerPole>
    </section>
  );
}

function Stat({ icon, value }: { icon: 'omen' | 'outpost' | 'citadel' | 'causeway'; value: number }) {
  return (
    <span className="inline-flex items-center gap-[1px]">
      <Icon name={icon} size={12} strokeWidth={2} />
      <span className="hc-num text-[13px] leading-none">{value}</span>
    </span>
  );
}

/** The Lists: the game's title chips (room, round, time of day, the race) and the two claims. */
export function ListsPanel({ state }: { state: GameState }) {
  const online = useStore((s) => s.session?.online);
  const leader = Math.max(...state.players.map((_, i) => victoryPoints(state, i, false)));
  const hour = hourOf(state);
  const lc = state.longestCauseway;
  const gh = state.greatestHost.holder;
  const bestRoad = Math.max(0, ...lc.lengths);
  const bestHost = Math.max(...state.players.map((p) => p.playedWardens));
  const claim = (label: string, holder: number | null, detail: string, icon: 'causeway' | 'sword', progress: number) => (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        <span className={holder !== null ? 'hc-rubric' : 'hc-ink-muted'} aria-hidden>
          <Icon name={icon} size={17} strokeWidth={1.8} />
        </span>
        <span className="hc-label min-w-0 flex-1 text-[16px]">{label}</span>
        {holder !== null && <Arms color={state.players[holder].color} sigil={state.players[holder].sigil} size={20} label={state.players[holder].name} />}
        <span className="hc-num text-[15px] hc-rubric">+2</span>
      </div>
      <div className="pl-6 text-[15px] italic" title={detail} style={{ color: holder !== null ? INK_NAME[state.players[holder].color] : undefined }}>
        {detail}
      </div>
      {holder === null && (
        <div className="ml-6 mt-1 h-[5px]" style={{ border: '1px solid var(--map-ink)', background: 'var(--paper-card)' }} aria-hidden>
          <span className="block h-full" style={{ width: `${Math.min(100, progress * 100)}%`, background: 'var(--map-ink)' }} />
        </div>
      )}
    </div>
  );
  return (
    <OakPanel title="The Lists" aria-label="Claims">
      <div className="flex flex-col px-3 py-3">
        <div className="hc-title text-center text-[26px] leading-none text-[color:var(--rubric-dark)]">Catan Night</div>
        <div className="mt-1 text-center text-[16px] italic">
          {state.phase.kind !== 'setup' ? (
            <>
              <span aria-label={`Round ${state.round}`}>Round {roman(state.round)}</span>
              {' · '}
            </>
          ) : (
            'The founding · '
          )}
          <span data-testid="time-of-day" aria-label={`Time of day: ${stageName(hour)}`}>
            <Icon name={daylight(hour) < 0.35 ? 'moon' : 'sun'} size={13} className="inline align-[-1px]" /> {stageName(hour)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-center gap-2 text-[15px]" title={`Leader has ${leader} of ${state.config.targetVp} points`}>
          <Icon name="crown" size={14} />
          <span>
            First to <b className="hc-num">{state.config.targetVp}</b>
          </span>
          <span className="h-[6px] w-14" style={{ border: '1px solid var(--map-ink)', background: 'var(--paper-card)' }} aria-hidden>
            <span className="block h-full" style={{ width: `${(leader / state.config.targetVp) * 100}%`, background: 'var(--rubric)' }} />
          </span>
          <span className="sr-only">Leader has {leader} points</span>
        </div>
        {online && (
          <div className="mt-1 text-center text-[15px]" title="Online game — share this code only with your table">
            <Icon name="user" size={13} className="inline align-[-1px]" /> Room <b className="hc-num">{online.code}</b>
          </div>
        )}
        <hr className="hc-dots" />
        {claim(LONGEST, lc.holder, lc.holder !== null ? `${state.players[lc.holder].name} · ${lc.lengths[lc.holder]} long` : `Needs ${LONGEST_MIN}+ · best ${bestRoad}`, 'causeway', bestRoad / LONGEST_MIN)}
        <hr className="hc-dots !my-0.5" />
        {claim(HOST, gh, gh !== null ? `${state.players[gh].name} · ${state.players[gh].playedWardens} Knights` : `Needs ${HOST_MIN}+ Knights · best ${bestHost}`, 'sword', bestHost / HOST_MIN)}
      </div>
    </OakPanel>
  );
}

/** Kept for the narrow layout's drawer and older imports. */
export const BonusPanel = ListsPanel;

/** The Herald: the latest events, each a red ¶ with arms and resource art. */
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
    <OakPanel title="The Herald" aria-label="Recent events" className="flex min-h-0 flex-1 flex-col" insetClassName="flex min-h-0 flex-1 flex-col">
      <ol className="hc-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-2 pt-1">
        {lines.map(({ seq, line }, k) => (
          <motion.li key={seq} initial={k === 0 ? { opacity: 0, x: -6 } : false} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
            <LogLineView line={line} players={state.players} compact />
          </motion.li>
        ))}
      </ol>
      <div className="flex justify-end px-2 pb-2">
        <button className="hc-paper-btn hc-paper-btn--sm" onClick={() => openModal('log')}>
          Full log <Icon name="arrow" size={13} />
        </button>
      </div>
    </OakPanel>
  );
}

/** The last cast of the dice, in bone. */
export function LastRoll({ state }: { state: GameState }): ReactNode {
  if (!state.dice) return null;
  const [a, b] = state.dice;
  const total = a + b;
  return (
    <div className="hc-oak flex items-center gap-3 !py-2.5" aria-label={`Last roll ${total}`}>
      <BoneDie value={a} size={42} red={total === 7} />
      <BoneDie value={b} size={42} red={total === 7} />
      <span className="flex flex-col leading-none">
        <span className={`hc-title text-[30px] ${total === 7 ? 'text-[#ff9a86]' : 'text-[color:var(--gold-light)]'}`}>{total}</span>
        <span className="hc-gloss text-[color:var(--on-dark-muted)]">was cast</span>
      </span>
    </div>
  );
}
