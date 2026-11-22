// The 3D war table's light through the day (docs/CATNIGHT_UI_PLAN.md §6): sun or moon, sky, fog and
// exposure follow the island's clock (Daytime.h), so the table goes from sunrise through a warm
// midday and a golden afternoon to sunset, a lavender dusk and a moonlit night, a little with every
// turn. At dusk a lamp over the table and the windows of every settlement and city light up.
// A separate actor: the board actor builds the island and steers the camera, this one only lights it.
//
// Settings → Day and night: follow the game, or always the afternoon light. -CatnightHour=<0..24>
// fixes the hour (screenshots).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "CatnightDaylightActor.generated.h"

class FCatnightMatch;
class UDirectionalLightComponent;
class UExponentialHeightFogComponent;
class UPointLightComponent;
class UPostProcessComponent;
class USkyAtmosphereComponent;
class USkyLightComponent;

UCLASS()
class ACatnightDaylightActor : public AActor
{
	GENERATED_BODY()

public:
	ACatnightDaylightActor();
	void Setup(TSharedPtr<FCatnightMatch> InMatch);
	virtual void Tick(float DeltaSeconds) override;

	/** The hour shown now (it eases after the game's clock). */
	float GetHour() const { return Hour; }

private:
	/** The hour the light should reach: the game's clock, the setting or the command line. */
	float GoalHour() const;
	void Apply(float InHour);
	void UpdateWindows(float Lamp);

	TSharedPtr<FCatnightMatch> Match;

	UPROPERTY() TObjectPtr<USceneComponent> Root;
	UPROPERTY() TObjectPtr<UDirectionalLightComponent> Sun;
	UPROPERTY() TObjectPtr<USkyAtmosphereComponent> Atmosphere;
	UPROPERTY() TObjectPtr<USkyLightComponent> Sky;
	UPROPERTY() TObjectPtr<UExponentialHeightFogComponent> Fog;
	UPROPERTY() TObjectPtr<UPostProcessComponent> Post;
	UPROPERTY() TObjectPtr<UPointLightComponent> Lamp;
	UPROPERTY() TArray<TObjectPtr<UPointLightComponent>> Windows;

	float Hour = -1.f;  // < 0: not set yet (the first tick snaps)
	float FixedHour = -1.f;
	float ExposureOverride = -100.f;
	FString WindowSignature;
	float LastLamp = -1.f;
};
