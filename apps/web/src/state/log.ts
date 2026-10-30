import type { GameEvent, PlayerState, Resource, ResourceCounts } from '@hexfall/engine';
import { RESOURCES } from '@hexfall/engine';
import {
  HOST,
  LONGEST,
  OMEN_NAME,
  PIECE_NAME,
  RESOURCE_NAME,
  WRAITH,
  WRAITH_TITLE,
} from '../lexicon';
import type { IconName } from '../art/icons/Icon';

export interface LogItem {
  seq: number;
  turn: number;
  round: number;
  event: GameEvent;
}

export type LogPart =
  | string
  | { player: number }
  | { res: Resource; n?: number }
  | { counts: Partial<ResourceCounts> };

export interface LogLine {
  icon: IconName;
  parts: LogPart[];
  /** Players this line concerns (for filtering). */
  players: number[];
  tone?: 'good' | 'bad' | 'gold' | 'muted';
}

export interface DescribeCtx {
  players: PlayerState[];
  /** Seat whose private information may be shown (null = spectator). */
  viewer: number | null;
  terrainName: (hex: number) => string;
}

const P = (player: number) => ({ player });

function countsParts(c: Partial<ResourceCounts>): LogPart[] {
  const has = RESOURCES.filter((r) => (c[r] ?? 0) > 0);
  if (!has.length) return ['nothing'];
  return [{ counts: c }];
}

