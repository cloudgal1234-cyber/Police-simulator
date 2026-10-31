#include "PTHuman.h"
#include "PTMaterials.h"
#include "PTSettings.h"
#include "Animation/AnimInstance.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Materials/MaterialInstanceDynamic.h"

APTHuman::APTHuman()
{
	PrimaryActorTick.bCanEverTick = true;
	GetCapsuleComponent()->InitCapsuleSize(34.f, 90.f);
	UCharacterMovementComponent* M = GetCharacterMovement();
	M->bOrientRotationToMovement = true;
	M->RotationRate = FRotator(0.f, 540.f, 0.f);
	M->MaxWalkSpeed = 420.f;
	M->NavAgentProps.bCanCrouch = true;
	bUseControllerRotationYaw = false;
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;
}

void APTHuman::ApplyLook(const FPTLook& Look, bool bOfficer, int32 Seed)
{
	const UPTSettings* S = GetDefault<UPTSettings>();
	LookScale = Look.Scale;

	USkeletalMesh* Mesh = nullptr;
	if (bOfficer) Mesh = S->OfficerMesh.LoadSynchronous();
	if (!Mesh && S->CharacterMeshes.Num() > 0)
	{
		Mesh = S->CharacterMeshes[FMath::Abs(Seed) % S->CharacterMeshes.Num()].LoadSynchronous();
		if (!Mesh) Mesh = S->CharacterMeshes[0].LoadSynchronous();
	}
	UClass* Anim = S->CharacterAnimClass.LoadSynchronous();

	if (Mesh)
	{
		bSkeletal = true;
		USkeletalMeshComponent* SK = GetMesh();
		SK->SetSkeletalMesh(Mesh);
		SK->SetRelativeLocation(FVector(0.f, 0.f, -90.f));
		SK->SetRelativeRotation(FRotator(0.f, -90.f, 0.f));
		SK->SetRelativeScale3D(FVector(Look.Scale));
		if (Anim) SK->SetAnimInstanceClass(Anim);
		if (S->bTintCharacterMaterials)
		{
			for (int32 I = 0; I < SK->GetNumMaterials(); ++I)
			{
				UMaterialInstanceDynamic* D = SK->CreateAndSetMaterialInstanceDynamic(I);
				if (!D) continue;
				const FLinearColor C = I == 0 ? Look.Shirt : Look.Pants;
				D->SetVectorParameterValue(TEXT("Tint"), bOfficer ? FLinearColor(0.08f, 0.12f, 0.3f) : C);
			}
		}
		Gun = PTMat::AddPart(this, SK, PTMat::Cube(), PTMat::Make(this, EPTSurf::Plastic), FVector(0, 6, 0), FVector(22, 4, 12));
		if (SK->DoesSocketExist(TEXT("hand_r")))
		{
			Gun->AttachToComponent(SK, FAttachmentTransformRules::SnapToTargetNotIncludingScale, TEXT("hand_r"));
			Gun->SetRelativeLocation(FVector(-8.f, 4.f, 0.f));
		}
		Gun->SetVisibility(false);
		return;
	}

	// ---- procedural figure (feet at capsule bottom)
	Proc = NewObject<USceneComponent>(this, TEXT("Figure"));
	Proc->SetupAttachment(GetCapsuleComponent());
	Proc->SetRelativeLocation(FVector(0.f, 0.f, -90.f));
	Proc->SetRelativeScale3D(FVector(Look.Scale));
	Proc->RegisterComponent();
	AddInstanceComponent(Proc);

	UMaterialInstanceDynamic* Shirt = PTMat::Make(this, EPTSurf::Cloth, Look.Shirt);
	UMaterialInstanceDynamic* Pants = PTMat::Make(this, EPTSurf::Cloth, Look.Pants);
	UMaterialInstanceDynamic* Skin = PTMat::Make(this, EPTSurf::Skin, Look.Skin * 1.4f);
	UMaterialInstanceDynamic* Hair = PTMat::Make(this, EPTSurf::Cloth, Look.Hair);
	UMaterialInstanceDynamic* Shoe = PTMat::Make(this, EPTSurf::Plastic, Look.Shoes * 8.f);
	UMaterialInstanceDynamic* Sleeve = Look.Sleeve.IsSet() ? PTMat::Make(this, EPTSurf::Cloth, Look.Sleeve.GetValue()) : Shirt;
	UMaterialInstanceDynamic* Gold = PTMat::Make(this, EPTSurf::Chrome, FLinearColor(1.f, 0.7f, 0.25f));
	UMaterialInstanceDynamic* Black = PTMat::Make(this, EPTSurf::Plastic);

	auto Pivot = [this](const FVector& L) {
		USceneComponent* C = NewObject<USceneComponent>(this);
		C->SetupAttachment(Proc);
		C->SetRelativeLocation(L);
		C->RegisterComponent();
		AddInstanceComponent(C);
		return C;
	};
	auto Part = [this](USceneComponent* Parent, UStaticMesh* M, UMaterialInterface* Mat, const FVector& L, const FVector& Sz) {
		return PTMat::AddPart(this, Parent, M, Mat, L, Sz);
	};
	UStaticMesh* Sph = PTMat::Sphere();
	UStaticMesh* Cyl = PTMat::Cylinder();

	LegL = Pivot(FVector(0, -10.5f, 93));
	LegR = Pivot(FVector(0, 10.5f, 93));
	for (USceneComponent* Leg : { LegL.Get(), LegR.Get() })
	{
		Part(Leg, Cyl, Pants, FVector(0, 0, -25), FVector(21, 21, 50));
		Part(Leg, Sph, Pants, FVector(0, 0, -50), FVector(18, 18, 18));
		Part(Leg, Cyl, Pants, FVector(0, 0, -70), FVector(16, 16, 40));
		Part(Leg, PTMat::Cube(), Shoe, FVector(5, 0, -88), FVector(28, 12, 9));
	}
	Part(Proc, Sph, Pants, FVector(0, 0, 98), FVector(24, 38, 26));
	Part(Proc, Sph, Shirt, FVector(0, 0, 126), FVector(26, 42, 62));
	Part(Proc, Sph, Shirt, FVector(0, 0, 146), FVector(24, 52, 20));
	if (Look.Vest.IsSet()) Part(Proc, Sph, PTMat::Make(this, EPTSurf::Cloth, Look.Vest.GetValue()), FVector(0, 0, 130), FVector(29, 45, 46));
	if (Look.Scarf.IsSet()) Part(Proc, Cyl, PTMat::Make(this, EPTSurf::Cloth, Look.Scarf.GetValue()), FVector(0, 0, 154), FVector(22, 24, 8));
	Part(Proc, Cyl, Black, FVector(0, 0, 107), FVector(27, 40, 6));	// belt
	if (Look.bBadge)
	{
		Part(Proc, PTMat::Cube(), Gold, FVector(13, -9, 140), FVector(2, 5, 6));
		Part(Proc, PTMat::Cube(), Black, FVector(2, 22, 102), FVector(8, 10, 16));	// holster
	}

	ArmL = Pivot(FVector(0, -26, 147));
	ArmR = Pivot(FVector(0, 26, 147));
	for (USceneComponent* Arm : { ArmL.Get(), ArmR.Get() })
	{
		Part(Arm, Cyl, Sleeve, FVector(0, 0, -15), FVector(14, 14, 30));
		Part(Arm, Sph, Sleeve, FVector(0, 0, -31), FVector(12, 12, 12));
		Part(Arm, Cyl, Sleeve, FVector(0, 0, -45), FVector(11.5f, 11.5f, 28));
		Part(Arm, Sph, Skin, FVector(1, 0, -63), FVector(9, 8, 11));
	}
	Part(Proc, Cyl, Skin, FVector(0, 0, 158), FVector(11, 11, 12));
	Part(Proc, Sph, Skin, FVector(1, 0, 172), FVector(23, 21, 26));
	Part(Proc, Sph, Skin, FVector(12, 0, 170), FVector(4, 3.5f, 5));		// nose
	Part(Proc, Sph, Black, FVector(10.5f, -4, 174), FVector(2.2f, 2.2f, 2.2f));
	Part(Proc, Sph, Black, FVector(10.5f, 4, 174), FVector(2.2f, 2.2f, 2.2f));
	Part(Proc, Sph, Skin, FVector(0, -11, 172), FVector(4, 3, 6));		// ears
	Part(Proc, Sph, Skin, FVector(0, 11, 172), FVector(4, 3, 6));
	Part(Proc, Sph, Hair, FVector(-1.5f, 0, 178), FVector(24, 22.5f, 18));
	if (Look.Hat.IsSet())
	{
		UMaterialInstanceDynamic* Hat = PTMat::Make(this, EPTSurf::Cloth, Look.Hat.GetValue());
		Part(Proc, Cyl, Hat, FVector(0, 0, 184), FVector(25, 26, 8));
		Part(Proc, Cyl, Hat, FVector(0.5f, 0, 188.5f), FVector(28, 29, 3));
		Part(Proc, Cyl, Black, FVector(11, 0, 181), FVector(14, 20, 1.5f));
		if (Look.bBadge) Part(Proc, PTMat::Cube(), Gold, FVector(13, 0, 185), FVector(1, 4, 4));
	}
	if (Look.Hood.IsSet()) Part(Proc, Sph, PTMat::Make(this, EPTSurf::Cloth, Look.Hood.GetValue()), FVector(-5, 0, 170), FVector(28, 27, 31));

	Gun = Part(ArmR, PTMat::Cube(), Black, FVector(10, 0, -67), FVector(20, 4, 11));
	Gun->SetVisibility(false);
	GetMesh()->SetVisibility(false);
}

