#include "Board/CatnightBoardActor.h"

#include "Camera/CameraComponent.h"
#include "CatnightMatch.h"
#include "CatnightRules/Board.h"
#include "CatnightRules/Rules.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/GameViewportClient.h"
#include "Engine/StaticMesh.h"
#include "Engine/UserInterfaceSettings.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Lexicon.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "ProceduralMeshComponent.h"
#include "Table/BoardView.h"
#include "Ui/CatnightUi.h"

using namespace catnight;

namespace
{
	constexpr float Rr = ACatnightBoardActor::R;

	FLinearColor TerrainColor(Terrain T)
	{
		switch (T)
		{
		case Terrain::Witchwood: return CatnightUi::Srgb(52, 98, 44);
		case Terrain::Ashen: return CatnightUi::Srgb(176, 98, 62);
		case Terrain::Moors: return CatnightUi::Srgb(118, 172, 72);
		case Terrain::Fields: return CatnightUi::Srgb(214, 178, 82);
		case Terrain::Peaks: return CatnightUi::Srgb(120, 124, 128);
		case Terrain::Waste: return CatnightUi::Srgb(222, 196, 140);
		}
		return FLinearColor::Gray;
	}

	/** One kind of scenery on a terrain: model, size in R (height, or footprint), how many. */
	struct FDress
	{
		const TCHAR* Family;
		const TCHAR* Name;
		float Size;
		bool bFootprint;
		int32 Min, Max;
	};

	TArray<FDress> DressFor(Terrain T)
	{
		switch (T)
		{
		case Terrain::Witchwood:
			return {{TEXT("flora"), TEXT("Spruce"), 0.46f, false, 2, 3}, {TEXT("flora"), TEXT("Oak"), 0.40f, false, 1, 2},
				{TEXT("flora"), TEXT("OakB"), 0.38f, false, 1, 2}, {TEXT("flora"), TEXT("Lime"), 0.36f, false, 1, 1},
				{TEXT("flora"), TEXT("Fir"), 0.42f, false, 1, 2}, {TEXT("flora"), TEXT("Sapling"), 0.18f, false, 2, 3},
				{TEXT("flora"), TEXT("ShrubA"), 0.09f, false, 2, 4}, {TEXT("flora"), TEXT("ShrubB"), 0.09f, false, 2, 3},
				{TEXT("props"), TEXT("LogPile"), 0.16f, true, 0, 1}, {TEXT("props"), TEXT("MushRed"), 0.03f, false, 1, 2}};
		case Terrain::Fields:
			return {{TEXT("flora"), TEXT("WheatA"), 0.12f, false, 10, 13}, {TEXT("flora"), TEXT("WheatB"), 0.12f, false, 10, 13},
				{TEXT("flora"), TEXT("WheatC"), 0.12f, false, 9, 12}, {TEXT("flora"), TEXT("Stook"), 0.1f, false, 1, 3},
				{TEXT("village"), TEXT("Mill"), 0.48f, false, 0, 1}, {TEXT("village"), TEXT("HayBale"), 0.05f, false, 1, 2}};
		case Terrain::Moors:
			return {{TEXT("flora"), TEXT("GrassA"), 0.06f, false, 8, 11}, {TEXT("flora"), TEXT("GrassB"), 0.06f, false, 7, 10},
				{TEXT("flora"), TEXT("Daisy"), 0.03f, false, 3, 5}, {TEXT("flora"), TEXT("Buttercup"), 0.03f, false, 2, 4},
				{TEXT("flora"), TEXT("Poppy"), 0.03f, false, 1, 3}, {TEXT("village"), TEXT("Sheep"), 0.08f, false, 3, 5},
				{TEXT("village"), TEXT("Barn"), 0.30f, true, 0, 1}, {TEXT("flora"), TEXT("Lime"), 0.34f, false, 0, 1}};
		case Terrain::Ashen:
			return {{TEXT("rocks"), TEXT("ClayA"), 0.34f, true, 1, 2}, {TEXT("rocks"), TEXT("ClayB"), 0.30f, true, 1, 2},
				{TEXT("village"), TEXT("Kiln"), 0.16f, false, 1, 1}, {TEXT("props"), TEXT("BrickStack"), 0.06f, false, 1, 2},
				{TEXT("flora"), TEXT("ShrubA"), 0.08f, false, 1, 3}, {TEXT("flora"), TEXT("GrassB"), 0.04f, false, 3, 5}};
		case Terrain::Peaks:
			return {{TEXT("rocks"), TEXT("CragA"), 0.62f, false, 1, 1}, {TEXT("rocks"), TEXT("CragB"), 0.52f, false, 1, 1},
				{TEXT("rocks"), TEXT("CragC"), 0.46f, false, 0, 1}, {TEXT("rocks"), TEXT("BoulderA"), 0.10f, false, 1, 2},
				{TEXT("rocks"), TEXT("BoulderB"), 0.09f, false, 1, 2}, {TEXT("rocks"), TEXT("BoulderC"), 0.08f, false, 1, 2},
				{TEXT("village"), TEXT("Mine"), 0.18f, false, 0, 1}, {TEXT("flora"), TEXT("Fir"), 0.30f, false, 0, 2}};
		case Terrain::Waste:
			return {{TEXT("props"), TEXT("Ruin"), 0.34f, true, 1, 1}, {TEXT("props"), TEXT("DesertStones"), 0.06f, false, 2, 3},
				{TEXT("flora"), TEXT("DryScrub"), 0.06f, false, 3, 5}, {TEXT("props"), TEXT("SandRidge"), 0.28f, true, 1, 2}};
		}
		return {};
	}
}

