// The island's time of day (port of apps/web/src/components/world/daytime.ts, DECISIONS #40). It
// follows the game, so every seat sees the same hour: each round is a stretch of the day (sunrise,
// morning, midday, afternoon, sunset, dusk, midnight, the small hours) and every turn within the
// round moves the clock on a little. Read by the HUD ("Round II · Midday") and the 3D table's light.
#pragma once

#include "CoreMinimal.h"
#include "CatnightRules/State.h"

namespace CatnightDay
{
	/** Hours since midnight for a game position (setup is a bright morning). */
	float HourOf(const catnight::GameState& S);
	/** The nearest named stage of the day ("Midday", "Dusk"…). */
	FString StageName(float Hour);
	/** 1 in full daylight, 0 in deep night. */
	float Daylight(float Hour);
}
