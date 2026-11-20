import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameState } from '@hexfall/engine';
import { Icon, type IconName } from '../../art/icons/Icon';
import { TERRAIN_NAME } from '../../lexicon';
import { describeEvent, lineText } from '../../state/log';
import { DEFAULT_SETTINGS, exportRecord, type Settings } from '../../state/persistence';
import { useStore } from '../../state/store';
import { LogLineView, INK_NAME } from '../panels/LogLineView';
import { Modal, useDialogTrap } from '../ui/primitives';
import { Arms } from '../../ui/hall/Arms';
import { Banner, BannerPole, type Cloth, type Ordinary } from '../../ui/hall/Banner';
import { Check, SealButton, Seg } from '../../ui/hall/Controls';
import { ChartSheet, CompassRose, HallBackground, StoneColumn, Torch } from '../../ui/hall/Surfaces';
import { useViewport } from '../../ui/hall/useViewport';

/** The Chronicle: every event, searchable and filterable by player, exportable as a record. */
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
        <input className="hc-input min-w-[180px] flex-1" placeholder="Search the chronicle…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search log" />
        <button className="hc-paper-btn hc-paper-btn--sm" onClick={download} title="Seed + action log, replayable">
          <Icon name="export" size={15} /> Export JSON
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by player">
        <button className="hc-paper-btn hc-paper-btn--sm" aria-pressed={who === null} onClick={() => setWho(null)}>
          All
        </button>
        {state.players.map((p) => (
          <button key={p.id} className="hc-paper-btn hc-paper-btn--sm gap-1.5" aria-pressed={who === p.id} onClick={() => setWho(p.id)} style={who === p.id ? undefined : { color: INK_NAME[p.color] }}>
            <Arms color={p.color} sigil={p.sigil} size={18} /> {p.name}
          </button>
        ))}
      </div>
      <ChartSheet pad={22} style={{ margin: '12px 4px' }}>
        <div className="flex flex-col">
          {lines.map(({ item, line }, i) => (
            <div key={item.seq} className={`flex gap-3 py-1 ${i ? 'border-t-[1.5px] border-dotted border-[color:var(--map-ink-muted)]' : ''}`}>
              <span className="hc-num w-10 shrink-0 pt-0.5 text-[15px] hc-rubric">{item.round ? `R${item.round}` : '—'}</span>
              <LogLineView line={line} players={state.players} />
            </div>
          ))}
          {!lines.length && <p className="italic hc-ink-muted">Nothing recorded.</p>}
        </div>
      </ChartSheet>
    </Modal>
  );
}

// ------------------------------------------------------------------ settings

function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-[1.5px] border-dotted border-[color:var(--map-ink-muted)] py-2.5">
      <span className="min-w-[180px] flex-1">
        <span className="block text-[20px] leading-tight">{label}</span>
        {hint && <span className="hc-gloss block hc-ink-muted">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Row label={label}>
      <label className="flex min-w-[220px] flex-1 items-center gap-3">
        <span className="sr-only">{label}</span>
        <input type="range" min={0} max={1} step={0.05} value={value} onChange={(e) => onChange(Number(e.target.value))} className="hc-range min-h-[44px] flex-1" />
        <span className="hc-num w-10 text-right text-[22px] hc-rubric">{Math.round(value * 100)}</span>
      </label>
    </Row>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="border-b-[1.5px] border-dotted border-[color:var(--map-ink-muted)]">
      <Check label={label} hint={hint} checked={checked} onChange={onChange} />
    </div>
  );
}

function Choice<T extends string | number>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <Row label={label} hint={hint}>
      <Seg label={label} value={value} onChange={onChange} options={options} />
    </Row>
  );
}

