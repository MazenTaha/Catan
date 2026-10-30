import { Suspense, lazy, useState } from 'react';
import {
  DECOR_ITEMS,
  DECOR_TINTS,
  LOOK_OPTIONS,
  type CharacterLook,
  type DecorItem,
  type KingdomDecor,
} from '@hexfall/net';
import { COLOR_HEX } from '../../lexicon';
import { prefersReducedMotion, useStore } from '../../state/store';
import { updateProfile, useProfile } from '../../state/profile';
import { Modal } from '../ui/primitives';
import {
  BEARD_NAMES,
  CAPE_NAMES,
  DECOR_NAMES,
  DECOR_TINT,
  DECOR_TINT_NAMES,
  HAIR_COLOR,
  HAIR_NAMES,
  HAT_NAMES,
  OUTFIT,
  SKIN,
} from '../world/looks';

// three.js comes with the 3D walk's chunk; these screens load it only when opened.
const Preview = lazy(() => import('../world/Preview'));

const loading = <div className="grid h-full place-items-center font-display text-gold">Preparing the preview…</div>;

function Swatches({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: number;
  onChange(i: number): void;
}) {
  return (
    <div>
      <div className="mb-1 font-display text-[12px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {colors.map((c, i) => (
          <button
            key={c}
            role="radio"
            aria-checked={value === i}
            aria-label={`${label} ${i + 1}`}
            className={`h-7 w-7 rounded-full border-2 transition-transform ${value === i ? 'scale-110 border-[#fff6e4]' : 'border-iron hover:scale-105'}`}
            style={{ background: c }}
            onClick={() => onChange(i)}
          />
        ))}
      </div>
    </div>
  );
}

function Choices({
  label,
  names,
  value,
  onChange,
}: {
  label: string;
  names: string[];
  value: number;
  onChange(i: number): void;
}) {
  return (
    <div>
      <div className="mb-1 font-display text-[12px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {names.map((n, i) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === i}
            className={`btn !px-2.5 !py-1 text-[12px] ${value === i ? 'btn-primary' : ''}`}
            onClick={() => onChange(i)}
          >
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
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="h-[340px] overflow-hidden rounded-xl border border-iron bg-gradient-to-b from-[#2a2f33] to-[#121416]" data-testid="character-preview">
          <Suspense fallback={loading}>
            <Preview kind="character" look={look} color={seatColor} reduce={reduce} />
          </Suspense>
        </div>
        <div className="flex flex-col gap-3">
          <Swatches label="Skin" colors={SKIN} value={look.skin} onChange={(skin) => set({ skin })} />
          <Choices label="Hair" names={HAIR_NAMES} value={look.hair} onChange={(hair) => set({ hair })} />
          <Swatches label="Hair colour" colors={HAIR_COLOR} value={look.hairColor} onChange={(hairColor) => set({ hairColor })} />
          <Choices label="Beard" names={BEARD_NAMES} value={look.beard} onChange={(beard) => set({ beard })} />
          <Swatches label="Tunic" colors={OUTFIT} value={look.outfit} onChange={(outfit) => set({ outfit })} />
          <Choices label="Headwear" names={HAT_NAMES} value={look.hat} onChange={(hat) => set({ hat })} />
          <Choices label="Cape" names={CAPE_NAMES} value={look.cape} onChange={(cape) => set({ cape })} />
          <p className="text-[13px] text-muted">Your sash, shoulders, shield and cape always wear your seat’s colour, so friends can tell you apart.</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={randomize}>
          Surprise me
        </button>
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          data-testid="save-character"
          onClick={() => {
            updateProfile({ look });
            close();
          }}
        >
          Save character
        </button>
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
      <p className="mb-3 text-[15px] text-muted">
        Furnish your homes. Every settlement and city you build on the board shows them inside in the 3D walk, and friends see
        them online.
      </p>
      <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Building">
        {(['cottage', 'hall'] as const).map((r) => (
          <button key={r} role="tab" aria-selected={room === r} className={`btn !py-1.5 text-[12px] ${room === r ? 'btn-primary' : ''}`} onClick={() => setRoom(r)}>
            {r === 'cottage' ? 'Settlement' : 'City'}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="h-[340px] overflow-hidden rounded-xl border border-iron bg-[#121416]" data-testid="kingdom-preview">
          <Suspense fallback={loading}>
            <Preview kind={room} look={profile.look} color={COLOR_HEX[profile.color]} decor={decor} reduce={reduce} />
          </Suspense>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Furnishings">
            {DECOR_ITEMS.map((item) => {
              const on = decor[room].includes(item);
              return (
                <button
                  key={item}
                  aria-pressed={on}
                  className={`btn justify-start !py-1.5 text-[12px] ${on ? 'btn-primary' : ''}`}
                  onClick={() => toggle(item)}
                >
                  {DECOR_NAMES[item]}
                </button>
              );
            })}
          </div>
          <Swatches
            label={`Banner and rug colour · ${DECOR_TINT_NAMES[decor.tint]}`}
            colors={DECOR_TINT.slice(0, DECOR_TINTS)}
            value={decor.tint}
            onChange={(tint) => setDecor((d) => ({ ...d, tint }))}
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={close}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          data-testid="save-kingdom"
          onClick={() => {
            updateProfile({ decor });
            close();
          }}
        >
          Save kingdom
        </button>
      </div>
    </Modal>
  );
}
