#include "PTCaseManager.h"
#include "PTCity.h"
#include "PTGameMode.h"
#include "PTHUD.h"
#include "PTMaterials.h"
#include "PTOfficer.h"
#include "PTPoliceCar.h"
#include "PTProp.h"
#include "PTTraffic.h"
#include "Components/PointLightComponent.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"

namespace
{
	const FLinearColor YELLOW(1.f, 0.7f, 0.1f);
	const FLinearColor BLUE(0.15f, 0.6f, 1.f);
	const FLinearColor ORANGE(1.f, 0.35f, 0.1f);
}

void UPTCaseManager::Init(APTGameMode* InGM)
{
	GM = InGM;
	PTCases::Load(Cases);
}

APTHUD* UPTCaseManager::Hud() const
{
	APlayerController* PC = UGameplayStatics::GetPlayerController(GM, 0);
	return PC ? Cast<APTHUD>(PC->GetHUD()) : nullptr;
}

FVector UPTCaseManager::Anchor() const
{
	const FPTCase* C = Current();
	if (!C || !GM || !GM->City) return FVector::ZeroVector;
	const FPTBlock* B = GM->City->GetBlock(C->Block.X, C->Block.Y);
	return B ? FVector(B->Center, 20.f) : FVector::ZeroVector;
}

void UPTCaseManager::Start()
{
	Cleanup();
	if (Cases.Num() == 0) return;
	CurrentIdx = Next % Cases.Num();
	Next++;
	Found.Reset();
	Time = 0.f;
	ResponseBonus = 0;
	Wrong = 0;
	Spawn();
	State = EPTCaseState::Respond;
	const FPTCase& C = Cases[CurrentIdx];
	if (APTHUD* H = Hud())
	{
		H->Radio(TEXT("DISPATCH"), C.Dispatch);
		H->SetObjective(TEXT("Respond: ") + C.Title, C.Location + TEXT(" - follow the GPS route. Siren [H / X] for a faster-response bonus."));
	}
	if (GM->Officer) GM->Officer->PlayUi(1.4f);
}

void UPTCaseManager::Spawn()
{
	UWorld* W = GM->GetWorld();
	const FPTCase& C = Cases[CurrentIdx];
	const FVector A = Anchor();
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Covers.Reset();

	auto SpawnProp = [&](const FString& Type, const FVector2D& Pos, float Yaw, bool bCover, const FPTProp* Def) {
		const FVector L = A + FVector(Pos, 0.f);
		// props are laid out in browser space (x, z) so their yaw is offset by 90 degrees
		const FRotator R(0.f, Yaw - 90.f, 0.f);
		if (Type == TEXT("parkedcar") || Type == TEXT("van"))
		{
			APTTrafficCar* Car = W->SpawnActor<APTTrafficCar>(L, R, P);
			Car->InitParked(GM->City, false, Def && Def->bHasColor ? &Def->Color : nullptr, Type == TEXT("van"), Def && Def->bDamaged);
			SceneActors.Add(Car);
			return;
		}
		APTProp* Pr = W->SpawnActor<APTProp>(L, R, P);
		FVector Half;
		if (Pr->Build(Type, Def ? Def->Color : FLinearColor::White, Half) && bCover)
		{
			FPTCover Cv;
			Cv.Center = L;
			Cv.Half = FVector2D(FMath::Max(Half.X, Half.Y), FMath::Max(Half.X, Half.Y));
			Covers.Add(Cv);
		}
		SceneActors.Add(Pr);
	};

	for (const FPTProp& Pr : C.Props) SpawnProp(Pr.Type, Pr.Pos, Pr.Yaw, Pr.bCover, &Pr);
	for (const FPTClue& Cl : C.Clues)
	{
		if (!Cl.Prop.IsEmpty()) SpawnProp(Cl.Prop, Cl.Pos, Cl.Yaw, false, nullptr);
		const FVector L = A + FVector(Cl.Pos, Cl.Height + 2.f);
		APTMarker* M = W->SpawnActor<APTMarker>(L, FRotator::ZeroRotator, P);
		M->Setup(YELLOW);
		SceneActors.Add(M);
		FClueRef Ref;
		Ref.Ev = Cl.Ev; Ref.Pos = L; Ref.Marker = M;
		Clues.Add(Ref);
	}
	int32 Seed = CurrentIdx * 31;
	for (const FPTNpcDef& D : C.Npcs)
	{
		APTNPC* N = W->SpawnActor<APTNPC>(A + FVector(D.Pos, 110.f), FRotator(0.f, D.Yaw, 0.f), P);
		if (!N) continue;
		N->InitCase(D, Seed++);
		Npcs.Add(N);
		APTMarker* M = W->SpawnActor<APTMarker>(N->GetActorLocation(), FRotator::ZeroRotator, P);
		M->Setup(BLUE);
		M->AttachToActor(N, FAttachmentTransformRules::KeepWorldTransform);
		M->SetActorRelativeLocation(FVector(0, 0, 60.f));
		NpcMarkers.Add(N, M);
		SceneActors.Add(M);
	}

	// light beacon over the scene
	APTProp* B = W->SpawnActor<APTProp>(A + FVector(0, 2200.f, 0), FRotator::ZeroRotator, P);
	UMaterialInstanceDynamic* BM = PTMat::Make(B, EPTSurf::Emissive, BLUE);
	PTMat::SetEmissive(BM, BLUE, 6.f);
	PTMat::AddPart(B, B->GetRootComponent(), PTMat::Cylinder(), BM, FVector(0, 0, 6000.f), FVector(60.f, 60.f, 12000.f), FRotator::ZeroRotator, false, false);
	Beacon = B;
}

