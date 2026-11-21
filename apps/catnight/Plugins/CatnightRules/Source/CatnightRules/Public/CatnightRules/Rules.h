// Rules: setup, selectors and the pure reducer (mirrors packages/engine/src/state/setup.ts,
// state/selectors.ts and rules/*). `ApplyAction` never changes its input; all randomness
// comes from and goes back to `state.rng`, so `config + actions` replays a game exactly.
#pragma once

#include <array>
#include <optional>
#include <string>
#include <vector>

#include "CatnightRules/State.h"

namespace catnight {

inline constexpr int kMinPlayers = 3;
inline constexpr int kMaxPlayers = 4;
inline constexpr int kMinTarget = 8;
inline constexpr int kMaxTarget = 14;

/** Error text for an invalid config, or nullopt. */
std::optional<std::string> ValidateConfig(const GameConfig& config);
/** New game; `config` must be valid (check ValidateConfig first). */
GameState CreateGame(const GameConfig& config);

ActionOutcome ApplyAction(const GameState& state, const Action& action);
bool IsLegal(const GameState& state, const Action& action);
/** Legal actions for the seat that must act (domestic trade offers are not listed). */
std::vector<Action> LegalActions(const GameState& state, Rng* rng = nullptr);
/** Discard choice: random with an rng, otherwise the largest piles first. */
PartialCounts ChooseDiscard(const Counts& hand, int count, Rng* rng);

// ------------------------------------------------------------------ selectors

int HandTotal(const PlayerState& p);
bool IsDistanceLegal(const GameState& s, int vertex);
bool TouchesOwnCauseway(const GameState& s, int player, int vertex);
std::vector<int> LegalOutpostSpots(const GameState& s, int player);
std::vector<int> LegalCausewaySpots(const GameState& s, int player);
std::vector<int> LegalCitadelSpots(const GameState& s, int player);
bool CanAfford(const Counts& hand, CostKey cost);
bool CanAfford(const Counts& hand, const PartialCounts& cost);
/** Cards still missing to pay `cost` (only positive entries present). */
PartialCounts MissingResources(const Counts& hand, const PartialCounts& cost);
/** Best maritime rate for giving `resource`: 2, 3 or 4. */
int BestBankRate(const GameState& s, int player, Resource resource);
std::array<int, 5> BankRates(const GameState& s, int player);
int RelicCount(const PlayerState& p);

struct VpBreakdown {
  int outposts = 0, citadels = 0, longest = 0, host = 0, relics = 0, publicTotal = 0, total = 0;
};
VpBreakdown VpBreakdownOf(const GameState& s, int player);
int VictoryPoints(const GameState& s, int player, bool includeHidden = true);
/** Expected income per roll (pips / 36, robber hex excluded). */
std::array<double, 5> ExpectedYield(const GameState& s, int player);
int HandLimitRisk(const PlayerState& p);
std::vector<int> StealCandidates(const GameState& s, int hex, int except);
std::vector<OwnedOmen> PlayableOmens(const GameState& s, int player);
/** The seat that must act next (discards and trade responses included). */
int ActiveActor(const GameState& s);
bool PrivacyEnabled(const GameState& s);
int LongestCausewayLength(const OrderedSlots<int>& causeways, const OrderedSlots<Building>& buildings, int player);

}  // namespace catnight
