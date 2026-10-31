#include "PTProp.h"
#include "PTMaterials.h"
#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Materials/MaterialInstanceDynamic.h"

namespace
{
	FLinearColor C(uint32 Hex) { return FLinearColor(FColor((Hex >> 16) & 255, (Hex >> 8) & 255, Hex & 255)); }
}

APTProp::APTProp()
{
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
}

bool APTProp::Build(const FString& Type, const FLinearColor& Color, FVector& OutHalf)
{
	// All coordinates below are the browser model's (metres, x right, y up, z forward):
	// mapped to Unreal local (X = x, Y = z, Z = y) in cm.
	auto Box = [this](EPTSurf S, uint32 Hex, float W, float H, float D, float X, float Y, float Z, const FRotator& R = FRotator::ZeroRotator) {
		return PTMat::AddPart(this, RootComponent, PTMat::Cube(), PTMat::Make(this, S, C(Hex)), FVector(X, Z, Y) * 100.f, FVector(W, D, H) * 100.f, R);
	};
	auto Cyl = [this](EPTSurf S, uint32 Hex, float Rad, float H, float X, float Y, float Z, const FRotator& R = FRotator::ZeroRotator) {
		return PTMat::AddPart(this, RootComponent, PTMat::Cylinder(), PTMat::Make(this, S, C(Hex)), FVector(X, Z, Y) * 100.f, FVector(Rad * 2.f, Rad * 2.f, H) * 100.f, R);
	};
	auto Glow = [this](uint32 Hex, float Strength, float W, float H, float D, float X, float Y, float Z) {
		UMaterialInstanceDynamic* M = PTMat::Make(this, EPTSurf::Emissive, C(Hex));
		PTMat::SetEmissive(M, C(Hex), Strength);
		return PTMat::AddPart(this, RootComponent, PTMat::Cube(), M, FVector(X, Z, Y) * 100.f, FVector(W, D, H) * 100.f);
	};
	const EPTSurf Wd = EPTSurf::Wood, Pl = EPTSurf::Plastic, Mt = EPTSurf::Metal, Pt = EPTSurf::Paint, Gl = EPTSurf::Glass;
	FVector Col = FVector::ZeroVector;	// collision size (w, d, h) metres

	if (Type == TEXT("crate")) { Box(Wd, 0xb5803f, 1.6f, 1.4f, 1.6f, 0, 0.7f, 0); Box(Wd, 0x8a5a2b, 1.64f, 0.14f, 1.64f, 0, 1.1f, 0); Box(Wd, 0x8a5a2b, 1.64f, 0.14f, 1.64f, 0, 0.3f, 0); Col = FVector(1.6f, 1.6f, 1.4f); }
	else if (Type == TEXT("crates")) { Box(Wd, 0xb5803f, 1.6f, 1.4f, 1.6f, -0.85f, 0.7f, 0); Box(Wd, 0xa87436, 1.6f, 1.4f, 1.6f, 0.85f, 0.7f, 0); Box(Wd, 0xc08a48, 1.5f, 1.2f, 1.5f, 0, 2.0f, 0); Col = FVector(3.3f, 1.6f, 2.6f); }
	else if (Type == TEXT("barrel")) { Cyl(Mt, 0x2e6da4, 0.45f, 1.1f, 0, 0.55f, 0); Col = FVector(0.9f, 0.9f, 1.1f); }
	else if (Type == TEXT("bench")) { Box(Wd, 0x8b5a2b, 2.2f, 0.1f, 0.6f, 0, 0.5f, 0); Box(Wd, 0x8b5a2b, 2.2f, 0.5f, 0.1f, 0, 0.8f, -0.28f); Box(Mt, 0x333333, 0.1f, 0.5f, 0.5f, -0.95f, 0.25f, 0); Box(Mt, 0x333333, 0.1f, 0.5f, 0.5f, 0.95f, 0.25f, 0); Col = FVector(2.2f, 0.7f, 1.f); }
	else if (Type == TEXT("counter")) { Box(Pt, 0xd9d2c5, 6.f, 1.1f, 1.2f, 0, 0.55f, 0); Box(Wd, 0x7a4f2b, 6.1f, 0.08f, 1.3f, 0, 1.12f, 0); Col = FVector(6.f, 1.2f, 1.2f); }
	else if (Type == TEXT("register")) { Box(Pl, 0x333333, 0.6f, 0.3f, 0.5f, 0, 1.3f, 0); Box(Mt, 0x777777, 0.5f, 0.12f, 0.45f, 0, 1.2f, 0.3f); Glow(0x22aa55, 4.f, 0.3f, 0.25f, 0.05f, 0, 1.55f, -0.1f); }
	else if (Type == TEXT("door")) { Box(Mt, 0x555555, 0.15f, 2.4f, 0.15f, -0.7f, 1.2f, 0); Box(Mt, 0x555555, 0.15f, 2.4f, 0.15f, 0.7f, 1.2f, 0); Box(Mt, 0x555555, 1.55f, 0.15f, 0.15f, 0, 2.4f, 0); Box(Gl, 0x88aacc, 1.25f, 2.2f, 0.05f, 0, 1.1f, 0); }
	else if (Type == TEXT("scarf")) { Box(EPTSurf::Cloth, 0xc0392b, 0.25f, 0.04f, 0.12f, 0, 1.1f, 0.05f); }
	else if (Type == TEXT("paper")) { Box(Pt, 0xf5f5dc, 0.25f, 0.02f, 0.35f, 0, 0.03f, 0); }
	else if (Type == TEXT("flyer")) { Box(Pt, 0x7ed957, 0.35f, 0.02f, 0.45f, 0, 0.03f, 0); }
	else if (Type == TEXT("footprints")) { for (int32 I = 0; I < 6; ++I) Box(Pt, 0x3b2a1a, 0.14f, 0.01f, 0.3f, I % 2 ? 0.18f : -0.18f, 0.01f, I * 0.7f - 1.7f); }
	else if (Type == TEXT("drips")) { for (int32 I = 0; I < 7; ++I) Glow(0x39ff14, 1.f, 0.12f, 0.01f, 0.12f, FMath::Sin(static_cast<float>(I)) * 0.4f, 0.01f, I * 0.8f - 2.4f); }
	else if (Type == TEXT("spraycan")) { Cyl(Pt, 0x39ff14, 0.07f, 0.25f, 0, 0.07f, 0, FRotator(0, 0, 70.f)); }
	else if (Type == TEXT("busstop"))
	{
		Box(Mt, 0x34495e, 4.5f, 0.1f, 1.6f, 0, 2.6f, 0); Box(Gl, 0x99bbdd, 4.5f, 2.5f, 0.08f, 0, 1.3f, -0.75f);
		Box(Mt, 0x444444, 0.1f, 2.6f, 0.1f, -2.2f, 1.3f, -0.75f); Box(Mt, 0x444444, 0.1f, 2.6f, 0.1f, 2.2f, 1.3f, -0.75f);
		Box(Wd, 0x8b5a2b, 3.5f, 0.1f, 0.5f, 0, 0.5f, -0.4f); Glow(0xf1c40f, 2.f, 0.6f, 1.6f, 0.1f, 2.6f, 1.6f, 0.3f);
		Col = FVector(4.5f, 0.3f, 2.6f);
		UBoxComponent* B = NewObject<UBoxComponent>(this);
		B->SetupAttachment(RootComponent);
		B->SetBoxExtent(FVector(225.f, 15.f, 130.f));
		B->SetRelativeLocation(FVector(0, -75.f, 130.f));
		B->SetCollisionProfileName(TEXT("BlockAll"));
		B->RegisterComponent();
		AddInstanceComponent(B);
		OutHalf = FVector(225.f, 15.f, 130.f);
		return true;
	}
	else if (Type == TEXT("dumpster")) { Box(Mt, 0x2e7d32, 3.f, 1.5f, 1.6f, 0, 0.75f, 0); Box(Pl, 0x1b5e20, 3.1f, 0.12f, 1.7f, 0, 1.56f, 0); Col = FVector(3.f, 1.6f, 1.6f); }
	else if (Type == TEXT("statue"))
	{
		Box(EPTSurf::Concrete, 0xbdb6a6, 3.f, 1.2f, 3.f, 0, 0.6f, 0); Box(EPTSurf::Concrete, 0xa59e8e, 2.2f, 0.4f, 2.2f, 0, 1.4f, 0);
		const uint32 St = 0x7f8c7a;
		Cyl(Mt, St, 0.22f, 1.3f, -0.18f, 2.25f, 0); Cyl(Mt, St, 0.22f, 1.3f, 0.18f, 2.25f, 0);
		Box(Mt, St, 0.85f, 1.0f, 0.5f, 0, 3.4f, 0); Box(Mt, St, 0.42f, 0.5f, 0.45f, 0, 4.15f, 0);
		Cyl(Mt, St, 0.1f, 0.95f, 0.55f, 3.9f, 0.25f, FRotator(-40.f, 0, 0)); Cyl(Mt, St, 0.1f, 0.9f, -0.55f, 3.2f, 0);
		Glow(0x39ff14, 2.f, 2.f, 0.5f, 0.05f, 0, 0.7f, 1.52f);	// graffiti tag
		UTextRenderComponent* T = NewObject<UTextRenderComponent>(this);
		T->SetText(FText::FromString(TEXT("NO TOWERS")));
		T->SetHorizontalAlignment(EHTA_Center); T->SetVerticalAlignment(EVRTA_TextCenter);
		T->SetWorldSize(32.f); T->SetTextRenderColor(FColor(20, 70, 10));
		T->SetupAttachment(RootComponent);
		T->SetRelativeLocation(FVector(0, 155.f, 70.f)); T->SetRelativeRotation(FRotator(0, 90.f, 0));
		T->RegisterComponent(); AddInstanceComponent(T);
		Col = FVector(3.f, 3.f, 4.f);
	}
	else if (Type == TEXT("easel")) { Box(Wd, 0x8b5a2b, 0.08f, 1.7f, 0.08f, -0.4f, 0.85f, 0); Box(Wd, 0x8b5a2b, 0.08f, 1.7f, 0.08f, 0.4f, 0.85f, 0); Box(Pt, 0xffffff, 1.f, 0.8f, 0.05f, 0, 1.3f, 0.05f); Box(Pt, 0x2255cc, 0.6f, 0.4f, 0.06f, 0, 1.3f, 0.06f); }
	else if (Type == TEXT("skateboard")) { Box(Pt, 0x39aa44, 0.25f, 0.05f, 0.8f, 0, 0.12f, 0); }
	else if (Type == TEXT("window")) { Box(Pt, 0xffffff, 2.2f, 0.15f, 0.3f, 0, 1.f, 0); Box(Pt, 0xffffff, 2.2f, 0.15f, 0.3f, 0, 2.4f, 0); Box(Pt, 0xffffff, 0.15f, 1.5f, 0.3f, -1.05f, 1.7f, 0); Box(Pt, 0xffffff, 0.15f, 1.5f, 0.3f, 1.05f, 1.7f, 0); Box(Gl, 0x88aacc, 1.f, 1.3f, 0.04f, -0.4f, 1.7f, 0.2f, FRotator(0, -40.f, 0)); }
	else if (Type == TEXT("glass") || Type == TEXT("chips"))
	{
		const bool bChips = Type == TEXT("chips");
		for (int32 I = 0; I < 9; ++I)
		{
			const float X = FMath::Sin(I * 2.1f) * 0.7f, Z = FMath::Cos(I * 1.7f) * 0.5f;
			if (bChips) Box(EPTSurf::CarPaint, 0x1f6fd1, 0.08f, 0.02f, 0.08f, X * 0.6f, 0.02f, Z * 0.6f);
			else Glow(0xcfe8ff, 0.5f, 0.18f, 0.02f, 0.1f, X, 0.02f, Z);
		}
	}
	else if (Type == TEXT("keys")) { Box(Mt, 0xd4af37, 0.08f, 0.02f, 0.08f, 0, 0.02f, 0); Box(Mt, 0xcccccc, 0.04f, 0.02f, 0.2f, 0.06f, 0.02f, 0.05f); Box(Mt, 0xcccccc, 0.04f, 0.02f, 0.2f, -0.05f, 0.02f, 0.06f); }
	else if (Type == TEXT("shed")) { Box(Wd, 0x8d6e63, 4.f, 3.f, 3.f, 0, 1.5f, 0); Box(Wd, 0x5d4037, 4.4f, 0.2f, 3.4f, 0, 3.1f, 0); Box(Wd, 0x4e342e, 1.1f, 2.1f, 0.05f, 0, 1.05f, 1.52f); Col = FVector(4.f, 3.f, 3.f); }
	else if (Type == TEXT("mailbox")) { Box(Mt, 0x7f8c8d, 2.4f, 1.6f, 0.5f, 0, 1.1f, 0); for (int32 I = 0; I < 4; ++I) Box(Mt, 0x95a5a6, 0.45f, 0.3f, 0.04f, -0.85f + I * 0.57f, 1.4f, 0.27f); Col = FVector(2.4f, 0.5f, 1.9f); }
	else if (Type == TEXT("flowerbed")) { Box(Wd, 0x8d6e63, 5.f, 0.5f, 1.4f, 0, 0.25f, 0); for (int32 I = 0; I < 6; ++I) Box(EPTSurf::Leaves, I % 3 == 0 ? 0xe74c3c : I % 3 == 1 ? 0xf1c40f : 0x9b59b6, 0.4f, 0.4f, 0.4f, -2.f + I * 0.8f, 0.65f, 0); Col = FVector(5.f, 1.4f, 0.8f); }
	else if (Type == TEXT("bike")) { Cyl(EPTSurf::Rubber, 0x111111, 0.38f, 0.05f, 0, 0.06f, 0.55f); Cyl(EPTSurf::Rubber, 0x111111, 0.38f, 0.05f, 0.2f, 0.06f, -0.5f); Box(Pt, 0xd35400, 0.06f, 0.06f, 1.f, 0.1f, 0.1f, 0); Box(Pt, 0xd35400, 0.5f, 0.06f, 0.06f, 0.3f, 0.1f, -0.2f); }
	else if (Type == TEXT("booth")) { Box(Pt, 0xc0392b, 2.f, 2.6f, 2.f, 0, 1.3f, 0); Box(Pt, 0x922b21, 2.2f, 0.2f, 2.2f, 0, 2.7f, 0); Box(Gl, 0x99bbdd, 1.4f, 0.8f, 0.05f, 0, 1.6f, 1.01f); Box(Pt, 0xffffff, 0.6f, 0.06f, 0.4f, 0.3f, 1.15f, 1.15f); Col = FVector(2.f, 2.f, 2.6f); }
	else if (Type == TEXT("container")) { Box(Mt, 0xb03a2e, 2.6f, 2.6f, 6.2f, 0, 1.3f, 0); Col = FVector(2.6f, 6.2f, 2.6f); }
	else if (Type == TEXT("forklift")) { Box(Pt, 0xf1c40f, 1.4f, 1.f, 2.2f, 0, 0.8f, 0); Box(Mt, 0x333333, 1.2f, 1.2f, 0.08f, 0, 1.9f, -0.3f); Box(Mt, 0x333333, 0.08f, 2.4f, 0.08f, 0.5f, 1.5f, 1.2f); Box(Mt, 0x333333, 0.08f, 2.4f, 0.08f, -0.5f, 1.5f, 1.2f); Box(Mt, 0x555555, 0.12f, 0.06f, 1.2f, 0.35f, 0.2f, 1.8f); Box(Mt, 0x555555, 0.12f, 0.06f, 1.2f, -0.35f, 0.2f, 1.8f); Col = FVector(1.4f, 2.6f, 2.4f); }
	else if (Type == TEXT("casings")) { for (int32 I = 0; I < 3; ++I) Box(EPTSurf::Chrome, 0xd4af37, 0.05f, 0.05f, 0.12f, I * 0.25f - 0.25f, 0.03f, FMath::Sin(I * 2.f) * 0.2f); }
	else if (Type == TEXT("opencrate")) { Box(Wd, 0xb5803f, 1.6f, 0.9f, 1.6f, 0, 0.45f, 0); for (int32 I = 0; I < 4; ++I) Box(Pl, 0x222222, 0.3f, 0.05f, 0.55f, -0.5f + I * 0.33f, 0.93f, 0); Box(Wd, 0x8a5a2b, 1.6f, 0.08f, 1.6f, 1.f, 0.1f, 0.4f, FRotator(0, 23.f, 0)); Col = FVector(1.6f, 1.6f, 1.f); }
	else if (Type == TEXT("padlock")) { Box(Mt, 0x999999, 0.14f, 0.18f, 0.08f, 0, 0.09f, 0); }
	else if (Type == TEXT("phone")) { Box(Pl, 0x111111, 0.1f, 0.02f, 0.18f, 0, 0.02f, 0); Glow(0x2266aa, 3.f, 0.08f, 0.005f, 0.14f, 0, 0.032f, 0); }
	else if (Type == TEXT("cone")) { PTMat::AddPart(this, RootComponent, PTMat::Cone(), PTMat::Make(this, EPTSurf::Paint, C(0xff6f00)), FVector(0, 0, 35.f), FVector(50.f, 50.f, 70.f)); }
	else { Box(Pt, 0xff00ff, 0.5f, 0.5f, 0.5f, 0, 0.25f, 0); }

	if (Col.IsNearlyZero()) return false;
	OutHalf = FVector(Col.X, Col.Y, Col.Z) * 50.f;	// metres -> cm half extents
	UBoxComponent* B = NewObject<UBoxComponent>(this);
	B->SetupAttachment(RootComponent);
	B->SetBoxExtent(OutHalf);
	B->SetRelativeLocation(FVector(0, 0, OutHalf.Z));
	B->SetCollisionProfileName(TEXT("BlockAll"));
	B->RegisterComponent();
	AddInstanceComponent(B);
	(void)Color;
	return true;
}

