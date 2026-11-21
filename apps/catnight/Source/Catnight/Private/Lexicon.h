// Player-facing names (the Unreal side of apps/web/src/lexicon.ts). The terms are the web
// game's for now; gate 0 of docs/UNREAL_NATIVE_PLAN.md replaces them, here and only here.
#pragma once

#include "CoreMinimal.h"
#include "CatnightRules/State.h"

namespace CatnightText
{
	FString Resource(catnight::Resource R);
	FString ResourceShort(catnight::Resource R);
	FString Terrain(catnight::Terrain T);
	FString Omen(catnight::OmenType O);
	FString OmenHelp(catnight::OmenType O);
	FString Color(catnight::PlayerColor C);
	FString BotLevel(catnight::BotLevel B);
	FString Layout(catnight::LayoutMode L);
	/** Why the device is being passed (the hot-seat curtain). */
	FString HandoffReason(const catnight::GameState& S, int32 Seat);
	FString Player(const catnight::GameState& S, int32 Seat);
	FString Counts(const catnight::Counts& C);

	/** One log line per event (empty for events the log skips); `Viewer` sees their own secrets. */
	FString EventLine(const catnight::GameState& S, const catnight::GameEvent& E, int32 Viewer);
}
