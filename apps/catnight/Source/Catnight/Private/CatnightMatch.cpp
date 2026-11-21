#include "CatnightMatch.h"

#include "CatnightRules/Bots.h"
#include "CatnightRules/Rules.h"
#include "Lexicon.h"

using namespace catnight;

void FCatnightMatch::Start(const FCatnightMatchSetup& Setup)
{
	static const PlayerColor Colors[] = {PlayerColor::Crimson, PlayerColor::Frost, PlayerColor::Bone, PlayerColor::Violet};
	static const Sigil Sigils[] = {Sigil::Skull, Sigil::Moon, Sigil::Eye, Sigil::Thorn};
	static const char* Names[] = {"You", "Ash", "Bryn", "Cole"};
	GameConfig Config;
	Config.seed = TCHAR_TO_UTF8(*Setup.Seed);
	Config.targetVp = Setup.TargetVp;
	Config.layout = LayoutMode::Balanced;
	Config.firstPlayer = kRollOff;
	const int32 N = FMath::Clamp(Setup.Players, kMinPlayers, kMaxPlayers);
	for (int32 I = 0; I < N; I++)
	{
		SeatConfig Seat;
		Seat.name = Names[I];
		Seat.color = Colors[I];
		Seat.sigil = Sigils[I];
		Seat.kind = I == 0 ? SeatKind::Human : SeatKind::Bot;
		if (I > 0) Seat.bot = Setup.Level;
		Config.seats.push_back(Seat);
	}
	check(!ValidateConfig(Config).has_value());
	S = CreateGame(Config);
	Record.Reset();
	Log.Reset();
	LastError.Reset();
	bAutoplay = Setup.bAutoplay;
	bStarted = true;
	Waited = 0.f;
	Log.Add(FString::Printf(TEXT("New game, seed %s. First to %d points wins."), *Setup.Seed, Setup.TargetVp));
	OnChanged.Broadcast();
}

int32 FCatnightMatch::Actor() const
{
	return S.handoff ? *S.handoff : ActiveActor(S);
}

bool FCatnightMatch::IsHumanToAct() const
{
	return bStarted && !bAutoplay && !IsEnded() && S.players[Actor()].kind == SeatKind::Human;
}

FString FCatnightMatch::Apply(const Action& A)
{
	if (!bStarted) return TEXT("No game");
	ActionOutcome Out = ApplyAction(S, A);
	if (!Out.ok)
	{
		LastError = UTF8_TO_TCHAR(Out.error.message.c_str());
		OnChanged.Broadcast();
		return LastError;
	}
	S = MoveTemp(Out.state);
	Record.Add(A);
	LastError.Reset();
	for (const GameEvent& E : Out.events)
	{
		const FString Line = CatnightText::EventLine(S, E, HumanSeat());
		if (!Line.IsEmpty()) Log.Add(Line);
	}
	if (Log.Num() > 400) Log.RemoveAt(0, Log.Num() - 400);
	Waited = 0.f;
	OnChanged.Broadcast();
	return FString();
}

bool FCatnightMatch::StepBot()
{
	if (!bStarted || IsEnded() || IsHumanToAct()) return false;
	const std::optional<Action> A = DecideAction(S);
	if (!A) return false;
	const FString Error = Apply(*A);
	ensureMsgf(Error.IsEmpty(), TEXT("A bot chose an illegal move: %s"), *Error);
	return Error.IsEmpty();
}

bool FCatnightMatch::Tick(float DeltaSeconds)
{
	if (!bStarted || IsEnded() || IsHumanToAct()) return false;
	Waited += DeltaSeconds;
	if (Waited < BotDelay) return false;
	return StepBot();
}

void UCatnightMatchSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	MatchPtr = MakeShared<FCatnightMatch>();
	TWeakPtr<FCatnightMatch> Weak = MatchPtr;
	TickHandle = FTSTicker::GetCoreTicker().AddTicker(TEXT("CatnightMatch"), 0.f, [Weak](float Dt)
	{
		if (TSharedPtr<FCatnightMatch> M = Weak.Pin()) M->Tick(Dt);
		return true;
	});
}

void UCatnightMatchSubsystem::Deinitialize()
{
	FTSTicker::GetCoreTicker().RemoveTicker(TickHandle);
	MatchPtr.Reset();
	Super::Deinitialize();
}
