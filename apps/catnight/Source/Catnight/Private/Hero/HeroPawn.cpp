#include "Hero/HeroPawn.h"
#include "Hero/HeroAnim.h"
#include "CatnightGameMode.h"
#include "Animation/Skeleton.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/InputComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "InputCoreTypes.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Camera/PlayerCameraManager.h"
#include "Island/IslandWorld.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "UnrealClient.h"

namespace
{
	FVector Reference(USkeletalMesh* Mesh, FName Name)
	{
		const FReferenceSkeleton& Ref = Mesh->GetRefSkeleton();
		int32 I = Ref.FindBoneIndex(Name);
		FTransform T = FTransform::Identity;
		while (I != INDEX_NONE) { T = T * Ref.GetRefBonePose()[I]; I = Ref.GetParentIndex(I); }
		return T.GetLocation();
	}
	float Facing(USkeletalMesh* Mesh, FName Root)
	{
		const FVector V = Reference(Mesh, TEXT("Forward")) - Reference(Mesh, Root);
		return -FMath::RadiansToDegrees(FMath::Atan2(V.Y, V.X));
	}
}

ACatnightHero::ACatnightHero()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PostPhysics;
	GetCapsuleComponent()->InitCapsuleSize(34.f, 96.f);
	GetMesh()->SetRelativeLocation(FVector(0, 0, -98));
	GetMesh()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	GetMesh()->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::AlwaysTickPoseAndRefreshBones;
	GetMesh()->bEnableUpdateRateOptimizations = false;
	bUseControllerRotationYaw = false;
	auto* Move = GetCharacterMovement();
	Move->bOrientRotationToMovement = true;
	Move->RotationRate = FRotator(0, 540, 0);
	Move->MaxAcceleration = 2200;
	Move->BrakingDecelerationWalking = 2200;
	Move->GroundFriction = 8;
	Move->MaxWalkSpeed = 160;
	Move->MaxWalkSpeedCrouched = 85;
	Move->SetCrouchedHalfHeight(80);
	Move->GetNavAgentPropertiesRef().bCanCrouch = true;
	Move->MaxStepHeight = 38;
	Move->SetWalkableFloorAngle(44);
	Move->MaxSimulationTimeStep = 1.f / 60.f;
	Move->MaxSimulationIterations = 16;
	Move->JumpZVelocity = 360;
	Horse = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("HorseVisual"));
	Horse->SetupAttachment(GetCapsuleComponent());
	Horse->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Horse->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::AlwaysTickPoseAndRefreshBones;
	Horse->bEnableUpdateRateOptimizations = false;
	Horse->AddTickPrerequisiteComponent(Move);
	GetMesh()->AddTickPrerequisiteComponent(Horse);
	Arm = CreateDefaultSubobject<USpringArmComponent>(TEXT("FollowArm"));
	Arm->SetupAttachment(GetCapsuleComponent());
	Arm->TargetArmLength = 390;
	Arm->SocketOffset = FVector(0, 45, 0);
	Arm->TargetOffset = FVector(0, 0, 35);
	Arm->bUsePawnControlRotation = true;
	Arm->bDoCollisionTest = true;
	Arm->ProbeSize = 16;
	Arm->bEnableCameraLag = true;
	Arm->CameraLagSpeed = 14;
	Arm->bUseCameraLagSubstepping = true;
	Arm->CameraLagMaxTimeStep = 1.f / 60.f;
	Arm->CameraLagMaxDistance = 35;
	Arm->PrimaryComponentTick.TickGroup = TG_PostUpdateWork;
	Arm->AddTickPrerequisiteActor(this);
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	Camera->SetupAttachment(Arm);
	Camera->SetFieldOfView(76);
    auto& PP = Camera->PostProcessSettings;
    PP.bOverride_AutoExposureMethod = true; PP.AutoExposureMethod = EAutoExposureMethod::AEM_Manual;
    PP.bOverride_AutoExposureApplyPhysicalCameraExposure = true; PP.AutoExposureApplyPhysicalCameraExposure = true;
    PP.bOverride_CameraISO = true; PP.CameraISO = 100;
    PP.bOverride_CameraShutterSpeed = true; PP.CameraShutterSpeed = 125;
    PP.bOverride_DepthOfFieldFstop = true; PP.DepthOfFieldFstop = 8;
    PP.bOverride_AutoExposureBias = true; PP.AutoExposureBias = 0;
    // The engine's default motion blur smears the knight and the near ground whenever the
    // camera turns; a painted, third-person world reads better crisp.
    PP.bOverride_MotionBlurAmount = true; PP.MotionBlurAmount = 0;
}

