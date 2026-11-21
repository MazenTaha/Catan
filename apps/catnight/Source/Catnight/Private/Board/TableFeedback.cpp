#include "Board/CatnightBoardActor.h"

#include "Board/TablePresentation.h"
#include "CatnightMatch.h"
#include "CatnightRules/Board.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "ProceduralMeshComponent.h"
#include "Table/BoardView.h"
#include "Ui/CatnightUi.h"

using namespace catnight;

namespace
{
	const FVector TrayCenter(4.2f * ACatnightBoardActor::R, 4.5f * ACatnightBoardActor::R, 0.f);
	FVector DiceRest(int32 Die)
	{
		return TrayCenter + FVector(0.f, (Die == 0 ? -0.27f : 0.27f) * ACatnightBoardActor::R, 0.20f * ACatnightBoardActor::R);
	}
}

void ACatnightBoardActor::BuildFeedback()
{
	Clear(FeedbackParts);
	DiceRoots.Reset();
	DustMaterial = Tint(CatnightUi::Srgb(184, 151, 111), 1.f);
	UMaterialInterface* Timber = Tint(CatnightUi::Srgb(76, 45, 25), 0.75f);
	UMaterialInterface* Felt = Tint(CatnightUi::Srgb(54, 69, 53), 0.95f);
	UMaterialInterface* Bone = Tint(CatnightUi::Srgb(241, 228, 192), 0.36f);
	UMaterialInterface* PipInk = Tint(CatnightUi::Srgb(35, 26, 21), 0.5f);
	UStaticMesh* Cube = Shape(TEXT("Cube"));
	AddMesh(FeedbackParts, Cube, FTransform(FRotator::ZeroRotator, TrayCenter, FVector(1.05f * R / 100.f, 1.4f * R / 100.f, 0.12f * R / 100.f)), Timber);
	AddMesh(FeedbackParts, Cube, FTransform(FRotator::ZeroRotator, TrayCenter + FVector(0, 0, 0.065f * R), FVector(0.94f * R / 100.f, 1.29f * R / 100.f, 0.025f * R / 100.f)), Felt);
	for (int32 Side : {-1, 1})
	{
		AddMesh(FeedbackParts, Cube, FTransform(FRotator::ZeroRotator, TrayCenter + FVector(Side * 0.52f * R, 0, 0.09f * R), FVector(0.06f * R / 100.f, 1.4f * R / 100.f, 0.12f * R / 100.f)), Timber);
		AddMesh(FeedbackParts, Cube, FTransform(FRotator::ZeroRotator, TrayCenter + FVector(0, Side * 0.69f * R, 0.09f * R), FVector(1.05f * R / 100.f, 0.06f * R / 100.f, 0.12f * R / 100.f)), Timber);
	}
	// A bevelled, carved bone cube: six faces, twelve bevel strips, eight clipped corners.
	const float Half = 0.12f * R, Inner = Half * 0.85f;
	TArray<FVector> Vertices, Normals;
	TArray<int32> Indices;
	auto Polygon = [&](TArray<FVector> Points, const FVector& Normal)
	{
		const int32 Base = Vertices.Num();
		const bool bReverse = FVector::DotProduct(FVector::CrossProduct(Points[2] - Points[0], Points[1] - Points[0]), Normal) < 0;
		for (const FVector& P : Points) { Vertices.Add(P); Normals.Add(Normal); }
		for (int32 I = 1; I < Points.Num() - 1; I++)
		{
			Indices.Add(Base);
			Indices.Add(Base + (bReverse ? I + 1 : I));
			Indices.Add(Base + (bReverse ? I : I + 1));
		}
	};
	const FVector Axes[] = {FVector::ForwardVector, FVector::RightVector, FVector::UpVector};
	for (int32 Axis = 0; Axis < 3; Axis++)
		for (int32 Sign : {-1, 1})
		{
			const FVector N = Axes[Axis] * Sign, U = Axes[(Axis + 1) % 3], V = FVector::CrossProduct(N, U);
			Polygon({N * Half - U * Inner - V * Inner, N * Half - U * Inner + V * Inner,
				N * Half + U * Inner + V * Inner, N * Half + U * Inner - V * Inner}, N);
		}
	for (int32 Axis = 0; Axis < 3; Axis++)
		for (int32 A : {-1, 1}) for (int32 B : {-1, 1})
		{
			const FVector N1 = Axes[(Axis + 1) % 3] * A, N2 = Axes[(Axis + 2) % 3] * B, Along = Axes[Axis] * Inner;
			const FVector P = N1 * Half + N2 * Inner, Q = N1 * Inner + N2 * Half;
			Polygon({P - Along, P + Along, Q + Along, Q - Along}, (N1 + N2).GetSafeNormal());
		}
	for (int32 X : {-1, 1}) for (int32 Y : {-1, 1}) for (int32 Z : {-1, 1})
		Polygon({FVector(X * Half, Y * Inner, Z * Inner), FVector(X * Inner, Y * Half, Z * Inner),
			FVector(X * Inner, Y * Inner, Z * Half)}, FVector(X, Y, Z).GetSafeNormal());

	for (int32 Die = 0; Die < 2; Die++)
	{
		USceneComponent* Group = NewObject<USceneComponent>(this);
		Group->SetupAttachment(Root);
		Group->RegisterComponent();
		DiceRoots.Add(Group);
		FeedbackParts.Add(Group);
		UProceduralMeshComponent* Body = NewObject<UProceduralMeshComponent>(this);
		Body->SetupAttachment(Group);
		Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Body->RegisterComponent();
		Body->CreateMeshSection_LinearColor(0, Vertices, Indices, Normals, {}, {}, {}, false);
		Body->SetMaterial(0, Bone);
		FeedbackParts.Add(Body);
		UHierarchicalInstancedStaticMeshComponent* Dots = NewObject<UHierarchicalInstancedStaticMeshComponent>(this);
		Dots->SetupAttachment(Group);
		Dots->SetStaticMesh(Shape(TEXT("Sphere")));
		Dots->SetMaterial(0, PipInk);
		Dots->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Dots->RegisterComponent();
		FeedbackParts.Add(Dots);
		for (int32 Face = 1; Face <= 6; Face++)
		{
			const FVector N = CatnightTable::DiceNormal(Face);
			const FVector U = FMath::Abs(N.Z) > 0.5f ? FVector::ForwardVector : FVector::UpVector;
			const FVector V = FVector::CrossProduct(N, U);
			for (const FVector2D& P : CatnightTable::Pips(Face))
				Dots->AddInstance(FTransform(FQuat::FindBetweenNormals(FVector::UpVector, N), N * Half + (U * P.X + V * P.Y) * (2.f * Half),
					FVector(0.037f * R / 100.f, 0.037f * R / 100.f, 0.005f * R / 100.f)), false);
		}
	}
	ResetFeedback();
}

