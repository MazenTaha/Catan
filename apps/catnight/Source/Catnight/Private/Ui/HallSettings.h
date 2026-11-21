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

	static FHallSettings& Get();
	void Load();
	void Save() const;
	float BotDelay() const;
	static FString BotSpeedName(int32 Speed);
};
