#include "CatanInteraction.h"
#include "Modules/ModuleManager.h"
#include "Animation/AnimInstanceProxy.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimationPoseData.h"
#include "AnimationRuntime.h"
#include "Camera/CameraComponent.h"
#include "Components/AudioComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/InputComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/Canvas.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Sound/SoundWaveProcedural.h"
#include "Engine/Engine.h"
#include "UObject/ConstructorHelpers.h"

IMPLEMENT_MODULE(FDefaultModuleImpl, CatanAnimation)
namespace {
const FString PracticeSlot(TEXT("CatanNight_AnimationPractice_v1"));
float ContactFor(ECatanWeapon W) { return W == ECatanWeapon::Sword ? .21f : W == ECatanWeapon::Fist ? .12f : 0.f; }
float DurationFor(ECatanWeapon W) { return W == ECatanWeapon::Sword ? .58f : .42f; }
UAnimSequence* Clip(UCatanMotionLibrary* Lib, FName Name) { if (!Lib) return nullptr; auto P=Lib->Clips.Find(Name); return P ? P->Get() : nullptr; }
float Ease(float T) { T=FMath::Clamp(T,0.f,1.f); return T*T*(3-2*T); }
}

UCatanCombatPresentation::UCatanCombatPresentation() { PrimaryComponentTick.bCanEverTick=true; }
bool UCatanCombatPresentation::Attack() {
    if (bGuarding || !Action.Begin(ContactFor(Weapon), DurationFor(Weapon))) return false;
    bCancelled=false; ++AttackCount; Side=-Side;
    if (auto S=GetOwner()->FindComponentByClass<UCatanInteractionSound>()) S->Cue(Weapon==ECatanWeapon::Revolver ? "Shot" : "Swing");
    return true;
}
void UCatanCombatPresentation::Guard(bool On) { bGuarding=On; if (On && Action.Active()) { Action.CancelContact(); bCancelled=true; } }
bool UCatanCombatPresentation::Select(ECatanWeapon W) { if (Action.Active()) return false; Weapon=W; bGuarding=false; return true; }
void UCatanCombatPresentation::ConfirmHit(bool Parried) { Reaction=Parried ? "Guard_Impact" : "Hit_React"; ReactionAge=0; }
void UCatanCombatPresentation::Recover() { Cancel(); Reaction="Respawn_Recover"; ReactionAge=0; }
void UCatanCombatPresentation::Cancel() { Action.Cancel(); bCancelled=true; bGuarding=false; }
void UCatanCombatPresentation::TickComponent(float Delta,ELevelTick Kind,FActorComponentTickFunction* Fn) {
    Super::TickComponent(Delta,Kind,Fn); ReactionAge+=Delta;
    if (Action.Advance(Delta)) { ++ContactCount; OnContactRequested.Broadcast(Weapon); }
}
void UCatanCombatPresentation::EndPlay(const EEndPlayReason::Type Reason) { Cancel(); OnContactRequested.Clear(); Super::EndPlay(Reason); }

