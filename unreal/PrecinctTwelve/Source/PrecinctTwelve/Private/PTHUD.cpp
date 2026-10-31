#include "PTHUD.h"
#include "PTCaseManager.h"
#include "PTCity.h"
#include "PTGameMode.h"
#include "PTOfficer.h"
#include "PTPoliceCar.h"
#include "PTTraffic.h"
#include "Camera/PlayerCameraManager.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"

namespace
{
	const FLinearColor TEXT_C(0.93f, 0.95f, 0.98f);
	const FLinearColor MUTED(0.6f, 0.66f, 0.74f);
	const FLinearColor GOLD(1.f, 0.78f, 0.25f);
	const FLinearColor ACCENT(0.31f, 0.76f, 1.f);
	const FLinearColor GOOD(0.3f, 0.75f, 0.35f);
	const FLinearColor BAD(0.95f, 0.33f, 0.24f);

	struct FCtl { const TCHAR* Action; const TCHAR* Keys; const TCHAR* Pad; };
	const FCtl DRIVE[] = {
		{ TEXT("Accelerate"), TEXT("W / Up"), TEXT("RT / throttle pedal") },
		{ TEXT("Brake / reverse"), TEXT("S / Down"), TEXT("LT / brake pedal") },
		{ TEXT("Steer"), TEXT("A D / Left Right"), TEXT("Left stick / steering wheel") },
		{ TEXT("Handbrake"), TEXT("Space"), TEXT("B") },
		{ TEXT("Siren & lights"), TEXT("H"), TEXT("X") },
		{ TEXT("Enter / exit cruiser"), TEXT("F"), TEXT("Y") },
		{ TEXT("Horn"), TEXT("G"), TEXT("R3") },
		{ TEXT("Camera (chase / driver)"), TEXT("C"), TEXT("LB") } };
	const FCtl FOOT[] = {
		{ TEXT("Move"), TEXT("W A S D"), TEXT("Left stick") },
		{ TEXT("Look"), TEXT("Mouse"), TEXT("Right stick") },
		{ TEXT("Run"), TEXT("Shift"), TEXT("L3") },
		{ TEXT("Inspect / talk"), TEXT("E"), TEXT("A") },
		{ TEXT("Aim (standoffs)"), TEXT("Right mouse"), TEXT("LT") },
		{ TEXT("Fire (standoffs)"), TEXT("Left mouse"), TEXT("RT") },
		{ TEXT("Reload"), TEXT("R"), TEXT("X") } };
	const FCtl GENERAL[] = {
		{ TEXT("Dialogue choice"), TEXT("1-9 / Up Down + Enter"), TEXT("D-pad + A, B = back") },
		{ TEXT("Notebook"), TEXT("Tab / J"), TEXT("RB") },
		{ TEXT("City map"), TEXT("M"), TEXT("View") },
		{ TEXT("Pause"), TEXT("P"), TEXT("Menu") } };
}

APTHUD::APTHUD()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bTickEvenWhenPaused = true;
}

void APTHUD::SetMode(EPTUi NewMode)
{
	Mode = NewMode;
	ModeFrame = GFrameCounter;
}

void APTHUD::SetObjective(const FString& Title, const FString& Sub) { ObjTitle = Title; ObjSub = Sub; ObjFlash = 0.8f; }

void APTHUD::Toast(const FString& Text, int32 Kind, float Secs)
{
	Toasts.Add({ Text, Kind, Secs });
	if (Toasts.Num() > 5) Toasts.RemoveAt(0);
}

void APTHUD::Radio(const FString& From, const FString& Text) { RadioFrom = From; RadioText = Text; RadioT = 9.f; }

void APTHUD::ShowDialogue(const FString& Name, const FString& Role, const FString& Text, const TArray<FPTOption>& Options)
{
	DlgName = Name; DlgRole = Role; DlgText = Text; DlgOptions = Options; DlgSel = 0;
	SetMode(EPTUi::Dialogue);
}

void APTHUD::CloseDialogue() { if (Mode == EPTUi::Dialogue) SetMode(EPTUi::Play); }
void APTHUD::ShowInspect(const FString& Title, const FString& Text) { InsTitle = Title; InsText = Text; SetMode(EPTUi::Inspect); }

void APTHUD::ShowSummary(const FString& Title, const FString& Text, const TArray<TPair<FString, FString>>& Rows, bool bLast)
{
	SumTitle = Title; SumText = Text; SumRows = Rows; bSumLast = bLast;
	SetMode(EPTUi::Summary);
}

void APTHUD::UIUp() { if (Mode == EPTUi::Dialogue && DlgOptions.Num() && InputReady()) DlgSel = (DlgSel + DlgOptions.Num() - 1) % DlgOptions.Num(); }
void APTHUD::UIDown() { if (Mode == EPTUi::Dialogue && DlgOptions.Num() && InputReady()) DlgSel = (DlgSel + 1) % DlgOptions.Num(); }

void APTHUD::UIChoice(int32 Index)
{
	if (Mode != EPTUi::Dialogue || !InputReady() || !DlgOptions.IsValidIndex(Index)) return;
	const TFunction<void()> F = DlgOptions[Index].OnSelect;	// copy: the callback may replace the options
	if (F) F();
}

