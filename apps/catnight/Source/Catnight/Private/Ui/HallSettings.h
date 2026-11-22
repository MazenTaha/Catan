// Player settings for the Hall & Chart screens (saved in GameUserSettings.ini, section [Catnight]).
#pragma once

#include "CoreMinimal.h"

struct FHallSettings
{
	/** 0 slow, 1 normal, 2 fast, 3 instant. */
	int32 BotSpeed = 1;
	bool bReduceMotion = false;
	/** Start games on the 3D table (true) or the flat chart. */
	bool bStart3D = true;
	/** Effects volume, 0 (off) to 10. */
	int32 Volume = 7;
	/** Torches, banners and dice in the hall around the war table (Lite turns them off). */
	bool bHall = true;
	/** The 3D table's light follows the game's clock through day and night (false: always afternoon). */
	bool bDayNight = true;

	static FHallSettings& Get();
	void Load();
	void Save() const;
	float BotDelay() const;
	static FString BotSpeedName(int32 Speed);
};
