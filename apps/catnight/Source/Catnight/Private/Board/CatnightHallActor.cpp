#include "Board/CatnightHallActor.h"

#include "Board/CatnightBoardActor.h"
#include "CatnightMatch.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Ui/CatnightUi.h"
#include "Ui/HallSettings.h"
#include "Ui/HallStyle.h"

using namespace catnight;

namespace
{
	constexpr float R = ACatnightBoardActor::R;
	/** Die edge length. Real dice are about a fifth of a tile; a little larger reads better from above. */
	constexpr float DieSize = 0.36f * R;
	/** The sea tray's surface (ACatnightBoardActor::BuildRoom: the sea plane at -0.1 R). */
	constexpr float SeaZ = -0.1f * R;
	constexpr float ThrowSeconds = 1.25f;

	/** Where the dice come to rest: the open sea off the island's lower right, clear of harbours and of the panel. */
	const FVector RestAt[2] = {FVector(-3.55f * R, 4.35f * R, 0.f), FVector(-2.95f * R, 4.85f * R, 0.f)};

	FVector FaceNormal(int32 Face)
	{
		// Opposite faces add up to 7.
		switch (Face)
		{
		case 1: return FVector::UpVector;
		case 6: return FVector::DownVector;
		case 2: return FVector::ForwardVector;
		case 5: return FVector::BackwardVector;
		case 3: return FVector::RightVector;
		default: return FVector::LeftVector;  // 4
		}
	}

	TArray<FVector2D> PipLayout(int32 Face)
	{
		switch (Face)
		{
		case 1: return {{0, 0}};
		case 2: return {{-1, -1}, {1, 1}};
		case 3: return {{-1, -1}, {0, 0}, {1, 1}};
		case 4: return {{-1, -1}, {-1, 1}, {1, -1}, {1, 1}};
		case 5: return {{-1, -1}, {-1, 1}, {1, -1}, {1, 1}, {0, 0}};
		default: return {{-1, -1}, {-1, 0}, {-1, 1}, {1, -1}, {1, 0}, {1, 1}};
		}
	}

	float EaseOut(float T) { return 1.f - FMath::Pow(1.f - T, 3.f); }
}

ACatnightHallActor::ACatnightHallActor()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
}

void ACatnightHallActor::Setup(TSharedPtr<FCatnightMatch> InMatch)
{
	Match = InMatch;
	TintBase = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Generated/Materials/M_Tint.M_Tint"));
	GlowBase = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Generated/Materials/M_Glow.M_Glow"));
	if (!TintBase) return;  // the board already warns: run pnpm catnight:import
	BuildDice();
	if (FHallSettings::Get().bHall && !FParse::Param(FCommandLine::Get(), TEXT("CatnightNoHall"))) BuildHall();
	SeenSerial = Match->EventSerial;
	if (Match->HasGame() && Match->State().dice) Rest((*Match->State().dice)[0], (*Match->State().dice)[1]);
	else Rest(0, 0);
}

// ------------------------------------------------------------------ helpers

UStaticMesh* ACatnightHallActor::Shape(const TCHAR* Name)
{
	return LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Engine/BasicShapes/%s.%s"), Name, Name));
}

UMaterialInstanceDynamic* ACatnightHallActor::Tint(const FLinearColor& Color, float Roughness, float Metallic)
{
	UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(TintBase, this);
	M->SetVectorParameterValue(TEXT("Color"), Color);
	M->SetScalarParameterValue(TEXT("Roughness"), Roughness);
	M->SetScalarParameterValue(TEXT("Metallic"), Metallic);
	return M;
}

UMaterialInstanceDynamic* ACatnightHallActor::Glow(const FLinearColor& Color, float Opacity)
{
	if (!GlowBase) return nullptr;
	UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(GlowBase, this);
	M->SetVectorParameterValue(TEXT("Color"), Color);
	M->SetScalarParameterValue(TEXT("Opacity"), Opacity);
	return M;
}

UStaticMeshComponent* ACatnightHallActor::Add(UStaticMesh* Mesh, const FTransform& T, UMaterialInterface* Material, USceneComponent* Parent)
{
	if (!Mesh) return nullptr;
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
	C->SetStaticMesh(Mesh);
	C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	// The hall never darkens the table: only the dice (small, beside the island) cast shadows.
	C->SetCastShadow(Parent != nullptr);
	C->SetupAttachment(Parent ? Parent : Root.Get());
	C->SetRelativeTransform(T);
	if (Material)
		for (int32 I = 0; I < C->GetNumMaterials(); I++) C->SetMaterial(I, Material);
	C->RegisterComponent();
	return C;
}

