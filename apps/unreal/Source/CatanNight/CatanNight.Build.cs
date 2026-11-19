using UnrealBuildTool;
public class CatanNight : ModuleRules {
    public CatanNight(ReadOnlyTargetRules Target) : base(Target) {
        PCHUsage=PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new string[]{"Core","CoreUObject","Engine"});
    }
}