void UPTCaseManager::Cleanup()
{
	for (AActor* A : SceneActors) { if (IsValid(A)) A->Destroy(); }
	for (APTNPC* N : Npcs) { if (IsValid(N)) N->Destroy(); }
	for (APTNPC* N : Enemies) { if (IsValid(N) && !Npcs.Contains(N)) N->Destroy(); }
	if (IsValid(Beacon)) Beacon->Destroy();
	SceneActors.Reset(); Npcs.Reset(); Enemies.Reset(); NpcMarkers.Reset(); Clues.Reset(); Covers.Reset();
	Beacon = nullptr;
	Talking = nullptr;
}

bool UPTCaseManager::Has(const TArray<FString>& Req) const
{
	for (const FString& R : Req) { if (!Found.Contains(R)) return false; }
	return true;
}

bool UPTCaseManager::AddEvidence(const FString& Id)
{
	if (Id.IsEmpty() || Found.Contains(Id)) return false;
	Found.Add(Id);
	GM->AddScore(50);
	RefreshObjective();
	return true;
}

bool UPTCaseManager::CanAccuse() const
{
	const FPTCase* C = Current();
	return C && Found.Num() >= C->MinEvidence;
}

void UPTCaseManager::RefreshObjective()
{
	const FPTCase* C = Current();
	APTHUD* H = Hud();
	if (!C || !H || State != EPTCaseState::Investigate) return;
	if (!CanAccuse())
	{
		H->SetObjective(C->Brief, FString::Printf(TEXT("Evidence %d/%d - inspect yellow markers and question people (blue). Notebook [Tab / RB]"), Found.Num(), C->MinEvidence));
	}
	else
	{
		H->SetObjective(TEXT("Enough evidence - make an accusation"), TEXT("Talk to your prime suspect and choose \"Accuse\". Wrong accusations cost 150 points."));
	}
}

