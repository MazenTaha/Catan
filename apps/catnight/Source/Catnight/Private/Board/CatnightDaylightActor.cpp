#include "Board/CatnightDaylightActor.h"

#include "Board/CatnightBoardActor.h"
#include "CatnightMatch.h"
#include "CatnightRules/Board.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/PostProcessComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Daytime.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Ui/HallSettings.h"
#include "Ui/HallStyle.h"

using namespace catnight;

namespace
{
	constexpr float R = ACatnightBoardActor::R;

	/** The exposure (EV100) of the table at full day; every key is relative to it. */
	constexpr float DayEV = 0.f;  // measured: a touch richer than the old adapted exposure
	/** The hour shown when Settings → Day and night is "Always day": the golden late afternoon,
	 *  a low warm sun with long cool shadows (the plain high sun read as flat and lifeless). */
	constexpr float AlwaysDayHour = 16.7f;

	FLinearColor Hex(uint32 Rgb) { return FLinearColor(FColor((Rgb >> 16) & 255, (Rgb >> 8) & 255, Rgb & 255)); }

	/** One moment of the day. Warm keys, cool fill, a lavender dusk, a blue moonlit night (the web
	 *  walk's daylight.ts, retuned for the miniature: lower sun, softer shadows, golden hours). */
	struct FKey
	{
		float H;
		uint32 Light;   // sun or moon colour
		float Lux;      // its strength
		uint32 SkyTint; // the sky light's colour
		float Sky;      // and strength
		uint32 FogColor;
		float EV;       // exposure relative to day: negative opens up (night stays readable)
		float Lamp;     // lamp over the table and lit windows, 0..1
		float Warmth;   // colour grade: + warmer, - cooler
	};
	// Night is darker than day and blue (moonlight), with warm pools at the buildings; the exposure
	// opens only a little, so it still reads as night and the board stays legible. By day a warm
	// key over a cooler, weaker sky keeps lit faces golden and shade blue: that contrast is what
	// gives the table its mood, where an even white fill flattened it.
	const FKey Keys[] = {
		{0.f, 0x9fb4ff, 0.7f, 0x6f86c8, 0.18f, 0x0b1226, -1.0f, 1.f, -0.6f},
		{4.5f, 0xa8b8ff, 0.65f, 0x7486c0, 0.18f, 0x121a30, -1.0f, 1.f, -0.6f},
		{6.f, 0xffc59c, 4.6f, 0x9cb4e2, 0.55f, 0x9aa0bc, -0.55f, 0.35f, 0.5f},
		{9.f, 0xffe0b4, 7.8f, 0x9dbbe6, 0.58f, 0xa9bfd6, 0.05f, 0.f, 0.35f},
		{13.f, 0xffe8c8, 7.4f, 0x9cbfe9, 0.55f, 0xa8c4dc, 0.15f, 0.f, 0.3f},
		{16.5f, 0xffdcb2, 8.6f, 0x92ade0, 0.64f, 0xc2b6ae, -0.25f, 0.05f, 0.55f},
		{18.3f, 0xffbc8a, 5.4f, 0xa59ccc, 0.52f, 0x8c7f9c, -0.5f, 0.45f, 0.75f},
		{20.2f, 0xb8b6ee, 0.9f, 0x8a86c0, 0.25f, 0x2a2a4a, -0.9f, 0.9f, -0.3f},
	};
	constexpr int32 NumKeys = UE_ARRAY_COUNT(Keys);

	struct FLook
	{
		FLinearColor Light, SkyTint, FogColor;
		float Lux, Sky, EV, Lamp, Warmth;
	};

