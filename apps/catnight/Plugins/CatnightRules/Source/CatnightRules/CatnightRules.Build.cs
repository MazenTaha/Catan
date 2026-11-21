using UnrealBuildTool;

// The rules core is plain C++20 with no Unreal types; native/build.ps1 builds the same sources
// for the golden tests. Not compiled inside Unreal yet: the apps/catnight project arrives in phase 2.
public class CatnightRules : ModuleRules
{
	public CatnightRules(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		CppStandard = CppStandardVersion.Cpp20;
		bEnableExceptions = false;
		// Each source keeps helpers in an anonymous namespace; unity builds would merge them.
		bUseUnity = false;
		// Doubles must round exactly as in JavaScript: the bots compare scores.
		FPSemantics = FPSemanticsMode.Precise;
		PublicDependencyModuleNames.Add("Core");
	}
}
