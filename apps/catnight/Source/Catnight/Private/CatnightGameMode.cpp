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
#include "Island/IslandWorld.h"
#include "Island/IslandMinimap.h"
#include "Ui/SDiceResult.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Text/STextBlock.h"
#include "Ui/HallKit.h"
#include "Framework/Application/SlateApplication.h"
#include "HAL/IConsoleManager.h"

namespace
{
	// The island's frame must fit a 144 Hz display (6.9 ms) with room to spare, or vsync shows
	// some frames twice and turning judders. Measured on the RTX 4050 laptop at 1080p while
	// walking: GPU 6.3 -> 5.5 ms. TSR's flicker and resurrection heuristics cost 0.6 ms on the
	// meadows, and the island has no volume-lit translucency (its sea lights per pixel).
	// The game thread waits for the RHI thread's previous frame, so each frame's time step tracks
	// what reaches the screen: with vsync at 60 Hz the step's spread fell from 1.3 to 0.5 ms
	// (the camera's swing across the mountains stopped stepping unevenly).
	// Set only while walking the island and put back on the way out, so the table keeps its look.
	// Scalability priority (the level these come from), so leaving can restore them.
	const TCHAR* const IslandRenderSettings[][2] = {
		{TEXT("r.TSR.ShadingRejection.Flickering"), TEXT("0")},
		{TEXT("r.TSR.Resurrection"), TEXT("0")},
		{TEXT("r.TranslucencyLightingVolume"), TEXT("0")},
		{TEXT("r.GTSyncType"), TEXT("1")},
	};
	TMap<FString, FString> TableRenderSettings;

	void SetIslandRendering(bool bOn)
	{
		if (bOn == !TableRenderSettings.IsEmpty()) return;
		for (const auto& Setting : IslandRenderSettings)
		{
			IConsoleVariable* Var = IConsoleManager::Get().FindConsoleVariable(Setting[0]);
			if (!Var) continue;
			if (bOn) { TableRenderSettings.Add(Setting[0], Var->GetString()); Var->Set(Setting[1], ECVF_SetByScalability); }
			else if (const FString* Old = TableRenderSettings.Find(Setting[0])) Var->Set(**Old, ECVF_SetByScalability);
		}
		if (!bOn) TableRenderSettings.Reset();
	}
}

ACatnightGameMode::ACatnightGameMode()
{
	DefaultPawnClass = nullptr;
}

