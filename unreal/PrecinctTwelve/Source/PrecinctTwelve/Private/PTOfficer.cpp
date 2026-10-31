#include "PTOfficer.h"
#include "PTAudio.h"
#include "PTMaterials.h"
#include "PTNPC.h"
#include "PTTracer.h"
#include "Camera/CameraComponent.h"
#include "Components/AudioComponent.h"
#include "Components/CapsuleComponent.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/Controller.h"
#include "GameFramework/SpringArmComponent.h"

APTOfficer::APTOfficer()
{
	AutoPossessAI = EAutoPossessAI::Disabled;
	Arm = CreateDefaultSubobject<USpringArmComponent>(TEXT("Arm"));
	Arm->SetupAttachment(RootComponent);
	Arm->TargetArmLength = 320.f;
	Arm->SocketOffset = FVector(0.f, 45.f, 70.f);
	Arm->bUsePawnControlRotation = true;
	Arm->bEnableCameraLag = true;
	Arm->CameraLagSpeed = 18.f;
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(Arm);
	Camera->SetFieldOfView(70.f);

	ShotAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("ShotAudio"));
	ShotAudio->SetupAttachment(RootComponent);
	ShotAudio->bAutoActivate = false;
	ShotAudio->bAllowSpatialization = false;
	UiAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("UiAudio"));
	UiAudio->SetupAttachment(RootComponent);
	UiAudio->bAutoActivate = false;
	UiAudio->bAllowSpatialization = false;
}

void APTOfficer::BeginPlay()
{
	Super::BeginPlay();
	FPTLook Look;
	Look.Shirt = FLinearColor(0.02f, 0.04f, 0.12f);
	Look.Pants = FLinearColor(0.012f, 0.018f, 0.045f);
	Look.Hat = FLinearColor(0.012f, 0.018f, 0.045f);
	Look.Skin = FLinearColor(0.55f, 0.36f, 0.25f);
	Look.bBadge = true;
	ApplyLook(Look, true, 0);

	ShotSynth = NewObject<UPTSynth>(this);
	ShotSynth->Setup(EPTSynthKind::Shot);
	ShotAudio->SetSound(ShotSynth);
	ShotAudio->Play();
	UiSynth = NewObject<UPTSynth>(this);
	UiSynth->Setup(EPTSynthKind::Ui);
	UiAudio->SetSound(UiSynth);
	UiAudio->Play();
}

void APTOfficer::PlayShot(float Volume, float Pitch) { if (ShotSynth) ShotSynth->Trigger(Volume, Pitch); }
void APTOfficer::PlayUi(float Pitch) { if (UiSynth) UiSynth->Trigger(0.6f, Pitch); }

void APTOfficer::SetInCar(bool bInCar)
{
	SetActorHiddenInGame(bInCar);
	SetActorEnableCollision(!bInCar);
	GetCharacterMovement()->SetMovementMode(bInCar ? MOVE_None : MOVE_Walking);
	if (bInCar) SetActorLocation(FVector(0, 0, -5000.f));	// park out of the way
}

void APTOfficer::Move(float Forward, float Right)
{
	if (!Controller) return;
	const FRotator Yaw(0.f, Controller->GetControlRotation().Yaw, 0.f);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), Forward);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), Right);
}

void APTOfficer::SetRun(bool bRun)
{
	GetCharacterMovement()->MaxWalkSpeed = bAimingNow ? 260.f : bRun ? 720.f : 420.f;
}

void APTOfficer::SetAim(bool bAim)
{
	bAimingNow = bAim && bWeaponDrawn;
	SetAiming(bAimingNow);
	bUseControllerRotationYaw = bAimingNow;
	GetCharacterMovement()->bOrientRotationToMovement = !bAimingNow;
	if (bAimingNow) GetCharacterMovement()->MaxWalkSpeed = 260.f;
}

void APTOfficer::Reload()
{
	if (bWeaponDrawn && Ammo < MAG && ReloadT <= 0.f) { ReloadT = 1.4f; PlayUi(1.6f); }
}

void APTOfficer::Damage(float Amount)
{
	Health = FMath::Max(0.f, Health - Amount);
	HurtT = 0.f;
	DamageFlash = 0.5f;
}

void APTOfficer::Fire()
{
	if (!bWeaponDrawn || FireCd > 0.f || ReloadT > 0.f) return;
	if (Ammo <= 0) { PlayUi(2.f); return; }
	Ammo--;
	FireCd = 0.22f;
	if (Ammo == 0) ReloadT = 1.4f;

	const FVector Start = Camera->GetComponentLocation();
	FVector Dir = Camera->GetForwardVector();
	const float Spread = (bAimingNow ? 0.006f : 0.03f) + (GetVelocity().Size2D() > 50.f ? 0.015f : 0.f);
	Dir = (Dir + FVector(FMath::FRandRange(-Spread, Spread), FMath::FRandRange(-Spread, Spread), FMath::FRandRange(-Spread, Spread))).GetSafeNormal();
	// begin the ray beside the officer so objects behind them are ignored
	const FVector From = Start + Dir * (Arm->TargetArmLength * 0.9f);
	const FVector To = From + Dir * 15000.f;
	FHitResult Hit;
	FCollisionQueryParams Q(SCENE_QUERY_STAT(PTShot), false, this);
	FVector End = To;
	if (GetWorld()->LineTraceSingleByChannel(Hit, From, To, ECC_Visibility, Q))
	{
		End = Hit.ImpactPoint;
		if (APTNPC* N = Cast<APTNPC>(Hit.GetActor()))
		{
			const bool bHead = Hit.ImpactPoint.Z > N->GetActorLocation().Z + 55.f;
			if (N->TakeHit(bHead ? 2 : 1)) { HitFlash = 0.3f; }
		}
	}
	APTTracer::Spawn(GetWorld(), GunMuzzle(), End, FLinearColor(1.f, 0.85f, 0.5f));
	PlayShot(0.9f, 1.f);
}

void APTOfficer::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	FireCd -= DeltaSeconds;
	HitFlash = FMath::Max(0.f, HitFlash - DeltaSeconds);
	DamageFlash = FMath::Max(0.f, DamageFlash - DeltaSeconds);
	if (ReloadT > 0.f)
	{
		ReloadT -= DeltaSeconds;
		if (ReloadT <= 0.f) Ammo = MAG;
	}
	HurtT += DeltaSeconds;
	if (HurtT > 4.f && Health < 100.f) Health = FMath::Min(100.f, Health + 14.f * DeltaSeconds);

	// over-the-shoulder aim camera
	const float TargetLen = bAimingNow ? 170.f : 320.f;
	Arm->TargetArmLength = FMath::FInterpTo(Arm->TargetArmLength, TargetLen, DeltaSeconds, 10.f);
	Arm->SocketOffset = FMath::VInterpTo(Arm->SocketOffset, bAimingNow ? FVector(0, 70.f, 75.f) : FVector(0, 45.f, 70.f), DeltaSeconds, 10.f);
	Camera->SetFieldOfView(FMath::FInterpTo(Camera->FieldOfView, bAimingNow ? 52.f : 70.f, DeltaSeconds, 10.f));
	SetArmed(bWeaponDrawn);
}
