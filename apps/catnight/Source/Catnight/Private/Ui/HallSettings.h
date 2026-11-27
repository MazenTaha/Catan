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
	/** 0 match the display (VSync), 1 up to 60 a second, 2 unlimited. Without a cap the GPU ran flat out. */
	int32 FrameRate = 0;

	static FHallSettings& Get();
	static FString FrameRateName(int32 Rate);
	/** Sets r.VSync and t.MaxFPS from FrameRate; in the background the game draws at most 30 a second. */
	void ApplyFrameRate(bool bForeground) const;
	/** -CatnightPerf measures uncapped: the setting is not applied while it records. */
	static bool bProfiling;
	void Load();
	void Save() const;
	float BotDelay() const;
	static FString BotSpeedName(int32 Speed);
};