void APTHUD::UIConfirm()
{
	if (!InputReady()) return;
	switch (Mode)
	{
	case EPTUi::Welcome: SetMode(EPTUi::Play); Toast(TEXT("Shift started. Good luck, officer!"), 1); SetObjective(TEXT("Patrol the city"), TEXT("Get a feel for your cruiser. Dispatch will call shortly...")); break;
	case EPTUi::Dialogue: UIChoice(DlgSel); break;
	case EPTUi::Inspect: SetMode(EPTUi::Play); break;
	case EPTUi::Summary: SetMode(EPTUi::Play); break;
	default: break;
	}
}

void APTHUD::UIBack()
{
	if (!InputReady()) return;
	switch (Mode)
	{
	case EPTUi::Dialogue:
		for (int32 I = 0; I < DlgOptions.Num(); ++I) { if (DlgOptions[I].Style == 4) { UIChoice(I); return; } }
		break;
	case EPTUi::Inspect: case EPTUi::Notebook: case EPTUi::Map: SetMode(EPTUi::Play); break;
	case EPTUi::Pause: TogglePause(); break;
	default: break;
	}
}

void APTHUD::ToggleNotebook()
{
	if (!InputReady()) return;
	if (Mode == EPTUi::Play) SetMode(EPTUi::Notebook);
	else if (Mode == EPTUi::Notebook) SetMode(EPTUi::Play);
}

void APTHUD::ToggleMap()
{
	if (!InputReady()) return;
	if (Mode == EPTUi::Play) SetMode(EPTUi::Map);
	else if (Mode == EPTUi::Map) SetMode(EPTUi::Play);
}

void APTHUD::TogglePause()
{
	if (Mode == EPTUi::Play) { SetMode(EPTUi::Pause); UGameplayStatics::SetGamePaused(this, true); }
	else if (Mode == EPTUi::Pause) { SetMode(EPTUi::Play); UGameplayStatics::SetGamePaused(this, false); }
}

void APTHUD::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	for (FToast& T : Toasts) T.T -= DeltaSeconds;
	Toasts.RemoveAll([](const FToast& T) { return T.T <= 0.f; });
	RadioT -= DeltaSeconds;
	ObjFlash = FMath::Max(0.f, ObjFlash - DeltaSeconds);
}

// ------------------------------------------------------------------ drawing helpers

void APTHUD::Panel(float X, float Y, float W, float H, const FLinearColor& C) { DrawRect(C, X, Y, W, H); }

float APTHUD::TextW(const FString& T, float Size, UFont* F)
{
	float W = 0.f, H = 0.f;
	GetTextSize(T, W, H, F ? F : GEngine->GetLargeFont(), Size * Scale);
	return W;
}

float APTHUD::Txt(const FString& T, float X, float Y, const FLinearColor& C, float Size, UFont* F)
{
	UFont* Font = F ? F : GEngine->GetLargeFont();
	DrawText(T, C, X, Y, Font, Size * Scale);
	float W = 0.f, H = 0.f;
	GetTextSize(T, W, H, Font, Size * Scale);
	return H;
}

TArray<FString> APTHUD::Wrap(const FString& T, float MaxW, float Size, UFont* F)
{
	TArray<FString> Out, Paragraphs;
	T.ParseIntoArray(Paragraphs, TEXT("\n"), false);
	for (const FString& P : Paragraphs)
	{
		TArray<FString> Words;
		P.ParseIntoArray(Words, TEXT(" "), true);
		FString Cur;
		for (const FString& Wd : Words)
		{
			const FString Try = Cur.IsEmpty() ? Wd : Cur + TEXT(" ") + Wd;
			if (TextW(Try, Size, F) > MaxW && !Cur.IsEmpty()) { Out.Add(Cur); Cur = Wd; }
			else Cur = Try;
		}
		Out.Add(Cur);
	}
	return Out;
}

float APTHUD::Wrapped(const FString& T, float X, float Y, float MaxW, const FLinearColor& C, float Size, float LineH)
{
	float Yy = Y;
	for (const FString& L : Wrap(T, MaxW, Size)) { Txt(L, X, Yy, C, Size); Yy += LineH * Scale; }
	return Yy - Y;
}

void APTHUD::Line(float X0, float Y0, float X1, float Y1, const FLinearColor& C, float W)
{
	Canvas->K2_DrawLine(FVector2D(X0, Y0), FVector2D(X1, Y1), W, C);
}

FString APTHUD::Rank() const
{
	const APTGameMode* GM = APTGameMode::Get(this);
	const int32 Sc = GM ? GM->Score : 0;
	return Sc < 1000 ? TEXT("Rookie Officer") : Sc < 2500 ? TEXT("Patrol Officer") : Sc < 4000 ? TEXT("Detective") : TEXT("Senior Detective");
}

// ------------------------------------------------------------------ main draw

void APTHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas) return;
	Scale = Canvas->ClipY / 1080.f;
	switch (Mode)
	{
	case EPTUi::Welcome: DrawWelcome(false); return;
	case EPTUi::Pause: DrawWelcome(true); return;
	default: break;
	}
	DrawPlay();
	if (Mode == EPTUi::Dialogue) DrawDialogue();
	if (Mode == EPTUi::Inspect) DrawInspect();
	if (Mode == EPTUi::Notebook) DrawNotebook();
	if (Mode == EPTUi::Summary) DrawSummary();
	if (Mode == EPTUi::Map)
	{
		const float Sz = Canvas->ClipY * 0.86f;
		DrawRect(FLinearColor(0, 0, 0, 0.6f), 0, 0, Canvas->ClipX, Canvas->ClipY);
		DrawMinimap((Canvas->ClipX - Sz) * 0.5f, Canvas->ClipY * 0.07f, Sz, APTCity::HALF + 1500.f, true);
		Txt(TEXT("[M] / [View] to close  -  blue = objective"), (Canvas->ClipX - 380.f * Scale) * 0.5f, Canvas->ClipY * 0.95f, MUTED, 0.75f);
	}
}