type Section = 'play' | 'board' | 'sound' | 'access';
const SECTIONS: { id: Section; label: string; title: string; icon: IconName; tincture: Cloth; ordinary: Ordinary; ordinaryTincture: Cloth }[] = [
  { id: 'play', label: 'Gameplay', title: 'Of Gameplay', icon: 'dice', tincture: 'gules', ordinary: 'quarterly', ordinaryTincture: 'or' },
  { id: 'board', label: 'Board', title: 'Of the Board', icon: 'eye', tincture: 'azure', ordinary: 'chevron', ordinaryTincture: 'argent' },
  { id: 'sound', label: 'Sound', title: 'Of Sound', icon: 'sound', tincture: 'vert', ordinary: 'bend', ordinaryTincture: 'or' },
  { id: 'access', label: 'Access', title: 'Of Access', icon: 'question', tincture: 'purpure', ordinary: 'chief', ordinaryTincture: 'sable' },
];

/**
 * Settings: the hall with one banner per section hanging from a pole (the chosen one longer and
 * lit), and the section's options on a chart below. Changes apply as they are made.
 */
export function SettingsModal() {
  const close = useStore((s) => s.closeModal);
  const s = useStore((st) => st.settings);
  const up = useStore((st) => st.updateSettings);
  const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => up({ [k]: v } as Partial<Settings>);
  const [section, setSection] = useState<Section>('play');
  const ref = useRef<HTMLDivElement>(null);
  useDialogTrap(ref, true, close);
  const vp = useViewport();
  const small = vp.w < 760;
  const current = SECTIONS.find((x) => x.id === section)!;

  return (
    <div ref={ref} className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Settings">
      <HallBackground
        className="min-h-full"
        decor={
          !small && (
            <>
              <StoneColumn side="left" />
              <StoneColumn side="right" />
              <Torch x="calc(50% - 600px)" y={60} height={140} />
              <Torch x="calc(50% + 540px)" y={60} height={140} flip />
            </>
          )
        }
      >
        <div className="mx-auto flex max-w-[960px] flex-col items-center px-3 pb-10 pt-6">
          <div className="flex w-full items-start">
            <button className="hc-plaque shrink-0" onClick={close}>
              <Icon name="arrow" className="rotate-180" size={16} /> Back
            </button>
          </div>
          <div role="tablist" aria-label="Settings sections" className="-mt-2">
            <BannerPole gap={small ? 8 : 24} overhang={small ? 26 : 46}>
              {SECTIONS.map((x) => {
                const on = x.id === section;
                const w = small ? 74 : 128;
                return (
                  <Banner
                    key={x.id}
                    as="button"
                    role="tab"
                    aria-selected={on}
                    width={w}
                    height={(small ? 120 : 180) + (on ? 30 : 0)}
                    tincture={x.tincture}
                    ordinary={x.ordinary}
                    ordinaryTincture={x.ordinaryTincture}
                    icon={x.icon}
                    label={x.label}
                    labelSize={small ? 13 : 17}
                    selected={on}
                    onClick={() => setSection(x.id)}
                    className="hc-banner-tab"
                  />
                );
              })}
            </BannerPole>
          </div>

          <ChartSheet className="mt-4 w-full" pad={small ? 20 : 40}>
            <div className="flex flex-wrap items-baseline gap-x-4">
              <h2 className="hc-title text-[color:var(--rubric-dark)]" style={{ fontSize: small ? 38 : 50 }}>
                {current.title}
              </h2>
              <span className="text-[17px] italic hc-ink-muted">kept as you change it</span>
            </div>
            <div className="mt-2 grid gap-6 md:grid-cols-[minmax(0,1fr)_200px]" role="tabpanel" aria-label={current.label}>
              <div>
                {section === 'play' && (
                  <>
                    <Choice label="Hot-seat" hint="Hot-seat mode applies to new games." value={s.handPrivacy} options={[{ v: 'curtain', l: 'Pass-device curtain' }, { v: 'off', l: 'Open hands' }]} onChange={set('handPrivacy')} />
                    <Toggle label="Always hide my hand until I hold" checked={s.hideHandUntilHold} onChange={set('hideHandUntilHold')} />
                    <Toggle label="Rookie tips" checked={s.rookieTips} onChange={(v) => up({ rookieTips: v, dismissedTips: v ? [] : s.dismissedTips })} />
                    <Choice label="Bot speed" value={s.botSpeed} options={[{ v: 'slow', l: 'Slow' }, { v: 'normal', l: 'Normal' }, { v: 'fast', l: 'Fast' }, { v: 'instant', l: 'Instant' }]} onChange={set('botSpeed')} />
                    <Choice label="Turn timer" value={s.turnTimer} options={[{ v: 0, l: 'Off' }, { v: 30, l: '30s' }, { v: 60, l: '60s' }, { v: 90, l: '90s' }]} onChange={set('turnTimer')} />
                  </>
                )}
                {section === 'board' && (
                  <>
                    <Choice
                      label="Graphics"
                      hint="Lite turns off embers, looping animations and 3D shadows. Auto lowers the 3D walk’s resolution while frames run late, and switches to Lite when your browser can’t keep up."
                      value={s.effects}
                      options={[{ v: 'auto', l: s.effects === 'auto' && s.autoLite ? 'Auto (lite)' : 'Auto' }, { v: 'full', l: 'Full' }, { v: 'lite', l: 'Lite' }]}
                      onChange={(v) => up({ effects: v, autoLite: false })}
                    />
                    <Choice label="3D resolution" hint="Draws the 3D walk at fewer pixels on slower graphics; menus and text stay sharp." value={s.renderScale} options={[{ v: 1, l: '100%' }, { v: 0.75, l: '75%' }, { v: 0.5, l: '50%' }]} onChange={set('renderScale')} />
                    <Row label="Mouse look" hint="How fast the 3D walk’s view turns.">
                      <label className="flex min-w-[220px] flex-1 items-center gap-3">
                        <input type="range" min={0.3} max={3} step={0.1} value={s.mouseSensitivity} onChange={(e) => up({ mouseSensitivity: Number(e.target.value) })} className="hc-range min-h-[44px] flex-1" aria-label="Mouse look sensitivity" />
                        <span className="hc-num w-12 text-right text-[22px] hc-rubric">{s.mouseSensitivity.toFixed(1)}×</span>
                      </label>
                    </Row>
                    <Choice label="Theme" value={s.theme} options={[{ v: 'hexfall', l: 'Ember' }, { v: 'frostbound', l: 'Frostbound' }]} onChange={set('theme')} />
                    <Choice label="UI scale" hint="Menus, chart and panels." value={s.uiScale} options={[{ v: 0.9, l: '90%' }, { v: 1, l: '100%' }, { v: 1.1, l: '110%' }, { v: 1.25, l: '125%' }]} onChange={set('uiScale')} />
                  </>
                )}
                {section === 'sound' && (
                  <>
                    <Slider label="Master" value={s.master} onChange={set('master')} />
                    <Slider label="Effects" value={s.sfx} onChange={set('sfx')} />
                    <Slider label="Music" value={s.music} onChange={set('music')} />
                    <Toggle label="Mute all" checked={s.muted} onChange={set('muted')} />
                  </>
                )}
                {section === 'access' && (
                  <>
                    <Toggle label="Reduce motion" hint="Disables particles and large movement (also follows your system setting)." checked={s.reduceMotion} onChange={set('reduceMotion')} />
                    <Toggle label="Colorblind assist" hint="Adds resource glyphs on tiles; pieces always carry sigils." checked={s.colorblind} onChange={set('colorblind')} />
                    <Toggle label="Show why spots are illegal" hint="Marks blocked settlement spots with the reason on hover." checked={s.showWhy} onChange={set('showWhy')} />
                  </>
                )}
              </div>
              {!small && (
                <div className="flex flex-col items-center justify-end">
                  <CompassRose size={130} />
                </div>
              )}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <SealButton onClick={close}>Done</SealButton>
              <button className="hc-paper-btn" onClick={() => up({ ...DEFAULT_SETTINGS })}>
                Restore defaults
              </button>
            </div>
          </ChartSheet>
        </div>
      </HallBackground>
    </div>
  );
}