/** Game-thread snapshots only; evaluation never reads the pawn or changes gameplay state. */
struct FCatanAnimProxy : FAnimInstanceProxy {
    using FAnimInstanceProxy::FAnimInstanceProxy;
    UCatanMotionLibrary* Library=nullptr;
    UAnimSequence* ActionClip=nullptr;
    UAnimSequence* ReactionClip=nullptr;
    double IdleTime=0,WalkTime=0,RunTime=0,ActionTime=0,ReactionTime=0;
    float MoveWeight=0,RunWeight=0,ActionWeight=0,ReactionWeight=0;
    virtual void PreUpdate(UAnimInstance* Instance,float Delta) override {
        FAnimInstanceProxy::PreUpdate(Instance,Delta);
        auto P=Cast<ACatanPracticeCharacter>(Instance->TryGetPawnOwner());
        if (!P) return;
        Library=P->Library;
        const float Speed=P->GetVelocity().Size2D();
        const float K=1-FMath::Exp(-12*Delta);
        MoveWeight=FMath::Lerp(MoveWeight, Speed>3 ? 1.f:0.f,K);
        RunWeight=FMath::Lerp(RunWeight,FMath::Clamp((Speed-420)/350,0.f,1.f),K);
        IdleTime+=Delta; WalkTime+=Delta*Speed/400; RunTime+=Delta*Speed/800;
        auto C=P->Combat;
        FName Name=NAME_None;
        if (C->bGuarding) { Name="Guard_Hold"; ActionTime=IdleTime; }
        else if (C->Action.Active() && !C->bCancelled) {
            Name=C->Weapon==ECatanWeapon::Sword ? (C->Side<0 ? "Sword_Cut_R":"Sword_Cut_L") : C->Weapon==ECatanWeapon::Fist ? "Fist_Jab":"Revolver_Fire";
            ActionTime=C->Action.Age;
        }
        if (Name.IsNone() && C->Weapon!=ECatanWeapon::Sword) { Name=C->Weapon==ECatanWeapon::Fist ? "Fist_Jab":"Revolver_Fire"; ActionTime=.42; }
        ActionClip=Clip(Library,Name);
        const float Desired=ActionClip ? 1.f:0.f;
        ActionWeight=FMath::Lerp(ActionWeight,Desired,1-FMath::Exp(-30*Delta));
        ReactionClip=Clip(Library,C->Reaction); ReactionTime=C->ReactionAge;
        ReactionWeight=ReactionClip && ReactionTime<ReactionClip->GetPlayLength() ? (C->bReducedMotion ?.25f:.75f)*Ease((float)ReactionTime/.04f)*(1-Ease(((float)ReactionTime-.12f)/.18f)) : 0;
    }
    void Sample(UAnimSequence* Sequence,double Time,bool Loop,FPoseContext& Out) {
        Out.ResetToRefPose(); if (!Sequence) return;
        const double Length=Sequence->GetPlayLength();
        if (Length<=0) return;
        Time=Loop ? FMath::Fmod(Time,Length) : FMath::Clamp(Time,0.0,Length);
        FAnimationPoseData Data(Out);
        Sequence->GetAnimationPose(Data,FAnimExtractContext(Time,false));
    }
    virtual bool Evaluate(FPoseContext& Output) override {
        FPoseContext Idle(Output), Walk(Output), Run(Output), Base(Output), Moving(Output), ActionPose(Output), ReactionPose(Output);
        Sample(Clip(Library,"Combat_Idle"),IdleTime,true,Idle);
        Sample(Clip(Library,"Walk"),WalkTime,true,Walk); Sample(Clip(Library,"Run"),RunTime,true,Run);
        FAnimationPoseData IdleData(Idle),WalkData(Walk),RunData(Run),MovingData(Moving),BaseData(Base),OutData(Output);
        FAnimationRuntime::BlendTwoPosesTogether(WalkData,RunData,1-RunWeight,MovingData);
        FAnimationRuntime::BlendTwoPosesTogether(IdleData,MovingData,1-MoveWeight,BaseData);
        Output.Pose.CopyBonesFrom(Base.Pose); Output.Curve=Base.Curve; Output.CustomAttributes=Base.CustomAttributes;
        auto Layer=[&](UAnimSequence* Asset,double Time,float Weight,FPoseContext& Pose) {
            if (!Asset || Weight<.001f) return;
            Sample(Asset,Time,Asset==Clip(Library,"Guard_Hold"),Pose);
            const auto& Bones=Output.Pose.GetBoneContainer();
            for (FCompactPoseBoneIndex Index:Output.Pose.ForEachBoneIndex()) {
                const FString Name=Bones.GetReferenceSkeleton().GetBoneName(Bones.GetSkeletonIndex(Index)).ToString();
                // In-place upper-body action layer: controller motion and planted leg poses stay intact.
                if (Name=="Spine" || Name=="Head" || Name.StartsWith("Arm") || Name.StartsWith("ForeArm") || Name.StartsWith("Hand") || Name.StartsWith("Cape")) {
                    FTransform Blended; Blended.Blend(Output.Pose[Index],Pose.Pose[Index],Weight); Output.Pose[Index]=Blended;
                }
            }
        };
        Layer(ActionClip,ActionTime,ActionWeight,ActionPose); Layer(ReactionClip,ReactionTime,ReactionWeight,ReactionPose);
        Output.Pose.NormalizeRotations(); return true;
    }
};
FAnimInstanceProxy* UCatanAnimInstance::CreateAnimInstanceProxy() { return new FCatanAnimProxy(this); }
void UCatanAnimInstance::DestroyAnimInstanceProxy(FAnimInstanceProxy* Proxy) { delete Proxy; }

