import { create } from 'zustand';
import { loadProfile, saveProfile, type PlayerProfile } from './persistence';

/** The player's profile (name, colours, character, kingdom), saved on every change. */
export const useProfile = create<PlayerProfile>(() => loadProfile());

export function updateProfile(patch: Partial<PlayerProfile>): void {
  const next = { ...useProfile.getState(), ...patch };
  saveProfile(next);
  useProfile.setState(next, true);
}