	FLook Sample(float Hour)
	{
		Hour = FMath::Fmod(FMath::Fmod(Hour, 24.f) + 24.f, 24.f);
		int32 I = NumKeys - 1;
		while (I > 0 && Keys[I].H > Hour) I--;
		const FKey& A = Keys[I];
		const FKey& B = Keys[(I + 1) % NumKeys];
		const float Span = (B.H <= A.H ? B.H + 24.f : B.H) - A.H;
		const float T = FMath::Clamp((Hour - A.H + (Hour < A.H ? 24.f : 0.f)) / Span, 0.f, 1.f);
		auto C = [T](uint32 X, uint32 Y) { return FMath::Lerp(Hex(X), Hex(Y), T); };
		auto N = [T](float X, float Y) { return FMath::Lerp(X, Y, T); };
		return {C(A.Light, B.Light), C(A.SkyTint, B.SkyTint), C(A.FogColor, B.FogColor),
			N(A.Lux, B.Lux), N(A.Sky, B.Sky), N(A.EV, B.EV), N(A.Lamp, B.Lamp), N(A.Warmth, B.Warmth)};
	}

	/** Where the light comes from (a unit vector towards the sun or moon). The default camera looks
	 *  north (+X) with east to the right (+Y): the sun rises on the right, stands south at midday and
	 *  sets on the left, as on the 2D board ("warm sun from the upper left" in the afternoon). */
	FVector LightFrom(float Hour)
	{
		const float Angle = (Hour - 6.f) / 12.f * PI;
		// Never lower than about 16°: the sky atmosphere reddens and dims a sun near the horizon on
		// top of the keyed colour, which turned whole hours brown.
		const FVector SunDir = FVector(-0.6f, FMath::Cos(Angle), 0.35f + 0.65f * FMath::Max(0.f, FMath::Sin(Angle))).GetSafeNormal();
		const FVector MoonDir = FVector(-0.55f, -0.4f, 0.75f).GetSafeNormal();
		// A continuous handover: no jump in the shadows at dawn or dusk.
		const float Day = CatnightDay::Daylight(Hour);
		return FMath::Lerp(MoonDir, SunDir, FMath::SmoothStep(0.f, 0.7f, Day)).GetSafeNormal();
	}

	/** Forward distance from A to B on the clock (0..24). */
	float Ahead(float A, float B) { return FMath::Fmod(B - A + 48.f, 24.f); }

	FVector VertexAt(int32 V)
	{
		// The board actor's lattice (CatnightBoardActor.cpp LatticeToWorld): x right, y down the screen.
		const std::string& Id = GetTopology().vertexIds[V];
		const size_t Comma = Id.find(',');
		const float X = static_cast<float>(std::stoi(Id.substr(0, Comma)));
		const float Y = static_cast<float>(std::stoi(Id.substr(Comma + 1)));
		return FVector(-Y * 0.5f * R, X * 0.8660254f * R, 0.f);
	}
}

ACatnightDaylightActor::ACatnightDaylightActor()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
}

