import type { Weapon } from '@hexfall/engine';
import { COMBAT_TEXT } from '../../lexicon';
import { WEAPON_SLOTS } from './controls';
import { OakPanel } from '../../ui/hall/Surfaces';
import './weaponHUD.css';

/** Original silhouettes matching this game's equipment, on a tactical lower-right loadout. */
function WeaponSilhouette({ weapon }: { weapon: Weapon }) {
  return (
    <svg
      viewBox="0 0 120 40"
      aria-hidden="true"
      focusable="false"
      className="world-loadout__silhouette"
    >
      {weapon === 'sword' ? (
        <>
          <path d="M7 20 22 15H88L96 20 88 25H22Z" fill="currentColor" />
          <path
            d="M88 7 93 7 96 17 111 17 114 14 119 17 119 23 114 26 111 23 96 23 93 33 88 33 91 20Z"
            fill="currentColor"
          />
          <path d="M20 20H85" stroke="var(--loadout-dark)" strokeWidth="1.5" />
        </>
      ) : weapon === 'revolver' ? (
        <>
          <path
            d="M9 11H65L68 7H79L82 11 92 14 97 21 92 25 102 35 94 39 79 26 66 25 62 22H43V18H9Z"
            fill="currentColor"
          />
          <path d="M13 7H18V11H13ZM69 9H77V6L73 4 69 6Z" fill="currentColor" />
          <path
            d="M66 24Q66 35 78 30L79 25M48 13V20M58 13V20"
            fill="none"
            stroke="var(--loadout-dark)"
            strokeWidth="2"
          />
        </>
      ) : (
        <>
          <path
            d="M43 34 36 22 36 15Q36 10 41 10L45 11V8Q45 3 50 4L55 6Q57 1 62 4L67 7Q71 3 75 7L80 13Q84 9 88 13L93 21 91 29 83 37 59 38 54 32 49 31Z"
            fill="currentColor"
          />
          <path
            d="M44 13 49 22M55 9 59 19M67 11 70 19M78 16 81 22M43 27 55 24 64 28 66 33"
            fill="none"
            stroke="var(--loadout-dark)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

interface Props {
  weapon: Weapon;
  armed: boolean;
  ammo: number;
  onSelect(weapon: Weapon): void;
  onPractice(): void;
}

export function WeaponHUD({ weapon, armed, ammo, onSelect, onPractice }: Props) {
  return (
    <div className="world-loadout" data-testid="weapon-loadout">
      <OakPanel as="div" plain className="world-loadout__frame">
        <div role="group" aria-label={COMBAT_TEXT.weapon} className="world-loadout__slots">
          {WEAPON_SLOTS.map(({ weapon: kind, key }) => {
            const locked = kind !== 'fist' && !armed;
            const selected = kind === weapon;
            return (
              <button
                key={kind}
                type="button"
                className="hc-paper-btn hc-paper-btn--sm world-loadout__slot"
                aria-label={`${COMBAT_TEXT[kind]}${kind === 'revolver' && armed ? ` ${ammo}` : ''} · ${key}`}
                aria-pressed={selected}
                aria-keyshortcuts={key}
                disabled={locked}
                title={locked ? COMBAT_TEXT.locked : `${COMBAT_TEXT[kind]} · ${key}`}
                onClick={() => onSelect(kind)}
              >
                <span className="world-loadout__equipment">
                  <WeaponSilhouette weapon={kind} />
                  <span className="world-loadout__name">{COMBAT_TEXT[kind]}</span>
                </span>
                <kbd className="world-loadout__key">{key}</kbd>
              </button>
            );
          })}
        </div>
        {weapon === 'revolver' && armed && (
          <div className="hc-parchment world-loadout__ammo" aria-live="polite" aria-atomic="true">
            <span className="world-loadout__rounds">{ammo}</span>
            <span>
              <span className="world-loadout__ammo-label">
                {ammo ? COMBAT_TEXT.rounds : COMBAT_TEXT.empty}
              </span>
              <span className="world-loadout__cartridges" aria-hidden="true">
                {Array.from({ length: 5 }, (_, i) => (
                  <i key={i} data-live={i < ammo} />
                ))}
              </span>
            </span>
          </div>
        )}
        <button
          type="button"
          className="hc-plaque hc-plaque--iron hc-plaque--sm world-loadout__practice"
          onClick={onPractice}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="6" />
            <circle cx="10" cy="10" r="2" />
            <path d="M10 1V5M10 15V19M1 10H5M15 10H19" />
          </svg>
          {COMBAT_TEXT.practice}
        </button>
      </OakPanel>
    </div>
  );
}