ACatanAnimatedChest::ACatanAnimatedChest() {
    PrimaryActorTick.bCanEverTick=true;
    Body=CreateDefaultSubobject<UStaticMeshComponent>("Body"); SetRootComponent(Body);
    LidPivot=CreateDefaultSubobject<USceneComponent>("RearHinge"); LidPivot->SetupAttachment(Body); LidPivot->SetRelativeLocation(FVector(0,-27,44));
    Lid=CreateDefaultSubobject<UStaticMeshComponent>("Lid"); Lid->SetupAttachment(LidPivot); Lid->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Latch=CreateDefaultSubobject<UStaticMeshComponent>("Latch"); Latch->SetupAttachment(LidPivot); Latch->SetRelativeLocation(FVector(0,55.6f,2)); Latch->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    CreateDefaultSubobject<UCatanInteractionSound>("ChestSound");
    RevealBits=CreateDefaultSubobject<UCatanImpactBurst>("RevealBits"); RevealBits->SetupAttachment(Body);
}
void ACatanAnimatedChest::OnConstruction(const FTransform& T) {
    Super::OnConstruction(T); if (!Library) return;
    Body->SetStaticMesh(Library->ChestBody); Lid->SetStaticMesh(Library->ChestLid); Latch->SetStaticMesh(Library->ChestLatch);
    RevealBits->SetMaterial(0,Library->ParticleMaterial);
    ApplyPose(bOpened ? 1.1:0);
}
void ACatanAnimatedChest::BeginPlay() {
    Super::BeginPlay();
    if (bPreviewPersistence && GetNetMode()==NM_Standalone) if(auto Save=Cast<UCatanPreviewSave>(UGameplayStatics::LoadGameFromSlot(PracticeSlot,0))) SetConfirmedOpen(Save->Opened.Contains(PersistentId));
}
bool ACatanAnimatedChest::Open() {
    if (bOpened || bOpening || !Library) return false;
    bOpening=true; bRevealed=false; Age=0;
    FindComponentByClass<UCatanInteractionSound>()->Cue("Latch"); return true;
}
void ACatanAnimatedChest::SetConfirmedOpen(bool On) { bOpened=On; bOpening=false; bRevealed=On; ApplyPose(On ? 1.1:0); }
void ACatanAnimatedChest::ApplyPose(double Time) {
    if (!Library || Library->ChestKeys.IsEmpty()) return;
    const auto& Keys=Library->ChestKeys;
    float A=Keys.Last().Lid, B=Keys.Last().Latch;
    for(int32 I=1;I<Keys.Num();++I) if(Time<=Keys[I].Time) {
        float K=Ease((Time-Keys[I-1].Time)/(Keys[I].Time-Keys[I-1].Time));
        A=FMath::Lerp(Keys[I-1].Lid,Keys[I].Lid,K); B=FMath::Lerp(Keys[I-1].Latch,Keys[I].Latch,K); break;
    }
    LidPivot->SetRelativeRotation(FRotator(0,0,-FMath::RadiansToDegrees(A)));
    Latch->SetRelativeRotation(FRotator(0,0,-FMath::RadiansToDegrees(B)));
}
void ACatanAnimatedChest::Tick(float Delta) {
    Super::Tick(Delta); if (!bOpening || !Library) return;
    double Before=Age; Age+=FMath::Max(0.f,Delta); ApplyPose(Age);
    auto Sound=FindComponentByClass<UCatanInteractionSound>();
    if (Before<.17 && Age>=.17) Sound->Cue("ChestCreak");
    if (!bRevealed && Age>=Library->ChestReveal) {
        bRevealed=true; ++RevealRequests; Sound->Cue("Reveal");
        RevealBits->Pulse(GetActorLocation()+FVector(0,0,45),bReducedMotion);
        OnRevealRequested.Broadcast(); // Request only; inventory authority belongs to the future game integration.
        if (bPreviewPersistence && GetNetMode()==NM_Standalone) {
            auto Save=Cast<UCatanPreviewSave>(UGameplayStatics::LoadGameFromSlot(PracticeSlot,0));
            if (!Save) Save=Cast<UCatanPreviewSave>(UGameplayStatics::CreateSaveGameObject(UCatanPreviewSave::StaticClass()));
            Save->Opened.Add(PersistentId); UGameplayStatics::SaveGameToSlot(Save,PracticeSlot,0);
        }
    }
    if (Age>=Library->ChestFinish) { bOpened=true; bOpening=false; ApplyPose(1.1); }
}
void ACatanAnimatedChest::ResetPractice() {
    if (!bPreviewPersistence || GetNetMode()!=NM_Standalone) return;
    UGameplayStatics::DeleteGameInSlot(PracticeSlot,0); RevealRequests=0; SetConfirmedOpen(false);
}
void ACatanAnimatedChest::EndPlay(const EEndPlayReason::Type Reason) { bOpening=false; OnRevealRequested.Clear(); Super::EndPlay(Reason); }

