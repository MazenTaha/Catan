import { expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  decideAction,
  makeRecord,
  parseRecord,
  replay,
  type Action,
} from '../index';
import { applyRecordedAction } from '../rules/reducer';
import { newGame } from './helpers';

it('loads a historical firearm record exactly, then permits only melee for new actions', () => {
  const config = newGame({ arms: true, pvp: true, privacy: false }).config;
  let state = createGame(config);
  const actions: Action[] = [];
  const archive = (action: Action) => {
    const result = applyRecordedAction(state, action);
    if (!result.ok) throw new Error(result.error.message);
    state = result.value.state;
    actions.push(action);
  };
  for (let i = 0; state.phase.kind === 'setup' && i < 100; i++) archive(decideAction(state));
  expect(state.phase.kind).not.toBe('setup');
  archive({ type: 'OpenChest', player: 0 });
  archive({ type: 'Fire', player: 0 });
  archive({ type: 'Strike', player: 0, victim: 1, weapon: 'revolver' });
  const restored = replay(parseRecord(JSON.stringify(makeRecord(config, actions)))).state;
  expect(restored).toEqual(state);
  expect(restored.arms!.health[1]).toBe(50);
  expect(restored.arms!.bullets[0]).toBe(4);
  expect(applyAction(restored, { type: 'Fire', player: 0 }).ok).toBe(false);
  expect(
    applyAction(restored, { type: 'Strike', player: 0, victim: 1, weapon: 'revolver' }).ok,
  ).toBe(false);
  const melee = applyAction(restored, { type: 'Strike', player: 0, victim: 1, weapon: 'sword' });
  expect(melee.ok && melee.value.state.arms!.health[1]).toBe(25);
});
