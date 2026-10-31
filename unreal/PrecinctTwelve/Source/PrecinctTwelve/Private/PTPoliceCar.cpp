#include "PTPoliceCar.h"
#include "PTAudio.h"
#include "PTMaterials.h"
#include "PTSettings.h"
#include "Camera/CameraComponent.h"
#include "Components/AudioComponent.h"
#include "Components/BoxComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/SpringArmComponent.h"
#include "Materials/MaterialInstanceDynamic.h"

namespace
{
	constexpr float ENGINE = 1500.f;		// cm/s^2
	constexpr float MAX_SPEED = 3800.f;		// ~137 km/h
	constexpr float REVERSE_MAX = 1100.f;
	constexpr float BRAKE = 3000.f;
	constexpr float WHEELBASE = 290.f;
	constexpr float RIDE_HEIGHT = 80.f;		// root (box centre) above the ground
}

APTPoliceCar::APTPoliceCar()
{
	PrimaryActorTick.bCanEverTick = true;
	AutoPossessAI = EAutoPossessAI::Disabled;

	Box = CreateDefaultSubobject<UBoxComponent>(TEXT("Box"));
	Box->SetBoxExtent(FVector(240.f, 95.f, 50.f));
	Box->SetCollisionProfileName(TEXT("Vehicle"));
	RootComponent = Box;

	Body = CreateDefaultSubobject<USceneComponent>(TEXT("Body"));
	Body->SetupAttachment(Box);
	Body->SetRelativeLocation(FVector(0, 0, -RIDE_HEIGHT));

	Arm = CreateDefaultSubobject<USpringArmComponent>(TEXT("Arm"));
	Arm->SetupAttachment(Box);
	Arm->TargetArmLength = 720.f;
	Arm->SetRelativeRotation(FRotator(-9.f, 0.f, 0.f));
	Arm->SocketOffset = FVector(0.f, 0.f, 140.f);
	Arm->bEnableCameraRotationLag = true;
	Arm->CameraRotationLagSpeed = 5.f;
	Arm->bEnableCameraLag = true;
	Arm->CameraLagSpeed = 14.f;
	Arm->bInheritPitch = false;
	Arm->bInheritRoll = false;
	Arm->bDoCollisionTest = true;

	ChaseCam = CreateDefaultSubobject<UCameraComponent>(TEXT("ChaseCam"));
	ChaseCam->SetupAttachment(Arm);
	ChaseCam->SetFieldOfView(70.f);

	HoodCam = CreateDefaultSubobject<UCameraComponent>(TEXT("HoodCam"));
	HoodCam->SetupAttachment(Body);
	HoodCam->SetRelativeLocation(FVector(30.f, -38.f, 128.f));	// driver's eye point
	HoodCam->SetFieldOfView(78.f);
	HoodCam->SetAutoActivate(false);

	RedLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("RedLight"));
	RedLight->SetupAttachment(Body);
	RedLight->SetRelativeLocation(FVector(-30.f, -40.f, 185.f));
	RedLight->SetLightColor(FLinearColor(1.f, 0.05f, 0.03f));
	RedLight->SetIntensityUnits(ELightUnits::Candelas);
	RedLight->SetIntensity(0.f);
	RedLight->SetAttenuationRadius(2400.f);
	RedLight->SetCastShadows(false);

	BlueLight = CreateDefaultSubobject<UPointLightComponent>(TEXT("BlueLight"));
	BlueLight->SetupAttachment(Body);
	BlueLight->SetRelativeLocation(FVector(-30.f, 40.f, 185.f));
	BlueLight->SetLightColor(FLinearColor(0.05f, 0.15f, 1.f));
	BlueLight->SetIntensityUnits(ELightUnits::Candelas);
	BlueLight->SetIntensity(0.f);
	BlueLight->SetAttenuationRadius(2400.f);
	BlueLight->SetCastShadows(false);

	auto MakeHead = [this](const TCHAR* Name, float Y) {
		USpotLightComponent* L = CreateDefaultSubobject<USpotLightComponent>(Name);
		L->SetupAttachment(Body);
		L->SetRelativeLocation(FVector(250.f, Y, 78.f));
		L->SetRelativeRotation(FRotator(-6.f, 0.f, 0.f));
		L->SetIntensityUnits(ELightUnits::Candelas);
		L->SetIntensity(3000.f);
		L->SetAttenuationRadius(3500.f);
		L->SetOuterConeAngle(32.f);
		L->SetInnerConeAngle(18.f);
		L->SetLightColor(FLinearColor(1.f, 0.95f, 0.85f));
		L->SetCastShadows(false);
		return L;
	};
	HeadL = MakeHead(TEXT("HeadL"), -66.f);
	HeadR = MakeHead(TEXT("HeadR"), 66.f);

	EngineAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("EngineAudio"));
	EngineAudio->SetupAttachment(Box);
	EngineAudio->bAutoActivate = false;
	SirenAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("SirenAudio"));
	SirenAudio->SetupAttachment(Box);
	SirenAudio->bAutoActivate = false;
}

