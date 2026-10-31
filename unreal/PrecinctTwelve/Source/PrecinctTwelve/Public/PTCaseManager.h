#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "PTTypes.h"
#include "PTNPC.h"
#include "PTCaseManager.generated.h"

class APTGameMode;
class APTMarker;
class APTHUD;

UENUM()
enum class EPTCaseState : uint8 { Patrol, Respond, Investigate, Standoff, Wrapup };

UCLASS()
class PRECINCTTWELVE_API UPTCaseManager : public UObject
{
	GENERATED_BODY()

public:
	void Init(APTGameMode* InGM);
	void Tick(float Dt);

	EPTCaseState State = EPTCaseState::Patrol;
	TArray<FPTCase> Cases;
	TArray<FString> Found;
	TArray<FPTCover> Covers;

	const FPTCase* Current() const { return Cases.IsValidIndex(CurrentIdx) ? &Cases[CurrentIdx] : nullptr; }
	FVector Anchor() const;
	bool Target(FVector& Out, FString& Label) const;
	bool CanAccuse() const;

	/** On-foot interaction: returns prompt text for the nearest clue / person (empty if none). */
	FString InteractPrompt() const;
	void TryInteract();

	void OnSuspectDown(APTNPC* N);
	void OnPedestrianStruck();
	void OnPlayerDown();
	bool IsCoverTaken(int32 Index, const APTNPC* Asker) const;
	int32 AliveSuspects() const;

	float Timer = 7.f;

private:
	struct FClueRef
	{
		FString Ev;
		FVector Pos;
		TWeakObjectPtr<APTMarker> Marker;
		bool bDone = false;
	};

	void Start();
	void Spawn();
	void Cleanup();
	void RefreshObjective();
	bool Has(const TArray<FString>& Req) const;
	bool AddEvidence(const FString& Id);
	void NpcMenu(APTNPC* N, const FString& Text);
	void ConfirmAccuse(APTNPC* N);
	void Accuse(APTNPC* N);
	void EndTalk();
	void StartStandoff(APTNPC* Culprit);
	void Resolve();
	APTHUD* Hud() const;

	UPROPERTY() TObjectPtr<APTGameMode> GM;
	UPROPERTY() TArray<TObjectPtr<AActor>> SceneActors;
	UPROPERTY() TArray<TObjectPtr<APTNPC>> Npcs;
	UPROPERTY() TArray<TObjectPtr<APTNPC>> Enemies;
	UPROPERTY() TMap<TObjectPtr<APTNPC>, TObjectPtr<APTMarker>> NpcMarkers;
	UPROPERTY() TObjectPtr<AActor> Beacon;
	UPROPERTY() TObjectPtr<APTNPC> Talking;

	TArray<FClueRef> Clues;
	int32 Next = 0;
	int32 CurrentIdx = -1;
	float Time = 0.f;
	float PedCd = 0.f;
	int32 ResponseBonus = 0;
	int32 Wrong = 0;
};