ACatnightBoardActor::ACatnightBoardActor()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Root);
	Camera->SetFieldOfView(38.f);
	Camera->PostProcessSettings.bOverride_AutoExposureBias = true;
	Camera->PostProcessSettings.AutoExposureBias = 0.6f;
	Camera->PostProcessSettings.bOverride_VignetteIntensity = true;
	Camera->PostProcessSettings.VignetteIntensity = 0.35f;
	Tiles = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Tiles"));
	Tiles->SetupAttachment(Root);
	Tiles->bUseAsyncCooking = true;
	Tiles->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void ACatnightBoardActor::Setup(TSharedPtr<FCatnightMatch> InMatch, TSharedPtr<FCatnightBoardView> InView)
{
	Match = InMatch;
	View = InView;
	TintBase = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Generated/Materials/M_Tint.M_Tint"));
	GlowBase = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Generated/Materials/M_Glow.M_Glow"));
	VertexColorBase = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Generated/Materials/M_VertexColor.M_VertexColor"));
	WaterBase = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Generated/Materials/M_Water.M_Water"));
	if (!TintBase) UE_LOG(LogTemp, Warning, TEXT("Catnight: generated materials missing; run pnpm catnight:import"));
	ChangedHandle = Match->OnChanged.AddLambda([this] { bPiecesDirty = true; });
	TWeakObjectPtr<ACatnightBoardActor> Weak(this);
	View->PickUnderMouse = [Weak]() { return Weak.IsValid() ? Weak->PickUnderMouse() : INDEX_NONE; };
	View->MoveCamera = [Weak](float DYaw, float DPitch, float Zoom)
	{
		if (!Weak.IsValid()) return;
		// Zoom 0 asks for the starting view (Home / right-stick click), the nearest whole turn away.
		if (Zoom <= 0.f)
		{
			Weak->GoalYaw = FMath::RoundToFloat(Weak->Yaw / 360.f) * 360.f;
			Weak->GoalPitch = -56.f;
			Weak->GoalDistance = 20.5f * R;
			return;
		}
		Weak->GoalYaw += DYaw;
		Weak->GoalPitch = FMath::Clamp(Weak->GoalPitch + DPitch, -86.f, -28.f);
		// The camera orbits the island's centre and cannot pan, so the closest view still shows a
		// good part of the island (closer, it stared at two hexes with no way to look elsewhere).
		Weak->GoalDistance = FMath::Clamp(Weak->GoalDistance * Zoom, 10.f * R, 26.f * R);
	};
	BuildRoom();
	bPiecesDirty = true;
	bPickTest = FParse::Param(FCommandLine::Get(), TEXT("CatnightPickTest"));
	if (APlayerController* PC = GetWorld()->GetFirstPlayerController())
	{
		PC->bAutoManageActiveCameraTarget = false;
		PC->SetViewTarget(this);
	}
}

void ACatnightBoardActor::EndPlay(const EEndPlayReason::Type Reason)
{
	if (Match) Match->OnChanged.Remove(ChangedHandle);
	if (View)
	{
		View->PickUnderMouse = nullptr;
		View->MoveCamera = nullptr;
	}
	Super::EndPlay(Reason);
}

// ------------------------------------------------------------------ helpers

FVector ACatnightBoardActor::LatticeToWorld(float X, float Y, float Z) const
{
	// The 2D board's lattice: x to the right, y down the screen. Seen from the default camera
	// (south, looking north along +X), right is +Y and down the screen is -X.
	return FVector(-Y * 0.5f * R, X * 0.8660254f * R, Z);
}

FVector ACatnightBoardActor::VertexWorld(int32 V) const
{
	const std::string& Id = GetTopology().vertexIds[V];
	const size_t Comma = Id.find(',');
	return LatticeToWorld(static_cast<float>(std::stoi(Id.substr(0, Comma))), static_cast<float>(std::stoi(Id.substr(Comma + 1))));
}

FVector ACatnightBoardActor::HexWorld(int32 H) const
{
	const Axial& A = GetTopology().hexes[H];
	return LatticeToWorld(static_cast<float>(2 * A.q + A.r), static_cast<float>(3 * A.r));
}

FVector ACatnightBoardActor::EdgeWorld(int32 E) const
{
	const auto& Ends = GetTopology().edgeVertices[E];
	return (VertexWorld(Ends[0]) + VertexWorld(Ends[1])) * 0.5f;
}

FVector ACatnightBoardActor::TargetWorld(int32 Kind, int32 I) const
{
	switch (static_cast<FBoardTargets::EKind>(Kind))
	{
	case FBoardTargets::EKind::Vertex: return VertexWorld(I);
	case FBoardTargets::EKind::Edge: return EdgeWorld(I);
	case FBoardTargets::EKind::Hex: return HexWorld(I);
	default: return FVector::ZeroVector;
	}
}

