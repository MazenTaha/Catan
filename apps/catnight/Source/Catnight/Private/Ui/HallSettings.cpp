#include "Ui/HallSettings.h"

#include "HAL/IConsoleManager.h"
#include "Misc/CommandLine.h"
#include "Misc/ConfigCacheIni.h"
#include "Misc/Parse.h"
#include "Ui/HallStyle.h"
#include "HAL/PlatformTime.h"
#if PLATFORM_WINDOWS
#include "Windows/AllowWindowsPlatformTypes.h"
#include <windows.h>
#include "Windows/HideWindowsPlatformTypes.h"
#endif

namespace
{
	const TCHAR* Section = TEXT("Catnight");
}

FHallSettings& FHallSettings::Get()
{
	static FHallSettings Settings;
	static bool bLoaded = false;
	if (!bLoaded)
	{
		bLoaded = true;
		Settings.Load();
	}
	return Settings;
}

void FHallSettings::Load()
{
	if (!GConfig) return;
	GConfig->GetInt(Section, TEXT("BotSpeed"), BotSpeed, GGameUserSettingsIni);
	GConfig->GetBool(Section, TEXT("ReduceMotion"), bReduceMotion, GGameUserSettingsIni);
	GConfig->GetBool(Section, TEXT("Start3D"), bStart3D, GGameUserSettingsIni);
	GConfig->GetInt(Section, TEXT("Volume"), Volume, GGameUserSettingsIni);
	GConfig->GetBool(Section, TEXT("Hall"), bHall, GGameUserSettingsIni);
	GConfig->GetBool(Section, TEXT("DayNight"), bDayNight, GGameUserSettingsIni);
	GConfig->GetInt(Section, TEXT("FrameRate"), FrameRate, GGameUserSettingsIni);
	FParse::Value(FCommandLine::Get(), TEXT("CatnightFrameRate="), FrameRate);  // tests
	FrameRate = FMath::Clamp(FrameRate, 0, 2);
	BotSpeed = FMath::Clamp(BotSpeed, 0, 3);
	Volume = FMath::Clamp(Volume, 0, 10);
	Hall::bReduceMotion = bReduceMotion;
}

void FHallSettings::Save() const
{
	Hall::bReduceMotion = bReduceMotion;
	if (!GConfig) return;
	GConfig->SetInt(Section, TEXT("BotSpeed"), BotSpeed, GGameUserSettingsIni);
	GConfig->SetBool(Section, TEXT("ReduceMotion"), bReduceMotion, GGameUserSettingsIni);
	GConfig->SetBool(Section, TEXT("Start3D"), bStart3D, GGameUserSettingsIni);
	GConfig->SetInt(Section, TEXT("Volume"), Volume, GGameUserSettingsIni);
	GConfig->SetBool(Section, TEXT("Hall"), bHall, GGameUserSettingsIni);
	GConfig->SetBool(Section, TEXT("DayNight"), bDayNight, GGameUserSettingsIni);
	GConfig->SetInt(Section, TEXT("FrameRate"), FrameRate, GGameUserSettingsIni);
	GConfig->Flush(false, GGameUserSettingsIni);
}

bool FHallSettings::bProfiling = false;

FString FHallSettings::FrameRateName(int32 Rate)
{
	static const TCHAR* Names[] = {TEXT("Match the display"), TEXT("Up to 60"), TEXT("Unlimited")};
	return Names[FMath::Clamp(Rate, 0, 2)];
}

int32 FHallSettings::DisplayHz()
{
	// Re-read now and then: the player can switch the panel between 60 and 144 Hz while playing.
	static int32 Hz = 60;
	static double CheckedAt = -100.0;
	const double Now = FPlatformTime::Seconds();
	if (Now - CheckedAt < 2.0) return Hz;
	CheckedAt = Now;
#if PLATFORM_WINDOWS
	DEVMODEW Mode = {};
	Mode.dmSize = sizeof(Mode);
	if (EnumDisplaySettingsW(nullptr, ENUM_CURRENT_SETTINGS, &Mode) && Mode.dmDisplayFrequency > 1) Hz = static_cast<int32>(Mode.dmDisplayFrequency);
#endif
	return Hz;
}

void FHallSettings::ApplyFrameRate(bool bForeground) const
{
	if (bProfiling) return;
	IConsoleVariable* VSync = IConsoleManager::Get().FindConsoleVariable(TEXT("r.VSync"));
	IConsoleVariable* MaxFps = IConsoleManager::Get().FindConsoleVariable(TEXT("t.MaxFPS"));
	IConsoleVariable* Interval = IConsoleManager::Get().FindConsoleVariable(TEXT("rhi.SyncInterval"));
	const int32 Rate = FMath::Clamp(FrameRate, 0, 2);
	const int32 WantVSync = Rate == 2 ? 0 : 1;
	// Behind another window the table still plays (bots, hot-seat timers), just drawn less often.
	const int32 Target = !bForeground ? 30 : Rate == 1 ? 60 : 0;
	// With vsync, a cap is a whole number of vblanks: a frame limiter on top of vsync misses every
	// other vblank (60 a second on a 60 Hz panel alternated 16 and 33 ms frames, 46 fps, and the
	// island walk juddered). Up to 60 is every vblank at 60 Hz, every second one at 120 or 144 Hz.
	int32 WantInterval = 1;
	float WantMax = 0.f;
	if (Target > 0)
	{
		if (WantVSync) WantInterval = FMath::Max(1, FMath::FloorToInt32(DisplayHz() / static_cast<float>(Target) + .05f));
		else WantMax = static_cast<float>(Target);
	}
	if (VSync && VSync->GetInt() != WantVSync) VSync->Set(WantVSync, ECVF_SetByGameSetting);
	if (MaxFps && MaxFps->GetFloat() != WantMax) MaxFps->Set(WantMax, ECVF_SetByGameSetting);
	if (Interval && Interval->GetInt() != WantInterval) Interval->Set(WantInterval, ECVF_SetByGameSetting);
}

float FHallSettings::BotDelay() const
{
	static const float Delays[] = {1.3f, 0.7f, 0.3f, 0.02f};
	return Delays[FMath::Clamp(BotSpeed, 0, 3)];
}

FString FHallSettings::BotSpeedName(int32 Speed)
{
	static const TCHAR* Names[] = {TEXT("Slow"), TEXT("Normal"), TEXT("Fast"), TEXT("Instant")};
	return Names[FMath::Clamp(Speed, 0, 3)];
}