void APTPoliceCar::BeginPlay()
{
	Super::BeginPlay();
	BuildBody();

	EngineSynth = NewObject<UPTSynth>(this);
	EngineSynth->Setup(EPTSynthKind::Engine);
	EngineAudio->SetSound(EngineSynth);
	EngineAudio->Play();
	SirenSynth = NewObject<UPTSynth>(this);
	SirenSynth->Setup(EPTSynthKind::Siren);
	SirenAudio->SetSound(SirenSynth);
	SirenAudio->Play();
}

void APTPoliceCar::BuildBody()
{
	USceneComponent* Proc = NewObject<USceneComponent>(this, TEXT("Procedural"));
	Proc->SetupAttachment(Body);
	Proc->RegisterComponent();
	AddInstanceComponent(Proc);

	UMaterialInstanceDynamic* Black = PTMat::Make(this, EPTSurf::CarPaint, FLinearColor(0.08f, 0.08f, 0.09f));
	UMaterialInstanceDynamic* White = PTMat::Make(this, EPTSurf::CarPaint, FLinearColor(4.5f, 4.5f, 4.4f));
	UMaterialInstanceDynamic* Glass = PTMat::Make(this, EPTSurf::Glass);
	UMaterialInstanceDynamic* Plastic = PTMat::Make(this, EPTSurf::Plastic);
	UMaterialInstanceDynamic* Chrome = PTMat::Make(this, EPTSurf::Chrome);
	UMaterialInstanceDynamic* Rubber = PTMat::Make(this, EPTSurf::Rubber);
	UMaterialInstanceDynamic* Head = PTMat::Make(this, EPTSurf::Emissive, FLinearColor(1, 1, 1));
	PTMat::SetEmissive(Head, FLinearColor(1.f, 0.95f, 0.85f), 30.f);
	TailMat = PTMat::Make(this, EPTSurf::Emissive, FLinearColor(0.3f, 0.01f, 0.01f));
	PTMat::SetEmissive(TailMat, FLinearColor(1.f, 0.02f, 0.01f), 3.f);
	RedMat = PTMat::Make(this, EPTSurf::Emissive, FLinearColor(0.3f, 0.02f, 0.02f));
	BlueMat = PTMat::Make(this, EPTSurf::Emissive, FLinearColor(0.02f, 0.04f, 0.3f));
	PTMat::SetEmissive(RedMat, FLinearColor(1.f, 0.05f, 0.03f), 0.f);
	PTMat::SetEmissive(BlueMat, FLinearColor(0.05f, 0.2f, 1.f), 0.f);

	UStaticMesh* Cube = PTMat::Cube();
	auto P = [this, Proc, Cube](UMaterialInterface* M, const FVector& L, const FVector& S, const FRotator& R = FRotator::ZeroRotator) {
		return PTMat::AddPart(this, Proc, Cube, M, L, S, R);
	};
	// body
	P(Black, FVector(0, 0, 60), FVector(476, 188, 58));
	P(Black, FVector(150, 0, 92), FVector(170, 184, 10), FRotator(-2.f, 0, 0));	// hood
	P(Black, FVector(-190, 0, 95), FVector(96, 184, 10));						// trunk
	P(White, FVector(-10, 0, 72), FVector(205, 192, 38));							// white doors
	P(Glass, FVector(-30, 0, 121), FVector(190, 168, 50));							// cabin glass
	P(Glass, FVector(94, 0, 115), FVector(70, 166, 5), FRotator(-38.f, 0, 0));		// windscreen
	P(Glass, FVector(-152, 0, 116), FVector(64, 166, 5), FRotator(36.f, 0, 0));		// rear window
	P(White, FVector(-34, 0, 148), FVector(150, 162, 6));							// roof
	P(Plastic, FVector(-40, 0, 121), FVector(10, 171, 52));							// B-pillars
	P(Plastic, FVector(243, 0, 42), FVector(14, 196, 26));							// bumpers
	P(Plastic, FVector(-243, 0, 42), FVector(14, 196, 26));
	P(Plastic, FVector(247, 0, 66), FVector(4, 96, 16));							// grille
	P(Plastic, FVector(262, 0, 60), FVector(6, 120, 8));							// push bar
	P(Plastic, FVector(262, 0, 36), FVector(6, 120, 8));
	P(Plastic, FVector(260, -48, 48), FVector(8, 8, 40));
	P(Plastic, FVector(260, 48, 48), FVector(8, 8, 40));
	P(Plastic, FVector(84, -100, 106), FVector(14, 18, 12));						// mirrors
	P(Plastic, FVector(84, 100, 106), FVector(14, 18, 12));
	P(Head, FVector(242, -66, 78), FVector(5, 40, 12));
	P(Head, FVector(242, 66, 78), FVector(5, 40, 12));
	P(TailMat, FVector(-246, -68, 82), FVector(5, 44, 14));
	P(TailMat, FVector(-246, 68, 82), FVector(5, 44, 14));
	P(Plastic, FVector(-30, 0, 157), FVector(34, 138, 10));							// light bar
	P(RedMat, FVector(-30, -34, 165), FVector(30, 62, 14));
	P(BlueMat, FVector(-30, 34, 165), FVector(30, 62, 14));
	P(RedMat, FVector(247, -25, 66), FVector(3, 12, 6));							// grille strobes
	P(BlueMat, FVector(247, 25, 66), FVector(3, 12, 6));
	P(Rubber, FVector(145, 0, 52), FVector(100, 172, 50));							// wheel wells
	P(Rubber, FVector(-145, 0, 52), FVector(100, 172, 50));

	// livery text on both doors
	for (int32 Side = -1; Side <= 1; Side += 2)
	{
		UTextRenderComponent* T = NewObject<UTextRenderComponent>(this);
		T->SetText(FText::FromString(TEXT("POLICE")));
		T->SetHorizontalAlignment(EHTA_Center);
		T->SetVerticalAlignment(EVRTA_TextCenter);
		T->SetWorldSize(24.f);
		T->SetTextRenderColor(FColor(10, 26, 60));
		T->SetupAttachment(Proc);
		T->SetRelativeLocation(FVector(-10.f, Side * 97.f, 74.f));
		T->SetRelativeRotation(FRotator(0.f, Side * 90.f, 0.f));
		T->RegisterComponent();
		AddInstanceComponent(T);
	}

	// wheels: steer pivot -> spin -> tyre / rim
	const FVector WheelPos[4] = { FVector(145, -86, 42), FVector(145, 86, 42), FVector(-145, -86, 42), FVector(-145, 86, 42) };
	for (int32 I = 0; I < 4; ++I)
	{
		USceneComponent* Pivot = NewObject<USceneComponent>(this);
		Pivot->SetupAttachment(Body);
		Pivot->SetRelativeLocation(WheelPos[I]);
		Pivot->RegisterComponent();
		AddInstanceComponent(Pivot);
		USceneComponent* Spin = NewObject<USceneComponent>(this);
		Spin->SetupAttachment(Pivot);
		Spin->RegisterComponent();
		AddInstanceComponent(Spin);
		PTMat::AddPart(this, Spin, PTMat::Cylinder(), Rubber, FVector::ZeroVector, FVector(84, 84, 28), FRotator(0, 0, 90.f));
		PTMat::AddPart(this, Spin, PTMat::Cylinder(), Chrome, FVector(0, WheelPos[I].Y > 0 ? 2.f : -2.f, 0), FVector(52, 52, 29), FRotator(0, 0, 90.f));
		for (int32 K = 0; K < 3; ++K)
		{
			PTMat::AddPart(this, Spin, Cube, Plastic, FVector(0, WheelPos[I].Y > 0 ? 15.f : -15.f, 0), FVector(8, 4, 46), FRotator(K * 60.f, 0, 0), false, false);
		}
		Wheels.Add(Spin);
		if (I < 2) FrontPivots.Add(Pivot);
	}

	// optional realistic body from Project Settings
	const UPTSettings* S = GetDefault<UPTSettings>();
	if (UStaticMesh* Mesh = S->PoliceCarMesh.LoadSynchronous())
	{
		UStaticMeshComponent* C = PTMat::AddPart(this, Body, Mesh, nullptr, FVector::ZeroVector, FVector(100.f * S->VehicleMeshScale), FRotator(0, S->VehicleMeshYaw, 0));
		C->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Proc->SetVisibility(false, true);
		for (USceneComponent* W : Wheels) { W->SetVisibility(false, true); }
	}
}

