// A local match: the rules state, the action record, the log and the bots' clock.
// Plain C++ (no UObject) so tests can drive it; UCatnightMatchSubsystem owns and ticks one.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Containers/Ticker.h"
#include "CatnightRules/State.h"
#include "CatnightMatch.generated.h"

/** One seat at the table: a person on this device, or a bot. */
struct FCatnightSeat
{
	FString Name;
	bool bHuman = false;
	catnight::BotLevel Level = catnight::BotLevel::Warlord;
};

struct FCatnightMatchSetup
{
	FString Seed = TEXT("catnight");
	/** Empty: you against bots (Players seats, bots at Level). */
	TArray<FCatnightSeat> Seats;
	int32 Players = 4;
	catnight::BotLevel Level = catnight::BotLevel::Warlord;
	int32 TargetVp = 10;
	catnight::LayoutMode Layout = catnight::LayoutMode::Balanced;
	/** Bots also play the human seats (tests, screenshots). */
	bool bAutoplay = false;

	/** The seats this setup starts with (fills the default ones when Seats is empty). */
	TArray<FCatnightSeat> ResolvedSeats() const;
	catnight::GameConfig ToConfig() const;
};

/** Live accepted actions only: replay/Continue never plays historical presentation effects. */
DECLARE_MULTICAST_DELEGATE_TwoParams(FCatnightActionApplied, const catnight::Action&, const std::vector<catnight::GameEvent>&);

class CATNIGHT_API FCatnightMatch
{
public:
	/** Starts a new game. Returns the config problem, or an empty string. */
	FString Start(const FCatnightMatchSetup& Setup);
	bool HasGame() const { return bStarted; }
	const catnight::GameState& State() const { return S; }
	const FCatnightMatchSetup& Setup() const { return Current; }
	bool IsAutoplay() const { return bAutoplay; }
	bool IsEnded() const { return bStarted && S.phase.kind == catnight::PhaseKind::Ended; }
	/** The seat that must act now (hand-offs first). */
	int32 Actor() const;
	bool IsHumanToAct() const;
	/** Whose hand the screen shows: the engine's viewer in hot-seat, else the one human. */
	int32 Viewer() const;
	/** The device must be passed to Actor() before anything else is shown (hot-seat). */
	bool NeedsHandoff() const { return bStarted && !bAutoplay && S.handoff.has_value(); }
	int32 HumanCount() const;

	/** Applies an action for anyone; returns the error message or an empty string. */
	FString Apply(const catnight::Action& A);
	/** Lets a bot act once its delay has passed. Returns true if something changed. */
	bool Tick(float DeltaSeconds);
	/** One bot move now, whatever the delay (tests). */
	bool StepBot();

	/** Takes back the last placement, build or bank trade (web rules: no randomness, same seat). */
	bool CanUndo() const;
	bool Undo();

	/** The game as a `hexfall-record` (config + actions), the web game's format. */
	FString RecordJson() const;
	/** Replays a record. Returns the problem, or an empty string. */
	FString LoadRecord(const FString& Json);

	/** Where the running game is saved after every action; empty means no autosave. */
	FString SavePath;
	static FString DefaultSavePath();
	bool HasSave() const;
	/** Loads SavePath. Returns the problem, or an empty string. */
	FString Continue();
	void DeleteSave() const;

	float BotDelay = 0.7f;
	TArray<FString> Log;
	FString LastError;
	FSimpleMulticastDelegate OnChanged;
	FCatnightActionApplied OnActionApplied;
	FSimpleMulticastDelegate OnRebuilt;
	int32 ActionCount() const { return Record.Num(); }

private:
	bool Rebuild(const catnight::GameConfig& Config, const TArray<catnight::Action>& Actions, FString& Error);
	bool ApplyQuiet(const catnight::Action& A, FString& Error, std::vector<catnight::GameEvent>* Events = nullptr);
	void Autosave() const;

	catnight::GameState S;
	FCatnightMatchSetup Current;
	TArray<catnight::Action> Record;
	TArray<bool> Undoable;
	bool bStarted = false;
	bool bAutoplay = false;
	float Waited = 0.f;
};

/** Holds the running match for the game instance and drives its bots every frame. */
UCLASS()
class CATNIGHT_API UCatnightMatchSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	TSharedRef<FCatnightMatch> Match() const { return MatchPtr.ToSharedRef(); }

private:
	TSharedPtr<FCatnightMatch> MatchPtr;
	FTSTicker::FDelegateHandle TickHandle;
};
