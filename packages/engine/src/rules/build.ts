import type { EdgeId, VertexId } from '../board/coords';
import { TERRAIN_RESOURCE, emptyCounts } from '../lexicon-keys';
import {
  isDistanceLegal,
  legalCausewaySpots,
  topo,
  touchesOwnCauseway,
} from '../state/selectors';
import type { Ctx } from './context';
import { grant, payCost, requireCurrent, requirePhase } from './context';
import { check } from './errors';
import { updateLongestCauseway } from './longest-road';
import { resumePhase } from './robber';

function checkVertex(ctx: Ctx, v: VertexId): void {
  check(typeof v === 'string' && v in topo(ctx.s).vertexEdges, 'ILLEGAL_SPOT', 'No such spot');
  check(!ctx.s.buildings[v], 'OCCUPIED', 'That spot is taken');
  check(isDistanceLegal(ctx.s, v), 'TOO_CLOSE', 'Too close to another settlement');
}

function checkEdge(ctx: Ctx, e: EdgeId): void {
  check(typeof e === 'string' && e in topo(ctx.s).edgeVertices, 'ILLEGAL_SPOT', 'No such path');
  check(ctx.s.causeways[e] === undefined, 'OCCUPIED', 'A road is already there');
}

// ------------------------------------------------------------------ setup

export function placeSetupOutpost(ctx: Ctx, player: number, v: VertexId): void {
  const { s } = ctx;
  requirePhase(ctx, 'setup');
  if (s.phase.kind !== 'setup') return;
  requireCurrent(ctx, player);
  check(s.phase.step === 'outpost', 'WRONG_PHASE', 'Place your road next');
  checkVertex(ctx, v);
  const p = s.players[player];
  s.buildings[v] = { owner: player, kind: 'outpost' };
  p.supply.outposts--;
  const round = s.phase.index < s.players.length ? 1 : 2;
  ctx.ev.push({ type: 'SetupOutpostPlaced', player, vertex: v, round });
  if (round === 2) {
    const gains = emptyCounts();
    for (const h of topo(s).vertexHexes[v]) {
      const res = TERRAIN_RESOURCE[s.board.hexes[h].terrain];
      if (res && s.bank[res] - gains[res] > 0) gains[res]++;
    }
    grant(ctx, player, gains);
    ctx.ev.push({ type: 'SetupResourcesGranted', player, gains });
  }
  s.phase = { ...s.phase, step: 'causeway', lastOutpost: v };
  updateLongestCauseway(s, ctx.ev);
}

export function placeSetupCauseway(ctx: Ctx, player: number, e: EdgeId): void {
  const { s } = ctx;
  requirePhase(ctx, 'setup');
  if (s.phase.kind !== 'setup') return;
  requireCurrent(ctx, player);
  check(s.phase.step === 'causeway', 'WRONG_PHASE', 'Place your settlement first');
  checkEdge(ctx, e);
  check(
    legalCausewaySpots(s, player).includes(e),
    'NOT_CONNECTED',
    'The causeway must touch the outpost you just placed',
  );
  s.causeways[e] = player;
  s.players[player].supply.causeways--;
  ctx.ev.push({ type: 'CausewayBuilt', player, edge: e, free: true });
  updateLongestCauseway(s, ctx.ev);

  const index = s.phase.index + 1;
  if (index >= s.setupOrder.length) {
    s.phase = { kind: 'roll' };
    s.currentPlayer = s.firstPlayer;
    s.turn = 1;
    s.round = 1;
    ctx.ev.push({ type: 'SetupComplete' });
    ctx.ev.push({ type: 'TurnStarted', player: s.currentPlayer, turn: 1, round: 1 });
  } else {
    s.phase = { kind: 'setup', index, step: 'outpost', lastOutpost: null };
    s.currentPlayer = s.setupOrder[index];
  }
}

// ------------------------------------------------------------------ main

export function buildCauseway(ctx: Ctx, player: number, e: EdgeId): void {
  const { s } = ctx;
  requireCurrent(ctx, player);
  requirePhase(ctx, 'main', 'decree');
  checkEdge(ctx, e);
  const p = s.players[player];
  check(p.supply.causeways > 0, 'NO_SUPPLY', 'No roads left in your supply');
  check(
    legalCausewaySpots(s, player).includes(e),
    'NOT_CONNECTED',
    'A causeway must connect to your own causeway, outpost or citadel',
  );
  const free = s.phase.kind === 'decree';
  if (!free) payCost(ctx, player, 'causeway');
  s.causeways[e] = player;
  p.supply.causeways--;
  ctx.ev.push({ type: 'CausewayBuilt', player, edge: e, free });
  updateLongestCauseway(s, ctx.ev);

  if (s.phase.kind === 'decree') {
    const remaining = s.phase.remaining - 1;
    if (remaining <= 0 || p.supply.causeways === 0 || legalCausewaySpots(s, player).length === 0) {
      s.phase = resumePhase(s.phase.resume);
    } else {
      s.phase = { ...s.phase, remaining };
    }
  }
}

export function buildOutpost(ctx: Ctx, player: number, v: VertexId): void {
  const { s } = ctx;
  requireCurrent(ctx, player);
  requirePhase(ctx, 'main');
  checkVertex(ctx, v);
  check(touchesOwnCauseway(s, player, v), 'NOT_CONNECTED', 'A settlement must connect to one of your roads');
  const p = s.players[player];
  check(p.supply.outposts > 0, 'NO_SUPPLY', 'No settlements left in your supply');
  payCost(ctx, player, 'outpost');
  s.buildings[v] = { owner: player, kind: 'outpost' };
  p.supply.outposts--;
  ctx.ev.push({ type: 'OutpostBuilt', player, vertex: v });
  updateLongestCauseway(s, ctx.ev);
}

export function buildCitadel(ctx: Ctx, player: number, v: VertexId): void {
  const { s } = ctx;
  requireCurrent(ctx, player);
  requirePhase(ctx, 'main');
  const b = s.buildings[v];
  check(b && b.owner === player && b.kind === 'outpost', 'ILLEGAL_SPOT', 'A city must replace one of your settlements');
  const p = s.players[player];
  check(p.supply.citadels > 0, 'NO_SUPPLY', 'No cities left in your supply');
  payCost(ctx, player, 'citadel');
  s.buildings[v] = { owner: player, kind: 'citadel' };
  p.supply.citadels--;
  p.supply.outposts++;
  ctx.ev.push({ type: 'CitadelBuilt', player, vertex: v });
}