void APTPoliceCar::SetDriven(bool bInDriven)
{
	bDriven = bInDriven;
	if (!bDriven) { Throttle = Brake = Steer = 0.f; bHandbrake = true; }
}

void APTPoliceCar::ToggleSiren()
{
	bSiren = !bSiren;
	if (SirenSynth) SirenSynth->SetActive(bSiren);
}

void APTPoliceCar::ToggleCamera()
{
	bHoodCam = !bHoodCam;
	ChaseCam->SetActive(!bHoodCam);
	HoodCam->SetActive(bHoodCam);
}

void APTPoliceCar::Horn()
{
	if (SirenSynth) SirenSynth->Honk();
}

void APTPoliceCar::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const float Dt = FMath::Min(DeltaSeconds, 0.05f);

	float Yaw = FMath::DegreesToRadians(GetActorRotation().Yaw);
	FVector2D F(FMath::Cos(Yaw), FMath::Sin(Yaw)), R(-FMath::Sin(Yaw), FMath::Cos(Yaw));
	float VF = FVector2D::DotProduct(Vel, F), VR = FVector2D::DotProduct(Vel, R);

	// --- longitudinal
	if (Throttle > 0.f && VF > -50.f) VF += Throttle * ENGINE * (1.f - FMath::Max(0.f, VF) / MAX_SPEED) * Dt;
	if (Brake > 0.f)
	{
		if (VF > 50.f) VF -= Brake * BRAKE * Dt;
		else if (Throttle == 0.f) VF = FMath::Max(-REVERSE_MAX, VF - Brake * 700.f * Dt);
	}
	if (Throttle > 0.f && VF < -50.f) VF += Throttle * BRAKE * Dt;
	const float Drag = 0.35f + FMath::Abs(VF) * 0.00012f;
	VF -= VF * Drag * Dt * (Throttle > 0.f || Brake > 0.f ? 0.3f : 1.f);
	if (Throttle == 0.f && Brake == 0.f && FMath::Abs(VF) < 30.f) VF = 0.f;
	if (bHandbrake) VF -= VF * 1.6f * Dt;

	// --- steering: less lock at speed
	const float MaxLock = 0.62f / (1.f + FMath::Abs(VF) / 1600.f);
	SteerAngle = FMath::FInterpTo(SteerAngle, Steer * MaxLock, Dt, 10.f);
	const float YawRate = (VF / WHEELBASE) * FMath::Tan(SteerAngle) * (bHandbrake ? 1.35f : 1.f);
	Yaw += YawRate * Dt;

	// --- lateral grip
	VR *= FMath::Exp(-(bHandbrake ? 1.6f : 9.f) * Dt);
	F = FVector2D(FMath::Cos(Yaw), FMath::Sin(Yaw));
	R = FVector2D(-FMath::Sin(Yaw), FMath::Cos(Yaw));
	Vel = F * VF + R * VR;

	SetActorRotation(FRotator(0.f, FMath::RadiansToDegrees(Yaw), 0.f));
	const FVector Delta(Vel * Dt, 0.f);
	FHitResult Hit;
	AddActorWorldOffset(Delta, true, &Hit);
	if (Hit.bBlockingHit)
	{
		const FVector2D N = FVector2D(Hit.ImpactNormal).GetSafeNormal();
		const float Vn = FVector2D::DotProduct(Vel, N);
		if (Vn < 0.f)
		{
			Vel -= N * Vn * 1.25f;
			Vel *= 0.82f;
		}
		const FVector Rem = FVector::VectorPlaneProject(Delta * (1.f - Hit.Time), FVector(N, 0.f));
		AddActorWorldOffset(Rem, true);
	}
	Speed = FVector2D::DotProduct(Vel, F);

	// --- follow the ground (sidewalk curbs)
	FHitResult G;
	FCollisionQueryParams Q(SCENE_QUERY_STAT(PTCarGround), false, this);
	const FVector L = GetActorLocation();
	if (GetWorld()->LineTraceSingleByChannel(G, L + FVector(0, 0, 150.f), L - FVector(0, 0, 400.f), ECC_WorldStatic, Q))
	{
		const float Z = FMath::FInterpTo(L.Z, G.ImpactPoint.Z + RIDE_HEIGHT, Dt, 12.f);
		SetActorLocation(FVector(L.X, L.Y, Z));
	}

	// --- visuals
	Roll = FMath::FInterpTo(Roll, FMath::Clamp(-YawRate * VF * 0.0025f, -4.f, 4.f), Dt, 6.f);
	Pitch = FMath::FInterpTo(Pitch, FMath::Clamp((Brake - Throttle) * 1.8f * FMath::Min(1.f, FMath::Abs(VF) / 600.f), -2.f, 3.f), Dt, 6.f);
	Body->SetRelativeRotation(FRotator(-Pitch, 0.f, Roll));
	WheelSpin += FMath::RadiansToDegrees(Speed / 42.f) * Dt;
	for (USceneComponent* W : Wheels) { W->SetRelativeRotation(FRotator(-WheelSpin, 0.f, 0.f)); }
	for (USceneComponent* Pv : FrontPivots) { Pv->SetRelativeRotation(FRotator(0.f, FMath::RadiansToDegrees(SteerAngle), 0.f)); }
	ChaseCam->SetFieldOfView(FMath::FInterpTo(ChaseCam->FieldOfView, 70.f + FMath::Min(14.f, FMath::Abs(Speed) * 0.0035f), Dt, 4.f));
	Arm->TargetArmLength = 720.f + FMath::Min(300.f, FMath::Abs(Speed) * 0.08f);
	UpdateLights(Dt);

	if (EngineSynth)
	{
		EngineSynth->SetEngine(bDriven, FMath::Abs(Speed) / MAX_SPEED, Throttle);
	}
}