void ACatnightGameMode::BeginPlay()
{
	Super::BeginPlay();
    if(GEngine) { GEngine->bEnableOnScreenDebugMessages=false; GEngine->bEnableOnScreenDebugMessagesDisplay=false; }
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
	View->ExploreIsland = FSimpleDelegate::CreateUObject(this, &ACatnightGameMode::EnterIsland);
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
		if (Hero) {
            Hero->ReviewMode = HeroReview;
            if(HeroReview==TEXT("slope") || HeroReview==TEXT("ride-slope")) Hero->SetActorLocation(HeroYard->GetActorLocation()+FVector(900,1000,98));
        }
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
	FString IslandReview;
	if (FParse::Value(Cmd, TEXT("CatnightIsland="), IslandReview))
	{
		if (!Match->HasGame()) { FCatnightMatchSetup Demo; Demo.Seed = TEXT("island-rework"); Match->Start(Demo); }
		EnterIsland();
		if (Hero && IslandReview == TEXT("movement")) Hero->ReviewMode = TEXT("island-test");
		// -CatnightIslandDrive=tour: a scripted walk for frame pacing checks (with -CatnightPerf).
		FString Drive;
		if (Hero && FParse::Value(Cmd, TEXT("CatnightIslandDrive="), Drive)) Hero->ReviewMode = Drive;
		if (Island && Hero && IslandReview.IsNumeric())
		{
			const int32 H = FMath::Clamp(FCString::Atoi(*IslandReview), 0, 18);
			FVector P = Island->HexPoint(H) + FVector(-1200, -900, 0);
			P.Z = Island->GetActorLocation().Z + Island->SurfaceHeight(FVector2D(P - Island->GetActorLocation())) + 105;
			Hero->SetActorLocation(P);
		}
		if (IslandReview == TEXT("test") && Island)
		{
			FString Result; const bool Passed = Island->ValidateRoutes(Result);
			UE_LOG(LogTemp, Display, TEXT("%s"), *Result);
			FPlatformMisc::RequestExitWithStatus(false, Passed ? 0 : 1);
		}
		if (IslandReview == TEXT("return"))
		{
			const FString Record = Match->RecordJson();
			ReviewHandle = FTSTicker::GetCoreTicker().AddTicker(TEXT("CatnightIslandReturn"), 1.f,
				[this, Match, Record, Cycles = 0](float) mutable
				{
					const auto* PC = GetWorld()->GetFirstPlayerController();
					bool bOK = Island && Hero && !HeroYard && !Hall && !Daylight && Match->bPresentationPaused
						&& GetWorld()->GetGameViewport() && !GetWorld()->GetGameViewport()->bDisableWorldRendering;
					LeaveHeroYard();
					bOK &= !Island && !Hero && !HeroYard && Hall && Daylight && !Hall->HasDice()
						&& !Match->bPresentationPaused && Root->GetVisibility() == EVisibility::Visible
						&& PC && PC->bShowMouseCursor && PC->GetViewTarget() == Board && Match->RecordJson() == Record;
					if (bOK && ++Cycles < 3) { EnterIsland(); return true; }
					if (bOK) { UE_LOG(LogTemp, Display, TEXT("ISLAND RETURN PASSED: 3 cycles, unchanged record, restored table camera/input and hall")); }
					else { UE_LOG(LogTemp, Error, TEXT("ISLAND RETURN FAILED")); }
					FPlatformMisc::RequestExitWithStatus(false, bOK ? 0 : 1);
					return false;
				});
		}
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

void ACatnightGameMode::EnterHeroYard()
{
	EnterWalk(false);
}

void ACatnightGameMode::EnterIsland()
{
	const auto Match = GetGameInstance()->GetSubsystem<UCatnightMatchSubsystem>()->Match();
	if (!Match->HasGame() || Match->NeedsHandoff()) return;
	EnterWalk(true);
}

void ACatnightGameMode::EnterWalk(bool bIsland)
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
	FVector Start = Origin + FVector(0, 0, 98);
	if (bIsland)
	{
		Island = GetWorld()->SpawnActor<ACatnightIsland>(Origin, FRotator::ZeroRotator);
		Island->Setup(GetGameInstance()->GetSubsystem<UCatnightMatchSubsystem>()->Match());
		Start = Island->EntryPoint();
		SetIslandRendering(true);
		// The table's root widget applies the frame-rate setting as it ticks; collapsed, it no longer does.
		FHallSettings::Get().ApplyFrameRate(true);
	}
	else HeroYard = GetWorld()->SpawnActor<ACatnightHeroYard>(Origin, FRotator::ZeroRotator);
	Hero = GetWorld()->SpawnActor<ACatnightHero>(Start, FRotator::ZeroRotator);
	if (Island)
	{
		Hero->ExplorationIsland = Island;
		Hero->WalkBoundary = [Weak = TWeakObjectPtr<ACatnightIsland>(Island)](FVector P) { return Weak.IsValid() && Weak->CanWalk(P); };
	}
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
		// The first half second on the island is rough (distance fields and shadows for 200,000
		// instances are built as it first draws): rise out of black instead of showing it.
		if (bIsland) PC->PlayerCameraManager->StartCameraFade(1.f, 0.f, .8f, FLinearColor::Black, false, false);
		// Collect the table's hall and light now, under the fade: the engine's next timed
		// collection (every 61 s) otherwise fell a few seconds into the walk as a 40-80 ms hitch.
		if (bIsland && GEngine) GEngine->ForceGarbageCollection(true);
	}
	HeroHud = SNew(SOverlay).Visibility(EVisibility::HitTestInvisible)
		+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Top).Padding(24)
		[
			SNew(SIslandMinimap).Island(Island).Hero(Hero)
		]
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Bottom).Padding(24)
		[
            HallKit::Paper(SNew(SDiceResult).Match(GetGameInstance()->GetSubsystem<UCatnightMatchSubsystem>()->Match()),HallKit::EPaper::Vellum,FMargin(16,12))
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
	if (Island) { Island->Destroy(); Island = nullptr; SetIslandRendering(false); }
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
    if (Island) SetIslandRendering(false);
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