void ACatnightBoardActor::SetDice(int32 First, int32 Second, bool bRoll)
{
	bDiceRolling = bRoll && !View->bReducedMotion;
	DiceFaces[0] = First;
	DiceFaces[1] = Second;
	DiceStarted = bRoll && !View->bReducedMotion ? FeedbackTime : FeedbackTime - CatnightTable::DiceSeconds;
	for (int32 I = 0; I < DiceRoots.Num(); I++)
	{
		DiceRoots[I]->SetVisibility(true, true);
		DiceRoots[I]->SetRelativeLocationAndRotation(DiceRest(I), CatnightTable::DiceRotation(DiceFaces[I]));
	}
}

void ACatnightBoardActor::FinishReveal(FCatnightBuildReveal& Reveal)
{
	if (IsValid(Reveal.Mesh))
		for (int32 I = 0; I < Reveal.FinalMaterials.Num(); I++) Reveal.Mesh->SetMaterial(I, Reveal.FinalMaterials[I]);
	Clear(Reveal.Scaffold);
	Reveal.RevealMaterials.Reset();
}

void ACatnightBoardActor::ResetFeedback()
{
	for (auto& Pair : Builds) FinishReveal(Pair.Value);
	Builds.Reset();
	for (FCatnightDustMote& Mote : Dust) if (Mote.Mesh) Mote.Mesh->DestroyComponent();
	Dust.Reset();
	Clear(ProductionParts);
	ProductionMaterials.Reset();
	ProductionHexes.Reset();
	ProductionBlocked = INDEX_NONE;
	if (Match && Match->HasGame() && Match->State().dice)
		SetDice((*Match->State().dice)[0], (*Match->State().dice)[1], false);
	else { bDiceRolling = false; for (USceneComponent* Die : DiceRoots) Die->SetVisibility(false, true); }
	bWasReducedMotion = View->bReducedMotion;
}

