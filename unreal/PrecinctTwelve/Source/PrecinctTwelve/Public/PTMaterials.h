#pragma once

#include "CoreMinimal.h"

class AActor;
class UMaterialInstanceDynamic;
class UMaterialInterface;
class UObject;
class USceneComponent;
class UStaticMesh;
class UStaticMeshComponent;

/** Surface presets. Each maps to textures + tint/roughness/metal on the master material. */
enum class EPTSurf : uint8
{
	Asphalt, Concrete, Brick, Plaster, Panels, Curtain, Metal, Grass, Leaves, Roof,
	Paint, Glass, ShopGlass, CarPaint, Chrome, Rubber, Plastic, Cloth, Skin, Wood, Emissive
};

/**
 * Builds dynamic material instances. Uses the master material made by the
 * setup script when present, otherwise Epic's BasicShapeMaterial (colour only),
 * so the game always runs even before the first editor setup.
 */
namespace PTMat
{
	UMaterialInstanceDynamic* Make(UObject* Outer, EPTSurf Surf, const FLinearColor& Tint = FLinearColor::White);
	void SetEmissive(UMaterialInstanceDynamic* M, const FLinearColor& Color, float Strength);
	bool HasMaster();

	/** Adds a runtime static mesh part to an actor. Size is in cm (basic shapes are 100 cm). */
	UStaticMeshComponent* AddPart(AActor* Owner, USceneComponent* Parent, UStaticMesh* Mesh, UMaterialInterface* Mat,
		const FVector& Loc, const FVector& Size, const FRotator& Rot = FRotator::ZeroRotator, bool bCollision = false, bool bShadow = true);

	UStaticMesh* Cube();
	UStaticMesh* Sphere();
	UStaticMesh* Cylinder();
	UStaticMesh* Cone();
	UStaticMesh* Plane();
}