void ACatnightHero::BeginPlay()
{
	Super::BeginPlay();
	PreviousPosition = GetActorLocation();
    ParkedCollision = GetWorld()->SpawnActor<AActor>();
    ParkedCollision->SetOwner(this);
    HorseBlocker = NewObject<UCapsuleComponent>(ParkedCollision);
    ParkedCollision->SetRootComponent(HorseBlocker);
    HorseBlocker->InitCapsuleSize(40, 140);
    HorseBlocker->CanCharacterStepUpOn = ECB_No;
    HorseBlocker->SetCollisionProfileName(TEXT("BlockAllDynamic"));
    HorseBlocker->RegisterComponent();
    YardOrigin = GetActorLocation() - FVector(0, 0, 98);
	auto* KnightMesh = LoadObject<USkeletalMesh>(nullptr, TEXT("/Game/Generated/Heroes/SK_Knight"));
	auto* HorseMesh = LoadObject<USkeletalMesh>(nullptr, TEXT("/Game/Generated/Heroes/SK_Horse"));
	if (!KnightMesh || !HorseMesh) { UE_LOG(LogTemp, Error, TEXT("HERO meshes missing; run import-heroes.ps1")); SetActorTickEnabled(false); return; }
	KnightYaw = Facing(KnightMesh, TEXT("Hips"));
	HorseYaw = Facing(HorseMesh, TEXT("Body"));
	HipsRef = FRotator(0, KnightYaw, 0).RotateVector(Reference(KnightMesh, TEXT("Hips")));
	SeatRef = Reference(HorseMesh, TEXT("Seat"));
	GetMesh()->SetSkeletalMeshAsset(KnightMesh);
	GetMesh()->SetRelativeRotation(FRotator(0, KnightYaw, 0));
	GetMesh()->SetAnimInstanceClass(UCatnightHeroAnim::StaticClass());
	Horse->SetSkeletalMeshAsset(HorseMesh);
	Horse->SetAnimInstanceClass(UCatnightHeroAnim::StaticClass());
	Parked += GetActorLocation() - FVector(0, 0, 96);
    FHitResult ParkFloor;
    FCollisionQueryParams ParkQuery(SCENE_QUERY_STAT(ParkedHorseFloor), false, this);
    if (GetWorld()->LineTraceSingleByChannel(ParkFloor, Parked + FVector(0,0,200), Parked-FVector(0,0,300), ECC_Visibility, ParkQuery)) { Parked.Z=ParkFloor.ImpactPoint.Z; ParkedUp=ParkFloor.ImpactNormal; }
	UE_LOG(LogTemp, Display, TEXT("HERO rigs Knight yaw %.1f hips %s; Horse yaw %.1f seat %s"), KnightYaw, *HipsRef.ToString(), HorseYaw, *SeatRef.ToString());
	auto* Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
	auto* Base = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Generated/Materials/M_Tint"));
	auto* Leather = UMaterialInstanceDynamic::Create(Base, this);
	Leather->SetVectorParameterValue(TEXT("Color"), FLinearColor(.065f, .028f, .012f));
	for (int32 I = 0; I < 24; I++)
	{
		auto* Segment = NewObject<UStaticMeshComponent>(this);
		Segment->SetupAttachment(GetCapsuleComponent()); Segment->SetStaticMesh(Cube);
		Segment->SetMaterial(0, Leather); Segment->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Segment->RegisterComponent(); Segment->SetVisibility(false); ReinSegments.Add(Segment);
	}
}