void ACatnightBoardActor::OnAction(const Action& A, const std::vector<GameEvent>& Events)
{
	for (const GameEvent& E : Events)
	{
		const Json* Type = E.Get("type");
		if (!Type) continue;
		if (Type->AsStr() == "DiceRolled")
		{
			const auto& Values = E.Get("dice")->Items();
			SetDice(static_cast<int32>(Values[0].AsInt()), static_cast<int32>(Values[1].AsInt()), true);
			if (bReviewCloseup) { ReviewFocus = TrayCenter; GoalDistance = 4.5f * R; }
			ShowProduction({}, INDEX_NONE);
		}
		if (Type->AsStr() == "ResourcesProduced")
		{
			TArray<int32> Paid;
			for (const Json& H : E.Get("hexes")->Items()) Paid.Add(static_cast<int32>(H.AsInt()));
			const Json* Blocked = E.Get("blockedHex");
			ShowProduction(Paid, Blocked && Blocked->IsInt() ? static_cast<int32>(Blocked->AsInt()) : INDEX_NONE);
		}
		if (bReviewCloseup && (Type->AsStr() == "SetupOutpostPlaced" || Type->AsStr() == "OutpostBuilt" || Type->AsStr() == "CitadelBuilt"))
		{
			const int32 V = GetTopology().VertexIndex(A.vertex);
			if (V != INDEX_NONE) { ReviewFocus = VertexWorld(V); GoalDistance = 6.f * R; }
		}
		if ((Type->AsStr() == "SetupOutpostPlaced" || Type->AsStr() == "OutpostBuilt" || Type->AsStr() == "CitadelBuilt") && !View->bReducedMotion && ConstructionBase)
		{
			const int32 V = GetTopology().VertexIndex(A.vertex);
			if (V == INDEX_NONE) continue;
			if (FCatnightBuildReveal* Old = Builds.Find(V)) FinishReveal(*Old);
			FCatnightBuildReveal Reveal;
			Reveal.Started = FeedbackTime;
			Reveal.bCity = Type->AsStr() == "CitadelBuilt";
			Builds.Add(V, MoveTemp(Reveal));
		}
	}
}

