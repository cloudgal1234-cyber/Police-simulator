#include "PTPlayerController.h"
#include "PTCaseManager.h"
#include "PTGameMode.h"
#include "PTHUD.h"
#include "PTOfficer.h"
#include "PTPoliceCar.h"
#include "Components/InputComponent.h"

APTPlayerController::APTPlayerController()
{
	bShouldPerformFullTickWhenPaused = true;
	bShowMouseCursor = false;
}

APTHUD* APTPlayerController::Hud() const { return Cast<APTHUD>(GetHUD()); }

bool APTPlayerController::Playing() const
{
	const APTHUD* H = Hud();
	return H && H->Mode == EPTUi::Play;
}

void APTPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();
	UInputComponent* I = InputComponent;
	for (const TCHAR* Axis : { TEXT("Throttle"), TEXT("Brake"), TEXT("Steer"), TEXT("MoveForward"), TEXT("MoveRight"), TEXT("Turn"), TEXT("TurnRate"), TEXT("LookUp"), TEXT("LookUpRate") })
	{
		I->BindAxis(Axis);
	}
	I->BindAction("Interact", IE_Pressed, this, &APTPlayerController::OnInteract);
	I->BindAction("Vehicle", IE_Pressed, this, &APTPlayerController::OnVehicle);
	I->BindAction("Siren", IE_Pressed, this, &APTPlayerController::OnSiren);
	I->BindAction("Camera", IE_Pressed, this, &APTPlayerController::OnCamera);
	I->BindAction("Horn", IE_Pressed, this, &APTPlayerController::OnHorn);
	I->BindAction("Fire", IE_Pressed, this, &APTPlayerController::OnFirePressed);
	I->BindAction("Fire", IE_Released, this, &APTPlayerController::OnFireReleased);
	I->BindAction("Aim", IE_Pressed, this, &APTPlayerController::OnAimPressed);
	I->BindAction("Aim", IE_Released, this, &APTPlayerController::OnAimReleased);
	I->BindAction("Run", IE_Pressed, this, &APTPlayerController::OnRunPressed);
	I->BindAction("Run", IE_Released, this, &APTPlayerController::OnRunReleased);
	I->BindAction("Handbrake", IE_Pressed, this, &APTPlayerController::OnHandbrakePressed);
	I->BindAction("Handbrake", IE_Released, this, &APTPlayerController::OnHandbrakeReleased);
	I->BindAction("Reload", IE_Pressed, this, &APTPlayerController::OnReload);
	I->BindAction("Notebook", IE_Pressed, this, &APTPlayerController::OnNotebook);
	I->BindAction("Map", IE_Pressed, this, &APTPlayerController::OnMap);
	I->BindAction("Pause", IE_Pressed, this, &APTPlayerController::OnPause).bExecuteWhenPaused = true;
	I->BindAction("UIUp", IE_Pressed, this, &APTPlayerController::OnUp);
	I->BindAction("UIDown", IE_Pressed, this, &APTPlayerController::OnDown);
	I->BindAction("UIConfirm", IE_Pressed, this, &APTPlayerController::OnConfirm);
	I->BindAction("UIBack", IE_Pressed, this, &APTPlayerController::OnBack).bExecuteWhenPaused = true;
	I->BindAction("Choice1", IE_Pressed, this, &APTPlayerController::OnChoice1);
	I->BindAction("Choice2", IE_Pressed, this, &APTPlayerController::OnChoice2);
	I->BindAction("Choice3", IE_Pressed, this, &APTPlayerController::OnChoice3);
	I->BindAction("Choice4", IE_Pressed, this, &APTPlayerController::OnChoice4);
	I->BindAction("Choice5", IE_Pressed, this, &APTPlayerController::OnChoice5);
	I->BindAction("Choice6", IE_Pressed, this, &APTPlayerController::OnChoice6);
	I->BindAction("Choice7", IE_Pressed, this, &APTPlayerController::OnChoice7);
	I->BindAction("Choice8", IE_Pressed, this, &APTPlayerController::OnChoice8);
	I->BindAction("Choice9", IE_Pressed, this, &APTPlayerController::OnChoice9);
}

void APTPlayerController::Choice(int32 N)
{
	if (APTHUD* H = Hud()) H->UIChoice(N);
}

