#pragma once
#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "Components/ActorComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Engine/DataAsset.h"
#include "GameFramework/Character.h"
#include "GameFramework/HUD.h"
#include "GameFramework/SaveGame.h"
#include "CatanActionClock.h"
#include "CatanInteraction.generated.h"

class UAnimSequence;
class USkeletalMesh;
class UStaticMesh;
class UMaterialInterface;
class UStaticMeshComponent;
class UCameraComponent;
class USpringArmComponent;
class UAudioComponent;
class ACatanPracticeCharacter;

UENUM(BlueprintType)
enum class ECatanWeapon : uint8 { Fist, Sword, Revolver };

USTRUCT(BlueprintType)
struct FCatanChestKey {
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Time = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Lid = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Latch = 0;
};

UCLASS(BlueprintType)
class CATANANIMATION_API UCatanMotionLibrary : public UDataAsset {
    GENERATED_BODY()
public:
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TMap<FName, TObjectPtr<UAnimSequence>> Clips;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TArray<FCatanChestKey> ChestKeys;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) float ChestReveal = .64f;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) float ChestFinish = 2.4f;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TObjectPtr<USkeletalMesh> Knight;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TObjectPtr<USkeletalMesh> Sword;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TObjectPtr<USkeletalMesh> Revolver;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TObjectPtr<USkeletalMesh> Shield;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TObjectPtr<UStaticMesh> ChestBody;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TObjectPtr<UStaticMesh> ChestLid;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TObjectPtr<UStaticMesh> ChestLatch;
    UPROPERTY(EditAnywhere, BlueprintReadOnly) TObjectPtr<UMaterialInterface> ParticleMaterial;
};

/** Owns only presentation and contact requests. It never changes game inventory or applies game damage. */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FCatanContactRequested, ECatanWeapon, Weapon);
UCLASS(ClassGroup=Animation, meta=(BlueprintSpawnableComponent))
class CATANANIMATION_API UCatanCombatPresentation : public UActorComponent {
    GENERATED_BODY()
public:
    UCatanCombatPresentation();
    UPROPERTY(BlueprintAssignable) FCatanContactRequested OnContactRequested;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bReducedMotion = false;
    UPROPERTY(BlueprintReadOnly) ECatanWeapon Weapon = ECatanWeapon::Sword;
    UPROPERTY(BlueprintReadOnly) bool bGuarding = false;
    UPROPERTY(BlueprintReadOnly) int32 AttackCount = 0;
    UPROPERTY(BlueprintReadOnly) int32 ContactCount = 0;
    FCatanActionClock Action;
    double ReactionAge = 100;
    FName Reaction;
    bool bCancelled = false;
    int32 Side = 1;
    UFUNCTION(BlueprintCallable) bool Attack();
    UFUNCTION(BlueprintCallable) void Guard(bool On);
    UFUNCTION(BlueprintCallable) bool Select(ECatanWeapon Value);
    UFUNCTION(BlueprintCallable) void ConfirmHit(bool bParried = false);
    UFUNCTION(BlueprintCallable) void Recover();
    UFUNCTION(BlueprintCallable) void Cancel();
    virtual void TickComponent(float Delta, ELevelTick Kind, FActorComponentTickFunction* Fn) override;
    virtual void EndPlay(const EEndPlayReason::Type Reason) override;
};

UCLASS(Transient)
class CATANANIMATION_API UCatanAnimInstance : public UAnimInstance {
    GENERATED_BODY()
protected:
    virtual FAnimInstanceProxy* CreateAnimInstanceProxy() override;
    virtual void DestroyAnimInstanceProxy(FAnimInstanceProxy* Proxy) override;
};

UCLASS(ClassGroup=Animation, meta=(BlueprintSpawnableComponent))
class CATANANIMATION_API UCatanImpactBurst : public UInstancedStaticMeshComponent {
    GENERATED_BODY()
public:
    UCatanImpactBurst();
    void Pulse(FVector Point, bool Reduce);
    virtual void BeginPlay() override;
    virtual void TickComponent(float Delta, ELevelTick Kind, FActorComponentTickFunction* Fn) override;
private:
    FVector Origin;
    float Age = 1;
};