UCatanInteractionSound::UCatanInteractionSound() { PrimaryComponentTick.bCanEverTick=true; }
void UCatanInteractionSound::Cue(FName Kind) {
    if (Voices.Num()>=6) return;
    const bool Metal=Kind=="Parry", Reveal=Kind=="Reveal", Shot=Kind=="Shot", Swing=Kind=="Swing", Latch=Kind=="Latch";
    const float Length=Reveal?.4f:Metal?.28f:Swing?.16f:Kind=="ChestCreak"?.32f:.14f;
    const int32 Rate=22050, Count=FMath::CeilToInt(Length*Rate);
    TArray<int16> Samples; Samples.SetNumUninitialized(Count); uint32 Noise=2759;
    double Phase=0;
    for(int32 I=0;I<Count;++I) {
        const float T=(float)I/Rate,U=T/Length;
        Noise=1664525*Noise+1013904223;
        const float N=((Noise>>8)&65535)/32768.f-1;
        const float Frequency=Reveal ? 660+U*660:Metal?1870:Latch?630:Shot?135-90*U:Swing?240-160*U:105-40*U;
        Phase+=2*PI*Frequency/Rate;
        float V=FMath::Sin(Phase)*(Metal?.45f:.65f)+N*(Swing?.7f:Shot?.65f:.15f);
        float Envelope=FMath::Min(1.f,T/.006f)*FMath::Exp(-U*(Reveal?4:6))*(1-U);
        Samples[I]=(int16)(FMath::Clamp(V*Envelope,-1.f,1.f)*6500);
    }
    auto Wave=NewObject<USoundWaveProcedural>(this); Wave->SetSampleRate(Rate); Wave->NumChannels=1; Wave->Duration=Length; Wave->bLooping=false;
    Wave->QueueAudio((const uint8*)Samples.GetData(),Samples.Num()*sizeof(int16));
    auto Voice=NewObject<UAudioComponent>(GetOwner()); Voice->SetSound(Wave); Voice->bAutoDestroy=false; Voice->bIsUISound=false;
    Voice->RegisterComponentWithWorld(GetWorld()); Voice->SetWorldLocation(GetOwner()->GetActorLocation()); Voice->SetVolumeMultiplier(.5f); Voice->Play();
    Voices.Add(Voice); Remaining.Add(Length+.1f);
}
void UCatanInteractionSound::TickComponent(float Delta,ELevelTick Kind,FActorComponentTickFunction* Fn) {
    Super::TickComponent(Delta,Kind,Fn);
    for(int32 I=Voices.Num()-1;I>=0;--I) if((Remaining[I]-=Delta)<=0) { if(Voices[I]) { Voices[I]->Stop(); Voices[I]->DestroyComponent(); } Voices.RemoveAtSwap(I); Remaining.RemoveAtSwap(I); }
}
void UCatanInteractionSound::EndPlay(const EEndPlayReason::Type Reason) { for(auto V:Voices) if(V) { V->Stop(); V->DestroyComponent(); } Voices.Empty(); Remaining.Empty(); Super::EndPlay(Reason); }

