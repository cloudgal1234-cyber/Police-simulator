#pragma once

#include "CoreMinimal.h"

/** Case data loaded from Content/Data/Cases.json (same content as the browser version). */

struct FPTTopic
{
	FString Q, A, Gives;
	TArray<FString> Req;
};

struct FPTLook
{
	FLinearColor Skin = FLinearColor(0.75f, 0.55f, 0.42f);
	FLinearColor Shirt = FLinearColor(0.3f, 0.35f, 0.45f);
	FLinearColor Pants = FLinearColor(0.12f, 0.14f, 0.18f);
	FLinearColor Hair = FLinearColor(0.08f, 0.06f, 0.04f);
	FLinearColor Shoes = FLinearColor(0.03f, 0.03f, 0.03f);
	TOptional<FLinearColor> Hat, Vest, Scarf, Hood, Sleeve;
	bool bBadge = false;
	float Scale = 1.f;
};

struct FPTNpcDef
{
	FString Id, Name, Role, Intro, Wrong;
	FVector2D Pos = FVector2D::ZeroVector;	// local cm
	float Yaw = 0.f;						// degrees
	FPTLook Look;
	TArray<FPTTopic> Topics;
};

struct FPTEvidence
{
	FString Id, Name, Text;
	bool bStatement = false;
};

struct FPTProp
{
	FString Type;
	FVector2D Pos = FVector2D::ZeroVector;
	float Yaw = 0.f;
	bool bCover = false;
	FLinearColor Color = FLinearColor(0.12f, 0.43f, 0.82f);
	bool bHasColor = false;
	bool bDamaged = false;
};

struct FPTClue
{
	FString Ev, Prop;
	FVector2D Pos = FVector2D::ZeroVector;
	float Yaw = 0.f;
	float Height = 0.f;	// cm above ground for the marker
};

struct FPTAccomplice
{
	FString Name;
	FVector2D Pos = FVector2D::ZeroVector;
	FPTLook Look;
};

struct FPTCase
{
	FString Id, Title, Location, Dispatch, Brief, Culprit, ArrestText, StandoffText;
	FIntPoint Block = FIntPoint::ZeroValue;
	int32 MinEvidence = 4;
	bool bArmed = false;
	TArray<FPTEvidence> Evidence;
	TArray<FPTProp> Props;
	TArray<FPTClue> Clues;
	TArray<FPTNpcDef> Npcs;
	TArray<FPTAccomplice> Accomplices;

	const FPTEvidence* FindEvidence(const FString& Id) const
	{
		return Evidence.FindByPredicate([&Id](const FPTEvidence& E) { return E.Id == Id; });
	}
};

namespace PTCases
{
	/** Loads and converts all cases. Returns false (and logs) when the file is missing or malformed. */
	bool Load(TArray<FPTCase>& Out);
	FLinearColor Hex(const FString& S, const FLinearColor& Fallback);
}
