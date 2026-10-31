#include "PTNPC.h"
#include "PTCaseManager.h"
#include "PTGameMode.h"
#include "PTOfficer.h"
#include "PTPoliceCar.h"
#include "PTTracer.h"
#include "Components/CapsuleComponent.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"

namespace
{
	const FLinearColor SKINS[] = { FLinearColor(0.68f, 0.45f, 0.33f), FLinearColor(0.58f, 0.36f, 0.24f), FLinearColor(0.4f, 0.24f, 0.14f), FLinearColor(0.23f, 0.12f, 0.07f), FLinearColor(0.76f, 0.56f, 0.44f) };
	const FLinearColor SHIRTS[] = { FLinearColor(0.27f, 0.03f, 0.03f), FLinearColor(0.04f, 0.1f, 0.26f), FLinearColor(0.05f, 0.15f, 0.06f), FLinearColor(0.48f, 0.28f, 0.04f), FLinearColor(0.12f, 0.05f, 0.17f), FLinearColor(0.03f, 0.04f, 0.06f), FLinearColor(0.7f, 0.68f, 0.64f), FLinearColor(0.15f, 0.16f, 0.17f) };
	const FLinearColor PANTS[] = { FLinearColor(0.02f, 0.03f, 0.05f), FLinearColor(0.05f, 0.04f, 0.03f), FLinearColor(0.03f, 0.06f, 0.15f), FLinearColor(0.1f, 0.1f, 0.1f) };
	const FLinearColor HAIR[] = { FLinearColor(0.02f, 0.012f, 0.006f), FLinearColor(0.006f, 0.006f, 0.006f), FLinearColor(0.1f, 0.05f, 0.02f), FLinearColor(0.45f, 0.3f, 0.1f), FLinearColor(0.25f, 0.25f, 0.25f) };
}

APTNPC::APTNPC()
{
	GetCharacterMovement()->MaxWalkSpeed = 140.f;
}

void APTNPC::InitPedestrian(const FBox2D& Rect, FRandomStream& R)
{
	Mode = EPTNpcMode::Pedestrian;
	Path = FBox2D(Rect.Min + FVector2D(200.f, 200.f), Rect.Max - FVector2D(200.f, 200.f));
	Corner = R.RandRange(0, 3);
	Dir = R.FRand() < 0.5f ? 1 : -1;
	FPTLook L;
	L.Skin = SKINS[R.RandRange(0, 4)]; L.Shirt = SHIRTS[R.RandRange(0, 7)]; L.Pants = PANTS[R.RandRange(0, 3)]; L.Hair = HAIR[R.RandRange(0, 4)];
	ApplyLook(L, false, R.RandRange(0, 100));
	GetCharacterMovement()->MaxWalkSpeed = 110.f + R.FRand() * 60.f;
	const FVector2D C[4] = { Path.Min, FVector2D(Path.Max.X, Path.Min.Y), Path.Max, FVector2D(Path.Min.X, Path.Max.Y) };
	const float T = R.FRand();
	const FVector2D P = FMath::Lerp(C[Corner], C[(Corner + 1) % 4], T);
	SetActorLocation(FVector(P, 130.f));
}

void APTNPC::InitCase(const FPTNpcDef& InDef, int32 Seed)
{
	Def = InDef;
	bHasDef = true;
	DisplayName = Def.Name;
	Mode = EPTNpcMode::Idle;
	ApplyLook(Def.Look, false, Seed);
	SetActorRotation(FRotator(0.f, Def.Yaw, 0.f));
}

void APTNPC::InitAccomplice(const FString& InName, const FPTLook& Look, int32 Seed)
{
	DisplayName = InName;
	ApplyLook(Look, false, Seed);
}

void APTNPC::MakeHostile()
{
	Mode = EPTNpcMode::Hostile;
	StartLoc = GetActorLocation();
	Hp = 4;
	Ai = EPTAi::Run;
	ShootCd = 1.f + FMath::FRand() * 0.6f;
	SetArmed(true);
	GetCharacterMovement()->MaxWalkSpeed = 470.f;
	GetCharacterMovement()->bOrientRotationToMovement = true;
	PickCover();
}

void APTNPC::ResetHostile()
{
	SetActorLocation(StartLoc);
	SetSurrender(false);
	SetCrouched(false);
	MakeHostile();
}

void APTNPC::FleeTo(const FVector& Target)
{
	Mode = EPTNpcMode::Flee;
	FleeTarget = Target;
	FleeT = 3.5f;
	GetCharacterMovement()->MaxWalkSpeed = 600.f;
}

