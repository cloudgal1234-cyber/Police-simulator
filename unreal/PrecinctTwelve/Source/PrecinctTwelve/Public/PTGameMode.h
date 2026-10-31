#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "PTGameMode.generated.h"

class APTCity;
class APTPoliceCar;
class APTOfficer;
class APTTrafficCar;
class APTNPC;
class UPTCaseManager;

/** Builds the world at runtime and owns the game state (score, mode, cases). */
UCLASS()
class PRECINCTTWELVE_API APTGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	APTGameMode();

	virtual void StartPlay() override;
	virtual void HandleStartingNewPlayer_Implementation(APlayerController* NewPlayer) override;
	virtual void Tick(float DeltaSeconds) override;

	UPROPERTY() TObjectPtr<APTCity> City;
	UPROPERTY() TObjectPtr<APTPoliceCar> Car;
	UPROPERTY() TObjectPtr<APTOfficer> Officer;
	UPROPERTY() TObjectPtr<UPTCaseManager> Cases;
	UPROPERTY() TArray<TObjectPtr<APTTrafficCar>> Traffic;
	UPROPERTY() TArray<TObjectPtr<APTNPC>> Pedestrians;

	bool IsDriving() const { return bDriving; }
	FVector PlayerLocation() const;
	float PlayerYaw() const;

	void EnterCar();
	void ExitCar();
	void AddScore(int32 N) { Score = FMath::Max(0, Score + N); }

	int32 Score = 0;
	int32 Solved = 0;

	static APTGameMode* Get(const UObject* WorldContext);

private:
	void BuildWorld();
	void SpawnEnvironment();
	bool bBuilt = false;
	bool bDriving = true;
};
