#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "HeroYard.generated.h"

UCLASS()
class ACatnightHeroYard : public AActor
{
	GENERATED_BODY()
public:
	ACatnightHeroYard();
	virtual void BeginPlay() override;
private:
	void Block(const FVector& Position, const FVector& Size, const FLinearColor& Color, const FRotator& Rotation = FRotator::ZeroRotator);
	void Model(const TCHAR* Family, const TCHAR* Name, const FVector& Position, float Height, float Yaw);
	UPROPERTY() TArray<TObjectPtr<UActorComponent>> Parts;
};