/** Turns an engine event into a human-readable log line (null = not logged). */
export function describeEvent(e: GameEvent, ctx: DescribeCtx): LogLine | null {
  const see = (...ps: number[]) => ctx.viewer !== null && ps.includes(ctx.viewer);
  switch (e.type) {
    case 'GameStarted':
      return { icon: 'crown', parts: [P(e.firstPlayer), ' goes first'], players: [e.firstPlayer] };
    case 'SetupOutpostPlaced':
      return {
        icon: 'outpost',
        parts: [P(e.player), ` placed ${e.round === 1 ? 'a first' : 'a second'} ${PIECE_NAME.outpost}`],
        players: [e.player],
      };
    case 'SetupResourcesGranted':
      return { icon: 'gain', parts: [P(e.player), ' gathered ', ...countsParts(e.gains)], players: [e.player], tone: 'good' };
    case 'SetupComplete':
      return { icon: 'scroll', parts: ['Setup is done. Let the dice roll.'], players: [], tone: 'gold' };
    case 'CausewayBuilt':
      return {
        icon: 'causeway',
        parts: [P(e.player), ` built a ${PIECE_NAME.causeway}${e.free ? ' (free)' : ''}`],
        players: [e.player],
      };
    case 'OutpostBuilt':
      return { icon: 'outpost', parts: [P(e.player), ` built a ${PIECE_NAME.outpost}`], players: [e.player] };
    case 'CitadelBuilt':
      return { icon: 'citadel', parts: [P(e.player), ` built a ${PIECE_NAME.citadel}`], players: [e.player], tone: 'gold' };
    case 'DiceRolled':
      return {
        icon: 'dice',
        parts: [P(e.player), ` rolled ${e.total} (${e.dice[0]}+${e.dice[1]})`],
        players: [e.player],
        tone: e.total === 7 ? 'bad' : undefined,
      };
    case 'ResourcesProduced': {
      const parts: LogPart[] = [];
      const who: number[] = [];
      e.gains.forEach((g, p) => {
        if (RESOURCES.some((r) => g[r] > 0)) {
          if (parts.length) parts.push(' · ');
          parts.push(P(p), ' ', { counts: g });
          who.push(p);
        }
      });
      if (!parts.length) {
        return {
          icon: 'gain',
          parts: [e.blockedHex !== null ? `${WRAITH_TITLE} blocks the harvest` : 'Nobody collects anything'],
          players: [],
          tone: 'muted',
        };
      }
      return { icon: 'gain', parts, players: who, tone: 'good' };
    }
    case 'ProductionShortage':
      return {
        icon: 'bank',
        parts:
          e.paid === null
            ? [`The bank runs dry of ${RESOURCE_NAME[e.resource]} — nobody receives it`]
            : [`The bank runs low on ${RESOURCE_NAME[e.resource]} — `, P(e.paid), ` takes the last ${e.amount}`],
        players: e.owed,
        tone: 'bad',
      };
    case 'DiscardRequired':
      return { icon: 'hourglass', parts: ['A 7! Players with more than 7 cards discard half'], players: [], tone: 'bad' };
    case 'Discarded':
      return {
        icon: 'discard',
        parts: [P(e.player), ' discarded ', ...(see(e.player) ? countsParts(e.cards) : [`${sum(e.cards)} cards`])],
        players: [e.player],
        tone: 'bad',
      };
    case 'WraithMoved':
      return {
        icon: 'wraith',
        parts: [P(e.player), ` moved ${WRAITH} to ${ctx.terrainName(e.to)}`],
        players: [e.player],
      };
    case 'Stolen':
      return {
        icon: 'steal',
        parts: [
          P(e.thief),
          ' stole ',
          ...(see(e.thief, e.victim) ? [{ res: e.resource, n: 1 } as LogPart] : ['a card']),
          ' from ',
          P(e.victim),
        ],
        players: [e.thief, e.victim],
        tone: 'bad',
      };
    case 'StealSkipped':
      return { icon: 'wraith', parts: ['No one to steal from there'], players: [e.player], tone: 'muted' };
    case 'OmenBought':
      return {
        icon: 'omen',
        parts: [P(e.player), ' bought a development card', ...(see(e.player) ? [` — ${OMEN_NAME[e.omen]}`] : [])],
        players: [e.player],
      };
    case 'OmenPlayed':
      return {
        icon: e.omen === 'warden' ? 'sword' : 'omen',
        parts: [P(e.player), ` played ${OMEN_NAME[e.omen]}`],
        players: [e.player],
        tone: 'gold',
      };
    case 'HarvestTaken':
      return { icon: 'gain', parts: [P(e.player), ' took ', ...countsParts(e.resources)], players: [e.player], tone: 'good' };
    case 'TitheTaken':
      return {
        icon: 'blood',
        parts: [P(e.player), ` took all ${e.total} ${RESOURCE_NAME[e.resource]} (Monopoly)`],
        players: [e.player],
        tone: 'bad',
      };
    case 'TradeProposed':
      return {
        icon: 'trade',
        parts: [P(e.offer.proposer), ' offers ', { counts: e.offer.give }, ' for ', { counts: e.offer.want }],
        players: [e.offer.proposer, ...e.offer.targets],
      };
    case 'TradeDeclined':
      return { icon: 'trade', parts: [P(e.player), ' declined'], players: [e.player], tone: 'muted' };
    case 'TradeCountered':
      return {
        icon: 'trade',
        parts: [P(e.player), ' counters: ', { counts: e.offer.give }, ' for ', { counts: e.offer.want }],
        players: [e.player, ...e.offer.targets],
      };
    case 'TradeCompleted':
      return {
        icon: 'trade',
        parts: [P(e.proposer), ' traded ', { counts: e.gave }, ' to ', P(e.accepter), ' for ', { counts: e.got }],
        players: [e.proposer, e.accepter],
        tone: 'good',
      };
    case 'TradeClosed':
      return {
        icon: 'trade',
        parts: [e.reason === 'cancelled' ? 'Offer withdrawn' : 'No takers for the offer'],
        players: [],
        tone: 'muted',
      };
    case 'BankTraded':
      return {
        icon: 'bank',
        parts: [
          P(e.player),
          ` traded ${e.rate}:1 — `,
          { res: e.give, n: e.giveCount },
          ' for ',
          { res: e.receive, n: e.receiveCount },
        ],
        players: [e.player],
      };
    case 'LongestCausewayChanged':
      return {
        icon: 'causeway',
        parts:
          e.holder === null
            ? [`${LONGEST} is unclaimed`]
            : [P(e.holder), ` claims ${LONGEST} (${e.length})`],
        players: e.holder === null ? [] : [e.holder],
        tone: 'gold',
      };
    case 'GreatestHostChanged':
      return {
        icon: 'sword',
        parts: e.holder === null ? [`${HOST} is unclaimed`] : [P(e.holder), ` takes the ${HOST} (${e.count})`],
        players: e.holder === null ? [] : [e.holder],
        tone: 'gold',
      };
    case 'TurnStarted':
      return { icon: 'bell', parts: [`Round ${e.round} — `, P(e.player), "'s turn"], players: [e.player], tone: 'muted' };
    case 'GameWon':
      return { icon: 'crown', parts: [P(e.player), ` wins with ${e.vp} points!`], players: [e.player], tone: 'gold' };
    case 'ChestOpened':
      return { icon: 'chest', parts: [P(e.player), ' found a sword and a revolver'], players: [e.player], tone: 'gold' };
    case 'Slain':
      return {
        icon: 'sword',
        parts: [
          P(e.killer),
          ' slew ',
          P(e.victim),
          ...(e.resource === null
            ? [' — who now owes a card']
            : [' and took ', ...(see(e.killer, e.victim) ? [{ res: e.resource, n: 1 } as LogPart] : ['a card'])]),
        ],
        players: [e.killer, e.victim],
        tone: 'bad',
      };
    case 'DebtPaid':
      return {
        icon: 'steal',
        parts: [P(e.from), ' paid ', ...(see(e.from, e.to) ? [{ res: e.resource, n: 1 } as LogPart] : ['a card']), ' owed to ', P(e.to)],
        players: [e.from, e.to],
      };
    case 'DuelStarted':
      return { icon: 'duel', parts: [P(e.challenger), ' calls ', P(e.target), ' out — the game waits for the duel'], players: [e.challenger, e.target], tone: 'bad' };
    case 'DuelEnded':
      return {
        icon: 'duel',
        parts: [P(e.winner), e.yielded ? ' wins the duel — ' : ' wins the duel against ', P(e.loser), ...(e.yielded ? [' yielded'] : [])],
        players: [e.winner, e.loser],
        tone: 'gold',
      };
    case 'Struck':
    case 'ShotFired':
    case 'TurnEnded':
    case 'DevicePassed':
      return null;
  }
}

function sum(c: Partial<ResourceCounts>): number {
  return RESOURCES.reduce((n, r) => n + (c[r] ?? 0), 0);
}

/** Plain-text rendering of a log line (for aria-live and search). */
export function lineText(line: LogLine, players: PlayerState[]): string {
  return line.parts
    .map((p) => {
      if (typeof p === 'string') return p;
      if ('player' in p) return players[p.player]?.name ?? '?';
      if ('res' in p) return `${p.n ?? ''} ${RESOURCE_NAME[p.res]}`.trim();
      return RESOURCES.filter((r) => (p.counts[r] ?? 0) > 0)
        .map((r) => `${p.counts[r]} ${RESOURCE_NAME[r]}`)
        .join(', ');
    })
    .join('');
}