void APTHUD::DrawPlay()
{
	APTGameMode* GM = APTGameMode::Get(this);
	if (!GM) return;
	const float W = Canvas->ClipX, H = Canvas->ClipY, Sc = Scale;

	// objective
	{
		const float PW = 560.f * Sc;
		const TArray<FString> Lines = Wrap(ObjSub, PW - 40.f * Sc, 0.7f);
		const float PH = (78.f + Lines.Num() * 24.f) * Sc;
		Panel(24 * Sc, 24 * Sc, PW, PH, ObjFlash > 0.f ? FLinearColor(0.5f, 0.38f, 0.05f, 0.85f) : FLinearColor(0.02f, 0.035f, 0.07f, 0.82f));
		DrawRect(GOLD, 24 * Sc, 24 * Sc, 5 * Sc, PH);
		Txt(TEXT("OBJECTIVE"), 44 * Sc, 32 * Sc, GOLD, 0.6f);
		Txt(ObjTitle, 44 * Sc, 52 * Sc, TEXT_C, 0.95f);
		float Y = 88 * Sc;
		for (const FString& L : Lines) { Txt(L, 44 * Sc, Y, MUTED, 0.7f); Y += 24 * Sc; }
	}
	// score
	Panel(W - 300 * Sc, 24 * Sc, 276 * Sc, 92 * Sc);
	Txt(FString::Printf(TEXT("SCORE  %d"), GM->Score), W - 284 * Sc, 32 * Sc, TEXT_C, 0.8f);
	Txt(FString::Printf(TEXT("CASES CLOSED  %d"), GM->Solved), W - 284 * Sc, 58 * Sc, MUTED, 0.65f);
	Txt(Rank(), W - 284 * Sc, 82 * Sc, GOLD, 0.7f);

	// compass to objective
	FVector Tgt; FString Label;
	const FVector Me = GM->PlayerLocation();
	if (GM->Cases && GM->Cases->Target(Tgt, Label))
	{
		APlayerController* PC = GetOwningPlayerController();
		const float ViewYaw = PC ? PC->PlayerCameraManager->GetCameraRotation().Yaw : 0.f;
		const float Bearing = (Tgt - Me).Rotation().Yaw;
		const float Rel = FMath::DegreesToRadians(FMath::FindDeltaAngleDegrees(ViewYaw, Bearing));
		const float CX = W * 0.5f, CY = 58 * Sc;
		Panel(CX - 170 * Sc, 22 * Sc, 340 * Sc, 92 * Sc);
		const FVector2D Dir(FMath::Sin(Rel), -FMath::Cos(Rel));
		const FVector2D Side(-Dir.Y, Dir.X);
		const FVector2D Tip = FVector2D(CX, CY) + Dir * 22 * Sc, B1 = FVector2D(CX, CY) - Dir * 14 * Sc + Side * 14 * Sc, B2 = FVector2D(CX, CY) - Dir * 14 * Sc - Side * 14 * Sc;
		Line(Tip.X, Tip.Y, B1.X, B1.Y, ACCENT, 4 * Sc); Line(Tip.X, Tip.Y, B2.X, B2.Y, ACCENT, 4 * Sc); Line(B1.X, B1.Y, B2.X, B2.Y, ACCENT, 3 * Sc);
		const FString D = FString::Printf(TEXT("%d m  -  %s"), FMath::RoundToInt(FVector::Dist2D(Tgt, Me) / 100.f), *Label);
		Txt(D, CX - TextW(D, 0.65f) * 0.5f, CY + 28 * Sc, TEXT_C, 0.65f);
	}

	// radio
	if (RadioT > 0.f)
	{
		const float RW = 760 * Sc;
		const TArray<FString> L = Wrap(RadioText, RW - 36 * Sc, 0.7f);
		const float RH = (46 + L.Num() * 24) * Sc;
		const float RX = (W - RW) * 0.5f, RY = 128 * Sc;
		Panel(RX, RY, RW, RH, FLinearColor(0.03f, 0.1f, 0.04f, 0.9f));
		Txt(TEXT("RADIO  ") + RadioFrom, RX + 18 * Sc, RY + 8 * Sc, FLinearColor(0.55f, 1.f, 0.6f), 0.7f);
		float Y = RY + 36 * Sc;
		for (const FString& S : L) { Txt(S, RX + 18 * Sc, Y, FLinearColor(0.85f, 1.f, 0.86f), 0.7f); Y += 24 * Sc; }
	}

	// toasts
	{
		float Y = 140 * Sc;
		for (const FToast& T : Toasts)
		{
			const TArray<FString> L = Wrap(T.Text, 420 * Sc, 0.7f);
			const float TH = (16 + L.Num() * 24) * Sc;
			const float A = FMath::Clamp(T.T * 2.f, 0.f, 1.f);
			Panel(W - 474 * Sc, Y, 450 * Sc, TH, FLinearColor(0.02f, 0.035f, 0.07f, 0.82f * A));
			DrawRect(T.Kind == 1 ? GOOD : T.Kind == 2 ? BAD : ACCENT, W - 474 * Sc, Y, 5 * Sc, TH);
			float Yy = Y + 8 * Sc;
			for (const FString& S : L) { Txt(S, W - 458 * Sc, Yy, TEXT_C * FLinearColor(1, 1, 1, A), 0.7f); Yy += 24 * Sc; }
			Y += TH + 8 * Sc;
		}
	}

	// minimap
	DrawMinimap(24 * Sc, H - 304 * Sc, 280 * Sc, GM->IsDriving() ? 13000.f : 5500.f, false);

	// speedometer / health
	if (GM->IsDriving() && GM->Car)
	{
		const float X = W - 284 * Sc, Y = H - 150 * Sc;
		Panel(X, Y, 260 * Sc, 126 * Sc);
		const float Kmh = GM->Car->SpeedKmh();
		Txt(FString::Printf(TEXT("%d"), FMath::RoundToInt(Kmh)), X + 18 * Sc, Y + 6 * Sc, TEXT_C, 2.2f);
		Txt(TEXT("km/h"), X + 150 * Sc, Y + 48 * Sc, MUTED, 0.7f);
		Txt(GM->Car->SignedSpeed() < -50.f ? TEXT("R") : Kmh < 1.f ? TEXT("N") : TEXT("D"), X + 220 * Sc, Y + 16 * Sc, GOLD, 1.3f);
		DrawRect(FLinearColor(1, 1, 1, 0.12f), X + 18 * Sc, Y + 88 * Sc, 224 * Sc, 6 * Sc);
		DrawRect(FLinearColor::LerpUsingHSV(ACCENT, BAD, FMath::Min(1.f, Kmh / 140.f)), X + 18 * Sc, Y + 88 * Sc, 224 * Sc * FMath::Min(1.f, Kmh / 140.f), 6 * Sc);
		const bool bOn = GM->Car->IsSirenOn();
		const bool bRed = FMath::Fmod(GetWorld()->GetTimeSeconds(), 0.5f) < 0.25f;
		Txt(TEXT("SIREN"), X + 18 * Sc, Y + 100 * Sc, bOn ? (bRed ? BAD : ACCENT) : FLinearColor(0.35f, 0.38f, 0.45f), 0.6f);
	}
	else if (GM->Officer)
	{
		APTOfficer* O = GM->Officer;
		if (O->bWeaponDrawn || O->Health < 100.f)
		{
			const float X = W - 304 * Sc, Y = H - 80 * Sc;
			Panel(X, Y, 280 * Sc, 56 * Sc);
			Txt(TEXT("HEALTH"), X + 14 * Sc, Y + 6 * Sc, MUTED, 0.55f);
			DrawRect(FLinearColor(1, 1, 1, 0.12f), X + 14 * Sc, Y + 32 * Sc, 252 * Sc, 12 * Sc);
			DrawRect(O->Health > 50.f ? GOOD : O->Health > 25.f ? GOLD : BAD, X + 14 * Sc, Y + 32 * Sc, 252 * Sc * O->Health / 100.f, 12 * Sc);
		}
		if (O->bWeaponDrawn)
		{
			const FString A = O->ReloadT > 0.f ? FString(TEXT("RELOADING...")) : FString::Printf(TEXT("AMMO %d / %d    SUSPECTS %d"), O->Ammo, APTOfficer::MAG, GM->Cases ? GM->Cases->AliveSuspects() : 0);
			Panel(W - 404 * Sc, H - 130 * Sc, 380 * Sc, 40 * Sc);
			Txt(A, W - 390 * Sc, H - 124 * Sc, TEXT_C, 0.7f);
			const float CX = W * 0.5f, CY = H * 0.5f, G = (O->bAimingNow ? 6.f : 12.f) * Sc, L = 8.f * Sc;
			Line(CX, CY - G - L, CX, CY - G, FLinearColor::White, 2.f); Line(CX, CY + G, CX, CY + G + L, FLinearColor::White, 2.f);
			Line(CX - G - L, CY, CX - G, CY, FLinearColor::White, 2.f); Line(CX + G, CY, CX + G + L, CY, FLinearColor::White, 2.f);
			if (O->HitFlash > 0.f)
			{
				const FLinearColor R(1.f, 0.3f, 0.3f, O->HitFlash * 3.f);
				Line(CX - 14 * Sc, CY - 14 * Sc, CX - 6 * Sc, CY - 6 * Sc, R, 3.f); Line(CX + 14 * Sc, CY + 14 * Sc, CX + 6 * Sc, CY + 6 * Sc, R, 3.f);
				Line(CX + 14 * Sc, CY - 14 * Sc, CX + 6 * Sc, CY - 6 * Sc, R, 3.f); Line(CX - 14 * Sc, CY + 14 * Sc, CX - 6 * Sc, CY + 6 * Sc, R, 3.f);
			}
		}
		const float Hurt = (100.f - O->Health) / 220.f + O->DamageFlash;
		if (Hurt > 0.01f) DrawRect(FLinearColor(0.6f, 0.f, 0.f, FMath::Min(0.55f, Hurt)), 0, 0, W, H);
	}

	// interaction prompt
	if (!Prompt.IsEmpty() && Mode == EPTUi::Play)
	{
		const float PW = TextW(Prompt, 0.85f) + 40 * Sc;
		Panel((W - PW) * 0.5f, H - 200 * Sc, PW, 48 * Sc);
		Txt(Prompt, (W - PW) * 0.5f + 20 * Sc, H - 190 * Sc, TEXT_C, 0.85f);
	}
}