float ACatnightHero::DesiredSpeed() const { return bMounted ? (bSprint ? 700.f : 200.f) : (bIsCrouched ? 85.f : bSprint ? 550.f : 160.f); }
void ACatnightHero::SetSprint(bool Value) { bSprint = Value; GetCharacterMovement()->MaxWalkSpeed = DesiredSpeed(); }
void ACatnightHero::SetSneak(bool Value) { if (!bMounted) { if (Value) Crouch(); else UnCrouch(); } }
void ACatnightHero::OnStartCrouch(float Height, float ScaledHeight) { Super::OnStartCrouch(Height, ScaledHeight); CameraCompensation += Height; }
void ACatnightHero::OnEndCrouch(float Height, float ScaledHeight) { Super::OnEndCrouch(Height, ScaledHeight); CameraCompensation -= Height; }

void ACatnightHero::Tick(float Dt)
{
	Super::Tick(Dt);
	if (!ReviewMode.IsEmpty() && ReviewMode != TEXT("test") && ReviewMode != TEXT("island-test"))
	{
		if ((ReviewMode == TEXT("ride") || ReviewMode == TEXT("gallop")) && !bMounted) { SetActorLocation(Parked + FVector(-100, 0, 98)); ToggleMount(); }
		// Mount at the horse, then ride from the slope start the game mode chose: hooves on a ramp.
		if (ReviewMode == TEXT("ride-slope") && !bMounted) { const FVector Start = GetActorLocation(); SetActorLocation(Parked + FVector(-100, 0, 98)); ToggleMount(); SetActorLocation(Start + FVector(0, 0, 40)); }
		if (ReviewMode == TEXT("crouch")) SetSneak(true);
		SetSprint(ReviewMode == TEXT("run") || ReviewMode == TEXT("gallop"));
		if (ReviewMode == TEXT("slope") || ReviewMode == TEXT("ride-slope") || ReviewMode == TEXT("walk") || ReviewMode == TEXT("run") || ReviewMode == TEXT("gallop") || ReviewMode == TEXT("crouch")) Travel(FVector::ForwardVector, 1);
		if (ReviewMode == TEXT("tour")) TickTour(Dt);
	}
	GetCharacterMovement()->MaxWalkSpeed = DesiredSpeed();
	const float Speed = GetVelocity().Size2D();
	const bool Moving = Speed > 8;
	const float TargetFov=bMounted?78.f:bIsCrouched?72.f:bSprint && Moving?82.f:76.f;
	Camera->SetFieldOfView(FMath::Lerp(Camera->FieldOfView,TargetFov,1.f-FMath::Exp(-6.f*Dt)));
	const float Moved = FVector::Dist2D(PreviousPosition, GetActorLocation());
	PreviousPosition = GetActorLocation();
	Phase = FMath::Fmod(Phase + (Moving ? Moved / (bMounted ? (bSprint ? 346.15f : 144.83f) : bIsCrouched ? 70.59f : bSprint ? 306.25f : 124.14f) : Dt * .5f), 1.f);
	if (auto* Anim = Cast<UCatnightHeroAnim>(GetMesh()->GetAnimInstance()))
	{
		Anim->State = bMounted ? (Moving ? bSprint ? 7 : 6 : 5) : bIsCrouched ? (Moving ? 4 : 3) : Moving ? (bSprint ? 2 : 1) : 0;
		Anim->Phase = Phase;
	}
	if (auto* Anim = Cast<UCatnightHeroAnim>(Horse->GetAnimInstance()))
	{
		Anim->State = bMounted && Moving ? (bSprint ? 2 : 1) : 0;
		Anim->Phase = bMounted ? Phase : FMath::Fmod(GetWorld()->GetTimeSeconds() * .5f, 1.f);
	}
	if (bMounted)
	{
		FHitResult Floor;
		FCollisionQueryParams GroundQuery(SCENE_QUERY_STAT(RidingSurface), false, this);
		GroundQuery.AddIgnoredActor(ParkedCollision);
		if (!GetCharacterMovement()->IsMovingOnGround())
		{
			// On a drop, follow the falling physics body rather than snapping down to the distant floor.
			RidingFloor=GetActorLocation().Z-GetCapsuleComponent()->GetUnscaledCapsuleHalfHeight();
			bRidingFloorReady=false;
		}
		else if (GetWorld()->LineTraceSingleByChannel(Floor, GetActorLocation(), GetActorLocation()-FVector(0,0,500), ECC_Visibility, GroundQuery))
		{
			const float Blend = 1.f-FMath::Exp(-14.f*Dt);
			RidingUp = bRidingFloorReady ? FMath::Lerp(RidingUp, Floor.ImpactNormal, Blend).GetSafeNormal() : Floor.ImpactNormal;
			RidingFloor = bRidingFloorReady ? FMath::Lerp(RidingFloor, static_cast<float>(Floor.ImpactPoint.Z), Blend) : Floor.ImpactPoint.Z;
			bRidingFloorReady = true;
		}
		const FQuat Surface = FQuat::FindBetweenNormals(FVector::UpVector, RidingUp);
		const FQuat Rotation = Surface * FQuat(FRotator(0, GetActorRotation().Yaw + KnightYaw, 0));
		Horse->SetWorldLocationAndRotation(FVector(GetActorLocation().X,GetActorLocation().Y,RidingFloor-2.15f), Surface * FQuat(FRotator(0,GetActorRotation().Yaw+HorseYaw,0)));
		GetMesh()->SetWorldLocationAndRotation(Horse->GetSocketLocation(TEXT("Seat")) - Rotation.RotateVector(FRotator(0, -KnightYaw, 0).RotateVector(HipsRef)), Rotation);
	}
	else
	{
		Horse->SetWorldLocationAndRotation(Parked, FQuat::FindBetweenNormals(FVector::UpVector,ParkedUp) * FQuat(FRotator(0, ParkedHeading + HorseYaw, 0)));
		HorseBlocker->SetWorldLocationAndRotation(Parked + FRotator(0, ParkedHeading, 0).RotateVector(FVector(20, 0, 105)), FRotator(90, ParkedHeading, 0));
	}
	CameraCompensation *= FMath::Exp(-12.f * Dt);
	Arm->TargetOffset.Z = (bMounted ? 40.f : 35.f) + CameraCompensation;
	UpdateReins();
	const float CameraDistance = FVector::Dist(Camera->GetComponentLocation(), GetActorLocation());
	GetMesh()->SetOwnerNoSee(CameraDistance < 85);
	Horse->SetOwnerNoSee(bMounted && CameraDistance < 110);
	// Flush modifier latches too when the engine releases input on loss of focus.
	if (auto* PC = Cast<APlayerController>(Controller); PC && ReviewMode.IsEmpty())
	{
		if (bSprint && !PC->IsInputKeyDown(EKeys::LeftShift) && !PC->IsInputKeyDown(EKeys::Gamepad_LeftThumbstick)) SetSprint(false);
	}
	// Validate the completed pose/attachment, after this frame's saddle and strap updates.
	if (ReviewMode == TEXT("test")) TickValidation(Dt);
	if (ReviewMode == TEXT("island-test")) TickIslandValidation(Dt);
}

