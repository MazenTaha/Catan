// Opt-in route through actual CharacterMovement, floor collision, camera and mounted rig.
#include "Hero/HeroPawn.h"
#include "Island/IslandWorld.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "HAL/PlatformMisc.h"

void ACatnightHero::TickIslandValidation(float Dt)
{
    if (!ExplorationIsland.IsValid()) return;
    const int32 Stage=FMath::FloorToInt(ValidationTime/2.5f);
    const float Within=FMath::Fmod(ValidationTime,2.5f);
    auto Check=[&](bool OK,const TCHAR* Message) {
        ValidationChecks++;
        if(!OK && ValidationFailures++<12) UE_LOG(LogTemp,Error,TEXT("ISLAND MOVEMENT %d: %s"),Stage,Message);
    };
    if(Stage>=95) {
        UE_LOG(LogTemp,Display,TEXT("ISLAND MOVEMENT %s: %d checks, %d failures, 95 scenarios across 19 tiles"),ValidationFailures?TEXT("FAILED"):TEXT("PASSED"),ValidationChecks,ValidationFailures);
        FPlatformMisc::RequestExitWithStatus(false,ValidationFailures?1:0); ReviewMode=TEXT("finished"); return;
    }
    const int32 Mode=Stage%5,H=Stage/5;
    if(Stage!=ValidationStage) {
        if(bMounted) Check(ToggleMount(),TEXT("supported dismount between routes"));
        StopControls(); SetSneak(false); GetCharacterMovement()->StopMovementImmediately();
        const FVector Center=ExplorationIsland->HexPoint(H);
        FCollisionQueryParams Query(SCENE_QUERY_STAT(IslandRouteFloor),false,this);
        Query.AddIgnoredActor(ParkedCollision);
        auto FloorAt=[&](FVector P) {
            FHitResult Floor;
            const bool Hit=GetWorld()->LineTraceSingleByChannel(Floor,P+FVector(0,0,2000),P-FVector(0,0,2000),ECC_Visibility,Query);
            Check(Hit,TEXT("route fixture has a physical floor"));
            return Hit?Floor.ImpactPoint:P;
        };
        const FVector Start=FloorAt(Center+FVector(-1100,0,0))+FVector(0,0,180);
        SetActorLocation(Start,false,nullptr,ETeleportType::TeleportPhysics);
        PreviousPosition=Start;
        if(Mode>=3) {
            Parked=FloorAt(Center+FVector(-1000,140,0));
            HorseBlocker->SetWorldLocation(Parked+FVector(20,0,105));
        }
        ValidationStage=Stage;
    }
    // Settle on the real collision mesh before asking to mount or checking speeds.
    if(Within>.55f) {
        if(Mode>=3 && !bMounted && !bIsCrouched && !GetCharacterMovement()->IsFalling()) Check(ToggleMount(),TEXT("mount on biome ground"));
        SetSprint(Mode==1 || Mode==2 || Mode==4);
        SetSneak(Mode==2);
        Travel(FVector::ForwardVector,1);
    }
    if(Within>1.2f) {
        const float Want=Mode==0?160.f:Mode==1?550.f:Mode==2?85.f:Mode==3?200.f:700.f;
        Check(GetVelocity().Size2D()>Want*.8f && GetVelocity().Size2D()<Want*1.12f,TEXT("walk / sprint / crouch / riding speed"));
        Check(GetCharacterMovement()->IsMovingOnGround(),TEXT("supported by island terrain"));
        Check(ExplorationIsland->CanWalk(GetActorLocation()),TEXT("remains on land"));
        Check(!GetActorLocation().ContainsNaN() && !Camera->GetComponentLocation().ContainsNaN(),TEXT("finite character and camera"));
        if(bMounted) Check(FVector::Distance(Horse->GetSocketLocation(TEXT("Seat")),GetMesh()->GetSocketLocation(TEXT("Hips")))<1.5f,TEXT("rider stays in saddle"));
    }
    ValidationTime+=Dt;
}