FQuat ACatnightHallActor::FaceUp(int32 Face, float Yaw)
{
	return FQuat(FVector::UpVector, FMath::DegreesToRadians(Yaw)) * FQuat::FindBetweenNormals(FaceNormal(Face), FVector::UpVector);
}

// ------------------------------------------------------------------ dice

void ACatnightHallActor::BuildDice()
{
	UStaticMesh* Cube = Shape(TEXT("Cube"));
	UStaticMesh* Sphere = Shape(TEXT("Sphere"));
	UMaterialInterface* Bone = Tint(CatnightUi::Srgb(236, 226, 204), 0.42f);
	UMaterialInterface* Pip = Tint(CatnightUi::Srgb(26, 18, 11), 0.6f);
	UMaterialInterface* RedPip = Tint(CatnightUi::Srgb(150, 28, 22), 0.55f);
	for (int32 D = 0; D < 2; D++)
	{
		USceneComponent* Die = NewObject<USceneComponent>(this);
		Die->SetupAttachment(Root);
		Die->SetMobility(EComponentMobility::Movable);
		Die->RegisterComponent();
		Dice.Add(Die);
		// A bevelled look from three crossed boxes: the edges read soft from above.
		const float S = DieSize / 100.f;
		Add(Cube, FTransform(FRotator::ZeroRotator, FVector::ZeroVector, FVector(S, S * 0.88f, S * 0.88f)), Bone, Die);
		Add(Cube, FTransform(FRotator::ZeroRotator, FVector::ZeroVector, FVector(S * 0.88f, S, S * 0.88f)), Bone, Die);
		Add(Cube, FTransform(FRotator::ZeroRotator, FVector::ZeroVector, FVector(S * 0.88f, S * 0.88f, S)), Bone, Die);
		for (int32 Face = 1; Face <= 6; Face++)
		{
			const FVector N = FaceNormal(Face);
			const FVector U = FMath::Abs(N.Z) > 0.5f ? FVector::ForwardVector : FVector::UpVector;
			const FVector V = FVector::CrossProduct(N, U);
			const float Pip1 = Face == 1 ? 0.2f : 0.15f;
			for (const FVector2D& P : PipLayout(Face))
			{
				const FVector At = N * DieSize * 0.495f + (U * P.X + V * P.Y) * DieSize * 0.26f;
				const FRotator Rot = FRotationMatrix::MakeFromZ(N).Rotator();
				Add(Sphere, FTransform(Rot, At, FVector(DieSize * Pip1 / 100.f, DieSize * Pip1 / 100.f, DieSize * 0.05f / 100.f)), Face == 1 ? RedPip : Pip, Die);
			}
		}
	}
}

void ACatnightHallActor::Rest(int32 A, int32 B)
{
	ThrowTime = -1.f;
	const int32 Faces[2] = {A, B};
	for (int32 D = 0; D < Dice.Num(); D++)
	{
		const bool bShow = Faces[D] >= 1 && Faces[D] <= 6;
		Dice[D]->SetVisibility(bShow, true);
		if (!bShow) continue;
		const FVector To = RestAt[D] + FVector(0, 0, SeaZ + DieSize * 0.5f);
		Dice[D]->SetRelativeLocationAndRotation(To, FaceUp(Faces[D], D == 0 ? 14.f : -22.f));
	}
}

void ACatnightHallActor::Throw(int32 A, int32 B)
{
	if (Dice.Num() < 2) return;
	if (Hall::bReduceMotion)
	{
		Rest(A, B);
		return;
	}
	const int32 Faces[2] = {A, B};
	FRandomStream Rng(static_cast<int32>(Match ? Match->EventSerial * 7919 : 1));
	for (int32 D = 0; D < 2; D++)
	{
		FThrow& T = Throws[D];
		T.To = RestAt[D] + FVector(Rng.FRandRange(-0.25f, 0.25f) * R, Rng.FRandRange(-0.2f, 0.2f) * R, SeaZ + DieSize * 0.5f);
		// Thrown in from the table's right edge, above the sea.
		T.From = T.To + FVector(Rng.FRandRange(-0.6f, 0.6f) * R, (2.6f + D * 0.4f) * R, 2.2f * R);
		T.Final = FaceUp(Faces[D], Rng.FRandRange(-35.f, 35.f));
		T.SpinAxis = FVector(Rng.FRandRange(-1.f, 1.f), Rng.FRandRange(0.4f, 1.f), Rng.FRandRange(-0.3f, 0.3f)).GetSafeNormal();
		T.Spin = Rng.FRandRange(3.f, 4.5f) * UE_TWO_PI;
		Dice[D]->SetVisibility(true, true);
	}
	ThrowTime = 0.f;
}

