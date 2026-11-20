import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { applyAction, createGame, decideAction, randomSeed, type GameState } from '@hexfall/engine';
import { Icon, type IconName } from '../../art/icons/Icon';
import { audio } from '../../audio/engine';
import { nativeHost } from '../../state/host';
import { savedOnlineSeat, useNet } from '../../state/net';
import { loadProfile, peekAutosave } from '../../state/persistence';
import { useStore } from '../../state/store';
import { BoardView } from '../board/Board';
import { DEFAULT_NAMES } from '../../lexicon';
import { Arms, blazon } from '../../ui/hall/Arms';
import { Banner, BannerPole, type Cloth, type Ordinary } from '../../ui/hall/Banner';
import { BoneDie, SealButton } from '../../ui/hall/Controls';
import { Candle, ChartSheet, CoinStack, Crest, HallBackground, IronCorners, NightWindow, StoneColumn, TitleRibbon, Torch, WarTable } from '../../ui/hall/Surfaces';
import { useViewport } from '../../ui/hall/useViewport';

/** A decorative board with settlements and roads, played out by bots for the war table. */
function demoBoard(): GameState {
  let s = createGame({
    seed: randomSeed(),
    layout: 'balanced',
    targetVp: 10,
    firstPlayer: 0,
    seats: [
      { name: DEFAULT_NAMES[0], color: 'crimson', sigil: 'skull', kind: 'bot', bot: 'warlord' },
      { name: DEFAULT_NAMES[1], color: 'frost', sigil: 'moon', kind: 'bot', bot: 'warlord' },
      { name: DEFAULT_NAMES[2], color: 'bone', sigil: 'eye', kind: 'bot', bot: 'warlord' },
      { name: DEFAULT_NAMES[3], color: 'violet', sigil: 'thorn', kind: 'bot', bot: 'warlord' },
    ],
  });
  for (let i = 0; i < 60 && s.phase.kind !== 'ended'; i++) {
    const r = applyAction(s, decideAction(s));
    if (!r.ok) break;
    s = r.value.state;
  }
  return s;
}

interface MenuItem {
  key: string;
  label: string;
  icon: IconName;
  tincture: Cloth;
  ordinary: Ordinary;
  ordinaryTincture: Cloth;
  gloss: string;
  onClick: () => void;
  testid?: string;
  primary?: boolean;
}

function pairs<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2));
  return out;
}

/** Banner sizes from the outside in, so the tallest always hangs in the centre. */
const SIZES_6 = [
  [128, 300],
  [138, 340],
  [152, 386],
  [186, 452],
  [152, 386],
  [138, 340],
];
const SIZES_5 = [
  [138, 340],
  [152, 386],
  [186, 452],
  [152, 386],
  [138, 340],
];

