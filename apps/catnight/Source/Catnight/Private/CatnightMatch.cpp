#include "CatnightMatch.h"

#include "CatnightRules/Bots.h"
#include "CatnightRules/Json.h"
#include "CatnightRules/Rules.h"
#include "CatnightRules/Serialize.h"
#include "HAL/FileManager.h"
#include "Lexicon.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

using namespace catnight;

namespace
{
	const PlayerColor Colors[] = {PlayerColor::Crimson, PlayerColor::Frost, PlayerColor::Bone, PlayerColor::Violet};
	const Sigil Sigils[] = {Sigil::Skull, Sigil::Moon, Sigil::Eye, Sigil::Thorn};

	/** Port of `isUndoable` (packages/engine/src/replay.ts). */
	bool IsUndoableStep(const GameState& Prev, const Action& A, const GameState& Next, const std::vector<GameEvent>& Events)
	{
		switch (A.type)
		{
		case ActionType::PlaceSetupOutpost:
		case ActionType::PlaceSetupCauseway:
		case ActionType::BuildCauseway:
		case ActionType::BuildOutpost:
		case ActionType::BuildCitadel:
		case ActionType::BankTrade:
			break;
		default:
			return false;
		}
		if (Prev.rng != Next.rng) return false;
		static const char* Revealing[] = {"DiceRolled", "Stolen", "OmenBought", "OmenPlayed", "TradeCompleted", "GameWon"};
		for (const GameEvent& E : Events)
		{
			const Json* Type = E.Get("type");
			if (!Type || !Type->IsStr()) continue;
			for (const char* R : Revealing)
				if (Type->AsStr() == R) return false;
		}
		if (Next.phase.kind == PhaseKind::Ended || Next.handoff) return false;
		return ActiveActor(Next) == A.player;
	}

	FCatnightMatchSetup SetupFromConfig(const GameConfig& C)
	{
		FCatnightMatchSetup Out;
		Out.Seed = UTF8_TO_TCHAR(C.seed.c_str());
		Out.TargetVp = C.targetVp;
		Out.Layout = C.layout;
		Out.Players = static_cast<int32>(C.seats.size());
		for (const SeatConfig& Seat : C.seats)
		{
			FCatnightSeat S;
			S.Name = UTF8_TO_TCHAR(Seat.name.c_str());
			S.bHuman = Seat.kind == SeatKind::Human;
			S.Level = Seat.bot.value_or(BotLevel::Warlord);
			Out.Seats.Add(S);
		}
		return Out;
	}
}

TArray<FCatnightSeat> FCatnightMatchSetup::ResolvedSeats() const
{
	if (Seats.Num()) return Seats;
	static const TCHAR* Names[] = {TEXT("You"), TEXT("Ash"), TEXT("Bryn"), TEXT("Cole")};
	TArray<FCatnightSeat> Out;
	const int32 N = FMath::Clamp(Players, kMinPlayers, kMaxPlayers);
	for (int32 I = 0; I < N; I++)
	{
		FCatnightSeat Seat;
		Seat.Name = Names[I];
		Seat.bHuman = I == 0;
		Seat.Level = Level;
		Out.Add(Seat);
	}
	return Out;
}

GameConfig FCatnightMatchSetup::ToConfig() const
{
	GameConfig Config;
	Config.seed = TCHAR_TO_UTF8(*Seed);
	Config.targetVp = TargetVp;
	Config.layout = Layout;
	Config.firstPlayer = kRollOff;
	// As the web game's local games: arms on (the chest waits in the walk), no fights.
	Config.arms = true;
	Config.pvp = false;
	const TArray<FCatnightSeat> List = ResolvedSeats();
	for (int32 I = 0; I < List.Num(); I++)
	{
		SeatConfig Seat;
		Seat.name = TCHAR_TO_UTF8(*List[I].Name.TrimStartAndEnd());
		Seat.color = Colors[I % 4];
		Seat.sigil = Sigils[I % 4];
		Seat.kind = List[I].bHuman ? SeatKind::Human : SeatKind::Bot;
		if (!List[I].bHuman) Seat.bot = List[I].Level;
		Config.seats.push_back(Seat);
	}
	return Config;
}

