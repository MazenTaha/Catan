#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"
#include "CatnightRules/Rules.h"
#include "CatnightRules/Serialize.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FCatnightMeleeRulesTest, "Catnight.Hero.MeleeOnlyRules",
  EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext | EAutomationTestFlags::EngineFilter)
bool FCatnightMeleeRulesTest::RunTest(const FString& Parameters)
{
  using namespace catnight;
  GameConfig Config;
  std::string Error;
  if (!TestTrue(TEXT("archive fixture config parses"), ConfigFromJson(Json::Parse(R"JSON({"seed":"retired-weapon","targetVp":10,"layout":"balanced","firstPlayer":0,"privacy":false,"arms":true,"pvp":true,"seats":[{"name":"A","kind":"human","color":"crimson","sigil":"skull"},{"name":"B","kind":"human","color":"frost","sigil":"moon"},{"name":"C","kind":"bot","color":"bone","sigil":"eye"}]})JSON"), Config, &Error))) return false;
  auto State = CreateGame(Config);
  State.arms->armed[0] = true;
  Action Fire; Fire.type = ActionType::Fire; Fire.player = 0;
  Action Gun; Gun.type = ActionType::Strike; Gun.player = 0; Gun.victim = 1; Gun.weapon = Weapon::Revolver;
  TestFalse(TEXT("live firing rejected"), ApplyAction(State, Fire).ok);
  TestFalse(TEXT("live retired hit rejected"), ApplyAction(State, Gun).ok);
  auto Shot = ApplyRecordedAction(State, Fire);
  if (!TestTrue(TEXT("historical shot replays"), Shot.ok)) return false;
  TestEqual(TEXT("historical ammunition preserved"), Shot.state.arms->bullets[0], 4);
  auto Hit = ApplyRecordedAction(Shot.state, Gun);
  if (!TestTrue(TEXT("historical hit replays"), Hit.ok)) return false;
  TestEqual(TEXT("historical damage preserved"), Hit.state.arms->health[1], 50);
  TestFalse(TEXT("restored record cannot fire live"), ApplyAction(Hit.state, Fire).ok);
  Gun.weapon = Weapon::Sword;
  auto Melee = ApplyAction(Hit.state, Gun);
  TestTrue(TEXT("sword still works after restore"), Melee.ok && Melee.state.arms->health[1] == 25);
  return !HasAnyErrors();
}
#endif
