#pragma once
#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "HeroAnim.generated.h"

UCLASS(Transient)
class UCatnightHeroAnim : public UAnimInstance
{
	GENERATED_BODY()
public:
	virtual void NativeInitializeAnimation() override;
	virtual FAnimInstanceProxy* CreateAnimInstanceProxy() override;
	virtual void DestroyAnimInstanceProxy(FAnimInstanceProxy* Proxy) override;
	UPROPERTY(Transient) TArray<TObjectPtr<class UAnimSequence>> Clips;
	int32 State = 0;
	float Phase = 0.f;
};
