#include "PTSettings.h"

UPTSettings::UPTSettings()
{
	SurfaceMaterial = TSoftObjectPtr<UMaterialInterface>(FSoftObjectPath(TEXT("/Game/PT/Materials/M_PT_Surface.M_PT_Surface")));
	TextureFolder = TEXT("/Game/PT/Textures");
	// Epic's mannequins from the Third Person template (copied in automatically by the setup script).
	CharacterMeshes.Add(TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny.SKM_Manny"))));
	CharacterMeshes.Add(TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Mannequins/Meshes/SKM_Quinn.SKM_Quinn"))));
	OfficerMesh = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(TEXT("/Game/Characters/Mannequins/Meshes/SKM_Manny.SKM_Manny")));
	CharacterAnimClass = TSoftClassPtr<UAnimInstance>(FSoftObjectPath(TEXT("/Game/Characters/Mannequins/Animations/ABP_Manny.ABP_Manny_C")));
}
