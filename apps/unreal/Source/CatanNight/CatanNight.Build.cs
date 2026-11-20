using UnrealBuildTool;
public class CatanNight : ModuleRules {
    public CatanNight(ReadOnlyTargetRules Target) : base(Target) {
        PCHUsage=PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new string[]{"Core","CoreUObject","Engine"});
        // The table map shows the web game in Unreal's built-in Chromium (CEF) browser.
        PrivateDependencyModuleNames.AddRange(new string[]{"InputCore","Slate","SlateCore","WebBrowser","HTTP"});
        // The web game (pnpm unreal:web) ships as loose files beside the pak; Node runs them. It lives
        // outside Content so the editor never offers to import its images and models as assets.
        RuntimeDependencies.Add("$(ProjectDir)/WebGame/...", StagedFileType.NonUFS);
    }
}
