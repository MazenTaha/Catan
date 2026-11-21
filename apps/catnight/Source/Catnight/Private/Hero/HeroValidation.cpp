// Opt-in functional route through the actual movement component, collisions, rig and camera.
#include "Hero/HeroPawn.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "HAL/PlatformMisc.h"

void ACatnightHero::TickValidation(float Dt)
{
	static const float Durations[] = {.8f, 2, 2, 2, 1, 1, 2, 2, 1, 2, 3, 1, 4};
	ValidationTime += Dt;
	float Within = ValidationTime;
	int32 Stage = 0;
	while (Stage < UE_ARRAY_COUNT(Durations) && Within >= Durations[Stage]) Within -= Durations[Stage++];
	auto Check = [&](bool Pass, const TCHAR* Reason)
	{
		ValidationChecks++;
		if (!Pass && ValidationFailures++ < 8) UE_LOG(LogTemp, Error, TEXT("HERO VALIDATION stage %d: %s"), Stage, Reason);
	};
	if (Stage == UE_ARRAY_COUNT(Durations))
	{
		UE_LOG(LogTemp, Display, TEXT("HERO VALIDATION %s: %d checks, %d failures, 13 physical scenarios"), ValidationFailures ? TEXT("FAILED") : TEXT("PASSED"), ValidationChecks, ValidationFailures);
		FPlatformMisc::RequestExitWithStatus(false, ValidationFailures ? 1 : 0);
		ReviewMode = TEXT("finished");
		return;
	}
	if (Stage != ValidationStage)
	{
		ValidationStage = Stage;
		StopControls(); GetCharacterMovement()->StopMovementImmediately();
		if (Stage == 0) SetActorLocation(YardOrigin + FVector(-2500, -3500, 98), false, nullptr, ETeleportType::TeleportPhysics);
		if (Stage == 5)
		{
			SetActorLocation(Parked + FVector(-100, 0, 98), false, nullptr, ETeleportType::TeleportPhysics);
			Check(ToggleMount(), TEXT("mount succeeds on clear ground"));
		}
		if (Stage == 8) Check(ToggleMount(), TEXT("dismount finds a clear supported spot"));
		if (Stage == 9) SetActorLocation(YardOrigin + FVector(-320, -2500, 98), false, nullptr, ETeleportType::TeleportPhysics);
		if (Stage == 10) SetActorLocation(YardOrigin + FVector(-1150, 1500, 98), false, nullptr, ETeleportType::TeleportPhysics);
		PreviousPosition = GetActorLocation();
		UE_LOG(LogTemp, Display, TEXT("HERO VALIDATION entered stage %d"), Stage);
	}
	if (Stage == 2 || Stage == 3 || Stage == 7) SetSprint(true);
	if (Stage == 3 || Stage == 10) SetSneak(true);
	if (Stage == 11 || Stage == 12) SetSneak(false);
	if (Stage == 1 || Stage == 2 || Stage == 3 || Stage == 6 || Stage == 7 || Stage == 10 || Stage == 12) Travel(FVector::ForwardVector, 1);
	if (Stage == 9) Travel(-FVector::ForwardVector, 1);
	if (Within > .6f)
	{
		const float Speed = GetVelocity().Size2D();
		if (Stage == 1 || Stage == 2 || Stage == 3 || Stage == 6 || Stage == 7)
		{
			const float Expected = Stage == 1 ? 240.f : Stage == 2 ? 620.f : Stage == 3 ? 110.f : Stage == 6 ? 250.f : 800.f;
			Check(FMath::Abs(Speed - Expected) < 25, TEXT("actual movement speed matches gait and stance"));
		}
		if (Stage == 3) Check(bIsCrouched && Speed < 150, TEXT("sprint cannot override silent crouch speed"));
		if (Stage == 9 && Within > 1.3f)
		{
			Check(GetActorLocation().X > YardOrigin.X - 435, TEXT("character capsule stops outside the wall"));
			Check(Camera->GetComponentLocation().X > YardOrigin.X - 455, TEXT("camera sphere stops before the wall"));
			Check(FVector::Dist(Camera->GetComponentLocation(), Arm->GetComponentLocation()) < 250, TEXT("camera pulls in at an obstruction"));
		}
		if (Stage == 11) Check(bIsCrouched, TEXT("standing is refused under the low lintel"));
		if (Stage == 12 && Within > 3.6f) Check(!bIsCrouched, TEXT("standing resumes after leaving the lintel"));
		Check(!GetActorLocation().ContainsNaN() && !Camera->GetComponentLocation().ContainsNaN(), TEXT("finite movement and camera transforms"));
		if (bMounted && ReinSegments.Num() == 24)
		{
			for (int32 Side = 0; Side < 2; Side++)
			{
				const FVector Strap = ReinSegments[Side * 12 + 11]->GetComponentTransform().TransformPosition(FVector(50, 0, 0));
				const FVector Hand = GetMesh()->GetSocketLocation(Side ? TEXT("GripR") : TEXT("GripL"));
				Check(FVector::Dist(Strap, Hand) < 1.f, TEXT("visible rein reaches the animated gauntlet"));
			}
			const FVector Pelvis = GetMesh()->GetSocketLocation(TEXT("Hips"));
			const FVector Saddle = Horse->GetSocketLocation(TEXT("Seat"));
			Check(FVector::Dist(Pelvis, Saddle) < 3, TEXT("rider pelvis remains on the animated saddle"));
		}
	}
}
