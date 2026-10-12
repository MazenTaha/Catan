import { getTopology } from '../board/topology';
import { hasAtLeast } from '../lexicon-keys';
import { legalActions } from '../rules/legal';
import type { Rng } from '../rng';
import { activeActor } from '../state/selectors';
import type { Action, GameState } from '../state/types';

const BUILD_TYPES = new Set(['BuildCauseway', 'BuildOutpost', 'BuildCitadel', 'BuyOmen']);

/** Easy bot: random legal moves with a light bias toward building when affordable. */
export function wandererAction(s: GameState, rng: Rng): Action {
  const options = legalActions(s, rng);
  if (!options.length) throw new Error('No legal actions');
  const p = activeActor(s);
  const ph = s.phase;
  if (ph.kind === 'trade') {
    const offer = ph.offer;
    const can = hasAtLeast(s.players[p].hand, offer.want) && hasAtLeast(s.players[offer.proposer].hand, offer.give);
    return { type: 'RespondTrade', player: p, response: can && rng.next() < 0.35 ? 'accept' : 'decline' };
  }
  if (ph.kind === 'roll') {
    const warden = options.find((a) => a.type === 'PlayWarden');
    return warden && rng.next() < 0.2 ? warden : { type: 'RollDice', player: p };
  }
  if (ph.kind === 'move-wraith') {
    const topo = getTopology();
    const safe = options.filter(
      (a) => a.type === 'MoveWraith' && !topo.hexVertices[a.hex].some((v) => s.buildings[v]?.owner === p),
    );
    return rng.pick(safe.length ? safe : options);
  }
  if (ph.kind === 'main') {
    const builds = options.filter((a) => BUILD_TYPES.has(a.type));
    if (builds.length && rng.next() < 0.85) {
      const strong = builds.filter((a) => a.type === 'BuildCitadel' || a.type === 'BuildOutpost');
      return rng.pick(strong.length ? strong : builds);
    }
    const plays = options.filter((a) => a.type.startsWith('Play'));
    if (plays.length && rng.next() < 0.3) return rng.pick(plays);
    const trades = options.filter((a) => a.type === 'BankTrade');
    if (trades.length && rng.next() < 0.2) return rng.pick(trades);
    return { type: 'EndTurn', player: p };
  }
  return rng.pick(options);
}
