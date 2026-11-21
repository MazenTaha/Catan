// Game state, actions, events and errors (mirrors packages/engine/src/state/types.ts).
#pragma once

#include "CatnightRules/Api.h"

#include <array>
#include <optional>
#include <string>
#include <vector>

#include "CatnightRules/Board.h"
#include "CatnightRules/Json.h"
#include "CatnightRules/Keys.h"

namespace catnight {

inline constexpr int kRollOff = -1;  // GameConfig::firstPlayer value for 'rolloff'

struct SeatConfig {
  std::string name;
  PlayerColor color = PlayerColor::Crimson;
  Sigil sigil = Sigil::Skull;
  SeatKind kind = SeatKind::Human;
  std::optional<BotLevel> bot;
};

struct GameConfig {
  std::string seed;
  std::vector<SeatConfig> seats;
  int targetVp = 10;
  LayoutMode layout = LayoutMode::Balanced;
  /** Seat index, kRollOff, or absent (createGame stores kRollOff). */
  std::optional<int> firstPlayer;
  std::optional<bool> privacy;
  std::optional<bool> arms;
  std::optional<bool> pvp;
};

struct ArmsState {
  std::vector<int> chest;               // vertex index, -1 until placed
  std::vector<std::vector<int>> starts;  // vertex indices, in id string order
  std::vector<bool> armed;
  std::vector<int> bullets;
  std::vector<int> health;
  std::vector<std::vector<int>> owed;  // owed[victim][killer]
  std::vector<int> kills;
};

struct OwnedOmen {
  OmenType type = OmenType::Warden;
  int boughtTurn = 0;
};

struct Supply {
  int causeways = kSupplyCauseways;
  int outposts = kSupplyOutposts;
  int citadels = kSupplyCitadels;
};

struct PlayerState {
  int id = 0;
  std::string name;
  PlayerColor color = PlayerColor::Crimson;
  Sigil sigil = Sigil::Skull;
  SeatKind kind = SeatKind::Human;
  std::optional<BotLevel> bot;
  Counts hand;
  std::vector<OwnedOmen> omens;
  int playedWardens = 0;
  std::vector<OmenType> playedOmens;
  Supply supply;
};

enum class BuildingKind : uint8_t { Outpost, Citadel };

struct Building {
  int owner = 0;
  BuildingKind kind = BuildingKind::Outpost;
};

/**
 * Record<VertexId, Building> / Record<EdgeId, number>: lookups by index, iteration in
 * insertion order, as the TypeScript objects iterate (bots read them in that order).
 */
template <typename T>
struct OrderedSlots {
  std::vector<std::optional<T>> at;
  std::vector<int> order;
  void Resize(int n) { at.assign(n, std::nullopt); }
  bool Has(int i) const { return i >= 0 && i < static_cast<int>(at.size()) && at[i].has_value(); }
  const T* Find(int i) const { return Has(i) ? &*at[i] : nullptr; }
  void Put(int i, const T& v) {
    if (!at[i]) order.push_back(i);
    at[i] = v;
  }
};

struct TradeOffer {
  int id = 0;
  int proposer = 0;
  std::vector<int> targets;
  Counts give;
  Counts want;
  std::vector<int> declined;
  std::optional<int> counterOf;
};

enum class PhaseKind : uint8_t { Setup, Roll, Discard, MoveWraith, Steal, Main, Decree, Trade, Duel, Ended };

struct Phase {
  PhaseKind kind = PhaseKind::Setup;
  // setup
  int index = 0;
  bool stepCauseway = false;
  int lastOutpost = -1;
  // discard
  std::vector<int> pending;
  // move-wraith (reason), steal, decree, duel (resume)
  bool reasonWarden = false;
  bool resumeMain = false;
  // steal
  std::vector<int> candidates;
  // decree
  int remaining = 0;
  // trade
  TradeOffer offer;
  // duel
  int challenger = 0;
  int target = 0;
  // ended
  int winner = 0;