UCLASS()
class CATANANIMATION_API UCatanPreviewSave : public USaveGame {
    GENERATED_BODY()
public:
    UPROPERTY(SaveGame) TSet<FName> Opened;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE(FCatanChestReveal);
UCLASS()
class CATANANIMATION_API ACatanAnimatedChest : public AActor {
    GENERATED_BODY()
public:
    ACatanAnimatedChest();
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TObjectPtr<UCatanMotionLibrary> Library;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bPreviewPersistence = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bReducedMotion = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) FName PersistentId = "PracticeChest";
    UPROPERTY(BlueprintReadOnly) TObjectPtr<UStaticMeshComponent> Body;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<UCatanImpactBurst> RevealBits;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<USceneComponent> LidPivot;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<UStaticMeshComponent> Lid;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<UStaticMeshComponent> Latch;
    UPROPERTY(BlueprintAssignable) FCatanChestReveal OnRevealRequested;
    UPROPERTY(BlueprintReadOnly) int32 RevealRequests = 0;
    UPROPERTY(BlueprintReadOnly) bool bOpened = false;
    UPROPERTY(BlueprintReadOnly) bool bOpening = false;
    UFUNCTION(BlueprintCallable) bool Open();
    UFUNCTION(BlueprintCallable) void SetConfirmedOpen(bool On);
    UFUNCTION(BlueprintCallable) void ResetPractice();
    UFUNCTION(BlueprintCallable, CallInEditor) void RefreshPreview() { OnConstruction(GetActorTransform()); }
    virtual void OnConstruction(const FTransform& Transform) override;
    virtual void BeginPlay() override;
    virtual void Tick(float Delta) override;
    virtual void EndPlay(const EEndPlayReason::Type Reason) override;
private:
    double Age = 0;
    bool bRevealed = false;
    void ApplyPose(double Time);
};

/** Original short PCM cues, generated in memory. No audio files or ambient/music playback. */
UCLASS()
class CATANANIMATION_API UCatanInteractionSound : public UActorComponent {
    GENERATED_BODY()
public:
    UCatanInteractionSound();
    void Cue(FName Kind);
    /** Cues requested, and cues whose mixer-rendered envelope was audible (checked by the practice validation). */
    UPROPERTY(BlueprintReadOnly) TArray<FName> StartedCues;
    UPROPERTY(BlueprintReadOnly) TArray<FName> RenderedCues;
    UPROPERTY(BlueprintReadOnly) float PeakEnvelope = 0;
    virtual void TickComponent(float Delta, ELevelTick Kind, FActorComponentTickFunction* Fn) override;
    virtual void EndPlay(const EEndPlayReason::Type Reason) override;
private:
    UPROPERTY(Transient) TArray<TObjectPtr<UAudioComponent>> Voices;
    TArray<float> Remaining;
    TArray<FName> VoiceKinds;
    TArray<float> VoicePeaks;
    void Envelope(const UAudioComponent* Voice, const USoundWave* Wave, const float Value);
    void Retire(int32 Index);
};

UCLASS()
class CATANANIMATION_API ACatanPracticeCharacter : public ACharacter {
    GENERATED_BODY()
public:
    ACatanPracticeCharacter();
    UPROPERTY(EditAnywhere, BlueprintReadWrite) TObjectPtr<UCatanMotionLibrary> Library;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) bool bPracticePartner = false;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<UCatanCombatPresentation> Combat;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<UCatanInteractionSound> Sound;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<UCatanImpactBurst> ImpactBits;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<USkeletalMeshComponent> SwordMesh;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<USkeletalMeshComponent> GunMesh;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<USkeletalMeshComponent> ShieldMesh;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<USpringArmComponent> CameraArm;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<UCameraComponent> FollowCamera;
    UPROPERTY(BlueprintReadOnly) int32 PracticeHealth = 100;
    UPROPERTY(BlueprintReadOnly) int32 ConfirmedPracticeHits = 0;
    UPROPERTY(BlueprintReadOnly) int32 PracticeParries = 0;
    UPROPERTY(BlueprintReadOnly) TObjectPtr<ACatanAnimatedChest> NearbyChest;
    UFUNCTION(BlueprintCallable) void Strike();
    UFUNCTION(BlueprintCallable) void Interact();
    UFUNCTION(BlueprintCallable) void ResetPractice();
    UFUNCTION(BlueprintCallable) void ReducedMotion();
    UFUNCTION(BlueprintCallable) void ReceivePracticeHit(ACatanPracticeCharacter* Attacker, ECatanWeapon Weapon);
    UFUNCTION() void Contact(ECatanWeapon Weapon);
    /** Automation hook: sends a simulated key through the owning player's real input bindings. */
    UFUNCTION(BlueprintCallable) bool SimulatePracticeKey(FKey Key, bool bPressed);
    UFUNCTION(BlueprintCallable, CallInEditor) void RefreshPreview() { OnConstruction(GetActorTransform()); }
    virtual void OnConstruction(const FTransform& Transform) override;
    virtual void BeginPlay() override;
    virtual void Tick(float Delta) override;
    virtual void SetupPlayerInputComponent(UInputComponent* Input) override;
private:
    FVector StartLocation;
    float ReturnIn = -1, RecoverIn = -1;
    UPROPERTY(Transient) TObjectPtr<ACatanPracticeCharacter> ReturnTarget;
    void LookYaw(float Value);
    void LookPitch(float Value);
    void GuardOn();
    void GuardOff();
    void SwordKey();
    void GunKey();
    void FistKey();
};

UCLASS()
class CATANANIMATION_API ACatanPracticeHUD : public AHUD {
    GENERATED_BODY()
    virtual void DrawHUD() override;
};