// ------------------------------------------------------------------ the hall

void ACatnightHallActor::AddTorch(const FVector& At, float Seed)
{
	UStaticMesh* Cyl = Shape(TEXT("Cylinder"));
	UStaticMesh* Cone = Shape(TEXT("Cone"));
	UStaticMesh* Sphere = Shape(TEXT("Sphere"));
	UMaterialInterface* Iron = Tint(CatnightUi::Srgb(42, 40, 44), 0.45f, 0.8f);
	UMaterialInterface* Wood = Tint(CatnightUi::Srgb(70, 46, 26), 0.8f);
	// Bracket, handle, a cup and the flame.
	Add(Cyl, FTransform(FRotator(0, 0, 0), At + FVector(0, 0, -0.9f * R), FVector(0.22f, 0.22f, 1.6f) * R / 100.f), Wood);
	Add(Cone, FTransform(FRotator(180, 0, 0), At + FVector(0, 0, 0.05f * R), FVector(0.55f, 0.55f, 0.45f) * R / 100.f), Iron);
	if (UMaterialInterface* Flame = Glow(FLinearColor(1.f, 0.55f, 0.18f), 0.9f))
	{
		Flames.Add(Add(Sphere, FTransform(FRotator::ZeroRotator, At + FVector(0, 0, 0.45f * R), FVector(0.42f, 0.42f, 0.8f) * R / 100.f), Flame));
		Flames.Add(Add(Sphere, FTransform(FRotator::ZeroRotator, At + FVector(0, 0, 0.35f * R), FVector(0.25f, 0.25f, 0.45f) * R / 100.f), Glow(FLinearColor(1.f, 0.9f, 0.55f), 1.f)));
	}
	UPointLightComponent* L = NewObject<UPointLightComponent>(this);
	L->SetupAttachment(Root);
	L->SetMobility(EComponentMobility::Movable);
	L->SetRelativeLocation(At + FVector(0, 0, 0.6f * R));
	L->SetLightColor(FLinearColor(1.f, 0.62f, 0.3f));
	L->SetAttenuationRadius(18.f * R);
	L->SetIntensityUnits(ELightUnits::Candelas);
	L->SetIntensity(1.2e4f);
	L->SetCastShadows(false);
	L->RegisterComponent();
	Lights.Add(L);
	LightBase.Add(1.2e4f);
	LightSeed.Add(Seed);
}