void APTHUD::DrawMinimap(float X, float Y, float Size, float Range, bool bFull)
{
	APTGameMode* GM = APTGameMode::Get(this);
	if (!GM || !GM->City) return;
	const FVector Me = GM->PlayerLocation();
	const FVector Center = bFull ? FVector::ZeroVector : Me;
	const float K = Size / (Range * 2.f);
	const float CX = X + Size * 0.5f, CY = Y + Size * 0.5f;
	// screen right = world +Y, screen up = world +X (north)
	auto ToScreen = [&](const FVector& P) { return FVector2D(CX + (P.Y - Center.Y) * K, CY - (P.X - Center.X) * K); };
	auto ClipRect = [&](float X0, float Y0, float X1, float Y1, const FLinearColor& C) {
		const float A = FMath::Max(X0, X), B = FMath::Max(Y0, Y), Cc = FMath::Min(X1, X + Size), D = FMath::Min(Y1, Y + Size);
		if (Cc > A && D > B) DrawRect(C, A, B, Cc - A, D - B);
	};

	DrawRect(FLinearColor(0.12f, 0.2f, 0.1f, 0.95f), X, Y, Size, Size);
	const float Lim = APTCity::HALF + APTCity::ROAD * 0.5f;
	{
		const FVector2D A = ToScreen(FVector(Lim, -Lim, 0)), B = ToScreen(FVector(-Lim, Lim, 0));
		ClipRect(A.X, A.Y, B.X, B.Y, FLinearColor(0.07f, 0.075f, 0.085f));
	}
	for (const FPTBlock& B : GM->City->GetBlocks())
	{
		FLinearColor C(0.42f, 0.4f, 0.37f);
		switch (B.Type)
		{
		case EPTBlockType::Greens: case EPTBlockType::Park: C = FLinearColor(0.25f, 0.45f, 0.2f); break;
		case EPTBlockType::HQ: C = FLinearColor(0.22f, 0.33f, 0.6f); break;
		case EPTBlockType::Store: C = FLinearColor(0.65f, 0.45f, 0.2f); break;
		case EPTBlockType::Apartments: C = FLinearColor(0.6f, 0.33f, 0.25f); break;
		case EPTBlockType::Lot: C = FLinearColor(0.2f, 0.21f, 0.23f); break;
		case EPTBlockType::Warehouse: C = FLinearColor(0.35f, 0.4f, 0.41f); break;
		default: break;
		}
		const FVector2D A = ToScreen(FVector(B.Rect.Max.X, B.Rect.Min.Y, 0)), Bb = ToScreen(FVector(B.Rect.Min.X, B.Rect.Max.Y, 0));
		ClipRect(A.X, A.Y, Bb.X, Bb.Y, C);
	}
	auto Inside = [&](const FVector2D& P) { return P.X > X && P.X < X + Size && P.Y > Y && P.Y < Y + Size; };
	for (APTTrafficCar* T : GM->Traffic)
	{
		if (!T) continue;
		const FVector2D P = ToScreen(T->GetActorLocation());
		if (Inside(P)) DrawRect(FLinearColor(0.85f, 0.85f, 0.85f), P.X - 2, P.Y - 2, 4, 4);
	}
	// GPS route along the grid: start -> nearest intersection -> L-turn -> target
	FVector Tgt; FString Label;
	if (GM->Cases && GM->Cases->Target(Tgt, Label))
	{
		const FIntPoint A = GM->City->NearestIntersection(Me), B = GM->City->NearestIntersection(Tgt);
		const FVector IA(APTCity::RoadPos(A.X), APTCity::RoadPos(A.Y), 0), IB(APTCity::RoadPos(B.X), APTCity::RoadPos(B.Y), 0);
		const bool bAlongX = FMath::Abs(Me.Y - IA.Y) < FMath::Abs(Me.X - IA.X);
		const FVector Mid = bAlongX ? FVector(IB.X, IA.Y, 0) : FVector(IA.X, IB.Y, 0);
		const FVector Pts[5] = { Me, IA, Mid, IB, Tgt };
		for (int32 I = 0; I < 4; ++I)
		{
			FVector2D P0 = ToScreen(Pts[I]), P1 = ToScreen(Pts[I + 1]);
			// clip segment to the map square (simple clamp; segments are axis-aligned)
			P0.X = FMath::Clamp(P0.X, X, X + Size); P0.Y = FMath::Clamp(P0.Y, Y, Y + Size);
			P1.X = FMath::Clamp(P1.X, X, X + Size); P1.Y = FMath::Clamp(P1.Y, Y, Y + Size);
			Line(P0.X, P0.Y, P1.X, P1.Y, ACCENT, 4.f * Scale);
		}
		FVector2D T = ToScreen(Tgt);
		T.X = FMath::Clamp(T.X, X + 8.f, X + Size - 8.f); T.Y = FMath::Clamp(T.Y, Y + 8.f, Y + Size - 8.f);
		DrawRect(FLinearColor::White, T.X - 8 * Scale, T.Y - 8 * Scale, 16 * Scale, 16 * Scale);
		DrawRect(ACCENT, T.X - 6 * Scale, T.Y - 6 * Scale, 12 * Scale, 12 * Scale);
	}
	if (!GM->IsDriving() && GM->Car)
	{
		const FVector2D P = ToScreen(GM->Car->GetActorLocation());
		if (Inside(P)) DrawRect(FLinearColor::White, P.X - 4, P.Y - 6, 8, 12);
	}
	// player arrow
	const float Yaw = FMath::DegreesToRadians(GM->PlayerYaw());
	const FVector2D P = ToScreen(Me), D(FMath::Sin(Yaw), -FMath::Cos(Yaw)), Sd(-D.Y, D.X);
	const float A = (bFull ? 12.f : 10.f) * Scale;
	const FVector2D Tip = P + D * A * 1.3f, L = P - D * A + Sd * A * 0.8f, R = P - D * A - Sd * A * 0.8f;
	Line(Tip.X, Tip.Y, L.X, L.Y, GOLD, 3.f); Line(Tip.X, Tip.Y, R.X, R.Y, GOLD, 3.f); Line(L.X, L.Y, R.X, R.Y, GOLD, 3.f);
	// frame + north
	Line(X, Y, X + Size, Y, FLinearColor::White, 2.f); Line(X, Y + Size, X + Size, Y + Size, FLinearColor::White, 2.f);
	Line(X, Y, X, Y + Size, FLinearColor::White, 2.f); Line(X + Size, Y, X + Size, Y + Size, FLinearColor::White, 2.f);
	Txt(TEXT("N"), X + Size * 0.5f - 6 * Scale, Y + 4 * Scale, FLinearColor::White, 0.7f);
	if (bFull)
	{
		auto Lbl = [&](int32 BX, int32 BY, const TCHAR* Name) {
			if (const FPTBlock* B = GM->City->GetBlock(BX, BY))
			{
				const FVector2D C = ToScreen(FVector(B->Center, 0));
				Txt(Name, C.X - TextW(Name, 0.6f) * 0.5f, C.Y - 10 * Scale, FLinearColor::White, 0.6f);
			}
		};
		Lbl(2, 2, TEXT("POLICE HQ")); Lbl(1, 1, TEXT("QUIK-STOP")); Lbl(4, 1, TEXT("GREENWAY PARK"));
		Lbl(1, 4, TEXT("ELM ST APTS")); Lbl(4, 4, TEXT("LUCANO'S")); Lbl(5, 2, TEXT("DOCKSIDE"));
	}
}

