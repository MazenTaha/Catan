using UnrealBuildTool;
public class CatanNightTarget : TargetRules {
    public CatanNightTarget(TargetInfo Target) : base(Target) {
        Type=TargetType.Game;
        DefaultBuildSettings=BuildSettingsVersion.V7;
        IncludeOrderVersion=EngineIncludeOrderVersion.Unreal5_8;
        ExtraModuleNames.Add("CatanNight");
    }
}