void ACatnightHero::TickTour(float Dt)
{
	auto* PC = Cast<APlayerController>(Controller);
	if (!PC) return;
	if (TourTime < 0)
	{
		// Head for the island's middle so the tour crosses several biomes.
		const FVector To = ExplorationIsland.IsValid() ? ExplorationIsland->GetActorLocation() - GetActorLocation() : FVector::ForwardVector;
		TourYaw = To.Rotation().Yaw;
		TourTime = 0;
	}
	else
	{
		// Last frame's final view (the camera manager updates after every tick group).
		const FMinimalViewInfo& View = PC->PlayerCameraManager->GetCameraCacheView();
		TourLog += FString::Printf(TEXT("%.5f,%.6f,%.2f,%.2f,%.2f,%.4f,%.4f,%.2f,%.2f,%.2f\n"), TourTime, Dt,
			View.Location.X, View.Location.Y, View.Location.Z, View.Rotation.Yaw, View.Rotation.Pitch,
			GetActorLocation().X, GetActorLocation().Y, GetActorLocation().Z);
		TourTime += Dt;
		// -CatnightTourShots=<dir>: a burst of frames in motion (pop-in, shimmer), one every 0.2 s from 10 s.
		FString ShotDir;
		const int32 Shot = FMath::FloorToInt32((TourTime - 10.f) / .2f);
		if (Shot >= 0 && Shot < 12 && Shot != TourShot && FParse::Value(FCommandLine::Get(), TEXT("CatnightTourShots="), ShotDir))
		{
			TourShot = Shot;
			FScreenshotRequest::RequestScreenshot(FPaths::Combine(ShotDir, FString::Printf(TEXT("tour-%02d.png"), Shot)), false, false);
		}
	}
	// Six seconds walking, six sprinting; the view swings 70 degrees either way like a player looking round.
	SetSprint(FMath::Fmod(TourTime, 12.f) >= 6.f);
	PC->SetControlRotation(FRotator(-10, TourYaw + 70.f * FMath::Sin(TourTime * .6f), 0));
	Forward(1);
}

