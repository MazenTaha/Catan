// JSON shapes of the TypeScript engine: state, config, actions, counts. Used by records,
// saves and the golden tests; `StateToJson(s).Canonical()` equals the exporter's canonState.
#pragma once

#include <optional>
#include <string>

#include "CatnightRules/Json.h"
#include "CatnightRules/State.h"

namespace catnight {

Json CountsJson(const Counts& c);
Json PartialJson(const PartialCounts& c);
Json OfferJson(const TradeOffer& o);
Json ConfigJson(const GameConfig& c);
Json PhaseJson(const Phase& p);
Json StateToJson(const GameState& s);
Json ActionToJson(const Action& a);

/** Parse helpers return false and fill `error` on a shape the engine would not accept. */
bool ConfigFromJson(const Json& j, GameConfig& out, std::string* error);
bool ActionFromJson(const Json& j, Action& out, std::string* error);

}  // namespace catnight
