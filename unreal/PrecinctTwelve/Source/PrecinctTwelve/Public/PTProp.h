#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "PTProp.generated.h"

class UBoxComponent;
class UMaterialInstanceDynamic;
class UStaticMeshComponent;

/** Crime-scene props built from primitives (crates, counters, bus stops, statues ...). */
UCLASS()
class PRECINCTTWELVE_API APTProp : public AActor
{
	GENERATED_BODY()

public:
	APTProp();
	/** Builds the prop. Returns true and fills OutHalf (cm) when it has a collision box. */
	bool Build(const FString& Type, const FLinearColor& Color, FVector& OutHalf);
};

/** Pulsing marker over clues (yellow) and people with something to say (blue). */
UCLASS()
class PRECINCTTWELVE_API APTMarker : public AActor
{
	GENERATED_BODY()

public:
	APTMarker();
	void Setup(const FLinearColor& Color);
	void SetColor(const FLinearColor& Color);
	void SetDone();
	virtual void Tick(float DeltaSeconds) override;

private:
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Gem;
	UPROPERTY() TObjectPtr<UStaticMeshComponent> Ring;
	UPROPERTY() TObjectPtr<UMaterialInstanceDynamic> Mat;
	float T = 0.f;
	bool bDone = false;
};
