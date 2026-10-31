#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "PTPlayerController.generated.h"

class APTHUD;
class APTGameMode;

/** Routes input to the cruiser, the officer or the UI depending on the current mode. */
UCLASS()
class PRECINCTTWELVE_API APTPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	APTPlayerController();
	virtual void SetupInputComponent() override;
	virtual void PlayerTick(float DeltaTime) override;

private:
	APTHUD* Hud() const;
	bool Playing() const;

	void OnInteract();
	void OnVehicle();
	void OnSiren();
	void OnCamera();
	void OnHorn();
	void OnFirePressed() { bFire = true; }
	void OnFireReleased() { bFire = false; }
	void OnAimPressed() { bAim = true; }
	void OnAimReleased() { bAim = false; }
	void OnRunPressed() { bRun = true; }
	void OnRunReleased() { bRun = false; }
	void OnHandbrakePressed() { bHandbrake = true; }
	void OnHandbrakeReleased() { bHandbrake = false; }
	void OnReload();
	void OnNotebook();
	void OnMap();
	void OnPause();
	void OnUp();
	void OnDown();
	void OnConfirm();
	void OnBack();
	void Choice(int32 N);
	void OnChoice1() { Choice(0); }
	void OnChoice2() { Choice(1); }
	void OnChoice3() { Choice(2); }
	void OnChoice4() { Choice(3); }
	void OnChoice5() { Choice(4); }
	void OnChoice6() { Choice(5); }
	void OnChoice7() { Choice(6); }
	void OnChoice8() { Choice(7); }
	void OnChoice9() { Choice(8); }

	bool bFire = false, bAim = false, bRun = false, bHandbrake = false;
};
