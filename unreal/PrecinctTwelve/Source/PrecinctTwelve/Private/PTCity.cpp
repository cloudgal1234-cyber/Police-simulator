#include "PTCity.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Materials/MaterialInstanceDynamic.h"

namespace
{
	const FLinearColor PLASTER[] = {
		FLinearColor(0.82f, 0.72f, 0.56f), FLinearColor(0.69f, 0.55f, 0.38f), FLinearColor(0.58f, 0.65f, 0.70f),
		FLinearColor(0.77f, 0.59f, 0.45f), FLinearColor(0.70f, 0.67f, 0.58f), FLinearColor(0.58f, 0.49f, 0.38f),
		FLinearColor(0.50f, 0.56f, 0.59f), FLinearColor(0.81f, 0.76f, 0.66f) };
	const FLinearColor BRICK[] = { FLinearColor(1, 1, 1), FLinearColor(0.88f, 0.78f, 0.72f), FLinearColor(0.76f, 0.65f, 0.58f) };
	const FLinearColor PANEL[] = { FLinearColor(1, 1, 1), FLinearColor(0.8f, 0.79f, 0.75f), FLinearColor(0.69f, 0.72f, 0.75f) };
	const FLinearColor AWNING[] = {
		FLinearColor(0.2f, 0.015f, 0.015f), FLinearColor(0.015f, 0.05f, 0.15f), FLinearColor(0.015f, 0.1f, 0.04f),
		FLinearColor(0.15f, 0.07f, 0.015f), FLinearColor(0.03f, 0.03f, 0.03f) };

	EPTBlockType SpecialType(int32 X, int32 Y, bool& bSpecial)
	{
		bSpecial = true;
		if (X == 2 && Y == 2) return EPTBlockType::HQ;
		if (X == 1 && Y == 1) return EPTBlockType::Store;
		if (X == 4 && Y == 1) return EPTBlockType::Park;
		if (X == 1 && Y == 4) return EPTBlockType::Apartments;
		if (X == 4 && Y == 4) return EPTBlockType::Lot;
		if (X == 5 && Y == 2) return EPTBlockType::Warehouse;
		bSpecial = false;
		return EPTBlockType::Downtown;
	}
}

APTCity::APTCity()
{
	PrimaryActorTick.bCanEverTick = true;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	RootComponent->SetMobility(EComponentMobility::Static);
	Rand.Initialize(20241);
}

UInstancedStaticMeshComponent* APTCity::ISM(const FString& Key, UStaticMesh* Mesh, EPTSurf Surf, bool bCollision, bool bShadow, bool bLumen)
{
	if (TObjectPtr<UInstancedStaticMeshComponent>* Found = Batches.Find(Key))
	{
		return *Found;
	}
	UInstancedStaticMeshComponent* C = NewObject<UInstancedStaticMeshComponent>(this, *Key);
	C->SetStaticMesh(Mesh);
	C->SetMaterial(0, PTMat::Make(this, Surf));
	C->SetMobility(EComponentMobility::Static);
	C->SetCollisionEnabled(bCollision ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision);
	if (bCollision) { C->SetCollisionProfileName(TEXT("BlockAll")); }
	C->SetCastShadow(bShadow);
	C->bAffectDistanceFieldLighting = bLumen;
	C->SetNumCustomDataFloats(3);
	C->SetupAttachment(RootComponent);
	C->RegisterComponent();
	AddInstanceComponent(C);
	Batches.Add(Key, C);
	return C;
}

int32 APTCity::Add(UInstancedStaticMeshComponent* C, const FVector& Center, const FVector& Size, const FLinearColor& Tint, float Yaw)
{
	const int32 I = C->AddInstance(FTransform(FRotator(0.f, Yaw, 0.f), Center, Size / 100.f), true);
	C->SetCustomDataValue(I, 0, Tint.R);
	C->SetCustomDataValue(I, 1, Tint.G);
	C->SetCustomDataValue(I, 2, Tint.B);
	return I;
}

void APTCity::Box(UInstancedStaticMeshComponent* C, float X0, float Y0, float Z0, float X1, float Y1, float Z1, const FLinearColor& Tint)
{
	Add(C, FVector((X0 + X1) * 0.5f, (Y0 + Y1) * 0.5f, (Z0 + Z1) * 0.5f), FVector(FMath::Abs(X1 - X0), FMath::Abs(Y1 - Y0), FMath::Abs(Z1 - Z0)), Tint);
}

const FPTBlock* APTCity::GetBlock(int32 BX, int32 BY) const
{
	return Blocks.FindByPredicate([BX, BY](const FPTBlock& B) { return B.BX == BX && B.BY == BY; });
}

