using UnrealBuildTool;

public class PrecinctTwelveEditorTarget : TargetRules
{
	public PrecinctTwelveEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("PrecinctTwelve");
	}
}
