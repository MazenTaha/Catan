/**
 * Writes the browser benchmark's saved games (`e2e/perf/fixtures/*.json`, the app's own
 * autosave format) from a fixed seed, with the engine's bots playing every seat:
 *
 *   ../server/node_modules/.bin/tsx e2e/perf/make-fixtures.ts
 *
 * - `early.json`: the first roll after setup (8 settlements, 8 roads).
 * - `late.json`: a busy late game (the leader on 11+ VP; 16 settlements and cities, 31 roads).
 *
 * - `village.json`: the walk's development scenario (`?scene=village`, src/devScenario.ts): seat 0
 *   owns a settlement next to a wheat field and can afford to upgrade it to a city.
 *
 * All stop on seat 0's own turn after rolling, so nothing moves while the benchmark runs.
 * Bots are deterministic, so the files only change if the rules or bots change.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOrThrow, createGame, decideAction, getTopology, victoryPoints, type Action, type GameConfig, type GameState } from '@hexfall/engine';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

const config: GameConfig = {
  seed: 'perf-bench',
  layout: 'balanced',
  targetVp: 14,
  firstPlayer: 0,
  seats: [
    { name: 'Ashwyn', color: 'crimson', sigil: 'skull', kind: 'human' },
    { name: 'Morrow', color: 'frost', sigil: 'moon', kind: 'bot', bot: 'warlord' },
    { name: 'Isolde', color: 'bone', sigil: 'eye', kind: 'bot', bot: 'warlord' },
    { name: 'Vex', color: 'violet', sigil: 'thorn', kind: 'bot', bot: 'warlord' },
  ],
};

/** Seat 0 to act, after its roll, with nothing pending. */
const settled = (s: GameState) => s.phase.kind === 'main' && s.currentPlayer === 0 && !s.handoff;

function play(stop: (s: GameState) => boolean): { state: GameState; actions: Action[] } {
  let state = createGame(config);
  const actions: Action[] = [];
  for (let i = 0; i < 20_000; i++) {
    if (settled(state) && stop(state)) return { state, actions };
    // Seat 0 is played by the same bot so the game advances; it stays a human seat in the save.
    const a = decideAction(state, 'warlord');
    state = applyOrThrow(state, a).state;
    actions.push(a);
    if (state.phase.kind === 'ended') throw new Error('game ended before the stop condition');
  }
  throw new Error('no stop');
}

const maxVp = (s: GameState) => Math.max(...s.players.map((_, p) => victoryPoints(s, p)));
const topo = getTopology();
/** Seat 0's settlement touching a wheat field, if any. */
const fieldSettlement = (s: GameState) =>
  Object.entries(s.buildings).find(
    ([v, b]) => b.owner === 0 && b.kind === 'outpost' && topo.vertexHexes[v].some((h) => s.board.hexes[h].terrain === 'fields'),
  )?.[0];
const canCity = (s: GameState) => s.players[0].hand.grain >= 2 && s.players[0].hand.ore >= 3;

fs.mkdirSync(OUT, { recursive: true });
for (const [name, stop] of [
  ['early', () => true],
  ['late', (s: GameState) => maxVp(s) >= 11 && Object.keys(s.causeways).length >= 30],
  ['village', (s: GameState) => !!fieldSettlement(s) && canCity(s)],
] as const) {
  const { state, actions } = play(stop);
  const save: Record<string, unknown> = { schema: 1, savedAt: 0, config, actions, state };
  if (name === 'village') save.scene = { vertex: fieldSettlement(state) };
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(save));
  const b = Object.values(state.buildings);
  console.log(
    `${name}: ${actions.length} actions, turn ${state.turn}, VP ${state.players.map((_, p) => victoryPoints(state, p)).join('/')}, ` +
      `${b.filter((x) => x.kind === 'outpost').length} settlements, ${b.filter((x) => x.kind === 'citadel').length} cities, ` +
      `${Object.keys(state.causeways).length} roads`,
  );
}