UStaticMesh* ACatnightBoardActor::Model(const TCHAR* Family, const TCHAR* Name)
{
	const FString Path = FString::Printf(TEXT("/Game/Generated/Models/%s/SM_%s.SM_%s"), Family, Name, Name);
	if (TObjectPtr<UStaticMesh>* Found = Meshes.Find(Path)) return *Found;
	UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *Path);
	if (!Mesh && !Missing.Contains(Path))
	{
		Missing.Add(Path);
		UE_LOG(LogTemp, Warning, TEXT("Catnight: missing model %s (run pnpm catnight:import)"), *Path);
	}
	Meshes.Add(Path, Mesh);
	return Mesh;
}

UStaticMesh* ACatnightBoardActor::Shape(const TCHAR* Name)
{
	const FString Path = FString::Printf(TEXT("/Engine/BasicShapes/%s.%s"), Name, Name);
	if (TObjectPtr<UStaticMesh>* Found = Meshes.Find(Path)) return *Found;
	UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *Path);
	Meshes.Add(Path, Mesh);
	return Mesh;
}

UMaterialInstanceDynamic* ACatnightBoardActor::Tint(const FLinearColor& Color, float Roughness, float Metallic)
{
	if (!TintBase) return nullptr;
	UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(TintBase, this);
	M->SetVectorParameterValue(TEXT("Color"), Color);
	M->SetScalarParameterValue(TEXT("Roughness"), Roughness);
	M->SetScalarParameterValue(TEXT("Metallic"), Metallic);
	return M;
}

UMaterialInstanceDynamic* ACatnightBoardActor::Glow(const FLinearColor& Color, float Opacity)
{
	if (!GlowBase) return nullptr;
	UMaterialInstanceDynamic* M = UMaterialInstanceDynamic::Create(GlowBase, this);
	M->SetVectorParameterValue(TEXT("Color"), Color);
	M->SetScalarParameterValue(TEXT("Opacity"), Opacity);
	return M;
}

UStaticMeshComponent* ACatnightBoardActor::AddMesh(TArray<TObjectPtr<UActorComponent>>& Into, UStaticMesh* Mesh, const FTransform& T, UMaterialInterface* Override)
{
	if (!Mesh) return nullptr;
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
	C->SetStaticMesh(Mesh);
	C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	C->SetupAttachment(Root);
	C->SetRelativeTransform(T);
	if (Override)
	{
		for (int32 I = 0; I < C->GetNumMaterials(); I++) C->SetMaterial(I, Override);
	}
	C->RegisterComponent();
	Into.Add(C);
	return C;
}

FTransform ACatnightBoardActor::Fit(UStaticMesh* Mesh, const FVector& Base, float InYaw, float Size, bool bFootprint) const
{
	const FBox Box = Mesh->GetBoundingBox();
	const FVector Extent = Box.GetSize();
	const float Measure = bFootprint ? FMath::Max(Extent.X, Extent.Y) : Extent.Z;
	const float Scale = Measure > KINDA_SMALL_NUMBER ? Size * R / Measure : 1.f;
	const FRotator Rot(0.f, InYaw, 0.f);
	// Stand the model's lowest point on Base, centred on its footprint.
	const FVector Pivot(Box.GetCenter().X, Box.GetCenter().Y, Box.Min.Z);
	const FVector Offset = Rot.RotateVector(Pivot * Scale);
	return FTransform(Rot, Base - Offset, FVector(Scale));
}

void ACatnightBoardActor::Scatter(UStaticMesh* Mesh, const FVector& Base, float InYaw, float Size, bool bFootprint)
{
	if (!Mesh) return;
	TObjectPtr<UHierarchicalInstancedStaticMeshComponent>& H = Instancers.FindOrAdd(Mesh);
	if (!H)
	{
		H = NewObject<UHierarchicalInstancedStaticMeshComponent>(this);
		H->SetStaticMesh(Mesh);
		H->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		H->SetupAttachment(Root);
		H->RegisterComponent();
		IslandParts.Add(H);
	}
	H->AddInstance(Fit(Mesh, Base, InYaw, Size, bFootprint), false);
}

void ACatnightBoardActor::Clear(TArray<TObjectPtr<UActorComponent>>& Parts)
{
	for (UActorComponent* C : Parts)
		if (C) C->DestroyComponent();
	Parts.Reset();
}

void ACatnightBoardActor::PaintOwner(UStaticMeshComponent* C, const FLinearColor& Color)
{
	// The web models mark the owner's colour (ridge, shutters, banners) with an "Owner" material.
	if (!C) return;
	const TArray<FName> Slots = C->GetMaterialSlotNames();
	for (int32 I = 0; I < C->GetNumMaterials(); I++)
	{
		const UMaterialInterface* M = C->GetMaterial(I);
		const FString Name = (Slots.IsValidIndex(I) ? Slots[I].ToString() : FString()) + TEXT(" ") + (M ? M->GetName() : FString());
		if (!Name.Contains(TEXT("Owner"))) continue;
		// M_Model multiplies texture and vertex paint by Color, as the web game tints these parts.
		UMaterialInstanceDynamic* Mid = UMaterialInstanceDynamic::Create(C->GetMaterial(I), this);
		Mid->SetVectorParameterValue(TEXT("Color"), Color);
		C->SetMaterial(I, Mid);
	}
}

