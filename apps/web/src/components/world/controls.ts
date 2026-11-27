import type { Weapon } from '@hexfall/engine';

/** One ordering for the keyboard and the live loadout. Engine weapon keys stay unchanged. */
export const WEAPON_SLOTS = [
  { weapon: 'fist', key: '1' },
  { weapon: 'sword', key: '2' },
] as const satisfies readonly { weapon: Weapon; key: string }[];

export function weaponForKey(code: string): Weapon | undefined {
  return WEAPON_SLOTS.find((s) => code === `Digit${s.key}` || code === `Numpad${s.key}`)?.weapon;
}

export const CROUCH_KEYS = ['ControlLeft', 'ControlRight', 'KeyC'] as const;
export const MOVE_KEYS = new Set<string>([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
  ...CROUCH_KEYS,
]);
