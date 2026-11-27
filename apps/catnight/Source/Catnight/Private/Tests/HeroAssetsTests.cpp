#include "Misc/AutomationTest.h"
#include "Animation/AnimSequence.h"
#include "Animation/Skeleton.h"
#include "Engine/SkeletalMesh.h"
#if WITH_EDITOR
#include "AssetCompilingManager.h"
#endif

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FCatnightHeroAssetsTest, "Catnight.Hero.Assets",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::ProductFilter)

namespace
{
	FTransform At(UAnimSequence* Clip, FName Name, float Time)
	{
		const FReferenceSkeleton& Ref = Clip->GetSkeleton()->GetReferenceSkeleton();
		FTransform Result = FTransform::Identity;
		for (int32 I = Ref.FindBoneIndex(Name); I != INDEX_NONE; I = Ref.GetParentIndex(I))
		{
			FTransform Local;
			Clip->GetBoneTransform(Local, FSkeletonPoseBoneIndex(I), FAnimExtractContext(Time, false), false);
			Result = Result * Local;
		}
		return Result;
	}
}

bool FCatnightHeroAssetsTest::RunTest(const FString& Parameters)
{
	int32 Checked = 0;
	for (const FString Family : {FString(TEXT("Knight")), FString(TEXT("Horse"))})
	{
		const bool Horse = Family == TEXT("Horse");
		auto* Mesh = LoadObject<USkeletalMesh>(nullptr, *FString::Printf(TEXT("/Game/Generated/Heroes/SK_%s"), *Family));
		if (!TestNotNull(TEXT("native skeletal mesh exists"), Mesh)) return false;
#if WITH_EDITOR
		UObject* MeshAssets[] = {Mesh};
		FAssetCompilingManager::Get().FinishCompilationForObjects(MeshAssets);
#endif
		TestTrue(TEXT("human-scale imported geometry"), Mesh->GetBounds().BoxExtent.Z > 70 && Mesh->GetBounds().BoxExtent.Z < 150);
		for (const auto& Material : Mesh->GetMaterials()) TestNotNull(TEXT("every hero material is bound"), Material.MaterialInterface.Get());
		for (FName Bone : Horse ? TArray<FName>{TEXT("Seat"), TEXT("BitL"), TEXT("BitR"), TEXT("Forward")}
			: TArray<FName>{TEXT("GripL"), TEXT("GripR"), TEXT("Cape4"), TEXT("Forward")})
			TestTrue(TEXT("mount/cloth/hand anchors exist"), Mesh->GetRefSkeleton().FindBoneIndex(Bone) != INDEX_NONE);
		const TArray<FString> Modes = Horse ? TArray<FString>{TEXT("Idle"), TEXT("Walk"), TEXT("Gallop")}
			: TArray<FString>{TEXT("Idle"), TEXT("Walk"), TEXT("Run"), TEXT("CrouchIdle"), TEXT("CrouchWalk"), TEXT("RideIdle"), TEXT("RideWalk"), TEXT("RideGallop")};
		for (const FString& Mode : Modes)
		{
			auto* Clip = LoadObject<UAnimSequence>(nullptr, *FString::Printf(TEXT("/Game/Generated/Heroes/A_%s_%s"), *Family, *Mode));
			if (!TestNotNull(TEXT("baked native animation exists"), Clip)) return false;
#if WITH_EDITOR
			// Cold loads can still be compressing. Sample the final clip, not transient build data.
			UObject* ClipAssets[] = {Clip};
			FAssetCompilingManager::Get().FinishCompilationForObjects(ClipAssets);
#endif
			TestEqual(TEXT("clip uses this mesh skeleton"), Clip->GetSkeleton(), Mesh->GetSkeleton());
			TestTrue(TEXT("non-empty clip"), Clip->GetPlayLength() >= .4f);
			const FReferenceSkeleton& Ref = Clip->GetSkeleton()->GetReferenceSkeleton();
			for (int32 Bone = 0; Bone < Ref.GetNum(); Bone++)
			{
				const FName Name = Ref.GetBoneName(Bone);
				const FTransform First = At(Clip, Name, 0), Last = At(Clip, Name, Clip->GetPlayLength());
				TestTrue(FString::Printf(TEXT("%s/%s/%s loop closes (position delta %.4f cm, angle %.4f degrees)"),
					*Family, *Mode, *Name.ToString(), FVector::Distance(First.GetLocation(), Last.GetLocation()),
					FMath::RadiansToDegrees(First.GetRotation().AngularDistance(Last.GetRotation()))), First.Equals(Last, .05f));
				for (int32 Sample = 0; Sample < 12; Sample++)
					TestFalse(TEXT("finite bone transforms throughout clip"), At(Clip, Name, Clip->GetPlayLength() * Sample / 12.f).ContainsNaN());
			}
			// Imported feet are measured independently of the Blender authoring report.
			if (Mode == TEXT("Walk") || Mode == TEXT("Run") || Mode == TEXT("CrouchWalk") || Mode == TEXT("Gallop"))
			{
				const TArray<FName> Feet = Horse ? TArray<FName>{TEXT("PasternFL"), TEXT("PasternFR"), TEXT("PasternHL"), TEXT("PasternHR")}
					: TArray<FName>{TEXT("FootL"), TEXT("FootR")};
				for (FName Foot : Feet) for (int32 I = 0; I < 30; I++)
				{
					const float Height = At(Clip, Foot, Clip->GetPlayLength() * I / 30.f).GetLocation().Z;
					TestTrue(FString::Printf(TEXT("%s/%s/%s t%d height %.3f cm"), *Family, *Mode, *Foot.ToString(), I, Height), Height > (Horse ? 14.f : 7.f) && Height < 65.f);
				}
			}
			Checked++;
		}
	}
	AddInfo(FString::Printf(TEXT("HERO ASSETS %d native clips: scale, materials, anchors, finite loops and imported foot heights"), Checked));
	return !HasAnyErrors();
}
#endif