// ------------------------------------------------------------------ the room

void ACatnightBoardActor::BuildRoom()
{
	Clear(RoomParts);
	// Sun, moon, sky, fog and exposure follow the game's clock: ACatnightDaylightActor.

	// The war table: an oak top with a raised rim round a sea tray.
	UMaterialInterface* Oak = Tint(CatnightUi::Srgb(92, 60, 36), 0.55f);
	UMaterialInterface* DarkOak = Tint(CatnightUi::Srgb(58, 38, 24), 0.5f);
	UStaticMesh* Cube = Shape(TEXT("Cube"));
	const float W = 15.f * R, D = 13.f * R;
	AddMesh(RoomParts, Cube, FTransform(FRotator::ZeroRotator, FVector(0, 0, -0.5f * R), FVector(D / 100.f + 2.f * R / 100.f, W / 100.f + 2.f * R / 100.f, 0.6f * R / 100.f)), Oak);
	const float Rim = 0.5f * R;
	AddMesh(RoomParts, Cube, FTransform(FRotator::ZeroRotator, FVector(D * 0.5f + Rim * 0.5f, 0, -0.12f * R), FVector(Rim / 100.f, (W + 2 * Rim) / 100.f, 0.22f * R / 100.f)), DarkOak);
	AddMesh(RoomParts, Cube, FTransform(FRotator::ZeroRotator, FVector(-D * 0.5f - Rim * 0.5f, 0, -0.12f * R), FVector(Rim / 100.f, (W + 2 * Rim) / 100.f, 0.22f * R / 100.f)), DarkOak);
	AddMesh(RoomParts, Cube, FTransform(FRotator::ZeroRotator, FVector(0, W * 0.5f + Rim * 0.5f, -0.12f * R), FVector(D / 100.f, Rim / 100.f, 0.22f * R / 100.f)), DarkOak);
	AddMesh(RoomParts, Cube, FTransform(FRotator::ZeroRotator, FVector(0, -W * 0.5f - Rim * 0.5f, -0.12f * R), FVector(D / 100.f, Rim / 100.f, 0.22f * R / 100.f)), DarkOak);
	UStaticMeshComponent* Sea = AddMesh(RoomParts, Shape(TEXT("Plane")), FTransform(FRotator::ZeroRotator, FVector(0, 0, -0.1f * R), FVector(D / 100.f, W / 100.f, 1.f)), WaterBase);
	if (Sea && !WaterBase) Sea->SetMaterial(0, Tint(CatnightUi::Srgb(24, 78, 104), 0.1f));
	// The hall floor far below, so low camera angles never look into nothing.
	AddMesh(RoomParts, Shape(TEXT("Plane")), FTransform(FRotator::ZeroRotator, FVector(0, 0, -9.f * R), FVector(4000.f, 4000.f, 1.f)), Tint(CatnightUi::Srgb(46, 44, 42), 0.9f));
}

// ------------------------------------------------------------------ the island

