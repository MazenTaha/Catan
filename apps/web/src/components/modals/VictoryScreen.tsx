import { motion } from 'framer-motion';
import { RESOURCES, totalCards, vpBreakdown, type GameState } from '@hexfall/engine';
import { Icon, RES_COLOR, ResourceGlyph } from '../../art/icons/Icon';
import { PlayerDisc } from '../../art/pieces/Sigil';
import { HOST, LONGEST, RESOURCE_NAME } from '../../lexicon';
import { useStore } from '../../state/store';
import { NAME_COLOR } from '../panels/LogLineView';

export default function VictoryScreen({ state }: { state: GameState }) {
  const rematch = useStore((s) => s.rematch);
  const online = useStore((s) => !!s.session?.online);
  const go = useStore((s) => s.go);
  const winner = state.winner ?? 0;
  const w = state.players[winner];
  const rows = state.players
    .map((p) => ({ p, b: vpBreakdown(state, p.id) }))
    .sort((a, b) => b.b.total - a.b.total);
  const rolls = state.stats.rolls;
  const maxRoll = Math.max(1, ...rolls);
  return (
    <motion.div
      className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      role="dialog"
      aria-modal="true"
      aria-label="Victory"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-center py-8">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.3, type: 'spring', stiffness: 80 }}>
          <PlayerDisc color={w.color} sigil={w.sigil} size={120} active />
        </motion.div>
        <motion.h2
          className="mt-6 text-center font-logo text-[44px] leading-tight text-gold"
          style={{ textShadow: '0 0 30px rgba(201,162,75,.45)' }}
          initial={{ y: 20, opacity: 0, letterSpacing: '0.3em' }}
          animate={{ y: 0, opacity: 1, letterSpacing: '0.06em' }}
          transition={{ delay: 0.6, duration: 1.2 }}
        >
          {w.name} wins!
        </motion.h2>
        <motion.p className="mt-2 text-[18px] text-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>
          after {state.round} rounds, with {vpBreakdown(state, winner).total} points
        </motion.p>

        <motion.section className="panel rivets mt-8 w-full px-5 py-4" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.6 }}>
          <h3 className="panel-title mb-3">Final reckoning</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <thead className="font-display text-[11px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="py-1">Player</th>
                  <th>Settlements</th>
                  <th>Cities</th>
                  <th>{LONGEST}</th>
                  <th>{HOST}</th>
                  <th>Victory Point cards</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, b }) => (
                  <tr key={p.id} className={`border-t border-iron/40 ${p.id === winner ? 'text-gold' : ''}`}>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-2">
                        <PlayerDisc color={p.color} sigil={p.sigil} size={22} />
                        <span style={{ color: NAME_COLOR[p.color] }}>{p.name}</span>
                      </span>
                    </td>
                    <td className="num">{b.outposts}</td>
                    <td className="num">{b.citadels} <span className="text-muted">(×2)</span></td>
                    <td className="num">{b.longest ? '+2' : '—'}</td>
                    <td className="num">{b.host ? '+2' : '—'}</td>
                    <td className="num">{b.relics ? `+${b.relics}` : '—'}</td>
                    <td className="num text-right text-[20px]">{b.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>

        <motion.div className="mt-4 grid w-full gap-4 md:grid-cols-2" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.9 }}>
          <section className="panel rivets px-5 py-4">
            <h3 className="panel-title mb-3">Rolls of fate</h3>
            <div className="flex h-28 items-end gap-1">
              {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => (
                <div key={n} className="flex flex-1 flex-col items-center gap-1">
                  <span className="num text-[11px] text-muted">{rolls[n]}</span>
                  <div className={`w-full ${n === 7 ? 'bg-blood' : n === 6 || n === 8 ? 'bg-ember/80' : 'bg-gold/80'}`} style={{ height: `${(rolls[n] / maxRoll) * 80}px` }} />
                  <span className="num text-[13px] text-muted">{n}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="panel rivets px-5 py-4">
            <h3 className="panel-title mb-3">Spoils</h3>
            <div className="flex flex-col gap-2 text-[14px]">
              {state.players.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="w-24 truncate" style={{ color: NAME_COLOR[p.color] }}>
                    {p.name}
                  </span>
                  <span className="flex flex-1 flex-wrap gap-x-2">
                    {RESOURCES.map((r) => (
                      <span key={r} className="inline-flex items-center gap-0.5" title={`${RESOURCE_NAME[r]} gained`}>
                        <span style={{ color: RES_COLOR[r] }}>
                          <ResourceGlyph res={r} size={13} />
                        </span>
                        <span className="num">{state.stats.gained[p.id][r]}</span>
                      </span>
                    ))}
                  </span>
                  <span className="text-muted" title="Total gained · trades · cards stolen">
                    Σ{totalCards(state.stats.gained[p.id])} · ⇄{state.stats.trades[p.id] + state.stats.bankTrades[p.id]} · ✋{state.stats.stolen[p.id]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </motion.div>

        <motion.div className="mt-8 flex flex-wrap justify-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2 }}>
          <button className="btn btn-primary !px-6 !py-3" onClick={rematch}>
            <Icon name="refresh" size={16} /> {online ? 'Back to the lobby' : 'Rematch (same seed)'}
          </button>
          <button className="btn !px-6 !py-3" onClick={() => go('setup')}>
            New game
          </button>
          <button className="btn !px-6 !py-3" onClick={() => go('title')}>
            Main menu
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
