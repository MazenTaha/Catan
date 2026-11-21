// The hall around the war table and the dice on it (docs/CATNIGHT_UI_PLAN.md §6, §4.6). A separate
// actor so the 3D board (ACatnightBoardActor) and its light stay exactly as they are: nothing here
// casts shadows on the table or lights the island.
//
// - Dice: two bone dice thrown across the free sea band right of the island on every roll, coming
//   to rest on the rolled faces (reduce motion: they appear at rest).
// - Hall (Settings → Hall around the table): flagstones and a rug under the table, oak legs,
//   candles on the table's corners, stone walls with pillars, flickering torches and banners in
//   the players' colours. Seen when the camera pulls back or tilts low.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "CatnightHallActor.generated.h"

class FCatnightMatch;
class UMaterialInstanceDynamic;
class UMaterialInterface;
class UPointLightComponent;
class UStaticMesh;
class UStaticMeshComponent;

UCLASS()
class ACatnightHallActor : public AActor
{
	GENERATED_BODY()

public:
	ACatnightHallActor();
	void Setup(TSharedPtr<FCatnightMatch> InMatch);
	virtual void Tick(float DeltaSeconds) override;

	/** Throws the dice to show these faces (1..6). */
	void Throw(int32 A, int32 B);
	/** Puts the dice at rest showing these faces, or hides them (0). */
	void Rest(int32 A, int32 B);

private:
	void BuildHall();
	void BuildDice();
	UStaticMesh* Shape(const TCHAR* Name);
	UMaterialInstanceDynamic* Tint(const FLinearColor& Color, float Roughness = 0.7f, float Metallic = 0.f);
	UMaterialInstanceDynamic* Glow(const FLinearColor& Color, float Opacity);
	UStaticMeshComponent* Add(UStaticMesh* Mesh, const FTransform& T, UMaterialInterface* Material, USceneComponent* Parent = nullptr);
	void AddTorch(const FVector& At, float Seed);
	/** The rotation that puts `Face` on top, turned by `Yaw` degrees. */
	static FQuat FaceUp(int32 Face, float Yaw);

	TSharedPtr<FCatnightMatch> Match;
	uint32 SeenSerial = 0;
	uint32 SeenPlayers = 0;

	UPROPERTY() TObjectPtr<USceneComponent> Root;
	UPROPERTY() TObjectPtr<UMaterialInterface> TintBase;
	UPROPERTY() TObjectPtr<UMaterialInterface> GlowBase;
	UPROPERTY() TArray<TObjectPtr<USceneComponent>> Dice;
	UPROPERTY() TArray<TObjectPtr<UPointLightComponent>> Lights;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> Flames;
	UPROPERTY() TArray<TObjectPtr<UStaticMeshComponent>> BannerCloths;
	TArray<float> LightBase;
	TArray<float> LightSeed;

	struct FThrow
	{
		FVector From, To;
		FQuat Final;
		FVector SpinAxis;
		float Spin = 0.f;
	};
	FThrow Throws[2];
	float ThrowTime = -1.f;  // < 0: at rest
	float Time = 0.f;
};