void ACatnightHero::UpdateReins()
{
	if (ReinSegments.Num() != 24) return;
	for (int32 Side = 0; Side < 2; Side++)
	{
		const FVector Start = Horse->GetSocketLocation(Side ? TEXT("BitR") : TEXT("BitL"));
		const FVector SideVector = (Horse->GetSocketLocation(TEXT("BitR")) - Horse->GetSocketLocation(TEXT("BitL"))).GetSafeNormal();
		const FVector End = bMounted ? GetMesh()->GetSocketLocation(Side ? TEXT("GripR") : TEXT("GripL"))
			: Horse->GetSocketLocation(TEXT("Seat")) + FRotator(0, bMounted ? GetActorRotation().Yaw : ParkedHeading, 0).RotateVector(FVector(35, Side ? 16 : -16, 5));
		for (int32 I = 0; I < 12; I++)
		{
			const float A = I / 12.f, B = (I + 1) / 12.f;
			const FVector P = FMath::Lerp(Start, End, A) + SideVector * (Side ? 1 : -1) * FMath::Sin(A * PI) * 16.f - FVector(0, 0, FMath::Sin(A * PI) * (bMounted ? 6 : 20));
			const FVector Q = FMath::Lerp(Start, End, B) + SideVector * (Side ? 1 : -1) * FMath::Sin(B * PI) * 16.f - FVector(0, 0, FMath::Sin(B * PI) * (bMounted ? 6 : 20));
			auto* Segment = ReinSegments[Side * 12 + I].Get();
			Segment->SetWorldLocationAndRotation((P + Q) * .5f, (Q - P).Rotation());
			Segment->SetWorldScale3D(FVector((Q - P).Size() / 100.f, .008f, .012f));
			Segment->SetVisibility(true);
		}
	}
}

