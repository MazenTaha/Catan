import type { VertexId } from '../board/coords';
import { applyAction } from '../rules/reducer';
import type { Rng } from '../rng';
import { activeActor, legalCausewaySpots, legalOutpostSpots } from '../state/selectors';
import type { Action, GameState } from '../state/types';
import { scarcity, vertexValue } from './evaluate';
import { warlordAction, type Persona } from './warlord';

/**
 * Founding with lookahead: for each strong candidate, simulate the other seats greedily
 * taking their best spots until our next founding pick, then add the value of the best
 * spot still open to us. Expected yield is pips/36 per roll, so pip-weighted scores are
 * proportional to income over any horizon of N turns.
 */
export function lookaheadSetup(s: GameState, p: number): VertexId {
  const sc = scarcity(s);
  const spots = legalOutpostSpots(s, p);
  const ranked = spots
    .map((v) => ({ v, score: vertexValue(s, v, p, sc) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  if (s.phase.kind !== 'setup' || s.phase.index >= s.players.length) return ranked[0].v;

  const myNext = s.setupOrder.indexOf(p, s.phase.index + 1);
  let best = ranked[0];
  let bestTotal = -Infinity;
  for (const cand of ranked) {
    let sim = step(s, { type: 'PlaceSetupOutpost', player: p, vertex: cand.v });
    sim = step(sim, { type: 'PlaceSetupCauseway', player: p, edge: legalCausewaySpots(sim, p)[0] });
    while (sim.phase.kind === 'setup' && sim.phase.index < myNext) {
      const q = activeActor(sim);
      if (sim.handoff !== null) {
        sim = step(sim, { type: 'AckPassDevice', player: sim.handoff });
        continue;
      }
      if (sim.phase.step === 'outpost') {
        const options = legalOutpostSpots(sim, q);
        let pick = options[0];
        let pickScore = -Infinity;
        for (const v of options) {
          const sc2 = vertexValue(sim, v, q, sc);
          if (sc2 > pickScore) {
            pickScore = sc2;
            pick = v;
          }
        }
        sim = step(sim, { type: 'PlaceSetupOutpost', player: q, vertex: pick });
      } else {
        sim = step(sim, { type: 'PlaceSetupCauseway', player: q, edge: legalCausewaySpots(sim, q)[0] });
      }
    }
    let second = 0;
    for (const v of legalOutpostSpots(sim, p)) second = Math.max(second, vertexValue(sim, v, p, sc));
    const total = cand.score + 0.85 * second;
    if (total > bestTotal) {
      bestTotal = total;
      best = cand;
    }
  }
  return best.v;
}

function step(s: GameState, a: Action): GameState {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(`lookahead: ${r.error.message}`);
  return r.value.state;
}

export const ARCHDEMON: Persona = {
  pickSetup: lookaheadSetup,
  cunning: true,
  acceptMargin: 1.15,
  offersPerTurn: 2,
};

export function archdemonAction(s: GameState, rng: Rng): Action {
  return warlordAction(s, rng, ARCHDEMON);
}