bool UPTCaseManager::Target(FVector& Out, FString& Label) const
{
	const FPTCase* C = Current();
	if (!C || !GM) return false;
	const FVector A = Anchor();
	if (State == EPTCaseState::Respond) { Out = A + FVector(0, 2800.f, 0); Label = C->Location; return true; }
	if (State == EPTCaseState::Wrapup && !GM->IsDriving() && GM->Car) { Out = GM->Car->GetActorLocation(); Label = TEXT("Your cruiser"); return true; }
	if ((State == EPTCaseState::Investigate || State == EPTCaseState::Standoff) && FVector::Dist2D(GM->PlayerLocation(), A) > 3800.f)
	{
		Out = A + FVector(0, 2000.f, 0); Label = TEXT("Crime scene"); return true;
	}
	return false;
}

FString UPTCaseManager::InteractPrompt() const
{
	if (State != EPTCaseState::Investigate || !GM || GM->IsDriving()) return FString();
	const FVector P = GM->PlayerLocation();
	float Best = TNumericLimits<float>::Max();
	FString Label;
	for (const FClueRef& C : Clues)
	{
		const float D = FVector::Dist2D(C.Pos, P);
		if (!C.bDone && D < 230.f && D < Best) { Best = D; Label = TEXT("Inspect evidence"); }
	}
	for (const APTNPC* N : Npcs)
	{
		if (!N || N->bGone || N->Mode != EPTNpcMode::Idle) continue;
		const float D = FVector::Dist2D(N->GetActorLocation(), P);
		if (D < 280.f && D < Best) { Best = D; Label = FString::Printf(TEXT("Talk to %s (%s)"), *N->Def.Name, *N->Def.Role); }
	}
	return Label;
}

void UPTCaseManager::TryInteract()
{
	if (State != EPTCaseState::Investigate || !GM || GM->IsDriving()) return;
	const FVector P = GM->PlayerLocation();
	float Best = TNumericLimits<float>::Max();
	FClueRef* BestClue = nullptr;
	APTNPC* BestNpc = nullptr;
	for (FClueRef& C : Clues)
	{
		const float D = FVector::Dist2D(C.Pos, P);
		if (!C.bDone && D < 230.f && D < Best) { Best = D; BestClue = &C; BestNpc = nullptr; }
	}
	for (APTNPC* N : Npcs)
	{
		if (!N || N->bGone || N->Mode != EPTNpcMode::Idle) continue;
		const float D = FVector::Dist2D(N->GetActorLocation(), P);
		if (D < 280.f && D < Best) { Best = D; BestNpc = N; BestClue = nullptr; }
	}
	APTHUD* H = Hud();
	if (BestClue && H)
	{
		BestClue->bDone = true;
		if (BestClue->Marker.IsValid()) BestClue->Marker->SetDone();
		AddEvidence(BestClue->Ev);
		if (const FPTEvidence* E = Current()->FindEvidence(BestClue->Ev)) H->ShowInspect(E->Name, E->Text);
		GM->Officer->PlayUi(1.8f);
	}
	else if (BestNpc && H)
	{
		Talking = BestNpc;
		BestNpc->bTalkingTo = true;
		GM->Officer->PlayUi(1.2f);
		NpcMenu(BestNpc, BestNpc->Def.Intro);
	}
}