void ACatnightBoardActor::BuildIsland()
{
	Clear(IslandParts);
	Instancers.Reset();
	const GameState& S = Match->State();
	const Topology& T = GetTopology();

	// Tiles: a sand shelf under each hex, then the terrain slab with bevelled sides.
	TArray<FVector> V;
	TArray<int32> Tri;
	TArray<FVector> N;
	TArray<FVector2D> UV;
	TArray<FLinearColor> Col;
	TArray<FProcMeshTangent> Tan;
	auto Face = [&](const FVector& A, const FVector& B, const FVector& C, const FLinearColor& Color)
	{
		const FVector Normal = FVector::CrossProduct(C - A, B - A).GetSafeNormal();
		const int32 Base = V.Num();
		V.Append({A, B, C});
		// Unreal draws clockwise triangles (seen from the front) as the front face.
		Tri.Append({Base, Base + 1, Base + 2});
		N.Append({Normal, Normal, Normal});
		UV.Append({FVector2D(A.X, A.Y) / R, FVector2D(B.X, B.Y) / R, FVector2D(C.X, C.Y) / R});
		Col.Append({Color, Color, Color});
		Tan.Append({FProcMeshTangent(), FProcMeshTangent(), FProcMeshTangent()});
	};
	auto Prism = [&](const FVector& Center, const TArray<FVector>& Ring, float Top, float Bottom, const FLinearColor& TopColor, const FLinearColor& SideColor, FRandomStream& Rng, float Vary)
	{
		const FVector C(Center.X, Center.Y, Top);
		for (int32 K = 0; K < Ring.Num(); K++)
		{
			const FVector A(Ring[K].X, Ring[K].Y, Top);
			const FVector B(Ring[(K + 1) % Ring.Num()].X, Ring[(K + 1) % Ring.Num()].Y, Top);
			const float Shade = 1.f + Rng.FRandRange(-Vary, Vary);
			Face(C, A, B, TopColor * Shade);
			const FVector A2(A.X, A.Y, Bottom), B2(B.X, B.Y, Bottom);
			Face(A, A2, B2, SideColor);
			Face(A, B2, B, SideColor);
		}
	};
	const FLinearColor Sand = CatnightUi::Srgb(214, 192, 142);
	const FLinearColor SandSide = CatnightUi::Srgb(168, 146, 104);
	for (const HexTile& Hex : S.board.hexes)
	{
		FRandomStream Rng(static_cast<int32>(FCrc::StrCrc32(UTF8_TO_TCHAR(S.config.seed.c_str())) + Hex.id * 7919));
		const FVector C = HexWorld(Hex.id);
		TArray<FVector> Shelf, Slab;
		for (int32 Vx : T.hexVertices[Hex.id])
		{
			const FVector P = VertexWorld(Vx);
			Shelf.Add(C + (P - C) * 1.1f);
			Slab.Add(C + (P - C) * 0.965f);
		}
		Prism(C, Shelf, -0.05f * R, -0.12f * R, Sand, SandSide, Rng, 0.03f);
		const FLinearColor Top = TerrainColor(Hex.terrain);
		Prism(C, Slab, 0.f, -0.06f * R, Top, Top * 0.6f, Rng, 0.07f);
	}
	Tiles->ClearAllMeshSections();
	Tiles->CreateMeshSection_LinearColor(0, V, Tri, N, UV, Col, Tan, false);
	if (VertexColorBase) Tiles->SetMaterial(0, VertexColorBase);

	// Scenery, seeded by the board so the same seed always looks the same.
	for (const HexTile& Hex : S.board.hexes)
	{
		FRandomStream Rng(static_cast<int32>(FCrc::StrCrc32(UTF8_TO_TCHAR(S.config.seed.c_str())) ^ (Hex.id * 104729 + 17)));
		const FVector C = HexWorld(Hex.id);
		TArray<FVector> Corners;
		for (int32 Vx : T.hexVertices[Hex.id]) Corners.Add(VertexWorld(Vx));
		TArray<TPair<FVector, float>> Taken;
		const float ClearRadius = Hex.token ? 0.36f * R : 0.22f * R;
		for (const FDress& D : DressFor(Hex.terrain))
		{
			UStaticMesh* Mesh = Model(D.Family, D.Name);
			const int32 Count = Rng.RandRange(D.Min, D.Max);
			const float Radius = (D.bFootprint ? 0.5f : 0.28f) * D.Size * R;
			for (int32 K = 0; K < Count; K++)
			{
				for (int32 Try = 0; Try < 24; Try++)
				{
					const float Ang = Rng.FRandRange(0.f, 2.f * PI);
					const float Dist = FMath::Sqrt(Rng.FRand()) * 0.76f * R;
					const FVector P = C + FVector(FMath::Cos(Ang), FMath::Sin(Ang), 0.f) * Dist;
					if (FVector::Dist2D(P, C) < ClearRadius + Radius) continue;
					bool bFree = true;
					for (const FVector& Corner : Corners)
						if (FVector::Dist2D(P, Corner) < 0.26f * R + Radius) bFree = false;
					for (const TPair<FVector, float>& Other : Taken)
						if (FVector::Dist2D(P, Other.Key) < (Other.Value + Radius) * 0.9f) bFree = false;
					if (!bFree) continue;
					Taken.Add({P, Radius});
					Scatter(Mesh, P, Rng.FRandRange(0.f, 360.f), D.Size * Rng.FRandRange(0.85f, 1.15f), D.bFootprint);
					break;
				}
			}
		}
	}

	// Number tokens: ivory discs with the number and its odds.
	UMaterialInterface* Ivory = Tint(CatnightUi::Srgb(236, 226, 198), 0.45f);
	UMaterialInterface* RedInk = Tint(CatnightUi::Srgb(168, 28, 28), 0.5f);
	UMaterialInterface* DarkInk = Tint(CatnightUi::Srgb(30, 26, 22), 0.5f);
	for (const HexTile& Hex : S.board.hexes)
	{
		if (!Hex.token) continue;
		const FVector C = HexWorld(Hex.id) + FVector(0, 0, 0.02f * R);
		AddMesh(IslandParts, Shape(TEXT("Cylinder")), FTransform(FRotator::ZeroRotator, C, FVector(0.46f * R / 100.f, 0.46f * R / 100.f, 0.04f * R / 100.f)), Ivory);
		const bool bRed = Hex.token == 6 || Hex.token == 8;
		const FColor Ink = bRed ? FColor(168, 28, 28) : FColor(30, 26, 22);
		UTextRenderComponent* Text = NewObject<UTextRenderComponent>(this);
		Text->SetupAttachment(Root);
		Text->SetText(FText::FromString(FString::FromInt(Hex.token)));
		Text->SetHorizontalAlignment(EHTA_Center);
		Text->SetVerticalAlignment(EVRTA_TextCenter);
		Text->SetTextRenderColor(Ink);
		Text->SetWorldSize(0.25f * R);
		// Lying flat, read from the south.
		Text->SetRelativeRotation(FRotator(90.f, 180.f, 0.f));
		Text->SetRelativeLocation(C + FVector(0.04f * R, 0, 0.025f * R));
		Text->RegisterComponent();
		IslandParts.Add(Text);
		// The odds as raised pips under the number (one per way two dice make it).
		UMaterialInterface* PipInk = bRed ? RedInk : DarkInk;
		const int32 Count = Pips(Hex.token);
		for (int32 K = 0; K < Count; K++)
		{
			const float Y = (K - (Count - 1) * 0.5f) * 0.055f * R;
			AddMesh(IslandParts, Shape(TEXT("Cylinder")), FTransform(FRotator::ZeroRotator, C + FVector(-0.14f * R, Y, 0.022f * R),
				FVector(0.032f * R / 100.f, 0.032f * R / 100.f, 0.01f * R / 100.f)), PipInk);
		}
	}

	// Harbours: a dock reaching from the two served corners, a boat, and the rate on a plaque.
	for (const Harbor& Hb : S.board.harbors)
	{
		const FVector A = VertexWorld(Hb.vertices[0]);
		const FVector B = VertexWorld(Hb.vertices[1]);
		const FVector M = (A + B) * 0.5f;
		const FVector Out = (M - HexWorld(Hb.hex)).GetSafeNormal2D();
		const float OutYaw = FMath::RadiansToDegrees(FMath::Atan2(Out.Y, Out.X));
		if (UStaticMesh* Dock = Model(TEXT("village"), TEXT("Dock")))
		{
			AddMesh(IslandParts, Dock, Fit(Dock, M + Out * 0.42f * R + FVector(0, 0, -0.1f * R), OutYaw, 0.42f, true));
		}
		FRandomStream Rng(Hb.hex * 31 + Hb.vertices[0]);
		static const TCHAR* Boats[] = {TEXT("Boat"), TEXT("BoatSloop"), TEXT("BoatStriped")};
		if (UStaticMesh* Boat = Model(TEXT("village"), Boats[Rng.RandRange(0, 2)]))
		{
			const FVector Side = FVector::CrossProduct(Out, FVector::UpVector);
			AddMesh(IslandParts, Boat, Fit(Boat, M + Out * 0.95f * R + Side * 0.3f * R + FVector(0, 0, -0.11f * R), OutYaw + 90.f, 0.3f, true));
		}
		const FVector Plaque = M + Out * 0.72f * R + FVector(0, 0, 0.02f * R);
		AddMesh(IslandParts, Shape(TEXT("Cylinder")), FTransform(FRotator::ZeroRotator, Plaque, FVector(0.36f * R / 100.f, 0.36f * R / 100.f, 0.04f * R / 100.f)), Ivory);
		UTextRenderComponent* Text = NewObject<UTextRenderComponent>(this);
		Text->SetupAttachment(Root);
		Text->SetText(FText::FromString(Hb.kind ? FString::Printf(TEXT("2:1\n%s"), *CatnightText::Resource(*Hb.kind)) : FString(TEXT("3:1"))));
		Text->SetHorizontalAlignment(EHTA_Center);
		Text->SetVerticalAlignment(EVRTA_TextCenter);
		Text->SetTextRenderColor(FColor(40, 32, 24));
		Text->SetWorldSize(Hb.kind ? 0.085f * R : 0.14f * R);
		Text->SetRelativeRotation(FRotator(90.f, 180.f, 0.f));
		Text->SetRelativeLocation(Plaque + FVector(0, 0, 0.025f * R));
		Text->RegisterComponent();
		IslandParts.Add(Text);
	}
}