ACatanPracticeCharacter::ACatanPracticeCharacter() {
    PrimaryActorTick.bCanEverTick=true;
    GetCapsuleComponent()->InitCapsuleSize(34,88);
    GetMesh()->SetRelativeLocationAndRotation(FVector(0,0,-88),FRotator(0,-90,0));
    GetMesh()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Combat=CreateDefaultSubobject<UCatanCombatPresentation>("CombatPresentation"); Sound=CreateDefaultSubobject<UCatanInteractionSound>("InteractionSound");
    ImpactBits=CreateDefaultSubobject<UCatanImpactBurst>("ImpactBits"); ImpactBits->SetupAttachment(GetRootComponent());
    SwordMesh=CreateDefaultSubobject<USkeletalMeshComponent>("SwordGrip"); GunMesh=CreateDefaultSubobject<USkeletalMeshComponent>("RevolverGrip"); ShieldMesh=CreateDefaultSubobject<USkeletalMeshComponent>("ShieldForearm");
    for(auto GearMesh:{SwordMesh,GunMesh,ShieldMesh}) { GearMesh->SetupAttachment(GetMesh()); GearMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision); }
    CameraArm=CreateDefaultSubobject<USpringArmComponent>("CameraCollision"); CameraArm->SetupAttachment(GetRootComponent()); CameraArm->TargetArmLength=320; CameraArm->SocketOffset=FVector(0,55,65); CameraArm->bUsePawnControlRotation=true;
    FollowCamera=CreateDefaultSubobject<UCameraComponent>("Camera"); FollowCamera->SetupAttachment(CameraArm);
    bUseControllerRotationYaw=true;
    GetCharacterMovement()->MaxWalkSpeed=400; GetCharacterMovement()->BrakingDecelerationWalking=2000; GetCharacterMovement()->JumpZVelocity=420;
}
void ACatanPracticeCharacter::OnConstruction(const FTransform& T) {
    Super::OnConstruction(T); if(!Library) return;
    GetMesh()->SetSkeletalMeshAsset(Library->Knight); GetMesh()->SetAnimInstanceClass(UCatanAnimInstance::StaticClass());
    ImpactBits->SetMaterial(0,Library->ParticleMaterial);
    SwordMesh->SetSkeletalMeshAsset(Library->Sword); GunMesh->SetSkeletalMeshAsset(Library->Revolver); ShieldMesh->SetSkeletalMeshAsset(Library->Shield);
    for(auto GearMesh:{SwordMesh,GunMesh,ShieldMesh}) GearMesh->SetLeaderPoseComponent(GetMesh());
}
void ACatanPracticeCharacter::BeginPlay() { Super::BeginPlay(); StartLocation=GetActorLocation(); OnConstruction(GetActorTransform()); Combat->OnContactRequested.AddDynamic(this,&ACatanPracticeCharacter::Contact); }
void ACatanPracticeCharacter::Tick(float Delta) {
    Super::Tick(Delta);
    if(!bPracticePartner) if(auto PC=Cast<APlayerController>(GetController())) {
        auto Forward=FRotationMatrix(FRotator(0,PC->GetControlRotation().Yaw,0)).GetUnitAxis(EAxis::X);
        auto Right=FRotationMatrix(FRotator(0,PC->GetControlRotation().Yaw,0)).GetUnitAxis(EAxis::Y);
        AddMovementInput(Forward,(PC->IsInputKeyDown(EKeys::W)?1:0)-(PC->IsInputKeyDown(EKeys::S)?1:0));
        AddMovementInput(Right,(PC->IsInputKeyDown(EKeys::D)?1:0)-(PC->IsInputKeyDown(EKeys::A)?1:0));
        GetCharacterMovement()->MaxWalkSpeed=PC->IsInputKeyDown(EKeys::LeftShift)?800:400;
    }
    SwordMesh->SetVisibility(Combat->Weapon==ECatanWeapon::Sword); ShieldMesh->SetVisibility(Combat->Weapon==ECatanWeapon::Sword); GunMesh->SetVisibility(Combat->Weapon==ECatanWeapon::Revolver);
    NearbyChest=nullptr;
    if(!bPracticePartner) for(TActorIterator<ACatanAnimatedChest> It(GetWorld());It;++It) if(FVector::Dist2D(GetActorLocation(),It->GetActorLocation())<200) { NearbyChest=*It; break; }
    if(ReturnIn>0 && (ReturnIn-=Delta)<=0 && PracticeHealth>0 && ReturnTarget) {
        SetActorRotation((ReturnTarget->GetActorLocation()-GetActorLocation()).Rotation()); Combat->Attack();
    }
    if(RecoverIn>0 && (RecoverIn-=Delta)<=0) { PracticeHealth=100; Combat->Recover(); }
}
void ACatanPracticeCharacter::SetupPlayerInputComponent(UInputComponent* Input) {
    Super::SetupPlayerInputComponent(Input);
    Input->BindKey(EKeys::F,IE_Pressed,this,&ACatanPracticeCharacter::Strike); Input->BindKey(EKeys::LeftMouseButton,IE_Pressed,this,&ACatanPracticeCharacter::Strike);
    Input->BindKey(EKeys::E,IE_Pressed,this,&ACatanPracticeCharacter::Interact); Input->BindKey(EKeys::R,IE_Pressed,this,&ACatanPracticeCharacter::ResetPractice);
    Input->BindKey(EKeys::M,IE_Pressed,this,&ACatanPracticeCharacter::ReducedMotion);
    Input->BindKey(EKeys::RightMouseButton,IE_Pressed,this,&ACatanPracticeCharacter::GuardOn); Input->BindKey(EKeys::RightMouseButton,IE_Released,this,&ACatanPracticeCharacter::GuardOff);
    Input->BindKey(EKeys::One,IE_Pressed,this,&ACatanPracticeCharacter::SwordKey); Input->BindKey(EKeys::Two,IE_Pressed,this,&ACatanPracticeCharacter::GunKey); Input->BindKey(EKeys::Three,IE_Pressed,this,&ACatanPracticeCharacter::FistKey);
    Input->BindKey(EKeys::SpaceBar,IE_Pressed,this,&ACharacter::Jump); Input->BindAxisKey(EKeys::MouseX,this,&ACatanPracticeCharacter::LookYaw); Input->BindAxisKey(EKeys::MouseY,this,&ACatanPracticeCharacter::LookPitch);
}
void ACatanPracticeCharacter::LookYaw(float V) { AddControllerYawInput(V); }
void ACatanPracticeCharacter::LookPitch(float V) { AddControllerPitchInput(-V); }
void ACatanPracticeCharacter::Strike() { if(PracticeHealth>0) Combat->Attack(); }
void ACatanPracticeCharacter::GuardOn() { Combat->Guard(true); }
void ACatanPracticeCharacter::GuardOff() { Combat->Guard(false); }
void ACatanPracticeCharacter::SwordKey() { Combat->Select(ECatanWeapon::Sword); }
void ACatanPracticeCharacter::GunKey() { Combat->Select(ECatanWeapon::Revolver); }
void ACatanPracticeCharacter::FistKey() { Combat->Select(ECatanWeapon::Fist); }
void ACatanPracticeCharacter::Interact() { if(NearbyChest) NearbyChest->Open(); }
void ACatanPracticeCharacter::ReducedMotion() { Combat->bReducedMotion=!Combat->bReducedMotion; for(TActorIterator<ACatanAnimatedChest> It(GetWorld());It;++It) It->bReducedMotion=Combat->bReducedMotion; }
void ACatanPracticeCharacter::Contact(ECatanWeapon W) {
    // This is explicitly a standalone practice target, never the authoritative board-game health.
    if(GetNetMode()!=NM_Standalone) return;
    FHitResult Hit; FVector Start=GetActorLocation()+FVector(0,0,35);
    FCollisionQueryParams Params; Params.AddIgnoredActor(this);
    const float Reach=W==ECatanWeapon::Sword?260:W==ECatanWeapon::Fist?190:2600;
    if(GetWorld()->SweepSingleByChannel(Hit,Start,Start+GetActorForwardVector()*Reach,FQuat::Identity,ECC_Pawn,FCollisionShape::MakeSphere(W==ECatanWeapon::Revolver?8:22),Params))
        if(auto Target=Cast<ACatanPracticeCharacter>(Hit.GetActor())) if(Target->bPracticePartner!=bPracticePartner) Target->ReceivePracticeHit(this,W);
}
void ACatanPracticeCharacter::ReceivePracticeHit(ACatanPracticeCharacter* Attacker,ECatanWeapon W) {
    if(GetNetMode()!=NM_Standalone || PracticeHealth<=0) return;
    const FVector To=Attacker->GetActorLocation()-GetActorLocation();
    const bool Parried=Combat->bGuarding && Combat->Weapon==ECatanWeapon::Sword && FVector::DotProduct(GetActorForwardVector(),To.GetSafeNormal2D())>.259f;
    Combat->ConfirmHit(Parried); Sound->Cue(Parried ? "Parry":"Impact");
    ImpactBits->Pulse(GetActorLocation()+FVector(0,0,35),Combat->bReducedMotion);
    if(Parried) ++PracticeParries;
    else { ++ConfirmedPracticeHits; PracticeHealth=FMath::Max(0,PracticeHealth-(W==ECatanWeapon::Sword?25:W==ECatanWeapon::Fist?10:50)); }
    if(PracticeHealth==0) { Combat->Recover(); ReturnIn=-1; if(bPracticePartner) RecoverIn=1.2f; else { PracticeHealth=100; SetActorLocation(StartLocation,false,nullptr,ETeleportType::TeleportPhysics); } }
    else if(bPracticePartner) { ReturnTarget=Attacker; ReturnIn=.7f; }
}
void ACatanPracticeCharacter::ResetPractice() {
    for(TActorIterator<ACatanPracticeCharacter> It(GetWorld());It;++It) { It->Combat->Cancel(); It->Combat->Recover(); It->PracticeHealth=100; It->ReturnIn=It->RecoverIn=-1; It->ConfirmedPracticeHits=It->PracticeParries=0; }
    for(TActorIterator<ACatanAnimatedChest> It(GetWorld());It;++It) It->ResetPractice();
}
void ACatanPracticeHUD::DrawHUD() {
    Super::DrawHUD(); auto P=Cast<ACatanPracticeCharacter>(GetOwningPawn()); if(!P || !Canvas) return;
    DrawText(TEXT("CATAN NIGHT  /  ANIMATION PRACTICE"),FLinearColor(.95f,.72f,.35f),24,22,GEngine->GetMediumFont(),1.1f);
    DrawText(TEXT("WASD move   Shift run   F / click strike   Right click guard   1 2 3 weapons   E chest   R reset   M reduced motion"),FLinearColor::White,24,Canvas->SizeY-55,GEngine->GetSmallFont(),1);
    DrawText(FString::Printf(TEXT("Practice health %d   /   hits %d   /   parries %d"),P->PracticeHealth,P->ConfirmedPracticeHits,P->PracticeParries),FLinearColor::White,24,55,GEngine->GetSmallFont(),1);
    if(P->NearbyChest) DrawText(P->NearbyChest->bOpening ? TEXT("Opening...") : P->NearbyChest->bOpened ? TEXT("Chest open") : TEXT("E  Open chest"),FLinearColor(1,.82f,.46f),Canvas->SizeX*.45f,Canvas->SizeY*.8f,GEngine->GetMediumFont(),1);
}

