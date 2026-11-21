// Bots (mirrors packages/engine/src/ai/*): Wanderer (Easy), Warlord (Medium), Archdemon (Hard).
// A bot's randomness comes from the state, so the same position always gives the same move.
#pragma once

#include <optional>
#include <string>

#include "CatnightRules/Rules.h"

namespace catnight {

/**
 * The action the seat that must act should take, at `level` (default: that seat's bot level,
 * else Warlord). Returns nullopt where the engine would throw (no move during a duel or after
 * the game, or no legal action).
 */
std::optional<Action> DecideAction(const GameState& state, std::optional<BotLevel> level = std::nullopt,
                                   const std::string& salt = "");

}  // namespace catnight
