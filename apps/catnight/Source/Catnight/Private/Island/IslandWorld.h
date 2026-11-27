#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "CatnightRules/State.h"
#include "IslandWorld.generated.h"

class UHierarchicalInstancedStaticMeshComponent;
class UProceduralMeshComponent;
class UStaticMesh;
class UMaterialInstanceDynamic;
class FCatnightMatch;

/** Human-scale, deterministic counterpart of the live trading board. Also editable through MCP. */
UCLASS()
class CATNIGHT_API ACatnightIsland : public AActor
{
    GENERATED_BODY()
public:
    ACatnightIsland();
    virtual void OnConstruction(const FTransform& Transform) override;
    virtual void EndPlay(const EEndPlayReason::Type Reason) override;
    virtual void Tick(float Dt) override;
    void Setup(TSharedRef<FCatnightMatch> InMatch);
    UFUNCTION(CallInEditor, Category="Island") void RebuildIsland();
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Island") FString PreviewSeed = TEXT("island-rework");
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Island", meta=(ClampMin="6500", ClampMax="10000")) float TileRadius = 6500.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Island") float SunYaw = 135.f;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Island") int32 SceneryInstances = 0;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Island") int32 TerrainTriangles = 0;
    FVector HexPoint(int32 H) const;
    FVector VertexPoint(int32 V) const;
    FVector EntryPoint() const;
    float GroundHeight(FVector2D P) const;
    float SurfaceHeight(FVector2D P) const;
    float CoastDistance(FVector2D P) const;
    /** Smooth land field round the tile centres (with its gradient); the shore is where it equals CoastLevel. */
    float LandField(FVector2D P, FVector2D* Gradient) const;
    float TrailDistance(FVector2D P) const;
    /** Distance to the worn footpaths between hubs (wandering, inside the flattened lanes). */
    float FootpathDistance(FVector2D P) const;
    /** Rise over run of the walkable surface, from the collision samples. */
    float Slope(FVector2D P) const;
    bool CanWalk(FVector WorldPoint) const;
    bool ValidateRoutes(FString& Report) const;
    int32 TileAt(FVector WorldPoint) const;
    const catnight::Board& Map() const { return BoardData; }
private:
    struct FObstacle { FVector2D P; float Radius; };
    /** A mountain crag or clay hill raised between a tile's hub and its corners. */
    struct FMound { FVector2D P; float Radius; float Height; bool bCrag; };
    void Generate();
    void Ground();
    void Dress();
    void Lighting();
    void Harbor(FVector2D Shore, FVector2D Out);
    void RefreshBuildings();
    void ClearParts();
    UStaticMesh* Asset(const FString& Family, const FString& Name);
    UHierarchicalInstancedStaticMeshComponent* Group(const FString& Family, const FString& Name, const FLinearColor* Tint=nullptr);
    void Prop(const TCHAR* Family, const TCHAR* Name, FVector2D P, float Height, float Yaw=0, float SolidRadius=0, const FLinearColor* Tint=nullptr);
    /** Like Prop, but sunk into the ground (rock crowning a mound). */
    void Embed(const TCHAR* Family, const TCHAR* Name, FVector2D P, float Height, float Yaw, float Sink, float SolidRadius=0);
    void Mounds();
    /** Dense grass, flowers or wheat over tile H, on an even jittered grid. */
    void Cover(int32 H);
    bool Bare(FVector2D P) const;
    void Flock(FVector2D Centre, int32 Count, FRandomStream& Rand);
    void Solid(FVector2D P, float Radius, float Height);
    void Line(FVector2D A, FVector2D B, float Width, FLinearColor Color);
    bool Reserved(FVector2D P, float Radius) const;
    FLinearColor GroundColor(FVector2D P, float Height, float Steep) const;
    catnight::Board BoardData;
    TArray<FVector2D> Centers, Vertices;
    TArray<FMound> Hills;
    float CoastLevel = 0;
    TArray<TPair<FVector2D,FVector2D>> Trails;
    TArray<TPair<FVector2D,FVector2D>> Piers;
    TArray<FObstacle> Obstacles;
    TSharedPtr<FCatnightMatch> Match;
    FDelegateHandle ChangedHandle;
    UPROPERTY() TObjectPtr<UProceduralMeshComponent> Terrain;
    UPROPERTY() TArray<TObjectPtr<UActorComponent>> Parts;
    UPROPERTY() TArray<TObjectPtr<UActorComponent>> BuildingParts;
    UPROPERTY() TMap<FString,TObjectPtr<UStaticMesh>> Assets;
    UPROPERTY() TMap<FString,TObjectPtr<UHierarchicalInstancedStaticMeshComponent>> Groups;
    UPROPERTY() TObjectPtr<UHierarchicalInstancedStaticMeshComponent> RoadSurface;
    UPROPERTY() TArray<float> SurfaceSamples;
    UPROPERTY() int32 SurfaceN = 0;
    UPROPERTY() float SurfaceExtent = 0;
    UPROPERTY() float SurfaceStep = 400;
};
