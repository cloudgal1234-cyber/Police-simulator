#include "PTTraffic.h"
#include "PTCity.h"
#include "PTGameMode.h"
#include "PTMaterials.h"
#include "PTPoliceCar.h"
#include "PTSettings.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"

namespace
{
	const FLinearColor COLORS[] = {
		FLinearColor(0.35f, 0.02f, 0.02f), FLinearColor(0.02f, 0.06f, 0.2f), FLinearColor(0.7f, 0.7f, 0.7f), FLinearColor(0.02f, 0.02f, 0.02f),
		FLinearColor(0.1f, 0.12f, 0.13f), FLinearColor(0.04f, 0.12f, 0.05f), FLinearColor(0.35f, 0.35f, 0.36f), FLinearColor(0.15f, 0.03f, 0.07f) };
	const FIntPoint DIRS[4] = { FIntPoint(1, 0), FIntPoint(-1, 0), FIntPoint(0, 1), FIntPoint(0, -1) };
	bool Valid(int32 I, int32 J) { return I >= 0 && J >= 0 && I <= APTCity::GRID && J <= APTCity::GRID; }
}

APTTrafficCar::APTTrafficCar()
{
	PrimaryActorTick.bCanEverTick = true;
	Box = CreateDefaultSubobject<UBoxComponent>(TEXT("Box"));
	Box->SetBoxExtent(FVector(235.f, 95.f, 70.f));
	Box->SetCollisionProfileName(TEXT("BlockAllDynamic"));
	RootComponent = Box;
}

void APTTrafficCar::BuildBody(const FLinearColor& Color, bool bPolice, bool bTaxi, bool bVan, int32 MeshIndex)
{
	USceneComponent* Root = NewObject<USceneComponent>(this, TEXT("Body"));
	Root->SetupAttachment(Box);
	Root->SetRelativeLocation(FVector(0, 0, -70.f));	// ground level
	Root->RegisterComponent();
	AddInstanceComponent(Root);

	const UPTSettings* S = GetDefault<UPTSettings>();
	if (!bPolice && S->CivilianCarMeshes.Num() > 0)
	{
		if (UStaticMesh* M = S->CivilianCarMeshes[MeshIndex % S->CivilianCarMeshes.Num()].LoadSynchronous())
		{
			PTMat::AddPart(this, Root, M, nullptr, FVector::ZeroVector, FVector(100.f * S->VehicleMeshScale), FRotator(0, S->VehicleMeshYaw, 0));
			return;
		}
	}

	UMaterialInstanceDynamic* Paint = PTMat::Make(this, EPTSurf::CarPaint, bPolice ? FLinearColor(0.08f, 0.08f, 0.09f) : Color);
	UMaterialInstanceDynamic* White = PTMat::Make(this, EPTSurf::CarPaint, FLinearColor(4.5f, 4.5f, 4.4f));
	UMaterialInstanceDynamic* Glass = PTMat::Make(this, EPTSurf::Glass);
	UMaterialInstanceDynamic* Plastic = PTMat::Make(this, EPTSurf::Plastic);
	UMaterialInstanceDynamic* Rubber = PTMat::Make(this, EPTSurf::Rubber);
	UMaterialInstanceDynamic* Rim = PTMat::Make(this, EPTSurf::Chrome);
	UMaterialInstanceDynamic* Head = PTMat::Make(this, EPTSurf::Emissive, FLinearColor::White);
	PTMat::SetEmissive(Head, FLinearColor(1.f, 0.95f, 0.85f), 20.f);
	UMaterialInstanceDynamic* Tail = PTMat::Make(this, EPTSurf::Emissive, FLinearColor(0.3f, 0.01f, 0.01f));
	PTMat::SetEmissive(Tail, FLinearColor(1.f, 0.02f, 0.01f), 5.f);
	UStaticMesh* Cube = PTMat::Cube();
	auto P = [this, Root, Cube](UMaterialInterface* M, const FVector& L, const FVector& Sz, const FRotator& R = FRotator::ZeroRotator) {
		return PTMat::AddPart(this, Root, Cube, M, L, Sz, R);
	};
	if (bVan)
	{
		P(Paint, FVector(0, 0, 85), FVector(470, 196, 110));
		P(Paint, FVector(-50, 0, 190), FVector(360, 192, 110));
		P(Glass, FVector(122, 0, 185), FVector(20, 186, 70), FRotator(-20.f, 0, 0));
	}
	else
	{
		P(Paint, FVector(0, 0, 60), FVector(470, 186, 58));
		P(Paint, FVector(150, 0, 92), FVector(165, 182, 10), FRotator(-2.f, 0, 0));
		P(Paint, FVector(-188, 0, 95), FVector(94, 182, 10));
		P(Glass, FVector(-30, 0, 120), FVector(188, 166, 50));
		P(Glass, FVector(92, 0, 114), FVector(68, 164, 5), FRotator(-38.f, 0, 0));
		P(Glass, FVector(-150, 0, 115), FVector(62, 164, 5), FRotator(36.f, 0, 0));
		P(bPolice ? White : Paint, FVector(-34, 0, 147), FVector(148, 160, 6));
		P(Plastic, FVector(-40, 0, 120), FVector(10, 169, 52));
		if (bPolice)
		{
			P(White, FVector(-10, 0, 72), FVector(200, 190, 36));
			P(Plastic, FVector(-30, 0, 156), FVector(34, 136, 10));
			P(PTMat::Make(this, EPTSurf::Emissive, FLinearColor(0.3f, 0.02f, 0.02f)), FVector(-30, -34, 163), FVector(30, 60, 12));
			P(PTMat::Make(this, EPTSurf::Emissive, FLinearColor(0.02f, 0.04f, 0.3f)), FVector(-30, 34, 163), FVector(30, 60, 12));
		}
		if (bTaxi)
		{
			UMaterialInstanceDynamic* Sign = PTMat::Make(this, EPTSurf::Emissive, FLinearColor(0.9f, 0.8f, 0.4f));
			PTMat::SetEmissive(Sign, FLinearColor(1.f, 0.9f, 0.6f), 8.f);
			P(Sign, FVector(-40, 0, 160), FVector(30, 70, 20));
		}
	}
	P(Plastic, FVector(240, 0, 42), FVector(14, 194, 26));
	P(Plastic, FVector(-240, 0, 42), FVector(14, 194, 26));
	P(Head, FVector(240, -64, bVan ? 95 : 78), FVector(5, 40, 12));
	P(Head, FVector(240, 64, bVan ? 95 : 78), FVector(5, 40, 12));
	P(Tail, FVector(-243, -66, bVan ? 100 : 82), FVector(5, 44, 14));
	P(Tail, FVector(-243, 66, bVan ? 100 : 82), FVector(5, 44, 14));
	P(Rubber, FVector(145, 0, 52), FVector(100, 170, 50));
	P(Rubber, FVector(-145, 0, 52), FVector(100, 170, 50));
	const FVector WheelPos[4] = { FVector(145, -85, 42), FVector(145, 85, 42), FVector(-145, -85, 42), FVector(-145, 85, 42) };
	for (const FVector& W : WheelPos)
	{
		USceneComponent* Spin = NewObject<USceneComponent>(this);
		Spin->SetupAttachment(Root);
		Spin->SetRelativeLocation(W);
		Spin->RegisterComponent();
		AddInstanceComponent(Spin);
		PTMat::AddPart(this, Spin, PTMat::Cylinder(), Rubber, FVector::ZeroVector, FVector(84, 84, 26), FRotator(0, 0, 90.f));
		PTMat::AddPart(this, Spin, PTMat::Cylinder(), Rim, FVector(0, W.Y > 0 ? 2.f : -2.f, 0), FVector(50, 50, 27), FRotator(0, 0, 90.f), false, false);
		Wheels.Add(Spin);
	}
}

