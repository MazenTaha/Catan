// The 3D war table: the island as a miniature built from the match state, with the web game's
// Blender models as scenery and pieces, a sunlit sky, and the camera the table UI steers.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
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

private:
	void BuildRoom();
	void BuildIsland();
	void BuildPieces();
	void BuildMarkers();
	void UpdateCamera(float DeltaSeconds);
	int32 PickUnderMouse() const;
	int32 PickAt(FVector2D Pixel) const;
	void RunPickTest();

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

	FString IslandSignature;
	bool bPiecesDirty = true;
	uint32 SeenRevision = ~0u;
	TSet<FString> Missing;
	bool bPickTest = false;

	float Yaw = 0.f, Pitch = -56.f, Distance = 20.5f * R;
	float GoalYaw = 0.f, GoalPitch = -56.f, GoalDistance = 20.5f * R;
};
