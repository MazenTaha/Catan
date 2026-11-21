#include "Hero/HeroAnim.h"
#include "Animation/AnimInstanceProxy.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimationPoseData.h"
#include "AnimationRuntime.h"
#include "Components/SkeletalMeshComponent.h"

namespace
{
	// Sequence sampling and blending run on the animation worker; UObject access is copied in PreUpdate.
	struct FHeroProxy : FAnimInstanceProxy
	{
		explicit FHeroProxy(UAnimInstance* Instance) : FAnimInstanceProxy(Instance) {}
		UAnimSequence* Current = nullptr;
		UAnimSequence* Previous = nullptr;
		int32 State = INDEX_NONE;
		float Phase = 0.f, Blend = 1.f;
		virtual void PreUpdate(UAnimInstance* Instance, float Dt) override
		{
			FAnimInstanceProxy::PreUpdate(Instance, Dt);
			const auto* Anim = CastChecked<UCatnightHeroAnim>(Instance);
			if (Anim->Clips.IsValidIndex(Anim->State) && State != Anim->State)
			{
				Previous = Current;
				Current = Anim->Clips[Anim->State];
				State = Anim->State;
				Blend = Previous ? 0.f : 1.f;
			}
			Phase = Anim->Phase;
			Blend = FMath::Min(1.f, Blend + Dt / 0.18f);
		}
		virtual bool Evaluate(FPoseContext& Output) override
		{
			Output.ResetToRefPose();
			if (!Current) return true;
			FAnimationPoseData Data(Output);
			Current->GetAnimationPose(Data, FAnimExtractContext(Phase * Current->GetPlayLength(), false));
			if (Previous && Blend < 1.f)
			{
				FPoseContext Other(Output);
				FAnimationPoseData Old(Other);
				Previous->GetAnimationPose(Old, FAnimExtractContext(Phase * Previous->GetPlayLength(), false));
				const float Smooth = Blend * Blend * (3.f - 2.f * Blend);
				FAnimationRuntime::BlendTwoPosesTogetherInPlace(Data, Old, Smooth);
			}
			return true;
		}
	};
}

void UCatnightHeroAnim::NativeInitializeAnimation()
{
	Super::NativeInitializeAnimation();
	Clips.Reset();
	const bool Horse = GetSkelMeshComponent() && GetSkelMeshComponent()->GetName().Contains(TEXT("Horse"));
	const TArray<FString> Names = Horse ? TArray<FString>{TEXT("Idle"), TEXT("Walk"), TEXT("Gallop")}
		: TArray<FString>{TEXT("Idle"), TEXT("Walk"), TEXT("Run"), TEXT("CrouchIdle"), TEXT("CrouchWalk"), TEXT("RideIdle"), TEXT("RideWalk"), TEXT("RideGallop")};
	for (const FString& Name : Names)
	{
		const FString Path = FString::Printf(TEXT("/Game/Generated/Heroes/A_%s_%s"), Horse ? TEXT("Horse") : TEXT("Knight"), *Name);
		auto* Clip = LoadObject<UAnimSequence>(nullptr, *Path);
		if (!Clip) UE_LOG(LogTemp, Error, TEXT("HERO missing clip %s"), *Path);
		Clips.Add(Clip);
	}
}

FAnimInstanceProxy* UCatnightHeroAnim::CreateAnimInstanceProxy() { return new FHeroProxy(this); }
void UCatnightHeroAnim::DestroyAnimInstanceProxy(FAnimInstanceProxy* Proxy) { delete Proxy; }