void APTHUD::DrawDialogue()
{
	const float W = Canvas->ClipX, H = Canvas->ClipY, Sc = Scale;
	const float PW = FMath::Min(1100.f * Sc, W * 0.9f);
	const TArray<FString> Body = Wrap(DlgText, PW - 48 * Sc, 0.85f);
	const float PH = (100 + Body.Num() * 30 + DlgOptions.Num() * 44) * Sc;
	const float X = (W - PW) * 0.5f, Y = H - PH - 30 * Sc;
	Panel(X, Y, PW, PH, FLinearColor(0.015f, 0.025f, 0.05f, 0.9f));
	Txt(DlgName, X + 24 * Sc, Y + 14 * Sc, ACCENT, 1.f);
	Txt(DlgRole, X + 40 * Sc + TextW(DlgName, 1.f), Y + 20 * Sc, MUTED, 0.7f);
	float Yy = Y + 56 * Sc;
	for (const FString& L : Body) { Txt(L, X + 24 * Sc, Yy, TEXT_C, 0.85f); Yy += 30 * Sc; }
	Yy += 10 * Sc;
	for (int32 I = 0; I < DlgOptions.Num(); ++I)
	{
		const FPTOption& O = DlgOptions[I];
		const bool bSel = I == DlgSel;
		Panel(X + 20 * Sc, Yy, PW - 40 * Sc, 38 * Sc, bSel ? FLinearColor(0.1f, 0.35f, 0.55f, 0.6f) : FLinearColor(1, 1, 1, 0.05f));
		const FLinearColor C = O.Style == 1 ? MUTED : O.Style == 2 ? GOLD : O.Style == 3 ? FLinearColor(1.f, 0.55f, 0.4f) : O.Style == 4 ? MUTED : TEXT_C;
		Txt(FString::Printf(TEXT("%d   %s"), I + 1, *O.Label), X + 34 * Sc, Yy + 7 * Sc, C, 0.8f);
		Yy += 44 * Sc;
	}
	Txt(TEXT("1-9 / Up Down + Enter  -  Controller: D-pad + A, B = goodbye  -  * = new lead from evidence"), X + 24 * Sc, Y + PH - 26 * Sc, MUTED, 0.55f);
}