void UPTCaseManager::NpcMenu(APTNPC* N, const FString& Text)
{
	APTHUD* H = Hud();
	if (!H) return;
	TArray<FPTOption> Opts;
	TWeakObjectPtr<APTNPC> WN(N);
	TWeakObjectPtr<UPTCaseManager> Self(this);
	for (const FPTTopic& T : N->Def.Topics)
	{
		if (!Has(T.Req)) continue;
		const bool bAsked = N->Asked.Contains(T.Q);
		FPTOption O;
		O.Label = (bAsked ? TEXT("(asked) ") : T.Req.Num() ? TEXT("* ") : TEXT("")) + T.Q;
		O.Style = bAsked ? 1 : T.Req.Num() ? 2 : 0;
		const FPTTopic Topic = T;
		O.OnSelect = [Self, WN, Topic]() {
			if (!Self.IsValid() || !WN.IsValid()) return;
			WN->Asked.Add(Topic.Q);
			FString Reply = Topic.A;
			if (Self->AddEvidence(Topic.Gives))
			{
				if (const FPTEvidence* E = Self->Current()->FindEvidence(Topic.Gives)) Reply += TEXT("\n\n[Notebook] ") + E->Name;
			}
			Self->NpcMenu(WN.Get(), Reply);
		};
		Opts.Add(O);
	}
	if (CanAccuse())
	{
		FPTOption O;
		O.Label = TEXT("Accuse ") + N->Def.Name;
		O.Style = 3;
		O.OnSelect = [Self, WN]() { if (Self.IsValid() && WN.IsValid()) Self->ConfirmAccuse(WN.Get()); };
		Opts.Add(O);
	}
	FPTOption Bye;
	Bye.Label = TEXT("Goodbye");
	Bye.Style = 4;
	Bye.OnSelect = [Self]() { if (Self.IsValid()) Self->EndTalk(); };
	Opts.Add(Bye);
	H->ShowDialogue(N->Def.Name, N->Def.Role, Text, Opts);
}

void UPTCaseManager::ConfirmAccuse(APTNPC* N)
{
	APTHUD* H = Hud();
	if (!H) return;
	TWeakObjectPtr<APTNPC> WN(N);
	TWeakObjectPtr<UPTCaseManager> Self(this);
	TArray<FPTOption> Opts;
	FPTOption Yes; Yes.Label = TEXT("Yes - you're under arrest."); Yes.Style = 3;
	Yes.OnSelect = [Self, WN]() { if (Self.IsValid() && WN.IsValid()) Self->Accuse(WN.Get()); };
	FPTOption No; No.Label = TEXT("Not yet."); No.Style = 4;
	No.OnSelect = [Self, WN]() { if (Self.IsValid() && WN.IsValid()) Self->NpcMenu(WN.Get(), TEXT("Is there something else, officer?")); };
	Opts.Add(Yes); Opts.Add(No);
	H->ShowDialogue(N->Def.Name, N->Def.Role, FString::Printf(TEXT("Accuse %s? You have %d pieces of evidence. A wrong accusation costs 150 points."), *N->Def.Name, Found.Num()), Opts);
}

void UPTCaseManager::Accuse(APTNPC* N)
{
	APTHUD* H = Hud();
	const FPTCase* C = Current();
	if (!H || !C) return;
	if (N->Def.Id != C->Culprit)
	{
		Wrong++;
		GM->AddScore(-150);
		H->Toast(TEXT("Wrong accusation! The evidence doesn't hold up (-150)."), 2);
		NpcMenu(N, N->Def.Wrong.IsEmpty() ? FString(TEXT("You've got nothing on me, officer.")) : N->Def.Wrong);
		return;
	}
	if (C->bArmed)
	{
		EndTalk();
		StartStandoff(N);
		return;
	}
	N->bArrested = true;
	N->SetSurrender(true);
	TWeakObjectPtr<UPTCaseManager> Self(this);
	TArray<FPTOption> Opts;
	FPTOption Done; Done.Label = TEXT("Cuff the suspect - case closed"); Done.Style = 3;
	Done.OnSelect = [Self]() { if (Self.IsValid()) { Self->EndTalk(); Self->Resolve(); } };
	Opts.Add(Done);
	H->ShowDialogue(N->Def.Name, TEXT("ARRESTED"), C->ArrestText, Opts);
}

void UPTCaseManager::EndTalk()
{
	if (Talking) Talking->bTalkingTo = false;
	Talking = nullptr;
	if (APTHUD* H = Hud()) H->CloseDialogue();
}

