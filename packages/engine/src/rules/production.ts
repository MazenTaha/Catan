import { RESOURCES, TERRAIN_RESOURCE, emptyCounts, type Resource } from '../lexicon-keys';
import { topo } from '../state/selectors';
import type { Ctx } from './context';
import { grant } from './context';

/**
 * Pays out production for `roll`. Outposts yield 1, Citadels 2. A hex under the Wraith
 * yields nothing. Bank shortage: if the bank cannot cover everyone for a resource, a sole
 * owed player receives what remains; with several owed players nobody receives it.
 */
export function produce(ctx: Ctx, roll: number): void {
  const { s } = ctx;
  const t = topo(s);
  const owed = s.players.map(() => emptyCounts());
  const hexesByRes = new Map<Resource, Set<number>>();
  let blockedHex: number | null = null;

  for (const hex of s.board.hexes) {
    if (hex.token !== roll) continue;
    if (hex.id === s.wraithHex) {
      blockedHex = hex.id;
      continue;
    }
    const res = TERRAIN_RESOURCE[hex.terrain];
    if (!res) continue;
    for (const v of t.hexVertices[hex.id]) {
      const b = s.buildings[v];
      if (!b) continue;
      owed[b.owner][res] += b.kind === 'citadel' ? 2 : 1;
      if (!hexesByRes.has(res)) hexesByRes.set(res, new Set());
      hexesByRes.get(res)!.add(hex.id);
    }
  }

  const gains = s.players.map(() => emptyCounts());
  const paidHexes = new Set<number>();
  for (const res of RESOURCES) {
    const total = owed.reduce((sum, o) => sum + o[res], 0);
    if (total === 0) continue;
    const paidTo = (p: number, amount: number) => {
      if (amount <= 0) return;
      gains[p][res] += amount;
      grant(ctx, p, { [res]: amount });
    };
    if (total <= s.bank[res]) {
      owed.forEach((o, p) => paidTo(p, o[res]));
      hexesByRes.get(res)?.forEach((h) => paidHexes.add(h));
      continue;
    }
    const owedPlayers = owed.flatMap((o, p) => (o[res] > 0 ? [p] : []));
    if (owedPlayers.length === 1) {
      const amount = s.bank[res];
      paidTo(owedPlayers[0], amount);
      if (amount > 0) hexesByRes.get(res)?.forEach((h) => paidHexes.add(h));
      ctx.ev.push({ type: 'ProductionShortage', resource: res, owed: owedPlayers, paid: owedPlayers[0], amount });
    } else {
      ctx.ev.push({ type: 'ProductionShortage', resource: res, owed: owedPlayers, paid: null, amount: 0 });
    }
  }

  ctx.ev.push({
    type: 'ResourcesProduced',
    roll,
    gains,
    hexes: [...paidHexes].sort((a, b) => a - b),
    blockedHex,
  });
}
