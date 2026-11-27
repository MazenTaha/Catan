#include "Hero/HeroAnim.h"
#include "Animation/AnimInstanceProxy.h"
#include "Animation/AnimSequence.h"
#include "Animation/AnimationPoseData.h"
#include "AnimationRuntime.h"
#include "Components/SkeletalMeshComponent.h"
#include "Hero/HeroPawn.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Engine/World.h"
#include "TwoBoneIK.h"

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
        bool bFeet = false;
        float GroundOffset[2] = {0,0}, Contact[2] = {1,1}, PelvisOffset = 0.f;
        FVector GroundNormal[2] = {FVector::UpVector,FVector::UpVector};
        FVector KneeForward = FVector::ForwardVector;
        // The horse: each hoof's ground height relative to the ground under the body, which the
        // pawn already tilts to the smoothed slope. Legs reach down into dips and fold over bumps.
        bool bHooves = false;
        float HoofOffset[4] = {0,0,0,0};
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
            auto* Mesh=Anim->GetSkelMeshComponent();
            const auto* Hero=Mesh ? Cast<ACatnightHero>(Mesh->GetOwner()) : nullptr;
            bFeet=Hero && Mesh==Hero->GetMesh() && !Hero->IsMounted() && Hero->GetCharacterMovement()->IsMovingOnGround() && State>=0 && State<=4;
            bHooves=Hero && Anim->bHorse && Mesh!=Hero->GetMesh() && State>=0;
            if(bHooves) { TraceHooves(Hero,Mesh,Dt); return; }
            if(!bFeet) { GroundOffset[0]=GroundOffset[1]=PelvisOffset=0.f;return; }
            KneeForward=Mesh->GetComponentTransform().InverseTransformVectorNoScale(Hero->GetActorForwardVector());
            FCollisionQueryParams Query(SCENE_QUERY_STAT(CatnightFeet),false,Hero);
            if(Hero->ParkedCollision) Query.AddIgnoredActor(Hero->ParkedCollision);
            const float Follow=1.f-FMath::Exp(-14.f*Dt);
            for(int32 I=0;I<2;I++) {
                const FVector Foot=Mesh->GetSocketLocation(I==0 ? TEXT("FootL") : TEXT("FootR"));
                FHitResult Hit;
                const bool Supported=Hero->GetWorld()->LineTraceSingleByChannel(Hit,Foot+FVector(0,0,80),Foot-FVector(0,0,120),ECC_Visibility,Query) && Hit.ImpactNormal.Z>.65f;
                const float Offset=Supported ? FMath::Clamp(static_cast<float>(Hit.ImpactPoint.Z-Mesh->GetComponentLocation().Z),-40.f,40.f) : 0.f;
                GroundOffset[I]=FMath::Lerp(GroundOffset[I],Offset,Follow);
                const FVector Normal=Supported ? Mesh->GetComponentTransform().InverseTransformVectorNoScale(Hit.ImpactNormal) : FVector::UpVector;
                GroundNormal[I]=FMath::Lerp(GroundNormal[I],Normal,Follow).GetSafeNormal();
                const float T=FMath::Frac(Phase+I*.5f), Duty=State==2 ? .32f : State==4 ? .68f : .58f;
                Contact[I]=(State==0 || State==3) ? 1.f : FMath::SmoothStep(0.f,.08f,T)*(1.f-FMath::SmoothStep(Duty-.08f,Duty,T));
            }
            const float Lower=FMath::Clamp(FMath::Min(GroundOffset[0]*Contact[0],GroundOffset[1]*Contact[1]),-35.f,0.f);
            PelvisOffset=FMath::Lerp(PelvisOffset,Lower,1.f-FMath::Exp(-10.f*Dt));
		}
		void TraceHooves(const ACatnightHero* Hero,const USkeletalMeshComponent* Mesh,float Dt)
		{
			static const TCHAR* const Hooves[4]={TEXT("PasternFL"),TEXT("PasternFR"),TEXT("PasternHL"),TEXT("PasternHR")};
			FCollisionQueryParams Query(SCENE_QUERY_STAT(CatnightHooves),false,Hero);
			if(Hero->ParkedCollision) Query.AddIgnoredActor(Hero->ParkedCollision);
			const FTransform& Frame=Mesh->GetComponentTransform();
			const FVector Up=Frame.GetUnitAxis(EAxis::Z);
			// Heights in the mesh's own (scaled, tilted) space, so they apply directly to the pose.
			auto Ground=[&](const FVector& At,float& Z) {
				FHitResult Hit;
				if(!Hero->GetWorld()->LineTraceSingleByChannel(Hit,At+Up*90.f,At-Up*140.f,ECC_Visibility,Query) || Hit.ImpactNormal.Z<.6f) return false;
				Z=Frame.InverseTransformPosition(Hit.ImpactPoint).Z; return true;
			};
			float Base=0.f;
			const bool bBase=Ground(Frame.GetLocation(),Base);
			const float Follow=1.f-FMath::Exp(-12.f*Dt);
			// A gallop's long flight phase reads better with lighter correction.
			const float Weight=State==2 ? .6f : 1.f;
			for(int32 I=0;I<4;I++) {
				float Z=0.f;
				const float Want=bBase && Ground(Mesh->GetSocketLocation(Hooves[I]),Z) ? FMath::Clamp(Z-Base,-30.f,30.f)*Weight : 0.f;
				HoofOffset[I]=FMath::Lerp(HoofOffset[I],Want,Follow);
			}
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
            if(bFeet) {
                // All traces were copied on the game thread. Solve only transforms on this worker.
                FCSPose<FCompactPose> CS; CS.InitPose(Output.Pose);
                const auto& Bones=Output.Pose.GetBoneContainer();
                auto Index=[&Bones](FName Name){return Bones.MakeCompactPoseIndex(FMeshPoseBoneIndex(Bones.GetPoseBoneIndexForBoneName(Name)));};
                const auto Hips=Index(TEXT("Hips"));
                if(Hips.IsValid()) {
                    FTransform Pelvis=CS.GetComponentSpaceTransform(Hips);
                    Pelvis.AddToTranslation(FVector(0,0,PelvisOffset));CS.SetComponentSpaceTransform(Hips,Pelvis);
                    for(int32 I=0;I<2;I++) {
                        const auto Upper=Index(I==0 ? TEXT("ThighL") : TEXT("ThighR"));
                        const auto Lower=Index(I==0 ? TEXT("ShinL") : TEXT("ShinR"));
                        const auto Foot=Index(I==0 ? TEXT("FootL") : TEXT("FootR"));
                        if(!Upper.IsValid() || !Lower.IsValid() || !Foot.IsValid()) continue;
                        FTransform A=CS.GetComponentSpaceTransform(Upper),B=CS.GetComponentSpaceTransform(Lower),C=CS.GetComponentSpaceTransform(Foot);
                        const FVector Target=C.GetLocation()+FVector(0,0,GroundOffset[I]-PelvisOffset);
                        const FVector Pole=B.GetLocation()+KneeForward*40.f;
                        AnimationCore::SolveTwoBoneIK(A,B,C,Pole,Target,false,1.,1.);
                        const FQuat Tilt=FQuat::FindBetweenNormals(FVector::UpVector,GroundNormal[I]);
                        C.SetRotation((FQuat::Slerp(FQuat::Identity,Tilt,Contact[I])*C.GetRotation()).GetNormalized());
                        CS.SetComponentSpaceTransform(Upper,A);CS.SetComponentSpaceTransform(Lower,B);CS.SetComponentSpaceTransform(Foot,C);
                    }
                    FCSPose<FCompactPose>::ConvertComponentPosesToLocalPosesSafe(CS,Output.Pose);
                }
            }
            if(bHooves) {
                FCSPose<FCompactPose> CS; CS.InitPose(Output.Pose);
                const auto& Bones=Output.Pose.GetBoneContainer();
                auto Index=[&Bones](const FString& Name){return Bones.MakeCompactPoseIndex(FMeshPoseBoneIndex(Bones.GetPoseBoneIndexForBoneName(FName(*Name))));};
                static const TCHAR* const Legs[4]={TEXT("FL"),TEXT("FR"),TEXT("HL"),TEXT("HR")};
                bool bChanged=false;
                for(int32 I=0;I<4;I++) {
                    if(FMath::Abs(HoofOffset[I])<.3f) continue;
                    const auto Upper=Index(FString(TEXT("Upper"))+Legs[I]),Lower=Index(FString(TEXT("Cannon"))+Legs[I]),End=Index(FString(TEXT("Pastern"))+Legs[I]);
                    if(!Upper.IsValid() || !Lower.IsValid() || !End.IsValid()) continue;
                    FTransform A=CS.GetComponentSpaceTransform(Upper),B=CS.GetComponentSpaceTransform(Lower),C=CS.GetComponentSpaceTransform(End);
                    // Keep the animated bend plane (knees fold back, hocks forward).
                    FVector Bend=B.GetLocation()-(A.GetLocation()+C.GetLocation())*.5f;
                    if(Bend.SizeSquared()<1.f) Bend=FVector::ForwardVector;
                    const FQuat Hoof=C.GetRotation();
                    AnimationCore::SolveTwoBoneIK(A,B,C,B.GetLocation()+Bend.GetSafeNormal()*40.f,C.GetLocation()+FVector(0,0,HoofOffset[I]),false,1.,1.);
                    C.SetRotation(Hoof);
                    CS.SetComponentSpaceTransform(Upper,A);CS.SetComponentSpaceTransform(Lower,B);CS.SetComponentSpaceTransform(End,C);
                    bChanged=true;
                }
                if(bChanged) FCSPose<FCompactPose>::ConvertComponentPosesToLocalPosesSafe(CS,Output.Pose);
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
	bHorse = Horse;
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