void UPTCaseManager::StartStandoff(APTNPC* Culprit)
{
	State = EPTCaseState::Standoff;
	const FPTCase* C = Current();
	const FVector A = Anchor();
	UWorld* W = GM->GetWorld();
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

	Enemies.Add(Culprit);
	if (TObjectPtr<APTMarker>* M = NpcMarkers.Find(Culprit)) { if (*M) (*M)->SetActorHiddenInGame(true); }
	int32 Seed = 900;
	for (const FPTAccomplice& Ac : C->Accomplices)
	{
		APTNPC* N = W->SpawnActor<APTNPC>(A + FVector(Ac.Pos, 110.f), FRotator::ZeroRotator, P);
		if (!N) continue;
		N->InitAccomplice(Ac.Name, Ac.Look, Seed++);
		Enemies.Add(N);
	}
	for (APTNPC* E : Enemies) E->MakeHostile();
	// bystanders run for it
	for (APTNPC* N : Npcs)
	{
		if (N == Culprit || !N) continue;
		FVector D = N->GetActorLocation() - Culprit->GetActorLocation();
		D.Z = 0.f;
		N->FleeTo(N->GetActorLocation() + D.GetSafeNormal() * 3000.f + FVector(0, 1000.f, 0));
		if (TObjectPtr<APTMarker>* M = NpcMarkers.Find(N)) { if (*M) (*M)->SetActorHiddenInGame(true); }
	}
	GM->Officer->bWeaponDrawn = true;
	GM->Officer->Ammo = APTOfficer::MAG;
	GM->Officer->PlayShot(0.6f, 0.8f);
	if (APTHUD* H = Hud())
	{
		H->Toast(C->StandoffText, 2, 5.f);
		H->SetObjective(TEXT("Neutralise the armed suspects"), TEXT("Use cover! Aim [RMB / LT], fire [LMB / RT], reload [R / X]."));
	}
}

int32 UPTCaseManager::AliveSuspects() const
{
	int32 N = 0;
	for (const APTNPC* E : Enemies) { if (E && E->Mode == EPTNpcMode::Hostile) N++; }
	return N;
}

bool UPTCaseManager::IsCoverTaken(int32 Index, const APTNPC* Asker) const
{
	for (const APTNPC* E : Enemies)
	{
		if (E && E != Asker && E->Mode == EPTNpcMode::Hostile && E->GetCoverIndex() == Index) return true;
	}
	return false;
}

void UPTCaseManager::OnSuspectDown(APTNPC* N)
{
	if (APTHUD* H = Hud()) H->Toast(N->DisplayName + TEXT(" is down - suspect in custody."), 1);
	if (State == EPTCaseState::Standoff && AliveSuspects() == 0)
	{
		GM->Officer->bWeaponDrawn = false;
		GM->Officer->SetAim(false);
		if (APTHUD* H = Hud()) H->Toast(TEXT("Area secure. All suspects in custody."), 1, 4.f);
		Resolve();
	}
}

void UPTCaseManager::OnPedestrianStruck()
{
	if (PedCd > 0.f) return;
	PedCd = 3.f;
	GM->AddScore(-50);
	if (APTHUD* H = Hud()) H->Toast(TEXT("Watch out for pedestrians! (-50)"), 2);
}

void UPTCaseManager::OnPlayerDown()
{
	GM->Officer->ResetHealth();
	const FVector A = Anchor();
	GM->Officer->TeleportTo(A + FVector(0, 2300.f, 100.f), FRotator(0, -90.f, 0));
	for (APTNPC* E : Enemies) { if (E) E->ResetHostile(); }
	GM->AddScore(-100);
	if (APTHUD* H = Hud()) H->Toast(TEXT("Backup patched you up. Try a different approach - use cover! (-100)"), 2, 5.f);
}