// ------------------------------------------------------------------ pieces

void ACatnightBoardActor::BuildPieces()
{
	if (!Match || !Match->HasGame()) return;
	const GameState& S = Match->State();
	FString Signature = UTF8_TO_TCHAR(S.config.seed.c_str());
	for (const HexTile& Hex : S.board.hexes) Signature += FString::Printf(TEXT("%d%d"), static_cast<int32>(Hex.terrain), Hex.token);
	if (Signature != IslandSignature)
	{
		IslandSignature = Signature;
		BuildIsland();
	}
	Clear(PieceParts);
	const Topology& T = GetTopology();
	TArray<UMaterialInstanceDynamic*> Colors;
	for (const PlayerState& P : S.players) Colors.Add(Tint(CatnightUi::PlayerTint(P.color), 0.45f));
	UMaterialInterface* Ink = Tint(CatnightUi::Srgb(28, 24, 20), 0.7f);
	UStaticMesh* Cube = Shape(TEXT("Cube"));
	UStaticMesh* Cylinder = Shape(TEXT("Cylinder"));

	for (int32 E : S.causeways.order)
	{
		const int32 RoadOwner = *S.causeways.at[E];
		const FVector A = VertexWorld(T.edgeVertices[E][0]);
		const FVector B = VertexWorld(T.edgeVertices[E][1]);
		const FVector Mid = (A + B) * 0.5f;
		const float EdgeYaw = FMath::RadiansToDegrees(FMath::Atan2(B.Y - A.Y, B.X - A.X));
		const float Len = FVector::Dist(A, B) * 0.62f;
		AddMesh(PieceParts, Cube, FTransform(FRotator(0, EdgeYaw, 0), Mid + FVector(0, 0, 0.03f * R), FVector(Len / 100.f, 0.1f * R / 100.f, 0.05f * R / 100.f)), Ink);
		AddMesh(PieceParts, Cube, FTransform(FRotator(0, EdgeYaw, 0), Mid + FVector(0, 0, 0.045f * R), FVector((Len - 0.03f * R) / 100.f, 0.075f * R / 100.f, 0.05f * R / 100.f)), Colors[RoadOwner]);
	}

	for (int32 Vx : S.buildings.order)
	{
		const Building& Bd = *S.buildings.at[Vx];
		const FVector P = VertexWorld(Vx);
		// Face the building's best neighbouring land (the first hex is fine for a miniature).
		const FVector Toward = HexWorld(T.vertexHexes[Vx].front()) - P;
		const float FaceYaw = FMath::RadiansToDegrees(FMath::Atan2(Toward.Y, Toward.X));
		const bool bCity = Bd.kind == BuildingKind::Citadel;
		const float Disc = (bCity ? 0.22f : 0.17f) * R;
		AddMesh(PieceParts, Cylinder, FTransform(FRotator::ZeroRotator, P + FVector(0, 0, 0.01f * R), FVector(2 * Disc / 100.f, 2 * Disc / 100.f, 0.03f * R / 100.f)), Colors[Bd.owner]);
		UStaticMesh* Mesh = Model(TEXT("village"), bCity ? TEXT("Hall") : TEXT("Cottage"));
		if (Mesh)
		{
			UStaticMeshComponent* C = AddMesh(PieceParts, Mesh, Fit(Mesh, P + FVector(0, 0, 0.025f * R), FaceYaw + 90.f, bCity ? 0.4f : 0.3f, true));
			PaintOwner(C, CatnightUi::PlayerTint(S.players[Bd.owner].color));
		}
		else
		{
			AddMesh(PieceParts, Cube, FTransform(FRotator(0, FaceYaw, 0), P + FVector(0, 0, 0.1f * R), FVector(Disc * 1.4f / 100.f, Disc * 1.4f / 100.f, 0.18f * R / 100.f)), Colors[Bd.owner]);
		}
	}

	// The robber, beside the token (or in the middle of the desert).
	{
		const HexTile& Hex = S.board.hexes[S.wraithHex];
		const FVector P = HexWorld(S.wraithHex) + (Hex.token ? FVector(0, -0.5f * R, 0) : FVector::ZeroVector);
		if (UStaticMesh* Robber = Model(TEXT("village"), TEXT("Robber")))
		{
			AddMesh(PieceParts, Robber, Fit(Robber, P, 180.f, 0.42f, false));
		}
		else
		{
			AddMesh(PieceParts, Cylinder, FTransform(FRotator::ZeroRotator, P + FVector(0, 0, 0.2f * R), FVector(0.2f * R / 100.f, 0.2f * R / 100.f, 0.4f * R / 100.f)), Ink);
		}
	}
	bPiecesDirty = false;
	SeenRevision = ~0u;  // markers sit on top of pieces: redo them too
}

