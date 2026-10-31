using UnrealBuildTool;

public class PrecinctTwelveTarget : TargetRules
{
	public PrecinctTwelveTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.Latest;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("PrecinctTwelve");
	}
}
