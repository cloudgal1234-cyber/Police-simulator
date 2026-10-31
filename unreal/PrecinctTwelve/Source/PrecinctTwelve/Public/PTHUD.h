#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "PTHUD.generated.h"

class UFont;

UENUM()
enum class EPTUi : uint8 { Welcome, Play, Dialogue, Inspect, Notebook, Map, Pause, Summary };

struct FPTOption
{
	FString Label;
	uint8 Style = 0;	// 0 normal, 1 asked, 2 new lead, 3 accuse, 4 goodbye
	TFunction<void()> OnSelect;
};

/** All UI is drawn on the canvas: no widget assets required. */
UCLASS()
class PRECINCTTWELVE_API APTHUD : public AHUD
{
	GENERATED_BODY()

public:
	APTHUD();
	virtual void DrawHUD() override;
	virtual void Tick(float DeltaSeconds) override;

	EPTUi Mode = EPTUi::Welcome;
	FString Prompt;

	void SetMode(EPTUi NewMode);
	/** Ignore UI input on the frame the mode changed (one key press must not do two things). */
	bool InputReady() const { return GFrameCounter != ModeFrame; }

	void SetObjective(const FString& Title, const FString& Sub);
	void Toast(const FString& Text, int32 Kind = 0, float Secs = 3.f);
	void Radio(const FString& From, const FString& Text);
	void ShowDialogue(const FString& Name, const FString& Role, const FString& Text, const TArray<FPTOption>& Options);
	void CloseDialogue();
	void ShowInspect(const FString& Title, const FString& Text);
	void ShowSummary(const FString& Title, const FString& Text, const TArray<TPair<FString, FString>>& Rows, bool bLast);

	// input from the player controller
	void UIUp();
	void UIDown();
	void UIConfirm();
	void UIBack();
	void UIChoice(int32 Index);
	void ToggleNotebook();
	void ToggleMap();
	void TogglePause();

private:
	struct FToast { FString Text; int32 Kind; float T; };

	float S() const { return Scale; }
	void Panel(float X, float Y, float W, float H, const FLinearColor& C = FLinearColor(0.02f, 0.035f, 0.07f, 0.82f));
	float Txt(const FString& T, float X, float Y, const FLinearColor& C, float Size, UFont* F = nullptr);
	float Wrapped(const FString& T, float X, float Y, float MaxW, const FLinearColor& C, float Size, float LineH);
	TArray<FString> Wrap(const FString& T, float MaxW, float Size, UFont* F = nullptr);
	float TextW(const FString& T, float Size, UFont* F = nullptr);
	void Line(float X0, float Y0, float X1, float Y1, const FLinearColor& C, float W = 1.f);

	void DrawPlay();
	void DrawMinimap(float X, float Y, float Size, float Range, bool bFull);
	void DrawDialogue();
	void DrawInspect();
	void DrawNotebook();
	void DrawWelcome(bool bPause);
	void DrawSummary();
	FString Rank() const;

	float Scale = 1.f;
	uint64 ModeFrame = 0;
	FString ObjTitle, ObjSub;
	float ObjFlash = 0.f;
	TArray<FToast> Toasts;
	FString RadioFrom, RadioText;
	float RadioT = 0.f;

	FString DlgName, DlgRole, DlgText;
	TArray<FPTOption> DlgOptions;
	int32 DlgSel = 0;
	FString InsTitle, InsText;
	FString SumTitle, SumText;
	TArray<TPair<FString, FString>> SumRows;
	bool bSumLast = false;
};
