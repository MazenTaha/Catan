#include "CatnightRules/Serialize.h"

#include "CatnightRules/Board.h"

namespace catnight {

namespace {

constexpr std::string_view kActionNames[] = {
    "RollDice",       "PlaceSetupOutpost", "PlaceSetupCauseway", "Discard",      "MoveWraith",
    "StealFrom",      "BuildCauseway",     "BuildOutpost",       "BuildCitadel", "BuyOmen",
    "PlayWarden",     "PlayDecree",        "PlayHarvestPact",    "PlayBloodTithe", "ProposeTrade",
    "RespondTrade",   "CancelTrade",       "BankTrade",          "EndTurn",      "AckPassDevice",
    "PlayManUp",      "OpenChest",         "Fire",               "Strike",       "YieldDuel",
};

Json Ints(const std::vector<int>& v) {
  Json a = Json::Array();
  for (int x : v) a.Push(x);
  return a;
}

Json Opt(const std::optional<int>& v) { return v ? Json(*v) : Json(); }

const char* PhaseName(PhaseKind k) {
  switch (k) {
    case PhaseKind::Setup: return "setup";
    case PhaseKind::Roll: return "roll";
    case PhaseKind::Discard: return "discard";
    case PhaseKind::MoveWraith: return "move-wraith";
    case PhaseKind::Steal: return "steal";
    case PhaseKind::Main: return "main";
    case PhaseKind::Decree: return "decree";
    case PhaseKind::Trade: return "trade";
    case PhaseKind::Duel: return "duel";
    case PhaseKind::Ended: return "ended";
  }
  return "main";
}

Json SeatJson(const SeatConfig& s) {
  Json j = Json::Object();
  j.Set("name", s.name);
  j.Set("color", Name(s.color));
  j.Set("sigil", Name(s.sigil));
  j.Set("kind", Name(s.kind));
  if (s.bot) j.Set("bot", Name(*s.bot));
  return j;
}

Json BoardJson(const Board& b) {
  const Topology& t = GetTopology();
  Json j = Json::Object();
  j.Set("layoutId", "standard");
  j.Set("seed", b.seed);
  j.Set("mode", Name(b.mode));
  Json hexes = Json::Array();
  for (const auto& h : b.hexes) {
    Json x = Json::Object();
    x.Set("id", h.id);
    x.Set("q", h.q);
    x.Set("r", h.r);
    x.Set("terrain", Name(h.terrain));
    x.Set("token", h.token ? Json(h.token) : Json());
    hexes.Push(std::move(x));
  }
  j.Set("hexes", std::move(hexes));
  Json harbors = Json::Array();
  for (const auto& h : b.harbors) {
    Json x = Json::Object();
    x.Set("id", h.id);
    x.Set("kind", h.kind ? Json(Name(*h.kind)) : Json("any"));
    x.Set("edge", t.edgeIds[h.edge]);
    x.Set("vertices", Json::Array().Push(t.vertexIds[h.vertices[0]]).Push(t.vertexIds[h.vertices[1]]));
    x.Set("hex", h.hex);
    harbors.Push(std::move(x));
  }
  j.Set("harbors", std::move(harbors));
  return j;
}

Json PlayerJson(const PlayerState& p) {
  Json j = Json::Object();
  j.Set("id", p.id);
  j.Set("name", p.name);
  j.Set("color", Name(p.color));
  j.Set("sigil", Name(p.sigil));
  j.Set("kind", Name(p.kind));
  if (p.bot) j.Set("bot", Name(*p.bot));
  j.Set("hand", CountsJson(p.hand));
  Json omens = Json::Array();
  for (const auto& o : p.omens) omens.Push(Json::Object().Set("type", Name(o.type)).Set("boughtTurn", o.boughtTurn));
  j.Set("omens", std::move(omens));
  j.Set("playedWardens", p.playedWardens);
  Json played = Json::Array();
  for (OmenType o : p.playedOmens) played.Push(Name(o));
  j.Set("playedOmens", std::move(played));
  j.Set("supply", Json::Object()
                      .Set("causeways", p.supply.causeways)
                      .Set("outposts", p.supply.outposts)
                      .Set("citadels", p.supply.citadels));
  return j;
}

bool Fail(std::string* error, std::string msg) {
  if (error) *error = std::move(msg);
  return false;
}

bool GetInt(const Json& j, std::string_view key, int& out) {
  const Json* v = j.Get(key);
  if (!v || !v->IsInt()) return false;
  out = static_cast<int>(v->AsInt());
  return true;
}

bool GetStr(const Json& j, std::string_view key, std::string& out) {
  const Json* v = j.Get(key);
  if (!v || !v->IsStr()) return false;
  out = v->AsStr();
  return true;
}

template <typename E>
bool GetEnum(const Json& j, std::string_view key, E& out) {
  const Json* v = j.Get(key);
  return v && v->IsStr() && Parse(v->AsStr(), out);
}

PartialCounts PartialFrom(const Json& j) {
  PartialCounts p;
  if (!j.IsObj()) {
    p.invalid = true;
    return p;
  }
  for (const auto& [k, v] : j.Fields()) {
    Resource r;
    if (!Parse(k, r) || !v.IsInt()) {
      p.invalid = true;
      continue;
    }
    p.Set(r, static_cast<int>(v.AsInt()));
  }
  return p;
}

}  // namespace

std::string_view Name(ActionType t) { return kActionNames[static_cast<int>(t)]; }

bool Parse(std::string_view s, ActionType& out) {
  for (size_t i = 0; i < std::size(kActionNames); i++)
    if (kActionNames[i] == s) {
      out = static_cast<ActionType>(i);
      return true;
    }
  return false;
}

Json CountsJson(const Counts& c) {
  Json j = Json::Object();
  for (Resource r : kResources) j.Set(Name(r), c[r]);
  return j;
}

Json PartialJson(const PartialCounts& c) {
  Json j = Json::Object();
  for (Resource r : kResources)
    if (c.has[static_cast<int>(r)]) j.Set(Name(r), c.v[static_cast<int>(r)]);
  return j;
}

Json OfferJson(const TradeOffer& o) {
  Json j = Json::Object();
  j.Set("id", o.id);
  j.Set("proposer", o.proposer);
  j.Set("targets", Ints(o.targets));
  j.Set("give", CountsJson(o.give));
  j.Set("want", CountsJson(o.want));
  j.Set("declined", Ints(o.declined));
  j.Set("counterOf", Opt(o.counterOf));
  return j;
}

Json ConfigJson(const GameConfig& c) {
  Json j = Json::Object();
  j.Set("seed", c.seed);
  Json seats = Json::Array();
  for (const auto& s : c.seats) seats.Push(SeatJson(s));
  j.Set("seats", std::move(seats));
  j.Set("targetVp", c.targetVp);
  j.Set("layout", Name(c.layout));
  if (c.firstPlayer) j.Set("firstPlayer", *c.firstPlayer == kRollOff ? Json("rolloff") : Json(*c.firstPlayer));
  if (c.privacy) j.Set("privacy", *c.privacy);
  if (c.arms) j.Set("arms", *c.arms);
  if (c.pvp) j.Set("pvp", *c.pvp);
  return j;
}

Json PhaseJson(const Phase& p) {
  const Topology& t = GetTopology();
  Json j = Json::Object();
  j.Set("kind", PhaseName(p.kind));
  const char* resume = p.resumeMain ? "main" : "roll";
  switch (p.kind) {
    case PhaseKind::Setup:
      j.Set("index", p.index);
      j.Set("step", p.stepCauseway ? "causeway" : "outpost");
      j.Set("lastOutpost", p.lastOutpost >= 0 ? Json(t.vertexIds[p.lastOutpost]) : Json());
      break;
    case PhaseKind::Discard: j.Set("pending", Ints(p.pending)); break;
    case PhaseKind::MoveWraith:
      j.Set("reason", p.reasonWarden ? "warden" : "seven");
      j.Set("resume", resume);
      break;
    case PhaseKind::Steal:
      j.Set("candidates", Ints(p.candidates));
      j.Set("resume", resume);
      break;
    case PhaseKind::Decree:
      j.Set("remaining", p.remaining);
      j.Set("resume", resume);
      break;
    case PhaseKind::Trade: j.Set("offer", OfferJson(p.offer)); break;
    case PhaseKind::Duel:
      j.Set("challenger", p.challenger);
      j.Set("target", p.target);
      j.Set("resume", resume);
      break;
    case PhaseKind::Ended: j.Set("winner", p.winner); break;
    case PhaseKind::Roll:
    case PhaseKind::Main: break;
  }
  return j;
}

Json StateToJson(const GameState& s) {
  const Topology& t = GetTopology();
  Json j = Json::Object();
  j.Set("schema", 1);
  j.Set("config", ConfigJson(s.config));
  j.Set("board", BoardJson(s.board));
  j.Set("rng", s.rng);
  Json players = Json::Array();
  for (const auto& p : s.players) players.Push(PlayerJson(p));
  j.Set("players", std::move(players));
  j.Set("bank", CountsJson(s.bank));
  Json deck = Json::Array();
  for (OmenType o : s.omenDeck) deck.Push(Name(o));
  j.Set("omenDeck", std::move(deck));
  Json buildings = Json::Object(true);
  for (int v : s.buildings.order) {
    const Building& b = *s.buildings.at[v];
    buildings.Set(t.vertexIds[v], Json::Object()
                                      .Set("owner", b.owner)
                                      .Set("kind", b.kind == BuildingKind::Outpost ? "outpost" : "citadel"));
  }
  j.Set("buildings", std::move(buildings));
  Json causeways = Json::Object(true);
  for (int e : s.causeways.order) causeways.Set(t.edgeIds[e], *s.causeways.at[e]);
  j.Set("causeways", std::move(causeways));
  j.Set("wraithHex", s.wraithHex);
  j.Set("phase", PhaseJson(s.phase));
  j.Set("currentPlayer", s.currentPlayer);
  j.Set("turn", s.turn);
  j.Set("round", s.round);
  j.Set("setupOrder", Ints(s.setupOrder));
  Json rollOff = Json::Array();
  for (const auto& round : s.rollOff) {
    Json r = Json::Array();
    for (const auto& x : round) r.Push(Json::Array().Push(x[0]).Push(x[1]).Push(x[2]));
    rollOff.Push(std::move(r));
  }
  j.Set("rollOff", std::move(rollOff));
  j.Set("firstPlayer", s.firstPlayer);
  j.Set("dice", s.dice ? Json::Array().Push((*s.dice)[0]).Push((*s.dice)[1]) : Json());
  j.Set("hasRolled", s.hasRolled);
  j.Set("omenPlayedThisTurn", s.omenPlayedThisTurn);
  j.Set("offersThisTurn", s.offersThisTurn);
  j.Set("longestCauseway", Json::Object().Set("holder", Opt(s.longestHolder)).Set("lengths", Ints(s.longestLengths)));
  j.Set("greatestHost", Json::Object().Set("holder", Opt(s.hostHolder)));
  j.Set("handoff", Opt(s.handoff));
  j.Set("viewer", Opt(s.viewer));
  j.Set("winner", Opt(s.winner));
  j.Set("nextTradeId", s.nextTradeId);
  Json stats = Json::Object();
  Json rolls = Json::Array();
  for (int r : s.stats.rolls) rolls.Push(r);
  stats.Set("rolls", std::move(rolls));
  Json gained = Json::Array();
  for (const auto& g : s.stats.gained) gained.Push(CountsJson(g));
  stats.Set("gained", std::move(gained));
  stats.Set("trades", Ints(s.stats.trades));
  stats.Set("bankTrades", Ints(s.stats.bankTrades));
  stats.Set("stolen", Ints(s.stats.stolen));
  stats.Set("discarded", Ints(s.stats.discarded));
  stats.Set("omensBought", Ints(s.stats.omensBought));
  j.Set("stats", std::move(stats));
  j.Set("actionCount", s.actionCount);
  if (s.arms) {
    const ArmsState& a = *s.arms;
    Json arms = Json::Object();
    Json chest = Json::Array();
    for (int v : a.chest) chest.Push(v >= 0 ? Json(t.vertexIds[v]) : Json());
    arms.Set("chest", std::move(chest));
    Json starts = Json::Array();
    for (const auto& list : a.starts) {
      Json l = Json::Array();
      for (int v : list) l.Push(t.vertexIds[v]);
      starts.Push(std::move(l));
    }
    arms.Set("starts", std::move(starts));
    Json armed = Json::Array();
    for (bool b : a.armed) armed.Push(b);
    arms.Set("armed", std::move(armed));
    arms.Set("bullets", Ints(a.bullets));
    arms.Set("health", Ints(a.health));
    Json owed = Json::Array();
    for (const auto& row : a.owed) owed.Push(Ints(row));
    arms.Set("owed", std::move(owed));
    arms.Set("kills", Ints(a.kills));
    j.Set("arms", std::move(arms));
  }
  return j;
}

Json ActionToJson(const Action& a) {
  Json j = Json::Object();
  j.Set("type", Name(a.type));
  j.Set("player", a.player);
  switch (a.type) {
    case ActionType::PlaceSetupOutpost:
    case ActionType::BuildOutpost:
    case ActionType::BuildCitadel: j.Set("vertex", a.vertex); break;
    case ActionType::PlaceSetupCauseway:
    case ActionType::BuildCauseway: j.Set("edge", a.edge); break;
    case ActionType::Discard: j.Set("cards", PartialJson(a.cards)); break;
    case ActionType::MoveWraith: j.Set("hex", a.hex); break;
    case ActionType::StealFrom: j.Set("victim", a.victim); break;
    case ActionType::PlayHarvestPact: {
      Json r = Json::Array();
      for (Resource x : a.resources) r.Push(Name(x));
      j.Set("resources", std::move(r));
      break;
    }
    case ActionType::PlayBloodTithe: j.Set("resource", Name(a.resource)); break;
    case ActionType::ProposeTrade:
      j.Set("give", PartialJson(a.give));
      j.Set("want", PartialJson(a.want));
      j.Set("to", a.to ? Ints(*a.to) : Json("all"));
      break;
    case ActionType::RespondTrade:
      j.Set("response", a.response == TradeResponse::Accept    ? "accept"
                        : a.response == TradeResponse::Decline ? "decline"
                                                               : "counter");
      if (a.hasGive) j.Set("give", PartialJson(a.give));
      if (a.hasWant) j.Set("want", PartialJson(a.want));
      break;
    case ActionType::BankTrade:
      j.Set("give", Name(a.giveRes));
      j.Set("receive", Name(a.receiveRes));
      if (a.count) j.Set("count", *a.count);
      break;
    case ActionType::PlayManUp: j.Set("target", a.target); break;
    case ActionType::Strike:
      j.Set("victim", a.victim);
      j.Set("weapon", Name(a.weapon));
      if (a.parried) j.Set("parried", *a.parried);
      break;
    default: break;
  }
  return j;
}

bool ConfigFromJson(const Json& j, GameConfig& out, std::string* error) {
  out = GameConfig{};
  if (!j.IsObj()) return Fail(error, "config is not an object");
  if (!GetStr(j, "seed", out.seed)) return Fail(error, "config.seed");
  if (!GetInt(j, "targetVp", out.targetVp)) return Fail(error, "config.targetVp");
  if (!GetEnum(j, "layout", out.layout)) return Fail(error, "config.layout");
  const Json* seats = j.Get("seats");
  if (!seats || !seats->IsArr()) return Fail(error, "config.seats");
  for (const Json& s : seats->Items()) {
    SeatConfig seat;
    if (!GetStr(s, "name", seat.name) || !GetEnum(s, "color", seat.color) || !GetEnum(s, "sigil", seat.sigil) ||
        !GetEnum(s, "kind", seat.kind)) {
      return Fail(error, "config.seats[]");
    }
    if (s.Has("bot")) {
      BotLevel b;
      if (!GetEnum(s, "bot", b)) return Fail(error, "config.seats[].bot");
      seat.bot = b;
    }
    out.seats.push_back(seat);
  }
  if (const Json* f = j.Get("firstPlayer")) {
    if (f->IsStr() && f->AsStr() == "rolloff") out.firstPlayer = kRollOff;
    else if (f->IsInt()) out.firstPlayer = static_cast<int>(f->AsInt());
    else return Fail(error, "config.firstPlayer");
  }
  if (const Json* v = j.Get("privacy")) out.privacy = v->AsBool();
  if (const Json* v = j.Get("arms")) out.arms = v->AsBool();
  if (const Json* v = j.Get("pvp")) out.pvp = v->AsBool();
  return true;
}

bool ActionFromJson(const Json& j, Action& out, std::string* error) {
  out = Action{};
  std::string type;
  if (!GetStr(j, "type", type) || !Parse(type, out.type)) return Fail(error, "action.type");
  if (!GetInt(j, "player", out.player)) return Fail(error, "action.player");
  switch (out.type) {
    case ActionType::PlaceSetupOutpost:
    case ActionType::BuildOutpost:
    case ActionType::BuildCitadel:
      if (!GetStr(j, "vertex", out.vertex)) return Fail(error, "action.vertex");
      break;
    case ActionType::PlaceSetupCauseway:
    case ActionType::BuildCauseway:
      if (!GetStr(j, "edge", out.edge)) return Fail(error, "action.edge");
      break;
    case ActionType::Discard: {
      const Json* c = j.Get("cards");
      if (!c) return Fail(error, "action.cards");
      out.cards = PartialFrom(*c);
      break;
    }
    case ActionType::MoveWraith:
      if (!GetInt(j, "hex", out.hex)) return Fail(error, "action.hex");
      break;
    case ActionType::StealFrom:
      if (!GetInt(j, "victim", out.victim)) return Fail(error, "action.victim");
      break;
    case ActionType::PlayHarvestPact: {
      const Json* r = j.Get("resources");
      if (!r || !r->IsArr()) return Fail(error, "action.resources");
      for (const Json& x : r->Items()) {
        Resource res;
        if (!x.IsStr() || !Parse(x.AsStr(), res)) return Fail(error, "action.resources[]");
        out.resources.push_back(res);
      }
      break;
    }
    case ActionType::PlayBloodTithe:
      if (!GetEnum(j, "resource", out.resource)) return Fail(error, "action.resource");
      break;
    case ActionType::ProposeTrade: {
      const Json* g = j.Get("give");
      const Json* w = j.Get("want");
      const Json* to = j.Get("to");
      if (!g || !w || !to) return Fail(error, "action.give/want/to");
      out.give = PartialFrom(*g);
      out.want = PartialFrom(*w);
      if (to->IsStr()) {
        if (to->AsStr() != "all") return Fail(error, "action.to");
      } else if (to->IsArr()) {
        std::vector<int> list;
        for (const Json& x : to->Items()) {
          if (!x.IsInt()) return Fail(error, "action.to[]");
          list.push_back(static_cast<int>(x.AsInt()));
        }
        out.to = list;
      } else {
        return Fail(error, "action.to");
      }
      break;
    }
    case ActionType::RespondTrade: {
      std::string response;
      if (!GetStr(j, "response", response)) return Fail(error, "action.response");
      if (response == "accept") out.response = TradeResponse::Accept;
      else if (response == "decline") out.response = TradeResponse::Decline;
      else if (response == "counter") out.response = TradeResponse::Counter;
      else return Fail(error, "action.response");
      if (const Json* g = j.Get("give")) {
        out.give = PartialFrom(*g);
        out.hasGive = true;
      }
      if (const Json* w = j.Get("want")) {
        out.want = PartialFrom(*w);
        out.hasWant = true;
      }
      break;
    }
    case ActionType::BankTrade: {
      if (!GetEnum(j, "give", out.giveRes) || !GetEnum(j, "receive", out.receiveRes)) {
        return Fail(error, "action.give/receive");
      }
      int count = 0;
      if (GetInt(j, "count", count)) out.count = count;
      break;
    }
    case ActionType::PlayManUp:
      if (!GetInt(j, "target", out.target)) return Fail(error, "action.target");
      break;
    case ActionType::Strike: {
      if (!GetInt(j, "victim", out.victim) || !GetEnum(j, "weapon", out.weapon)) {
        return Fail(error, "action.victim/weapon");
      }
      if (const Json* p = j.Get("parried")) out.parried = p->AsBool();
      break;
    }
    default: break;
  }
  return true;
}

}  // namespace catnight