void APTHUD::DrawInspect()
{
	const float W = Canvas->ClipX, H = Canvas->ClipY, Sc = Scale;
	const float PW = 680 * Sc;
	const TArray<FString> L = Wrap(InsText, PW - 56 * Sc, 0.8f);
	const float PH = (150 + L.Num() * 28) * Sc;
	const float X = (W - PW) * 0.5f, Y = (H - PH) * 0.5f;
	Panel(X, Y, PW, PH, FLinearColor(0.015f, 0.025f, 0.05f, 0.95f));
	DrawRect(GOLD, X, Y, PW, 4 * Sc);
	Txt(TEXT("EVIDENCE COLLECTED"), X + 28 * Sc, Y + 18 * Sc, GOLD, 0.6f);
	Txt(InsTitle, X + 28 * Sc, Y + 42 * Sc, TEXT_C, 1.1f);
	float Yy = Y + 90 * Sc;
	for (const FString& S : L) { Txt(S, X + 28 * Sc, Yy, FLinearColor(0.84f, 0.87f, 0.92f), 0.8f); Yy += 28 * Sc; }
	Txt(TEXT("[E] / [Enter] / [A]  add to notebook"), X + 28 * Sc, Y + PH - 34 * Sc, MUTED, 0.6f);
}

void APTHUD::DrawNotebook()
{
	APTGameMode* GM = APTGameMode::Get(this);
	const float W = Canvas->ClipX, H = Canvas->ClipY, Sc = Scale;
	const float PW = FMath::Min(1200.f * Sc, W * 0.9f), PH = H * 0.84f;
	const float X = (W - PW) * 0.5f, Y = (H - PH) * 0.5f;
	const FLinearColor Ink(0.13f, 0.12f, 0.1f), Paper(0.93f, 0.89f, 0.8f, 0.98f), Faded(0.42f, 0.38f, 0.3f);
	Panel(X, Y, PW, PH, Paper);
	Txt(TEXT("CASE NOTEBOOK"), X + 32 * Sc, Y + 20 * Sc, Ink, 1.2f);
	float Yy = Y + 70 * Sc;
	const UPTCaseManager* CM = GM ? GM->Cases.Get() : nullptr;
	const FPTCase* C = CM ? CM->Current() : nullptr;
	if (!C || CM->State == EPTCaseState::Patrol)
	{
		Txt(TEXT("No active investigation. Patrol the city and wait for dispatch."), X + 32 * Sc, Yy, Faded, 0.8f);
	}
	else if (CM->State == EPTCaseState::Respond)
	{
		Txt(TEXT("Responding to: ") + C->Title, X + 32 * Sc, Yy, Ink, 0.9f);
		Wrapped(C->Dispatch, X + 32 * Sc, Yy + 40 * Sc, PW - 64 * Sc, Faded, 0.75f, 26.f);
	}
	else
	{
		Txt(C->Title, X + 32 * Sc, Yy, Ink, 1.f); Yy += 34 * Sc;
		Txt(C->Location, X + 32 * Sc, Yy, Faded, 0.7f); Yy += 30 * Sc;
		Txt(FString::Printf(TEXT("%s   Evidence: %d collected, %d needed to accuse."), *C->Brief, CM->Found.Num(), C->MinEvidence), X + 32 * Sc, Yy, Ink, 0.7f);
		Yy += 40 * Sc;
		const float ColW = (PW - 96 * Sc) * 0.5f;
		float Y0 = Yy, Y1 = Yy;
		for (int32 I = 0; I < CM->Found.Num(); ++I)
		{
			const FPTEvidence* E = C->FindEvidence(CM->Found[I]);
			if (!E) continue;
			float& Col = (I % 2) ? Y1 : Y0;
			const float Cx = X + 32 * Sc + (I % 2) * (ColW + 32 * Sc);
			const TArray<FString> L = Wrap(E->Text, ColW - 24 * Sc, 0.62f);
			const float BH = (58 + L.Num() * 21) * Sc;
			if (Col + BH > Y + PH - 50 * Sc) continue;
			Panel(Cx, Col, ColW, BH, FLinearColor(1.f, 0.98f, 0.94f, 1.f));
			DrawRect(E->bStatement ? FLinearColor(0.2f, 0.45f, 0.85f) : FLinearColor(0.85f, 0.6f, 0.2f), Cx, Col, 5 * Sc, BH);
			Txt(E->bStatement ? TEXT("STATEMENT") : TEXT("PHYSICAL EVIDENCE"), Cx + 14 * Sc, Col + 6 * Sc, Faded, 0.5f);
			Txt(E->Name, Cx + 14 * Sc, Col + 24 * Sc, Ink, 0.72f);
			float Ly = Col + 50 * Sc;
			for (const FString& S : L) { Txt(S, Cx + 14 * Sc, Ly, Ink, 0.62f); Ly += 21 * Sc; }
			Col += BH + 12 * Sc;
		}
		if (CM->Found.Num() == 0) Txt(TEXT("Nothing yet. Look for yellow markers and talk to witnesses (blue)."), X + 32 * Sc, Yy, Faded, 0.75f);
	}
	Txt(TEXT("[Tab] / [RB] / [Esc] close"), X + 32 * Sc, Y + PH - 36 * Sc, Faded, 0.6f);
}

