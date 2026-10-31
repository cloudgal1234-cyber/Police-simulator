#include "PTGameMode.h"
#include "PrecinctTwelve.h"
#include "PTCity.h"
#include "PTPoliceCar.h"
#include "PTOfficer.h"
#include "PTTraffic.h"
#include "PTNPC.h"
#include "PTCaseManager.h"
#include "PTPlayerController.h"
#include "PTHUD.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/VolumetricCloudComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/SkyLight.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

namespace
{
	// Sets a bool UPROPERTY by name: avoids depending on setters that differ between engine versions.
	void SetBool(UObject* Obj, const TCHAR* Name, bool bValue)
	{
		if (!Obj) return;
		if (FBoolProperty* P = FindFProperty<FBoolProperty>(Obj->GetClass(), Name))
		{
			P->SetPropertyValue_InContainer(Obj, bValue);
		}
	}
}

APTGameMode::APTGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	DefaultPawnClass = nullptr;
	PlayerControllerClass = APTPlayerController::StaticClass();
	HUDClass = APTHUD::StaticClass();
}

APTGameMode* APTGameMode::Get(const UObject* WorldContext)
{
	return WorldContext && WorldContext->GetWorld() ? Cast<APTGameMode>(WorldContext->GetWorld()->GetAuthGameMode()) : nullptr;
}

void APTGameMode::StartPlay()
{
	BuildWorld();
	Super::StartPlay();
}

void APTGameMode::SpawnEnvironment()
{
	UWorld* W = GetWorld();
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	// Sun: late-afternoon angle for long, readable shadows
	ADirectionalLight* Sun = W->SpawnActor<ADirectionalLight>(FVector(0, 0, 10000.f), FRotator(-32.f, 140.f, 0.f), P);
	if (UDirectionalLightComponent* L = Cast<UDirectionalLightComponent>(Sun->GetLightComponent()))
	{
		L->SetMobility(EComponentMobility::Movable);
		L->SetIntensity(9.f);
		L->SetLightColor(FLinearColor(1.f, 0.94f, 0.86f));
		L->SetDynamicShadowDistanceMovableLight(25000.f);
		L->SetCastShadows(true);
		SetBool(L, TEXT("bAtmosphereSunLight"), true);
		L->MarkRenderStateDirty();
	}

	W->SpawnActor<ASkyAtmosphere>(FVector::ZeroVector, FRotator::ZeroRotator, P);
	W->SpawnActor<AVolumetricCloud>(FVector::ZeroVector, FRotator::ZeroRotator, P);

	ASkyLight* Sky = W->SpawnActor<ASkyLight>(FVector(0, 0, 500.f), FRotator::ZeroRotator, P);
	if (USkyLightComponent* S = Sky->GetLightComponent())
	{
		S->SetMobility(EComponentMobility::Movable);
		SetBool(S, TEXT("bRealTimeCapture"), true);
		S->SetIntensity(1.f);
		S->RecaptureSky();
		S->MarkRenderStateDirty();
	}

	AExponentialHeightFog* Fog = W->SpawnActor<AExponentialHeightFog>(FVector(0, 0, 0.f), FRotator::ZeroRotator, P);
	if (UExponentialHeightFogComponent* F = Fog->GetComponent())
	{
		F->SetFogDensity(0.008f);
		F->SetFogHeightFalloff(0.15f);
		F->SetVolumetricFog(true);
		F->SetStartDistance(2000.f);
	}

	APostProcessVolume* PP = W->SpawnActor<APostProcessVolume>(FVector::ZeroVector, FRotator::ZeroRotator, P);
	PP->bUnbound = true;
	FPostProcessSettings& S = PP->Settings;
	S.bOverride_BloomIntensity = true; S.BloomIntensity = 0.5f;
	S.bOverride_VignetteIntensity = true; S.VignetteIntensity = 0.3f;
	S.bOverride_SceneFringeIntensity = true; S.SceneFringeIntensity = 0.25f;
	S.bOverride_FilmGrainIntensity = true; S.FilmGrainIntensity = 0.06f;
	S.bOverride_MotionBlurAmount = true; S.MotionBlurAmount = 0.35f;
	S.bOverride_LumenFinalGatherQuality = true; S.LumenFinalGatherQuality = 1.5f;
	S.bOverride_LumenSceneLightingQuality = true; S.LumenSceneLightingQuality = 1.5f;
	S.bOverride_ColorSaturation = true; S.ColorSaturation = FVector4(1.05f, 1.05f, 1.05f, 1.f);
	S.bOverride_ColorContrast = true; S.ColorContrast = FVector4(1.06f, 1.06f, 1.06f, 1.f);
}