void ACatnightBoardActor::AttachReveal(int32 Vertex, UStaticMeshComponent* Mesh)
{
	FCatnightBuildReveal* Reveal = Builds.Find(Vertex);
	if (!Reveal || !Mesh) return;
	Reveal->Mesh = Mesh;
	Reveal->FinalMaterials.Reset();
	Reveal->RevealMaterials.Reset();
	const FBox Bounds = Mesh->CalcBounds(Mesh->GetComponentTransform()).GetBox();
	Reveal->Low = Bounds.Min.Z - 2.f;
	Reveal->High = Bounds.Max.Z + 2.f;
	for (int32 I = 0; I < Mesh->GetNumMaterials(); I++)
	{
		UMaterialInterface* Original = Mesh->GetMaterial(I);
		Reveal->FinalMaterials.Add(Original);
		UMaterialInstanceDynamic* Mask = UMaterialInstanceDynamic::Create(ConstructionBase, this);
		Mask->CopyMaterialUniformParameters(Original);
		Mask->SetScalarParameterValue(TEXT("BuildHeight"), Reveal->Low);
		Mesh->SetMaterial(I, Mask);
		Reveal->RevealMaterials.Add(Mask);
	}
	if (Reveal->Scaffold.Num()) return;
	UMaterialInterface* Timber = Tint(CatnightUi::Srgb(121, 91, 53), 0.9f);
	const FVector Center = Bounds.GetCenter();
	const FVector Extent = Bounds.GetExtent() + FVector(0.025f * R, 0.025f * R, 0.04f * R);
	for (int32 X : {-1, 1}) for (int32 Y : {-1, 1})
	{
		AddMesh(Reveal->Scaffold, Shape(TEXT("Cube")), FTransform(FRotator::ZeroRotator,
			FVector(Center.X + X * Extent.X, Center.Y + Y * Extent.Y, Center.Z), FVector(0.013f * R / 100.f, 0.013f * R / 100.f, 2.f * Extent.Z / 100.f)), Timber);
		if (X == 1) for (float Level : {0.35f, 0.7f})
			AddMesh(Reveal->Scaffold, Shape(TEXT("Cube")), FTransform(FRotator::ZeroRotator,
				FVector(Center.X, Center.Y + Y * Extent.Y, Bounds.Min.Z + 2.f * Extent.Z * Level), FVector(2.f * Extent.X / 100.f, 0.012f * R / 100.f, 0.012f * R / 100.f)), Timber);
	}
	FRandomStream Rng(Vertex * 37 + Match->ActionCount());
	for (int32 I = 0; I < 9 && Dust.Num() < 64; I++)
	{
		FCatnightDustMote Mote;
		Mote.Started = FeedbackTime;
		Mote.Position = VertexWorld(Vertex) + FVector(Rng.FRandRange(-Extent.X, Extent.X), Rng.FRandRange(-Extent.Y, Extent.Y), 0.015f * R);
		Mote.Velocity = FVector(Rng.FRandRange(-0.08f, 0.08f) * R, Rng.FRandRange(-0.08f, 0.08f) * R, Rng.FRandRange(0.08f, 0.16f) * R);
		TArray<TObjectPtr<UActorComponent>> Holder;
		Mote.Mesh = AddMesh(Holder, Shape(TEXT("Sphere")), FTransform(FQuat::Identity, Mote.Position, FVector(0.01f * R / 100.f)), DustMaterial);
		Mote.Mesh->SetCastShadow(false);
		Dust.Add(MoveTemp(Mote));
	}
}

void ACatnightBoardActor::ShowProduction(const TArray<int32>& Paid, int32 Blocked)
{
	Clear(ProductionParts);
	ProductionMaterials.Reset();
	ProductionHexes = Paid;
	ProductionBlocked = Blocked;
	ProductionStarted = FeedbackTime + (View->bReducedMotion ? 0.f : CatnightTable::DiceSeconds);
	auto Marker = [&](int32 Hex, bool bBlocked)
	{
		UMaterialInstanceDynamic* Material = Glow(bBlocked ? CatnightUi::Srgb(190, 92, 62) : CatnightUi::Srgb(255, 203, 93), 0.f);
		ProductionMaterials.Add(Material);
		AddMesh(ProductionParts, Shape(TEXT("Cylinder")), FTransform(FRotator::ZeroRotator, HexWorld(Hex) + FVector(0, 0, 0.014f * R),
			FVector(0.8f * R / 100.f, 0.8f * R / 100.f, 0.008f * R / 100.f)), Material);
		UTextRenderComponent* Mark = NewObject<UTextRenderComponent>(this);
		Mark->SetupAttachment(Root);
		Mark->SetText(FText::FromString(bBlocked ? TEXT("X") : TEXT("+")));
		Mark->SetHorizontalAlignment(EHTA_Center);
		Mark->SetVerticalAlignment(EVRTA_TextCenter);
		Mark->SetTextRenderColor(bBlocked ? FColor(190, 70, 40) : FColor(255, 203, 93));
		Mark->SetWorldSize(0.16f * R);
		Mark->SetRelativeLocation(HexWorld(Hex) + FVector(0.36f * R, 0, 0.05f * R));
		Mark->SetRelativeRotation(FRotator(90, 180.f + Yaw, 0));
		Mark->RegisterComponent();
		Mark->SetVisibility(false);
		ProductionParts.Add(Mark);
	};
	for (int32 H : Paid) Marker(H, false);
	if (Blocked != INDEX_NONE) Marker(Blocked, true);
}

