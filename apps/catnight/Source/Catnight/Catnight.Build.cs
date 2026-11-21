using UnrealBuildTool;

public class Catnight : ModuleRules
{
	public Catnight(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		CppStandard = CppStandardVersion.Cpp20;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "CatnightRules" });
		// The UI is Slate from code; the 3D board builds its tiles with ProceduralMeshComponent and
		// loads the imported models from /Game/Generated (pnpm catnight:import).
		PrivateDependencyModuleNames.AddRange(new string[] { "InputCore", "Slate", "SlateCore", "ProceduralMeshComponent" });
	}
}
