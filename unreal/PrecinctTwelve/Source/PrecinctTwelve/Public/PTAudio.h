#pragma once

#include "CoreMinimal.h"
#include "Sound/SoundWaveProcedural.h"
#include <atomic>
#include "PTAudio.generated.h"

enum class EPTSynthKind : uint8 { Engine, Siren, Shot, Ui };

/**
 * Real-time procedural sound (no audio files needed): engine hum, siren wail
 * + horn, gunshots and UI blips. Parameters are set from the game thread and
 * read on the audio render thread through atomics.
 */
UCLASS()
class PRECINCTTWELVE_API UPTSynth : public USoundWaveProcedural
{
	GENERATED_BODY()

public:
	void Setup(EPTSynthKind InKind);

	void SetEngine(bool bOn, float Speed01, float InThrottle) { EngineOn = bOn; Speed = Speed01; Throttle = InThrottle; }
	void SetActive(bool bOn) { Active = bOn; }
	void Honk() { HonkTime = 0.35f; }
	/** Shot / UI: Volume 0..1, Pitch multiplier. */
	void Trigger(float Volume, float Pitch = 1.f) { TriggerVol = Volume; TriggerPitch = Pitch; TriggerSeq++; }

	virtual int32 OnGeneratePCMAudio(TArray<uint8>& OutAudio, int32 NumSamples) override;

private:
	EPTSynthKind Kind = EPTSynthKind::Engine;
	std::atomic<bool> EngineOn{ false };
	std::atomic<float> Speed{ 0.f };
	std::atomic<float> Throttle{ 0.f };
	std::atomic<bool> Active{ false };
	std::atomic<float> HonkTime{ 0.f };
	std::atomic<float> TriggerVol{ 0.f };
	std::atomic<float> TriggerPitch{ 1.f };
	std::atomic<int32> TriggerSeq{ 0 };

	// render-thread state
	int32 SeenSeq = 0;
	double Phase1 = 0.0, Phase2 = 0.0, LfoPhase = 0.0;
	float Env = 0.f, Gain = 0.f, Lp = 0.f, CurPitch = 1.f, CurVol = 0.f;
	uint32 Noise = 22222;
	static constexpr int32 RATE = 48000;
};
