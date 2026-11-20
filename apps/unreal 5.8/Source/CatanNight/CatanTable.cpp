#include "CatanTable.h"

#include "Async/Async.h"
#include "Engine/GameViewportClient.h"
#include "Framework/Application/SlateApplication.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformMisc.h"
#include "HAL/PlatformProcess.h"
#include "HttpModule.h"
#include "IWebBrowserWindow.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Kismet/KismetSystemLibrary.h"
#include "HAL/IConsoleManager.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Parse.h"
#include "Misc/Paths.h"
#include "SWebBrowser.h"
#include "TimerManager.h"
#include "WebBrowserModule.h"

DEFINE_LOG_CATEGORY(LogCatanTable);

namespace
{
	// Same cool black as the web app (tokens.css --abyss), so nothing flashes white while it loads.
	const FColor Abyss(9, 10, 11);
	constexpr double StartTimeout = 20;

	FString Page(const FString& Body)
	{
		return FString::Printf(TEXT(
			"<!doctype html><html><body style=\"margin:0;height:100vh;display:grid;place-items:center;"
			"background:#090a0b;color:#f3e6d6;font:16px Georgia,serif;text-align:center\"><div>%s</div></body></html>"), *Body);
	}

	FString Escape(FString Text)
	{
		return Text.Replace(TEXT("&"), TEXT("&amp;")).Replace(TEXT("<"), TEXT("&lt;")).Replace(TEXT(">"), TEXT("&gt;"));
	}

	/** The page currently on screen, for the development script command below. */
	TWeakPtr<SWebBrowser> ActiveTable;

#if !UE_BUILD_SHIPPING
	// Development only: runs a JavaScript file in the table page, so validation can drive the real
	// menus and board; results come back through the page console, which is logged as LogCatanTable.
	FAutoConsoleCommand RunPageScript(
		TEXT("Catan.Table.RunScript"),
		TEXT("Runs a JavaScript file in the table page (development builds only)."),
		FConsoleCommandWithArgsDelegate::CreateLambda([](const TArray<FString>& Args)
		{
			FString Script;
			TSharedPtr<SWebBrowser> Browser = ActiveTable.Pin();
			if (Args.Num() != 1 || !Browser.IsValid() || !FFileHelper::LoadFileToString(Script, *Args[0]))
			{
				UE_LOG(LogCatanTable, Warning, TEXT("Catan.Table.RunScript needs one readable file and an open table."));
				return;
			}
			Browser->ExecuteJavascript(Script);
		}));
#endif
}

// ---------------------------------------------------------------- server process

bool UCatanTableServer::Start()
{
	if (Process.IsValid() && FPlatformProcess::IsProcRunning(Process))
	{
		return true;
	}
	FParse::Value(FCommandLine::Get(), TEXT("CatanPort="), Port);
	const FString Dir = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("WebGame"));
	const FString Node = Dir / TEXT("node.exe");
	const FString Script = Dir / TEXT("server.mjs");
	const FString Web = Dir / TEXT("web");
	if (!FPaths::FileExists(Node) || !FPaths::FileExists(Script) || !FPaths::FileExists(Web / TEXT("index.html")))
	{
		Error = FString::Printf(TEXT("The web game is not staged in %s. Run pnpm unreal:web from the repository."), *Dir);
		return false;
	}
	// The child inherits this environment; these names are the server's own settings.
	FPlatformMisc::SetEnvironmentVar(TEXT("PORT"), *FString::FromInt(Port));
	FPlatformMisc::SetEnvironmentVar(TEXT("WEB_DIST"), *Web);
	FPlatformMisc::SetEnvironmentVar(TEXT("CATAN_PARENT_PID"), *FString::FromInt(FPlatformProcess::GetCurrentProcessId()));
	FPlatformProcess::CreatePipe(ReadPipe, WritePipe);
	Process = FPlatformProcess::CreateProc(*Node, *FString::Printf(TEXT("\"%s\""), *Script), false, true, true,
		nullptr, 0, *Dir, WritePipe, nullptr, WritePipe);
	if (!Process.IsValid())
	{
		Error = FString::Printf(TEXT("Could not start %s."), *Node);
		return false;
	}
	UE_LOG(LogCatanTable, Log, TEXT("Started the Catan Night server on port %d from %s"), Port, *Dir);
	Ticker = FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateUObject(this, &UCatanTableServer::Pump), 0.25f);
	return true;
}

bool UCatanTableServer::HasExited() const
{
	return Process.IsValid() && !FPlatformProcess::IsProcRunning(const_cast<FProcHandle&>(Process));
}

bool UCatanTableServer::Pump(float)
{
	const FString Output = FPlatformProcess::ReadPipe(ReadPipe);
	if (!Output.IsEmpty())
	{
		UE_LOG(LogCatanTable, Log, TEXT("server: %s"), *Output.TrimEnd());
		RecentOutput = (RecentOutput + Output).Right(1500);
	}
	return true;
}

