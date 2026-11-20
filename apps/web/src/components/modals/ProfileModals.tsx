import { Suspense, lazy, useState } from 'react';
import { DECOR_ITEMS, DECOR_TINTS, LOOK_OPTIONS, type CharacterLook, type DecorItem, type KingdomDecor } from '@hexfall/net';
import { COLOR_HEX } from '../../lexicon';
import { prefersReducedMotion, useStore } from '../../state/store';
import { updateProfile, useProfile } from '../../state/profile';
import { Modal } from '../ui/primitives';
import { BEARD_NAMES, CAPE_NAMES, DECOR_NAMES, DECOR_TINT, DECOR_TINT_NAMES, HAIR_COLOR, HAIR_NAMES, HAT_NAMES, OUTFIT, SKIN } from '../world/looks';
import { blazon } from '../../ui/hall/Arms';
import { Banner, BannerPole } from '../../ui/hall/Banner';
import { SealButton } from '../../ui/hall/Controls';
import { HallLoader } from '../../ui/hall/Surfaces';

// three.js comes with the 3D walk's chunk; these screens load it only when opened.
const Preview = lazy(() => import('../world/Preview'));

const loading = <HallLoader>Preparing the preview…</HallLoader>;

/** The 3D preview's frame: an oak window onto the hall. */
const FRAME = 'overflow-hidden border-[3px] border-[color:var(--oak-deep)] shadow-[inset_0_0_0_3px_var(--oak-edge),0_8px_16px_rgba(0,0,0,0.45)]';

