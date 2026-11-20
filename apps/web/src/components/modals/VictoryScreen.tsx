import { motion } from 'framer-motion';
import { useRef } from 'react';
import { RESOURCES, totalCards, vpBreakdown, type GameState } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { HOST, LONGEST, RESOURCE_NAME } from '../../lexicon';
import { useStore } from '../../state/store';
import { INK_NAME } from '../panels/LogLineView';
import { useDialogTrap } from '../ui/primitives';
import { Arms } from '../../ui/hall/Arms';
import { Banner, BannerPole } from '../../ui/hall/Banner';
import { ResourceArt } from '../../ui/hall/Controls';
import { ChartSheet, CompassRose, HallBackground, Torch } from '../../ui/hall/Surfaces';

/** The end of the game: the winner's banner lit, the reckoning, the rolls and the spoils on a chart. */
export default function VictoryScreen({ state }: { state: GameState }) {
  const rematch = useStore((s) => s.rematch);
  const online = useStore((s) => !!s.session?.online);
  const go = useStore((s) => s.go);
  const ref = useRef<HTMLDivElement>(null);
  useDialogTrap(ref, false);
  const winner = state.winner ?? 0;
  const w = state.players[winner];
  const rows = state.players.map((p) => ({ p, b: vpBreakdown(state, p.id) })).sort((a, b) => b.b.total - a.b.total);
  const rolls = state.stats.rolls;
  const maxRoll = Math.max(1, ...rolls);
  const totalRolls = rolls.reduce((a, b) => a + b, 0);
  return (
    <motion.div ref={ref} className="fixed inset-0 z-[80] overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} role="dialog" aria-modal="true" aria-label="Victory">
      <HallBackground
        className="min-h-full"
        decor={
          <>
            <Torch x="calc(50% - 470px)" y={40} height={150} />
            <Torch x="calc(50% + 410px)" y={40} height={150} flip />
          </>
        }
      >
        <div className="mx-auto flex max-w-4xl flex-col items-center px-3 pb-10 pt-6">
          <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 80 }}>
            <BannerPole gap={0} overhang={40} brackets={false}>
              <Banner width={170} height={250} tincture={{ player: w.color }} arms={{ color: w.color, sigil: w.sigil }} numeral={vpBreakdown(state, winner).total} label={w.name} labelSize={20} lit />
            </BannerPole>
          </motion.div>

          <ChartSheet className="mt-2 w-full" pad={30}>
            <motion.h2
              className="hc-title text-center leading-tight text-[color:var(--rubric-dark)]"
              style={{ fontSize: 'clamp(34px, 6vw, 56px)' }}
              initial={{ opacity: 0, letterSpacing: '0.2em' }}
              animate={{ opacity: 1, letterSpacing: '0.01em' }}
              transition={{ delay: 0.5, duration: 1.1 }}
            >
              {w.name} wins!
            </motion.h2>
            <p className="text-center text-[19px] italic hc-ink-muted">
              after {state.round} rounds, with {vpBreakdown(state, winner).total} points
            </p>

            <h3 className="hc-label mt-5 text-[20px]">Final reckoning</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[17px]">
                <thead className="hc-label text-[14px] hc-ink-muted">
                  <tr className="border-b-[1.5px] border-[color:var(--map-ink)]">
                    <th className="py-1 pr-2">Player</th>
                    <th>Settlements</th>
                    <th>Cities</th>
                    <th>{LONGEST}</th>
                    <th>{HOST}</th>
                    <th>Victory Point cards</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, b }, i) => (
                    <tr key={p.id} className="border-b-[1.5px] border-dotted border-[color:var(--map-ink-muted)]" style={p.id === winner ? { background: 'rgba(217,169,63,0.18)' } : undefined}>
                      <td className="py-2 pr-2">
                        <span className="inline-flex items-center gap-2">
                          <span className="hc-num w-4 hc-ink-muted">{i + 1}</span>
                          <Arms color={p.color} sigil={p.sigil} size={24} />
                          <span style={{ color: INK_NAME[p.color] }}>{p.name}</span>
                        </span>
                      </td>
                      <td className="hc-num">{b.outposts}</td>
                      <td className="hc-num">
                        {b.citadels} <span className="hc-ink-muted">(×2)</span>
                      </td>
                      <td className="hc-num">{b.longest ? '+2' : '—'}</td>
                      <td className="hc-num">{b.host ? '+2' : '—'}</td>
                      <td className="hc-num">{b.relics ? `+${b.relics}` : '—'}</td>
                      <td className="hc-num text-right text-[24px] hc-rubric">{b.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <section>
                <h3 className="hc-label mb-2 text-[20px]">Rolls of fate</h3>
                <div className="flex h-32 items-end gap-1" style={{ borderBottom: '1.5px solid var(--map-ink)' }}>
                  {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => {
                    const expected = totalRolls ? ((6 - Math.abs(7 - n)) / 36) * totalRolls : 0;
                    return (
                      <div key={n} className="relative flex flex-1 flex-col items-center justify-end gap-1">
                        <span className="hc-num text-[13px] hc-ink-muted">{rolls[n]}</span>
                        <div className="w-full" style={{ height: `${(rolls[n] / maxRoll) * 80}px`, background: n === 7 ? 'var(--rubric)' : 'var(--map-ink)' }} />
                        {expected > 0 && <span className="absolute inset-x-0" style={{ bottom: `${Math.min(1, expected / maxRoll) * 80}px`, borderTop: '1.5px dashed var(--rubric)' }} aria-hidden />}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                    <span key={n} className={`hc-num flex-1 text-center text-[14px] ${n === 7 ? 'hc-rubric' : ''}`}>
                      {n}
                    </span>
                  ))}
                </div>
                <p className="hc-gloss mt-1 hc-ink-muted">Bars: rolled · dashes: expected</p>
              </section>
              <section>
                <h3 className="hc-label mb-2 text-[20px]">Spoils</h3>
                <div className="flex flex-col gap-2 text-[16px]">
                  {state.players.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-2">
                      <span className="flex w-28 items-center gap-1.5 truncate" style={{ color: INK_NAME[p.color] }}>
                        <Arms color={p.color} sigil={p.sigil} size={18} /> {p.name}
                      </span>
                      <span className="flex flex-1 flex-wrap gap-x-2">
                        {RESOURCES.map((r) => (
                          <span key={r} className="inline-flex items-center gap-0.5" title={`${RESOURCE_NAME[r]} gained`}>
                            <ResourceArt res={r} size={20} />
                            <span className="hc-num">{state.stats.gained[p.id][r]}</span>
                          </span>
                        ))}
                      </span>
                      <span className="italic hc-ink-muted" title="Total gained · trades · cards stolen">
                        Σ{totalCards(state.stats.gained[p.id])} · ⇄{state.stats.trades[p.id] + state.stats.bankTrades[p.id]} · ✋{state.stats.stolen[p.id]}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <CompassRose size={80} />
                </div>
              </section>
            </div>
          </ChartSheet>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button className="hc-btn" onClick={rematch}>
              <Icon name="refresh" size={18} /> {online ? 'Back to the lobby' : 'Rematch (same seed)'}
            </button>
            <button className="hc-btn hc-btn--dark" onClick={() => go('setup')}>
              New game
            </button>
            <button className="hc-plaque" onClick={() => go('title')}>
              Main menu
            </button>
          </div>
        </div>
      </HallBackground>
    </motion.div>
  );
}