bool APTNPC::TakeHit(int32 Damage)
{
	if (Mode != EPTNpcMode::Hostile) return false;
	Hp -= Damage;
	Flinch = 0.35f;
	if (Hp <= 0)
	{
		Mode = EPTNpcMode::Down;
		SetArmed(false);
		SetSurrender(true);
		SetCrouched(true);
		GetCharacterMovement()->StopMovementImmediately();
		if (APTGameMode* GM = APTGameMode::Get(this))
		{
			GM->AddScore(100);
			if (GM->Cases) GM->Cases->OnSuspectDown(this);
		}
	}
	else if (Ai != EPTAi::Run)
	{
		Ai = EPTAi::Hide; StateT = 0.6f;
	}
	return true;
}

void APTNPC::FaceYaw(float Yaw, float Dt, float Speed)
{
	const FRotator R = GetActorRotation();
	SetActorRotation(FRotator(0.f, FMath::FixedTurn(R.Yaw, Yaw, Speed * Dt), 0.f));
}

void APTNPC::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	APTGameMode* GM = APTGameMode::Get(this);
	if (!GM) return;

	switch (Mode)
	{
	case EPTNpcMode::Pedestrian: TickPedestrian(DeltaSeconds); break;
	case EPTNpcMode::Hostile: TickHostile(DeltaSeconds); break;
	case EPTNpcMode::Flee:
	{
		FleeT -= DeltaSeconds;
		const FVector D = FleeTarget - GetActorLocation();
		if (FleeT <= 0.f || D.Size2D() < 60.f)
		{
			bGone = true;
			SetActorHiddenInGame(true);
			SetActorEnableCollision(false);
			Mode = EPTNpcMode::Idle;
			GetCharacterMovement()->DisableMovement();
			break;
		}
		AddMovementInput(D.GetSafeNormal2D(), 1.f);
		break;
	}
	case EPTNpcMode::Idle:
	{
		if (bGone) break;
		SetTalking(bTalkingTo);
		const FVector P = GM->PlayerLocation();
		if (!GM->IsDriving() && FVector::Dist2D(P, GetActorLocation()) < 700.f && !bArrested)
		{
			FaceYaw((P - GetActorLocation()).Rotation().Yaw, DeltaSeconds, 240.f);
		}
		break;
	}
	case EPTNpcMode::Down:
		break;
	}
}

void APTNPC::TickPedestrian(float Dt)
{
	APTGameMode* GM = APTGameMode::Get(this);
	const FVector2D C[4] = { Path.Min, FVector2D(Path.Max.X, Path.Min.Y), Path.Max, FVector2D(Path.Min.X, Path.Max.Y) };
	const int32 Next = Dir > 0 ? (Corner + 1) % 4 : (Corner + 3) % 4;
	const FVector Target(C[Next], GetActorLocation().Z);
	FVector D = Target - GetActorLocation();
	if (D.Size2D() < 60.f) { Corner = Next; return; }
	AddMovementInput(D.GetSafeNormal2D(), 1.f);

	// jump out of the way of a speeding cruiser
	DodgeCd -= Dt;
	if (GM && GM->Car && DodgeCd <= 0.f && FMath::Abs(GM->Car->SignedSpeed()) > 300.f)
	{
		const FVector Rel = GetActorLocation() - GM->Car->GetActorLocation();
		if (Rel.Size2D() < 600.f)
		{
			const float Side = FVector::DotProduct(Rel, GM->Car->GetActorRightVector()) > 0.f ? 1.f : -1.f;
			LaunchCharacter(GM->Car->GetActorRightVector() * Side * 650.f + FVector(0, 0, 250.f), true, true);
			DodgeCd = 1.5f;
			if (Rel.Size2D() < 300.f && GM->Cases) GM->Cases->OnPedestrianStruck();
		}
	}
}

FVector APTNPC::CoverSpot(const FPTCover& C) const
{
	const APTGameMode* GM = APTGameMode::Get(this);
	const FVector P = GM ? GM->PlayerLocation() : FVector::ZeroVector;
	FVector D = C.Center - P;
	D.Z = 0.f;
	D = D.GetSafeNormal();
	const float R = FMath::Max(C.Half.X, C.Half.Y) + 80.f;
	return FVector(C.Center.X + D.X * R, C.Center.Y + D.Y * R, GetActorLocation().Z);
}

