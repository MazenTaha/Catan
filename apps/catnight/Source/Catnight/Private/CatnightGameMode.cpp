#include "CatnightGameMode.h"

#include "CatnightMatch.h"
#include "Engine/GameInstance.h"
#include "Engine/GameViewportClient.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformMisc.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Table/STable.h"
#include "UnrealClient.h"

ACatnightGameMode::ACatnightGameMode()
{
	DefaultPawnClass = nullptr;
}

void ACatnightGameMode::BeginPlay()
{
	Super::BeginPlay();
	UCatnightMatchSubsystem* Subsystem = GetGameInstance()->GetSubsystem<UCatnightMatchSubsystem>();
	TSharedRef<FCatnightMatch> Match = Subsystem->Match();

	const TCHAR* Cmd = FCommandLine::Get();
	FCatnightMatchSetup Setup;
	Setup.Seed = FString::Printf(TEXT("table-%d"), FMath::Rand());
	FParse::Value(Cmd, TEXT("CatnightSeed="), Setup.Seed);
	FString Level;
	if (FParse::Value(Cmd, TEXT("CatnightLevel="), Level))
	{
		Setup.Level = Level == TEXT("easy") ? catnight::BotLevel::Wanderer
			: Level == TEXT("hard") ? catnight::BotLevel::Archdemon
			: catnight::BotLevel::Warlord;
	}
	Setup.bAutoplay = FParse::Param(Cmd, TEXT("CatnightAutoplay"));
	FParse::Value(Cmd, TEXT("CatnightBotDelay="), Match->BotDelay);
	if (!Match->HasGame()) Match->Start(Setup);

	if (UGameViewportClient* Viewport = GetWorld()->GetGameViewport())
	{
		Table = SNew(STable).Match(Match);
		Viewport->AddViewportWidgetContent(Table.ToSharedRef(), 10);
	}
	if (APlayerController* PC = GetWorld()->GetFirstPlayerController())
	{
		PC->bShowMouseCursor = true;
		FInputModeUIOnly Mode;
		if (Table) Mode.SetWidgetToFocus(Table);
		Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		PC->SetInputMode(Mode);
	}

	FString Shot;
	if (FParse::Value(Cmd, TEXT("CatnightShot="), Shot))
	{
		float After = 6.f;
		FParse::Value(Cmd, TEXT("CatnightShotAfter="), After);
		double Requested = 0;
		ShotHandle = FTSTicker::GetCoreTicker().AddTicker(TEXT("CatnightShot"), After, [Shot, Requested](float) mutable
		{
			if (Requested == 0)
			{
				FScreenshotRequest::RequestScreenshot(Shot, true, false);
				Requested = FPlatformTime::Seconds();
				return true;
			}
			if (FPlatformTime::Seconds() - Requested > 2.0)
			{
				FPlatformMisc::RequestExit(false, TEXT("CatnightShot"));
				return false;
			}
			return true;
		});
	}
}

void ACatnightGameMode::EndPlay(const EEndPlayReason::Type Reason)
{
	FTSTicker::GetCoreTicker().RemoveTicker(ShotHandle);
	if (Table)
	{
		if (UGameViewportClient* Viewport = GetWorld()->GetGameViewport()) Viewport->RemoveViewportWidgetContent(Table.ToSharedRef());
		Table.Reset();
	}
	Super::EndPlay(Reason);
}