void APTTrafficCar::InitParked(APTCity* InCity, bool bPolice, const FLinearColor* Color, bool bVan, bool bDamaged)
{
	City = InCity;
	bDriving = false;
	Rand.Initialize(GetUniqueID());
	SetActorLocation(GetActorLocation() + FVector(0, 0, 70.f));
	BuildBody(Color ? *Color : COLORS[Rand.RandRange(0, 7)], bPolice, false, bVan, Rand.RandRange(0, 99));
	if (bDamaged)
	{
		// smashed front-left headlight + dent
		UMaterialInstanceDynamic* Dark = PTMat::Make(this, EPTSurf::Plastic);
		PTMat::AddPart(this, Box, PTMat::Cube(), Dark, FVector(241, -64, 8), FVector(6, 44, 14));
		PTMat::AddPart(this, Box, PTMat::Cube(), PTMat::Make(this, EPTSurf::CarPaint, Color ? *Color * 0.5f : FLinearColor::Gray), FVector(222, -60, -15), FVector(30, 70, 26), FRotator(0, 25.f, 8.f));
	}
	SetActorTickEnabled(false);
}

FVector2D APTTrafficCar::LanePoint(int32 I, int32 J, const FIntPoint& D, float Along) const
{
	// right-hand traffic: lane is on the right of the direction of travel; right of (dx, dy) is (-dy, dx)
	return FVector2D(APTCity::RoadPos(I) + D.X * Along - D.Y * APTCity::LANE, APTCity::RoadPos(J) + D.Y * Along + D.X * APTCity::LANE);
}

void APTTrafficCar::PlanApproach()
{
	Waypoints.Add({ LanePoint(Target.X, Target.Y, Dir, -900.f), true });
}

void APTTrafficCar::ChooseTurn()
{
	TArray<FIntPoint> Opts;
	for (const FIntPoint& D : DIRS)
	{
		if (D == FIntPoint(-Dir.X, -Dir.Y)) continue;
		if (Valid(Target.X + D.X, Target.Y + D.Y)) Opts.Add(D);
	}
	const FIntPoint ND = Opts.Num() ? Opts[Rand.RandRange(0, Opts.Num() - 1)] : FIntPoint(-Dir.X, -Dir.Y);
	Waypoints.Add({ LanePoint(Target.X, Target.Y, ND, 800.f), false });
	Dir = ND;
	Target += ND;
	PlanApproach();
}