void APTHUD::DrawWelcome(bool bPause)
{
	const float W = Canvas->ClipX, H = Canvas->ClipY, Sc = Scale;
	DrawRect(FLinearColor(0.01f, 0.015f, 0.03f, bPause ? 0.8f : 0.72f), 0, 0, W, H);
	const float PW = FMath::Min(1500.f * Sc, W * 0.94f), PH = H * 0.9f;
	const float X = (W - PW) * 0.5f, Y = (H - PH) * 0.5f;
	Panel(X, Y, PW, PH, FLinearColor(0.02f, 0.035f, 0.07f, 0.96f));
	Txt(bPause ? TEXT("PAUSED") : TEXT("PRECINCT 12"), X + 40 * Sc, Y + 26 * Sc, TEXT_C, 2.f);
	float Yy = Y + 90 * Sc;
	if (!bPause)
	{
		Txt(TEXT("Patrol & Detective Simulator"), X + 40 * Sc, Yy, MUTED, 0.9f);
		Yy += 44 * Sc;
		Yy += Wrapped(TEXT("You are Officer Reyes. Drive your cruiser to dispatch calls, step out at crime scenes, inspect evidence (yellow markers), question witnesses (blue markers) and accuse the culprit once you have enough evidence. A few suspects won't come quietly - those cases end in a short, tactical standoff."),
			X + 40 * Sc, Yy, PW - 80 * Sc, FLinearColor(0.82f, 0.86f, 0.92f), 0.78f, 28.f);
		Yy += 18 * Sc;
	}
	const float C0 = X + 40 * Sc, C1 = X + 360 * Sc, C2 = X + 700 * Sc;
	auto Table = [&](const TCHAR* Title, const FCtl* Rows, int32 N) {
		Txt(Title, C0, Yy, GOLD, 0.75f); Yy += 30 * Sc;
		for (int32 I = 0; I < N; ++I)
		{
			Txt(Rows[I].Action, C0, Yy, TEXT_C, 0.68f);
			Txt(Rows[I].Keys, C1, Yy, ACCENT, 0.68f);
			Txt(Rows[I].Pad, C2, Yy, FLinearColor(0.75f, 0.85f, 0.75f), 0.68f);
			Yy += 25 * Sc;
		}
		Yy += 10 * Sc;
	};
	Txt(TEXT("ACTION"), C0, Yy, MUTED, 0.6f); Txt(TEXT("KEYBOARD / MOUSE"), C1, Yy, MUTED, 0.6f); Txt(TEXT("XBOX CONTROLLER / WHEEL"), C2, Yy, MUTED, 0.6f);
	Yy += 28 * Sc;
	Table(TEXT("DRIVING"), DRIVE, UE_ARRAY_COUNT(DRIVE));
	Table(TEXT("ON FOOT"), FOOT, UE_ARRAY_COUNT(FOOT));
	Table(TEXT("GENERAL"), GENERAL, UE_ARRAY_COUNT(GENERAL));

	const float SX = X + PW * 0.66f;
	float Sy = Y + (bPause ? 100.f : 250.f) * Sc;
	Txt(TEXT("XBOX STEERING WHEEL"), SX, Sy, ACCENT, 0.75f); Sy += 34 * Sc;
	Sy += Wrapped(TEXT("XInput wheels (Logitech G920/G923 Xbox, Thrustmaster TMX/T248 Xbox...) work like a controller: wheel = steering, RT pedal = throttle, LT pedal = brake. Plug the wheel in before starting the game."),
		SX, Sy, PW * 0.3f, FLinearColor(0.8f, 0.85f, 0.9f), 0.66f, 24.f);
	Sy += 20 * Sc;
	Txt(TEXT("TIPS"), SX, Sy, ACCENT, 0.75f); Sy += 34 * Sc;
	Sy += Wrapped(TEXT("Follow the blue GPS line on the minimap. Turn on the siren for a Code 3 bonus. * dialogue options are new leads unlocked by evidence. Your sidearm is only drawn during standoffs - use cover."),
		SX, Sy, PW * 0.3f, FLinearColor(0.8f, 0.85f, 0.9f), 0.66f, 24.f);

	const FString Go = bPause ? TEXT("Press P / Menu / Esc to resume") : TEXT("Press ENTER / SPACE or A to start your shift");
	const float GW = TextW(Go, 1.f) + 60 * Sc;
	Panel((W - GW) * 0.5f, Y + PH - 80 * Sc, GW, 54 * Sc, FLinearColor(0.12f, 0.45f, 0.7f, 0.95f));
	Txt(Go, (W - GW) * 0.5f + 30 * Sc, Y + PH - 70 * Sc, FLinearColor::White, 1.f);
}