bool ACatnightHero::ToggleMount()
{
	if (!bMounted)
	{
		if (FVector::Dist2D(GetActorLocation(), Parked) > 230 || bIsCrouched || GetCharacterMovement()->IsFalling()) return false;
		HorseBlocker->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		FCollisionQueryParams MountQuery(SCENE_QUERY_STAT(HeroMountClearance), false, this);
		MountQuery.AddIgnoredActor(ParkedCollision);
		FHitResult Support;
		const FCollisionShape MountedShape=FCollisionShape::MakeCapsule(70,135);
		const bool Supported=GetWorld()->SweepSingleByChannel(Support,Parked+FVector(0,0,300),Parked+FVector(0,0,100),FQuat::Identity,ECC_Pawn,MountedShape,MountQuery);
		const FVector MountedPosition=Support.Location+FVector(0,0,2);
		if (!Supported || Support.bStartPenetrating || Support.ImpactNormal.Z<GetCharacterMovement()->GetWalkableFloorZ()
			|| GetWorld()->OverlapBlockingTestByChannel(MountedPosition,FQuat::Identity,ECC_Pawn,MountedShape,MountQuery)) { HorseBlocker->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics); return false; }
		StopControls(); bMounted = true;
		bRidingFloorReady=false;
		HorseBlocker->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		GetCapsuleComponent()->SetCapsuleSize(70, 135);
		SetActorLocation(MountedPosition, false, nullptr, ETeleportType::TeleportPhysics);
		SetActorRotation(FRotator(0, ParkedHeading, 0));
		PreviousPosition = GetActorLocation();
		GetCharacterMovement()->StopMovementImmediately();
		GetCharacterMovement()->RotationRate.Yaw = 180;
		Arm->TargetArmLength = 600;
		return true;
	}
	const FVector Ground = GetActorLocation() - FVector(0, 0, GetCapsuleComponent()->GetUnscaledCapsuleHalfHeight());
	FCollisionQueryParams Query(SCENE_QUERY_STAT(HeroDismount), false, this);
	for (const FVector& Local : {FVector(0, 180, 0), FVector(0, -180, 0), FVector(-220, 0, 0), FVector(0, 260, 0)})
	{
		const FVector P = Ground + GetActorRotation().RotateVector(Local);
		FHitResult Floor;
		if (!GetWorld()->LineTraceSingleByChannel(Floor, P + FVector(0, 0, 200), P - FVector(0, 0, 250), ECC_Visibility, Query) || Floor.ImpactNormal.Z < .72f) continue;
		FHitResult Landing;
		const FCollisionShape FootShape = FCollisionShape::MakeCapsule(34, 96);
		if (!GetWorld()->SweepSingleByChannel(Landing, Floor.ImpactPoint + FVector(0, 0, 220),
			Floor.ImpactPoint + FVector(0, 0, 80), FQuat::Identity, ECC_Pawn, FootShape, Query)
			|| Landing.bStartPenetrating || Landing.ImpactNormal.Z < GetCharacterMovement()->GetWalkableFloorZ()) continue;
		const FVector Candidate = Landing.Location + FVector(0, 0, 2);
		if (WalkBoundary && !WalkBoundary(Candidate)) continue;
		if (GetWorld()->OverlapBlockingTestByChannel(Candidate, FQuat::Identity, ECC_Pawn, FCollisionShape::MakeCapsule(34, 96), Query)) continue;
		Parked = Ground;
        FHitResult ParkSupport;
        if (GetWorld()->LineTraceSingleByChannel(ParkSupport, Ground + FVector(0,0,40), Ground-FVector(0,0,120), ECC_Visibility, Query)) { Parked.Z = ParkSupport.ImpactPoint.Z; ParkedUp = ParkSupport.ImpactNormal; }
        ParkedHeading = GetActorRotation().Yaw;
		StopControls(); bMounted = false;
		GetCapsuleComponent()->SetCapsuleSize(34, 96);
		SetActorLocation(Candidate, false, nullptr, ETeleportType::TeleportPhysics);
		PreviousPosition = GetActorLocation();
		GetMesh()->SetRelativeLocationAndRotation(FVector(0, 0, -98), FRotator(0, KnightYaw, 0));
		GetCharacterMovement()->StopMovementImmediately(); GetCharacterMovement()->RotationRate.Yaw = 540;
		HorseBlocker->SetWorldLocationAndRotation(Parked + FRotator(0, ParkedHeading, 0).RotateVector(FVector(20, 0, 105)), FRotator(90, ParkedHeading, 0));
		HorseBlocker->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
		Arm->TargetArmLength = 390;
		return true;
	}
	return false;
}

void ACatnightHero::Travel(const FVector& Direction, float V)
{
	if (WalkBoundary && !FMath::IsNearlyZero(V) && !WalkBoundary(GetActorLocation() + Direction * FMath::Sign(V) * ((bMounted ? 300.f : 100.f) + DesiredSpeed() * GetWorld()->GetDeltaSeconds())))
	{
		GetCharacterMovement()->StopMovementImmediately();
		return;
	}
    if (bMounted && !FMath::IsNearlyZero(V))
    {
        const FVector Head = Horse->GetSocketLocation(TEXT("Head"));
        const FVector Delta = Direction * FMath::Sign(V) * (45.f + DesiredSpeed() * GetWorld()->GetDeltaSeconds());
        FHitResult Hit;
        FCollisionQueryParams Query(SCENE_QUERY_STAT(HorseHeadClearance), false, this);
        if (GetWorld()->SweepSingleByChannel(Hit, Head, Head + Delta, FQuat::Identity, ECC_Visibility, FCollisionShape::MakeSphere(25), Query)
            && FVector::DotProduct(Hit.ImpactNormal, Delta) < 0)
        {
            GetCharacterMovement()->StopMovementImmediately();
            return;
        }
    }
    AddMovementInput(Direction, V);
}

