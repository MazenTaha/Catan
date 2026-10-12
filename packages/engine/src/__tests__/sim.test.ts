import { describe, expect, it } from 'vitest';
import { decideAction } from '../ai';
import { applyAction } from '../rules/reducer';
import { createGame } from '../state/setup';
import type { BotLevel, GameEvent, GameState, SeatConfig } from '../state/types';
import { SEATS } from './helpers';

const LEVELS: BotLevel[] = ['wanderer', 'warlord', 'archdemon'];
const MAX_ACTIONS = 6000;

export function simulate(seed: string, levels: BotLevel[], target = 10, onEvents?: (e: GameEvent[]) => void) {
  const seats: SeatConfig[] = levels.map((bot, i) => ({ ...SEATS[i], kind: 'bot', bot }));
  let s: GameState = createGame({ seed, seats, targetVp: target, layout: 'balanced', firstPlayer: 'rolloff' });
  let actions = 0;
  while (s.phase.kind !== 'ended' && actions < MAX_ACTIONS) {
    const a = decideAction(s);
    const r = applyAction(s, a);
    if (!r.ok) throw new Error(`bot chose illegal ${a.type}: ${r.error.message} (seed ${seed})`);
    s = r.value.state;
    onEvents?.(r.value.events);
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
    const seen = new Set<string>();
    const note = (events: GameEvent[]) => {
      for (const e of events) {
        seen.add(e.type);
        if (e.type === 'OmenPlayed') seen.add(`play:${e.omen}`);
        if (e.type === 'OmenBought' && e.omen === 'relic') seen.add('relic');
        if (e.type === 'BankTraded') seen.add(`bank:${e.rate}`);
        if (e.type === 'ProductionShortage') seen.add(e.paid === null ? 'shortage:none' : 'shortage:one');
        if (e.type === 'LongestCausewayChanged' && e.previous !== null && e.holder !== null) seen.add('longest:transfer');
        if (e.type === 'LongestCausewayChanged' && e.previous !== null && e.holder === null) seen.add('longest:lost');
        if (e.type === 'GreatestHostChanged' && e.previous !== null) seen.add('host:transfer');
        if (e.type === 'DiscardRequired') seen.add('discard');
      }
    };
    for (let g = 0; g < 200; g++) {
      const n = g % 4 === 0 ? 3 : 4;
      const levels = Array.from({ length: n }, (_, i) => LEVELS[(g + i) % 3]);
      const { state } = simulate(`sim-${g}`, levels, 10, note);
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
    // Every rule shows up in simulated play.
    const required = [
      'play:warden', 'play:decree', 'play:harvest', 'play:tithe', 'relic',
      'bank:4', 'bank:3', 'bank:2', 'TradeCompleted', 'TradeProposed',
      'discard', 'Stolen', 'StealSkipped', 'ProductionShortage', 'CitadelBuilt',
      'longest:transfer', 'host:transfer', 'GameWon',
    ];
    const missing = required.filter((r) => !seen.has(r));
    console.log(`[sim] rule coverage: missing ${missing.length ? missing.join(', ') : 'none'}`);
    expect(missing).toEqual([]);
    expect(wins.archdemon + wins.warlord).toBeGreaterThan(wins.wanderer);
  });

  it('decisions are deterministic for a position', () => {
    const a = simulate('det-sim', ['warlord', 'archdemon', 'wanderer', 'warlord']);
    const b = simulate('det-sim', ['warlord', 'archdemon', 'wanderer', 'warlord']);
    expect(a.state).toEqual(b.state);
  });
});
