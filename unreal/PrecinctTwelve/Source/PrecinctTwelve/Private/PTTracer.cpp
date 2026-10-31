#include "PTTracer.h"
#include "PTMaterials.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"

APTTracer::APTTracer()
{
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	InitialLifeSpan = 0.07f;
}

void APTTracer::Spawn(UWorld* World, const FVector& From, const FVector& To, const FLinearColor& Color)
{
	if (!World) return;
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	if (APTTracer* T = World->SpawnActor<APTTracer>(From, FRotator::ZeroRotator, P)) T->Setup(From, To, Color);
}

void APTTracer::Setup(const FVector& From, const FVector& To, const FLinearColor& Color)
{
	const FVector D = To - From;
	const float Len = D.Size();
	UMaterialInstanceDynamic* M = PTMat::Make(this, EPTSurf::Emissive, Color);
	PTMat::SetEmissive(M, Color, 80.f);
	PTMat::AddPart(this, RootComponent, PTMat::Cube(), M, FVector(Len * 0.5f, 0, 0), FVector(Len, 1.2f, 1.2f), FRotator::ZeroRotator, false, false);
	SetActorRotation(D.Rotation());
	UPointLightComponent* L = NewObject<UPointLightComponent>(this);
	L->SetupAttachment(RootComponent);
	L->SetIntensityUnits(ELightUnits::Candelas);
	L->SetIntensity(800.f);
	L->SetLightColor(FLinearColor(1.f, 0.75f, 0.4f));
	L->SetAttenuationRadius(600.f);
	L->SetCastShadows(false);
	L->RegisterComponent();
	AddInstanceComponent(L);
}