void ACatnightHero::Forward(float V) { if (Controller) Travel(FRotator(0, Controller->GetControlRotation().Yaw, 0).Vector(), V); }
void ACatnightHero::Right(float V) { if (Controller) Travel(FRotationMatrix(FRotator(0, Controller->GetControlRotation().Yaw, 0)).GetUnitAxis(EAxis::Y), V); }
void ACatnightHero::LookX(float V) { AddControllerYawInput(V * .7f); }
void ACatnightHero::LookY(float V) { AddControllerPitchInput(-V * .7f); }
void ACatnightHero::TurnRate(float V) { AddControllerYawInput(V * 100.f * GetWorld()->GetDeltaSeconds()); }
void ACatnightHero::PitchRate(float V) { AddControllerPitchInput(-V * 80.f * GetWorld()->GetDeltaSeconds()); }
void ACatnightHero::Zoom(float V) { Arm->TargetArmLength = FMath::Clamp(Arm->TargetArmLength - V * 40, 180.f, 700.f); }
void ACatnightHero::StopControls() { bSprint = false; UnCrouch(); ConsumeMovementInputVector(); if (Controller) CastChecked<APlayerController>(Controller)->FlushPressedKeys(); }
void ACatnightHero::ExitYard() { StopControls(); if (auto* GM = GetWorld()->GetAuthGameMode<ACatnightGameMode>()) GM->LeaveHeroYard(); }
FString ACatnightHero::Status() const { return bMounted ? TEXT("Mounted / E: dismount / Shift: gallop") : TEXT("WASD: walk / Shift: sprint / Ctrl/C: sneak / E: mount nearby horse"); }

void ACatnightHero::SetupPlayerInputComponent(UInputComponent* Input)
{
	Super::SetupPlayerInputComponent(Input);
	Input->BindAxis(TEXT("HeroForward"), this, &ACatnightHero::Forward);
	Input->BindAxis(TEXT("HeroRight"), this, &ACatnightHero::Right);
	Input->BindAxis(TEXT("HeroLookX"), this, &ACatnightHero::LookX);
	Input->BindAxis(TEXT("HeroLookY"), this, &ACatnightHero::LookY);
	Input->BindAxis(TEXT("HeroTurn"), this, &ACatnightHero::TurnRate);
	Input->BindAxis(TEXT("HeroPitch"), this, &ACatnightHero::PitchRate);
	Input->BindAxis(TEXT("HeroZoom"), this, &ACatnightHero::Zoom);
	Input->BindAction(TEXT("HeroSprint"), IE_Pressed, this, &ACatnightHero::SprintOn);
	Input->BindAction(TEXT("HeroSprint"), IE_Released, this, &ACatnightHero::SprintOff);
	Input->BindAction(TEXT("HeroCrouch"), IE_Pressed, this, &ACatnightHero::SneakOn);
	Input->BindAction(TEXT("HeroCrouch"), IE_Released, this, &ACatnightHero::SneakOff);
	Input->BindAction(TEXT("HeroMount"), IE_Pressed, this, &ACatnightHero::MountKey);
	Input->BindAction(TEXT("HeroExit"), IE_Pressed, this, &ACatnightHero::ExitYard);
}

void ACatnightHero::EndPlay(const EEndPlayReason::Type Reason)
{
    if (ParkedCollision) ParkedCollision->Destroy();
    FString TourFile;
    if (!TourLog.IsEmpty() && FParse::Value(FCommandLine::Get(), TEXT("CatnightTourLog="), TourFile))
        FFileHelper::SaveStringToFile(TEXT("t,dt,cx,cy,cz,yaw,pitch,ax,ay,az\n") + TourLog, *TourFile);
    Super::EndPlay(Reason);
}

void ACatnightHero::SneakOff()
{
    if (auto* PC = Cast<APlayerController>(Controller); PC && (PC->IsInputKeyDown(EKeys::LeftControl) || PC->IsInputKeyDown(EKeys::C) || PC->IsInputKeyDown(EKeys::Gamepad_RightThumbstick))) return;
    SetSneak(false);
}
void ACatnightHero::SprintOff()
{
    if (auto* PC = Cast<APlayerController>(Controller); PC && (PC->IsInputKeyDown(EKeys::LeftShift) || PC->IsInputKeyDown(EKeys::Gamepad_LeftThumbstick))) return;
    SetSprint(false);
}