FIntPoint APTCity::NearestIntersection(const FVector& P) const
{
	return FIntPoint(FMath::Clamp(FMath::RoundToInt((P.X + HALF) / CELL), 0, GRID), FMath::Clamp(FMath::RoundToInt((P.Y + HALF) / CELL), 0, GRID));
}

TCHAR APTCity::Signal(bool bAxisX) const
{
	const float T = FMath::Fmod(SignalTime, 30.f);
	if (bAxisX) return T < 12.f ? 'g' : T < 15.f ? 'y' : 'r';
	return T < 15.f ? 'r' : T < 27.f ? 'g' : 'y';
}

void APTCity::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	SignalTime += DeltaSeconds;
	const FString Phase = FString::Printf(TEXT("%c%c"), Signal(true), Signal(false));
	if (Phase == LastPhase || !Lenses) return;
	LastPhase = Phase;
	const FLinearColor Off(0.02f, 0.02f, 0.02f);
	const FLinearColor On[3] = { FLinearColor(1.f, 0.05f, 0.02f), FLinearColor(1.f, 0.55f, 0.02f), FLinearColor(0.05f, 1.f, 0.35f) };
	for (const FSignalRef& S : SignalRefs)
	{
		const TCHAR St = Signal(S.bAxisX);
		for (int32 K = 0; K < 3; ++K)
		{
			const bool bOn = (K == 0 && St == 'r') || (K == 1 && St == 'y') || (K == 2 && St == 'g');
			const FLinearColor C = bOn ? On[K] : Off;
			Lenses->SetCustomDataValue(S.Lens[K], 0, C.R);
			Lenses->SetCustomDataValue(S.Lens[K], 1, C.G);
			Lenses->SetCustomDataValue(S.Lens[K], 2, C.B, K == 2);
		}
	}
	Lenses->MarkRenderStateDirty();
}

void APTCity::Sign(const FString& Text, const FVector& Loc, float Yaw, float Width, const FLinearColor& Bg)
{
	UMaterialInstanceDynamic* M = PTMat::Make(this, EPTSurf::Paint, Bg);
	PTMat::AddPart(this, RootComponent, PTMat::Cube(), M, Loc - FRotator(0, Yaw, 0).RotateVector(FVector(0, 6, 0)), FVector(Width, 10.f, 170.f), FRotator(0, Yaw, 0));
	UTextRenderComponent* T = NewObject<UTextRenderComponent>(this);
	T->SetText(FText::FromString(Text));
	T->SetHorizontalAlignment(EHTA_Center);
	T->SetVerticalAlignment(EVRTA_TextCenter);
	T->SetWorldSize(110.f);
	T->SetTextRenderColor(FColor::White);
	T->SetupAttachment(RootComponent);
	// text renders toward its local +X; the sign faces the block's open side (+Y for Yaw 0)
	T->SetRelativeLocation(Loc + FRotator(0, Yaw, 0).RotateVector(FVector(0, 1, 0)));
	T->SetRelativeRotation(FRotator(0.f, Yaw + 90.f, 0.f));
	T->RegisterComponent();
	AddInstanceComponent(T);
}

void APTCity::Windows(float X0, float Y0, float X1, float Y1, float H, bool bShops, bool bNoUpper, const FLinearColor& Frame)
{
	UInstancedStaticMeshComponent* Glass = ISM(TEXT("Glass"), PTMat::Cube(), EPTSurf::Glass, false, false, false);
	UInstancedStaticMeshComponent* Shop = ISM(TEXT("ShopGlass"), PTMat::Cube(), EPTSurf::ShopGlass, false, false, false);
	UInstancedStaticMeshComponent* Frames = ISM(TEXT("Frames"), PTMat::Cube(), EPTSurf::Paint, false, false, false);
	UInstancedStaticMeshComponent* Sills = ISM(TEXT("Sills"), PTMat::Cube(), EPTSurf::Concrete, false, false, false);
	UInstancedStaticMeshComponent* Awnings = ISM(TEXT("Awnings"), PTMat::Cube(), EPTSurf::Paint, false, true, false);

	struct FFace { bool bAlongX; float A, B, F, NX, NY; };
	const FFace Faces[4] = {
		{ true, X0, X1, Y1, 0, 1 }, { true, X0, X1, Y0, 0, -1 },
		{ false, Y0, Y1, X1, 1, 0 }, { false, Y0, Y1, X0, -1, 0 } };

	for (const FFace& F : Faces)
	{
		const float Len = F.B - F.A;
		auto At = [&F](float S, float Z, float Out) { return F.bAlongX ? FVector(S, F.F + F.NY * Out, Z) : FVector(F.F + F.NX * Out, S, Z); };
		auto Sz = [&F](float W, float Hh, float D) { return F.bAlongX ? FVector(W, D, Hh) : FVector(D, W, Hh); };
		if (bShops)
		{
			const int32 N = FMath::Max(1, FMath::FloorToInt((Len - 100.f) / 440.f));
			for (int32 I = 0; I < N; ++I)
			{
				const float S = F.A + (I + 0.5f) * (Len / N);
				Add(Frames, At(S, 175.f, 2.f), Sz(370.f, 300.f, 4.f), FLinearColor(0.03f, 0.03f, 0.03f));
				Add(Shop, At(S, 170.f, 4.f), Sz(340.f, 260.f, 4.f));
				if (Rand.FRand() < 0.55f)
				{
					Add(Awnings, At(S, 345.f, 75.f), Sz(380.f, 12.f, 150.f), AWNING[Rand.RandRange(0, 4)]);
				}
			}
		}
		if (bNoUpper) continue;
		const int32 Cols = FMath::Max(1, FMath::FloorToInt((Len - 120.f) / 290.f));
		for (float Z = bShops ? 520.f : 190.f; Z < H - 130.f; Z += 330.f)
		{
			for (int32 I = 0; I < Cols; ++I)
			{
				const float S = F.A + (I + 0.5f) * (Len / Cols);
				Add(Frames, At(S, Z, 2.f), Sz(155.f, 195.f, 4.f), Frame);
				const float Lit = Rand.FRand();
				Add(Glass, At(S, Z + 2.f, 4.f), Sz(130.f, 170.f, 4.f), Lit > 0.93f ? FLinearColor(2.5f, 2.f, 1.2f) : FLinearColor(1, 1, 1));
				Add(Sills, At(S, Z - 97.f, 8.f), Sz(170.f, 8.f, 16.f));
			}
		}
	}
}