void UCatanTableServer::Deinitialize()
{
	FTSTicker::GetCoreTicker().RemoveTicker(Ticker);
	if (Process.IsValid())
	{
		// The server also watches CATAN_PARENT_PID, so it leaves even if this never runs (a crash).
		FPlatformProcess::TerminateProc(Process, true);
		FPlatformProcess::CloseProc(Process);
		UE_LOG(LogCatanTable, Log, TEXT("Stopped the Catan Night server"));
	}
	FPlatformProcess::ClosePipe(ReadPipe, WritePipe);
	ReadPipe = WritePipe = nullptr;
	Super::Deinitialize();
}

// ---------------------------------------------------------------- page bridge

void UCatanTableBridge::Quit()
{
	// Script calls arrive from the browser's message pump; quit on the game thread regardless.
	TWeakObjectPtr<APlayerController> Weak = Player;
	AsyncTask(ENamedThreads::GameThread, [Weak]
	{
		if (APlayerController* PC = Weak.Get())
		{
			UKismetSystemLibrary::QuitGame(PC, PC, EQuitPreference::Quit, false);
		}
	});
}

void UCatanTableBridge::LockMouse(bool bOn)
{
	TWeakObjectPtr<ACatanTableGameMode> Weak = Table;
	AsyncTask(ENamedThreads::GameThread, [Weak, bOn]
	{
		if (ACatanTableGameMode* Mode = Weak.Get())
		{
			Mode->SetMouseLook(bOn);
		}
	});
}

// ---------------------------------------------------------------- table game mode

ACatanTableGameMode::ACatanTableGameMode()
{
	DefaultPawnClass = nullptr;
	PrimaryActorTick.bCanEverTick = true;
}

void ACatanTableGameMode::SetMouseLook(bool bOn)
{
	bMouseLook = bOn && Browser.IsValid();
	bRecentre = bMouseLook;
}

void ACatanTableGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bMouseLook || !Browser.IsValid() || !FSlateApplication::IsInitialized())
	{
		return;
	}
	FSlateApplication& Slate = FSlateApplication::Get();
	if (!Slate.IsActive())
	{
		// Switching away lets go of the mouse, as a browser leaves pointer lock.
		SetMouseLook(false);
		Browser->ExecuteJavascript(TEXT("window.dispatchEvent(new Event('catanhost:unlock'))"));
		return;
	}
	// The page's (hidden, CSS cursor: none) pointer stays at the centre, so clicks still reach the
	// island: left strikes, right guards. Motion goes to the page in CSS pixels.
	const FGeometry& Geometry = Browser->GetCachedGeometry();
	// Whole pixels: the OS cursor is integral, and a fractional centre would read as constant drift.
	FVector2D Centre = FVector2D(Geometry.GetAbsolutePosition()) + FVector2D(Geometry.GetAbsoluteSize()) * 0.5;
	Centre = FVector2D(FMath::RoundToDouble(Centre.X), FMath::RoundToDouble(Centre.Y));
	const FVector2D Delta = (Slate.GetCursorPos() - Centre) / FMath::Max(Geometry.Scale, 0.01f);
	Slate.SetCursorPos(Centre);
	if (bRecentre)
	{
		bRecentre = false;
		return;
	}
	if (!Delta.IsNearlyZero(0.5 / FMath::Max(Geometry.Scale, 0.01f)))
	{
		Browser->ExecuteJavascript(FString::Printf(
			TEXT("window.dispatchEvent(new CustomEvent('catanhost:look',{detail:{dx:%.2f,dy:%.2f}}))"), Delta.X, Delta.Y));
	}
}

