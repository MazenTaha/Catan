import { describe, expect, it } from 'vitest';
import { decideAction } from '../ai';
import { applyAction } from '../rules/reducer';
import { createGame } from '../state/setup';
import type { BotLevel, GameState, SeatConfig } from '../state/types';
import { SEATS } from './helpers';

const LEVELS: BotLevel[] = ['wanderer', 'warlord', 'archdemon'];
const MAX_ACTIONS = 6000;

export function simulate(seed: string, levels: BotLevel[], target = 10) {
  const seats: SeatConfig[] = levels.map((bot, i) => ({ ...SEATS[i], kind: 'bot', bot }));
  let s: GameState = createGame({ seed, seats, targetVp: target, layout: 'balanced', firstPlayer: 'rolloff' });
  let actions = 0;
  while (s.phase.kind !== 'ended' && actions < MAX_ACTIONS) {
    const a = decideAction(s);
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(`bot chose illegal ${a.type}: ${r.error.message} (seed ${seed})`);
    s = r.value.state;
    actions++;
  }
  return { state: s, actions };
}

describe('bot-vs-bot simulation', () => {
  it('200 seeded games finish without errors or infinite loops', () => {
    const wins: Record<BotLevel, number> = { wanderer: 0, warlord: 0, archdemon: 0 };
    const seats: Record<BotLevel, number> = { wanderer: 0, warlord: 0, archdemon: 0 };
    let rounds = 0;
    let unfinished = 0;
    for (let g = 0; g < 200; g++) {
      const n = g % 4 === 0 ? 3 : 4;
      const levels = Array.from({ length: n }, (_, i) => LEVELS[(g + i) % 3]);
      const { state } = simulate(`sim-${g}`, levels);
      if (state.phase.kind !== 'ended') {
        unfinished++;
        continue;
      }
      levels.forEach((l) => seats[l]++);
      wins[levels[state.winner!]]++;
      rounds += state.round;
    }
    const finished = 200 - unfinished;
    const rate = (l: BotLevel) => `${((wins[l] / Math.max(1, seats[l])) * 100).toFixed(1)}% per seat`;
    console.log(
      `[sim] finished ${finished}/200, avg rounds ${(rounds / finished).toFixed(1)}; win rates — ` +
        `wanderer ${wins.wanderer} (${rate('wanderer')}), warlord ${wins.warlord} (${rate('warlord')}), ` +
        `archdemon ${wins.archdemon} (${rate('archdemon')})`,
    );
    expect(unfinished).toBe(0);
    expect(wins.archdemon + wins.warlord).toBeGreaterThan(wins.wanderer);
  });

  it('decisions are deterministic for a position', () => {
    const a = simulate('det-sim', ['warlord', 'archdemon', 'wanderer', 'warlord']);
    const b = simulate('det-sim', ['warlord', 'archdemon', 'wanderer', 'warlord']);
    expect(a.state).toEqual(b.state);
  });
});
