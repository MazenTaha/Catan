#include "CatnightGameMode.h"

#include "CatnightMatch.h"
#include "CatnightRules/Bots.h"
#include "Engine/GameInstance.h"
#include "Engine/GameViewportClient.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformMisc.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Board/CatnightBoardActor.h"
#include "Table/BoardView.h"
#include "Ui/SCatnightRoot.h"
#include "Ui/HallSettings.h"
#include "Ui/HallStyle.h"
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
	FString Review;
	FParse::Value(Cmd, TEXT("CatnightReview="), Review);
	const bool bReview = Review == TEXT("build") || Review == TEXT("upgrade") || Review == TEXT("roll") || Review == TEXT("production");
	TSharedRef<double> ReviewAt = MakeShared<double>(0.0);
	Match->SavePath = (bReview || FParse::Param(Cmd, TEXT("CatnightNoSave"))) ? FString() : FCatnightMatch::DefaultSavePath();
	FParse::Value(Cmd, TEXT("CatnightBotDelay="), Match->BotDelay);

	// Any match option on the command line starts a table right away (tests and screenshots).
	FCatnightMatchSetup Setup;
	Setup.Seed = FString::Printf(TEXT("table-%d"), FMath::Rand());
	bool bDirect = FParse::Value(Cmd, TEXT("CatnightSeed="), Setup.Seed);
	FString Level;
	if (FParse::Value(Cmd, TEXT("CatnightLevel="), Level))
	{
		bDirect = true;
		Setup.Level = Level == TEXT("easy") ? catnight::BotLevel::Wanderer
			: Level == TEXT("hard") ? catnight::BotLevel::Archdemon
			: catnight::BotLevel::Warlord;
	}
	bDirect |= FParse::Value(Cmd, TEXT("CatnightPlayers="), Setup.Players);
	int32 Hotseat = 0;
	if (FParse::Value(Cmd, TEXT("CatnightHotseat="), Hotseat))
	{
		bDirect = true;
		Setup.Seats = Setup.ResolvedSeats();
		static const TCHAR* People[] = {TEXT("Ada"), TEXT("Ben"), TEXT("Cai"), TEXT("Dee")};
		for (int32 I = 0; I < Setup.Seats.Num(); I++)
		{
			Setup.Seats[I].bHuman = I < Hotseat;
			if (I < Hotseat) Setup.Seats[I].Name = People[I];
		}
	}
	Setup.bAutoplay = bReview || FParse::Param(Cmd, TEXT("CatnightAutoplay"));
	if (bReview) Match->BotDelay = 10000.f;
	bDirect |= Setup.bAutoplay;

	SCatnightRoot::EScreen First = SCatnightRoot::EScreen::Title;
	FString ScreenName;
	FParse::Value(Cmd, TEXT("CatnightScreen="), ScreenName);
	if (bDirect || ScreenName == TEXT("table"))
	{
		if (!Match->HasGame() || bDirect)
		{
			const FString Error = Match->Start(Setup);
			if (!Error.IsEmpty()) UE_LOG(LogTemp, Error, TEXT("Catnight: %s"), *Error);
		}
		First = SCatnightRoot::EScreen::Table;
	}
	else if (ScreenName == TEXT("new"))
	{
		First = SCatnightRoot::EScreen::NewGame;
	}

	View = MakeShared<FCatnightBoardView>();
	View->b3D = !FParse::Param(Cmd, TEXT("CatnightFlat"));
	View->bReducedMotion = FHallSettings::Get().bReduceMotion;
	if (FParse::Param(Cmd, TEXT("CatnightFullMotion"))) View->bReducedMotion = false;
	if (FParse::Param(Cmd, TEXT("CatnightReduceMotion"))) View->bReducedMotion = true;
	if (FParse::Value(Cmd, TEXT("CatnightInspect="), View->InspectedHex)) View->InspectionRevision++;
	Board = GetWorld()->SpawnActor<ACatnightBoardActor>();
	if (Board)
	{
		Board->Setup(Match, View);
		FString Cam;
		if (FParse::Value(Cmd, TEXT("CatnightCamera="), Cam, false) && View->MoveCamera)
		{
			TArray<FString> Parts;
			Cam.ParseIntoArray(Parts, TEXT(","));
			if (Parts.Num() == 3) View->MoveCamera(FCString::Atof(*Parts[0]), FCString::Atof(*Parts[1]), FCString::Atof(*Parts[2]));
		}
	}

	if (UGameViewportClient* Viewport = GetWorld()->GetGameViewport())
	{
		Root = SNew(SCatnightRoot).Match(Match).View(View).Screen(First);
		Viewport->AddViewportWidgetContent(Root.ToSharedRef(), 10);
	}
	// QA flags override both table and Hall motion without writing player preferences.
	Hall::bReduceMotion = View->bReducedMotion;
	if (APlayerController* PC = GetWorld()->GetFirstPlayerController())
	{
		PC->bShowMouseCursor = true;
		FInputModeUIOnly Mode;
		if (Root) Mode.SetWidgetToFocus(Root->FocusTarget());
		Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		PC->SetInputMode(Mode);
	}

	if (bReview)
	{
		const double ReadyAt = FPlatformTime::Seconds() + 2.0;
		ReviewHandle = FTSTicker::GetCoreTicker().AddTicker(TEXT("CatnightReview"), 0.1f,
			[Match, Review, ReviewAt, ReadyAt, ReviewBoard = TWeakObjectPtr<ACatnightBoardActor>(Board), Steps = 0](float) mutable
		{
			if (FPlatformTime::Seconds() < ReadyAt) return true;
			for (int32 Batch = 0; Batch < 12 && Steps < 6000; Batch++, Steps++)
			{
				const auto Next = catnight::DecideAction(Match->State());
				if (!Next || !Match->StepBot()) return false;
				const auto Type = Next->type;
				if ((Review == TEXT("build") && Type == catnight::ActionType::PlaceSetupOutpost) ||
					(Review == TEXT("upgrade") && Type == catnight::ActionType::BuildCitadel) ||
					(Review == TEXT("roll") && Type == catnight::ActionType::RollDice) ||
					(Review == TEXT("production") && ReviewBoard.IsValid() && ReviewBoard->HasPaidProduction()))
				{
					*ReviewAt = FPlatformTime::Seconds();
					UE_LOG(LogTemp, Display, TEXT("CATNIGHT REVIEW %s at action %d"), *Review, Match->ActionCount());
					return false;
				}
			}
			return Steps < 6000;
		});
	}

	FString Shot;
	if (FParse::Value(Cmd, TEXT("CatnightShot="), Shot))
	{
		float After = 6.f;
		FParse::Value(Cmd, TEXT("CatnightShotAfter="), After);
		const bool bOnWin = FParse::Param(Cmd, TEXT("CatnightShotOnWin"));
		const double CaptureStart = FPlatformTime::Seconds();
		double Requested = 0;
		ShotHandle = FTSTicker::GetCoreTicker().AddTicker(TEXT("CatnightShot"), 0.1f, [Shot, Match, bOnWin, CaptureStart, After, bReview, ReviewAt, Requested](float) mutable
		{
			const double Now = FPlatformTime::Seconds();
			if (Requested == 0)
			{
				if (bReview && *ReviewAt == 0.0) return true;
				if (Now < (bReview ? *ReviewAt : CaptureStart) + FMath::Max(0.f, After) || (bOnWin && !Match->IsEnded())) return true;
				if (bOnWin) UE_LOG(LogTemp, Display, TEXT("CATNIGHT CAPTURE victory after %d actions"), Match->ActionCount());
				FScreenshotRequest::RequestScreenshot(Shot, true, false);
				Requested = Now;
				return true;
			}
			if (Now - Requested > 2.0 && !FScreenshotRequest::IsScreenshotRequested())
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
	FTSTicker::GetCoreTicker().RemoveTicker(ReviewHandle);
	if (Root)
	{
		if (UGameViewportClient* Viewport = GetWorld()->GetGameViewport()) Viewport->RemoveViewportWidgetContent(Root.ToSharedRef());
		Root.Reset();
	}
	Super::EndPlay(Reason);
}