void ACatanTableGameMode::BeginPlay()
{
	Super::BeginPlay();
	UGameViewportClient* Viewport = GetWorld()->GetGameViewport();
	APlayerController* PC = GetWorld()->GetFirstPlayerController();
	if (!Viewport || !PC)
	{
		return; // a dedicated server or a commandlet has nothing to show
	}
	// SWebBrowser only draws if something has already started Unreal's browser module (CEF).
	if (!IWebBrowserModule::Get().IsWebModuleAvailable() || !IWebBrowserModule::Get().GetSingleton())
	{
		UE_LOG(LogCatanTable, Error, TEXT("Unreal's web browser (CEF) is unavailable; the table cannot be shown."));
		return;
	}
	Bridge = NewObject<UCatanTableBridge>(this);
	Bridge->Player = PC;
	Bridge->Table = this;
	SAssignNew(Browser, SWebBrowser)
		.InitialURL(TEXT("http://localhost/starting"))
		.ContentsToLoad(Page(TEXT("Starting Catan Night&hellip;")))
		.ShowControls(false)
		.ShowAddressBar(false)
		.ShowInitialThrobber(false)
		.SupportsTransparency(false)
		.BackgroundColor(Abyss)
		.BrowserFrameRate(60)
		.OnConsoleMessage_Lambda([](const FString& Message, const FString& Source, int32 Line, EWebBrowserConsoleLogSeverity Severity)
		{
			// The page's own console, so script errors in the app are visible in Unreal's log.
			if (Severity >= EWebBrowserConsoleLogSeverity::Error)
			{
				UE_LOG(LogCatanTable, Warning, TEXT("page error: %s (%s:%d)"), *Message, *Source, Line);
			}
			else
			{
				UE_LOG(LogCatanTable, Log, TEXT("page: %s"), *Message);
			}
		})
		.OnBeforePopup_Lambda([](FString Url, FString)
		{
			// Links that want a new window (credits, rule references) open in the system browser.
			FPlatformProcess::LaunchURL(*Url, nullptr, nullptr);
			return true;
		});
	Browser->BindUObject(TEXT("catanhost"), Bridge, true);
	ActiveTable = Browser;
	Viewport->AddViewportWidgetContent(Browser.ToSharedRef(), 10);
	PC->SetShowMouseCursor(true);
	PC->SetInputMode(FInputModeUIOnly().SetWidgetToFocus(Browser).SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock));

	UCatanTableServer* Server = GetGameInstance()->GetSubsystem<UCatanTableServer>();
	if (!Server->Start())
	{
		Fail(Server->Error);
		return;
	}
	StartedAt = FPlatformTime::Seconds();
	GetWorldTimerManager().SetTimer(ProbeTimer, this, &ACatanTableGameMode::Probe, 0.25f, true, 0.1f);
}

void ACatanTableGameMode::Probe()
{
	if (bProbing || bDone)
	{
		return;
	}
	UCatanTableServer* Server = GetGameInstance()->GetSubsystem<UCatanTableServer>();
	bProbing = true;
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(Server->Url() + TEXT("health"));
	Request->SetVerb(TEXT("GET"));
	Request->SetTimeout(1.5f);
	TWeakObjectPtr<ACatanTableGameMode> Weak(this);
	Request->OnProcessRequestComplete().BindLambda([Weak](FHttpRequestPtr, FHttpResponsePtr Response, bool bOk)
	{
		ACatanTableGameMode* Self = Weak.Get();
		if (!Self || Self->bDone)
		{
			return;
		}
		Self->bProbing = false;
		UCatanTableServer* Server = Self->GetGameInstance()->GetSubsystem<UCatanTableServer>();
		// Any Catan Night server on the port will do, including one another copy of the app started.
		if (bOk && Response.IsValid() && Response->GetResponseCode() == 200 && Response->GetContentAsString().Contains(TEXT("\"catan-night\"")))
		{
			Self->bDone = true;
			Self->GetWorldTimerManager().ClearTimer(Self->ProbeTimer);
			UE_LOG(LogCatanTable, Log, TEXT("Opening %s"), *Server->Url());
			Self->Browser->LoadURL(Server->Url());
		}
		else if (Server->HasExited())
		{
			Self->Fail(FString::Printf(TEXT("The game server stopped. Is another program using port %d?"), Server->Port));
		}
		else if (FPlatformTime::Seconds() - Self->StartedAt > StartTimeout)
		{
			Self->Fail(TEXT("The game server did not answer in time."));
		}
	});
	Request->ProcessRequest();
}

void ACatanTableGameMode::Fail(const FString& Reason)
{
	bDone = true;
	GetWorldTimerManager().ClearTimer(ProbeTimer);
	UCatanTableServer* Server = GetGameInstance()->GetSubsystem<UCatanTableServer>();
	UE_LOG(LogCatanTable, Error, TEXT("%s %s"), *Reason, *Server->RecentOutput);
	if (Browser.IsValid())
	{
		Browser->LoadString(Page(FString::Printf(TEXT("<h2 style=\"color:#f2ac52\">Catan Night could not start</h2><p>%s</p><pre style=\"color:#9ea4a7;white-space:pre-wrap;max-width:80vw\">%s</pre>"),
			*Escape(Reason), *Escape(Server->RecentOutput))), TEXT("http://localhost/error"));
	}
}

void ACatanTableGameMode::EndPlay(const EEndPlayReason::Type Reason)
{
	bDone = true;
	bMouseLook = false;
	GetWorldTimerManager().ClearTimer(ProbeTimer);
	if (Browser.IsValid())
	{
		if (UGameViewportClient* Viewport = GetWorld()->GetGameViewport())
		{
			Viewport->RemoveViewportWidgetContent(Browser.ToSharedRef());
		}
		Browser.Reset();
	}
	Super::EndPlay(Reason);
}