void ACatnightHallActor::BuildHall()
{
	UStaticMesh* Cube = Shape(TEXT("Cube"));
	UStaticMesh* Plane = Shape(TEXT("Plane"));
	UStaticMesh* Cyl = Shape(TEXT("Cylinder"));
	const float Floor = -9.f * R;  // the board actor's hall floor

	// Flagstones, a few tones of grey-brown, just above the board's plain floor.
	TArray<UMaterialInterface*> Stones = {Tint(CatnightUi::Srgb(74, 68, 60), 0.85f), Tint(CatnightUi::Srgb(62, 57, 51), 0.9f), Tint(CatnightUi::Srgb(84, 77, 67), 0.85f)};
	FRandomStream Rng(1931);
	const float Tile = 6.f * R;
	for (int32 X = -9; X < 9; X++)
		for (int32 Y = -9; Y < 9; Y++)
		{
			const FVector At((X + 0.5f) * Tile, (Y + 0.5f) * Tile, Floor + 0.02f * R + Rng.FRandRange(0.f, 0.03f) * R);
			Add(Cube, FTransform(FRotator::ZeroRotator, At, FVector(Tile * 0.96f, Tile * 0.96f, 0.1f * R) / 100.f), Stones[Rng.RandRange(0, Stones.Num() - 1)]);
		}
	// A rug under the table: crimson field, gold border.
	Add(Plane, FTransform(FRotator::ZeroRotator, FVector(0, 0, Floor + 0.1f * R), FVector(26.f, 28.f, 1.f) * R / 100.f), Tint(CatnightUi::Srgb(176, 132, 52), 0.9f));
	Add(Plane, FTransform(FRotator::ZeroRotator, FVector(0, 0, Floor + 0.12f * R), FVector(24.5f, 26.5f, 1.f) * R / 100.f), Tint(CatnightUi::Srgb(110, 22, 18), 0.95f));

	// Oak legs under the table's corners, and candles on the corners of its top.
	UMaterialInterface* Oak = Tint(CatnightUi::Srgb(72, 47, 28), 0.6f);
	const float LegX = 6.9f * R, LegY = 7.9f * R;
	for (const FVector2D S : {FVector2D(1, 1), FVector2D(1, -1), FVector2D(-1, 1), FVector2D(-1, -1)})
	{
		const float Top = -0.8f * R;
		Add(Cube, FTransform(FRotator::ZeroRotator, FVector(S.X * LegX, S.Y * LegY, (Top + Floor) * 0.5f), FVector(1.1f * R, 1.1f * R, Top - Floor) / 100.f), Oak);
		// Candle: wax, a brass dish, flame and a small light that stays off the island.
		const FVector C(S.X * 7.15f * R, S.Y * 8.15f * R, -0.2f * R);
		Add(Cyl, FTransform(FRotator::ZeroRotator, C + FVector(0, 0, 0.03f * R), FVector(0.55f, 0.55f, 0.06f) * R / 100.f), Tint(CatnightUi::Srgb(180, 138, 58), 0.35f, 0.9f));
		Add(Cyl, FTransform(FRotator::ZeroRotator, C + FVector(0, 0, 0.42f * R), FVector(0.24f, 0.24f, 0.8f) * R / 100.f), Tint(CatnightUi::Srgb(236, 224, 196), 0.5f));
		if (UMaterialInterface* Flame = Glow(FLinearColor(1.f, 0.7f, 0.3f), 0.95f))
			Flames.Add(Add(Shape(TEXT("Sphere")), FTransform(FRotator::ZeroRotator, C + FVector(0, 0, 0.94f * R), FVector(0.12f, 0.12f, 0.26f) * R / 100.f), Flame));
		UPointLightComponent* L = NewObject<UPointLightComponent>(this);
		L->SetupAttachment(Root);
		L->SetMobility(EComponentMobility::Movable);
		L->SetRelativeLocation(C + FVector(0, 0, 1.1f * R));
		L->SetLightColor(FLinearColor(1.f, 0.7f, 0.38f));
		L->SetAttenuationRadius(2.6f * R);
		L->SetIntensityUnits(ELightUnits::Candelas);
		L->SetIntensity(600.f);
		L->SetCastShadows(false);
		L->RegisterComponent();
		Lights.Add(L);
		LightBase.Add(600.f);
		LightSeed.Add(S.X * 3.f + S.Y * 7.f);
	}

	// Walls of the hall with pillars, torches and banners between them.
	UMaterialInterface* Wall = Tint(CatnightUi::Srgb(58, 52, 46), 0.92f);
	UMaterialInterface* Pillar = Tint(CatnightUi::Srgb(78, 71, 62), 0.88f);
	UMaterialInterface* Gold = Tint(CatnightUi::Srgb(201, 150, 47), 0.35f, 0.9f);
	const float Half = 50.f * R, Height = 34.f * R, Thick = 2.f * R;
	for (int32 Side = 0; Side < 4; Side++)
	{
		const float Yaw = Side * 90.f;
		const FRotator Rot(0, Yaw, 0);
		const FVector Out = Rot.RotateVector(FVector(Half, 0, 0));
		const FVector Along = Rot.RotateVector(FVector(0, 1, 0));
		Add(Cube, FTransform(Rot, Out + FVector(0, 0, Floor + Height * 0.5f), FVector(Thick, 2.f * Half + Thick, Height) / 100.f), Wall);
		// Courses of stone: thin darker bands across the wall.
		for (int32 Course = 1; Course < 9; Course++)
			Add(Cube, FTransform(Rot, Out - Out.GetSafeNormal() * Thick * 0.52f + FVector(0, 0, Floor + Course * 3.6f * R), FVector(0.1f * R, 2.f * Half, 0.16f * R) / 100.f), Tint(CatnightUi::Srgb(40, 36, 32), 0.95f));
		for (int32 P = -2; P <= 2; P++)
		{
			const FVector Base = Out - Out.GetSafeNormal() * Thick + Along * (P * 20.f * R);
			Add(Cube, FTransform(Rot, Base + FVector(0, 0, Floor + Height * 0.5f), FVector(3.4f * R, 3.4f * R, Height) / 100.f), Pillar);
			AddTorch(Base - Out.GetSafeNormal() * 2.4f * R + FVector(0, 0, Floor + 13.f * R), Side * 5.f + P);
			if (P < 2)
			{
				// A banner between this pillar and the next: rod, cloth, a dark fold.
				const FVector Mid = Base + Along * 10.f * R - Out.GetSafeNormal() * 0.6f * R;
				Add(Cyl, FTransform(FRotator(90, Yaw + 90.f, 0), Mid + FVector(0, 0, Floor + 22.f * R), FVector(0.25f * R, 0.25f * R, 7.4f * R) / 100.f), Gold);
				UStaticMeshComponent* Cloth = Add(Cube, FTransform(Rot, Mid + FVector(0, 0, Floor + 16.f * R), FVector(0.12f * R, 6.4f * R, 12.f * R) / 100.f), Tint(Hall::Color::Gules, 0.95f));
				BannerCloths.Add(Cloth);
				Add(Cube, FTransform(Rot, Mid - Out.GetSafeNormal() * 0.08f * R + FVector(0, 0, Floor + 16.f * R), FVector(0.12f * R, 0.5f * R, 12.f * R) / 100.f), Gold);
			}
		}
	}
	SeenPlayers = ~0u;
}