void APTHUD::DrawSummary()
{
	APTGameMode* GM = APTGameMode::Get(this);
	const float W = Canvas->ClipX, H = Canvas->ClipY, Sc = Scale;
	DrawRect(FLinearColor(0, 0, 0, 0.55f), 0, 0, W, H);
	const float PW = 760 * Sc;
	const TArray<FString> L = Wrap(SumText, PW - 64 * Sc, 0.75f);
	const float PH = (240 + L.Num() * 26 + SumRows.Num() * 34 + (bSumLast ? 40 : 0)) * Sc;
	const float X = (W - PW) * 0.5f, Y = (H - PH) * 0.5f;
	Panel(X, Y, PW, PH, FLinearColor(0.02f, 0.035f, 0.07f, 0.97f));
	Txt(bSumLast ? TEXT("SHIFT COMPLETE!") : TEXT("CASE CLOSED"), X + 32 * Sc, Y + 22 * Sc, GOOD, 1.5f);
	Txt(SumTitle, X + 32 * Sc, Y + 78 * Sc, ACCENT, 0.8f);
	float Yy = Y + 116 * Sc;
	for (const FString& S : L) { Txt(S, X + 32 * Sc, Yy, TEXT_C, 0.75f); Yy += 26 * Sc; }
	Yy += 14 * Sc;
	for (const TPair<FString, FString>& R : SumRows)
	{
		Txt(R.Key, X + 32 * Sc, Yy, TEXT_C, 0.72f);
		Txt(R.Value, X + PW - 40 * Sc - TextW(R.Value, 0.72f), Yy, TEXT_C, 0.72f);
		Line(X + 32 * Sc, Yy + 30 * Sc, X + PW - 32 * Sc, Yy + 30 * Sc, FLinearColor(1, 1, 1, 0.1f));
		Yy += 34 * Sc;
	}
	const FString Total = FString::Printf(TEXT("%d   (%s)"), GM ? GM->Score : 0, *Rank());
	Txt(TEXT("Total score"), X + 32 * Sc, Yy, GOLD, 0.85f);
	Txt(Total, X + PW - 40 * Sc - TextW(Total, 0.85f), Yy, GOLD, 0.85f);
	Yy += 40 * Sc;
	if (bSumLast) { Txt(TEXT("Every case on today's roster is closed - dispatch keeps calling if you continue."), X + 32 * Sc, Yy, MUTED, 0.65f); }
	Txt(TEXT("[Enter] / [A]  continue patrol"), X + 32 * Sc, Y + PH - 36 * Sc, MUTED, 0.65f);
}
