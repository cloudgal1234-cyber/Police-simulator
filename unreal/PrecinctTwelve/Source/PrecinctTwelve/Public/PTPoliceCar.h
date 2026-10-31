#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "PTPoliceCar.generated.h"

class UBoxComponent;
class USpringArmComponent;
class UCameraComponent;
class UPointLightComponent;
class USpotLightComponent;
class UMaterialInstanceDynamic;
class UAudioComponent;
class UPTSynth;

/**
 * Police cruiser with arcade "bicycle model" handling (same model as the
 * browser version): engine force, braking/reverse, drag, lateral tyre grip,
 * handbrake drift, speed-sensitive steering, swept collisions.
 */
UCLASS()
class PRECINCTTWELVE_API APTPoliceCar : public APawn
{
	GENERATED_BODY()

public:
	APTPoliceCar();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	// controls (written by the player controller each frame)
	float Throttle = 0.f, Brake = 0.f, Steer = 0.f;
	bool bHandbrake = false;

	void ToggleSiren();
	void ToggleCamera();
	void Horn();
	void SetDriven(bool bDriven);

	bool IsSirenOn() const { return bSiren; }
	float SpeedKmh() const { return FMath::Abs(Speed) * 0.036f; }
	float SignedSpeed() const { return Speed; } // cm/s

	UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> Box;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Body;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USpringArmComponent> Arm;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> ChaseCam;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> HoodCam;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> RedLight;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> BlueLight;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USpotLightComponent> HeadL;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USpotLightComponent> HeadR;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UAudioComponent> EngineAudio;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UAudioComponent> SirenAudio;

private:
	void BuildBody();
	void UpdateLights(float Dt);

	UPROPERTY() TArray<TObjectPtr<USceneComponent>> Wheels;
	UPROPERTY() TArray<TObjectPtr<USceneComponent>> FrontPivots;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> RedMat;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> BlueMat;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> TailMat;
	UPROPERTY() TObjectPtr<UPTSynth> EngineSynth;
	UPROPERTY() TObjectPtr<UPTSynth> SirenSynth;

	FVector2D Vel = FVector2D::ZeroVector; // cm/s, world XY
	float Speed = 0.f;
	float SteerAngle = 0.f;
	float Roll = 0.f, Pitch = 0.f;
	float LightT = 0.f;
	float WheelSpin = 0.f;
	bool bSiren = false;
	bool bHoodCam = false;
	bool bDriven = true;
};
