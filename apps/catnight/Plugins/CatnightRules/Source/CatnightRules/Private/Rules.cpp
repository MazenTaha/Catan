#include "CatnightRules/Rules.h"

#include <algorithm>
#include <bitset>
#include <cstdlib>
#include <initializer_list>
#include <set>

#include "CatnightRules/Serialize.h"

namespace catnight {

namespace {

using Err = std::optional<GameError>;

// Rule handlers return an error instead of throwing (Unreal builds without exceptions).
#define CN_CHECK(cond, code, msg)              \
  do {                                         \
    if (!(cond)) return GameError{code, msg}; \
  } while (0)
#define CN_TRY(expr)                 \
  do {                               \
    if (Err e_ = (expr)) return e_; \
  } while (0)

Err Fail(const char* code, std::string msg) { return GameError{code, std::move(msg)}; }

struct Ctx {
  GameState& s;
  std::vector<GameEvent>& ev;
  Rng rng;
  bool legacyReplay = false;
};

Json Ev(const char* type) {
  Json e = Json::Object();
  e.Set("type", type);
  return e;
}

Json IntArray(const std::vector<int>& v) {
  Json a = Json::Array();
  for (int x : v) a.Push(x);
  return a;
}

Json OptInt(const std::optional<int>& v) { return v ? Json(*v) : Json(); }

const Topology& Topo() { return GetTopology(); }

bool Contains(const std::vector<int>& v, int x) { return std::find(v.begin(), v.end(), x) != v.end(); }

// ------------------------------------------------------------------ context helpers

Err RequireCurrent(const Ctx& ctx, int player) {
  CN_CHECK(player == ctx.s.currentPlayer, "NOT_YOUR_TURN", "It is not your turn");
  return {};
}

const char* PhaseHint(PhaseKind k) {
  switch (k) {
    case PhaseKind::Setup: return "Finish placing your starting pieces first";
    case PhaseKind::Roll: return "Roll the dice first";
    case PhaseKind::Discard: return "Waiting for discards";
    case PhaseKind::MoveWraith: return "Move the Wraith first";
    case PhaseKind::Steal: return "Choose whom to rob first";
    case PhaseKind::Decree: return "Place your free causeways first";
    case PhaseKind::Trade: return "Resolve the open trade first";
    case PhaseKind::Duel: return "The game is paused for a duel";
    case PhaseKind::Main: return "Not now";
    case PhaseKind::Ended: return "The game is over";
  }
  return "Not now";
}

Err RequirePhase(const Ctx& ctx, std::initializer_list<PhaseKind> kinds) {
  const PhaseKind k = ctx.s.phase.kind;
  for (PhaseKind x : kinds)
    if (x == k) return {};
  if (k == PhaseKind::Roll)
    for (PhaseKind x : kinds)
      if (x == PhaseKind::Main) return Fail("MUST_ROLL", "Roll the dice first");
  return Fail("WRONG_PHASE", PhaseHint(k));
}

Err PayCost(Ctx& ctx, int player, const PartialCounts& c) {
  PlayerState& p = ctx.s.players[player];
  CN_CHECK(HasAtLeast(p.hand, c), "CANNOT_AFFORD", "You lack the resources");
  p.hand = AddCounts(p.hand, c, -1);
  ctx.s.bank = AddCounts(ctx.s.bank, c, 1);
  return {};
}

void Grant(Ctx& ctx, int player, const PartialCounts& counts, bool track = true) {
  PlayerState& p = ctx.s.players[player];
  p.hand = AddCounts(p.hand, counts, 1);
  ctx.s.bank = AddCounts(ctx.s.bank, counts, -1);
  if (track) ctx.s.stats.gained[player] = AddCounts(ctx.s.stats.gained[player], counts, 1);
  for (Resource r : kResources)
    if (ctx.s.bank[r] < 0) std::abort();  // bank underflow: a rules bug, as in TypeScript
}

Err Transfer(Ctx& ctx, int from, int to, const PartialCounts& counts) {
  PlayerState& a = ctx.s.players[from];
  PlayerState& b = ctx.s.players[to];
  CN_CHECK(HasAtLeast(a.hand, counts), "CANNOT_AFFORD", a.name + " lacks the cards");
  a.hand = AddCounts(a.hand, counts, -1);
  b.hand = AddCounts(b.hand, counts, 1);
  return {};
}

PartialCounts One(Resource r, int n = 1) {
  PartialCounts p;
  p.Set(r, n);
  return p;
}

Phase ResumePhase(bool resumeMain) { return Phase::Simple(resumeMain ? PhaseKind::Main : PhaseKind::Roll); }

bool ValidCounts(const PartialCounts& c) {
  if (c.invalid) return false;
  for (Resource r : kResources)
    if (c.Get(r) < 0) return false;
  return true;
}

// ------------------------------------------------------------------ longest road + scoring

void UpdateLongestCauseway(GameState& s, std::vector<GameEvent>& events) {
  std::vector<int> lengths;
  for (const auto& p : s.players) lengths.push_back(LongestCausewayLength(s.causeways, s.buildings, p.id));
  const std::optional<int> prev = s.longestHolder;
  const int max = *std::max_element(lengths.begin(), lengths.end());
  std::vector<int> leaders;
  for (int i = 0; i < static_cast<int>(lengths.size()); i++)
    if (lengths[i] == max) leaders.push_back(i);
  std::optional<int> holder;
  if (prev && lengths[*prev] >= kLongestMin && lengths[*prev] == max) {
    holder = prev;
  } else if (max >= kLongestMin && leaders.size() == 1) {
    holder = leaders[0];
  }
  s.longestHolder = holder;
  s.longestLengths = lengths;
  if (holder != prev) {
    Json e = Ev("LongestCausewayChanged");
    e.Set("holder", OptInt(holder));
    e.Set("previous", OptInt(prev));
    e.Set("length", holder ? lengths[*holder] : max);
    events.push_back(std::move(e));
  }
}

void UpdateGreatestHost(Ctx& ctx) {
  GameState& s = ctx.s;
  std::vector<int> counts;
  for (const auto& p : s.players) counts.push_back(p.playedWardens);
  const std::optional<int> prev = s.hostHolder;
  std::optional<int> holder = prev;
  for (int p = 0; p < static_cast<int>(counts.size()); p++) {
    if (counts[p] < kHostMin || (holder && p == *holder)) continue;
    if (!holder || counts[p] > counts[*holder]) holder = p;
  }
  if (holder != prev) {
    s.hostHolder = holder;
    Json e = Ev("GreatestHostChanged");
    e.Set("holder", OptInt(holder));
    e.Set("previous", OptInt(prev));
    e.Set("count", counts[*holder]);
    ctx.ev.push_back(std::move(e));
  }
}

Json BreakdownJson(const VpBreakdown& b) {
  Json j = Json::Object();
  j.Set("outposts", b.outposts);
  j.Set("citadels", b.citadels);
  j.Set("longest", b.longest);
  j.Set("host", b.host);
  j.Set("relics", b.relics);
  j.Set("publicTotal", b.publicTotal);
  j.Set("total", b.total);
  return j;
}

void CheckVictory(Ctx& ctx) {
  GameState& s = ctx.s;
  if (s.phase.kind == PhaseKind::Setup || s.phase.kind == PhaseKind::Ended) return;
  const int p = s.currentPlayer;
  const int vp = VictoryPoints(s, p, true);
  if (vp < s.config.targetVp) return;
  s.phase = Phase::Simple(PhaseKind::Ended);
  s.phase.winner = p;
  s.winner = p;
  s.handoff.reset();
  Json e = Ev("GameWon");
  e.Set("player", p);
  e.Set("vp", vp);
  Json br = Json::Array();
  for (const auto& pl : s.players) br.Push(BreakdownJson(VpBreakdownOf(s, pl.id)));
  e.Set("breakdown", std::move(br));
  ctx.ev.push_back(std::move(e));
}

// ------------------------------------------------------------------ arms (DECISIONS #40)

Err ArmsOf(Ctx& ctx, ArmsState*& out) {
  CN_CHECK(ctx.s.arms.has_value(), "INVALID", "This game has no weapons");
  out = &*ctx.s.arms;
  return {};
}

void HideChest(Ctx& ctx, int player) {
  if (!ctx.s.arms) return;
  ArmsState& a = *ctx.s.arms;
  if (a.chest[player] >= 0) return;
  const Topology& t = Topo();
  std::vector<int> homes;
  for (int v : ctx.s.buildings.order)
    if (ctx.s.buildings.at[v]->owner == player) homes.push_back(v);
  std::stable_sort(homes.begin(), homes.end(), [&](int x, int y) { return t.vertexIds[x] < t.vertexIds[y]; });
  a.starts[player] = homes;
  if (!homes.empty()) a.chest[player] = homes[ctx.rng.Int(static_cast<int>(homes.size()))];
}

std::optional<Resource> TakeRandom(Ctx& ctx, int from, int to) {
  const Counts hand = ctx.s.players[from].hand;
  const int total = hand.Total();
  if (!total) return std::nullopt;
  int k = ctx.rng.Int(total);
  for (Resource r : kResources) {
    if (k < hand[r]) {
      (void)Transfer(ctx, from, to, One(r));
      return r;
    }
    k -= hand[r];
  }
  return std::nullopt;
}

void Slay(Ctx& ctx, int killer, int victim, bool yielded) {
  GameState& s = ctx.s;
  ArmsState& a = *s.arms;
  a.health[victim] = kMaxHealth;
  a.kills[killer]++;
  const std::optional<Resource> resource = TakeRandom(ctx, victim, killer);
  if (!resource) a.owed[victim][killer]++;
  Json e = Ev("Slain");
  e.Set("killer", killer);
  e.Set("victim", victim);
  e.Set("resource", resource ? Json(Name(*resource)) : Json());
  ctx.ev.push_back(std::move(e));
  const Phase& ph = s.phase;
  if (ph.kind == PhaseKind::Duel) {
    const bool k = killer == ph.challenger || killer == ph.target;
    const bool v = victim == ph.challenger || victim == ph.target;
    if (k && v) {
      s.phase = ResumePhase(ph.resumeMain);
      Json d = Ev("DuelEnded");
      d.Set("winner", killer);
      d.Set("loser", victim);
      d.Set("yielded", yielded);
      ctx.ev.push_back(std::move(d));
    }
  }
}

void SettleDebts(Ctx& ctx) {
  if (!ctx.s.arms) return;
  ArmsState& a = *ctx.s.arms;
  const int n = static_cast<int>(a.owed.size());
  for (int debtor = 0; debtor < n; debtor++) {
    for (int creditor = 0; creditor < static_cast<int>(a.owed[debtor].size()); creditor++) {
      const int owed = a.owed[debtor][creditor];
      for (int i = 0; i < owed && ctx.s.players[debtor].hand.Total() > 0; i++) {
        const std::optional<Resource> resource = TakeRandom(ctx, debtor, creditor);
        if (!resource) break;
        a.owed[debtor][creditor]--;
        Json e = Ev("DebtPaid");
        e.Set("from", debtor);
        e.Set("to", creditor);
        e.Set("resource", Name(*resource));
        ctx.ev.push_back(std::move(e));
      }
    }
  }
}

Err OpenChest(Ctx& ctx, int player) {
  ArmsState* a = nullptr;
  CN_TRY(ArmsOf(ctx, a));
  CN_CHECK(ctx.s.players[player].kind == SeatKind::Human, "INVALID", "Only players can open chests");
  CN_CHECK(a->chest[player] >= 0, "INVALID", "Your chest is not hidden yet");
  CN_CHECK(!a->armed[player], "INVALID", "You already opened your chest");
  a->armed[player] = true;
  Json e = Ev("ChestOpened");
  e.Set("player", player);
  ctx.ev.push_back(std::move(e));
  return {};
}

Err FireShot(Ctx& ctx, int player) {
  CN_CHECK(ctx.legacyReplay, "INVALID", "Ranged weapons are not available");
  ArmsState* a = nullptr;
  CN_TRY(ArmsOf(ctx, a));
  CN_CHECK(a->armed[player], "INVALID", "Find your weapon chest first");
  CN_CHECK(a->bullets[player] > 0, "INVALID", "No bullets left this game");
  a->bullets[player]--;
  Json e = Ev("ShotFired");
  e.Set("player", player);
  e.Set("left", a->bullets[player]);
  ctx.ev.push_back(std::move(e));
  return {};
}

Err Strike(Ctx& ctx, int player, int victim, Weapon weapon, bool parried) {
  GameState& s = ctx.s;
  ArmsState* a = nullptr;
  CN_TRY(ArmsOf(ctx, a));
  CN_CHECK(s.config.pvp.value_or(false), "INVALID", "Fighting other players is off in this game");
  CN_CHECK(weapon == Weapon::Fist || weapon == Weapon::Sword || (ctx.legacyReplay && weapon == Weapon::Revolver), "INVALID", "Unknown weapon");
  const int n = static_cast<int>(s.players.size());
  CN_CHECK(victim >= 0 && victim < n && victim != player, "INVALID", "Unknown target");
  CN_CHECK(s.players[player].kind == SeatKind::Human && s.players[victim].kind == SeatKind::Human, "INVALID",
           "Only players can fight");
  CN_CHECK(weapon == Weapon::Fist || a->armed[player], "INVALID", "Find your weapon chest first");
  if (s.phase.kind == PhaseKind::Duel) {
    const bool p = player == s.phase.challenger || player == s.phase.target;
    const bool v = victim == s.phase.challenger || victim == s.phase.target;
    CN_CHECK(p && v, "WRONG_PHASE", "A duel is under way");
  }
  const int damage = parried ? 0 : Damage(weapon);
  a->health[victim] = std::max(0, a->health[victim] - damage);
  Json e = Ev("Struck");
  e.Set("attacker", player);
  e.Set("victim", victim);
  e.Set("weapon", Name(weapon));
  e.Set("damage", damage);
  e.Set("health", a->health[victim]);
  e.Set("parried", parried);
  ctx.ev.push_back(std::move(e));
  if (a->health[victim] == 0) Slay(ctx, player, victim, false);
  return {};
}

Err PlayManUp(Ctx& ctx, int player, int target) {
  GameState& s = ctx.s;
  ArmsState* a = nullptr;
  CN_TRY(ArmsOf(ctx, a));
  CN_CHECK(s.config.pvp.value_or(false), "INVALID", "Duels are off in this game");
  const int n = static_cast<int>(s.players.size());
  CN_CHECK(target >= 0 && target < n && target != player && s.players[target].kind == SeatKind::Human, "INVALID",
           "Challenge another player");
  CN_TRY(RequireCurrent(ctx, player));
  CN_TRY(RequirePhase(ctx, {PhaseKind::Roll, PhaseKind::Main}));
  CN_CHECK(!s.omenPlayedThisTurn, "OMEN_LIMIT", "Only one development card may be played each turn");
  PlayerState& p = s.players[player];
  int idx = -1;
  for (int i = 0; i < static_cast<int>(p.omens.size()); i++)
    if (p.omens[i].type == OmenType::Manup && p.omens[i].boughtTurn < s.turn) {
      idx = i;
      break;
    }
  if (idx < 0) {
    for (const auto& o : p.omens)
      if (o.type == OmenType::Manup)
        return Fail("CARD_LOCKED", "A development card cannot be played on the turn it was bought");
    return Fail("NO_CARD", "You do not hold that development card");
  }
  p.omens.erase(p.omens.begin() + idx);
  p.playedOmens.push_back(OmenType::Manup);
  s.omenPlayedThisTurn = true;
  Json e = Ev("OmenPlayed");
  e.Set("player", player);
  e.Set("omen", "manup");
  ctx.ev.push_back(std::move(e));
  Phase duel = Phase::Simple(PhaseKind::Duel);
  duel.challenger = player;
  duel.target = target;
  duel.resumeMain = s.hasRolled;
  s.phase = duel;
  Json d = Ev("DuelStarted");
  d.Set("challenger", player);
  d.Set("target", target);
  ctx.ev.push_back(std::move(d));
  return {};
}

Err YieldDuel(Ctx& ctx, int player) {
  const Phase ph = ctx.s.phase;
  CN_CHECK(ph.kind == PhaseKind::Duel, "WRONG_PHASE", "There is no duel to yield");
  CN_CHECK(player == ph.challenger || player == ph.target, "INVALID", "You are not in this duel");
  Slay(ctx, player == ph.challenger ? ph.target : ph.challenger, player, true);
  return {};
}

// ------------------------------------------------------------------ building

Err CheckVertex(Ctx& ctx, const std::string& id, int& v) {
  v = Topo().VertexIndex(id);
  CN_CHECK(v >= 0, "ILLEGAL_SPOT", "No such spot");
  CN_CHECK(!ctx.s.buildings.Has(v), "OCCUPIED", "That spot is taken");
  CN_CHECK(IsDistanceLegal(ctx.s, v), "TOO_CLOSE", "Too close to another settlement");
  return {};
}

Err CheckEdge(Ctx& ctx, const std::string& id, int& e) {
  e = Topo().EdgeIndex(id);
  CN_CHECK(e >= 0, "ILLEGAL_SPOT", "No such path");
  CN_CHECK(!ctx.s.causeways.Has(e), "OCCUPIED", "A road is already there");
  return {};
}

Json CausewayBuilt(int player, int e, bool free) {
  Json j = Ev("CausewayBuilt");
  j.Set("player", player);
  j.Set("edge", Topo().edgeIds[e]);
  j.Set("free", free);
  return j;
}

Err PlaceSetupOutpost(Ctx& ctx, int player, const std::string& id) {
  GameState& s = ctx.s;
  CN_TRY(RequirePhase(ctx, {PhaseKind::Setup}));
  CN_TRY(RequireCurrent(ctx, player));
  CN_CHECK(!s.phase.stepCauseway, "WRONG_PHASE", "Place your road next");
  int v = -1;
  CN_TRY(CheckVertex(ctx, id, v));
  PlayerState& p = s.players[player];
  s.buildings.Put(v, Building{player, BuildingKind::Outpost});
  p.supply.outposts--;
  const int round = s.phase.index < static_cast<int>(s.players.size()) ? 1 : 2;
  Json e = Ev("SetupOutpostPlaced");
  e.Set("player", player);
  e.Set("vertex", Topo().vertexIds[v]);
  e.Set("round", round);
  ctx.ev.push_back(std::move(e));
  if (round == 2) {
    Counts gains;
    for (int h : Topo().vertexHexes[v]) {
      const auto res = TerrainResource(s.board.hexes[h].terrain);
      if (res && s.bank[*res] - gains[*res] > 0) gains[*res]++;
    }
    Grant(ctx, player, PartialCounts::From(gains));
    Json g = Ev("SetupResourcesGranted");
    g.Set("player", player);
    g.Set("gains", CountsJson(gains));
    ctx.ev.push_back(std::move(g));
    HideChest(ctx, player);
  }
  s.phase.stepCauseway = true;
  s.phase.lastOutpost = v;
  UpdateLongestCauseway(s, ctx.ev);
  return {};
}

Err PlaceSetupCauseway(Ctx& ctx, int player, const std::string& id) {
  GameState& s = ctx.s;
  CN_TRY(RequirePhase(ctx, {PhaseKind::Setup}));
  CN_TRY(RequireCurrent(ctx, player));
  CN_CHECK(s.phase.stepCauseway, "WRONG_PHASE", "Place your settlement first");
  int e = -1;
  CN_TRY(CheckEdge(ctx, id, e));
  CN_CHECK(Contains(LegalCausewaySpots(s, player), e), "NOT_CONNECTED",
           "The causeway must touch the outpost you just placed");
  s.causeways.Put(e, player);
  s.players[player].supply.causeways--;
  ctx.ev.push_back(CausewayBuilt(player, e, true));
  UpdateLongestCauseway(s, ctx.ev);

  const int index = s.phase.index + 1;
  if (index >= static_cast<int>(s.setupOrder.size())) {
    s.phase = Phase::Simple(PhaseKind::Roll);
    s.currentPlayer = s.firstPlayer;
    s.turn = 1;
    s.round = 1;
    ctx.ev.push_back(Ev("SetupComplete"));
    Json t = Ev("TurnStarted");
    t.Set("player", s.currentPlayer);
    t.Set("turn", 1);
    t.Set("round", 1);
    ctx.ev.push_back(std::move(t));
  } else {
    s.phase = Phase::Simple(PhaseKind::Setup);
    s.phase.index = index;
    s.currentPlayer = s.setupOrder[index];
  }
  return {};
}

Err BuildCauseway(Ctx& ctx, int player, const std::string& id) {
  GameState& s = ctx.s;
  CN_TRY(RequireCurrent(ctx, player));
  CN_TRY(RequirePhase(ctx, {PhaseKind::Main, PhaseKind::Decree}));
  int e = -1;
  CN_TRY(CheckEdge(ctx, id, e));
  PlayerState& p = s.players[player];
  CN_CHECK(p.supply.causeways > 0, "NO_SUPPLY", "No roads left in your supply");
  CN_CHECK(Contains(LegalCausewaySpots(s, player), e), "NOT_CONNECTED",
           "A causeway must connect to your own causeway, outpost or citadel");
  const bool free = s.phase.kind == PhaseKind::Decree;
  if (!free) CN_TRY(PayCost(ctx, player, Cost(CostKey::Causeway)));
  s.causeways.Put(e, player);
  p.supply.causeways--;
  ctx.ev.push_back(CausewayBuilt(player, e, free));
  UpdateLongestCauseway(s, ctx.ev);
  if (s.phase.kind == PhaseKind::Decree) {
    const int remaining = s.phase.remaining - 1;
    if (remaining <= 0 || p.supply.causeways == 0 || LegalCausewaySpots(s, player).empty()) {
      s.phase = ResumePhase(s.phase.resumeMain);
    } else {
      s.phase.remaining = remaining;
    }
  }
  return {};
}

Err BuildOutpost(Ctx& ctx, int player, const std::string& id) {
  GameState& s = ctx.s;
  CN_TRY(RequireCurrent(ctx, player));
  CN_TRY(RequirePhase(ctx, {PhaseKind::Main}));
  int v = -1;
  CN_TRY(CheckVertex(ctx, id, v));
  CN_CHECK(TouchesOwnCauseway(s, player, v), "NOT_CONNECTED", "A settlement must connect to one of your roads");
  PlayerState& p = s.players[player];
  CN_CHECK(p.supply.outposts > 0, "NO_SUPPLY", "No settlements left in your supply");
  CN_TRY(PayCost(ctx, player, Cost(CostKey::Outpost)));
  s.buildings.Put(v, Building{player, BuildingKind::Outpost});
  p.supply.outposts--;
  Json e = Ev("OutpostBuilt");
  e.Set("player", player);
  e.Set("vertex", Topo().vertexIds[v]);
  ctx.ev.push_back(std::move(e));
  UpdateLongestCauseway(s, ctx.ev);
  return {};
}

Err BuildCitadel(Ctx& ctx, int player, const std::string& id) {
  GameState& s = ctx.s;
  CN_TRY(RequireCurrent(ctx, player));
  CN_TRY(RequirePhase(ctx, {PhaseKind::Main}));
  const int v = Topo().VertexIndex(id);
  const Building* b = s.buildings.Find(v);
  CN_CHECK(b && b->owner == player && b->kind == BuildingKind::Outpost, "ILLEGAL_SPOT",
           "A city must replace one of your settlements");
  PlayerState& p = s.players[player];
  CN_CHECK(p.supply.citadels > 0, "NO_SUPPLY", "No cities left in your supply");
  CN_TRY(PayCost(ctx, player, Cost(CostKey::Citadel)));
  s.buildings.Put(v, Building{player, BuildingKind::Citadel});
  p.supply.citadels--;
  p.supply.outposts++;
  Json e = Ev("CitadelBuilt");
  e.Set("player", player);
  e.Set("vertex", Topo().vertexIds[v]);
  ctx.ev.push_back(std::move(e));
  return {};
}

// ------------------------------------------------------------------ production + robber

void Produce(Ctx& ctx, int roll) {
  GameState& s = ctx.s;
  const Topology& t = Topo();
  const int n = static_cast<int>(s.players.size());
  std::vector<Counts> owed(n);
  std::array<std::set<int>, 5> hexesByRes;
  std::optional<int> blockedHex;
  for (const HexTile& hex : s.board.hexes) {
    if (hex.token != roll) continue;
    if (hex.id == s.wraithHex) {
      blockedHex = hex.id;
      continue;
    }
    const auto res = TerrainResource(hex.terrain);
    if (!res) continue;
    for (int v : t.hexVertices[hex.id]) {
      const Building* b = s.buildings.Find(v);
      if (!b) continue;
      owed[b->owner][*res] += b->kind == BuildingKind::Citadel ? 2 : 1;
      hexesByRes[static_cast<int>(*res)].insert(hex.id);
    }
  }
  std::vector<Counts> gains(n);
  std::set<int> paidHexes;
  for (Resource res : kResources) {
    int total = 0;
    for (const auto& o : owed) total += o[res];
    if (total == 0) continue;
    auto paidTo = [&](int p, int amount) {
      if (amount <= 0) return;
      gains[p][res] += amount;
      Grant(ctx, p, One(res, amount));
    };
    const auto& hexes = hexesByRes[static_cast<int>(res)];
    if (total <= s.bank[res]) {
      for (int p = 0; p < n; p++) paidTo(p, owed[p][res]);
      paidHexes.insert(hexes.begin(), hexes.end());
      continue;
    }
    std::vector<int> owedPlayers;
    for (int p = 0; p < n; p++)
      if (owed[p][res] > 0) owedPlayers.push_back(p);
    Json e = Ev("ProductionShortage");
    e.Set("resource", Name(res));
    e.Set("owed", IntArray(owedPlayers));
    if (owedPlayers.size() == 1) {
      const int amount = s.bank[res];
      paidTo(owedPlayers[0], amount);
      if (amount > 0) paidHexes.insert(hexes.begin(), hexes.end());
      e.Set("paid", owedPlayers[0]);
      e.Set("amount", amount);
    } else {
      e.Set("paid", Json());
      e.Set("amount", 0);
    }
    ctx.ev.push_back(std::move(e));
  }
  Json e = Ev("ResourcesProduced");
  e.Set("roll", roll);
  Json g = Json::Array();
  for (const auto& c : gains) g.Push(CountsJson(c));
  e.Set("gains", std::move(g));
  e.Set("hexes", IntArray(std::vector<int>(paidHexes.begin(), paidHexes.end())));
  e.Set("blockedHex", OptInt(blockedHex));
  ctx.ev.push_back(std::move(e));
}

void BeginSeven(Ctx& ctx) {
  GameState& s = ctx.s;
  std::vector<int> pending;
  bool any = false;
  for (const auto& p : s.players) {
    const int n = HandTotal(p);
    pending.push_back(n > kHandLimit ? n / 2 : 0);
    any = any || pending.back() > 0;
  }
  if (any) {
    s.phase = Phase::Simple(PhaseKind::Discard);
    s.phase.pending = pending;
    Json e = Ev("DiscardRequired");
    e.Set("pending", IntArray(pending));
    ctx.ev.push_back(std::move(e));
  } else {
    s.phase = Phase::Simple(PhaseKind::MoveWraith);
    s.phase.resumeMain = true;
  }
}

Err DiscardCards(Ctx& ctx, int player, const PartialCounts& cards) {
  GameState& s = ctx.s;
  CN_TRY(RequirePhase(ctx, {PhaseKind::Discard}));
  const int owed = player < static_cast<int>(s.phase.pending.size()) ? s.phase.pending[player] : 0;
  CN_CHECK(owed > 0, "INVALID", "You do not need to discard");
  CN_CHECK(ValidCounts(cards), "INVALID", "Invalid discard");
  const Counts c = cards.ToCounts();
  CN_CHECK(c.Total() == owed, "INVALID", "Discard exactly " + std::to_string(owed) + " cards");
  PlayerState& p = s.players[player];
  CN_CHECK(HasAtLeast(p.hand, c), "CANNOT_AFFORD", "You do not hold those cards");
  p.hand = AddCounts(p.hand, PartialCounts::From(c), -1);
  s.bank = AddCounts(s.bank, PartialCounts::From(c), 1);
  s.stats.discarded[player] += owed;
  Json e = Ev("Discarded");
  e.Set("player", player);
  e.Set("cards", CountsJson(c));
  ctx.ev.push_back(std::move(e));
  s.phase.pending[player] = 0;
  if (std::all_of(s.phase.pending.begin(), s.phase.pending.end(), [](int x) { return x == 0; })) {
    s.phase = Phase::Simple(PhaseKind::MoveWraith);
    s.phase.resumeMain = true;
  }
  return {};
}

void DoSteal(Ctx& ctx, int thief, int victim) {
  const Counts hand = ctx.s.players[victim].hand;
  const int total = hand.Total();
  if (total == 0) return;
  int k = ctx.rng.Int(total);
  for (Resource r : kResources) {
    if (k < hand[r]) {
      (void)Transfer(ctx, victim, thief, One(r));
      ctx.s.stats.stolen[thief]++;
      Json e = Ev("Stolen");
      e.Set("thief", thief);
      e.Set("victim", victim);
      e.Set("resource", Name(r));
      ctx.ev.push_back(std::move(e));
      return;
    }
    k -= hand[r];
  }
}

Err MoveWraith(Ctx& ctx, int player, int hex) {
  GameState& s = ctx.s;
  CN_TRY(RequireCurrent(ctx, player));
  CN_TRY(RequirePhase(ctx, {PhaseKind::MoveWraith}));
  CN_CHECK(hex >= 0 && hex < static_cast<int>(s.board.hexes.size()), "ILLEGAL_SPOT", "No such hex");
  CN_CHECK(hex != s.wraithHex, "ILLEGAL_SPOT", "The robber must move to a different hex");
  const bool resume = s.phase.resumeMain;
  const int from = s.wraithHex;
  s.wraithHex = hex;
  Json e = Ev("WraithMoved");
  e.Set("player", player);
  e.Set("from", from);
  e.Set("to", hex);
  ctx.ev.push_back(std::move(e));
  const std::vector<int> candidates = StealCandidates(s, hex, player);
  if (candidates.empty()) {
    Json k = Ev("StealSkipped");
    k.Set("player", player);
    ctx.ev.push_back(std::move(k));
    s.phase = ResumePhase(resume);
  } else if (candidates.size() == 1) {
    DoSteal(ctx, player, candidates[0]);
    s.phase = ResumePhase(resume);
  } else {
    s.phase = Phase::Simple(PhaseKind::Steal);
    s.phase.candidates = candidates;
    s.phase.resumeMain = resume;
  }
  return {};
}

Err StealFrom(Ctx& ctx, int player, int victim) {
  GameState& s = ctx.s;
  CN_TRY(RequireCurrent(ctx, player));
  CN_TRY(RequirePhase(ctx, {PhaseKind::Steal}));
  CN_CHECK(Contains(s.phase.candidates, victim), "INVALID", "You cannot rob that player");
  const bool resume = s.phase.resumeMain;
  DoSteal(ctx, player, victim);
  s.phase = ResumePhase(resume);
  return {};
}

// ------------------------------------------------------------------ omens

Err BuyOmen(Ctx& ctx, int player) {
  GameState& s = ctx.s;
  CN_TRY(RequireCurrent(ctx, player));
  CN_TRY(RequirePhase(ctx, {PhaseKind::Main}));
  CN_CHECK(!s.omenDeck.empty(), "DECK_EMPTY", "No development cards left");
  CN_TRY(PayCost(ctx, player, Cost(CostKey::Omen)));
  const OmenType omen = s.omenDeck.back();
  s.omenDeck.pop_back();
  s.players[player].omens.push_back({omen, s.turn});
  s.stats.omensBought[player]++;
  Json e = Ev("OmenBought");
  e.Set("player", player);
  e.Set("omen", Name(omen));
  ctx.ev.push_back(std::move(e));
  return {};
}

Err SpendOmen(Ctx& ctx, int player, OmenType type) {
  GameState& s = ctx.s;
  CN_TRY(RequireCurrent(ctx, player));
  CN_TRY(RequirePhase(ctx, {PhaseKind::Roll, PhaseKind::Main}));
  CN_CHECK(!s.omenPlayedThisTurn, "OMEN_LIMIT", "Only one development card may be played each turn");
  PlayerState& p = s.players[player];
  int idx = -1;
  for (int i = 0; i < static_cast<int>(p.omens.size()); i++)
    if (p.omens[i].type == type && p.omens[i].boughtTurn < s.turn) {
      idx = i;
      break;
    }
  if (idx < 0) {
    for (const auto& o : p.omens)
      if (o.type == type) return Fail("CARD_LOCKED", "A development card cannot be played on the turn it was bought");
    return Fail("NO_CARD", "You do not hold that development card");
  }
  p.omens.erase(p.omens.begin() + idx);
  p.playedOmens.push_back(type);
  s.omenPlayedThisTurn = true;
  Json e = Ev("OmenPlayed");
  e.Set("player", player);
  e.Set("omen", Name(type));
  ctx.ev.push_back(std::move(e));
  return {};
}

Err PlayWarden(Ctx& ctx, int player) {
  GameState& s = ctx.s;
  CN_TRY(SpendOmen(ctx, player, OmenType::Warden));
  s.players[player].playedWardens++;
  UpdateGreatestHost(ctx);
  s.phase = Phase::Simple(PhaseKind::MoveWraith);
  s.phase.reasonWarden = true;
  s.phase.resumeMain = s.hasRolled;
  return {};
}

Err PlayDecree(Ctx& ctx, int player) {
  GameState& s = ctx.s;
  PlayerState& p = s.players[player];
  CN_CHECK(p.supply.causeways > 0, "NO_SUPPLY", "No roads left in your supply");
  CN_CHECK(!LegalCausewaySpots(s, player).empty(), "ILLEGAL_SPOT", "There is nowhere to build a road");
  CN_TRY(SpendOmen(ctx, player, OmenType::Decree));
  s.phase = Phase::Simple(PhaseKind::Decree);
  s.phase.remaining = std::min(2, p.supply.causeways);
  s.phase.resumeMain = s.hasRolled;
  return {};
}

Err PlayHarvestPact(Ctx& ctx, int player, const std::vector<Resource>& resources) {
  GameState& s = ctx.s;
  const int bankTotal = s.bank.Total();
  CN_CHECK(bankTotal > 0, "BANK_EMPTY", "The bank is empty");
  const int need = std::min(2, bankTotal);
  CN_CHECK(static_cast<int>(resources.size()) == need, "INVALID",
           "Choose " + std::to_string(need) + " resource" + (need == 1 ? "" : "s"));
  Counts take;
  for (Resource r : resources) take[r]++;
  for (Resource r : resources) CN_CHECK(s.bank[r] >= take[r], "BANK_EMPTY", "The bank cannot supply that");
  CN_TRY(SpendOmen(ctx, player, OmenType::Harvest));
  Grant(ctx, player, PartialCounts::From(take));
  Json e = Ev("HarvestTaken");
  e.Set("player", player);
  e.Set("resources", CountsJson(take));
  ctx.ev.push_back(std::move(e));
  return {};
}

Err PlayBloodTithe(Ctx& ctx, int player, Resource resource) {
  GameState& s = ctx.s;
  CN_TRY(SpendOmen(ctx, player, OmenType::Tithe));
  std::vector<int> from(s.players.size(), 0);
  int total = 0;
  for (const auto& other : s.players) {
    if (other.id == player) continue;
    const int n = other.hand[resource];
    if (n > 0) {
      (void)Transfer(ctx, other.id, player, One(resource, n));
      from[other.id] = n;
      total += n;
    }
  }
  Json e = Ev("TitheTaken");
  e.Set("player", player);
  e.Set("resource", Name(resource));
  e.Set("total", total);
  e.Set("from", IntArray(from));
  ctx.ev.push_back(std::move(e));
  return {};
}

// ------------------------------------------------------------------ trade

Err ValidateTerms(const PartialCounts& give, const PartialCounts& want, Counts& g, Counts& w) {
  CN_CHECK(ValidCounts(give) && ValidCounts(want), "INVALID", "Invalid trade terms");
  g = give.ToCounts();
  w = want.ToCounts();
  CN_CHECK(g.Total() > 0 && w.Total() > 0, "INVALID", "A trade needs cards on both sides");
  for (Resource r : kResources)
    CN_CHECK(g[r] == 0 || w[r] == 0, "INVALID", "You cannot give and ask for the same resource");
  return {};
}

Err ProposeTrade(Ctx& ctx, const Action& a) {
  GameState& s = ctx.s;
  const int player = a.player;
  CN_TRY(RequireCurrent(ctx, player));
  CN_TRY(RequirePhase(ctx, {PhaseKind::Main}));
  Counts g, w;
  CN_TRY(ValidateTerms(a.give, a.want, g, w));
  CN_CHECK(HasAtLeast(s.players[player].hand, g), "CANNOT_AFFORD", "You do not hold the cards you offer");
  const int n = static_cast<int>(s.players.size());
  std::vector<int> everyone;
  for (int k = 0; k < n - 1; k++) everyone.push_back((player + 1 + k) % n);
  std::vector<int> targets;
  if (!a.to) {
    targets = everyone;
  } else {
    const std::vector<int>& to = *a.to;
    CN_CHECK(!to.empty(), "INVALID", "Choose someone to trade with");
    bool ok = std::all_of(to.begin(), to.end(), [&](int t) { return Contains(everyone, t); });
    ok = ok && std::set<int>(to.begin(), to.end()).size() == to.size();
    CN_CHECK(ok, "INVALID", "Invalid trade partner");
    for (int t : everyone)
      if (Contains(to, t)) targets.push_back(t);
  }
  TradeOffer offer;
  offer.id = s.nextTradeId++;
  offer.proposer = player;
  offer.targets = targets;
  offer.give = g;
  offer.want = w;
  s.offersThisTurn++;
  s.phase = Phase::Simple(PhaseKind::Trade);
  s.phase.offer = offer;
  Json e = Ev("TradeProposed");
  e.Set("offer", OfferJson(offer));
  ctx.ev.push_back(std::move(e));
  return {};
}

Err RespondTrade(Ctx& ctx, const Action& a) {
  GameState& s = ctx.s;
  const int player = a.player;
  CN_TRY(RequirePhase(ctx, {PhaseKind::Trade}));
  TradeOffer& offer = s.phase.offer;
  CN_CHECK(ActiveActor(s) == player, "NOT_YOUR_TURN", "This offer is not addressed to you");

  if (a.response == TradeResponse::Decline) {
    offer.declined.push_back(player);
    Json e = Ev("TradeDeclined");
    e.Set("player", player);
    e.Set("offerId", offer.id);
    ctx.ev.push_back(std::move(e));
    if (std::all_of(offer.targets.begin(), offer.targets.end(), [&](int t) { return Contains(offer.declined, t); })) {
      s.phase = Phase::Simple(PhaseKind::Main);
      Json c = Ev("TradeClosed");
      c.Set("reason", "all-declined");
      ctx.ev.push_back(std::move(c));
    }
    return {};
  }

  if (a.response == TradeResponse::Accept) {
    CN_CHECK(HasAtLeast(s.players[player].hand, offer.want), "CANNOT_AFFORD", "You lack the requested cards");
    CN_CHECK(HasAtLeast(s.players[offer.proposer].hand, offer.give), "CANNOT_AFFORD",
             "The offering player no longer holds those cards");
    const TradeOffer o = offer;
    CN_TRY(Transfer(ctx, o.proposer, player, PartialCounts::From(o.give)));
    CN_TRY(Transfer(ctx, player, o.proposer, PartialCounts::From(o.want)));
    s.stats.trades[o.proposer]++;
    s.stats.trades[player]++;
    s.phase = Phase::Simple(PhaseKind::Main);
    Json e = Ev("TradeCompleted");
    e.Set("proposer", o.proposer);
    e.Set("accepter", player);
    e.Set("gave", CountsJson(o.give));
    e.Set("got", CountsJson(o.want));
    ctx.ev.push_back(std::move(e));
    return {};
  }

  Counts g, w;
  CN_TRY(ValidateTerms(a.hasGive ? a.give : PartialCounts{}, a.hasWant ? a.want : PartialCounts{}, g, w));
  CN_CHECK(HasAtLeast(s.players[player].hand, g), "CANNOT_AFFORD", "You do not hold the cards you offer");
  TradeOffer counter;
  counter.id = s.nextTradeId++;
  counter.proposer = player;
  counter.targets = {offer.proposer};
  counter.give = g;
  counter.want = w;
  counter.counterOf = offer.id;
  s.phase = Phase::Simple(PhaseKind::Trade);
  s.phase.offer = counter;
  Json e = Ev("TradeCountered");
  e.Set("player", player);
  e.Set("offer", OfferJson(counter));
  ctx.ev.push_back(std::move(e));
  return {};
}

Err CancelTrade(Ctx& ctx, int player) {
  CN_TRY(RequireCurrent(ctx, player));
  CN_TRY(RequirePhase(ctx, {PhaseKind::Trade}));
  ctx.s.phase = Phase::Simple(PhaseKind::Main);
  Json e = Ev("TradeClosed");
  e.Set("reason", "cancelled");
  ctx.ev.push_back(std::move(e));
  return {};
}

Err BankTrade(Ctx& ctx, int player, Resource give, Resource receive, int count) {
  GameState& s = ctx.s;
  CN_TRY(RequireCurrent(ctx, player));
  CN_TRY(RequirePhase(ctx, {PhaseKind::Main}));
  CN_CHECK(give != receive, "INVALID", "Pick a different resource to receive");
  CN_CHECK(count >= 1, "INVALID", "Invalid amount");
  const int rate = BestBankRate(s, player, give);
  const int giveCount = rate * count;
  CN_CHECK(s.players[player].hand[give] >= giveCount, "CANNOT_AFFORD",
           "You need " + std::to_string(giveCount) + " to trade at " + std::to_string(rate) + ":1");
  CN_CHECK(s.bank[receive] >= count, "BANK_EMPTY", "The bank has run dry of that resource");
  PlayerState& p = s.players[player];
  p.hand[give] -= giveCount;
  s.bank[give] += giveCount;
  Grant(ctx, player, One(receive, count), false);
  s.stats.bankTrades[player]++;
  Json e = Ev("BankTraded");
  e.Set("player", player);
  e.Set("give", Name(give));
  e.Set("giveCount", giveCount);
  e.Set("receive", Name(receive));
  e.Set("receiveCount", count);
  e.Set("rate", rate);
  ctx.ev.push_back(std::move(e));
  return {};
}

// ------------------------------------------------------------------ turn flow

Err RollDice(Ctx& ctx, int player) {
  GameState& s = ctx.s;
  CN_TRY(RequireCurrent(ctx, player));
  CN_TRY(RequirePhase(ctx, {PhaseKind::Roll}));
  const int d1 = ctx.rng.Die();
  const int d2 = ctx.rng.Die();
  const int total = d1 + d2;
  s.dice = std::array<int, 2>{d1, d2};
  s.hasRolled = true;
  s.stats.rolls[total]++;
  Json e = Ev("DiceRolled");
  e.Set("player", player);
  e.Set("dice", Json::Array().Push(d1).Push(d2));
  e.Set("total", total);
  ctx.ev.push_back(std::move(e));
  if (total == 7) {
    BeginSeven(ctx);
  } else {
    Produce(ctx, total);
    s.phase = Phase::Simple(PhaseKind::Main);
  }
  return {};
}

Err EndTurn(Ctx& ctx, int player) {
  GameState& s = ctx.s;
  CN_TRY(RequireCurrent(ctx, player));
  CN_TRY(RequirePhase(ctx, {PhaseKind::Main}));
  Json ended = Ev("TurnEnded");
  ended.Set("player", player);
  ctx.ev.push_back(std::move(ended));
  const int next = (s.currentPlayer + 1) % static_cast<int>(s.players.size());
  if (next == s.firstPlayer) s.round++;
  s.turn++;
  s.currentPlayer = next;
  s.hasRolled = false;
  s.omenPlayedThisTurn = false;
  s.offersThisTurn = 0;
  s.phase = Phase::Simple(PhaseKind::Roll);
  Json e = Ev("TurnStarted");
  e.Set("player", next);
  e.Set("turn", s.turn);
  e.Set("round", s.round);
  ctx.ev.push_back(std::move(e));
  return {};
}

Err AckPassDevice(Ctx& ctx, int player) {
  GameState& s = ctx.s;
  CN_CHECK(s.handoff && *s.handoff == player, "INVALID", "No hand-off is pending for you");
  s.viewer = player;
  s.handoff.reset();
  Json e = Ev("DevicePassed");
  e.Set("player", player);
  ctx.ev.push_back(std::move(e));
  return {};
}

Err Dispatch(Ctx& ctx, const Action& a) {
  switch (a.type) {
    case ActionType::RollDice: return RollDice(ctx, a.player);
    case ActionType::PlaceSetupOutpost: return PlaceSetupOutpost(ctx, a.player, a.vertex);
    case ActionType::PlaceSetupCauseway: return PlaceSetupCauseway(ctx, a.player, a.edge);
    case ActionType::Discard: return DiscardCards(ctx, a.player, a.cards);
    case ActionType::MoveWraith: return MoveWraith(ctx, a.player, a.hex);
    case ActionType::StealFrom: return StealFrom(ctx, a.player, a.victim);
    case ActionType::BuildCauseway: return BuildCauseway(ctx, a.player, a.edge);
    case ActionType::BuildOutpost: return BuildOutpost(ctx, a.player, a.vertex);
    case ActionType::BuildCitadel: return BuildCitadel(ctx, a.player, a.vertex);
    case ActionType::BuyOmen: return BuyOmen(ctx, a.player);
    case ActionType::PlayWarden: return PlayWarden(ctx, a.player);
    case ActionType::PlayDecree: return PlayDecree(ctx, a.player);
    case ActionType::PlayHarvestPact: return PlayHarvestPact(ctx, a.player, a.resources);
    case ActionType::PlayBloodTithe: return PlayBloodTithe(ctx, a.player, a.resource);
    case ActionType::ProposeTrade: return ProposeTrade(ctx, a);
    case ActionType::RespondTrade: return RespondTrade(ctx, a);
    case ActionType::CancelTrade: return CancelTrade(ctx, a.player);
    case ActionType::BankTrade: return BankTrade(ctx, a.player, a.giveRes, a.receiveRes, a.count.value_or(1));
    case ActionType::EndTurn: return EndTurn(ctx, a.player);
    case ActionType::AckPassDevice: return AckPassDevice(ctx, a.player);
    case ActionType::PlayManUp: return PlayManUp(ctx, a.player, a.target);
    case ActionType::OpenChest: return OpenChest(ctx, a.player);
    case ActionType::Fire: return FireShot(ctx, a.player);
    case ActionType::Strike: return Strike(ctx, a.player, a.victim, a.weapon, a.parried.value_or(false));
    case ActionType::YieldDuel: return YieldDuel(ctx, a.player);
  }
  return Fail("INVALID", "Unknown action");
}

void UpdateHandoff(GameState& s) {
  if (s.phase.kind == PhaseKind::Ended || !PrivacyEnabled(s)) {
    s.handoff.reset();
    return;
  }
  const int actor = ActiveActor(s);
  if (s.players[actor].kind == SeatKind::Human && (!s.viewer || actor != *s.viewer)) {
    s.handoff = actor;
  } else {
    s.handoff.reset();
  }
}

// ------------------------------------------------------------------ legal actions

void OmenActions(const GameState& s, int p, std::vector<Action>& out) {
  if (s.omenPlayedThisTurn) return;
  bool has[6] = {};
  for (const auto& o : PlayableOmens(s, p)) has[static_cast<int>(o.type)] = true;
  if (has[static_cast<int>(OmenType::Warden)]) out.push_back(Action::Make(ActionType::PlayWarden, p));
  if (has[static_cast<int>(OmenType::Decree)] && s.players[p].supply.causeways > 0 &&
      !LegalCausewaySpots(s, p).empty()) {
    out.push_back(Action::Make(ActionType::PlayDecree, p));
  }
  if (has[static_cast<int>(OmenType::Harvest)]) {
    const int bankTotal = s.bank.Total();
    if (bankTotal >= 2) {
      for (Resource a : kResources) {
        for (Resource b : kResources) {
          if (Name(b) < Name(a)) continue;  // string order, as in TypeScript
          const int need = a == b ? 2 : 1;
          if (s.bank[a] >= need && s.bank[b] >= 1) {
            Action act = Action::Make(ActionType::PlayHarvestPact, p);
            act.resources = {a, b};
            out.push_back(act);
          }
        }
      }
    } else if (bankTotal == 1) {
      for (Resource r : kResources) {
        if (s.bank[r] > 0) {
          Action act = Action::Make(ActionType::PlayHarvestPact, p);
          act.resources = {r};
          out.push_back(act);
          break;
        }
      }
    }
  }
  if (has[static_cast<int>(OmenType::Tithe)]) {
    for (Resource r : kResources) {
      Action act = Action::Make(ActionType::PlayBloodTithe, p);
      act.resource = r;
      out.push_back(act);
    }
  }
}

}  // namespace

// ================================================================== public API

std::optional<std::string> ValidateConfig(const GameConfig& config) {
  const int n = static_cast<int>(config.seats.size());
  if (n < kMinPlayers || n > kMaxPlayers) return std::string("Hexfall needs 3 or 4 players");
  if (config.targetVp < kMinTarget || config.targetVp > kMaxTarget) {
    return "Target must be between " + std::to_string(kMinTarget) + " and " + std::to_string(kMaxTarget);
  }
  std::set<int> colors, sigils;
  for (const auto& s : config.seats) {
    colors.insert(static_cast<int>(s.color));
    sigils.insert(static_cast<int>(s.sigil));
  }
  if (static_cast<int>(colors.size()) != n) return std::string("Colors must be unique");
  if (static_cast<int>(sigils.size()) != n) return std::string("Sigils must be unique");
  for (const auto& s : config.seats) {
    if (s.name.find_first_not_of(" \t\n\r\f\v") == std::string::npos) return std::string("Every seat needs a name");
  }
  if (config.firstPlayer && *config.firstPlayer != kRollOff && (*config.firstPlayer < 0 || *config.firstPlayer >= n)) {
    return std::string("Invalid first player");
  }
  return std::nullopt;
}

namespace {

std::string Trim(const std::string& s) {
  const char* ws = " \t\n\r\f\v";
  const size_t a = s.find_first_not_of(ws);
  if (a == std::string::npos) return "";
  const size_t b = s.find_last_not_of(ws);
  return s.substr(a, b - a + 1);
}

std::vector<OmenType> BuildOmenDeck(Rng& rng, bool pvp) {
  std::vector<OmenType> deck;
  for (OmenType t : kOmenTypes)
    for (int i = 0; i < OmenDeckCount(t); i++) deck.push_back(t);
  if (pvp)
    for (int i = 0; i < kManupCards; i++) deck.push_back(OmenType::Manup);
  return rng.Shuffle(deck);
}

int RollOff(Rng& rng, int n, std::vector<std::vector<std::array<int, 3>>>& rounds) {
  std::vector<int> pool;
  for (int i = 0; i < n; i++) pool.push_back(i);
  for (;;) {
    std::vector<std::array<int, 3>> round;
    for (int p : pool) {
      const int a = rng.Die();
      const int b = rng.Die();
      round.push_back({p, a, b});
    }
    rounds.push_back(round);
    int best = 0;
    for (const auto& r : round) best = std::max(best, r[1] + r[2]);
    pool.clear();
    for (const auto& r : round)
      if (r[1] + r[2] == best) pool.push_back(r[0]);
    if (pool.size() == 1) return pool[0];
  }
}

}  // namespace

GameState CreateGame(const GameConfig& config) {
  GameState s;
  s.board = GenerateBoard(config.seed, config.layout);
  Rng rng = Rng::FromSeed(config.seed + ":game");
  const int n = static_cast<int>(config.seats.size());

  int firstPlayer = 0;
  if (config.firstPlayer && *config.firstPlayer != kRollOff) {
    firstPlayer = *config.firstPlayer;
  } else {
    firstPlayer = RollOff(rng, n, s.rollOff);
  }

  for (int i = 0; i < n; i++) {
    const SeatConfig& seat = config.seats[i];
    PlayerState p;
    p.id = i;
    p.name = Trim(seat.name);
    p.color = seat.color;
    p.sigil = seat.sigil;
    p.kind = seat.kind;
    if (seat.kind == SeatKind::Bot) p.bot = seat.bot.value_or(BotLevel::Warlord);
    s.players.push_back(p);
  }

  for (int k = 0; k < n; k++) s.setupOrder.push_back((firstPlayer + k) % n);
  for (int k = n - 1; k >= 0; k--) s.setupOrder.push_back((firstPlayer + k) % n);
  s.omenDeck = BuildOmenDeck(rng, config.pvp.value_or(false));
  for (const auto& h : s.board.hexes)
    if (h.terrain == Terrain::Waste) {
      s.wraithHex = h.id;
      break;
    }

  s.config = config;
  if (!s.config.firstPlayer) s.config.firstPlayer = kRollOff;
  s.rng = rng.state;
  s.bank = Counts::Full(kBankStart);
  const Topology& t = GetTopology();
  s.buildings.Resize(t.VertexCount());
  s.causeways.Resize(t.EdgeCount());
  s.phase = Phase::Simple(PhaseKind::Setup);
  s.currentPlayer = s.setupOrder[0];
  s.firstPlayer = firstPlayer;
  s.longestLengths.assign(n, 0);
  s.stats.gained.assign(n, Counts{});
  s.stats.trades.assign(n, 0);
  s.stats.bankTrades.assign(n, 0);
  s.stats.stolen.assign(n, 0);
  s.stats.discarded.assign(n, 0);
  s.stats.omensBought.assign(n, 0);
  if (config.arms.value_or(false)) {
    ArmsState a;
    a.chest.assign(n, -1);
    a.starts.assign(n, {});
    a.armed.assign(n, false);
    a.bullets.assign(n, kBullets);
    a.health.assign(n, kMaxHealth);
    a.owed.assign(n, std::vector<int>(n, 0));
    a.kills.assign(n, 0);
    s.arms = a;
  }

  if (PrivacyEnabled(s)) {
    const int actor = ActiveActor(s);
    if (s.players[actor].kind == SeatKind::Human) s.handoff = actor;
  } else {
    for (const auto& p : s.players)
      if (p.kind == SeatKind::Human) {
        s.viewer = p.id;
        break;
      }
  }
  return s;
}

static ActionOutcome ReduceAction(const GameState& state, const Action& action, bool legacyReplay) {
  ActionOutcome out;
  auto fail = [&](const char* code, std::string msg) {
    out.ok = false;
    out.error = {code, std::move(msg)};
    return out;
  };
  const int n = static_cast<int>(state.players.size());
  if (action.player < 0 || action.player >= n) return fail("INVALID", "Unknown player");
  if (state.phase.kind == PhaseKind::Ended) return fail("GAME_OVER", "The game is over");
  if (state.handoff) {
    const bool allowed = (action.type == ActionType::AckPassDevice && action.player == *state.handoff) ||
                         (action.type == ActionType::CancelTrade && action.player == state.currentPlayer);
    if (!allowed) return fail("AWAITING_HANDOFF", "Pass the device to " + state.players[*state.handoff].name);
  } else if (action.type == ActionType::AckPassDevice) {
    return fail("INVALID", "No hand-off is pending");
  }

  out.state = state;
  GameState& s = out.state;
  Ctx ctx{s, out.events, Rng(s.rng), legacyReplay};
  if (Err e = Dispatch(ctx, action)) {
    out = ActionOutcome{};
    out.ok = false;
    out.error = *e;
    return out;
  }
  SettleDebts(ctx);
  s.rng = ctx.rng.state;
  s.actionCount++;
  if (action.type != ActionType::AckPassDevice) {
    CheckVictory(ctx);
    UpdateHandoff(s);
  }
  out.ok = true;
  return out;
}

ActionOutcome ApplyAction(const GameState& state, const Action& action) { return ReduceAction(state, action, false); }
ActionOutcome ApplyRecordedAction(const GameState& state, const Action& action) { return ReduceAction(state, action, true); }

bool IsLegal(const GameState& state, const Action& action) { return ApplyAction(state, action).ok; }

PartialCounts ChooseDiscard(const Counts& hand, int count, Rng* rng) {
  Counts left = hand;
  PartialCounts out;
  for (int i = 0; i < count; i++) {
    Resource r = Resource::Wood;
    if (rng) {
      std::vector<Resource> pool;
      for (Resource x : kResources)
        for (int k = 0; k < left[x]; k++) pool.push_back(x);
      r = pool[rng->PickIndex(static_cast<int>(pool.size()))];
    } else {
      r = kResources[0];
      for (int k = 1; k < 5; k++)
        if (left[kResources[k]] > left[r]) r = kResources[k];
    }
    left[r]--;
    out.Add(r, 1);
  }
  return out;
}

std::vector<Action> LegalActions(const GameState& s, Rng* rng) {
  std::vector<Action> out;
  const Phase& ph = s.phase;
  if (ph.kind == PhaseKind::Ended) return out;
  if (s.handoff) {
    out.push_back(Action::Make(ActionType::AckPassDevice, *s.handoff));
    return out;
  }
  const int p = ActiveActor(s);
  const PlayerState& me = s.players[p];
  const Topology& t = GetTopology();
  switch (ph.kind) {
    case PhaseKind::Setup:
      if (!ph.stepCauseway) {
        for (int v : LegalOutpostSpots(s, p)) {
          Action a = Action::Make(ActionType::PlaceSetupOutpost, p);
          a.vertex = t.vertexIds[v];
          out.push_back(a);
        }
      } else {
        for (int e : LegalCausewaySpots(s, p)) {
          Action a = Action::Make(ActionType::PlaceSetupCauseway, p);
          a.edge = t.edgeIds[e];
          out.push_back(a);
        }
      }
      return out;
    case PhaseKind::Roll:
      out.push_back(Action::Make(ActionType::RollDice, p));
      OmenActions(s, p, out);
      return out;
    case PhaseKind::Discard: {
      Action a = Action::Make(ActionType::Discard, p);
      a.cards = ChooseDiscard(me.hand, ph.pending[p], rng);
      out.push_back(a);
      return out;
    }
    case PhaseKind::MoveWraith:
      for (const auto& h : s.board.hexes) {
        if (h.id == s.wraithHex) continue;
        Action a = Action::Make(ActionType::MoveWraith, p);
        a.hex = h.id;
        out.push_back(a);
      }
      return out;
    case PhaseKind::Steal:
      for (int victim : ph.candidates) {
        Action a = Action::Make(ActionType::StealFrom, p);
        a.victim = victim;
        out.push_back(a);
      }
      return out;
    case PhaseKind::Decree:
      for (int e : LegalCausewaySpots(s, p)) {
        Action a = Action::Make(ActionType::BuildCauseway, p);
        a.edge = t.edgeIds[e];
        out.push_back(a);
      }
      return out;
    case PhaseKind::Trade: {
      Action d = Action::Make(ActionType::RespondTrade, p);
      d.response = TradeResponse::Decline;
      out.push_back(d);
      if (HasAtLeast(me.hand, ph.offer.want) && HasAtLeast(s.players[ph.offer.proposer].hand, ph.offer.give)) {
        Action a = Action::Make(ActionType::RespondTrade, p);
        a.response = TradeResponse::Accept;
        out.push_back(a);
      }
      return out;
    }
    case PhaseKind::Duel:
      return out;
    case PhaseKind::Main: {
      out.push_back(Action::Make(ActionType::EndTurn, p));
      if (CanAfford(me.hand, CostKey::Causeway) && me.supply.causeways > 0) {
        for (int e : LegalCausewaySpots(s, p)) {
          Action a = Action::Make(ActionType::BuildCauseway, p);
          a.edge = t.edgeIds[e];
          out.push_back(a);
        }
      }
      if (CanAfford(me.hand, CostKey::Outpost) && me.supply.outposts > 0) {
        for (int v : LegalOutpostSpots(s, p)) {
          Action a = Action::Make(ActionType::BuildOutpost, p);
          a.vertex = t.vertexIds[v];
          out.push_back(a);
        }
      }
      if (CanAfford(me.hand, CostKey::Citadel) && me.supply.citadels > 0) {
        for (int v : LegalCitadelSpots(s, p)) {
          Action a = Action::Make(ActionType::BuildCitadel, p);
          a.vertex = t.vertexIds[v];
          out.push_back(a);
        }
      }
      if (CanAfford(me.hand, CostKey::Omen) && !s.omenDeck.empty()) out.push_back(Action::Make(ActionType::BuyOmen, p));
      for (Resource give : kResources) {
        if (me.hand[give] < BestBankRate(s, p, give)) continue;
        for (Resource receive : kResources) {
          if (receive != give && s.bank[receive] > 0) {
            Action a = Action::Make(ActionType::BankTrade, p);
            a.giveRes = give;
            a.receiveRes = receive;
            out.push_back(a);
          }
        }
      }
      OmenActions(s, p, out);
      return out;
    }
    case PhaseKind::Ended:
      return out;
  }
  return out;
}

// ------------------------------------------------------------------ selectors

int HandTotal(const PlayerState& p) { return p.hand.Total(); }

bool IsDistanceLegal(const GameState& s, int v) {
  if (v < 0 || v >= GetTopology().VertexCount()) return false;
  if (s.buildings.Has(v)) return false;
  for (int n : GetTopology().vertexNeighbors[v])
    if (s.buildings.Has(n)) return false;
  return true;
}

bool TouchesOwnCauseway(const GameState& s, int player, int v) {
  for (int e : GetTopology().vertexEdges[v]) {
    const int* owner = s.causeways.Find(e);
    if (owner && *owner == player) return true;
  }
  return false;
}

std::vector<int> LegalOutpostSpots(const GameState& s, int player) {
  const bool setup = s.phase.kind == PhaseKind::Setup;
  std::vector<int> out;
  for (int v = 0; v < GetTopology().VertexCount(); v++)
    if (IsDistanceLegal(s, v) && (setup || TouchesOwnCauseway(s, player, v))) out.push_back(v);
  return out;
}

namespace {
bool CausewayConnects(const GameState& s, int player, int e) {
  const Topology& t = GetTopology();
  for (int v : t.edgeVertices[e]) {
    const Building* b = s.buildings.Find(v);
    if (b && b->owner == player) return true;
    if (b && b->owner != player) continue;  // cannot extend through an opponent
    for (int x : t.vertexEdges[v]) {
      const int* owner = s.causeways.Find(x);
      if (x != e && owner && *owner == player) return true;
    }
  }
  return false;
}
}  // namespace

std::vector<int> LegalCausewaySpots(const GameState& s, int player) {
  const Topology& t = GetTopology();
  std::vector<int> out;
  if (s.phase.kind == PhaseKind::Setup) {
    const int anchor = s.phase.lastOutpost;
    if (anchor < 0) return out;
    for (int e : t.vertexEdges[anchor])
      if (!s.causeways.Has(e)) out.push_back(e);
    return out;
  }
  for (int e = 0; e < t.EdgeCount(); e++)
    if (!s.causeways.Has(e) && CausewayConnects(s, player, e)) out.push_back(e);
  return out;
}

std::vector<int> LegalCitadelSpots(const GameState& s, int player) {
  std::vector<int> out;
  for (int v : s.buildings.order) {
    const Building& b = *s.buildings.at[v];
    if (b.owner == player && b.kind == BuildingKind::Outpost) out.push_back(v);
  }
  return out;
}

bool CanAfford(const Counts& hand, CostKey cost) { return HasAtLeast(hand, Cost(cost)); }
bool CanAfford(const Counts& hand, const PartialCounts& cost) { return HasAtLeast(hand, cost); }

PartialCounts MissingResources(const Counts& hand, const PartialCounts& cost) {
  PartialCounts out;
  for (Resource r : kResources) {
    const int need = cost.Get(r) - hand[r];
    if (need > 0) out.Set(r, need);
  }
  return out;
}

int BestBankRate(const GameState& s, int player, Resource resource) {
  bool any = false;
  for (const auto& h : s.board.harbors) {
    bool mine = false;
    for (int v : h.vertices) {
      const Building* b = s.buildings.Find(v);
      if (b && b->owner == player) mine = true;
    }
    if (!mine) continue;
    if (h.kind && *h.kind == resource) return 2;
    if (!h.kind) any = true;
  }
  return any ? 3 : 4;
}

std::array<int, 5> BankRates(const GameState& s, int player) {
  std::array<int, 5> out{};
  for (Resource r : kResources) out[static_cast<int>(r)] = BestBankRate(s, player, r);
  return out;
}

int RelicCount(const PlayerState& p) {
  int n = 0;
  for (const auto& o : p.omens) n += o.type == OmenType::Relic;
  return n;
}

VpBreakdown VpBreakdownOf(const GameState& s, int player) {
  VpBreakdown b;
  for (int v : s.buildings.order) {
    const Building& x = *s.buildings.at[v];
    if (x.owner != player) continue;
    if (x.kind == BuildingKind::Outpost) b.outposts++;
    else b.citadels++;
  }
  b.longest = s.longestHolder && *s.longestHolder == player ? kBonusVp : 0;
  b.host = s.hostHolder && *s.hostHolder == player ? kBonusVp : 0;
  b.relics = RelicCount(s.players[player]);
  b.publicTotal = b.outposts + b.citadels * 2 + b.longest + b.host;
  b.total = b.publicTotal + b.relics;
  return b;
}

int VictoryPoints(const GameState& s, int player, bool includeHidden) {
  const VpBreakdown b = VpBreakdownOf(s, player);
  return includeHidden ? b.total : b.publicTotal;
}

std::array<double, 5> ExpectedYield(const GameState& s, int player) {
  const Topology& t = GetTopology();
  std::array<double, 5> out{};
  for (int v : s.buildings.order) {
    const Building& b = *s.buildings.at[v];
    if (b.owner != player) continue;
    for (int h : t.vertexHexes[v]) {
      if (h == s.wraithHex) continue;
      const HexTile& hex = s.board.hexes[h];
      const auto res = TerrainResource(hex.terrain);
      if (!res) continue;
      out[static_cast<int>(*res)] += (Pips(hex.token) / 36.0) * (b.kind == BuildingKind::Citadel ? 2 : 1);
    }
  }
  return out;
}

int HandLimitRisk(const PlayerState& p) {
  const int n = HandTotal(p);
  return n > kHandLimit ? n / 2 : 0;
}

std::vector<int> StealCandidates(const GameState& s, int hex, int except) {
  std::set<int> set;
  for (int v : GetTopology().hexVertices[hex]) {
    const Building* b = s.buildings.Find(v);
    if (b && b->owner != except && HandTotal(s.players[b->owner]) > 0) set.insert(b->owner);
  }
  return std::vector<int>(set.begin(), set.end());
}

std::vector<OwnedOmen> PlayableOmens(const GameState& s, int player) {
  std::vector<OwnedOmen> out;
  for (const auto& o : s.players[player].omens)
    if (o.type != OmenType::Relic && o.boughtTurn < s.turn) out.push_back(o);
  return out;
}

int ActiveActor(const GameState& s) {
  const Phase& ph = s.phase;
  const int n = static_cast<int>(s.players.size());
  if (ph.kind == PhaseKind::Discard) {
    for (int k = 0; k < n; k++) {
      const int p = (s.currentPlayer + k) % n;
      if (ph.pending[p] > 0) return p;
    }
  }
  if (ph.kind == PhaseKind::Trade) {
    for (int t : ph.offer.targets)
      if (!Contains(ph.offer.declined, t)) return t;
  }
  return s.currentPlayer;
}

bool PrivacyEnabled(const GameState& s) {
  if (s.config.privacy) return *s.config.privacy;
  int humans = 0;
  for (const auto& p : s.players) humans += p.kind == SeatKind::Human;
  return humans >= 2;
}

int LongestCausewayLength(const OrderedSlots<int>& causeways, const OrderedSlots<Building>& buildings, int player) {
  const Topology& t = GetTopology();
  std::vector<int> own;
  for (int e : causeways.order)
    if (*causeways.at[e] == player) own.push_back(e);
  if (own.empty()) return 0;
  std::bitset<128> ownSet, used;
  for (int e : own) ownSet.set(e);
  auto blocked = [&](int v) {
    const Building* b = buildings.Find(v);
    return b && b->owner != player;
  };
  int best = 0;
  auto dfs = [&](auto&& self, int v, int len) -> void {
    if (len > best) best = len;
    if (len > 0 && blocked(v)) return;
    for (int e : t.vertexEdges[v]) {
      if (!ownSet.test(e) || used.test(e)) continue;
      const int a = t.edgeVertices[e][0];
      const int b = t.edgeVertices[e][1];
      used.set(e);
      self(self, a == v ? b : a, len + 1);
      used.reset(e);
    }
  };
  std::vector<int> starts;
  std::bitset<128> seen;
  for (int e : own)
    for (int v : t.edgeVertices[e])
      if (!seen.test(v)) {
        seen.set(v);
        starts.push_back(v);
      }
  for (int v : starts) {
    dfs(dfs, v, 0);
    if (best == static_cast<int>(own.size())) break;
  }
  return best;
}

}  // namespace catnight
