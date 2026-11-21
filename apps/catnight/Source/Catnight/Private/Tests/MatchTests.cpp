// Full games through FCatnightMatch, the same path the table uses: bots play every seat to the end.
#include "CatnightMatch.h"
#include "CatnightRules/Rules.h"
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

#endif
