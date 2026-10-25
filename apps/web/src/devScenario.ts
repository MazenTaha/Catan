import { PERF_HOOKS } from './perfHooks';
import { useStore } from './state/store';

/**
 * Development scenario for the walk's enterable buildings: `/?scene=village` (dev and benchmark
 * builds only) loads a fixed saved game (e2e/perf/fixtures/village.json, made by
 * e2e/perf/make-fixtures.ts from a fixed seed) in which seat 0 owns a settlement next to a wheat
 * field and can afford to upgrade it. It opens the 3D walk at that cottage's door. Nothing is
 * kept: the save is replaced, as with Continue.
 */
const SCENE = PERF_HOOKS && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('scene') : null;

let building: string | null = null;

/** The scenario asks for the walk to open straight away. */
export const sceneOpensWalk = () => SCENE === 'village';

/** The board corner whose building the walk starts at, once the scenario has loaded. */
export const sceneBuilding = () => building;

export async function startScene(): Promise<void> {
  if (SCENE !== 'village') return;
  const save = (await import('../e2e/perf/fixtures/village.json')).default as unknown as { scene: { vertex: string } };
  building = save.scene.vertex;
  localStorage.setItem('hexfall.save', JSON.stringify(save));
  useStore.getState().continueGame();
}
