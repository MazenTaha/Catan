// Starts a match and puts the Slate table on screen.
//
// Command line (also used by the automated screenshots):
//   -CatnightSeed=<seed>      board seed (default: random)
//   -CatnightLevel=easy|medium|hard
//   -CatnightAutoplay         bots play the human seat too
//   -CatnightBotDelay=<s>     seconds between bot moves (default 0.7)
//   -CatnightShot=<file.png>  save a screenshot after -CatnightShotAfter=<s> (default 6), then quit
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "Containers/Ticker.h"
#include "CatnightGameMode.generated.h"

UCLASS()
class CATNIGHT_API ACatnightGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ACatnightGameMode();
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	TSharedPtr<class SWidget> Table;
	FTSTicker::FDelegateHandle ShotHandle;
};
