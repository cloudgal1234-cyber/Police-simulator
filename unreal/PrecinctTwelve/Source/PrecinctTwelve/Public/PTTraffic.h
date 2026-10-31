#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "PTTraffic.generated.h"

class APTCity;
class UBoxComponent;
class UMaterialInstanceDynamic;

/** AI traffic that follows lanes, turns at intersections and stops at red lights. Also used for parked cars. */
UCLASS()
class PRECINCTTWELVE_API APTTrafficCar : public AActor
{
	GENERATED_BODY()

public:
	APTTrafficCar();

	void InitDriving(APTCity* InCity, FRandomStream& R);
	void InitParked(APTCity* InCity, bool bPolice, const FLinearColor* Color = nullptr, bool bVan = false, bool bDamaged = false);
	virtual void Tick(float DeltaSeconds) override;

	float Speed = 0.f;

	UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> Box;

private:
	void BuildBody(const FLinearColor& Color, bool bPolice, bool bTaxi, bool bVan, int32 MeshIndex);
	FVector2D LanePoint(int32 I, int32 J, const FIntPoint& D, float Along) const;
	void PlanApproach();
	void ChooseTurn();

	struct FWaypoint { FVector2D P; bool bTurn; };
	TArray<FWaypoint> Waypoints;
	UPROPERTY() TObjectPtr<APTCity> City;
	UPROPERTY() TArray<TObjectPtr<USceneComponent>> Wheels;
	FRandomStream Rand;
	FIntPoint Target = FIntPoint::ZeroValue;
	FIntPoint Dir = FIntPoint(1, 0);
	float MaxSpeed = 1000.f;
	float Heading = 0.f;	// degrees
	float WheelSpin = 0.f;
	bool bDriving = false;
};