void APTCity::Building(float X0, float Y0, float X1, float Y1, float H, EPTSurf Style, bool bShops, bool bNoUpper)
{
	const FString Key = FString::Printf(TEXT("Walls_%d"), static_cast<int32>(Style));
	UInstancedStaticMeshComponent* Walls = ISM(Key, PTMat::Cube(), Style, true, true);
	UInstancedStaticMeshComponent* Roof = ISM(TEXT("Roof"), PTMat::Cube(), EPTSurf::Roof, true, true);
	UInstancedStaticMeshComponent* Trim = ISM(TEXT("Trim"), PTMat::Cube(), EPTSurf::Concrete, true, true);
	FLinearColor Tint = FLinearColor::White;
	if (Style == EPTSurf::Plaster) Tint = PLASTER[Rand.RandRange(0, 7)];
	else if (Style == EPTSurf::Brick) Tint = BRICK[Rand.RandRange(0, 2)];
	else if (Style == EPTSurf::Panels) Tint = PANEL[Rand.RandRange(0, 2)];

	Box(Walls, X0, Y0, 0.f, X1, Y1, H, Tint);
	Box(Roof, X0 - 25.f, Y0 - 25.f, H, X1 + 25.f, Y1 + 25.f, H + 80.f, Tint * 0.8f);
	if (bShops) Box(Trim, X0 - 6.f, Y0 - 6.f, 330.f, X1 + 6.f, Y1 + 6.f, 360.f, FLinearColor(0.08f, 0.08f, 0.08f));
	if (Style != EPTSurf::Curtain)
	{
		const FLinearColor Frame = Style == EPTSurf::Brick || Rand.FRand() < 0.5f ? FLinearColor(0.85f, 0.83f, 0.78f) : FLinearColor(0.05f, 0.05f, 0.05f);
		Windows(X0, Y0, X1, Y1, H, bShops, bNoUpper, Frame);
	}
	else if (bShops)
	{
		Windows(X0, Y0, X1, Y1, H, true, true, FLinearColor::Black);
	}
	// rooftop units
	UInstancedStaticMeshComponent* AC = ISM(TEXT("AC"), PTMat::Cube(), EPTSurf::Metal, false, true);
	const int32 N = Rand.RandRange(0, 2);
	for (int32 K = 0; K < N; ++K)
	{
		Add(AC, FVector(FMath::Lerp(X0 + 200.f, X1 - 200.f, Rand.FRand()), FMath::Lerp(Y0 + 200.f, Y1 - 200.f, Rand.FRand()), H + 140.f),
			FVector(200.f + Rand.FRand() * 200.f, 160.f + Rand.FRand() * 100.f, 120.f));
	}
}

