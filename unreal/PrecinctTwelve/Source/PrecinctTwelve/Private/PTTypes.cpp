#include "PTTypes.h"
#include "PrecinctTwelve.h"
#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
	// Browser data is in metres with three.js axes (x, z) -> Unreal (X, Y) in cm.
	FVector2D Pos(const TSharedPtr<FJsonObject>& O)
	{
		return FVector2D(O->GetNumberField(TEXT("x")) * 100.0, O->GetNumberField(TEXT("z")) * 100.0);
	}

	// three.js yaw (forward = (sin ry, cos ry)) -> Unreal yaw in degrees.
	float Yaw(const TSharedPtr<FJsonObject>& O)
	{
		double Ry = 0.0;
		O->TryGetNumberField(TEXT("ry"), Ry);
		return FMath::RadiansToDegrees(FMath::Atan2(FMath::Cos(Ry), FMath::Sin(Ry)));
	}

	FString Str(const TSharedPtr<FJsonObject>& O, const TCHAR* Key)
	{
		FString S;
		O->TryGetStringField(Key, S);
		return S;
	}

	FPTLook ParseLook(const TSharedPtr<FJsonObject>* LookObj)
	{
		FPTLook L;
		if (!LookObj || !LookObj->IsValid())
		{
			return L;
		}
		const TSharedPtr<FJsonObject>& O = *LookObj;
		auto Col = [&O](const TCHAR* K, FLinearColor& Out) { FString S; if (O->TryGetStringField(K, S)) { Out = PTCases::Hex(S, Out); } };
		auto Opt = [&O](const TCHAR* K, TOptional<FLinearColor>& Out) { FString S; if (O->TryGetStringField(K, S)) { Out = PTCases::Hex(S, FLinearColor::White); } };
		Col(TEXT("skin"), L.Skin); Col(TEXT("shirt"), L.Shirt); Col(TEXT("pants"), L.Pants);
		Col(TEXT("hair"), L.Hair); Col(TEXT("shoes"), L.Shoes);
		Opt(TEXT("hat"), L.Hat); Opt(TEXT("vest"), L.Vest); Opt(TEXT("scarf"), L.Scarf);
		Opt(TEXT("hood"), L.Hood); Opt(TEXT("sleeve"), L.Sleeve);
		O->TryGetBoolField(TEXT("badge"), L.bBadge);
		double Sc = 1.0;
		if (O->TryGetNumberField(TEXT("scale"), Sc)) { L.Scale = Sc; }
		return L;
	}
}

FLinearColor PTCases::Hex(const FString& S, const FLinearColor& Fallback)
{
	if (!S.StartsWith(TEXT("#")) || S.Len() < 7)
	{
		return Fallback;
	}
	return FLinearColor(FColor::FromHex(S));
}

