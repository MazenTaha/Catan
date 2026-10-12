import { useMemo, useState } from 'react';
import {
  MAX_TARGET,
  MIN_TARGET,
  PLAYER_COLORS,
  SIGILS,
  createGame,
  randomSeed,
  validateConfig,
  type BotLevel,
  type GameConfig,
  type LayoutMode,
  type PlayerColor,
  type SeatConfig,
  type Sigil,
} from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { PlayerDisc, SigilGlyph } from '../../art/pieces/Sigil';
import { audio } from '../../audio/engine';
import { BOT_BLURB, BOT_NAME, COLOR_HEX, COLOR_NAME, DEFAULT_NAMES, LAYOUT_NAME, SIGIL_NAME } from '../../lexicon';
import { useStore } from '../../state/store';
import { BoardView } from '../board/Board';

const BOTS: BotLevel[] = ['wanderer', 'warlord', 'archdemon'];

function defaultSeats(): SeatConfig[] {
  return PLAYER_COLORS.map((color, i) => ({
    name: DEFAULT_NAMES[i],
    color,
    sigil: SIGILS[i],
    kind: i === 0 ? 'human' : 'bot',
    bot: 'warlord',
  }));
}

export function NewGameScreen() {
  const go = useStore((s) => s.go);
  const startGame = useStore((s) => s.startGame);
  const [count, setCount] = useState(4);
  const [seats, setSeats] = useState<SeatConfig[]>(defaultSeats);
  const [target, setTarget] = useState(10);
  const [layout, setLayout] = useState<LayoutMode>('balanced');
  const [seed, setSeed] = useState(() => randomSeed());
  const [rollOff, setRollOff] = useState(true);

  const active = seats.slice(0, count);
  const config: GameConfig = {
    seed: seed.trim() || 'hexfall',
    seats: active.map((s) => (s.kind === 'human' ? { ...s, bot: undefined } : s)),
    targetVp: target,
    layout,
    firstPlayer: rollOff ? 'rolloff' : 0,
  };
  const error = validateConfig(config);
  const preview = useMemo(() => {
    try {
      return createGame({ ...config, seats: config.seats.map((s, i) => ({ ...s, name: s.name || `P${i}` })) });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.seed, layout]);

  const update = (i: number, patch: Partial<SeatConfig>) => {
    setSeats((prev) => {
      const next = prev.map((s) => ({ ...s }));
      // Swapping keeps colors and sigils unique.
      if (patch.color) {
        const j = next.findIndex((s, k) => k !== i && s.color === patch.color);
        if (j >= 0) next[j].color = next[i].color;
      }
      if (patch.sigil) {
        const j = next.findIndex((s, k) => k !== i && s.sigil === patch.sigil);
        if (j >= 0) next[j].sigil = next[i].sigil;
      }
      next[i] = { ...next[i], ...patch };
      return next;
    });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-3">
        <button className="btn btn-ghost !px-2" onClick={() => go('title')} aria-label="Back to menu">
          <Icon name="arrow" className="rotate-180" />
        </button>
        <h1 className="font-display text-[26px] uppercase tracking-[0.2em] text-gold">Raise a new isle</h1>
      </header>
      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <section className="panel rivets px-5 py-4">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="panel-title flex-1">Seats</h2>
            {[3, 4].map((n) => (
              <button key={n} className={`chip ${count === n ? 'border-gold text-gold' : 'text-muted'}`} onClick={() => setCount(n)} aria-pressed={count === n}>
                {n} players
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            {active.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 border border-iron/70 bg-surface-2/60 px-3 py-2.5">
                <PlayerDisc color={s.color} sigil={s.sigil} size={36} />
                <input
                  className="w-36 border border-iron bg-surface-1 px-2 py-1.5 text-[15px] text-bone"
                  value={s.name}
                  maxLength={16}
                  onChange={(e) => update(i, { name: e.target.value })}
                  aria-label={`Seat ${i + 1} name`}
                  data-testid={`seat-name-${i}`}
                />
                <div className="flex gap-1" role="radiogroup" aria-label={`Seat ${i + 1} color`}>
                  {PLAYER_COLORS.map((c: PlayerColor) => (
                    <button
                      key={c}
                      role="radio"
                      aria-checked={s.color === c}
                      aria-label={COLOR_NAME[c]}
                      title={COLOR_NAME[c]}
                      className={`h-6 w-6 rounded-full border-2 ${s.color === c ? 'border-gold' : 'border-transparent'}`}
                      style={{ background: COLOR_HEX[c] }}
                      onClick={() => update(i, { color: c })}
                    />
                  ))}
                </div>
                <div className="flex gap-1" role="radiogroup" aria-label={`Seat ${i + 1} sigil`}>
                  {SIGILS.map((g: Sigil) => (
                    <button
                      key={g}
                      role="radio"
                      aria-checked={s.sigil === g}
                      aria-label={SIGIL_NAME[g]}
                      title={SIGIL_NAME[g]}
                      className={`grid h-7 w-7 place-items-center border ${s.sigil === g ? 'border-gold text-gold' : 'border-iron text-muted'}`}
                      onClick={() => update(i, { sigil: g })}
                    >
                      <SigilGlyph sigil={g} size={15} />
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    className={`chip ${s.kind === 'human' ? 'border-gold text-gold' : 'text-muted'}`}
                    onClick={() => update(i, { kind: 'human' })}
                    aria-pressed={s.kind === 'human'}
                    data-testid={`seat-human-${i}`}
                  >
                    <Icon name="user" size={12} /> Human
                  </button>
                  <button
                    className={`chip ${s.kind === 'bot' ? 'border-gold text-gold' : 'text-muted'}`}
                    onClick={() => update(i, { kind: 'bot', bot: s.bot ?? 'warlord' })}
                    aria-pressed={s.kind === 'bot'}
                  >
                    <Icon name="bot" size={12} /> Bot
                  </button>
                  {s.kind === 'bot' && (
                    <select
                      className="border border-iron bg-surface-1 px-1.5 py-1 text-[14px] text-bone"
                      value={s.bot}
                      onChange={(e) => update(i, { bot: e.target.value as BotLevel })}
                      aria-label={`Seat ${i + 1} bot difficulty`}
                      title={BOT_BLURB[s.bot ?? 'warlord']}
                    >
                      {BOTS.map((b) => (
                        <option key={b} value={b}>
                          {BOT_NAME[b]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>

          <h2 className="panel-title mb-2 mt-5">Rules</h2>
          <label className="flex items-center gap-3">
            <span className="w-32 text-[15px]">Victory at</span>
            <input type="range" min={MIN_TARGET} max={MAX_TARGET} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="flex-1 accent-[#c9a24b]" aria-label="Target victory points" />
            <span className="num w-10 text-right text-[20px] text-gold">{target}</span>
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="w-32 text-[15px]">First player</span>
            <button className={`chip ${rollOff ? 'border-gold text-gold' : 'text-muted'}`} onClick={() => setRollOff(true)}>
              Dice roll-off
            </button>
            <button className={`chip ${!rollOff ? 'border-gold text-gold' : 'text-muted'}`} onClick={() => setRollOff(false)}>
              Seat 1
            </button>
          </div>
        </section>

        <section className="panel rivets flex flex-col px-5 py-4">
          <h2 className="panel-title mb-2">The isle</h2>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(LAYOUT_NAME) as LayoutMode[]).map((l) => (
              <button key={l} className={`chip ${layout === l ? 'border-gold text-gold' : 'text-muted'}`} onClick={() => setLayout(l)} aria-pressed={layout === l}>
                {LAYOUT_NAME[l]}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              className="flex-1 border border-iron bg-surface-1 px-2 py-1.5 font-mono text-[14px] text-bone"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              aria-label="Seed"
              data-testid="seed"
            />
            <button className="btn !px-2" onClick={() => setSeed(randomSeed())} aria-label="Randomize seed" title="Randomize">
              <Icon name="refresh" />
            </button>
          </div>
          <p className="mt-1 text-[14px] text-muted">Same seed, same isle. Share it to replay.</p>
          <div className="mt-3">{preview && <BoardView state={preview} canAct={false} decorative />}</div>
          {error && <p className="mt-2 text-ember">{error}</p>}
          <button
            className="btn btn-primary mt-auto w-full !py-3 text-[16px]"
            disabled={!!error}
            onClick={() => {
              audio.unlock();
              startGame(config);
            }}
            data-testid="begin"
          >
            <Icon name="flag" /> Begin
          </button>
        </section>
      </div>
    </main>
  );
}
