#pragma once

#include "CoreMinimal.h"
#include "PTHuman.h"
#include "PTOfficer.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UAudioComponent;
class UPTSynth;

UCLASS()
class PRECINCTTWELVE_API APTOfficer : public APTHuman
{
	GENERATED_BODY()

public:
	APTOfficer();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	void Move(float Forward, float Right);
	void SetRun(bool bRun);
	void SetAim(bool bAim);
	void Fire();
	void Reload();
	void SetInCar(bool bInCar);
	void Damage(float Amount);
	void ResetHealth() { Health = 100.f; }

	void PlayShot(float Volume, float Pitch = 1.f);
	void PlayUi(float Pitch = 1.f);

	float Health = 100.f;
	int32 Ammo = 12;
	static constexpr int32 MAG = 12;
	float ReloadT = 0.f;
	float HitFlash = 0.f;		// HUD hit marker timer
	float DamageFlash = 0.f;	// HUD red vignette timer
	bool bWeaponDrawn = false;
	bool bAimingNow = false;

	UPROPERTY(VisibleAnywhere) TObjectPtr<USpringArmComponent> Arm;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> Camera;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UAudioComponent> ShotAudio;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UAudioComponent> UiAudio;

private:
	UPROPERTY() TObjectPtr<UPTSynth> ShotSynth;
	UPROPERTY() TObjectPtr<UPTSynth> UiSynth;
	float FireCd = 0.f;
	float HurtT = 0.f;
};