void ACatnightBoardActor::BuildMarkers()
{
	Clear(MarkerParts);
	if (!View) return;
	SeenRevision = View->Revision;
	const FBoardTargets& Tg = View->Targets;
	if (Tg.Kind == FBoardTargets::EKind::None) return;
	const GameState& S = Match->State();
	const Topology& T = GetTopology();
	UMaterialInterface* Soft = Glow(FLinearColor(1.f, 0.92f, 0.6f), 0.45f);
	UMaterialInterface* Strong = Glow(FLinearColor(1.f, 0.8f, 0.25f), 0.9f);
	UStaticMesh* Cylinder = Shape(TEXT("Cylinder"));
	UStaticMesh* Cube = Shape(TEXT("Cube"));
	for (int32 I : Tg.Legal)
	{
		const bool bHot = I == Tg.Hover || I == Tg.Focus;
		UMaterialInterface* M = bHot ? Strong : Soft;
		switch (Tg.Kind)
		{
		case FBoardTargets::EKind::Vertex:
		{
			const float Rad = (bHot ? 0.16f : 0.11f) * R;
			AddMesh(MarkerParts, Cylinder, FTransform(FRotator::ZeroRotator, VertexWorld(I) + FVector(0, 0, 0.06f * R), FVector(2 * Rad / 100.f, 2 * Rad / 100.f, 0.02f * R / 100.f)), M);
			break;
		}
		case FBoardTargets::EKind::Edge:
		{
			const FVector A = VertexWorld(T.edgeVertices[I][0]);
			const FVector B = VertexWorld(T.edgeVertices[I][1]);
			const float EdgeYaw = FMath::RadiansToDegrees(FMath::Atan2(B.Y - A.Y, B.X - A.X));
			AddMesh(MarkerParts, Cube, FTransform(FRotator(0, EdgeYaw, 0), (A + B) * 0.5f + FVector(0, 0, 0.07f * R),
				FVector(FVector::Dist(A, B) * 0.55f / 100.f, (bHot ? 0.12f : 0.08f) * R / 100.f, 0.02f * R / 100.f)), M);
			break;
		}
		case FBoardTargets::EKind::Hex:
			AddMesh(MarkerParts, Cylinder, FTransform(FRotator::ZeroRotator, HexWorld(I) + FVector(0, 0, 0.07f * R),
				FVector(1.2f * R / 100.f, 1.2f * R / 100.f, 0.01f * R / 100.f)), bHot ? Glow(FLinearColor(1.f, 0.78f, 0.2f), 0.45f) : Glow(FLinearColor(1.f, 0.9f, 0.6f), 0.14f));
			break;
		default: break;
		}
	}
	(void)S;
}