  static Phase Simple(PhaseKind k) {
    Phase p;
    p.kind = k;
    return p;
  }
};

struct GameStats {
  std::array<int, 13> rolls{};
  std::vector<Counts> gained;
  std::vector<int> trades;
  std::vector<int> bankTrades;
  std::vector<int> stolen;
  std::vector<int> discarded;
  std::vector<int> omensBought;
};

struct GameState {
  GameConfig config;
  Board board;
  uint32_t rng = 0;
  std::vector<PlayerState> players;
  Counts bank;
  std::vector<OmenType> omenDeck;  // last element is drawn next
  OrderedSlots<Building> buildings;
  OrderedSlots<int> causeways;
  int wraithHex = 0;
  Phase phase;
  int currentPlayer = 0;
  int turn = 0;
  int round = 0;
  std::vector<int> setupOrder;
  std::vector<std::vector<std::array<int, 3>>> rollOff;
  int firstPlayer = 0;
  std::optional<std::array<int, 2>> dice;
  bool hasRolled = false;
  bool omenPlayedThisTurn = false;
  int offersThisTurn = 0;
  std::optional<int> longestHolder;
  std::vector<int> longestLengths;
  std::optional<int> hostHolder;
  std::optional<int> handoff;
  std::optional<int> viewer;
  std::optional<int> winner;
  int nextTradeId = 1;
  GameStats stats;
  int actionCount = 0;
  std::optional<ArmsState> arms;
};

enum class ActionType : uint8_t {
  RollDice,
  PlaceSetupOutpost,
  PlaceSetupCauseway,
  Discard,
  MoveWraith,
  StealFrom,
  BuildCauseway,
  BuildOutpost,
  BuildCitadel,
  BuyOmen,
  PlayWarden,
  PlayDecree,
  PlayHarvestPact,
  PlayBloodTithe,
  ProposeTrade,
  RespondTrade,
  CancelTrade,
  BankTrade,
  EndTurn,
  AckPassDevice,
  PlayManUp,
  OpenChest,
  Fire,
  Strike,
  YieldDuel,
};
CATNIGHTRULES_API std::string_view Name(ActionType t);
CATNIGHTRULES_API bool Parse(std::string_view s, ActionType& out);

enum class TradeResponse : uint8_t { Accept, Decline, Counter };

/** One player action. Only the fields of its type are meaningful. */
struct Action {
  ActionType type = ActionType::EndTurn;
  int player = 0;
  std::string vertex;  // PlaceSetupOutpost, BuildOutpost, BuildCitadel (id as sent)
  std::string edge;    // PlaceSetupCauseway, BuildCauseway
  PartialCounts cards;  // Discard
  int hex = 0;          // MoveWraith
  int victim = 0;       // StealFrom, Strike
  std::vector<Resource> resources;  // PlayHarvestPact
  Resource resource = Resource::Wood;  // PlayBloodTithe
  PartialCounts give, want;  // ProposeTrade; RespondTrade (counter)
  bool hasGive = false, hasWant = false;  // RespondTrade: fields present
  std::optional<std::vector<int>> to;  // ProposeTrade: nullopt = 'all'
  TradeResponse response = TradeResponse::Decline;
  Resource giveRes = Resource::Wood, receiveRes = Resource::Wood;  // BankTrade
  std::optional<int> count;  // BankTrade
  int target = 0;            // PlayManUp
  Weapon weapon = Weapon::Fist;
  std::optional<bool> parried;

  static Action Make(ActionType t, int player) {
    Action a;
    a.type = t;
    a.player = player;
    return a;
  }
};

struct GameError {
  std::string code;
  std::string message;
};

/** Typed events as JSON objects with a "type" field (same shapes as the TypeScript GameEvent). */
using GameEvent = Json;

struct ActionOutcome {
  bool ok = false;
  GameState state;
  std::vector<GameEvent> events;
  GameError error;
};

}  // namespace catnight
