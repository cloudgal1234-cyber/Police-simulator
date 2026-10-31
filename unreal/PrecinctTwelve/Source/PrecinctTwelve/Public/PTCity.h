#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "PTMaterials.h"
#include "PTCity.generated.h"

class UInstancedStaticMeshComponent;

UENUM()
enum class EPTBlockType : uint8
{
	Downtown, Greens, Park, HQ, Store, Apartments, Lot, Warehouse
};

struct FPTBlock
{
	int32 BX = 0, BY = 0;
	FBox2D Rect;
	FVector2D Center;
	EPTBlockType Type = EPTBlockType::Downtown;
};

/** Procedural city: roads, blocks, buildings, street furniture, traffic lights. */
UCLASS()
class PRECINCTTWELVE_API APTCity : public AActor
{
	GENERATED_BODY()

public:
	APTCity();

	static constexpr int32 GRID = 6;
	static constexpr float CELL = 7000.f;
	static constexpr float ROAD = 1400.f;
	static constexpr float SIDEWALK = 400.f;
	static constexpr float LANE = 350.f;
	static constexpr float HALF = GRID * CELL * 0.5f;

	static float RoadPos(int32 I) { return -HALF + I * CELL; }

	void Build();
	virtual void Tick(float DeltaSeconds) override;

	const TArray<FPTBlock>& GetBlocks() const { return Blocks; }
	const FPTBlock* GetBlock(int32 BX, int32 BY) const;
	FIntPoint NearestIntersection(const FVector& P) const;

	/** Signal state for traffic travelling along X (true) or Y: 'g', 'y' or 'r'. */
	TCHAR Signal(bool bAxisX) const;
	static bool HasSignal(int32 I, int32 J) { return I > 0 && J > 0 && I < GRID && J < GRID; }

	/** Points where parked cars were placed (the game mode spawns the actual cars). */
	TArray<FTransform> ParkedSpots;

private:
	UInstancedStaticMeshComponent* ISM(const FString& Key, UStaticMesh* Mesh, EPTSurf Surf, bool bCollision, bool bShadow, bool bLumen = true);
	int32 Add(UInstancedStaticMeshComponent* C, const FVector& Center, const FVector& Size, const FLinearColor& Tint = FLinearColor::White, float Yaw = 0.f);
	void Box(UInstancedStaticMeshComponent* C, float X0, float Y0, float Z0, float X1, float Y1, float Z1, const FLinearColor& Tint = FLinearColor::White);

	void Building(float X0, float Y0, float X1, float Y1, float H, EPTSurf Style, bool bShops, bool bNoUpper = false);
	void Windows(float X0, float Y0, float X1, float Y1, float H, bool bShops, bool bNoUpper, const FLinearColor& Frame);
	void Tree(float X, float Y, float S, bool bCollide = true);
	void Lamp(float X, float Y, float Yaw);
	void Sign(const FString& Text, const FVector& Loc, float Yaw, float Width, const FLinearColor& Bg);
	void Roads();
	void Signals();

	UPROPERTY()
	TMap<FString, TObjectPtr<UInstancedStaticMeshComponent>> Batches;

	UPROPERTY()
	TObjectPtr<UInstancedStaticMeshComponent> Lenses;

	struct FSignalRef { bool bAxisX; int32 Lens[3]; };
	TArray<FSignalRef> SignalRefs;
	TArray<FPTBlock> Blocks;
	FRandomStream Rand;
	float SignalTime = 0.f;
	FString LastPhase;
	bool bBuilt = false;
};
