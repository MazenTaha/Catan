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
#include "PerfProbe.h"
#include "Board/CatnightBoardActor.h"
#include "Board/CatnightDaylightActor.h"
#include "Board/CatnightHallActor.h"
#include "Table/BoardView.h"
#include "Ui/SCatnightRoot.h"
#include "Ui/HallSettings.h"
#include "Ui/HallStyle.h"
#include "UnrealClient.h"
#include "Hero/HeroPawn.h"
#include "Camera/PlayerCameraManager.h"
#include "Hero/HeroYard.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Text/STextBlock.h"
#include "Ui/HallKit.h"
#include "Framework/Application/SlateApplication.h"

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
		// The hall surrounds the table; the board already owns the carved dice pair.
		Hall = GetWorld()->SpawnActor<ACatnightHallActor>();
		if (Hall) Hall->Setup(Match, false);
		// Sun, moon, sky and the lamps at night, following the game's clock.
		Daylight = GetWorld()->SpawnActor<ACatnightDaylightActor>();
		if (Daylight) Daylight->Setup(Match);
	}

	if (UGameViewportClient* Viewport = GetWorld()->GetGameViewport())
	{
		Root = SNew(SCatnightRoot).Match(Match).View(View).Screen(First).OnHeroYard(FSimpleDelegate::CreateUObject(this, &ACatnightGameMode::EnterHeroYard));
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

	FString HeroReview;
	if (FParse::Value(Cmd, TEXT("CatnightHero="), HeroReview))
	{
		// Exercise entering after the menu has already stopped world drawing.
		if (HeroReview == TEXT("return"))
			if (auto* Viewport = GetWorld()->GetGameViewport()) Viewport->bDisableWorldRendering = true;
		EnterHeroYard();
		if (Hero) Hero->ReviewMode = HeroReview;
		if (HeroReview == TEXT("return"))
		{
			const double Ready = FPlatformTime::Seconds() + 1.0;
			ReviewHandle = FTSTicker::GetCoreTicker().AddTicker(TEXT("CatnightHeroReturn"), .1f,
				[this, Match, Ready](float)
				{
					if (FPlatformTime::Seconds() < Ready) return true;
					bool bOK = Hero && HeroYard && !Hall && !Daylight && Match->bPresentationPaused
						&& GetWorld()->GetGameViewport() && !GetWorld()->GetGameViewport()->bDisableWorldRendering;
					LeaveHeroYard();
					const auto* PC = GetWorld()->GetFirstPlayerController();
					bOK &= !Hero && !HeroYard && Hall && Daylight && !Hall->HasDice()
						&& !Match->bPresentationPaused && Root->GetVisibility() == EVisibility::Visible
						&& PC && PC->bShowMouseCursor && PC->GetViewTarget() == Board;
					if (bOK) { UE_LOG(LogTemp, Display, TEXT("CATNIGHT HERO RETURN PASSED: isolated yard light, restored hall/daylight, one dice owner, table view and input")); }
					else { UE_LOG(LogTemp, Error, TEXT("CATNIGHT HERO RETURN FAILED")); }
					FPlatformMisc::RequestExitWithStatus(false, bOK ? 0 : 1);
					return false;
				});
		}
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
	PerfHandle = CatnightPerf::StartFromCommandLine(GetWorld(), Match);

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

void ACatnightGameMode::EnterHeroYard()
{
	if (Hero || !Root) return;
	GetGameInstance()->GetSubsystem<UCatnightMatchSubsystem>()->Match()->bPresentationPaused = true;
	Root->SetVisibility(EVisibility::Collapsed);
	// The title/flat chart stops world drawing; the collapsed table no longer owns it in the yard.
	if (auto* Viewport = GetWorld()->GetGameViewport()) Viewport->bDisableWorldRendering = false;
	if (Board) Board->SetActorHiddenInGame(true);
	// Table sun, sky, fog and unbound grading must leave the yard's physical daylight alone.
	if (Daylight) { Daylight->Destroy(); Daylight = nullptr; }
	if (Hall) { Hall->Destroy(); Hall = nullptr; }
	const FVector Origin(500000, 0, 0);
	HeroYard = GetWorld()->SpawnActor<ACatnightHeroYard>(Origin, FRotator::ZeroRotator);
	Hero = GetWorld()->SpawnActor<ACatnightHero>(Origin + FVector(0, 0, 98), FRotator::ZeroRotator);
	if (auto* PC = GetWorld()->GetFirstPlayerController())
	{
		PC->Possess(Hero);
		PC->SetViewTarget(Hero);
		PC->bShowMouseCursor = false;
		PC->PlayerCameraManager->ViewPitchMin = -65;
		PC->PlayerCameraManager->ViewPitchMax = 35;
		float Angle = 0;
		FParse::Value(FCommandLine::Get(), TEXT("CatnightHeroAngle="), Angle);
		PC->SetControlRotation(FRotator(-12, Angle, 0));
		PC->SetInputMode(FInputModeGameOnly());
	}
	HeroHud = SNew(SOverlay).Visibility(EVisibility::HitTestInvisible)
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Bottom).Padding(24)
		[
			HallKit::Paper(SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()[HallKit::Ink(TEXT("Knight & riding yard"), 23)]
				+ SVerticalBox::Slot().AutoHeight()[SNew(STextBlock).Font(Hall::Body(18)).ColorAndOpacity(Hall::Color::MapInk)
					.Text_Lambda([Weak = TWeakObjectPtr<ACatnightHero>(Hero)] { return FText::FromString(Weak.IsValid() ? Weak->Status() : FString()); })]
				+ SVerticalBox::Slot().AutoHeight()[HallKit::Ink(TEXT("Mouse / right stick: look / Wheel: camera distance / Esc: hall"), 17)], HallKit::EPaper::Vellum)
		];
	GetWorld()->GetGameViewport()->AddViewportWidgetContent(HeroHud.ToSharedRef(), 20);
}

void ACatnightGameMode::LeaveHeroYard()
{
	if (!Hero) return;
	// Restore the visible widget path before Slate receives keyboard focus.
	Root->SetVisibility(EVisibility::Visible);
	if (Board) Board->SetActorHiddenInGame(false);
	if (auto* PC = GetWorld()->GetFirstPlayerController())
	{
		PC->UnPossess();
		PC->bShowMouseCursor = true;
		if (Board) PC->SetViewTarget(Board);
		FInputModeUIOnly Mode;
		Mode.SetWidgetToFocus(Root->FocusTarget());
		PC->SetInputMode(Mode);
	}
	Hero->Destroy(); Hero = nullptr;
	if (HeroYard) { HeroYard->Destroy(); HeroYard = nullptr; }
	const TSharedRef<FCatnightMatch> Match = GetGameInstance()->GetSubsystem<UCatnightMatchSubsystem>()->Match();
	Hall = GetWorld()->SpawnActor<ACatnightHallActor>();
	if (Hall) Hall->Setup(Match, false);
	Daylight = GetWorld()->SpawnActor<ACatnightDaylightActor>();
	if (Daylight) Daylight->Setup(Match);
	if (HeroHud) { GetWorld()->GetGameViewport()->RemoveViewportWidgetContent(HeroHud.ToSharedRef()); HeroHud.Reset(); }
	GetGameInstance()->GetSubsystem<UCatnightMatchSubsystem>()->Match()->bPresentationPaused = false;
}

void ACatnightGameMode::EndPlay(const EEndPlayReason::Type Reason)
{
	if (HeroHud)
    {
        if (auto* Viewport = GetWorld()->GetGameViewport()) Viewport->RemoveViewportWidgetContent(HeroHud.ToSharedRef());
        HeroHud.Reset();
    }
    if (GetGameInstance()) if (auto* Subsystem = GetGameInstance()->GetSubsystem<UCatnightMatchSubsystem>()) Subsystem->Match()->bPresentationPaused = false;
    FTSTicker::GetCoreTicker().RemoveTicker(ShotHandle);
	FTSTicker::GetCoreTicker().RemoveTicker(ReviewHandle);
	FTSTicker::GetCoreTicker().RemoveTicker(PerfHandle);
	if (Root)
	{
		if (UGameViewportClient* Viewport = GetWorld()->GetGameViewport()) Viewport->RemoveViewportWidgetContent(Root.ToSharedRef());
		Root.Reset();
	}
	Super::EndPlay(Reason);
}
