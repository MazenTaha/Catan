using UnrealBuildTool;
public class CatanNightEditorTarget : TargetRules {
    public CatanNightEditorTarget(TargetInfo Target) : base(Target) {
        Type=TargetType.Editor;
        DefaultBuildSettings=BuildSettingsVersion.V7;
        IncludeOrderVersion=EngineIncludeOrderVersion.Unreal5_8;
        ExtraModuleNames.Add("CatanNight");
    }
}