// ------------------------------------------------------------------ every frame

void ACatnightHallActor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Time += DeltaSeconds;
	if (!Match) return;

	// New events: dice.
	if (Match->EventSerial != SeenSerial)
	{
		SeenSerial = Match->EventSerial;
		for (const GameEvent& E : Match->LastEvents)
		{
			const Json* Type = E.Get("type");
			const Json* D = E.Get("dice");
			if (Type && Type->IsStr() && Type->AsStr() == "DiceRolled" && D && D->IsArr() && D->Items().size() == 2)
				Throw(static_cast<int32>(D->Items()[0].AsInt()), static_cast<int32>(D->Items()[1].AsInt()));
		}
	}
	else if (ThrowTime < 0.f && Dice.Num() == 2)
	{
		// A new game, a loaded one or an undo: show the state's last roll.
		const bool bVisible = Dice[0]->IsVisible();
		const std::optional<std::array<int, 2>>& Last = Match->HasGame() ? Match->State().dice : std::nullopt;
		if (bVisible != Last.has_value()) Last ? Rest((*Last)[0], (*Last)[1]) : Rest(0, 0);
	}

	if (ThrowTime >= 0.f)
	{
		ThrowTime += DeltaSeconds;
		const float T = FMath::Clamp(ThrowTime / ThrowSeconds, 0.f, 1.f);
		for (int32 D = 0; D < 2; D++)
		{
			const FThrow& Th = Throws[D];
			const float E = EaseOut(T);
			FVector At = FMath::Lerp(Th.From, Th.To, E);
			// Bounces that die away.
			At.Z = Th.To.Z + (Th.From.Z - Th.To.Z) * FMath::Square(1.f - T) * FMath::Abs(FMath::Cos(T * UE_PI * 3.2f));
			const FQuat Spin(Th.SpinAxis, Th.Spin * (1.f - E));
			Dice[D]->SetRelativeLocationAndRotation(At, Spin * Th.Final);
		}
		if (T >= 1.f) ThrowTime = -1.f;
	}

	// Banners in the players' colours.
	if (BannerCloths.Num() && Match->HasGame())
	{
		const GameState& S = Match->State();
		uint32 Sig = static_cast<uint32>(S.players.size());
		for (const PlayerState& P : S.players) Sig = Sig * 31 + static_cast<uint32>(P.color);
		if (Sig != SeenPlayers)
		{
			SeenPlayers = Sig;
			for (int32 I = 0; I < BannerCloths.Num(); I++)
			{
				const PlayerState& P = S.players[I % S.players.size()];
				FLinearColor Col = Hall::Color::Player(P.color) * 0.8f;
				Col.A = 1.f;
				if (UMaterialInstanceDynamic* M = Cast<UMaterialInstanceDynamic>(BannerCloths[I]->GetMaterial(0))) M->SetVectorParameterValue(TEXT("Color"), Col);
			}
		}
	}

	// Torch and candle flicker.
	for (int32 I = 0; I < Lights.Num(); I++)
	{
		const float S = LightSeed[I];
		const float F = Hall::bReduceMotion ? 0.9f : 0.82f + 0.1f * FMath::Sin(Time * 7.1f + S) + 0.06f * FMath::Sin(Time * 13.3f + S * 2.3f) + 0.03f * FMath::Sin(Time * 23.f + S * 0.7f);
		Lights[I]->SetIntensity(LightBase[I] * F);
	}
}