bool PTCases::Load(TArray<FPTCase>& Out)
{
	const FString File = FPaths::ProjectContentDir() / TEXT("Data/Cases.json");
	FString Text;
	if (!FFileHelper::LoadFileToString(Text, *File))
	{
		UE_LOG(LogPrecinct, Error, TEXT("Cannot read %s"), *File);
		return false;
	}
	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
	{
		UE_LOG(LogPrecinct, Error, TEXT("Cases.json is not valid JSON"));
		return false;
	}

	for (const TSharedPtr<FJsonValue>& CV : Root->GetArrayField(TEXT("cases")))
	{
		const TSharedPtr<FJsonObject> C = CV->AsObject();
		FPTCase K;
		K.Id = Str(C, TEXT("id"));
		K.Title = Str(C, TEXT("title"));
		K.Location = Str(C, TEXT("location"));
		K.Dispatch = Str(C, TEXT("dispatch"));
		K.Brief = Str(C, TEXT("brief"));
		K.Culprit = Str(C, TEXT("culprit"));
		K.ArrestText = Str(C, TEXT("arrestText"));
		K.StandoffText = Str(C, TEXT("standoffText"));
		K.MinEvidence = C->GetIntegerField(TEXT("minEvidence"));
		C->TryGetBoolField(TEXT("armed"), K.bArmed);
		const TArray<TSharedPtr<FJsonValue>>& B = C->GetArrayField(TEXT("block"));
		K.Block = FIntPoint(static_cast<int32>(B[0]->AsNumber()), static_cast<int32>(B[1]->AsNumber()));

		for (const TSharedPtr<FJsonValue>& EV : C->GetArrayField(TEXT("evidence")))
		{
			const TSharedPtr<FJsonObject> E = EV->AsObject();
			FPTEvidence X;
			X.Id = Str(E, TEXT("id")); X.Name = Str(E, TEXT("name")); X.Text = Str(E, TEXT("text"));
			X.bStatement = Str(E, TEXT("kind")) == TEXT("statement");
			K.Evidence.Add(X);
		}
		for (const TSharedPtr<FJsonValue>& PV : C->GetArrayField(TEXT("props")))
		{
			const TSharedPtr<FJsonObject> P = PV->AsObject();
			FPTProp X;
			X.Type = Str(P, TEXT("type")); X.Pos = Pos(P); X.Yaw = Yaw(P);
			P->TryGetBoolField(TEXT("cover"), X.bCover);
			const TSharedPtr<FJsonObject>* O = nullptr;
			if (P->TryGetObjectField(TEXT("o"), O))
			{
				FString Col;
				if ((*O)->TryGetStringField(TEXT("color"), Col)) { X.Color = Hex(Col, X.Color); X.bHasColor = true; }
				(*O)->TryGetBoolField(TEXT("damaged"), X.bDamaged);
			}
			K.Props.Add(X);
		}
		for (const TSharedPtr<FJsonValue>& LV : C->GetArrayField(TEXT("clues")))
		{
			const TSharedPtr<FJsonObject> L = LV->AsObject();
			FPTClue X;
			X.Ev = Str(L, TEXT("ev")); X.Prop = Str(L, TEXT("prop")); X.Pos = Pos(L); X.Yaw = Yaw(L);
			double Y = 0.0;
			if (L->TryGetNumberField(TEXT("y"), Y)) { X.Height = Y * 100.0; }
			K.Clues.Add(X);
		}
		for (const TSharedPtr<FJsonValue>& NV : C->GetArrayField(TEXT("npcs")))
		{
			const TSharedPtr<FJsonObject> N = NV->AsObject();
			FPTNpcDef X;
			X.Id = Str(N, TEXT("id")); X.Name = Str(N, TEXT("name")); X.Role = Str(N, TEXT("role"));
			X.Intro = Str(N, TEXT("intro")); X.Wrong = Str(N, TEXT("wrong"));
			X.Pos = Pos(N); X.Yaw = Yaw(N);
			const TSharedPtr<FJsonObject>* LookObj = nullptr;
			N->TryGetObjectField(TEXT("look"), LookObj);
			X.Look = ParseLook(LookObj);
			for (const TSharedPtr<FJsonValue>& TV : N->GetArrayField(TEXT("topics")))
			{
				const TSharedPtr<FJsonObject> T = TV->AsObject();
				FPTTopic Tp;
				Tp.Q = Str(T, TEXT("q")); Tp.A = Str(T, TEXT("a")); Tp.Gives = Str(T, TEXT("gives"));
				const TArray<TSharedPtr<FJsonValue>>* Req = nullptr;
				if (T->TryGetArrayField(TEXT("req"), Req))
				{
					for (const TSharedPtr<FJsonValue>& R : *Req) { Tp.Req.Add(R->AsString()); }
				}
				X.Topics.Add(Tp);
			}
			K.Npcs.Add(X);
		}
		const TArray<TSharedPtr<FJsonValue>>* Acc = nullptr;
		if (C->TryGetArrayField(TEXT("accomplices"), Acc))
		{
			for (const TSharedPtr<FJsonValue>& AV : *Acc)
			{
				const TSharedPtr<FJsonObject> A = AV->AsObject();
				FPTAccomplice X;
				X.Name = Str(A, TEXT("name")); X.Pos = Pos(A);
				const TSharedPtr<FJsonObject>* LookObj = nullptr;
				A->TryGetObjectField(TEXT("look"), LookObj);
				X.Look = ParseLook(LookObj);
				K.Accomplices.Add(X);
			}
		}
		Out.Add(MoveTemp(K));
	}
	UE_LOG(LogPrecinct, Log, TEXT("Loaded %d cases"), Out.Num());
	return Out.Num() > 0;
}
