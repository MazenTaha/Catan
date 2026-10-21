import { useMemo, useState } from 'react';
import type { GameState } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { TERRAIN_NAME } from '../../lexicon';
import { describeEvent, lineText } from '../../state/log';
import { exportRecord, type Settings } from '../../state/persistence';
import { useStore } from '../../state/store';
import { LogLineView, NAME_COLOR } from '../panels/LogLineView';
import { Modal } from '../ui/primitives';

export function LogModal({ state, seat }: { state: GameState; seat: number }) {
  const close = useStore((s) => s.closeModal);
  const session = useStore((s) => s.session);
  const [q, setQ] = useState('');
  const [who, setWho] = useState<number | null>(null);
  const lines = useMemo(() => {
    if (!session) return [];
    const ctx = { players: state.players, viewer: seat, terrainName: (h: number) => TERRAIN_NAME[state.board.hexes[h].terrain] };
    return session.log
      .map((item) => ({ item, line: describeEvent(item.event, ctx) }))
      .filter((x): x is { item: typeof x.item; line: NonNullable<typeof x.line> } => x.line !== null)
      .filter((x) => who === null || x.line.players.includes(who))
      .filter((x) => !q || lineText(x.line, state.players).toLowerCase().includes(q.toLowerCase()))
      .reverse();
  }, [session, state, seat, q, who]);

  const download = () => {
    if (!session) return;
    const blob = new Blob([exportRecord(session.config, session.actions)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hexfall-${session.config.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal title="Chronicle" icon="scroll" onClose={close} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="min-w-[180px] flex-1 rounded-xl border border-iron bg-surface-2 px-3 py-1.5 text-[15px] text-bone placeholder:text-muted"
          placeholder="Search the chronicle…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search log"
        />
        <button className={`chip ${who === null ? 'border-gold text-gold' : 'text-muted'}`} onClick={() => setWho(null)}>
          All
        </button>
        {state.players.map((p) => (
          <button key={p.id} className={`chip ${who === p.id ? 'border-gold' : ''}`} onClick={() => setWho(p.id)} style={{ color: NAME_COLOR[p.color] }}>
            {p.name}
          </button>
        ))}
        <button className="btn !py-1 text-[11px]" onClick={download} title="Seed + action log, replayable">
          <Icon name="export" size={14} /> Export JSON
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {lines.map(({ item, line }) => (
          <div key={item.seq} className="flex gap-3 border-b border-iron/30 pb-1">
            <span className="num w-10 shrink-0 text-[13px] text-muted">{item.round ? `R${item.round}` : '—'}</span>
            <LogLineView line={line} players={state.players} />
          </div>
        ))}
        {!lines.length && <p className="text-muted">Nothing recorded.</p>}
      </div>
    </Modal>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-20 text-[15px]">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[#f2ac52]"
      />
      <span className="num w-10 text-right text-[14px] text-muted">{Math.round(value * 100)}</span>
    </label>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 accent-[#f2ac52]" />
      <span>
        <span className="text-[15px]">{label}</span>
        {hint && <span className="block text-[14px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span className="w-28 text-[15px]">{label}</span>
      {options.map((o) => (
        <button key={String(o.v)} className={`chip ${o.v === value ? 'border-gold text-gold' : 'text-muted'}`} onClick={() => onChange(o.v)} aria-pressed={o.v === value}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function SettingsModal() {
  const close = useStore((s) => s.closeModal);
  const s = useStore((st) => st.settings);
  const up = useStore((st) => st.updateSettings);
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => up({ [k]: v } as Partial<Settings>);
  return (
    <Modal title="Settings" icon="settings" onClose={close}>
      <h3 className="panel-title mb-2">Sound</h3>
      <div className="flex flex-col gap-2">
        <Slider label="Master" value={s.master} onChange={set('master')} />
        <Slider label="Music" value={s.music} onChange={set('music')} />
        <Slider label="Effects" value={s.sfx} onChange={set('sfx')} />
        <Toggle label="Mute all" checked={s.muted} onChange={set('muted')} />
      </div>
      <h3 className="panel-title mb-2 mt-5">Display</h3>
      <Toggle label="Reduce motion" hint="Disables particles and large movement (also follows your system setting)." checked={s.reduceMotion} onChange={set('reduceMotion')} />
      <Toggle label="Colorblind assist" hint="Adds resource glyphs on tiles; pieces always carry sigils." checked={s.colorblind} onChange={set('colorblind')} />
      <Choice
        label="Graphics"
        value={s.effects}
        options={[{ v: 'auto', l: s.effects === 'auto' && s.autoLite ? 'Auto (lite)' : 'Auto' }, { v: 'full', l: 'Full' }, { v: 'lite', l: 'Lite' }]}
        onChange={(v) => up({ effects: v, autoLite: false })}
      />
      <p className="mb-1 text-[14px] text-muted">Lite turns off embers and looping animations. Auto switches to it when your browser can’t keep up.</p>
      <Choice label="Theme" value={s.theme} options={[{ v: 'hexfall', l: 'Ember' }, { v: 'frostbound', l: 'Frostbound' }]} onChange={set('theme')} />
      <Choice label="UI scale" value={s.uiScale} options={[{ v: 0.9, l: '90%' }, { v: 1, l: '100%' }, { v: 1.1, l: '110%' }, { v: 1.25, l: '125%' }]} onChange={set('uiScale')} />
      <h3 className="panel-title mb-2 mt-5">Play</h3>
      <Choice label="Hot-seat" value={s.handPrivacy} options={[{ v: 'curtain', l: 'Pass-device curtain' }, { v: 'off', l: 'Open hands' }]} onChange={set('handPrivacy')} />
      <Toggle label="Always hide my hand until I hold" checked={s.hideHandUntilHold} onChange={set('hideHandUntilHold')} />
      <Toggle label="Show why spots are illegal" hint="Marks blocked settlement spots with the reason on hover." checked={s.showWhy} onChange={set('showWhy')} />
      <Toggle label="Rookie tips" checked={s.rookieTips} onChange={(v) => up({ rookieTips: v, dismissedTips: v ? [] : s.dismissedTips })} />
      <Choice label="Bot speed" value={s.botSpeed} options={[{ v: 'slow', l: 'Slow' }, { v: 'normal', l: 'Normal' }, { v: 'fast', l: 'Fast' }, { v: 'instant', l: 'Instant' }]} onChange={set('botSpeed')} />
      <Choice label="Turn timer" value={s.turnTimer} options={[{ v: 0, l: 'Off' }, { v: 30, l: '30s' }, { v: 60, l: '60s' }, { v: 90, l: '90s' }]} onChange={set('turnTimer')} />
      <p className="mt-3 text-[14px] text-muted">Hot-seat mode applies to new games.</p>
    </Modal>
  );
}