void APTPoliceCar::UpdateLights(float Dt)
{
	LightT += Dt;
	if (bSiren)
	{
		// double-flash pattern: red twice, then blue twice
		const int32 K = FMath::FloorToInt(LightT * 10.f) % 8;
		const bool bRed = K == 0 || K == 2, bBlue = K == 4 || K == 6;
		PTMat::SetEmissive(RedMat, FLinearColor(1.f, 0.05f, 0.03f), bRed ? 400.f : 1.f);
		PTMat::SetEmissive(BlueMat, FLinearColor(0.05f, 0.2f, 1.f), bBlue ? 500.f : 1.f);
		RedLight->SetIntensity(bRed ? 2500.f : 0.f);
		BlueLight->SetIntensity(bBlue ? 3500.f : 0.f);
	}
	else
	{
		PTMat::SetEmissive(RedMat, FLinearColor(1.f, 0.05f, 0.03f), 0.f);
		PTMat::SetEmissive(BlueMat, FLinearColor(0.05f, 0.2f, 1.f), 0.f);
		RedLight->SetIntensity(0.f);
		BlueLight->SetIntensity(0.f);
	}
	const bool bBraking = Brake > 0.f && Speed > 50.f;
	PTMat::SetEmissive(TailMat, FLinearColor(1.f, 0.02f, 0.01f), bBraking ? 60.f : 6.f);
}