void APTCity::Tree(float X, float Y, float S, bool bCollide)
{
	UInstancedStaticMeshComponent* Trunks = ISM(bCollide ? TEXT("Trunks") : TEXT("TrunksFar"), PTMat::Cylinder(), EPTSurf::Wood, bCollide, true);
	UInstancedStaticMeshComponent* Crowns = ISM(TEXT("Crowns"), PTMat::Sphere(), EPTSurf::Leaves, false, true);
	const float Yaw = Rand.FRand() * 360.f;
	Add(Trunks, FVector(X, Y, 20.f + 190.f * S), FVector(30.f * S, 30.f * S, 380.f * S), FLinearColor(0.35f, 0.27f, 0.2f));
	const FLinearColor Leaf = FLinearColor::MakeFromHSV8(static_cast<uint8>(55 + Rand.RandRange(0, 20)), 150, 200);
	const FVector Off[4] = { FVector(0, 0, 430), FVector(90, 40, 380), FVector(-80, -30, 395), FVector(15, -60, 520) };
	const float R[4] = { 340.f, 250.f, 270.f, 220.f };
	for (int32 K = 0; K < 4; ++K)
	{
		const FVector P = FRotator(0, Yaw, 0).RotateVector(Off[K]) * S;
		Add(Crowns, FVector(X, Y, 20.f) + P, FVector(R[K], R[K], R[K] * 0.85f) * S, Leaf);
	}
}

void APTCity::Lamp(float X, float Y, float Yaw)
{
	UInstancedStaticMeshComponent* Poles = ISM(TEXT("LampPoles"), PTMat::Cylinder(), EPTSurf::Metal, true, true);
	UInstancedStaticMeshComponent* Arms = ISM(TEXT("LampArms"), PTMat::Cube(), EPTSurf::Metal, false, true);
	const FVector Dir = FRotator(0, Yaw, 0).Vector();
	Add(Poles, FVector(X, Y, 400.f), FVector(20.f, 20.f, 760.f), FLinearColor(0.3f, 0.32f, 0.34f));
	Add(Arms, FVector(X, Y, 765.f) + Dir * 115.f, FVector(230.f, 10.f, 10.f), FLinearColor(0.3f, 0.32f, 0.34f), Yaw);
	Add(Arms, FVector(X, Y, 762.f) + Dir * 235.f, FVector(70.f, 32.f, 18.f), FLinearColor(0.3f, 0.32f, 0.34f), Yaw);
}

void APTCity::Roads()
{
	UStaticMeshComponent* Ground = PTMat::AddPart(this, RootComponent, PTMat::Plane(), PTMat::Make(this, EPTSurf::Grass), FVector(0, 0, -4.f), FVector(240000.f, 240000.f, 100.f), FRotator::ZeroRotator, true, false);
	Ground->SetMobility(EComponentMobility::Static);
	const float Lim = HALF + ROAD * 0.5f;
	UStaticMeshComponent* Asphalt = PTMat::AddPart(this, RootComponent, PTMat::Cube(), PTMat::Make(this, EPTSurf::Asphalt), FVector(0, 0, -5.f), FVector(Lim * 2.f, Lim * 2.f, 10.f), FRotator::ZeroRotator, true, false);
	Asphalt->SetMobility(EComponentMobility::Static);

	UInstancedStaticMeshComponent* Paint = ISM(TEXT("Paint"), PTMat::Cube(), EPTSurf::Paint, false, false, false);
	const FLinearColor Yellow(0.7f, 0.42f, 0.02f), White(0.75f, 0.75f, 0.75f);
	for (int32 I = 0; I <= GRID; ++I)
	{
		const float R = RoadPos(I);
		for (int32 J = 0; J < GRID; ++J)
		{
			const float A = RoadPos(J) + ROAD * 0.5f + 300.f, B = RoadPos(J + 1) - ROAD * 0.5f - 300.f;
			// double yellow centre + white edge lines, both directions
			Box(Paint, A, R - 22.f, 0.f, B, R - 10.f, 1.5f, Yellow);
			Box(Paint, A, R + 10.f, 0.f, B, R + 22.f, 1.5f, Yellow);
			Box(Paint, R - 22.f, A, 0.f, R - 10.f, B, 1.5f, Yellow);
			Box(Paint, R + 10.f, A, 0.f, R + 22.f, B, 1.5f, Yellow);
			Box(Paint, A, R - 610.f, 0.f, B, R - 595.f, 1.5f, White);
			Box(Paint, A, R + 595.f, 0.f, B, R + 610.f, 1.5f, White);
			Box(Paint, R - 610.f, A, 0.f, R - 595.f, B, 1.5f, White);
			Box(Paint, R + 595.f, A, 0.f, R + 610.f, B, 1.5f, White);
		}
	}
	// zebra crossings at every intersection approach
	for (int32 I = 0; I <= GRID; ++I) for (int32 J = 0; J <= GRID; ++J)
	{
		const float X = RoadPos(I), Y = RoadPos(J), H = ROAD * 0.5f;
		for (float K = -600.f; K <= 600.f; K += 120.f)
		{
			if (J > 0) Box(Paint, X + K - 25.f, Y - H - 300.f, 0.f, X + K + 25.f, Y - H - 40.f, 1.5f, White);
			if (J < GRID) Box(Paint, X + K - 25.f, Y + H + 40.f, 0.f, X + K + 25.f, Y + H + 300.f, 1.5f, White);
			if (I > 0) Box(Paint, X - H - 300.f, Y + K - 25.f, 0.f, X - H - 40.f, Y + K + 25.f, 1.5f, White);
			if (I < GRID) Box(Paint, X + H + 40.f, Y + K - 25.f, 0.f, X + H + 300.f, Y + K + 25.f, 1.5f, White);
		}
	}
}

