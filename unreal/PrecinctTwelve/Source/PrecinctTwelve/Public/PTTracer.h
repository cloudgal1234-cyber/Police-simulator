#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "PTTracer.generated.h"

/** Short-lived bullet tracer + muzzle flash light. */
UCLASS()
class PRECINCTTWELVE_API APTTracer : public AActor
{
	GENERATED_BODY()

public:
	APTTracer();
	static void Spawn(UWorld* World, const FVector& From, const FVector& To, const FLinearColor& Color);
	void Setup(const FVector& From, const FVector& To, const FLinearColor& Color);
};
