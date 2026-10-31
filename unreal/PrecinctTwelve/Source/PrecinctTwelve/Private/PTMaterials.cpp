#include "PTMaterials.h"
#include "PTSettings.h"
#include "Engine/StaticMesh.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/Actor.h"
#include "Engine/Texture2D.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"

namespace
{
	UMaterialInterface* Master()
	{
		static TWeakObjectPtr<UMaterialInterface> Cached;
		static bool bTried = false;
		if (!bTried)
		{
			bTried = true;
			Cached = GetDefault<UPTSettings>()->SurfaceMaterial.LoadSynchronous();
		}
		return Cached.Get();
	}

	UMaterialInterface* Basic()
	{
		static TWeakObjectPtr<UMaterialInterface> Cached;
		if (!Cached.IsValid())
		{
			Cached = LoadObject<UMaterialInterface>(nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
		}
		return Cached.Get();
	}

	UTexture2D* Tex(const FString& Name, const TCHAR* Suffix)
	{
		static TMap<FString, TWeakObjectPtr<UTexture2D>> Cache;
		const FString Key = Name + Suffix;
		if (TWeakObjectPtr<UTexture2D>* Found = Cache.Find(Key))
		{
			if (Found->IsValid()) { return Found->Get(); }
		}
		const FString Folder = GetDefault<UPTSettings>()->TextureFolder;
		const FString Asset = FString::Printf(TEXT("T_%s_%s"), *Name, Suffix);
		UTexture2D* T = LoadObject<UTexture2D>(nullptr, *FString::Printf(TEXT("%s/%s.%s"), *Folder, *Asset, *Asset));
		Cache.Add(Key, T);
		return T;
	}

	UStaticMesh* Shape(const TCHAR* Path)
	{
		return LoadObject<UStaticMesh>(nullptr, Path);
	}

	struct FPreset
	{
		const TCHAR* Tex;		// texture set name or nullptr
		FLinearColor Color;		// base tint
		float Roughness;		// multiplier on roughness texture (or absolute when untextured)
		float Metallic;
		float Scale;			// texture repeats per metre
		float NormalStrength;
	};

	FPreset Preset(EPTSurf S)
	{
		switch (S)
		{
		case EPTSurf::Asphalt:   return { TEXT("Asphalt"), FLinearColor(1, 1, 1), 1.0f, 0.f, 1.f / 7.f, 1.0f };
		case EPTSurf::Concrete:  return { TEXT("Concrete"), FLinearColor(1, 1, 1), 1.0f, 0.f, 1.f / 3.f, 1.0f };
		case EPTSurf::Brick:     return { TEXT("Brick"), FLinearColor(1, 1, 1), 1.0f, 0.f, 1.f / 2.4f, 1.3f };
		case EPTSurf::Plaster:   return { TEXT("Plaster"), FLinearColor(1, 1, 1), 1.0f, 0.f, 1.f / 4.f, 0.6f };
		case EPTSurf::Panels:    return { TEXT("Panels"), FLinearColor(1, 1, 1), 1.0f, 0.f, 1.f / 4.f, 0.8f };
		case EPTSurf::Curtain:   return { TEXT("Curtain"), FLinearColor(1, 1, 1), 1.0f, 0.8f, 1.f / 4.f, 0.4f };
		case EPTSurf::Metal:     return { TEXT("Metal"), FLinearColor(0.75f, 0.8f, 0.82f), 1.0f, 0.6f, 1.f / 4.f, 1.2f };
		case EPTSurf::Grass:     return { TEXT("Grass"), FLinearColor(1, 1, 1), 1.0f, 0.f, 1.f / 5.f, 1.2f };
		case EPTSurf::Leaves:    return { TEXT("Leaves"), FLinearColor(1, 1, 1), 1.0f, 0.f, 1.f / 1.5f, 1.5f };
		case EPTSurf::Roof:      return { TEXT("Asphalt"), FLinearColor(0.6f, 0.58f, 0.55f), 1.0f, 0.f, 1.f / 5.f, 0.8f };
		case EPTSurf::Paint:     return { nullptr, FLinearColor(0.9f, 0.9f, 0.9f), 0.6f, 0.f, 1.f, 0.f };
		case EPTSurf::Glass:     return { nullptr, FLinearColor(0.02f, 0.025f, 0.03f), 0.05f, 0.9f, 1.f, 0.f };
		case EPTSurf::ShopGlass: return { nullptr, FLinearColor(0.05f, 0.06f, 0.07f), 0.06f, 0.6f, 1.f, 0.f };
		case EPTSurf::CarPaint:  return { nullptr, FLinearColor(0.2f, 0.2f, 0.2f), 0.22f, 0.45f, 1.f, 0.f };
		case EPTSurf::Chrome:    return { nullptr, FLinearColor(0.9f, 0.9f, 0.9f), 0.12f, 1.f, 1.f, 0.f };
		case EPTSurf::Rubber:    return { nullptr, FLinearColor(0.02f, 0.02f, 0.02f), 0.9f, 0.f, 1.f, 0.f };
		case EPTSurf::Plastic:   return { nullptr, FLinearColor(0.025f, 0.025f, 0.028f), 0.5f, 0.f, 1.f, 0.f };
		case EPTSurf::Cloth:     return { TEXT("Plaster"), FLinearColor(1, 1, 1), 1.0f, 0.f, 4.f, 0.4f };
		case EPTSurf::Skin:      return { nullptr, FLinearColor(0.7f, 0.5f, 0.4f), 0.55f, 0.f, 1.f, 0.f };
		case EPTSurf::Wood:      return { TEXT("Panels"), FLinearColor(0.55f, 0.35f, 0.18f), 1.0f, 0.f, 1.f, 0.5f };
		case EPTSurf::Emissive:  return { nullptr, FLinearColor(0.1f, 0.1f, 0.1f), 0.3f, 0.f, 1.f, 0.f };
		}
		return { nullptr, FLinearColor::White, 0.7f, 0.f, 1.f, 0.f };
	}
}

bool PTMat::HasMaster()
{
	return Master() != nullptr;
}

UMaterialInstanceDynamic* PTMat::Make(UObject* Outer, EPTSurf Surf, const FLinearColor& Tint)
{
	const FPreset P = Preset(Surf);
	const FLinearColor Color = P.Color * Tint;
	if (UMaterialInterface* M = Master())
	{
		UMaterialInstanceDynamic* D = UMaterialInstanceDynamic::Create(M, Outer);
		D->SetVectorParameterValue(TEXT("Tint"), Color);
		D->SetScalarParameterValue(TEXT("Roughness"), P.Roughness);
		D->SetScalarParameterValue(TEXT("Metallic"), P.Metallic);
		D->SetScalarParameterValue(TEXT("UVScale"), P.Scale / 100.f);	// world units are cm
		D->SetScalarParameterValue(TEXT("NormalStrength"), P.NormalStrength);
		if (P.Tex)
		{
			if (UTexture2D* T = Tex(P.Tex, TEXT("D"))) { D->SetTextureParameterValue(TEXT("BaseTex"), T); }
			if (UTexture2D* T = Tex(P.Tex, TEXT("N"))) { D->SetTextureParameterValue(TEXT("NormalTex"), T); }
			if (UTexture2D* T = Tex(P.Tex, TEXT("R"))) { D->SetTextureParameterValue(TEXT("RoughTex"), T); }
			D->SetScalarParameterValue(TEXT("UseTextures"), 1.f);
		}
		else
		{
			D->SetScalarParameterValue(TEXT("UseTextures"), 0.f);
		}
		return D;
	}
	UMaterialInstanceDynamic* D = UMaterialInstanceDynamic::Create(Basic(), Outer);
	D->SetVectorParameterValue(TEXT("Color"), Color);
	return D;
}

void PTMat::SetEmissive(UMaterialInstanceDynamic* M, const FLinearColor& Color, float Strength)
{
	if (!M) { return; }
	M->SetVectorParameterValue(TEXT("EmissiveColor"), Color);
	M->SetScalarParameterValue(TEXT("EmissiveStrength"), Strength);
	if (!HasMaster())
	{
		// fallback material has no emission: brighten the base colour instead
		M->SetVectorParameterValue(TEXT("Color"), Strength > 0.01f ? Color : Color * 0.15f);
	}
}

UStaticMesh* PTMat::Cube() { static TWeakObjectPtr<UStaticMesh> C; if (!C.IsValid()) C = Shape(TEXT("/Engine/BasicShapes/Cube.Cube")); return C.Get(); }
UStaticMesh* PTMat::Sphere() { static TWeakObjectPtr<UStaticMesh> C; if (!C.IsValid()) C = Shape(TEXT("/Engine/BasicShapes/Sphere.Sphere")); return C.Get(); }
UStaticMesh* PTMat::Cylinder() { static TWeakObjectPtr<UStaticMesh> C; if (!C.IsValid()) C = Shape(TEXT("/Engine/BasicShapes/Cylinder.Cylinder")); return C.Get(); }
UStaticMesh* PTMat::Cone() { static TWeakObjectPtr<UStaticMesh> C; if (!C.IsValid()) C = Shape(TEXT("/Engine/BasicShapes/Cone.Cone")); return C.Get(); }
UStaticMesh* PTMat::Plane() { static TWeakObjectPtr<UStaticMesh> C; if (!C.IsValid()) C = Shape(TEXT("/Engine/BasicShapes/Plane.Plane")); return C.Get(); }

UStaticMeshComponent* PTMat::AddPart(AActor* Owner, USceneComponent* Parent, UStaticMesh* Mesh, UMaterialInterface* Mat,
	const FVector& Loc, const FVector& Size, const FRotator& Rot, bool bCollision, bool bShadow)
{
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(Owner);
	C->SetStaticMesh(Mesh);
	if (Mat) { C->SetMaterial(0, Mat); }
	C->SetMobility(EComponentMobility::Movable);
	C->SetCollisionEnabled(bCollision ? ECollisionEnabled::QueryAndPhysics : ECollisionEnabled::NoCollision);
	if (bCollision) { C->SetCollisionProfileName(TEXT("BlockAll")); }
	C->SetCastShadow(bShadow);
	C->SetupAttachment(Parent);
	C->SetRelativeLocation(Loc);
	C->SetRelativeRotation(Rot);
	C->SetRelativeScale3D(Size / 100.f);
	C->RegisterComponent();
	Owner->AddInstanceComponent(C);
	return C;
}