void UPTCaseManager::Resolve()
{
	const FPTCase* C = Current();
	State = EPTCaseState::Wrapup;
	const int32 EvBonus = Found.Num() * 25;
	const int32 TimeBonus = FMath::Max(0, FMath::RoundToInt(300.f - Time));
	GM->AddScore(500 + EvBonus + TimeBonus);
	GM->Solved++;
	if (IsValid(Beacon)) Beacon->SetActorHiddenInGame(true);
	if (APTHUD* H = Hud())
	{
		TArray<TPair<FString, FString>> Rows;
		Rows.Add(TPair<FString, FString>(TEXT("Case solved"), TEXT("+500")));
		Rows.Add(TPair<FString, FString>(TEXT("Evidence collected"), FString::Printf(TEXT("%d / %d  (+%d)"), Found.Num(), C->Evidence.Num(), EvBonus)));
		Rows.Add(TPair<FString, FString>(TEXT("Investigation speed"), FString::Printf(TEXT("+%d"), TimeBonus)));
		Rows.Add(TPair<FString, FString>(TEXT("Code 3 response bonus"), ResponseBonus ? FString::Printf(TEXT("+%d"), ResponseBonus) : FString(TEXT("-"))));
		Rows.Add(TPair<FString, FString>(TEXT("Wrong accusations"), Wrong ? FString::Printf(TEXT("%d (-%d)"), Wrong, Wrong * 150) : FString(TEXT("None"))));
		H->ShowSummary(C->Title, C->ArrestText, Rows, Next % Cases.Num() == 0);
		H->SetObjective(TEXT("Case closed - return to your cruiser"), TEXT("Get back in the car [F / Y] to resume patrol."));
	}
}

void UPTCaseManager::Tick(float Dt)
{
	if (!GM) return;
	PedCd -= Dt;
	const FVector Ref = GM->PlayerLocation();
	APTHUD* H = Hud();
	if (H && H->Mode == EPTUi::Welcome) return;

	switch (State)
	{
	case EPTCaseState::Patrol:
		Timer -= Dt;
		if (CurrentIdx >= 0 && SceneActors.Num() && FVector::Dist2D(Ref, Anchor()) > 11000.f) Cleanup();
		if (Timer <= 0.f) Start();
		break;
	case EPTCaseState::Respond:
	{
		Time += Dt;
		const FVector A = Anchor();
		if (FVector::Dist2D(Ref, A + FVector(0, 2600.f, 0)) < 2000.f)
		{
			State = EPTCaseState::Investigate;
			if (IsValid(Beacon)) Beacon->SetActorHiddenInGame(true);
			if (GM->Car && GM->Car->IsSirenOn() && Time < 75.f)
			{
				ResponseBonus = 150;
				GM->AddScore(150);
				if (H) H->Toast(TEXT("Code 3 response: +150"), 1);
			}
			Time = 0.f;
			if (H) H->Toast(TEXT("Arrived on scene. Exit the vehicle [F / Y] to investigate."), 0, 4.f);
			RefreshObjective();
		}
		break;
	}
	case EPTCaseState::Investigate:
	case EPTCaseState::Standoff:
		Time += Dt;
		if (State == EPTCaseState::Standoff && GM->Officer && GM->Officer->Health <= 0.f) OnPlayerDown();
		break;
	case EPTCaseState::Wrapup:
		if (GM->IsDriving())
		{
			State = EPTCaseState::Patrol;
			Timer = 12.f;
			if (H) H->SetObjective(TEXT("Patrol the city"), TEXT("Drive around and wait for the next dispatch call..."));
		}
		break;
	}

	// person markers: blue = new things to say, orange = ready to accuse
	for (auto& KV : NpcMarkers)
	{
		APTNPC* N = KV.Key;
		APTMarker* M = KV.Value;
		if (!N || !M) continue;
		bool bPending = false;
		for (const FPTTopic& T : N->Def.Topics) { if (Has(T.Req) && !N->Asked.Contains(T.Q)) { bPending = true; break; } }
		const bool bShow = State == EPTCaseState::Investigate && !N->bGone && (bPending || CanAccuse());
		M->SetActorHiddenInGame(!bShow);
		M->SetColor(bPending ? BLUE : ORANGE);
	}
}
