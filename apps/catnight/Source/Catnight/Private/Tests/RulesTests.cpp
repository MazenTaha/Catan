// Runs the golden replay inside Unreal, so the rules are proven with Unreal's own compiler
// settings (not only native/build.ps1). Needs `pnpm golden` once for native/golden/data.
#include "CatnightRules/Golden.h"
#include "HAL/PlatformTime.h"
#include "Misc/AutomationTest.h"
#include "Misc/Paths.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FCatnightGoldenTest, "Catnight.Rules.Golden",
                                 EAutomationTestFlags::EditorContext | EAutomationTestFlags::ClientContext |
                                     EAutomationTestFlags::ProductFilter)

bool FCatnightGoldenTest::RunTest(const FString& Parameters)
{
	const FString Dir = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../../native/golden/data"));
	catnight::GoldenOptions Options;
	Options.only = TCHAR_TO_UTF8(*Parameters);
	const double Start = FPlatformTime::Seconds();
	const catnight::GoldenSummary Sum = catnight::ReplayGoldenDir(TCHAR_TO_UTF8(*Dir), Options);
	for (const std::string& F : Sum.failures)
	{
		AddError(UTF8_TO_TCHAR(F.c_str()));
	}
	for (const std::string& R : Sum.missingRules)
	{
		AddError(FString::Printf(TEXT("rule never seen: %s"), UTF8_TO_TCHAR(R.c_str())));
	}
	AddInfo(FString::Printf(TEXT("CATNIGHT GOLDEN %d games, %d matched; %ld actions (%ld rejected), %ld bot moves, %ld probes; %.1f s"),
		Sum.games, Sum.matched, Sum.steps, Sum.errors, Sum.botChecks, Sum.probes, FPlatformTime::Seconds() - Start));
	return Sum.Passed();
}

#endif
