// Full games through FCatnightMatch, the same path the table uses: bots play every seat to the end.
#include "CatnightMatch.h"
#include "CatnightRules/Board.h"
#include "CatnightRules/Bots.h"
#include "CatnightRules/Json.h"
#include "CatnightRules/Rules.h"
#include "CatnightRules/Serialize.h"
#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FCatnightFullGameTest, "Catnight.Match.FullGames",
                                 EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext |
                                     EAutomationTestFlags::ProductFilter)

bool FCatnightFullGameTest::RunTest(const FString& Parameters)
{
	const catnight::BotLevel Levels[] = {catnight::BotLevel::Wanderer, catnight::BotLevel::Warlord, catnight::BotLevel::Archdemon};
	int32 Finished = 0;
	for (int32 G = 0; G < 12; G++)
	{
		FCatnightMatch Match;
		FCatnightMatchSetup Setup;
		Setup.Seed = FString::Printf(TEXT("match-%d"), G);
		Setup.Players = G % 4 == 0 ? 3 : 4;
		Setup.Level = Levels[G % 3];
		Setup.bAutoplay = true;
		Match.Start(Setup);
		int32 Moves = 0;
		while (!Match.IsEnded() && Moves < 6000)
		{
			if (!Match.StepBot())
			{
				AddError(FString::Printf(TEXT("%s: no bot move at action %d (%s)"), *Setup.Seed, Match.ActionCount(), *Match.LastError));
				break;
			}
			Moves++;
		}
		if (!Match.IsEnded())
		{
			AddError(FString::Printf(TEXT("%s did not finish"), *Setup.Seed));
			continue;
		}
		const catnight::GameState& S = Match.State();
		TestTrue(TEXT("winner reached the target"), catnight::VictoryPoints(S, *S.winner, true) >= S.config.targetVp);
		TestTrue(TEXT("the log ends with the win"), Match.Log.Num() > 0 && Match.Log.Last().Contains(TEXT("wins")));
		Finished++;
	}
	AddInfo(FString::Printf(TEXT("CATNIGHT MATCH %d of 12 games played to a win"), Finished));
	return Finished == 12;
}

namespace
{
	FString StateHash(const FCatnightMatch& M);
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FCatnightHotseatSaveTest, "Catnight.Match.HotseatSaveUndo",
                                 EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext |
                                     EAutomationTestFlags::ProductFilter)

// Two people and two bots on one device: hand-offs happen and move the viewer; the game saved
// halfway as a hexfall-record continues to the same state; undo takes back a build exactly.
bool FCatnightHotseatSaveTest::RunTest(const FString& Parameters)
{
	FCatnightMatchSetup Setup;
	Setup.Seed = TEXT("hotseat-1");
	Setup.Seats = {{TEXT("Ada"), true}, {TEXT("Ben"), true}, {TEXT("Cole"), false, catnight::BotLevel::Warlord}, {TEXT("Dee"), false, catnight::BotLevel::Archdemon}};
	Setup.bAutoplay = true;  // bots answer for the people too (they acknowledge hand-offs)
	FCatnightMatch Match;
	if (!TestEqual(TEXT("start"), Match.Start(Setup), FString())) return false;
	TestEqual(TEXT("two people"), Match.HumanCount(), 2);

	int32 Handoffs = 0;
	TSet<int32> Viewers;
	FString HalfRecord, HalfHash;
	int32 Moves = 0;
	while (!Match.IsEnded() && Moves < 6000)
	{
		if (Match.State().handoff) Handoffs++;
		Viewers.Add(Match.Viewer());
		if (Moves == 300)
		{
			HalfRecord = Match.RecordJson();
			HalfHash = StateHash(Match);
		}
		if (!Match.StepBot()) break;
		Moves++;
	}
	TestTrue(TEXT("the game ended"), Match.IsEnded());
	TestTrue(TEXT("hand-offs happened"), Handoffs > 10);
	TestTrue(TEXT("the viewer moved between both people"), Viewers.Contains(0) && Viewers.Contains(1));
	AddInfo(FString::Printf(TEXT("CATNIGHT HOTSEAT %d actions, %d hand-offs"), Match.ActionCount(), Handoffs));

	// Continue from the halfway record.
	FCatnightMatch Loaded;
	TestEqual(TEXT("the record loads"), Loaded.LoadRecord(HalfRecord), FString());
	TestEqual(TEXT("same state after loading"), StateHash(Loaded), HalfHash);
	TestEqual(TEXT("same seats after loading"), Loaded.Setup().ResolvedSeats().Num(), 4);
	TestTrue(TEXT("hot-seat survives loading"), Loaded.Setup().ResolvedSeats()[1].bHuman);
	TestFalse(TEXT("garbage is refused"), Loaded.LoadRecord(TEXT("{\"format\":\"nope\"}")).IsEmpty());

	// Undo: play a single-person game until the person can build a road, build it, undo it.
	FCatnightMatchSetup Solo;
	Solo.Seed = TEXT("undo-1");
	FCatnightMatch Game;
	Game.Start(Solo);
	bool bChecked = false;
	for (int32 Step = 0; Step < 4000 && !Game.IsEnded() && !bChecked; Step++)
	{
		if (!Game.IsHumanToAct())
		{
			Game.StepBot();
			continue;
		}
		const catnight::GameState& S = Game.State();
		if (S.phase.kind == catnight::PhaseKind::Main && catnight::CanAfford(S.players[0].hand, catnight::CostKey::Causeway) &&
			S.players[0].supply.causeways > 0 && !catnight::LegalCausewaySpots(S, 0).empty())
		{
			const FString Before = StateHash(Game);
			const int32 Actions = Game.ActionCount();
			catnight::Action A = catnight::Action::Make(catnight::ActionType::BuildCauseway, 0);
			A.edge = catnight::GetTopology().edgeIds[catnight::LegalCausewaySpots(S, 0).front()];
			TestEqual(TEXT("build a road"), Game.Apply(A), FString());
			TestTrue(TEXT("a road can be undone"), Game.CanUndo());
			TestTrue(TEXT("undo"), Game.Undo());
			TestEqual(TEXT("undo restores the state"), StateHash(Game), Before);
			TestEqual(TEXT("undo drops the action"), Game.ActionCount(), Actions);
			bChecked = true;
			break;
		}
		// Otherwise act like a bot would for the person.
		const std::optional<catnight::Action> Next = catnight::DecideAction(S);
		if (!Next) break;
		if (Next->type == catnight::ActionType::RollDice)
		{
			Game.Apply(*Next);
			TestFalse(TEXT("a roll cannot be undone"), Game.CanUndo());
			continue;
		}
		Game.Apply(*Next);
	}
	TestTrue(TEXT("an undo was tried"), bChecked);
	return !HasAnyErrors();
}

namespace
{
	FString StateHash(const FCatnightMatch& M)
	{
		return UTF8_TO_TCHAR(catnight::GoldenHash(catnight::StateToJson(M.State()).Canonical()).c_str());
	}
}

#endif
