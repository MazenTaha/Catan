#include "Ui/HallSettings.h"

#include "HAL/IConsoleManager.h"
#include "Misc/CommandLine.h"
#include "Misc/ConfigCacheIni.h"
#include "Misc/Parse.h"
#include "Ui/HallStyle.h"

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

void FHallSettings::ApplyFrameRate(bool bForeground) const
{
	if (bProfiling) return;
	IConsoleVariable* VSync = IConsoleManager::Get().FindConsoleVariable(TEXT("r.VSync"));
	IConsoleVariable* MaxFps = IConsoleManager::Get().FindConsoleVariable(TEXT("t.MaxFPS"));
	const int32 Rate = FMath::Clamp(FrameRate, 0, 2);
	const int32 WantVSync = Rate == 2 ? 0 : 1;
	float WantMax = Rate == 1 ? 60.f : 0.f;
	// Behind another window the table still plays (bots, hot-seat timers), just drawn less often.
	if (!bForeground) WantMax = WantMax > 0.f ? FMath::Min(WantMax, 30.f) : 30.f;
	if (VSync && VSync->GetInt() != WantVSync) VSync->Set(WantVSync, ECVF_SetByGameSetting);
	if (MaxFps && MaxFps->GetFloat() != WantMax) MaxFps->Set(WantMax, ECVF_SetByGameSetting);
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
