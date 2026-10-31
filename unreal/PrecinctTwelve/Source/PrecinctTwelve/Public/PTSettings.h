#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "PTSettings.generated.h"

class USkeletalMesh;
class UStaticMesh;
class UAnimInstance;
class UMaterialInterface;

/**
 * Project Settings > Game > Precinct 12.
 * Asset slots that turn the procedural placeholder look into a photoreal one:
 * point them at realistic characters (e.g. Epic's City Sample Crowds / MetaHuman
 * skeletal meshes) and vehicles (e.g. City Sample Vehicles). Every slot is
 * optional - empty or missing slots fall back to procedural geometry.
 */
UCLASS(Config = Game, DefaultConfig, meta = (DisplayName = "Precinct 12"))
class PRECINCTTWELVE_API UPTSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	UPTSettings();

	virtual FName GetCategoryName() const override { return TEXT("Game"); }

	/** Master surface material created by Content/Python/init_unreal.py on first editor launch. */
	UPROPERTY(Config, EditAnywhere, Category = "Materials")
	TSoftObjectPtr<UMaterialInterface> SurfaceMaterial;

	/** Folder holding T_<Name>_D / _N / _R textures imported by the setup script. */
	UPROPERTY(Config, EditAnywhere, Category = "Materials")
	FString TextureFolder;

	/** Skeletal meshes used for people (officer, witnesses, suspects, pedestrians). Picked at random per NPC. */
	UPROPERTY(Config, EditAnywhere, Category = "Characters")
	TArray<TSoftObjectPtr<USkeletalMesh>> CharacterMeshes;

	/** Mesh for the player officer. Falls back to the first CharacterMeshes entry. */
	UPROPERTY(Config, EditAnywhere, Category = "Characters")
	TSoftObjectPtr<USkeletalMesh> OfficerMesh;

	/** Animation blueprint class driving the character meshes (must be compatible with their skeleton). */
	UPROPERTY(Config, EditAnywhere, Category = "Characters")
	TSoftClassPtr<UAnimInstance> CharacterAnimClass;

	/** Tint NPC character materials with their outfit colour (material needs a "Tint" vector parameter). */
	UPROPERTY(Config, EditAnywhere, Category = "Characters")
	bool bTintCharacterMaterials = true;

	/** Optional realistic police car body (static mesh, +X forward, pivot on the ground). Hides the procedural body. */
	UPROPERTY(Config, EditAnywhere, Category = "Vehicles")
	TSoftObjectPtr<UStaticMesh> PoliceCarMesh;

	/** Optional realistic civilian car meshes for traffic and parked cars. */
	UPROPERTY(Config, EditAnywhere, Category = "Vehicles")
	TArray<TSoftObjectPtr<UStaticMesh>> CivilianCarMeshes;

	/** Rotation (yaw, degrees) and scale applied to imported vehicle meshes so they face +X. */
	UPROPERTY(Config, EditAnywhere, Category = "Vehicles")
	float VehicleMeshYaw = 0.f;

	UPROPERTY(Config, EditAnywhere, Category = "Vehicles")
	float VehicleMeshScale = 1.f;
};