APTMarker::APTMarker()
{
	PrimaryActorTick.bCanEverTick = true;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
}

void APTMarker::Setup(const FLinearColor& Color)
{
	Mat = PTMat::Make(this, EPTSurf::Emissive, Color);
	PTMat::SetEmissive(Mat, Color, 12.f);
	Gem = PTMat::AddPart(this, RootComponent, PTMat::Sphere(), Mat, FVector(0, 0, 100.f), FVector(22.f, 22.f, 34.f), FRotator::ZeroRotator, false, false);
	Ring = PTMat::AddPart(this, RootComponent, PTMat::Cylinder(), Mat, FVector(0, 0, 2.f), FVector(110.f, 110.f, 1.5f), FRotator::ZeroRotator, false, false);
}

void APTMarker::SetColor(const FLinearColor& Color)
{
	PTMat::SetEmissive(Mat, Color, 12.f);
}

void APTMarker::SetDone()
{
	bDone = true;
	if (Gem) Gem->SetVisibility(false);
	PTMat::SetEmissive(Mat, FLinearColor(0.3f, 0.3f, 0.3f), 0.3f);
}

void APTMarker::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (bDone || !Gem) return;
	T += DeltaSeconds;
	Gem->SetRelativeLocation(FVector(0, 0, 100.f + FMath::Sin(T * 3.f) * 12.f));
	Gem->AddRelativeRotation(FRotator(0, 120.f * DeltaSeconds, 0));
	const float S = 1.1f + FMath::Sin(T * 4.f) * 0.1f;
	Ring->SetRelativeScale3D(FVector(S, S, 0.015f));
}
