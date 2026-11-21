#include "CatnightRules/Bots.h"

#include <algorithm>
#include <cmath>
#include <functional>
#include <limits>
#include <set>

namespace catnight {

namespace {

constexpr double kNegInf = -std::numeric_limits<double>::infinity();

const Topology& Topo() { return GetTopology(); }

/** First item with the strictly highest score (as the TypeScript argmax). */
template <typename T, typename F>
std::optional<T> Argmax(const std::vector<T>& items, F score) {
  std::optional<T> best;
  double bestScore = kNegInf;
  for (const T& it : items) {
    const double sc = score(it);
    if (sc > bestScore) {
      bestScore = sc;
      best = it;
    }
  }
  return best;
}

std::vector<Resource> AllResources() { return std::vector<Resource>(kResources.begin(), kResources.end()); }

int Ri(Resource r) { return static_cast<int>(r); }

enum class Goal { Outpost, Citadel, Causeway, Omen };

CostKey GoalCost(Goal g) {
  switch (g) {
    case Goal::Outpost: return CostKey::Outpost;
    case Goal::Citadel: return CostKey::Citadel;
    case Goal::Causeway: return CostKey::Causeway;
    case Goal::Omen: return CostKey::Omen;
  }
  return CostKey::Omen;
}

struct Persona {
  bool lookahead = false;
  bool cunning = false;
  double acceptMargin = 1;
  int offersPerTurn = 1;
};

constexpr Persona kWarlord{false, false, 1, 1};
constexpr Persona kArchdemon{true, true, 1.15, 2};

Action Act(ActionType t, int p) { return Action::Make(t, p); }

// ------------------------------------------------------------------ evaluate.ts

using Weights = std::array<double, 5>;

Weights Scarcity(const GameState& s) {
  std::array<int, 5> total{};
  for (const auto& h : s.board.hexes) {
    const auto r = TerrainResource(h.terrain);
    if (r) total[Ri(*r)] += Pips(h.token);
  }
  Weights out{};
  for (Resource r : kResources) {
    const int t = total[Ri(r)];
    out[Ri(r)] = t > 0 ? 1 + (12 - std::min(12, t)) / 12.0 : 1.5;
  }
  return out;
}

double VertexValue(const GameState& s, int v, int player, const Weights& sc) {
  const Topology& topo = Topo();
  const auto have = ExpectedYield(s, player);
  double score = 0;
  std::set<int> kinds;
  for (int h : topo.vertexHexes[v]) {
    const HexTile& hex = s.board.hexes[h];
    const auto r = TerrainResource(hex.terrain);
    if (!r) continue;
    const double p = Pips(hex.token) * (h == s.wraithHex ? 0.4 : 1);
    const double hv = have[Ri(*r)];
    const double novelty = hv < 0.05 ? 1.35 : hv < 0.15 ? 1.1 : 0.9;
    score += p * sc[Ri(*r)] * novelty;
    kinds.insert(Ri(*r));
  }
  score += kinds.size() * 1.2;
  const Harbor* harbor = nullptr;
  for (const auto& hb : s.board.harbors)
    if (hb.vertices[0] == v || hb.vertices[1] == v) {
      harbor = &hb;
      break;
    }
  if (harbor) {
    if (!harbor->kind) {
      score += 1.5;
    } else {
      int pipSum = 0;
      for (int h : topo.vertexHexes[v]) {
        const HexTile& hex = s.board.hexes[h];
        const auto r = TerrainResource(hex.terrain);
        pipSum = pipSum + (r && *r == *harbor->kind ? Pips(hex.token) : 0);
      }
      const double prod = have[Ri(*harbor->kind)] * 36 + pipSum;
      score += std::min(4.0, prod * 0.45);
    }
  }
  return score;
}

bool Owns(const GameState& s, int v, int player) {
  const Building* b = s.buildings.Find(v);
  if (b && b->owner == player) return true;
  for (int x : Topo().vertexEdges[v]) {
    const int* o = s.causeways.Find(x);
    if (o && *o == player) return true;
  }
  return false;
}

double EdgeValue(const GameState& s, int e, int player, const Weights& sc) {
  const Topology& topo = Topo();
  const int a = topo.edgeVertices[e][0];
  const int b = topo.edgeVertices[e][1];
  const bool oa = Owns(s, a, player);
  const bool ob = Owns(s, b, player);
  const int far = oa && !ob ? b : ob && !oa ? a : b;
  double best = 0;
  std::set<int> seen = {far};
  std::vector<int> frontier = {far};
  for (int depth = 0; depth < 3; depth++) {
    std::vector<int> next;
    for (int v : frontier) {
      if (!s.buildings.Has(v) && IsDistanceLegal(s, v)) {
        best = std::max(best, VertexValue(s, v, player, sc) * (1 - depth * 0.28));
      }
      const Building* bl = s.buildings.Find(v);
      if (bl && bl->owner != player) continue;
      for (int n : topo.vertexNeighbors[v]) {
        if (!seen.count(n)) {
          seen.insert(n);
          next.push_back(n);
        }
      }
    }
    frontier = next;
  }
  return best;
}

Goal ChooseGoal(const GameState& s, int player) {
  const PlayerState& me = s.players[player];
  struct Opt {
    Goal g;
    int missing;
    double prio;
  };
  std::vector<Opt> options;
  const int outSpots = me.supply.outposts > 0 ? static_cast<int>(LegalOutpostSpots(s, player).size()) : 0;
  auto missing = [&](CostKey k) { return MissingResources(me.hand, Cost(k)).Total(); };
  if (outSpots > 0) options.push_back({Goal::Outpost, missing(CostKey::Outpost), 0});
  if (me.supply.citadels > 0 && !LegalCitadelSpots(s, player).empty()) {
    options.push_back({Goal::Citadel, missing(CostKey::Citadel), 0.5});
  }
  if (outSpots == 0 && me.supply.causeways > 0 && !LegalCausewaySpots(s, player).empty()) {
    options.push_back({Goal::Causeway, missing(CostKey::Causeway), 0.2});
  }
  if (!s.omenDeck.empty()) options.push_back({Goal::Omen, missing(CostKey::Omen), 2.5});
  if (options.empty()) return Goal::Omen;
  std::stable_sort(options.begin(), options.end(),
                   [](const Opt& a, const Opt& b) { return a.missing + a.prio < b.missing + b.prio; });
  return options[0].g;
}

Weights ResourceWeights(const GameState& s, int player, Goal goal) {
  const PlayerState& me = s.players[player];
  const PartialCounts& cost = Cost(GoalCost(goal));
  const Weights sc = Scarcity(s);
  Weights w{};
  for (Resource r : kResources) {
    const int need = cost.Get(r);
    const int missing = std::max(0, need - me.hand[r]);
    w[Ri(r)] = 0.6 * sc[Ri(r)] + (missing > 0 ? 1.6 : need > 0 ? 0.9 : 0) - std::max(0, me.hand[r] - need - 1) * 0.25;
  }
  return w;
}

double ValueOf(const Counts& c, const Weights& w) {
  double v = 0;
  for (Resource r : kResources) v += c[r] * w[Ri(r)];
  return v;
}

struct BankMove {
  Resource give;
  Resource receive;
};

std::optional<BankMove> BankTradeToward(const GameState& s, int player, const PartialCounts& c) {
  const PlayerState& me = s.players[player];
  const PartialCounts missing = MissingResources(me.hand, c);
  std::vector<Resource> need;
  for (Resource r : kResources)
    if (missing.Get(r) > 0 && s.bank[r] > 0) need.push_back(r);
  if (need.empty()) return std::nullopt;
  const auto rates = BankRates(s, player);
  int coverable = 0;
  for (Resource r : kResources) {
    const int surplus = me.hand[r] - c.Get(r);
    if (surplus > 0) coverable += surplus / rates[Ri(r)];
  }
  if (coverable < missing.Total()) return std::nullopt;
  std::optional<Resource> bestGive;
  int bestSurplus = -1;
  for (Resource r : kResources) {
    const int surplus = me.hand[r] - c.Get(r);
    if (surplus >= rates[Ri(r)] && surplus - rates[Ri(r)] > bestSurplus) {
      bestSurplus = surplus - rates[Ri(r)];
      bestGive = r;
    }
  }
  if (!bestGive) return std::nullopt;
  return BankMove{*bestGive, need[0]};
}

std::optional<int> Leader(const GameState& s, int except) {
  std::optional<int> best;
  double bestVp = -1;
  for (const auto& p : s.players) {
    if (p.id == except) continue;
    const double vp = VictoryPoints(s, p.id, false) + p.omens.size() * 0.2 + HandTotal(p) * 0.05;
    if (vp > bestVp) {
      bestVp = vp;
      best = p.id;
    }
  }
  return best;
}

double WraithValue(const GameState& s, int hex, int player, std::optional<int> punish) {
  const HexTile& h = s.board.hexes[hex];
  const int p = Pips(h.token);
  double score = 0;
  for (int v : Topo().hexVertices[hex]) {
    const Building* b = s.buildings.Find(v);
    if (!b) continue;
    const int weight = b->kind == BuildingKind::Citadel ? 2 : 1;
    if (b->owner == player) {
      score -= 6 * weight * std::max(1, p);
    } else {
      const int vp = VictoryPoints(s, b->owner, false);
      score += weight * p * (1 + vp / 6.0) * (punish && b->owner == *punish ? 1.6 : 1);
      if (HandTotal(s.players[b->owner]) > 0) score += 1.5;
    }
  }
  return score;
}

int LongestGain(const GameState& s, int e, int player) {
  const int before = LongestCausewayLength(s.causeways, s.buildings, player);
  OrderedSlots<int> with = s.causeways;
  with.Put(e, player);
  return LongestCausewayLength(with, s.buildings, player) - before;
}

// ------------------------------------------------------------------ warlord.ts

double EstimateHeld(const GameState& s, int player, Resource r) {
  double est = 0;
  for (const auto& o : s.players) {
    if (o.id == player) continue;
    const auto y = ExpectedYield(s, o.id);
    double tot = 0;
    for (Resource x : kResources) tot = tot + y[Ri(x)];
    const double share = tot > 0 ? y[Ri(r)] / tot : 0.2;
    est += HandTotal(o) * share;
  }
  return est;
}

int OthersCards(const GameState& s, int p) {
  int n = 0;
  for (const auto& o : s.players)
    if (o.id != p) n += HandTotal(o);
  return n;
}

PartialCounts SmartDiscard(const GameState& s, int p, int count) {
  const Goal goal = ChooseGoal(s, p);
  const Weights w = ResourceWeights(s, p, goal);
  Counts hand = s.players[p].hand;
  PartialCounts out;
  const PartialCounts& cost = Cost(GoalCost(goal));
  for (int i = 0; i < count; i++) {
    std::vector<Resource> held;
    for (Resource x : kResources)
      if (hand[x] > 0) held.push_back(x);
    const Resource r = *Argmax(held, [&](Resource x) { return (hand[x] - cost.Get(x)) * 2 - w[Ri(x)]; });
    hand[r]--;
    out.Add(r, 1);
  }
  return out;
}

std::optional<int> BestSetupCauseway(const GameState& s, int p) {
  const Weights sc = Scarcity(s);
  return Argmax(LegalCausewaySpots(s, p), [&](int e) { return EdgeValue(s, e, p, sc); });
}

bool WraithHurtsMe(const GameState& s, int p) {
  const HexTile& hex = s.board.hexes[s.wraithHex];
  if (!hex.token) return false;
  for (int v : Topo().hexVertices[s.wraithHex]) {
    const Building* b = s.buildings.Find(v);
    if (b && b->owner == p) return true;
  }
  return false;
}

bool HostClaimable(const GameState& s, int p) {
  const int mine = s.players[p].playedWardens + 1;
  int others = std::numeric_limits<int>::min();
  for (const auto& o : s.players)
    if (o.id != p) others = std::max(others, o.playedWardens);
  return mine >= 3 && mine > others && !(s.hostHolder && *s.hostHolder == p);
}

std::optional<Action> OmenPlay(const GameState& s, int p, const Persona& persona, bool preRoll) {
  if (s.omenPlayedThisTurn) return std::nullopt;
  bool has[6] = {};
  bool any = false;
  for (const auto& o : PlayableOmens(s, p)) {
    has[static_cast<int>(o.type)] = true;
    any = true;
  }
  if (!any) return std::nullopt;
  auto holds = [&](OmenType t) { return has[static_cast<int>(t)]; };
  if (holds(OmenType::Warden) && (WraithHurtsMe(s, p) || HostClaimable(s, p))) return Act(ActionType::PlayWarden, p);
  if (preRoll) return std::nullopt;
  const PlayerState& me = s.players[p];
  const Goal goal = ChooseGoal(s, p);
  const PartialCounts missing = MissingResources(me.hand, Cost(GoalCost(goal)));
  const int missCount = missing.Total();
  if (holds(OmenType::Harvest) && missCount > 0 && missCount <= 2 && s.bank.Total() >= 2) {
    std::vector<Resource> picks;
    for (Resource r : kResources)
      for (int i = 0; i < missing.Get(r); i++) picks.push_back(r);
    const Weights w = ResourceWeights(s, p, goal);
    while (picks.size() < 2) picks.push_back(*Argmax(AllResources(), [&](Resource r) { return w[Ri(r)]; }));
    Counts take;
    for (Resource r : picks) take[r]++;
    bool ok = true;
    for (Resource r : kResources) ok = ok && s.bank[r] >= take[r];
    if (ok) {
      Action a = Act(ActionType::PlayHarvestPact, p);
      a.resources = {picks[0], picks[1]};
      return a;
    }
  }
  if (holds(OmenType::Tithe)) {
    const Weights w = ResourceWeights(s, p, goal);
    auto estimate = [&](Resource r) { return persona.cunning ? EstimateHeld(s, p, r) : 0.2 * OthersCards(s, p); };
    const auto best = Argmax(AllResources(), [&](Resource r) { return estimate(r) * w[Ri(r)]; });
    if (best) {
      const double est = estimate(*best);
      if (est >= 2.5) {
        Action a = Act(ActionType::PlayBloodTithe, p);
        a.resource = *best;
        return a;
      }
    }
  }
  if (holds(OmenType::Decree) && me.supply.causeways > 0 && !LegalCausewaySpots(s, p).empty() &&
      (goal == Goal::Causeway || LegalOutpostSpots(s, p).empty())) {
    return Act(ActionType::PlayDecree, p);
  }
  if (holds(OmenType::Warden) && persona.cunning && s.hasRolled) {
    const auto lead = Leader(s, p);
    if (lead && VictoryPoints(s, *lead, false) >= s.config.targetVp - 3) return Act(ActionType::PlayWarden, p);
  }
  return std::nullopt;
}

double OutpostScore(const GameState& s, int v, int p, const Persona& persona, const Weights& sc) {
  double score = VertexValue(s, v, p, sc);
  if (persona.cunning) {
    int touching = 0;
    for (int e : Topo().vertexEdges[v]) {
      const int* o = s.causeways.Find(e);
      if (o && *o != p && (*o < static_cast<int>(s.longestLengths.size()) ? s.longestLengths[*o] : 0) >= 4) touching++;
    }
    if (touching >= 2) score += 6;
  }
  return score;
}

Action MainTurn(const GameState& s, int p, Rng& rng, const Persona& persona) {
  const Topology& topo = Topo();
  const PlayerState& me = s.players[p];
  const Weights sc = Scarcity(s);
  if (auto omen = OmenPlay(s, p, persona, false)) return *omen;

  if (CanAfford(me.hand, CostKey::Citadel) && me.supply.citadels > 0) {
    const auto v = Argmax(LegalCitadelSpots(s, p), [&](int x) {
      int n = 0;
      for (int h : topo.vertexHexes[x]) n += Pips(s.board.hexes[h].token);
      return static_cast<double>(n);
    });
    if (v) {
      Action a = Act(ActionType::BuildCitadel, p);
      a.vertex = topo.vertexIds[*v];
      return a;
    }
  }
  const std::vector<int> outSpots = me.supply.outposts > 0 ? LegalOutpostSpots(s, p) : std::vector<int>{};
  if (CanAfford(me.hand, CostKey::Outpost) && !outSpots.empty()) {
    const int v = *Argmax(outSpots, [&](int x) { return OutpostScore(s, x, p, persona, sc); });
    Action a = Act(ActionType::BuildOutpost, p);
    a.vertex = topo.vertexIds[v];
    return a;
  }
  if (CanAfford(me.hand, CostKey::Causeway) && me.supply.causeways > 0) {
    const std::vector<int> edges = LegalCausewaySpots(s, p);
    if (!edges.empty()) {
      const bool needRoad = outSpots.empty();
      const bool surplus = me.hand[Resource::Wood] >= (CanAfford(me.hand, CostKey::Outpost) ? 2 : 1) + 1 &&
                           me.hand[Resource::Clay] >= 2 && !outSpots.empty();
      const int myLength = p < static_cast<int>(s.longestLengths.size()) ? s.longestLengths[p] : 0;
      const bool chaseLongest =
          !(s.longestHolder && *s.longestHolder == p) && myLength >= 3 && me.supply.causeways > 2;
      if (needRoad || surplus || chaseLongest) {
        const int e = *Argmax(edges, [&](int x) {
          return EdgeValue(s, x, p, sc) + LongestGain(s, x, p) * (chaseLongest ? 4 : 1.5);
        });
        if (needRoad || LongestGain(s, e, p) > 0 || EdgeValue(s, e, p, sc) > 6) {
          Action a = Act(ActionType::BuildCauseway, p);
          a.edge = topo.edgeIds[e];
          return a;
        }
      }
    }
  }
  const Goal goal = ChooseGoal(s, p);
  const int vp = VictoryPoints(s, p, true);
  const bool nearWin = vp >= s.config.targetVp - 2;
  if (CanAfford(me.hand, CostKey::Omen) && !s.omenDeck.empty()) {
    const bool shouldBuy = goal == Goal::Omen || HandTotal(me) > kHandLimit || (persona.cunning && nearWin) ||
                           (!CanAfford(me.hand, CostKey::Outpost) && !CanAfford(me.hand, CostKey::Citadel) &&
                            rng.Next() < 0.25);
    if (shouldBuy) return Act(ActionType::BuyOmen, p);
  }
  if (const auto bank = BankTradeToward(s, p, Cost(GoalCost(goal)))) {
    Action a = Act(ActionType::BankTrade, p);
    a.giveRes = bank->give;
    a.receiveRes = bank->receive;
    return a;
  }

  if (HandTotal(me) > kHandLimit) {
    const auto rates = BankRates(s, p);
    const Weights w = ResourceWeights(s, p, goal);
    const PartialCounts& cost = Cost(GoalCost(goal));
    std::vector<Resource> gives;
    for (Resource r : kResources)
      if (me.hand[r] - cost.Get(r) >= rates[Ri(r)] && (persona.cunning || rates[Ri(r)] <= 3)) gives.push_back(r);
    const auto give = Argmax(gives, [&](Resource r) { return me.hand[r] - rates[Ri(r)] * 0.5; });
    std::vector<Resource> receives;
    for (Resource r : kResources)
      if ((!give || r != *give) && s.bank[r] > 0) receives.push_back(r);
    const auto receive = Argmax(receives, [&](Resource r) { return w[Ri(r)]; });
    if (give && receive) {
      Action a = Act(ActionType::BankTrade, p);
      a.giveRes = *give;
      a.receiveRes = *receive;
      return a;
    }
  }

  if (s.offersThisTurn < persona.offersPerTurn) {
    const PartialCounts missing = MissingResources(me.hand, Cost(GoalCost(goal)));
    std::optional<Resource> want;
    for (Resource r : kResources)
      if (missing.Get(r) > 0) {
        want = r;
        break;
      }
    const PartialCounts& cost = Cost(GoalCost(goal));
    std::vector<Resource> gives;
    for (Resource r : kResources)
      if ((!want || r != *want) && me.hand[r] - cost.Get(r) >= 1) gives.push_back(r);
    const auto give = Argmax(gives, [&](Resource r) { return static_cast<double>(me.hand[r] - cost.Get(r)); });
    if (want && give && missing.Total() <= 2) {
      Action a = Act(ActionType::ProposeTrade, p);
      a.give.Set(*give, 1);
      a.want.Set(*want, 1);
      a.to = std::nullopt;
      return a;
    }
  }
  return Act(ActionType::EndTurn, p);
}

Action Respond(const GameState& s, int p, const Persona& persona) {
  Action decline = Act(ActionType::RespondTrade, p);
  decline.response = TradeResponse::Decline;
  if (s.phase.kind != PhaseKind::Trade) return decline;
  const TradeOffer& offer = s.phase.offer;
  const PlayerState& me = s.players[p];
  if (!HasAtLeast(me.hand, offer.want)) return decline;
  if (!HasAtLeast(s.players[offer.proposer].hand, offer.give)) return decline;
  if (VictoryPoints(s, offer.proposer, false) >= s.config.targetVp - 2) return decline;
  const Goal goal = ChooseGoal(s, p);
  const Weights w = ResourceWeights(s, p, goal);
  const double gain = ValueOf(offer.give, w);
  const double loss = ValueOf(offer.want, w);
  Counts after = me.hand;
  for (Resource r : kResources) after[r] += offer.give[r] - offer.want[r];
  const bool breaksBuild = CanAfford(me.hand, GoalCost(goal)) && !CanAfford(after, GoalCost(goal));
  if (!breaksBuild && gain >= loss * persona.acceptMargin) {
    Action a = Act(ActionType::RespondTrade, p);
    a.response = TradeResponse::Accept;
    return a;
  }
  return decline;
}

// ------------------------------------------------------------------ archdemon.ts

int LookaheadSetup(const GameState& s, int p) {
  const Weights sc = Scarcity(s);
  struct Ranked {
    int v;
    double score;
  };
  std::vector<Ranked> ranked;
  for (int v : LegalOutpostSpots(s, p)) ranked.push_back({v, VertexValue(s, v, p, sc)});
  std::stable_sort(ranked.begin(), ranked.end(), [](const Ranked& a, const Ranked& b) { return a.score > b.score; });
  if (ranked.size() > 8) ranked.resize(8);
  if (s.phase.kind != PhaseKind::Setup || s.phase.index >= static_cast<int>(s.players.size())) return ranked[0].v;

  int myNext = -1;
  for (int i = s.phase.index + 1; i < static_cast<int>(s.setupOrder.size()); i++)
    if (s.setupOrder[i] == p) {
      myNext = i;
      break;
    }
  const Topology& topo = Topo();
  auto step = [](const GameState& st, const Action& a) {
    ActionOutcome r = ApplyAction(st, a);
    return std::move(r.state);
  };
  Ranked best = ranked[0];
  double bestTotal = kNegInf;
  for (const Ranked& cand : ranked) {
    Action place = Act(ActionType::PlaceSetupOutpost, p);
    place.vertex = topo.vertexIds[cand.v];
    GameState sim = step(s, place);
    Action road = Act(ActionType::PlaceSetupCauseway, p);
    road.edge = topo.edgeIds[LegalCausewaySpots(sim, p)[0]];
    sim = step(sim, road);
    while (sim.phase.kind == PhaseKind::Setup && sim.phase.index < myNext) {
      const int q = ActiveActor(sim);
      if (sim.handoff) {
        sim = step(sim, Act(ActionType::AckPassDevice, *sim.handoff));
        continue;
      }
      if (!sim.phase.stepCauseway) {
        const std::vector<int> options = LegalOutpostSpots(sim, q);
        int pick = options[0];
        double pickScore = kNegInf;
        for (int v : options) {
          const double sc2 = VertexValue(sim, v, q, sc);
          if (sc2 > pickScore) {
            pickScore = sc2;
            pick = v;
          }
        }
        Action a = Act(ActionType::PlaceSetupOutpost, q);
        a.vertex = topo.vertexIds[pick];
        sim = step(sim, a);
      } else {
        Action a = Act(ActionType::PlaceSetupCauseway, q);
        a.edge = topo.edgeIds[LegalCausewaySpots(sim, q)[0]];
        sim = step(sim, a);
      }
    }
    double second = 0;
    for (int v : LegalOutpostSpots(sim, p)) second = std::max(second, VertexValue(sim, v, p, sc));
    const double total = cand.score + 0.85 * second;
    if (total > bestTotal) {
      bestTotal = total;
      best = cand;
    }
  }
  return best.v;
}

// ------------------------------------------------------------------ policies

std::optional<Action> WarlordAction(const GameState& s, Rng& rng, const Persona& persona) {
  if (s.handoff) return Act(ActionType::AckPassDevice, *s.handoff);
  const Topology& topo = Topo();
  const int p = ActiveActor(s);
  const Phase& ph = s.phase;
  const Weights sc = Scarcity(s);
  switch (ph.kind) {
    case PhaseKind::Setup:
      if (!ph.stepCauseway) {
        int v = -1;
        if (persona.lookahead) {
          v = LookaheadSetup(s, p);
        } else {
          v = *Argmax(LegalOutpostSpots(s, p), [&](int x) { return VertexValue(s, x, p, sc); });
        }
        Action a = Act(ActionType::PlaceSetupOutpost, p);
        a.vertex = topo.vertexIds[v];
        return a;
      } else {
        const auto e = BestSetupCauseway(s, p);
        if (!e) return std::nullopt;
        Action a = Act(ActionType::PlaceSetupCauseway, p);
        a.edge = topo.edgeIds[*e];
        return a;
      }
    case PhaseKind::Roll:
      if (auto omen = OmenPlay(s, p, persona, true)) return omen;
      return Act(ActionType::RollDice, p);
    case PhaseKind::Discard: {
      Action a = Act(ActionType::Discard, p);
      a.cards = SmartDiscard(s, p, ph.pending[p]);
      return a;
    }
    case PhaseKind::MoveWraith: {
      const auto punish = Leader(s, p);
      std::vector<int> hexes;
      for (const auto& h : s.board.hexes)
        if (h.id != s.wraithHex) hexes.push_back(h.id);
      const int hex = *Argmax(hexes, [&](int h) { return WraithValue(s, h, p, punish) + rng.Next() * 0.01; });
      Action a = Act(ActionType::MoveWraith, p);
      a.hex = hex;
      return a;
    }
    case PhaseKind::Steal: {
      const Goal goal = ChooseGoal(s, p);
      const Weights w = ResourceWeights(s, p, goal);
      const int victim = *Argmax(ph.candidates, [&](int c) {
        const PlayerState& o = s.players[c];
        double score = VictoryPoints(s, c, false) * 2 + HandTotal(o);
        if (persona.cunning) {
          const auto y = ExpectedYield(s, c);
          double add = 0;
          for (Resource r : kResources) add = add + y[Ri(r)] * w[Ri(r)] * 10;
          score += add;
        }
        return score;
      });
      Action a = Act(ActionType::StealFrom, p);
      a.victim = victim;
      return a;
    }
    case PhaseKind::Decree: {
      const int e = *Argmax(LegalCausewaySpots(s, p),
                            [&](int x) { return EdgeValue(s, x, p, sc) + LongestGain(s, x, p) * 2; });
      Action a = Act(ActionType::BuildCauseway, p);
      a.edge = topo.edgeIds[e];
      return a;
    }
    case PhaseKind::Trade:
      return Respond(s, p, persona);
    case PhaseKind::Main:
      return MainTurn(s, p, rng, persona);
    case PhaseKind::Duel:
    case PhaseKind::Ended:
      return std::nullopt;
  }
  return std::nullopt;
}

bool IsBuild(ActionType t) {
  return t == ActionType::BuildCauseway || t == ActionType::BuildOutpost || t == ActionType::BuildCitadel ||
         t == ActionType::BuyOmen;
}

bool IsPlay(ActionType t) {
  return t == ActionType::PlayWarden || t == ActionType::PlayDecree || t == ActionType::PlayHarvestPact ||
         t == ActionType::PlayBloodTithe || t == ActionType::PlayManUp;
}

const Action& Pick(Rng& rng, const std::vector<Action>& items) { return items[rng.PickIndex(static_cast<int>(items.size()))]; }

std::optional<Action> WandererAction(const GameState& s, Rng& rng) {
  const std::vector<Action> options = LegalActions(s, &rng);
  if (options.empty()) return std::nullopt;
  const int p = ActiveActor(s);
  const Phase& ph = s.phase;
  if (ph.kind == PhaseKind::Trade) {
    const TradeOffer& offer = ph.offer;
    const bool can = HasAtLeast(s.players[p].hand, offer.want) && HasAtLeast(s.players[offer.proposer].hand, offer.give);
    Action a = Act(ActionType::RespondTrade, p);
    a.response = can && rng.Next() < 0.35 ? TradeResponse::Accept : TradeResponse::Decline;
    return a;
  }
  if (ph.kind == PhaseKind::Roll) {
    const Action* warden = nullptr;
    for (const auto& a : options)
      if (a.type == ActionType::PlayWarden) {
        warden = &a;
        break;
      }
    if (warden && rng.Next() < 0.2) return *warden;
    return Act(ActionType::RollDice, p);
  }
  if (ph.kind == PhaseKind::MoveWraith) {
    const Topology& topo = Topo();
    std::vector<Action> safe;
    for (const auto& a : options) {
      if (a.type != ActionType::MoveWraith) continue;
      bool mine = false;
      for (int v : topo.hexVertices[a.hex]) {
        const Building* b = s.buildings.Find(v);
        if (b && b->owner == p) mine = true;
      }
      if (!mine) safe.push_back(a);
    }
    return Pick(rng, safe.empty() ? options : safe);
  }
  if (ph.kind == PhaseKind::Main) {
    std::vector<Action> builds, strong, plays, trades;
    for (const auto& a : options) {
      if (IsBuild(a.type)) builds.push_back(a);
      if (a.type == ActionType::BuildCitadel || a.type == ActionType::BuildOutpost) strong.push_back(a);
      if (IsPlay(a.type)) plays.push_back(a);
      if (a.type == ActionType::BankTrade) trades.push_back(a);
    }
    if (!builds.empty() && rng.Next() < 0.85) return Pick(rng, strong.empty() ? builds : strong);
    if (!plays.empty() && rng.Next() < 0.3) return Pick(rng, plays);
    if (!trades.empty() && rng.Next() < 0.2) return Pick(rng, trades);
    return Act(ActionType::EndTurn, p);
  }
  return Pick(rng, options);
}

}  // namespace

std::optional<Action> DecideAction(const GameState& state, std::optional<BotLevel> level, const std::string& salt) {
  const int p = state.handoff ? *state.handoff : ActiveActor(state);
  const BotLevel lvl = level ? *level : state.players[p].bot.value_or(BotLevel::Warlord);
  Rng rng(HashSeed(std::to_string(state.rng) + "|" + std::to_string(state.actionCount) + "|" + std::to_string(p) +
                   "|" + salt));
  switch (lvl) {
    case BotLevel::Wanderer: return WandererAction(state, rng);
    case BotLevel::Archdemon: return WarlordAction(state, rng, kArchdemon);
    case BotLevel::Warlord: return WarlordAction(state, rng, kWarlord);
  }
  return std::nullopt;
}

}  // namespace catnight
