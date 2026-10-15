import { create } from 'zustand';
import type { ResourceCounts } from '@hexfall/engine';

/**
 * Short-lived UI hints shared between sibling panels, kept out of the game store so they
 * never trigger autosaves or game re-renders. Hovering a build option publishes its cost
 * here so the hand can light up the cards it needs.
 */
interface UiHints {
  cost: Partial<ResourceCounts> | null;
  setCost(cost: Partial<ResourceCounts> | null): void;
}

export const useUiHints = create<UiHints>((set) => ({
  cost: null,
  setCost: (cost) => set({ cost }),
}));