void APTPlayerController::PlayerTick(float DeltaTime)
{
	Super::PlayerTick(DeltaTime);
	APTGameMode* GM = APTGameMode::Get(this);
	APTHUD* H = Hud();
	if (!GM || !H) return;
	const bool bPlay = H->Mode == EPTUi::Play;

	if (GM->IsDriving() && GM->Car)
	{
		APTPoliceCar* Car = GM->Car;
		Car->Throttle = bPlay ? FMath::Clamp(GetInputAxisValue("Throttle"), 0.f, 1.f) : 0.f;
		Car->Brake = bPlay ? FMath::Clamp(GetInputAxisValue("Brake"), 0.f, 1.f) : 0.f;
		Car->Steer = bPlay ? FMath::Clamp(GetInputAxisValue("Steer"), -1.f, 1.f) : 0.f;
		Car->bHandbrake = bPlay && bHandbrake;
		H->Prompt = GM->Cases && GM->Cases->State == EPTCaseState::Investigate && Car->SpeedKmh() < 10.f ? TEXT("[F / Y]  Exit vehicle") : TEXT("");
	}
	else if (GM->Officer)
	{
		APTOfficer* O = GM->Officer;
		if (bPlay)
		{
			O->Move(GetInputAxisValue("MoveForward"), GetInputAxisValue("MoveRight"));
			AddYawInput(GetInputAxisValue("Turn") + GetInputAxisValue("TurnRate") * 120.f * DeltaTime);
			AddPitchInput(GetInputAxisValue("LookUp") + GetInputAxisValue("LookUpRate") * 90.f * DeltaTime);
			O->SetAim(bAim);
			O->SetRun(bRun);
			if (bFire) O->Fire();
		}
		else
		{
			O->SetAim(false);
		}
		FString P = GM->Cases ? GM->Cases->InteractPrompt() : FString();
		if (!P.IsEmpty()) P = TEXT("[E / A]  ") + P;
		else if (GM->Car && FVector::Dist2D(O->GetActorLocation(), GM->Car->GetActorLocation()) < 360.f) P = TEXT("[F / Y]  Enter cruiser");
		H->Prompt = P;
	}
}

void APTPlayerController::OnInteract()
{
	APTHUD* H = Hud();
	APTGameMode* GM = APTGameMode::Get(this);
	if (!H || !GM || !Playing() || !H->InputReady() || GM->IsDriving()) return;
	if (GM->Cases) GM->Cases->TryInteract();
}

void APTPlayerController::OnVehicle()
{
	APTGameMode* GM = APTGameMode::Get(this);
	APTHUD* H = Hud();
	if (!GM || !H || !Playing()) return;
	if (GM->IsDriving())
	{
		if (GM->Car->SpeedKmh() < 10.f) GM->ExitCar();
		else H->Toast(TEXT("Slow down to exit the vehicle."), 0, 1.5f);
	}
	else if (GM->Car && FVector::Dist2D(GM->Officer->GetActorLocation(), GM->Car->GetActorLocation()) < 360.f)
	{
		if (GM->Cases && GM->Cases->State == EPTCaseState::Standoff) H->Toast(TEXT("You can't leave during an active standoff!"), 2);
		else GM->EnterCar();
	}
}

void APTPlayerController::OnSiren()
{
	APTGameMode* GM = APTGameMode::Get(this);
	if (GM && GM->IsDriving() && Playing()) GM->Car->ToggleSiren();
}

void APTPlayerController::OnCamera()
{
	APTGameMode* GM = APTGameMode::Get(this);
	if (GM && GM->IsDriving() && Playing()) GM->Car->ToggleCamera();
}

void APTPlayerController::OnHorn()
{
	APTGameMode* GM = APTGameMode::Get(this);
	if (GM && GM->IsDriving() && Playing()) GM->Car->Horn();
}

void APTPlayerController::OnReload()
{
	APTGameMode* GM = APTGameMode::Get(this);
	if (GM && !GM->IsDriving() && Playing()) GM->Officer->Reload();
}

void APTPlayerController::OnNotebook() { if (APTHUD* H = Hud()) H->ToggleNotebook(); }
void APTPlayerController::OnMap() { if (APTHUD* H = Hud()) H->ToggleMap(); }
void APTPlayerController::OnPause() { if (APTHUD* H = Hud()) H->TogglePause(); }
void APTPlayerController::OnUp() { if (APTHUD* H = Hud()) H->UIUp(); }
void APTPlayerController::OnDown() { if (APTHUD* H = Hud()) H->UIDown(); }
void APTPlayerController::OnConfirm() { if (APTHUD* H = Hud()) H->UIConfirm(); }
void APTPlayerController::OnBack() { if (APTHUD* H = Hud()) H->UIBack(); }
