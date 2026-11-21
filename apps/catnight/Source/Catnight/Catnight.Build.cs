using UnrealBuildTool;

public class Catnight : ModuleRules
{
	public Catnight(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		CppStandard = CppStandardVersion.Cpp20;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "CatnightRules" });
		// The table is drawn in Slate from code: no widget or texture assets yet (phase 4 brings the art).
		PrivateDependencyModuleNames.AddRange(new string[] { "InputCore", "Slate", "SlateCore" });
	}
}