void ACatnightDaylightActor::Setup(TSharedPtr<FCatnightMatch> InMatch)
{
	Match = InMatch;
	const TCHAR* Cmd = FCommandLine::Get();
	FParse::Value(Cmd, TEXT("CatnightHour="), FixedHour);
	FParse::Value(Cmd, TEXT("CatnightEV="), ExposureOverride);

	Sun = NewObject<UDirectionalLightComponent>(this);
	Sun->SetupAttachment(Root);
	Sun->SetMobility(EComponentMobility::Movable);
	Sun->SetAtmosphereSunLight(true);
	Sun->SetDynamicShadowDistanceMovableLight(40.f * R);
	// A larger disc than the sun's: softer shadow edges, the cozy miniature look.
	Sun->LightSourceAngle = 1.25f;
	Sun->SetForwardShadingPriority(1);
	// Screen-space contact shadows seat small pieces (roads, harbours, tokens) on the board.
	Sun->ContactShadowLength = 0.04f;
	Sun->RegisterComponent();

	Atmosphere = NewObject<USkyAtmosphereComponent>(this);
	Atmosphere->SetupAttachment(Root);
	Atmosphere->RegisterComponent();

	Sky = NewObject<USkyLightComponent>(this);
	Sky->SetupAttachment(Root);
	Sky->SetMobility(EComponentMobility::Movable);
	Sky->bRealTimeCapture = true;
	Sky->RegisterComponent();

	Fog = NewObject<UExponentialHeightFogComponent>(this);
	Fog->SetupAttachment(Root);
	Fog->SetFogDensity(0.0025f);
	Fog->SetRelativeLocation(FVector(0, 0, -6.f * R));
	Fog->RegisterComponent();

	// Exposure is held for each hour (not adapted), so night looks like night and noon like noon.
	Post = NewObject<UPostProcessComponent>(this);
	Post->SetupAttachment(Root);
	Post->bUnbound = true;
	FPostProcessSettings& P = Post->Settings;
	P.bOverride_AutoExposureMethod = true;
	P.AutoExposureMethod = EAutoExposureMethod::AEM_Histogram;
	P.bOverride_AutoExposureMinBrightness = P.bOverride_AutoExposureMaxBrightness = true;
	P.bOverride_AutoExposureSpeedUp = P.bOverride_AutoExposureSpeedDown = true;
	P.AutoExposureSpeedUp = P.AutoExposureSpeedDown = 20.f;
	P.bOverride_BloomIntensity = true;
	P.BloomIntensity = 0.3f;
	// Framing and depth: a vignette draws the eye to the island, ambient occlusion grounds the
	// miniatures, and a gentle contrast lift with split toning (cool shade, warm light).
	P.bOverride_VignetteIntensity = true;
	P.VignetteIntensity = 0.55f;
	P.bOverride_AmbientOcclusionIntensity = true;
	P.AmbientOcclusionIntensity = 0.7f;
	P.bOverride_ColorContrast = true;
	P.ColorContrast = FVector4(1.f, 1.f, 1.f, 1.07f);
	P.bOverride_ColorGainShadows = P.bOverride_ColorGainHighlights = true;
	P.bOverride_ColorSaturation = P.bOverride_ColorGain = true;
	Post->RegisterComponent();

	// The lamp over the table: candlelight hung above the island, lit from dusk to dawn.
	Lamp = NewObject<UPointLightComponent>(this);
	Lamp->SetupAttachment(Root);
	Lamp->SetMobility(EComponentMobility::Movable);
	Lamp->SetRelativeLocation(FVector(-0.4f * R, 0.f, 9.f * R));
	Lamp->SetIntensityUnits(ELightUnits::Candelas);
	Lamp->SetUseTemperature(true);
	Lamp->SetTemperature(2600.f);
	Lamp->SetAttenuationRadius(28.f * R);
	Lamp->SetSourceRadius(0.6f * R);
	Lamp->SetCastShadows(true);
	// No hot spot on the water or the rim: the lamp is a soft wash, not a glare.
	Lamp->SetSpecularScale(0.15f);
	Lamp->RegisterComponent();

	Hour = -1.f;
	Apply(GoalHour());
}

float ACatnightDaylightActor::GoalHour() const
{
	if (FixedHour >= 0.f) return FMath::Fmod(FixedHour, 24.f);
	if (!FHallSettings::Get().bDayNight || !Match || !Match->HasGame()) return AlwaysDayHour;
	return CatnightDay::HourOf(Match->State());
}

void ACatnightDaylightActor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const float Goal = GoalHour();
	const float Fwd = Ahead(Hour, Goal);
	if (Hour < 0.f || Hall::bReduceMotion)
	{
		Hour = Goal;
	}
	else if (Fwd > 0.001f && Fwd < 12.f)
	{
		// Turns move the clock forward: the light sweeps there over a couple of seconds.
		const float Step = FMath::Max(Fwd * (1.f - FMath::Exp(-1.8f * DeltaSeconds)), 0.4f * DeltaSeconds);
		Hour = FMath::Fmod(Hour + FMath::Min(Step, Fwd), 24.f);
	}
	else if (Fwd >= 12.f)
	{
		// Backwards (an undo, a new game, the setting): short steps ease back, long ones jump.
		const float Back = 24.f - Fwd;
		Hour = Back < 2.f ? FMath::Fmod(Hour - Back * (1.f - FMath::Exp(-4.f * DeltaSeconds)) + 24.f, 24.f) : Goal;
	}
	Apply(Hour);
}