void APTCity::Signals()
{
	UInstancedStaticMeshComponent* Poles = ISM(TEXT("SignalPoles"), PTMat::Cylinder(), EPTSurf::Metal, true, true);
	UInstancedStaticMeshComponent* Arms = ISM(TEXT("SignalArms"), PTMat::Cube(), EPTSurf::Metal, false, true);
	Lenses = ISM(TEXT("Lenses"), PTMat::Sphere(), EPTSurf::Emissive, false, false, false);
	PTMat::SetEmissive(Cast<UMaterialInstanceDynamic>(Lenses->GetMaterial(0)), FLinearColor::White, 40.f);
	const FLinearColor Green(0.08f, 0.12f, 0.08f);
	const FIntPoint Dirs[4] = { FIntPoint(1, 0), FIntPoint(-1, 0), FIntPoint(0, 1), FIntPoint(0, -1) };
	for (int32 I = 1; I < GRID; ++I) for (int32 J = 1; J < GRID; ++J)
	{
		for (const FIntPoint& D : Dirs)
		{
			// pole on the approaching driver's near-right corner, arm reaching over the lane
			const FVector2D Dv(D.X, D.Y), Right(-D.Y, D.X);
			const float Off = ROAD * 0.5f + 100.f;
			const FVector2D P = FVector2D(RoadPos(I), RoadPos(J)) - Dv * Off + Right * Off;
			const FVector Pole(P.X, P.Y, 0.f);
			const FVector ArmDir(-Right.X, -Right.Y, 0.f);
			const float ArmYaw = FMath::RadiansToDegrees(FMath::Atan2(ArmDir.Y, ArmDir.X));
			Add(Poles, Pole + FVector(0, 0, 330.f), FVector(26.f, 26.f, 620.f), Green);
			Add(Arms, Pole + ArmDir * 240.f + FVector(0, 0, 600.f), FVector(480.f, 14.f, 14.f), Green, ArmYaw);
			const FVector Housing = Pole + ArmDir * 450.f + FVector(0, 0, 545.f);
			Add(Arms, Housing, FVector(32.f, 42.f, 112.f), Green, ArmYaw);
			FSignalRef Ref;
			Ref.bAxisX = D.X != 0;
			const FVector Face = FVector(-Dv.X, -Dv.Y, 0.f) * 17.f; // lenses face the approaching driver
			for (int32 K = 0; K < 3; ++K)
			{
				Ref.Lens[K] = Add(Lenses, Housing + Face + FVector(0, 0, 36.f - 36.f * K), FVector(24.f, 24.f, 24.f), FLinearColor(0.02f, 0.02f, 0.02f));
			}
			SignalRefs.Add(Ref);
		}
	}
}

