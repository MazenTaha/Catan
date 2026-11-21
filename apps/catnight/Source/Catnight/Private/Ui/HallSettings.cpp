#include "Ui/HallSettings.h"

#include "Misc/ConfigCacheIni.h"
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
	BotSpeed = FMath::Clamp(BotSpeed, 0, 3);
	Hall::bReduceMotion = bReduceMotion;
}

void FHallSettings::Save() const
{
	Hall::bReduceMotion = bReduceMotion;
	if (!GConfig) return;
	GConfig->SetInt(Section, TEXT("BotSpeed"), BotSpeed, GGameUserSettingsIni);
	GConfig->SetBool(Section, TEXT("ReduceMotion"), bReduceMotion, GGameUserSettingsIni);
	GConfig->SetBool(Section, TEXT("Start3D"), bStart3D, GGameUserSettingsIni);
	GConfig->Flush(false, GGameUserSettingsIni);
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