void APTNPC::PickCover()
{
	APTGameMode* GM = APTGameMode::Get(this);
	CoverIndex = -1;
	if (!GM || !GM->Cases) { Spot = GetActorLocation(); return; }
	const TArray<FPTCover>& Covers = GM->Cases->Covers;
	const FVector P = GM->PlayerLocation();
	float Best = TNumericLimits<float>::Max();
	for (int32 I = 0; I < Covers.Num(); ++I)
	{
		if (GM->Cases->IsCoverTaken(I, this)) continue;
		const float D = FVector::Dist2D(Covers[I].Center, GetActorLocation()) + FMath::Max(0.f, 800.f - FVector::Dist2D(Covers[I].Center, P)) * 3.f;
		if (D < Best) { Best = D; CoverIndex = I; }
	}
	Spot = CoverIndex >= 0 ? CoverSpot(Covers[CoverIndex]) : GetActorLocation() + FVector(FMath::FRandRange(-300.f, 300.f), FMath::FRandRange(-300.f, 300.f), 0.f);
}


void APTNPC::TickHostile(float Dt)
{
	APTGameMode* GM = APTGameMode::Get(this);
	if (!GM || !GM->Cases) return;
	Flinch -= Dt;
	const FVector P = GM->PlayerLocation();
	const float FaceP = (P - GetActorLocation()).Rotation().Yaw;
	switch (Ai)
	{
	case EPTAi::Run:
	{
		SetCrouched(false);
		SetAiming(false);
		GetCharacterMovement()->bOrientRotationToMovement = true;
		const FVector D = Spot - GetActorLocation();
		if (D.Size2D() < 60.f) { Ai = EPTAi::Hide; StateT = 0.8f + FMath::FRand(); break; }
		AddMovementInput(D.GetSafeNormal2D(), 1.f);
		break;
	}
	case EPTAi::Hide:
		GetCharacterMovement()->bOrientRotationToMovement = false;
		SetCrouched(CoverIndex >= 0);
		SetAiming(false);
		FaceYaw(FaceP, Dt, 360.f);
		StateT -= Dt;
		if (StateT <= 0.f)
		{
			if (CoverIndex >= 0 && GM->Cases->Covers.IsValidIndex(CoverIndex))
			{
				const FVector S = CoverSpot(GM->Cases->Covers[CoverIndex]);
				if (FVector::Dist2D(S, GetActorLocation()) > 220.f) { Spot = S; Ai = EPTAi::Run; break; }	// flanked: relocate
			}
			Ai = EPTAi::Peek;
			StateT = 1.3f + FMath::FRand() * 1.3f;
			ShootCd = 0.35f + FMath::FRand() * 0.3f;
		}
		break;
	case EPTAi::Peek:
		GetCharacterMovement()->bOrientRotationToMovement = false;
		SetCrouched(false);
		SetAiming(true);
		FaceYaw(FaceP, Dt, 720.f);
		if (Flinch <= 0.f)
		{
			ShootCd -= Dt;
			if (ShootCd <= 0.f) { Shoot(); ShootCd = 0.6f + FMath::FRand() * 0.6f; }
		}
		StateT -= Dt;
		if (StateT <= 0.f) { Ai = EPTAi::Hide; StateT = 1.2f + FMath::FRand() * 1.6f; }
		break;
	}
}

void APTNPC::Shoot()
{
	APTGameMode* GM = APTGameMode::Get(this);
	if (!GM || !GM->Officer) return;
	const FVector From = GetActorLocation() + FVector(0, 0, 65.f);
	const FVector Target = GM->PlayerLocation() + FVector(0, 0, GM->IsDriving() ? 20.f : 30.f);
	const float Dist = FVector::Dist(From, Target);
	FHitResult Hit;
	FCollisionQueryParams Q(SCENE_QUERY_STAT(PTEnemyShot), false, this);
	if (GM->IsDriving()) Q.AddIgnoredActor(GM->Car); else Q.AddIgnoredActor(GM->Officer);
	const bool bBlocked = GetWorld()->LineTraceSingleByChannel(Hit, From, Target, ECC_Visibility, Q);
	float Chance = FMath::Clamp(0.42f - Dist / 100.f * 0.01f, 0.12f, 0.42f) * (GM->Officer->GetVelocity().Size2D() > 50.f ? 0.6f : 1.f);
	if (GM->IsDriving()) Chance *= 0.3f;
	FVector End;
	if (!bBlocked && FMath::FRand() < Chance)
	{
		End = Target;
		if (!GM->IsDriving()) GM->Officer->Damage(8.f + FMath::FRand() * 5.f);
	}
	else
	{
		End = bBlocked ? Hit.ImpactPoint : Target + FVector(FMath::FRandRange(-150.f, 150.f), FMath::FRandRange(-150.f, 150.f), FMath::FRandRange(-30.f, 90.f)) + (Target - From).GetSafeNormal() * 400.f;
	}
	APTTracer::Spawn(GetWorld(), GunMuzzle(), End, FLinearColor(1.f, 0.6f, 0.4f));
	GM->Officer->PlayShot(0.5f, 0.75f);
}
