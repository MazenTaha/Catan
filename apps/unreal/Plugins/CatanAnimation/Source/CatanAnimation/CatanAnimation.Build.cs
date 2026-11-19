using UnrealBuildTool;
public class CatanAnimation : ModuleRules {
    public CatanAnimation(ReadOnlyTargetRules Target) : base(Target) {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore", "AnimGraphRuntime" });
    }
}