void ACatnightDaylightActor::Apply(float InHour)
{
	if (InHour < 0.f) InHour = 0.f;
	Hour = InHour;
	const FLook L = Sample(InHour);

	Sun->SetWorldRotation((-LightFrom(InHour)).Rotation());
	Sun->SetLightColor(L.Light);
	Sun->SetIntensity(L.Lux);

	Sky->SetLightColor(L.SkyTint);
	Sky->SetIntensity(L.Sky);
	Fog->SetFogInscatteringColor(L.FogColor);

	FPostProcessSettings& P = Post->Settings;
	const float EV = (ExposureOverride > -50.f ? ExposureOverride : DayEV) + L.EV;
	P.AutoExposureMinBrightness = P.AutoExposureMaxBrightness = EV;
	// A gentle grade: warm by day and at the golden hours, a touch cooler and calmer at night.
	const float W = L.Warmth * 0.05f;
	P.ColorGain = FVector4(1.f + W, 1.f, 1.f - W * 1.4f, 1.f);
	const float Split = FMath::Clamp(L.Warmth, 0.f, 1.f) * 0.04f;
	P.ColorGainShadows = FVector4(1.f - Split, 1.f, 1.f + Split * 1.5f, 1.f);
	P.ColorGainHighlights = FVector4(1.f + Split, 1.f, 1.f - Split, 1.f);
	P.ColorSaturation = FVector4(1.f, 1.f, 1.f, L.Lamp > 0.5f ? 0.9f : 1.f);

	Lamp->SetIntensity(L.Lamp * 650.f);
	Lamp->SetVisibility(L.Lamp > 0.01f);
	UpdateWindows(L.Lamp);
}

void ACatnightDaylightActor::UpdateWindows(float LampLevel)
{
	if (!Match || !Match->HasGame()) return;
	const GameState& S = Match->State();
	// Rebuild the window lights only when buildings change.
	FString Signature;
	for (int32 V : S.buildings.order)
		Signature += FString::Printf(TEXT("%d%c"), V, S.buildings.at[V]->kind == BuildingKind::Citadel ? 'c' : 's');
	if (Signature != WindowSignature)
	{
		WindowSignature = Signature;
		for (UPointLightComponent* L : Windows) if (L) L->DestroyComponent();
		Windows.Reset();
		for (int32 V : S.buildings.order)
		{
			const bool bCity = S.buildings.at[V]->kind == BuildingKind::Citadel;
			UPointLightComponent* L = NewObject<UPointLightComponent>(this);
			L->SetupAttachment(Root);
			L->SetMobility(EComponentMobility::Movable);
			L->SetRelativeLocation(VertexAt(V) + FVector(0, 0, (bCity ? 0.16f : 0.12f) * R));
			L->SetIntensityUnits(ELightUnits::Candelas);
			L->SetLightColor(FLinearColor(1.f, 0.62f, 0.3f));
			L->SetAttenuationRadius((bCity ? 0.9f : 0.7f) * R);
			L->SetSourceRadius(0.05f * R);
			L->SetCastShadows(false);
			L->SetSpecularScale(0.f);
			L->ComponentTags.Add(bCity ? TEXT("City") : TEXT("Settlement"));
			L->RegisterComponent();
			Windows.Add(L);
		}
		LastLamp = -1.f;
	}
	if (FMath::Abs(LampLevel - LastLamp) < 0.002f) return;
	LastLamp = LampLevel;
	for (UPointLightComponent* L : Windows)
	{
		if (!L) continue;
		const bool bCity = L->ComponentHasTag(TEXT("City"));
		L->SetIntensity(LampLevel * (bCity ? 24.f : 14.f));
		L->SetVisibility(LampLevel > 0.01f);
	}
}
