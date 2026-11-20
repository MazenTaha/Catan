#pragma once

#include "CoreMinimal.h"
#include "Containers/Ticker.h"
#include "GameFramework/GameModeBase.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "CatanTable.generated.h"

class SWebBrowser;
class APlayerController;
class ACatanTableGameMode;

DECLARE_LOG_CATEGORY_EXTERN(LogCatanTable, Log, All);

/**
 * Runs the complete web game's server (<project>/WebGame, staged by `pnpm unreal:web`) as a hidden
 * child process for the lifetime of the game instance. The same process serves the app and the
 * online rooms, so hosting from the Unreal app works exactly as `pnpm play` does.
 */
UCLASS()
class CATANNIGHT_API UCatanTableServer : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Deinitialize() override;

	/** Starts the server if this instance has not already. False, with Error set, if it cannot. */
	bool Start();
	/** True once the child has exited (another program may hold the port, or it crashed). */
	bool HasExited() const;
	FString Url() const { return FString::Printf(TEXT("http://localhost:%d/"), Port); }

	/** A stable port keeps one browser origin, so local saves and settings persist between runs. */
	int32 Port = 8797;
	FString Error;
	/** The tail of the server's console output, shown if it fails to start. */
	FString RecentOutput;

private:
	bool Pump(float DeltaTime);

	FProcHandle Process;
	void* ReadPipe = nullptr;
	void* WritePipe = nullptr;
	FTSTicker::FDelegateHandle Ticker;
};

/** The object the page sees as `window.ue.catanhost`. */
UCLASS()
class CATANNIGHT_API UCatanTableBridge : public UObject
{
	GENERATED_BODY()

public:
	/** Title menu Quit: closes the app (ends Play in the editor). */
	UFUNCTION(BlueprintCallable, Category = "Catan")
	void Quit();

	/** The 3D walk's Dive in: CEF has no pointer lock, so the table captures the mouse instead. */
	UFUNCTION(BlueprintCallable, Category = "Catan")
	void LockMouse(bool bOn);

	TWeakObjectPtr<APlayerController> Player;
	TWeakObjectPtr<ACatanTableGameMode> Table;
};

/**
 * The table map's game mode: no pawn, the whole viewport is the web game (menu, 2D board, bots,
 * hot-seat, online, 3D walk) in Unreal's built-in Chromium browser, served by UCatanTableServer.
 */
UCLASS()
class CATANNIGHT_API ACatanTableGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	ACatanTableGameMode();
	virtual void Tick(float DeltaSeconds) override;

	/** Hides and recentres the cursor every frame and streams the motion to the page as look events. */
	void SetMouseLook(bool bOn);

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	void Probe();
	void Fail(const FString& Reason);

	TSharedPtr<SWebBrowser> Browser;
	UPROPERTY()
	TObjectPtr<UCatanTableBridge> Bridge;
	FTimerHandle ProbeTimer;
	double StartedAt = 0;
	bool bProbing = false;
	bool bDone = false;
	bool bMouseLook = false;
	bool bRecentre = false;
};