void APTCity::Build()
{
	if (bBuilt) return;
	bBuilt = true;

	Roads();
	UInstancedStaticMeshComponent* Walk = ISM(TEXT("Walk"), PTMat::Cube(), EPTSurf::Concrete, true, false);
	UInstancedStaticMeshComponent* Curb = ISM(TEXT("Curb"), PTMat::Cube(), EPTSurf::Concrete, true, false);
	UInstancedStaticMeshComponent* GrassB = ISM(TEXT("GrassBeds"), PTMat::Cube(), EPTSurf::Grass, true, false);
	UInstancedStaticMeshComponent* Lot = ISM(TEXT("LotAsphalt"), PTMat::Cube(), EPTSurf::Asphalt, true, false);
	UInstancedStaticMeshComponent* Paint = ISM(TEXT("Paint"), PTMat::Cube(), EPTSurf::Paint, false, false, false);
	UInstancedStaticMeshComponent* Trim = ISM(TEXT("Trim"), PTMat::Cube(), EPTSurf::Concrete, true, true);

	const float SW = SIDEWALK;
	for (int32 BX = 0; BX < GRID; ++BX) for (int32 BY = 0; BY < GRID; ++BY)
	{
		FPTBlock Blk;
		Blk.BX = BX; Blk.BY = BY;
		const float MinX = RoadPos(BX) + ROAD * 0.5f, MaxX = RoadPos(BX + 1) - ROAD * 0.5f;
		const float MinY = RoadPos(BY) + ROAD * 0.5f, MaxY = RoadPos(BY + 1) - ROAD * 0.5f;
		Blk.Rect = FBox2D(FVector2D(MinX, MinY), FVector2D(MaxX, MaxY));
		Blk.Center = Blk.Rect.GetCenter();
		bool bSpecial = false;
		Blk.Type = SpecialType(BX, BY, bSpecial);
		if (!bSpecial && Rand.FRand() < 0.1f) Blk.Type = EPTBlockType::Greens;
		Blocks.Add(Blk);
		const float CX = Blk.Center.X, CY = Blk.Center.Y;

		// sidewalk slab + granite curbs
		Box(Walk, MinX + 30.f, MinY + 30.f, 0.f, MaxX - 30.f, MaxY - 30.f, 20.f);
		const FLinearColor CurbC(0.62f, 0.61f, 0.58f);
		Box(Curb, MinX, MinY, 0.f, MaxX, MinY + 30.f, 19.f, CurbC);
		Box(Curb, MinX, MaxY - 30.f, 0.f, MaxX, MaxY, 19.f, CurbC);
		Box(Curb, MinX, MinY + 30.f, 0.f, MinX + 30.f, MaxY - 30.f, 19.f, CurbC);
		Box(Curb, MaxX - 30.f, MinY + 30.f, 0.f, MaxX, MaxY - 30.f, 19.f, CurbC);

		Lamp(MinX + 90.f, CY, 180.f); Lamp(MaxX - 90.f, CY, 0.f);
		Lamp(CX, MinY + 90.f, -90.f); Lamp(CX, MaxY - 90.f, 90.f);

		const float IX0 = MinX + SW + 100.f, IX1 = MaxX - SW - 100.f, IY0 = MinY + SW + 100.f, IY1 = MaxY - SW - 100.f;

		switch (Blk.Type)
		{
		case EPTBlockType::Downtown:
		{
			const bool bCentral = FMath::Max(FMath::Abs(BX - 2.5f), FMath::Abs(BY - 2.5f)) < 1.5f;
			const float MX = FMath::Lerp(IX0, IX1, 0.35f + Rand.FRand() * 0.3f), MY = FMath::Lerp(IY0, IY1, 0.35f + Rand.FRand() * 0.3f), Gap = 150.f;
			TArray<FBox2D> Lots;
			const float P = Rand.FRand();
			auto L = [&Lots](float A, float B, float C, float D) { Lots.Add(FBox2D(FVector2D(A, B), FVector2D(C, D))); };
			if (P < 0.4f) { L(IX0, IY0, MX - Gap, MY - Gap); L(MX + Gap, IY0, IX1, MY - Gap); L(IX0, MY + Gap, MX - Gap, IY1); L(MX + Gap, MY + Gap, IX1, IY1); }
			else if (P < 0.65f) { L(IX0, IY0, MX - Gap, IY1); L(MX + Gap, IY0, IX1, IY1); }
			else if (P < 0.85f) { L(IX0, IY0, IX1, MY - Gap); L(IX0, MY + Gap, MX - Gap, IY1); L(MX + Gap, MY + Gap, IX1, IY1); }
			else { L(IX0 + 300.f, IY0 + 300.f, IX1 - 300.f, IY1 - 300.f); }
			for (const FBox2D& Lt : Lots)
			{
				const FVector2D S = Lt.GetSize();
				const bool bTall = bCentral && S.X * S.Y > 5000000.f && Rand.FRand() < 0.7f;
				const float H = bTall ? 4000.f + Rand.RandRange(0, 8) * 330.f : 1060.f + Rand.RandRange(0, bCentral ? 7 : 4) * 330.f;
				const float R = Rand.FRand();
				const EPTSurf Style = bTall ? EPTSurf::Curtain : R < 0.42f ? EPTSurf::Brick : R < 0.75f ? EPTSurf::Plaster : EPTSurf::Panels;
				Building(Lt.Min.X, Lt.Min.Y, Lt.Max.X, Lt.Max.Y, H, Style, true);
			}
			for (float S = MinX + 900.f; S < MaxX - 800.f; S += 1200.f)
			{
				if (Rand.FRand() < 0.65f) Tree(S, MinY + 200.f, 0.75f + Rand.FRand() * 0.2f);
				if (Rand.FRand() < 0.65f) Tree(S, MaxY - 200.f, 0.75f + Rand.FRand() * 0.2f);
			}
			break;
		}
		case EPTBlockType::Greens:
		case EPTBlockType::Park:
		{
			Box(GrassB, MinX + SW, MinY + SW, 0.f, MaxX - SW, MaxY - SW, 21.f);
			Box(Walk, CX - 160.f, MinY + SW, 0.f, CX + 160.f, MaxY - SW, 22.f, FLinearColor(0.9f, 0.88f, 0.84f));
			Box(Walk, MinX + SW, CY - 160.f, 0.f, MaxX - SW, CY + 160.f, 22.f, FLinearColor(0.9f, 0.88f, 0.84f));
			for (float S = IX0 + 200.f; S <= IX1 - 200.f; S += 700.f)
			{
				Tree(S, IY0 + 100.f, 0.95f + Rand.FRand() * 0.3f);
				if (Blk.Type == EPTBlockType::Greens || FMath::Abs(S - CX) > 800.f) Tree(S, IY1 - 100.f, 0.95f + Rand.FRand() * 0.3f);
			}
			for (float S = IY0 + 800.f; S <= IY1 - 800.f; S += 700.f) { Tree(IX0 + 100.f, S, 1.f); Tree(IX1 - 100.f, S, 1.f); }
			break;
		}
		case EPTBlockType::HQ:
		{
			Building(IX0 + 200.f, IY0, IX1 - 200.f, IY0 + 1800.f, 1660.f, EPTSurf::Panels, false);
			Box(Trim, IX0 + 200.f, IY0 + 1800.f, 0.f, IX1 - 200.f, IY0 + 1830.f, 120.f, FLinearColor(0.02f, 0.06f, 0.18f));
			Box(Trim, CX - 500.f, IY0 + 1800.f, 340.f, CX + 500.f, IY0 + 2100.f, 370.f, FLinearColor(0.05f, 0.05f, 0.06f));
			Sign(TEXT("PRECINCT 12  *  POLICE"), FVector(CX, IY0 + 1812.f, 1420.f), 0.f, 1500.f, FLinearColor(0.02f, 0.05f, 0.16f));
			for (int32 K = -3; K <= 3; ++K) Box(Paint, CX + K * 400.f - 7.f, IY0 + 2200.f, 20.f, CX + K * 400.f + 7.f, IY0 + 2800.f, 22.f, FLinearColor(0.8f, 0.8f, 0.8f));
			ParkedSpots.Add(FTransform(FRotator(0, -90.f, 0), FVector(CX - 1000.f, IY0 + 2500.f, 20.f)));
			ParkedSpots.Add(FTransform(FRotator(0, -90.f, 0), FVector(CX - 200.f, IY0 + 2500.f, 20.f)));
			ParkedSpots.Add(FTransform(FRotator(0, -90.f, 0), FVector(CX + 600.f, IY0 + 2500.f, 20.f)));
			break;
		}
		case EPTBlockType::Store:
		{
			Building(CX - 1800.f, MinY + 400.f, CX + 1800.f, MinY + 1400.f, 600.f, EPTSurf::Plaster, true, true);
			Add(ISM(TEXT("Awnings"), PTMat::Cube(), EPTSurf::Paint, false, true, false), FVector(CX, MinY + 1550.f, 350.f), FVector(3600.f, 300.f, 15.f), FLinearColor(0.3f, 0.02f, 0.02f));
			Sign(TEXT("QUIK-STOP MARKET"), FVector(CX, MinY + 1412.f, 490.f), 0.f, 1400.f, FLinearColor(0.35f, 0.03f, 0.02f));
			Building(IX0, IY0, CX - 1900.f, MinY + 1600.f, 2320.f, EPTSurf::Brick, false);
			Building(CX + 1900.f, IY0, IX1, MinY + 1600.f, 1990.f, EPTSurf::Plaster, false);
			break;
		}
		case EPTBlockType::Apartments:
		{
			Box(GrassB, MinX + SW, MinY + SW, 0.f, MaxX - SW, MaxY - SW, 21.f);
			Building(IX0, IY0, IX1, MinY + 1800.f, 1760.f, EPTSurf::Brick, false);
			Sign(TEXT("ELM ST. APARTMENTS"), FVector(CX + 600.f, MinY + 1812.f, 390.f), 0.f, 900.f, FLinearColor(0.12f, 0.05f, 0.03f));
			Box(Walk, CX - 200.f, MinY + 1800.f, 0.f, CX + 200.f, MaxY - SW, 22.f, FLinearColor(0.9f, 0.88f, 0.84f));
			break;
		}
		case EPTBlockType::Lot:
		{
			Box(Lot, MinX + SW, MinY + SW, 0.f, MaxX - SW, MaxY - SW, 21.f);
			for (int32 K = -5; K <= 5; ++K)
			{
				Box(Paint, CX + K * 400.f - 7.f, IY0, 21.f, CX + K * 400.f + 7.f, IY0 + 600.f, 22.5f, FLinearColor(0.8f, 0.8f, 0.8f));
				Box(Paint, CX + K * 400.f - 7.f, CY - 400.f, 21.f, CX + K * 400.f + 7.f, CY + 200.f, 22.5f, FLinearColor(0.8f, 0.8f, 0.8f));
			}
			Building(IX0, MinY + 100.f, IX1, MinY + 400.f, 900.f, EPTSurf::Plaster, true, true);
			Sign(TEXT("LUCANO'S  -  VALET"), FVector(CX, MinY + 412.f, 640.f), 0.f, 1000.f, FLinearColor(0.04f, 0.06f, 0.09f));
			break;
		}
		case EPTBlockType::Warehouse:
		{
			Building(IX0, IY0, IX1, MinY + 1600.f, 1100.f, EPTSurf::Metal, false, true);
			Box(Trim, CX - 400.f, MinY + 1600.f, 0.f, CX + 400.f, MinY + 1615.f, 600.f, FLinearColor(0.2f, 0.24f, 0.25f));
			Sign(TEXT("DOCKSIDE STORAGE"), FVector(CX, MinY + 1625.f, 820.f), 0.f, 1200.f, FLinearColor(0.03f, 0.06f, 0.1f));
			UInstancedStaticMeshComponent* Cont = ISM(TEXT("Containers"), PTMat::Cube(), EPTSurf::Metal, true, true);
			Add(Cont, FVector(IX0 + 150.f, CY + 400.f, 150.f), FVector(260.f, 620.f, 260.f), FLinearColor(0.5f, 0.08f, 0.05f));
			Add(Cont, FVector(IX1 - 150.f, CY + 400.f, 150.f), FVector(260.f, 620.f, 260.f), FLinearColor(0.08f, 0.2f, 0.45f));
			break;
		}
		}
	}

	// curbside parked cars (not next to crime-scene blocks)
	for (int32 I = 0; I <= GRID && ParkedSpots.Num() < 30; ++I) for (int32 J = 0; J < GRID; ++J)
	{
		if (Rand.FRand() > 0.32f) continue;
		const float Along = FMath::Lerp(RoadPos(J) + 1600.f, RoadPos(J + 1) - 1600.f, Rand.FRand());
		const float Side = Rand.FRand() < 0.5f ? 1.f : -1.f;
		const bool bHoriz = Rand.FRand() < 0.5f;
		const FVector P = bHoriz ? FVector(Along, RoadPos(I) + Side * 560.f, 0.f) : FVector(RoadPos(I) + Side * 560.f, Along, 0.f);
		const int32 BX = FMath::FloorToInt((P.X + HALF) / CELL), BY = FMath::FloorToInt((P.Y + HALF) / CELL);
		bool bSpecial = false;
		SpecialType(BX, BY, bSpecial);
		if (bSpecial) continue;
		// right-hand traffic: parked facing the direction of their lane
		const float Yaw = bHoriz ? (Side > 0 ? 0.f : 180.f) : (Side > 0 ? -90.f : 90.f);
		ParkedSpots.Add(FTransform(FRotator(0, Yaw, 0), P));
	}

	// city edge: low wall + forest
	const float Edge = HALF + ROAD * 0.5f + 150.f;
	Box(Trim, -Edge - 100.f, -Edge - 100.f, 0.f, Edge + 100.f, -Edge, 90.f);
	Box(Trim, -Edge - 100.f, Edge, 0.f, Edge + 100.f, Edge + 100.f, 90.f);
	Box(Trim, -Edge - 100.f, -Edge, 0.f, -Edge, Edge, 90.f);
	Box(Trim, Edge, -Edge, 0.f, Edge + 100.f, Edge, 90.f);
	UInstancedStaticMeshComponent* Wall = ISM(TEXT("InvisibleWall"), PTMat::Cube(), EPTSurf::Concrete, true, false, false);
	Wall->SetVisibility(false);
	Box(Wall, -Edge - 200.f, -Edge - 200.f, 0.f, Edge + 200.f, -Edge, 600.f);
	Box(Wall, -Edge - 200.f, Edge, 0.f, Edge + 200.f, Edge + 200.f, 600.f);
	Box(Wall, -Edge - 200.f, -Edge, 0.f, -Edge, Edge, 600.f);
	Box(Wall, Edge, -Edge, 0.f, Edge + 200.f, Edge, 600.f);
	for (int32 K = 0; K < 160; ++K)
	{
		const float A = Rand.FRand() * PI * 2.f, D = Edge + 700.f + Rand.FRand() * 6000.f;
		const float X = FMath::Clamp(FMath::Cos(A) * 1.5f, -1.f, 1.f) * D, Y = FMath::Clamp(FMath::Sin(A) * 1.5f, -1.f, 1.f) * D;
		Tree(X, Y, 1.2f + Rand.FRand() * 0.8f, false);
	}

	Signals();
}
