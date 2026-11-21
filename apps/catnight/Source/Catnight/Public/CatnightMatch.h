// A local match: the rules state, the action record, the log and the bots' clock.
// Plain C++ (no UObject) so tests can drive it; UCatnightMatchSubsystem owns and ticks one.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Containers/Ticker.h"
#include "CatnightRules/State.h"
#include "CatnightMatch.generated.h"

struct FCatnightMatchSetup
{
	FString Seed = TEXT("catnight");
	int32 Players = 4;
	catnight::BotLevel Level = catnight::BotLevel::Warlord;
	int32 TargetVp = 10;
	/** Bots also play the human seat (tests, screenshots). */
	bool bAutoplay = false;
};

class CATNIGHT_API FCatnightMatch
{
public:
	void Start(const FCatnightMatchSetup& Setup);
	bool HasGame() const { return bStarted; }
	const catnight::GameState& State() const { return S; }
	int32 HumanSeat() const { return 0; }
	bool IsAutoplay() const { return bAutoplay; }
	bool IsEnded() const { return bStarted && S.phase.kind == catnight::PhaseKind::Ended; }
	/** The seat that must act now (hand-offs first). */
	int32 Actor() const;
	bool IsHumanToAct() const;

	/** Applies an action for anyone; returns the error message or an empty string. */
	FString Apply(const catnight::Action& A);
	/** Lets a bot act once its delay has passed. Returns true if something changed. */
	bool Tick(float DeltaSeconds);
	/** One bot move now, whatever the delay (tests). */
	bool StepBot();

	float BotDelay = 0.7f;
	TArray<FString> Log;
	FString LastError;
	FSimpleMulticastDelegate OnChanged;
	int32 ActionCount() const { return Record.Num(); }

private:
	catnight::GameState S;
	TArray<catnight::Action> Record;
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
