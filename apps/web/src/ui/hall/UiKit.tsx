import { useState } from 'react';
import { RESOURCES } from '@hexfall/engine';
import { Icon } from '../../art/icons/Icon';
import { ResourceCard, Stepper, Tooltip, SegmentedTabs, IconButton, CountsInline, CostPips, Modal, RookieTip } from '../../components/ui/primitives';
import { Arms } from './Arms';
import { Banner, BannerPole } from './Banner';
import { BoneDie, Check, MapNote, ResourceArt, ScaleBar, SealButton, Seg } from './Controls';
import { Candle, ChartSheet, CoinStack, CompassRose, HallBackground, HallLoader, NightWindow, OakPanel, ParchmentSheet, StoneColumn, TitleRibbon, Torch, WarTable, WaxSeal } from './Surfaces';

/** Dev only (`/#ui-kit`): every Hall & Chart component in every state, on the stone wall. */
export default function UiKit() {
  const [check, setCheck] = useState(true);
  const [seg, setSeg] = useState<'a' | 'b' | 'c'>('b');
  const [step, setStep] = useState(3);
  const [tab, setTab] = useState<'build' | 'cards' | 'trade'>('build');
  const [range, setRange] = useState(10);
  const [decree, setDecree] = useState(false);
  const h = { padding: 24 } as const;
  return (
    <HallBackground
      decor={
        <>
          <StoneColumn side="left" />
          <StoneColumn side="right" />
          <NightWindow x={140} y={40} size={170} />
          <Torch x={330} y={60} height={130} />
        </>
      }
    >
      <main className="mx-auto flex max-w-[1240px] flex-col gap-10 px-[120px] py-10">
        <h1 className="hc-title hc-title-gold text-[62px]">The Kit of the Hall</h1>
        <TitleRibbon>Trade · Build · Settle</TitleRibbon>

        <section aria-label="Banners">
          <BannerPole gap={20}>
            <Banner width={128} height={300} tincture="sable" ordinary="chief" ordinaryTincture="gules" icon="settings" label="Settings" gloss="Sound & sight" as="button" />
            <Banner width={138} height={340} tincture="purpure" ordinary="bend" ordinaryTincture="or" icon="user" label="Character" gloss="Name & arms" as="button" />
            <Banner width={186} height={452} tincture="gules" ordinary="pale" ordinaryTincture="#6e1210" icon="flag" label="Play" labelSize={26} gloss="Muster a new table" as="button" lit />
            <Banner width={152} height={386} tincture="vert" ordinary="chevron" ordinaryTincture="or" icon="citadel" label="My kingdom" gloss="Holdings & deeds" as="button" disabled />
            <Banner width={150} height={196} tincture={{ player: 'frost' }} arms={{ color: 'frost', sigil: 'moon' }} numeral={6} label="Morrow" labelSize={18} />
            <Banner width={150} height={196} tincture="sable" arms="empty" label="Empty seat" labelSize={17} away />
          </BannerPole>
          <p className="mt-2 hc-on-dark-muted">Settings, Character (hover sways), Play (lit), My kingdom (disabled), a player with VP, an empty seat (away).</p>
          <div className="mt-6">
            <BannerPole gap={14}>
              {(['gules', 'azure', 'vert', 'purpure', 'sable'] as const).map((t, i) => (
                <Banner
                  key={t}
                  width={120}
                  height={170}
                  tincture={t}
                  ordinary={(['quarterly', 'saltire', 'paly', 'chevron', 'bend'] as const)[i]}
                  ordinaryTincture={i % 2 ? 'argent' : 'or'}
                  icon={(['dice', 'eye', 'sound', 'question', 'log'] as const)[i]}
                  label={t}
                  labelSize={16}
                  as="button"
                  aria-selected={i === 1}
                  role="tab"
                  selected={i === 1}
                />
              ))}
            </BannerPole>
          </div>
        </section>

        <section className="flex flex-wrap items-end gap-4" aria-label="Arms">
          {(['crimson', 'frost', 'bone', 'violet'] as const).map((c, i) => (
            <Arms key={c} color={c} sigil={(['skull', 'moon', 'eye', 'thorn'] as const)[i]} size={[96, 64, 32, 18][i]} label={c} />
          ))}
          <BoneDie value={3} />
          <BoneDie value={4} />
          <BoneDie value={6} red />
          <Candle />
          <CoinStack />
          <WaxSeal />
          <CompassRose />
        </section>

        <section className="flex flex-wrap items-center gap-4" aria-label="Buttons">
          <button className="hc-btn">End turn</button>
          <button className="hc-btn" disabled>
            Begin the game
          </button>
          <button className="hc-btn hc-btn--dark">Seat a bot</button>
          <button className="hc-plaque">
            <Icon name="arrow" className="rotate-180" size={16} /> The hall
          </button>
          <button className="hc-plaque" aria-pressed>
            2D
          </button>
          <button className="hc-plaque hc-plaque--iron">
            <Icon name="leave" size={16} /> Quit
          </button>
          <IconButton icon="undo" label="Undo" onClick={() => {}} />
          <IconButton icon="sound" label="Mute" onClick={() => {}} pressed />
          <IconButton icon="log" label="Log" onClick={() => {}} disabled />
          <button className="hc-btn" data-loading="true">
            Opening…
          </button>
        </section>

        <div className="grid grid-cols-2 gap-8">
          <ParchmentSheet className="flex flex-col gap-3 p-6">
            <h2 className="hc-title text-[44px] text-[color:var(--rubric-dark)]">Of the Board</h2>
            <Check label="Rookie tips" hint="Small notes for a first game." checked={check} onChange={setCheck} />
            <Check label="Disabled option" checked={false} onChange={() => {}} disabled />
            <Seg label="Layout" value={seg} onChange={setSeg} options={[{ v: 'a', l: 'Balanced' }, { v: 'b', l: 'Fully random' }, { v: 'c', l: 'Beginner board' }]} />
            <div className="flex items-center gap-4">
              <Stepper value={step} onChange={setStep} max={9} label="cards" />
              <select className="hc-select">
                <option>Medium</option>
                <option>Hard</option>
              </select>
              <input className="hc-input" placeholder="DUSK-42" />
            </div>
            <label className="flex items-center gap-3">
              Victory at <input type="range" className="hc-range flex-1" min={5} max={15} value={range} onChange={(e) => setRange(+e.target.value)} />
              <span className="hc-num text-[24px] hc-rubric">{range}</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button className="hc-paper-btn">Counter</button>
              <button className="hc-paper-btn hc-paper-btn--danger">Decline</button>
              <button className="hc-paper-btn" disabled>
                Disabled
              </button>
              <SealButton onClick={() => setDecree(true)}>Accept</SealButton>
            </div>
            <CountsInline counts={{ wool: 2, ore: 1, grain: 3 }} />
            <CostPips cost={{ grain: 2, ore: 3 }} hand={{ wood: 0, clay: 0, wool: 0, grain: 2, ore: 1 }} />
          </ParchmentSheet>

          <OakPanel title="Thy Treasury">
            <div className="flex flex-col gap-3 p-3">
              <div className="flex gap-1.5">
                {RESOURCES.map((r, i) => (
                  <div key={r} className="min-w-0 max-w-[68px] flex-1">
                    <ResourceCard res={r} count={[1, 0, 3, 2, 5][i]} gained={i === 2 ? 1 : 0} need={i === 3 ? 'have' : i === 4 ? 'missing' : null} fluid />
                  </div>
                ))}
              </div>
              <ScaleBar value={9} label="Hand size" />
              <SegmentedTabs label="Actions" value={tab} onChange={setTab} items={[{ id: 'build', label: 'Build' }, { id: 'cards', label: 'Cards', badge: 2 }, { id: 'trade', label: 'Trade' }]} />
              <div className="flex items-center gap-2">
                {RESOURCES.map((r) => (
                  <ResourceArt key={r} res={r} size={[16, 24, 32, 48, 64][RESOURCES.indexOf(r)]} />
                ))}
              </div>
              <Tooltip label="Over the limit: a 7 costs you 2 cards">
                <span className="hc-label text-[16px]" tabIndex={0}>
                  Hover for a map note
                </span>
              </Tooltip>
            </div>
          </OakPanel>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <ChartSheet>
            <h3 className="hc-label text-center text-[18px]">· As it shall appear ·</h3>
            <MapNote title="A fair place to settle">Lumber 9 · Wool 4 · Brick 10 — ten pips.</MapNote>
            <div className="mt-4" style={h}>
              <RookieTip id="kit-demo">Settlements can’t be next to another settlement.</RookieTip>
            </div>
          </ChartSheet>
          <div className="flex flex-col gap-4">
            <div className="hc-slip">
              <span className="hc-rubric">
                <Icon name="close" size={18} />
              </span>
              Not enough resources for a City
            </div>
            <div className="hc-slip">
              <span className="hc-ok">
                <Icon name="gain" size={18} />
              </span>
              Morrow claims Longest Road (6)
            </div>
            <div className="hc-plaque hc-plaque--iron self-start" role="status">
              <Icon name="close" size={16} /> Connection lost — reconnecting…
            </div>
            <div className="h-28 rounded bg-black/30">
              <HallLoader>Building the island…</HallLoader>
            </div>
          </div>
        </div>
        <WarTable style={{ height: 120 }} />
      </main>
      {decree && (
        <Modal title="A Bargain Offered" icon="trade" onClose={() => setDecree(false)} emblem={<Arms color="frost" sigil="moon" size={44} />}>
          <p>Morrow offers two Wool for one Ore.</p>
          <hr className="hc-dots" />
          <div className="mt-3 flex items-center gap-3">
            <SealButton onClick={() => setDecree(false)}>Accept</SealButton>
            <button className="hc-paper-btn">Counter</button>
            <button className="hc-paper-btn">Decline</button>
          </div>
        </Modal>
      )}
    </HallBackground>
  );
}