// ------------------------------------------------------------------ camera and picking

void ACatnightBoardActor::UpdateCamera(float DeltaSeconds)
{
	const float K = 1.f - FMath::Exp(-10.f * DeltaSeconds);
	Yaw += (GoalYaw - Yaw) * K;
	Pitch += (GoalPitch - Pitch) * K;
	Distance += (GoalDistance - Distance) * K;
	const FRotator Rot(Pitch, Yaw, 0.f);
	// Keep the island in the part of the screen the side panel leaves free.
	float PanelShare = 0.f;
	if (GEngine && GEngine->GameViewport && View && View->b3D)
	{
		FVector2D Size;
		GEngine->GameViewport->GetViewportSize(Size);
		if (Size.X > 0)
		{
			const float Dpi = GetDefault<UUserInterfaceSettings>()->GetDPIScaleBasedOnSize(FIntPoint(FMath::RoundToInt(Size.X), FMath::RoundToInt(Size.Y)));
			PanelShare = FMath::Clamp(420.f * Dpi / static_cast<float>(Size.X), 0.f, 0.6f);
		}
	}
	const float HalfWidth = Distance * FMath::Tan(FMath::DegreesToRadians(Camera->FieldOfView * 0.5f));
	const FVector Right = FRotationMatrix(Rot).GetUnitAxis(EAxis::Y);
	const FVector Focus = Right * HalfWidth * PanelShare + FVector(-0.2f * R, 0, 0);
	Camera->SetWorldLocationAndRotation(Focus - Rot.Vector() * Distance, Rot);
}

int32 ACatnightBoardActor::PickUnderMouse() const
{
	APlayerController* PC = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
	float X = 0, Y = 0;
	if (!PC || !PC->GetMousePosition(X, Y)) return INDEX_NONE;
	return PickAt(FVector2D(X, Y));
}

int32 ACatnightBoardActor::PickAt(FVector2D Pixel) const
{
	if (!View || View->Targets.Kind == FBoardTargets::EKind::None) return INDEX_NONE;
	APlayerController* PC = GetWorld() ? GetWorld()->GetFirstPlayerController() : nullptr;
	if (!PC) return INDEX_NONE;
	FVector Origin, Dir;
	if (!PC->DeprojectScreenPositionToWorld(Pixel.X, Pixel.Y, Origin, Dir) || FMath::Abs(Dir.Z) < KINDA_SMALL_NUMBER) return INDEX_NONE;
	const float PlaneZ = 0.05f * R;
	const FVector Hit = Origin + Dir * ((PlaneZ - Origin.Z) / Dir.Z);
	const FBoardTargets& Tg = View->Targets;
	const float Reach = (Tg.Kind == FBoardTargets::EKind::Vertex ? 0.34f : Tg.Kind == FBoardTargets::EKind::Edge ? 0.38f : 0.8f) * R;
	int32 Best = INDEX_NONE;
	float BestDist = Reach;
	for (int32 I : Tg.Legal)
	{
		const float D = FVector::Dist2D(TargetWorld(static_cast<int32>(Tg.Kind), I), Hit);
		if (D < BestDist)
		{
			BestDist = D;
			Best = I;
		}
	}
	return Best;
}

void ACatnightBoardActor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!Match || !View) return;
	if (bPiecesDirty && Match->HasGame()) BuildPieces();
	if (View->Revision != SeenRevision && Match->HasGame()) BuildMarkers();
	UpdateCamera(DeltaSeconds);
	if (bPickTest && View->Targets.Kind != FBoardTargets::EKind::None && GetGameTimeSinceCreation() > 3.f) RunPickTest();
}

void ACatnightBoardActor::RunPickTest()
{
	// -CatnightPickTest: every legal target, projected to the screen and picked back through the
	// same deprojection the mouse uses, must come back as itself (logged for the test scripts).
	bPickTest = false;
	APlayerController* PC = GetWorld()->GetFirstPlayerController();
	const FBoardTargets& Tg = View->Targets;
	int32 Good = 0, Seen = 0;
	for (int32 I : Tg.Legal)
	{
		FVector2D Pixel;
		const FVector World = TargetWorld(static_cast<int32>(Tg.Kind), I) + FVector(0, 0, 0.05f * R);
		if (!PC || !PC->ProjectWorldLocationToScreen(World, Pixel)) continue;
		Seen++;
		Good += PickAt(Pixel) == I ? 1 : 0;
	}
	UE_LOG(LogTemp, Display, TEXT("CATNIGHT PICK %d of %d targets picked back (%d legal)"), Good, Seen, Tg.Legal.Num());
}
