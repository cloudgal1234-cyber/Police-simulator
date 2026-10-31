#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "PTTypes.h"
#include "PTHuman.generated.h"

class UStaticMeshComponent;

/**
 * Shared look for every person. Uses the skeletal mesh + animation blueprint
 * from Project Settings (Epic mannequins by default, or realistic City Sample /
 * MetaHuman bodies) and falls back to a procedural, animated figure.
 */
UCLASS(Abstract)
class PRECINCTTWELVE_API APTHuman : public ACharacter
{
	GENERATED_BODY()

public:
	APTHuman();

	void ApplyLook(const FPTLook& Look, bool bOfficer, int32 Seed);
	void SetArmed(bool bArmed);
	void SetSurrender(bool bOn) { bSurrender = bOn; }
	void SetAiming(bool bOn) { bAiming = bOn; }
	void SetTalking(bool bOn) { bTalking = bOn; }
	void SetCrouched(bool bOn);
	bool UsesSkeletalMesh() const { return bSkeletal; }
	FVector GunMuzzle() const;

	virtual void Tick(float DeltaSeconds) override;

protected:
	UPROPERTY() TObjectPtr<USceneComponent> Proc;
	UPROPERTY() TObjectPtr<USceneComponent> LegL;
	UPROPERTY() TObjectPtr<USceneComponent> LegR;
	UPROPERTY() TObjectPtr<USceneComponent> ArmL;
	UPROPERTY() TObjectPtr<USceneComponent> ArmR;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Gun;

	bool bSkeletal = false;
	bool bSurrender = false;
	bool bAiming = false;
	bool bTalking = false;
	bool bCrouchedVisual = false;
	float WalkPhase = 0.f;
	float LookScale = 1.f;
};