void APTHuman::SetArmed(bool bArmed)
{
	if (Gun) Gun->SetVisibility(bArmed);
}

void APTHuman::SetCrouched(bool bOn)
{
	if (bOn == bCrouchedVisual) return;
	bCrouchedVisual = bOn;
	if (bOn) Crouch(); else UnCrouch();
	if (Proc) Proc->SetRelativeScale3D(FVector(LookScale, LookScale, LookScale * (bOn ? 0.66f : 1.f)));
}

FVector APTHuman::GunMuzzle() const
{
	return Gun ? Gun->GetComponentLocation() + GetActorForwardVector() * 12.f : GetActorLocation() + FVector(0, 0, 50.f);
}

void APTHuman::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (bSkeletal || !Proc) return;
	const float Speed = GetVelocity().Size2D();
	WalkPhase += DeltaSeconds * Speed * 0.022f;
	const float Amt = FMath::Min(1.f, Speed / 300.f);
	const float Sw = FMath::Sin(WalkPhase) * 35.f * Amt;
	if (bSurrender)
	{
		LegL->SetRelativeRotation(FRotator::ZeroRotator);
		LegR->SetRelativeRotation(FRotator::ZeroRotator);
		ArmL->SetRelativeRotation(FRotator(170.f, 0, 0));
		ArmR->SetRelativeRotation(FRotator(170.f, 0, 0));
		return;
	}
	LegL->SetRelativeRotation(FRotator(Sw, 0, 0));
	LegR->SetRelativeRotation(FRotator(-Sw, 0, 0));
	ArmL->SetRelativeRotation(FRotator(-Sw * 0.8f + (bAiming ? 75.f : 0.f), 0, -4.f));
	ArmR->SetRelativeRotation(FRotator(bAiming ? 90.f : Sw * 0.8f, 0, 4.f));
	if (bTalking)
	{
		ArmL->SetRelativeRotation(FRotator(30.f + FMath::Sin(GetWorld()->GetTimeSeconds() * 2.2f) * 12.f, 0, -4.f));
	}
}