FString FCatnightMatch::Start(const FCatnightMatchSetup& Setup)
{
	const GameConfig Config = Setup.ToConfig();
	if (const std::optional<std::string> Bad = ValidateConfig(Config)) return UTF8_TO_TCHAR(Bad->c_str());
	Current = Setup;
	FString Error;
	Rebuild(Config, {}, Error);
	bAutoplay = Setup.bAutoplay;
	Log.Insert(FString::Printf(TEXT("New game, seed %s. First to %d points wins."), *Setup.Seed, Setup.TargetVp), 0);
	Autosave();
	OnChanged.Broadcast();
	return FString();
}

bool FCatnightMatch::Rebuild(const GameConfig& Config, const TArray<Action>& Actions, FString& Error)
{
	S = CreateGame(Config);
	Record.Reset();
	Undoable.Reset();
	Log.Reset();
	LastError.Reset();
	bStarted = true;
	Waited = 0.f;
	for (const Action& A : Actions)
	{
		if (!ApplyQuiet(A, Error)) return false;
	}
	OnRebuilt.Broadcast();
	return true;
}

bool FCatnightMatch::ApplyQuiet(const Action& A, FString& Error, std::vector<GameEvent>* Events)
{
	ActionOutcome Out = ApplyAction(S, A);
	if (!Out.ok)
	{
		Error = UTF8_TO_TCHAR(Out.error.message.c_str());
		return false;
	}
	Undoable.Add(IsUndoableStep(S, A, Out.state, Out.events));
	S = MoveTemp(Out.state);
	Record.Add(A);
	const int32 Who = Viewer();
	for (const GameEvent& E : Out.events)
	{
		const FString Line = CatnightText::EventLine(S, E, Who);
		if (!Line.IsEmpty()) Log.Add(Line);
	}
	if (Log.Num() > 400) Log.RemoveAt(0, Log.Num() - 400);
	if (Events) *Events = MoveTemp(Out.events);
	return true;
}

int32 FCatnightMatch::Actor() const
{
	return S.handoff ? *S.handoff : ActiveActor(S);
}

bool FCatnightMatch::IsHumanToAct() const
{
	return bStarted && !bAutoplay && !IsEnded() && S.players[Actor()].kind == SeatKind::Human;
}

int32 FCatnightMatch::Viewer() const
{
	if (!bStarted) return 0;
	if (S.viewer) return *S.viewer;
	for (const PlayerState& P : S.players)
		if (P.kind == SeatKind::Human) return P.id;
	return 0;
}

int32 FCatnightMatch::HumanCount() const
{
	int32 N = 0;
	for (const PlayerState& P : S.players) N += P.kind == SeatKind::Human ? 1 : 0;
	return N;
}

