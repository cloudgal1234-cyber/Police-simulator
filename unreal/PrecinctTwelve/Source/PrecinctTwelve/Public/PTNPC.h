#pragma once

#include "CoreMinimal.h"
#include "PTHuman.h"
#include "PTNPC.generated.h"

UENUM()
enum class EPTNpcMode : uint8 { Idle, Pedestrian, Hostile, Flee, Down };

enum class EPTAi : uint8 { Run, Hide, Peek };

struct FPTCover
{
	FVector Center = FVector::ZeroVector;
	FVector2D Half = FVector2D(80.f, 80.f);
};

/** Witnesses, suspects, pedestrians and (during standoffs) armed suspects with cover AI. */
UCLASS()
class PRECINCTTWELVE_API APTNPC : public APTHuman
{
	GENERATED_BODY()

public:
	APTNPC();
	virtual void Tick(float DeltaSeconds) override;

	void InitPedestrian(const FBox2D& Rect, FRandomStream& R);
	void InitCase(const FPTNpcDef& InDef, int32 Seed);
	void InitAccomplice(const FString& InName, const FPTLook& Look, int32 Seed);
	void MakeHostile();
	void ResetHostile();
	void FleeTo(const FVector& Target);
	/** Returns true if the hit counted (armed suspect). */
	bool TakeHit(int32 Damage);

	EPTNpcMode Mode = EPTNpcMode::Idle;
	FPTNpcDef Def;
	bool bHasDef = false;
	FString DisplayName;
	TSet<FString> Asked;
	bool bArrested = false;
	bool bGone = false;
	bool bTalkingTo = false;

	bool IsDown() const { return Mode == EPTNpcMode::Down; }
	int32 GetCoverIndex() const { return CoverIndex; }

private:
	void TickPedestrian(float Dt);
	void TickHostile(float Dt);
	void PickCover();
	FVector CoverSpot(const FPTCover& C) const;
	void Shoot();
	void FaceYaw(float Yaw, float Dt, float Speed);

	// pedestrian
	FBox2D Path;
	int32 Corner = 0;
	int32 Dir = 1;
	float DodgeCd = 0.f;

	// hostile
	EPTAi Ai = EPTAi::Run;
	int32 Hp = 4;
	int32 CoverIndex = -1;
	FVector Spot = FVector::ZeroVector;
	FVector StartLoc = FVector::ZeroVector;
	float StateT = 0.f, ShootCd = 1.f, Flinch = 0.f, FleeT = 0.f;
	FVector FleeTarget = FVector::ZeroVector;
};