function Swatches({ label, colors, value, onChange }: { label: string; colors: string[]; value: number; onChange(i: number): void }) {
  return (
    <div>
      <div className="hc-label mb-1 text-[16px] hc-ink-muted">{label}</div>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
        {colors.map((c, i) => (
          <button key={c} role="radio" aria-checked={value === i} aria-label={`${label} ${i + 1}`} className="grid h-11 w-11 place-items-center" onClick={() => onChange(i)}>
            <span
              className="block h-8 w-8 rounded-full"
              style={{ background: c, border: '1.5px solid var(--ink)', boxShadow: value === i ? '0 0 0 3px var(--paper-card), 0 0 0 5px var(--rubric)' : 'inset 0 -3px 0 rgba(0,0,0,0.25)' }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function Choices({ label, names, value, onChange }: { label: string; names: string[]; value: number; onChange(i: number): void }) {
  return (
    <div>
      <div className="hc-label mb-1 text-[16px] hc-ink-muted">{label}</div>
      <div className="hc-seg hc-seg--sm" role="radiogroup" aria-label={label}>
        {names.map((n, i) => (
          <button key={n} type="button" role="radio" aria-checked={value === i} onClick={() => onChange(i)}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Character: design how you look in the 3D walk. Others see it online. */
export function CharacterModal() {
  const close = useStore((s) => s.closeModal);
  const reduce = useStore((s) => prefersReducedMotion(s.settings));
  const profile = useProfile();
  const seatColor = useStore((s) => {
    const st = s.session?.state;
    const seat = s.session?.online?.seats[0];
    return st && seat !== undefined ? COLOR_HEX[st.players[seat].color] : COLOR_HEX[profile.color];
  });
  const [look, setLook] = useState<CharacterLook>(profile.look);
  const set = (patch: Partial<CharacterLook>) => setLook((l) => ({ ...l, ...patch }));
  const randomize = () => {
    const next = { ...look };
    for (const k of Object.keys(LOOK_OPTIONS) as (keyof CharacterLook)[]) next[k] = Math.floor(Math.random() * LOOK_OPTIONS[k]);
    setLook(next);
  };
  return (
    <Modal title="Character" icon="user" wide onClose={close}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-4">
          <div className={`h-[300px] bg-gradient-to-b from-[#2a2f33] to-[#121416] ${FRAME}`} data-testid="character-preview">
            <Suspense fallback={loading}>
              <Preview kind="character" look={look} color={seatColor} reduce={reduce} />
            </Suspense>
          </div>
          {/* the player's arms, as they will hang in the hall */}
          <div className="flex items-center gap-4 rounded-sm bg-[color:var(--stone-1)] px-4 pb-1 pt-3" aria-hidden>
            <BannerPole gap={0} overhang={22} brackets={false}>
              <Banner width={92} height={140} tincture={{ player: profile.color }} arms={{ color: profile.color, sigil: profile.sigil }} label={profile.name} labelSize={14} />
            </BannerPole>
            <span className="text-[color:var(--on-dark)]">
              <span className="hc-label block text-[20px]">{profile.name}</span>
              <span className="hc-gloss block text-[color:var(--on-dark-muted)]">{blazon(profile.color, profile.sigil)}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Swatches label="Skin" colors={SKIN} value={look.skin} onChange={(skin) => set({ skin })} />
          <Choices label="Hair" names={HAIR_NAMES} value={look.hair} onChange={(hair) => set({ hair })} />
          <Swatches label="Hair colour" colors={HAIR_COLOR} value={look.hairColor} onChange={(hairColor) => set({ hairColor })} />
          <Choices label="Beard" names={BEARD_NAMES} value={look.beard} onChange={(beard) => set({ beard })} />
          <Swatches label="Tunic" colors={OUTFIT} value={look.outfit} onChange={(outfit) => set({ outfit })} />
          <Choices label="Helm" names={HAT_NAMES} value={look.hat} onChange={(hat) => set({ hat })} />
          <Choices label="Cape" names={CAPE_NAMES} value={look.cape} onChange={(cape) => set({ cape })} />
          <p className="text-[15px] italic hc-ink-muted">
            Your plume, cape and shield always wear your seat’s colour, so friends can tell you apart. The tunic shows below the armour; skin, hair and beard show under an open helm.
          </p>
        </div>
      </div>
      <hr className="hc-dots my-4" />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button className="hc-paper-btn" onClick={randomize}>
          Surprise me
        </button>
        <button className="hc-paper-btn" onClick={close}>
          Cancel
        </button>
        <SealButton
          testId="save-character"
          onClick={() => {
            updateProfile({ look });
            close();
          }}
        >
          Save character
        </SealButton>
      </div>
    </Modal>
  );
}

/** My kingdom: furnish your settlements and cities; you'll find it all inside them in 3D. */
export function KingdomModal() {
  const close = useStore((s) => s.closeModal);
  const reduce = useStore((s) => prefersReducedMotion(s.settings));
  const profile = useProfile();
  const [decor, setDecor] = useState<KingdomDecor>(profile.decor);
  const [room, setRoom] = useState<'cottage' | 'hall'>('cottage');
  const toggle = (item: DecorItem) =>
    setDecor((d) => {
      const has = d[room].includes(item);
      return { ...d, [room]: has ? d[room].filter((x) => x !== item) : DECOR_ITEMS.filter((x) => x === item || d[room].includes(x)) };
    });
  return (
    <Modal title="My kingdom" icon="citadel" wide onClose={close}>
      <p className="mb-3 text-[17px] italic">Furnish your homes. Every settlement and city you build on the board shows them inside in the 3D walk, and friends see them online.</p>
      <div className="hc-tabs mb-3" role="tablist" aria-label="Building">
        {(['cottage', 'hall'] as const).map((r) => (
          <button key={r} role="tab" aria-selected={room === r} onClick={() => setRoom(r)}>
            {r === 'cottage' ? 'Settlement' : 'City'}
          </button>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className={`h-[320px] bg-[#121416] ${FRAME}`} data-testid="kingdom-preview">
          <Suspense fallback={loading}>
            <Preview kind={room} look={profile.look} color={COLOR_HEX[profile.color]} decor={decor} reduce={reduce} />
          </Suspense>
        </div>
        <div className="flex flex-col gap-3">
          <div className="hc-label text-[16px] hc-ink-muted">Holdings & deeds</div>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Furnishings">
            {DECOR_ITEMS.map((item) => {
              const on = decor[room].includes(item);
              return (
                <button key={item} aria-pressed={on} className="hc-paper-btn hc-paper-btn--sm justify-start !text-[15px]" onClick={() => toggle(item)}>
                  <span aria-hidden className={on ? 'hc-rubric' : ''}>
                    {on ? '☑' : '☐'}
                  </span>{' '}
                  {DECOR_NAMES[item]}
                </button>
              );
            })}
          </div>
          <Swatches label={`Banner and rug colour · ${DECOR_TINT_NAMES[decor.tint]}`} colors={DECOR_TINT.slice(0, DECOR_TINTS)} value={decor.tint} onChange={(tint) => setDecor((d) => ({ ...d, tint }))} />
        </div>
      </div>
      <hr className="hc-dots my-4" />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button className="hc-paper-btn" onClick={close}>
          Cancel
        </button>
        <SealButton
          testId="save-kingdom"
          onClick={() => {
            updateProfile({ decor });
            close();
          }}
        >
          Save kingdom
        </SealButton>
      </div>
    </Modal>
  );
}