void APTTrafficCar::InitDriving(APTCity* InCity, FRandomStream& R)
{
	City = InCity;
	bDriving = true;
	Rand.Initialize(R.RandRange(1, 1 << 30));
	int32 I, J;
	FIntPoint D;
	do
	{
		I = Rand.RandRange(0, APTCity::GRID); J = Rand.RandRange(0, APTCity::GRID);
		D = DIRS[Rand.RandRange(0, 3)];
	} while (!Valid(I + D.X, J + D.Y));
	Dir = D;
	Target = FIntPoint(I + D.X, J + D.Y);
	const float T = 0.2f + Rand.FRand() * 0.5f;
	const FVector2D A(APTCity::RoadPos(I), APTCity::RoadPos(J)), B(APTCity::RoadPos(Target.X), APTCity::RoadPos(Target.Y));
	const FVector2D P = FMath::Lerp(A, B, T) + FVector2D(-D.Y, D.X) * APTCity::LANE;
	Heading = FMath::RadiansToDegrees(FMath::Atan2(static_cast<float>(D.Y), static_cast<float>(D.X)));
	SetActorLocationAndRotation(FVector(P, 70.f), FRotator(0, Heading, 0));
	MaxSpeed = 800.f + Rand.FRand() * 500.f;
	const bool bTaxi = Rand.FRand() < 0.15f, bVan = !bTaxi && Rand.FRand() < 0.15f;
	BuildBody(bTaxi ? FLinearColor(0.75f, 0.5f, 0.02f) : COLORS[Rand.RandRange(0, 7)], false, bTaxi, bVan, Rand.RandRange(0, 99));
	PlanApproach();
}

void APTTrafficCar::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!bDriving || !City || Waypoints.Num() == 0) return;
	const float Dt = FMath::Min(DeltaSeconds, 0.05f);
	FVector Loc = GetActorLocation();

	FWaypoint Wp = Waypoints[0];
	FVector2D ToWp = Wp.P - FVector2D(Loc);
	float Dist = ToWp.Size();
	for (int32 Guard = 0; Dist < 250.f && Guard < 3; ++Guard)
	{
		Waypoints.RemoveAt(0);
		if (Wp.bTurn) ChooseTurn();
		Wp = Waypoints[0];
		ToWp = Wp.P - FVector2D(Loc);
		Dist = ToWp.Size();
	}
	const float TargetYaw = FMath::RadiansToDegrees(FMath::Atan2(ToWp.Y, ToWp.X));
	Heading = FMath::FixedTurn(Heading, TargetYaw, 180.f * Dt * FMath::Max(0.3f, Speed / 600.f));
	const FVector Fw = FRotator(0, Heading, 0).Vector();
	const FVector Rt = FRotator(0, Heading + 90.f, 0).Vector();

	float Want = MaxSpeed;
	if (FMath::Abs(FMath::FindDeltaAngleDegrees(Heading, TargetYaw)) > 30.f) Want *= 0.5f;
	// red / yellow light at the next intersection
	if (Wp.bTurn && APTCity::HasSignal(Target.X, Target.Y) && Dist < 2200.f)
	{
		const TCHAR St = City->Signal(Dir.X != 0);
		if (St == 'r' || (St == 'y' && Dist > 700.f)) Want = FMath::Min(Want, FMath::Max(0.f, (Dist - 300.f) * 0.9f));
	}
	// look ahead for cars, the player and pedestrians on the road
	if (APTGameMode* GM = APTGameMode::Get(this))
	{
		auto Check = [&](const FVector& O, float Radius) {
			const FVector Rel = O - Loc;
			const float Ahead = FVector::DotProduct(Rel, Fw);
			if (Ahead <= 0.f || Ahead > 1300.f) return;
			if (FMath::Abs(FVector::DotProduct(Rel, Rt)) < 260.f + Radius * 0.5f)
			{
				Want = FMath::Min(Want, Ahead < 650.f ? 0.f : MaxSpeed * (Ahead - 650.f) / 650.f);
			}
		};
		for (APTTrafficCar* C : GM->Traffic) { if (C && C != this) Check(C->GetActorLocation(), 200.f); }
		Check(GM->PlayerLocation(), GM->IsDriving() ? 200.f : 60.f);
	}
	Speed = FMath::FInterpTo(Speed, Want, Dt, Want < Speed ? 6.f : 1.5f);
	Loc += Fw * Speed * Dt;
	SetActorLocationAndRotation(Loc, FRotator(0, Heading, 0));
	WheelSpin += FMath::RadiansToDegrees(Speed / 42.f) * Dt;
	for (USceneComponent* W : Wheels) W->SetRelativeRotation(FRotator(-WheelSpin, 0, 0));
}
