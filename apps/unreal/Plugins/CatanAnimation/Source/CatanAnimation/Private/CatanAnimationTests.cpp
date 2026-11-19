#if WITH_DEV_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"
#include "CatanActionClock.h"
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FCatanMarkerTest,"Catan.Animation.MarkerOnce",EAutomationTestFlags::EditorContext|EAutomationTestFlags::EngineFilter)
bool FCatanMarkerTest::RunTest(const FString&) {
    FCatanActionClock C; TestTrue(TEXT("begin"),C.Begin(.21,.58)); TestFalse(TEXT("spam"),C.Begin(.21,.58));
    TestFalse(TEXT("anticipation"),C.Advance(.20)); TestTrue(TEXT("contact"),C.Advance(.02)); TestFalse(TEXT("no duplicate"),C.Advance(1));
    TestTrue(TEXT("repeat"),C.Begin(.21,.58)); TestTrue(TEXT("large gap crosses marker"),C.Advance(5)); TestFalse(TEXT("one callback"),C.Advance(5)); return true;
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FCatanCancelTest,"Catan.Animation.Cancellation",EAutomationTestFlags::EditorContext|EAutomationTestFlags::EngineFilter)
bool FCatanCancelTest::RunTest(const FString&) {
    FCatanActionClock C; C.Begin(.21,.58); C.CancelContact(); TestFalse(TEXT("guard cancels pending hit"),C.Advance(.3)); TestTrue(TEXT("recovery remains"),C.Active());
    C.Cancel(); TestFalse(TEXT("disposed callbacks"),C.Advance(3)); TestTrue(TEXT("fresh action"),C.Begin(0,.42)); TestTrue(TEXT("shot at zero"),C.Advance(0)); return true;
}
#endif