FString FCatnightMatch::Apply(const Action& A)
{
	if (!bStarted) return TEXT("No game");
	FString Error;
	std::vector<GameEvent> Events;
	if (!ApplyQuiet(A, Error, &Events))
	{
		LastError = Error;
		OnChanged.Broadcast();
		return LastError;
	}
	LastError.Reset();
	Waited = 0.f;
	if (IsEnded()) DeleteSave();
	else Autosave();
	OnActionApplied.Broadcast(A, Events);
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

bool FCatnightMatch::CanUndo() const
{
	if (!bStarted || bAutoplay || IsEnded() || !Record.Num() || !Undoable.Last()) return false;
	const Action& Last = Record.Last();
	return S.players[Last.player].kind == SeatKind::Human && Actor() == Last.player;
}

bool FCatnightMatch::Undo()
{
	if (!CanUndo()) return false;
	TArray<Action> Actions = Record;
	Actions.Pop();
	FString Error;
	TArray<FString> Intro;
	if (Log.Num()) Intro.Add(Log[0]);
	const GameConfig Config = S.config;
	const bool bOk = Rebuild(Config, Actions, Error);
	ensureMsgf(bOk, TEXT("Undo replay failed: %s"), *Error);
	Log.Insert(Intro, 0);
	Log.Add(TEXT("Undone."));
	Autosave();
	OnChanged.Broadcast();
	return bOk;
}

FString FCatnightMatch::RecordJson() const
{
	Json Root = Json::Object();
	Root.Set("format", "hexfall-record");
	Root.Set("version", 1);
	Root.Set("config", ConfigJson(S.config));
	Json Actions = Json::Array();
	for (const Action& A : Record) Actions.Push(ActionToJson(A));
	Root.Set("actions", std::move(Actions));
	return UTF8_TO_TCHAR(Root.Canonical().c_str());
}

FString FCatnightMatch::LoadRecord(const FString& Text)
{
	std::string ParseError;
	const Json Root = Json::Parse(TCHAR_TO_UTF8(*Text), &ParseError);
	if (!Root.IsObj()) return FString::Printf(TEXT("Not a game record (%s)"), UTF8_TO_TCHAR(ParseError.c_str()));
	const Json* Format = Root.Get("format");
	const Json* Version = Root.Get("version");
	const Json* ConfigJ = Root.Get("config");
	const Json* ActionsJ = Root.Get("actions");
	if (!Format || !Format->IsStr() || Format->AsStr() != "hexfall-record" || !Version || !Version->IsInt() || Version->AsInt() != 1 ||
		!ConfigJ || !ActionsJ || !ActionsJ->IsArr())
	{
		return TEXT("Not a game record");
	}
	GameConfig Config;
	std::string Error;
	if (!ConfigFromJson(*ConfigJ, Config, &Error)) return FString::Printf(TEXT("Bad config: %s"), UTF8_TO_TCHAR(Error.c_str()));
	if (const std::optional<std::string> Bad = ValidateConfig(Config)) return UTF8_TO_TCHAR(Bad->c_str());
	TArray<Action> Actions;
	for (const Json& J : ActionsJ->Items())
	{
		Action A;
		if (!ActionFromJson(J, A, &Error)) return FString::Printf(TEXT("Bad action %d: %s"), Actions.Num(), UTF8_TO_TCHAR(Error.c_str()));
		Actions.Add(A);
	}
	FString ReplayError;
	if (!Rebuild(Config, Actions, ReplayError))
	{
		bStarted = false;
		return FString::Printf(TEXT("The record does not replay: %s"), *ReplayError);
	}
	Current = SetupFromConfig(Config);
	bAutoplay = false;
	Log.Insert(FString::Printf(TEXT("Game continued, seed %s. First to %d points wins."), *Current.Seed, Config.targetVp), 0);
	OnChanged.Broadcast();
	return FString();
}

FString FCatnightMatch::DefaultSavePath()
{
	return FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("SaveGames"), TEXT("Catnight-continue.json"));
}

bool FCatnightMatch::HasSave() const
{
	return !SavePath.IsEmpty() && IFileManager::Get().FileExists(*SavePath);
}

FString FCatnightMatch::Continue()
{
	FString Text;
	if (SavePath.IsEmpty() || !FFileHelper::LoadFileToString(Text, *SavePath)) return TEXT("No saved game");
	const FString Error = LoadRecord(Text);
	if (!Error.IsEmpty()) UE_LOG(LogTemp, Warning, TEXT("Catnight: cannot continue %s: %s"), *SavePath, *Error);
	return Error;
}

void FCatnightMatch::DeleteSave() const
{
	if (!SavePath.IsEmpty()) IFileManager::Get().Delete(*SavePath, false, true, true);
}

void FCatnightMatch::Autosave() const
{
	if (SavePath.IsEmpty() || bAutoplay || !bStarted) return;
	if (!FFileHelper::SaveStringToFile(RecordJson(), *SavePath, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM))
	{
		UE_LOG(LogTemp, Warning, TEXT("Catnight: could not save to %s"), *SavePath);
	}
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
