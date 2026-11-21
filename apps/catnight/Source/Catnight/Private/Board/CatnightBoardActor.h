// The 3D war table: the island as a miniature built from the match state, with the web game's
// Blender models as scenery and pieces, a sunlit sky, and the camera the table UI steers.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "CatnightRules/State.h"
#include "CatnightBoardActor.generated.h"

class FCatnightMatch;
struct FCatnightBoardView;
class UCameraComponent;
class UProceduralMeshComponent;
class UHierarchicalInstancedStaticMeshComponent;
class UMaterialInstanceDynamic;
class UMaterialInterface;
class UStaticMesh;
class UStaticMeshComponent;

USTRUCT()
struct FCatnightBuildReveal
{
	GENERATED_BODY()
	float Started = 0.f;
	bool bCity = false;
	float Low = 0.f, High = 0.f;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Mesh;
	UPROPERTY() TArray<TObjectPtr<UMaterialInterface>> FinalMaterials;
	UPROPERTY() TArray<TObjectPtr<UMaterialInstanceDynamic>> RevealMaterials;
	UPROPERTY() TArray<TObjectPtr<UActorComponent>> Scaffold;
};

USTRUCT()
struct FCatnightDustMote
{
	GENERATED_BODY()
	float Started = 0.f;
	FVector Position = FVector::ZeroVector, Velocity = FVector::ZeroVector;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Mesh;
};

UCLASS()
class ACatnightBoardActor : public AActor
{
	GENERATED_BODY()

public:
	ACatnightBoardActor();
	void Setup(TSharedPtr<FCatnightMatch> InMatch, TSharedPtr<FCatnightBoardView> InView);
	virtual void Tick(float DeltaSeconds) override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

	/** Hex circumradius in world units (cm). Everything on the table scales from it. */
	static constexpr float R = 1000.f;
	bool HasPaidProduction() const { return !ProductionHexes.IsEmpty(); }

private:
	friend class FCatnightTableFeedbackTest;
	void BuildRoom();
	void BuildIsland();
	void BuildPieces();
	void BuildMarkers();
	void UpdateCamera(float DeltaSeconds);
	int32 PickUnderMouse() const;
	int32 PickAt(FVector2D Pixel) const;
	void RunPickTest();
	int32 InspectAt(FVector2D Pixel) const;
	void BuildFeedback();
	void ResetFeedback();
	void OnAction(const catnight::Action& Action, const std::vector<catnight::GameEvent>& Events);
	void AttachReveal(int32 Vertex, UStaticMeshComponent* Mesh);
	void FinishReveal(FCatnightBuildReveal& Reveal);
	void TickFeedback(float DeltaSeconds);
	void ShowProduction(const TArray<int32>& Paid, int32 Blocked);
	void SetDice(int32 First, int32 Second, bool bRoll);

	FVector LatticeToWorld(float X, float Y, float Z = 0.f) const;
	FVector VertexWorld(int32 V) const;
	FVector HexWorld(int32 H) const;
	FVector EdgeWorld(int32 E) const;
	FVector TargetWorld(int32 Kind, int32 I) const;

	UStaticMesh* Model(const TCHAR* Family, const TCHAR* Name);
	UStaticMesh* Shape(const TCHAR* Name);
	UMaterialInstanceDynamic* Tint(const FLinearColor& Color, float Roughness = 0.6f, float Metallic = 0.f);
	UMaterialInstanceDynamic* Glow(const FLinearColor& Color, float Opacity);
	UStaticMeshComponent* AddMesh(TArray<TObjectPtr<UActorComponent>>& Into, UStaticMesh* Mesh, const FTransform& T, UMaterialInterface* Override = nullptr);
	/** Places `Mesh` standing on `Base`, scaled so its height (or footprint) matches `Size`. */
	FTransform Fit(UStaticMesh* Mesh, const FVector& Base, float Yaw, float Size, bool bFootprint) const;
	void Scatter(UStaticMesh* Mesh, const FVector& Base, float Yaw, float Size, bool bFootprint);
	void Clear(TArray<TObjectPtr<UActorComponent>>& Parts);
	void PaintOwner(UStaticMeshComponent* C, const FLinearColor& Color);

	TSharedPtr<FCatnightMatch> Match;
	TSharedPtr<FCatnightBoardView> View;
	FDelegateHandle ChangedHandle;
	FDelegateHandle ActionHandle, RebuiltHandle;

	UPROPERTY() TObjectPtr<USceneComponent> Root;
	UPROPERTY() TObjectPtr<UCameraComponent> Camera;
	UPROPERTY() TObjectPtr<UProceduralMeshComponent> Tiles;
	UPROPERTY() TArray<TObjectPtr<UActorComponent>> RoomParts;
	UPROPERTY() TArray<TObjectPtr<UActorComponent>> IslandParts;
	UPROPERTY() TArray<TObjectPtr<UActorComponent>> PieceParts;
	UPROPERTY() TArray<TObjectPtr<UActorComponent>> MarkerParts;
	UPROPERTY() TMap<TObjectPtr<UStaticMesh>, TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> Instancers;
	UPROPERTY() TMap<FString, TObjectPtr<UStaticMesh>> Meshes;
	UPROPERTY() TObjectPtr<UMaterialInterface> TintBase;
	UPROPERTY() TObjectPtr<UMaterialInterface> GlowBase;
	UPROPERTY() TObjectPtr<UMaterialInterface> VertexColorBase;
	UPROPERTY() TObjectPtr<UMaterialInterface> WaterBase;
	UPROPERTY() TObjectPtr<UMaterialInterface> ConstructionBase;
	UPROPERTY() TArray<TObjectPtr<UActorComponent>> FeedbackParts;
	UPROPERTY() TArray<TObjectPtr<UActorComponent>> ProductionParts;
	UPROPERTY() TArray<TObjectPtr<USceneComponent>> DiceRoots;
	UPROPERTY() TArray<TObjectPtr<USceneComponent>> TokenRoots;
	UPROPERTY() TMap<int32, FCatnightBuildReveal> Builds;
	UPROPERTY() TArray<FCatnightDustMote> Dust;
	UPROPERTY() TObjectPtr<UMaterialInterface> DustMaterial;
	UPROPERTY() TArray<TObjectPtr<UMaterialInstanceDynamic>> ProductionMaterials;
	TArray<int32> ProductionHexes;
	int32 ProductionBlocked = INDEX_NONE;
	float FeedbackTime = 0.f, DiceStarted = -10.f, ProductionStarted = -10.f;
	int32 DiceFaces[2] = {1, 1};
	bool bWasReducedMotion = false, bDiceRolling = false;
	float TokenYaw = MAX_flt;
	bool bReviewCloseup = false;
	FVector ReviewFocus = FVector::ZeroVector;

	FString IslandSignature;
	bool bPiecesDirty = true;
	uint32 SeenRevision = ~0u;
	TSet<FString> Missing;
	bool bPickTest = false;

	float Yaw = 0.f, Pitch = -56.f, Distance = 20.5f * R;
	float GoalYaw = 0.f, GoalPitch = -56.f, GoalDistance = 20.5f * R;
};