export function TitleScreen() {
  const go = useStore((s) => s.go);
  const continueGame = useStore((s) => s.continueGame);
  const openModal = useStore((s) => s.openModal);
  const muted = useStore((s) => s.settings.muted);
  const updateSettings = useStore((s) => s.updateSettings);
  const [save] = useState(() => peekAutosave());
  const [online] = useState(() => savedOnlineSeat());
  const [profile] = useState(loadProfile);
  const net = useNet();
  const [host] = useState(nativeHost);
  const backdrop = useMemo(demoBoard, []);
  const vp = useViewport();
  const narrow = vp.w < 820;
  // Shrink the composition on shorter or narrower windows; never below readable sizes.
  const k = narrow ? 1 : Math.max(0.62, Math.min(1, vp.w / 1440, (vp.h - 10) / 900));

  const press = (fn: () => void) => () => {
    audio.unlock();
    audio.play('click');
    fn();
  };

  const settings: MenuItem = { key: 'settings', label: 'Settings', icon: 'settings', tincture: 'sable', ordinary: 'chief', ordinaryTincture: 'gules', gloss: 'Sound & sight', onClick: () => openModal('settings') };
  const character: MenuItem = { key: 'character', label: 'Character', icon: 'user', tincture: 'purpure', ordinary: 'bend', ordinaryTincture: 'or', gloss: 'Name & arms', onClick: () => openModal('character'), testid: 'character' };
  const cont: MenuItem = {
    key: 'continue',
    label: 'Continue',
    icon: 'hourglass',
    tincture: 'azure',
    ordinary: 'chevron',
    ordinaryTincture: 'argent',
    gloss: save ? (save.state.round > 0 ? `Round ${save.state.round} awaits` : 'Setup awaits') : '',
    onClick: () => continueGame(),
    testid: 'continue',
  };
  const play: MenuItem = { key: 'play', label: 'Play', icon: 'flag', tincture: 'gules', ordinary: 'pale', ordinaryTincture: '#6e1210', gloss: 'Muster a new table', onClick: () => go('setup'), testid: 'new-game', primary: true };
  const kingdom: MenuItem = { key: 'kingdom', label: 'My kingdom', icon: 'citadel', tincture: 'vert', ordinary: 'chevron', ordinaryTincture: 'or', gloss: 'Holdings & deeds', onClick: () => openModal('kingdom'), testid: 'my-kingdom' };
  const rules: MenuItem = { key: 'rules', label: 'How to play', icon: 'rules', tincture: 'sable', ordinary: 'bend', ordinaryTincture: 'azure', gloss: 'The rules', onClick: () => openModal('rules') };

  // Continue only when a save exists; without it the skyline stays symmetric (five banners).
  const items = save ? [settings, character, cont, play, kingdom, rules] : [settings, character, play, kingdom, rules];
  const sizes = save ? SIZES_6 : SIZES_5;

  const banner = (it: MenuItem, i: number, scale: number) => {
    const [w, h] = narrow ? [it.primary ? 150 : 124, it.primary ? 270 : 220] : sizes[i];
    return (
      <Banner
        key={it.key}
        as="button"
        width={Math.round(w * scale)}
        height={Math.round(h * scale)}
        tincture={it.tincture}
        ordinary={it.ordinary}
        ordinaryTincture={it.ordinaryTincture}
        icon={it.icon}
        label={it.label}
        labelSize={narrow ? (it.primary ? 22 : 17) : Math.max(15, Math.round((it.primary ? 26 : 20) * scale))}
        gloss={it.gloss}
        lit={it.primary}
        onClick={press(it.onClick)}
        aria-label={it.label}
        data-testid={it.testid}
      />
    );
  };

  const titleSize = Math.round((narrow ? 54 : 96) * (narrow ? 1 : k));

  return (
    <HallBackground
      className="relative overflow-hidden"
      decor={
        !narrow && (
          <>
            <StoneColumn side="left" width={Math.round(100 * k)} />
            <StoneColumn side="right" width={Math.round(100 * k)} />
            <NightWindow x={`calc(50% - ${560 * k}px)`} y={36 * k} size={190 * k} />
            <NightWindow x={`calc(50% + ${370 * k}px)`} y={36 * k} size={190 * k} />
            <Torch x={`calc(50% - ${615 * k}px)`} y={120 * k} height={150 * k} />
            <Torch x={`calc(50% + ${555 * k}px)`} y={120 * k} height={150 * k} flip />
          </>
        )
      }
    >
      <main className="relative flex min-h-screen flex-col items-center" style={{ paddingTop: (narrow ? 22 : 30) * k }}>
        {/* Title: Catan, the crest, Night; the ribbon under it. */}
        <motion.h1
          className="flex items-center"
          style={{ gap: 14 * k }}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        >
          <span className="hc-title hc-title-gold" style={{ fontSize: titleSize }}>
            Catan
          </span>
          <Crest size={titleSize * 1.05} />
          <span className="hc-title hc-title-gold" style={{ fontSize: titleSize }}>
            Night
          </span>
        </motion.h1>
        <div style={{ marginTop: 4 * k }}>
          <TitleRibbon width={narrow ? 300 : Math.round(380 * k)} size={narrow ? 16 : Math.round(20 * k)}>
            Trade · Build · Settle
          </TitleRibbon>
        </div>

        {/* A summons to a live room: a sealed letter pinned above the pole. */}
        {online && (
          <div className="hc-letter z-10 flex items-center gap-3 px-4 py-2" style={{ marginTop: 12 * k, transform: 'rotate(-1.2deg)' }}>
            <div className="text-[16px]">
              <div className="hc-label text-[13px] hc-rubric">A summons</div>
              Room <b className="hc-num">{online.code}</b> awaits
              {(net.status === 'connecting' || net.error) && (
                <div className="hc-gloss hc-ink-muted" aria-live="polite">
                  {net.status === 'connecting' ? `Rejoining ${online.code}…` : net.error}
                </div>
              )}
            </div>
            <SealButton size={44} onClick={press(() => net.resume(online.code, online.token))} testId="rejoin" title={`Rejoin ${online.code}`}>
              Rejoin
            </SealButton>
          </div>
        )}

        <motion.nav aria-label="Main menu" className="relative z-10" style={{ marginTop: (online ? 22 : 60) * k }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          {narrow ? (
            // Phones: Play hangs alone (with Continue when there is a save), the rest in pairs.
            <div className="flex flex-col items-center gap-12">
              {[items.filter((it) => it.primary || it.key === 'continue'), ...pairs(items.filter((it) => !it.primary && it.key !== 'continue'))].map((row) => (
                <BannerPole key={row[0].key} gap={24} overhang={34}>
                  {row.map((it) => banner(it, items.indexOf(it), 1))}
                </BannerPole>
              ))}
            </div>
          ) : (
            <BannerPole gap={Math.round(20 * k)} overhang={Math.round(46 * k)}>
              {items.map((it, i) => banner(it, i, k))}
            </BannerPole>
          )}
        </motion.nav>

        {/* The war table, with the real island laid on a chart. */}
        {!narrow && (
          <WarTable className="pointer-events-none absolute inset-x-0 bottom-0 z-0" style={{ height: 210 * k }}>
            <div className="absolute left-1/2 top-0 -translate-x-1/2" style={{ width: 760 * k, perspective: 900, perspectiveOrigin: '50% 0%' }} aria-hidden>
              <div style={{ transform: 'rotateX(58deg)', transformOrigin: '50% 0%' }}>
                <ChartSheet pad={22} style={{ margin: 0 }}>
                  <BoardView state={backdrop} canAct={false} decorative />
                </ChartSheet>
              </div>
            </div>
            <Candle height={86 * k} style={{ position: 'absolute', left: `calc(50% - ${470 * k}px)`, top: -40 * k }} />
            <Candle height={86 * k} style={{ position: 'absolute', left: `calc(50% + ${450 * k}px)`, top: -40 * k }} />
            <CoinStack width={70 * k} style={{ position: 'absolute', left: `calc(50% + ${330 * k}px)`, top: 80 * k }} />
            <div className="absolute flex gap-2" style={{ left: `calc(50% - ${380 * k}px)`, top: 92 * k, transform: 'rotate(-14deg)' }}>
              <BoneDie value={5} size={42 * k} />
              <BoneDie value={2} size={42 * k} />
            </div>
          </WarTable>
        )}

        {/* Profile plaque, bottom left: opens Character. */}
        <button
          className={`hc-oak z-10 flex items-center gap-3 text-left ${narrow ? 'mt-8' : 'absolute'}`}
          style={narrow ? { padding: '10px 16px' } : { left: 36, bottom: 24, padding: '10px 18px' }}
          onClick={press(() => openModal('character'))}
          aria-label={`${profile.name}: edit your character`}
        >
          <IronCorners />
          <Arms color={profile.color} sigil={profile.sigil} size={46} />
          <span className="hc-oak__inset px-3 py-1.5">
            <span className="hc-label block text-[21px] leading-tight">{profile.name}</span>
            <span className="hc-gloss block hc-ink-muted">{blazon(profile.color, profile.sigil)}</span>
          </span>
        </button>

        {/* Sound and Quit, bottom right. */}
        <div className={`z-10 flex items-center gap-3 ${narrow ? 'my-6' : 'absolute'}`} style={narrow ? undefined : { right: 36, bottom: 30 }}>
          <button
            className="hc-icon-btn"
            onClick={() => updateSettings({ muted: !muted })}
            aria-pressed={muted}
            aria-label={muted ? 'Unmute' : 'Mute'}
            title={muted ? 'Unmute' : 'Mute'}
          >
            <Icon name={muted ? 'mute' : 'sound'} size={20} strokeWidth={1.9} />
          </button>
          {host && (
            <button className="hc-plaque hc-plaque--iron" onClick={press(() => void host.quit())} data-testid="quit">
              <Icon name="leave" size={17} /> Quit
            </button>
          )}
        </div>
      </main>
    </HallBackground>
  );
}
