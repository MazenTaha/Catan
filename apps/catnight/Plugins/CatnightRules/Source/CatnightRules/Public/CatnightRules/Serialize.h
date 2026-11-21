// JSON shapes of the TypeScript engine: state, config, actions, counts. Used by records,
// saves and the golden tests; `StateToJson(s).Canonical()` equals the exporter's canonState.
#pragma once

#include "CatnightRules/Api.h"

#include <optional>
#include <string>

#include "CatnightRules/Json.h"
#include "CatnightRules/State.h"

namespace catnight {

CATNIGHTRULES_API Json CountsJson(const Counts& c);
CATNIGHTRULES_API Json PartialJson(const PartialCounts& c);
CATNIGHTRULES_API Json OfferJson(const TradeOffer& o);
CATNIGHTRULES_API Json ConfigJson(const GameConfig& c);
CATNIGHTRULES_API Json PhaseJson(const Phase& p);
CATNIGHTRULES_API Json StateToJson(const GameState& s);
CATNIGHTRULES_API Json ActionToJson(const Action& a);

/** Parse helpers return false and fill `error` on a shape the engine would not accept. */
CATNIGHTRULES_API bool ConfigFromJson(const Json& j, GameConfig& out, std::string* error);
CATNIGHTRULES_API bool ActionFromJson(const Json& j, Action& out, std::string* error);

}  // namespace catnight