void ACatnightBoardActor::TickFeedback(float DeltaSeconds)
{
	FeedbackTime += DeltaSeconds;
	if (View->bReducedMotion && !bWasReducedMotion)
	{
		for (auto& Pair : Builds) FinishReveal(Pair.Value);
		Builds.Reset();
		for (FCatnightDustMote& Mote : Dust) if (Mote.Mesh) Mote.Mesh->DestroyComponent();
		Dust.Reset();
		DiceStarted = FeedbackTime - CatnightTable::DiceSeconds;
	}
	bWasReducedMotion = View->bReducedMotion;
	if (!FMath::IsNearlyEqual(TokenYaw, Yaw, 0.02f))
	{
		for (USceneComponent* Token : TokenRoots) Token->SetRelativeRotation(FRotator(0, Yaw, 0));
		TokenYaw = Yaw;
	}
	if (bDiceRolling) for (int32 I = 0; I < DiceRoots.Num(); I++)
	{
		const float T = FMath::Clamp((FeedbackTime - DiceStarted) / CatnightTable::DiceSeconds, 0.f, 1.f);
		const float Left = (1.f - T) * (1.f - T);
		const FQuat Spin = FRotator(Left * (I ? -540.f : 720.f), Left * 540.f, Left * 360.f).Quaternion();
		const FVector Toss(Left * 0.26f * R, Left * (I ? 0.18f : -0.18f) * R, FMath::Abs(FMath::Sin(T * PI * 3.f)) * Left * 0.42f * R);
		DiceRoots[I]->SetRelativeLocationAndRotation(DiceRest(I) + Toss, Spin * CatnightTable::DiceRotation(DiceFaces[I]));
		if (T >= 1.f && I == DiceRoots.Num() - 1) bDiceRolling = false;
	}
	for (auto It = Builds.CreateIterator(); It; ++It)
	{
		FCatnightBuildReveal& Reveal = It.Value();
		const float T = FMath::Clamp((FeedbackTime - Reveal.Started) / CatnightTable::ConstructionSeconds, 0.f, 1.f);
		const float Smooth = T * T * (3.f - 2.f * T);
		for (UMaterialInstanceDynamic* Material : Reveal.RevealMaterials) Material->SetScalarParameterValue(TEXT("BuildHeight"), FMath::Lerp(Reveal.Low, Reveal.High, Smooth));
		if (T >= 1.f) { FinishReveal(Reveal); It.RemoveCurrent(); }
	}
	for (int32 I = Dust.Num() - 1; I >= 0; I--)
	{
		FCatnightDustMote& Mote = Dust[I];
		const float Age = FeedbackTime - Mote.Started;
		if (Age >= 1.4f) { Mote.Mesh->DestroyComponent(); Dust.RemoveAtSwap(I); continue; }
		Mote.Mesh->SetRelativeLocation(Mote.Position + Mote.Velocity * Age - FVector(0, 0, 0.025f * R * Age * Age));
		Mote.Mesh->SetRelativeScale3D(FVector((0.012f + 0.025f * Age) * (1.f - Age / 1.4f) * R / 100.f));
	}
	const float Age = FeedbackTime - ProductionStarted;
	if (Age > 3.f && ProductionParts.Num())
	{
		Clear(ProductionParts);
		ProductionMaterials.Reset();
		ProductionHexes.Reset();
		ProductionBlocked = INDEX_NONE;
	}
	const float Opacity = Age < 0 ? 0.f : View->bReducedMotion ? 0.22f : 0.26f * FMath::Clamp(3.f - Age, 0.f, 1.f);
	for (UMaterialInstanceDynamic* Material : ProductionMaterials) Material->SetScalarParameterValue(TEXT("Opacity"), Opacity);
	for (UActorComponent* Part : ProductionParts) if (UTextRenderComponent* Text = Cast<UTextRenderComponent>(Part))
	{
		Text->SetVisibility(Age >= 0.f);
		Text->SetRelativeRotation(FRotator(90, 180.f + Yaw, 0));
	}
}
