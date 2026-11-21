/**
 * Records reference games from the TypeScript rules engine for the C++ port (CatnightRules).
 *
 * Every game file holds the config, then one entry per action: the action, whether it was
 * accepted (or its error code and message), a hash of the canonical state and of the events
 * after it, and, where a bot chose the action, that it was the bot's choice. Fuzz games also
 * probe all three bot levels in every position. The C++ tests replay each file and must
 * match every hash and every bot choice (docs/UNREAL_NATIVE_PLAN.md §4.1).
 *
 *   pnpm golden                       write native/golden/data/*.json
 *   pnpm golden --dump <game> <step>  write the TS state and events after <step> to native/golden/out
 *
 * Canonical JSON: object keys sorted, except `buildings` and `causeways` in the state, which
 * keep insertion order (the rules iterate them in that order); undefined fields left out.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RESOURCES,
  Rng,
  WEAPONS,
  applyAction,
  createGame,
  decideAction,
  getTopology,
  legalActions,
  activeActor,
  type Action,
  type BotLevel,
  type GameConfig,
  type GameEvent,
  type GameState,
  type Resource,
  type ResourceCounts,
  type SeatConfig,
} from '../../packages/engine/src/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, 'data');
const OUT = join(HERE, 'out');
const LEVELS: BotLevel[] = ['wanderer', 'warlord', 'archdemon'];

// ------------------------------------------------------------------ canonical JSON + hash

function canon(v: unknown, keepOrder = false): string {
  if (v === null) return 'null';
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error(`non-integer number ${v}`);
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return quote(v);
  if (Array.isArray(v)) return `[${v.map((x) => canon(x)).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    let keys = Object.keys(o).filter((k) => o[k] !== undefined);
    if (!keepOrder) keys = keys.sort();
    return `{${keys.map((k) => `${quote(k)}:${canon(o[k])}`).join(',')}}`;
  }
  throw new Error(`cannot serialize ${typeof v}`);
}

function quote(s: string): string {
  let out = '"';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 128 || c < 32) throw new Error(`non-ASCII or control character in ${JSON.stringify(s)}`);
    out += ch === '"' || ch === '\\' ? `\\${ch}` : ch;
  }
  return `${out}"`;
}

export function canonState(s: GameState): string {
  const o = s as unknown as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
  return `{${keys
    .map((k) => `${quote(k)}:${canon(o[k], k === 'buildings' || k === 'causeways')}`)
    .join(',')}}`;
}

/** Two 32-bit hashes (FNV-1a and a multiply-xorshift) as 16 hex digits. Mirrored in C++. */
export function hash(str: string): string {
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
    b = (b ^ (b >>> 13)) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

// ------------------------------------------------------------------ game definitions

const BASE: Omit<SeatConfig, 'kind'>[] = [
  { name: 'Ash', color: 'crimson', sigil: 'skull' },
  { name: 'Frost', color: 'frost', sigil: 'moon' },
  { name: 'Bone', color: 'bone', sigil: 'eye' },
  { name: 'Vex', color: 'violet', sigil: 'thorn' },
];

interface GameDef {
  name: string;
  config: GameConfig;
  fuzz: boolean;
  maxActions: number;
}

/** The 200 games of the engine's bot simulation test (sim.test.ts), seat for seat. */
function simGames(): GameDef[] {
  const out: GameDef[] = [];
  for (let g = 0; g < 200; g++) {
    const n = g % 4 === 0 ? 3 : 4;
    const seats: SeatConfig[] = Array.from({ length: n }, (_, i) => ({
      ...BASE[i],
      kind: 'bot',
      bot: LEVELS[(g + i) % 3],
    }));
    out.push({
      name: `sim-${String(g).padStart(3, '0')}`,
      config: { seed: `sim-${g}`, seats, targetVp: 10, layout: 'balanced', firstPlayer: 'rolloff' },
      fuzz: false,
      maxActions: 6000,
    });
  }
  return out;
}

/** Mixed games with scripted humans: hot-seat privacy, trades, counters, weapons, duels, errors. */
function fuzzGames(): GameDef[] {
  const out: GameDef[] = [];
  const layouts = ['balanced', 'random', 'beginner'] as const;
  for (let g = 0; g < 48; g++) {
    const n = g % 3 === 0 ? 3 : 4;
    const humans = Math.min(n, [1, 2, 0, 3, 2, 4, 1, 2][g % 8]);
    const order = Array.from({ length: n }, (_, i) => (i + g) % n);
    const seats: SeatConfig[] = order.map((b, i) => {
      const human = i < humans;
      const seat: SeatConfig = { ...BASE[b], kind: human ? 'human' : 'bot' };
      if (!human && g % 5 !== 0) seat.bot = LEVELS[(g + i) % 3];
      if (g % 7 === 3 && i === 0) seat.name = `  ${seat.name} of the Fen `;
      return seat;
    });
    const config: GameConfig = {
      seed: `fuzz-${g}`,
      seats,
      targetVp: 8 + (g % 7),
      layout: layouts[g % 3],
    };
    if (g % 4 === 0) config.firstPlayer = g % n;
    else if (g % 4 === 1) config.firstPlayer = 'rolloff';
    if (g % 6 === 0) config.privacy = true;
    else if (g % 6 === 1) config.privacy = false;
    if (g % 2 === 0) config.arms = true;
    else if (g % 10 === 3) config.arms = false;
    if (config.arms && humans >= 2 && g % 4 !== 2) config.pvp = true;
    out.push({ name: `fuzz-${String(g).padStart(2, '0')}`, config, fuzz: true, maxActions: 1500 });
  }
  return out;
}

// ------------------------------------------------------------------ scripted humans

function randomCounts(rng: Rng, max: number): Partial<ResourceCounts> {
  const out: Partial<ResourceCounts> = {};
  const n = 1 + rng.int(max);
  for (let i = 0; i < n; i++) {
    const r = rng.pick(RESOURCES);
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

function disjoint(rng: Rng, give: Partial<ResourceCounts>): Partial<ResourceCounts> {
  const free = RESOURCES.filter((r) => !give[r]);
  return free.length ? { [rng.pick(free)]: 1 + rng.int(2) } : { wood: 1 };
}

/** A deliberately doubtful action: wrong seat, wrong phase, missing cards or bad targets. */
function wildAction(s: GameState, rng: Rng): Action {
  const t = getTopology();
  const n = s.players.length;
  const player = rng.next() < 0.1 ? n + 3 : rng.int(n);
  const r = (): Resource => rng.pick(RESOURCES);
  switch (rng.int(16)) {
    case 0:
      return { type: 'RollDice', player };
    case 1:
      return { type: 'BuildOutpost', player, vertex: rng.next() < 0.2 ? '99,99' : rng.pick(t.vertices) };
    case 2:
      return { type: 'BuildCauseway', player, edge: rng.next() < 0.2 ? '0,0|9,9' : rng.pick(t.edges) };
    case 3:
      return { type: 'BuildCitadel', player, vertex: rng.pick(t.vertices) };
    case 4:
      return { type: 'MoveWraith', player, hex: rng.int(22) - 1 };
    case 5:
      return { type: 'StealFrom', player, victim: rng.int(n) };
    case 6:
      return { type: 'Discard', player, cards: rng.next() < 0.2 ? { wood: -1 } : randomCounts(rng, 5) };
    case 7:
      return { type: 'BankTrade', player, give: r(), receive: r(), count: rng.int(3) };
    case 8:
      return { type: 'PlayHarvestPact', player, resources: Array.from({ length: rng.int(4) }, r) };
    case 9:
      return { type: 'PlayBloodTithe', player, resource: r() };
    case 10:
      return { type: rng.pick(['PlayWarden', 'PlayDecree', 'BuyOmen', 'EndTurn', 'CancelTrade'] as const), player };
    case 11: {
      const give = randomCounts(rng, 3);
      const want = rng.next() < 0.2 ? { ...give } : disjoint(rng, give);
      const to = rng.next() < 0.5 ? ('all' as const) : rng.next() < 0.2 ? [] : [rng.int(n + 1), rng.int(n)];
      return { type: 'ProposeTrade', player, give, want, to };
    }
    case 12:
      return { type: 'RespondTrade', player, response: rng.pick(['accept', 'decline', 'counter'] as const) };
    case 13:
      return { type: 'AckPassDevice', player };
    case 14:
      return { type: 'PlayManUp', player, target: rng.int(n + 1) };
    default:
      return {
        type: 'Strike',
        player,
        victim: rng.int(n + 1),
        weapon: rng.pick(WEAPONS),
        parried: rng.next() < 0.3,
      };
  }
}

/** An interjection from any human seat: weapons can be used on anyone's turn. */
function interject(s: GameState, rng: Rng): Action | null {
  const humans = s.players.filter((p) => p.kind === 'human').map((p) => p.id);
  if (!humans.length) return null;
  const player = rng.pick(humans);
  const others = s.players.filter((p) => p.id !== player).map((p) => p.id);
  const roll = rng.next();
  if (roll < 0.15 && s.phase.kind === 'trade') return { type: 'CancelTrade', player: s.currentPlayer };
  if (!s.arms) return null;
  if (roll < 0.35) return { type: 'OpenChest', player };
  if (roll < 0.5) return { type: 'Fire', player };
  return {
    type: 'Strike',
    player,
    victim: rng.pick(others),
    weapon: rng.pick(WEAPONS),
    parried: rng.next() < 0.25,
  };
}

function humanAction(s: GameState, p: number, rng: Rng): Action {
  const ph = s.phase;
  if (ph.kind === 'duel') {
    const me = rng.pick([ph.challenger, ph.target]);
    const foe = me === ph.challenger ? ph.target : ph.challenger;
    if (rng.next() < 0.1) return { type: 'YieldDuel', player: me };
    return { type: 'Strike', player: me, victim: foe, weapon: rng.pick(WEAPONS), parried: rng.next() < 0.3 };
  }
  const legal = legalActions(s, rng);
  if (ph.kind === 'trade') {
    const roll = rng.next();
    if (roll < 0.2) {
      const give = randomCounts(rng, 2);
      return { type: 'RespondTrade', player: p, response: 'counter', give, want: disjoint(rng, give) };
    }
    return rng.pick(legal);
  }
  if (ph.kind === 'roll' || ph.kind === 'main') {
    const humansElse = s.players.filter((o) => o.kind === 'human' && o.id !== p);
    if (s.config.pvp && humansElse.length && rng.next() < 0.04) {
      return { type: 'PlayManUp', player: p, target: rng.pick(humansElse).id };
    }
    if (ph.kind === 'main') {
      const roll = rng.next();
      if (roll < 0.08) {
        const give = randomCounts(rng, 2);
        const others = s.players.filter((o) => o.id !== p).map((o) => o.id);
        const to = rng.next() < 0.6 ? ('all' as const) : [rng.pick(others)];
        return { type: 'ProposeTrade', player: p, give, want: disjoint(rng, give), to };
      }
      if (roll < 0.3) return { type: 'EndTurn', player: p };
      const builds = legal.filter((a) => a.type.startsWith('Build') || a.type === 'BuyOmen');
      if (builds.length && roll < 0.7) return rng.pick(builds);
    }
  }
  return rng.pick(legal);
}

// ------------------------------------------------------------------ recording

interface Step {
  action: Action;
  ok: boolean;
  code?: string;
  message?: string;
  state?: string;
  events?: string;
  by?: 'bot';
  probes?: Record<BotLevel, unknown>;
}

function probe(s: GameState): Record<BotLevel, unknown> | undefined {
  if (s.phase.kind === 'duel' || s.phase.kind === 'ended') return undefined;
  const out = {} as Record<BotLevel, unknown>;
  for (const lvl of LEVELS) {
    try {
      out[lvl] = JSON.parse(canon(decideAction(s, lvl, 'probe')));
    } catch (e) {
      out[lvl] = { error: (e as Error).message };
    }
  }
  return out;
}

function play(def: GameDef) {
  let s = createGame(def.config);
  const initial = canonState(s);
  const steps: Step[] = [];
  const fuzz = new Rng(Rng.fromSeed(`fuzz:${def.name}`).state);
  while (s.phase.kind !== 'ended' && steps.length < def.maxActions) {
    const actor = s.handoff ?? activeActor(s);
    const seat = s.players[actor];
    let action: Action | null = null;
    let by: 'bot' | undefined;
    if (def.fuzz) {
      const roll = fuzz.next();
      if (roll < 0.04) action = wildAction(s, fuzz);
      else if (roll < 0.1) action = interject(s, fuzz);
    }
    const probes = def.fuzz ? probe(s) : undefined;
    if (!action) {
      if (seat.kind === 'bot' && s.phase.kind !== 'duel') {
        action = decideAction(s);
        by = 'bot';
      } else {
        action = humanAction(s, actor, fuzz);
      }
    }
    const r = applyAction(s, action);
    const step: Step = { action: JSON.parse(canon(action)) as Action, ok: r.ok };
    if (by) step.by = by;
    if (probes) step.probes = probes;
    if (r.ok) {
      s = r.value.state;
      step.state = hash(canonState(s));
      step.events = hash(canon(r.value.events));
    } else {
      if (by) throw new Error(`${def.name}: bot chose illegal ${action.type}: ${r.error.message}`);
      step.code = r.error.code;
      step.message = r.error.message;
    }
    steps.push(step);
  }
  return { initial, final: canonState(s), steps, ended: s.phase.kind === 'ended' };
}

function write(def: GameDef) {
  const g = play(def);
  const file = {
    format: 'catnight-golden',
    version: 1,
    name: def.name,
    config: def.config,
    initial: hash(g.initial),
    initialJson: g.initial,
    steps: g.steps,
    final: hash(g.final),
    ended: g.ended,
  };
  writeFileSync(join(DATA, `${def.name}.json`), JSON.stringify(file));
  return g;
}

function dump(name: string, upTo: number) {
  const file = JSON.parse(readFileSync(join(DATA, `${name}.json`), 'utf8')) as {
    config: GameConfig;
    steps: Step[];
  };
  let s = createGame(file.config);
  let events: GameEvent[] = [];
  for (let i = 0; i <= upTo && i < file.steps.length; i++) {
    const r = applyAction(s, file.steps[i].action);
    if (r.ok) {
      s = r.value.state;
      events = r.value.events;
    }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}-${upTo}-ts-state.json`), canonState(s));
  writeFileSync(join(OUT, `${name}-${upTo}-ts-events.json`), canon(events));
  console.log(`wrote ${name}-${upTo}-ts-state.json and -events.json in ${OUT}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--dump') {
    dump(args[1], Number(args[2]));
    return;
  }
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  const defs = [...simGames(), ...fuzzGames()];
  let steps = 0;
  let ended = 0;
  const t0 = Date.now();
  for (const def of defs) {
    const g = write(def);
    steps += g.steps.length;
    if (g.ended) ended++;
  }
  const files = readdirSync(DATA).length;
  console.log(
    `golden: ${files} games, ${steps} actions, ${ended} finished, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
}

main();
