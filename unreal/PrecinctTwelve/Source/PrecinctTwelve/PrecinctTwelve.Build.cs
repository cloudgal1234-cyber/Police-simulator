using UnrealBuildTool;

public class PrecinctTwelve : ModuleRules
{
	public PrecinctTwelve(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] {
			"Core", "CoreUObject", "Engine", "InputCore", "DeveloperSettings", "Json"
		});
	}
}
