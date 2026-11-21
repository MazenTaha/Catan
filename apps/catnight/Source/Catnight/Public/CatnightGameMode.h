// Puts the game's screens on the viewport: the title screen, or straight to a table.
//
// Command line (also used by the automated screenshots):
//   -CatnightScreen=title|new|table   first screen (default: title; any match option below means table)
//   -CatnightSeed=<seed>      board seed (default: random)
//   -CatnightLevel=easy|medium|hard
//   -CatnightPlayers=3|4
//   -CatnightHotseat=<n>      the first n seats are people on this device (privacy curtain)
//   -CatnightAutoplay         bots play the human seats too
//   -CatnightBotDelay=<s>     seconds between bot moves (default 0.7)
//   -CatnightNoSave           no autosave and no Continue (tests)
//   -CatnightFlat             start with the flat chart instead of the 3D table
//   -CatnightCamera=<yaw>,<pitch>,<zoom>   turn the 3D table (screenshots)
//   -CatnightShot=<file.png>  save a screenshot after -CatnightShotAfter=<s> (default 6), then quit
//   -CatnightShotOnWin       wait for victory before the screenshot (autoplay validation)
//   -CatnightNoHall           no hall round the table (the dice stay)
//   -CatnightGamepad          start with gamepad prompts (screenshots)
//   -CatnightUiDrive=mouse|pad  plays the person's seats through the UI with simulated input
//                             (Table/UiDriver.cpp), logging CATNIGHT UIDRIVE lines
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
	TSharedPtr<class SCatnightRoot> Root;
	TSharedPtr<struct FCatnightBoardView> View;
	UPROPERTY() TObjectPtr<class ACatnightBoardActor> Board;
	UPROPERTY() TObjectPtr<class ACatnightHallActor> Hall;
	FTSTicker::FDelegateHandle ShotHandle;
};