UCatanImpactBurst::UCatanImpactBurst() {
    PrimaryComponentTick.bCanEverTick=true;
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Shape(TEXT("/Engine/BasicShapes/Cube.Cube"));
    SetStaticMesh(Shape.Object); SetCollisionEnabled(ECollisionEnabled::NoCollision); SetCastShadow(false); SetAbsolute(true,true,true);
}
void UCatanImpactBurst::BeginPlay() {
    Super::BeginPlay(); SetWorldLocation(FVector::ZeroVector);
    for(int32 I=0;I<8;++I) AddInstance(FTransform(FQuat::Identity,FVector::ZeroVector,FVector::ZeroVector));
    SetVisibility(false); SetComponentTickEnabled(false);
}
void UCatanImpactBurst::Pulse(FVector Point,bool Reduce) {
    if(Reduce) return;
    Origin=Point; Age=0; SetVisibility(true); SetComponentTickEnabled(true);
}
void UCatanImpactBurst::TickComponent(float Delta,ELevelTick Kind,FActorComponentTickFunction* Fn) {
    Super::TickComponent(Delta,Kind,Fn); Age+=Delta;
    if(Age>.28f) { SetVisibility(false); SetComponentTickEnabled(false); return; }
    for(int32 I=0;I<8;++I) {
        float A=I*PI/4;
        FVector Point=Origin+FVector(FMath::Cos(A)*70*Age,FMath::Sin(A)*70*Age,50*Age-180*Age*Age);
        float Scale=.02f*(1-Age/.28f);
        UpdateInstanceTransform(I,FTransform(FRotator(0,I*45,Age*360),Point,FVector(Scale,Scale,Scale*2.5f)),true,I==7,true);
    }
}