void APTGameMode::BuildWorld()
{
	if (bBuilt) return;
	bBuilt = true;
	UWorld* W = GetWorld();
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	SpawnEnvironment();

	City = W->SpawnActor<APTCity>(FVector::ZeroVector, FRotator::ZeroRotator, P);
	City->Build();

	// parked cars (police cars at HQ, civilians at the curb)
	for (int32 I = 0; I < City->ParkedSpots.Num(); ++I)
	{
		APTTrafficCar* C = W->SpawnActor<APTTrafficCar>(City->ParkedSpots[I].GetLocation(), City->ParkedSpots[I].Rotator(), P);
		C->InitParked(City, I < 3);
	}

	// moving traffic + pedestrians
	FRandomStream R(777);
	for (int32 I = 0; I < 16; ++I)
	{
		APTTrafficCar* C = W->SpawnActor<APTTrafficCar>(FVector::ZeroVector, FRotator::ZeroRotator, P);
		C->InitDriving(City, R);
		Traffic.Add(C);
	}
	TArray<const FPTBlock*> Walkable;
	for (const FPTBlock& B : City->GetBlocks())
	{
		if (B.Type == EPTBlockType::Downtown || B.Type == EPTBlockType::HQ) Walkable.Add(&B);
	}
	for (int32 I = 0; I < 24 && Walkable.Num(); ++I)
	{
		const FPTBlock* B = Walkable[I % Walkable.Num()];
		APTNPC* N = W->SpawnActor<APTNPC>(FVector(B->Rect.Min.X + 200.f, B->Rect.Min.Y + 200.f, 120.f), FRotator::ZeroRotator, P);
		if (N)
		{
			N->InitPedestrian(B->Rect, R);
			Pedestrians.Add(N);
		}
	}

	// player cruiser in front of HQ, eastbound lane
	const FPTBlock* HQ = City->GetBlock(2, 2);
	const FVector Start(HQ->Center.X, HQ->Rect.Max.Y + APTCity::ROAD * 0.5f + APTCity::LANE, 100.f);
	Car = W->SpawnActor<APTPoliceCar>(Start, FRotator(0.f, 0.f, 0.f), P);
	Officer = W->SpawnActor<APTOfficer>(Start + FVector(0, -300.f, 100.f), FRotator::ZeroRotator, P);
	Officer->SetInCar(true);

	Cases = NewObject<UPTCaseManager>(this);
	Cases->Init(this);
}

void APTGameMode::HandleStartingNewPlayer_Implementation(APlayerController* NewPlayer)
{
	BuildWorld();
	if (NewPlayer && Car)
	{
		NewPlayer->Possess(Car);
		bDriving = true;
	}
}

void APTGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (Cases) Cases->Tick(DeltaSeconds);
}

FVector APTGameMode::PlayerLocation() const
{
	return bDriving ? (Car ? Car->GetActorLocation() : FVector::ZeroVector) : (Officer ? Officer->GetActorLocation() : FVector::ZeroVector);
}

float APTGameMode::PlayerYaw() const
{
	if (bDriving) return Car ? Car->GetActorRotation().Yaw : 0.f;
	return Officer ? Officer->GetActorRotation().Yaw : 0.f;
}

void APTGameMode::ExitCar()
{
	APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
	if (!PC || !Car || !Officer) return;
	// driver's door is on the left side of the car (-Y in car space)
	const FVector Door = Car->GetActorLocation() + Car->GetActorRightVector() * -230.f + FVector(0, 0, 60.f);
	Officer->SetInCar(false);
	Officer->TeleportTo(Door, FRotator(0.f, Car->GetActorRotation().Yaw, 0.f));
	PC->Possess(Officer);
	PC->SetControlRotation(FRotator(-10.f, Car->GetActorRotation().Yaw, 0.f));
	Car->SetDriven(false);
	bDriving = false;
}

void APTGameMode::EnterCar()
{
	APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
	if (!PC || !Car || !Officer) return;
	Officer->SetInCar(true);
	PC->Possess(Car);
	Car->SetDriven(true);
	bDriving = true;
}
