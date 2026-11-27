#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "HeroPawn.generated.h"

UCLASS()
class ACatnightHero : public ACharacter
{
	GENERATED_BODY()
public:
	ACatnightHero();
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;
	virtual void Tick(float Dt) override;
	virtual void SetupPlayerInputComponent(UInputComponent* Input) override;
	virtual void OnStartCrouch(float Height, float ScaledHeight) override;
	virtual void OnEndCrouch(float Height, float ScaledHeight) override;
	bool ToggleMount();
	void SetSprint(bool Value);
	void SetSneak(bool Value);
	bool IsMounted() const { return bMounted; }
	float DesiredSpeed() const;
	void StopControls();
	void ExitYard();
	FString Status() const;
	UPROPERTY() TObjectPtr<USkeletalMeshComponent> Horse;
	UPROPERTY() TObjectPtr<class USpringArmComponent> Arm;
	UPROPERTY() TObjectPtr<class UCameraComponent> Camera;
	UPROPERTY() TObjectPtr<class UCapsuleComponent> HorseBlocker;
	UPROPERTY() TObjectPtr<AActor> ParkedCollision;
	UPROPERTY() TArray<TObjectPtr<class UStaticMeshComponent>> ReinSegments;
	FVector Parked = FVector(180, 140, 0);
	float KnightYaw = 0.f, HorseYaw = 0.f;
	bool bMounted = false, bSprint = false;
	float Phase = 0.f;
	FString ReviewMode;
	/** Optional exploration boundary; the practice yard keeps its physical fixtures. */
	TFunction<bool(FVector)> WalkBoundary;
	TWeakObjectPtr<class ACatnightIsland> ExplorationIsland;
private:
	void TickValidation(float Dt);
	void TickIslandValidation(float Dt);
	void Travel(const FVector& Direction, float Value);
	void Forward(float Value);
	void Right(float Value);
	void LookX(float Value);
	void LookY(float Value);
	void TurnRate(float Value);
	void PitchRate(float Value);
	void SprintOn() { SetSprint(true); }
	void SprintOff();
	void SneakOn() { SetSneak(true); }
	void SneakOff();
	void MountKey() { ToggleMount(); }
	void Zoom(float Value);
	void UpdateReins();
	float CameraCompensation = 0.f;
	float ValidationTime = 0.f;
	int32 ValidationStage = -1, ValidationChecks = 0, ValidationFailures = 0;
	FVector YardOrigin = FVector::ZeroVector;
	float ParkedHeading = 0.f;
	FVector ParkedUp = FVector::UpVector;
	FVector RidingUp = FVector::UpVector;
	float RidingFloor = 0.f;
	bool bRidingFloorReady = false;
	FVector PreviousPosition = FVector::ZeroVector;
	FVector HipsRef = FVector::ZeroVector;
	FVector SeatRef = FVector::ZeroVector;
};
