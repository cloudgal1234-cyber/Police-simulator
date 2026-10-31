#include "PTAudio.h"

void UPTSynth::Setup(EPTSynthKind InKind)
{
	Kind = InKind;
	SetSampleRate(RATE);
	NumChannels = 1;
	Duration = INDEFINITELY_LOOPING_DURATION;
	SoundGroup = SOUNDGROUP_Default;
	bLooping = true;
}

int32 UPTSynth::OnGeneratePCMAudio(TArray<uint8>& OutAudio, int32 NumSamples)
{
	OutAudio.Reset();
	OutAudio.AddZeroed(NumSamples * sizeof(int16));
	int16* Out = reinterpret_cast<int16*>(OutAudio.GetData());
	const float Dt = 1.f / RATE;

	auto Rnd = [this]() { Noise ^= Noise << 13; Noise ^= Noise >> 17; Noise ^= Noise << 5; return (Noise & 0xFFFF) / 32768.f - 1.f; };

	const int32 Seq = TriggerSeq.load();
	if (Seq != SeenSeq)
	{
		SeenSeq = Seq;
		Env = 1.f;
		CurVol = TriggerVol.load();
		CurPitch = TriggerPitch.load();
	}

	float Honk = HonkTime.load();
	for (int32 I = 0; I < NumSamples; ++I)
	{
		float S = 0.f;
		switch (Kind)
		{
		case EPTSynthKind::Engine:
		{
			const float Sp = Speed.load(std::memory_order_relaxed), Th = Throttle.load(std::memory_order_relaxed);
			const float Target = EngineOn.load(std::memory_order_relaxed) ? 0.16f + Th * 0.12f : 0.f;
			Gain += (Target - Gain) * 0.0005f;
			const double F = 38.0 + Sp * 95.0 + Th * 18.0;
			Phase1 = FMath::Fmod(Phase1 + F * Dt, 1.0);
			Phase2 = FMath::Fmod(Phase2 + F * 0.501 * Dt, 1.0);
			const float Saw = static_cast<float>(Phase1 * 2.0 - 1.0);
			const float Sq = Phase2 < 0.5 ? 0.6f : -0.6f;
			const float Raw = Saw * 0.6f + Sq * 0.4f + Rnd() * 0.05f * Th;
			const float Cut = 0.04f + Th * 0.08f + Sp * 0.05f;	// one-pole low-pass
			Lp += (Raw - Lp) * Cut;
			S = Lp * Gain;
			break;
		}
		case EPTSynthKind::Siren:
		{
			const float Target = Active.load(std::memory_order_relaxed) ? 0.22f : 0.f;
			Gain += (Target - Gain) * 0.002f;
			LfoPhase = FMath::Fmod(LfoPhase + 0.35 * Dt, 1.0);
			const double F = 900.0 + 380.0 * FMath::Sin(LfoPhase * 2.0 * PI);
			Phase1 = FMath::Fmod(Phase1 + F * Dt, 1.0);
			const float Tri = static_cast<float>(4.0 * FMath::Abs(Phase1 - 0.5) - 1.0);
			S = Tri * Gain;
			if (Honk > 0.f)
			{
				Phase2 = FMath::Fmod(Phase2 + 420.0 * Dt, 1.0);
				const double P3 = FMath::Fmod(Phase2 * 1.26, 1.0);
				S += ((Phase2 < 0.5 ? 0.18f : -0.18f) + (P3 < 0.5 ? 0.12f : -0.12f));
				Honk -= Dt;
			}
			break;
		}
		case EPTSynthKind::Shot:
		{
			if (Env > 0.0005f)
			{
				const float N = Rnd();
				Lp += (N - Lp) * (0.35f * CurPitch);
				S = Lp * Env * CurVol;
				Env *= 1.f - 18.f * Dt / CurPitch;
			}
			break;
		}
		case EPTSynthKind::Ui:
		{
			if (Env > 0.0005f)
			{
				Phase1 = FMath::Fmod(Phase1 + 880.0 * CurPitch * Dt, 1.0);
				S = (Phase1 < 0.5 ? 0.25f : -0.25f) * Env * CurVol;
				Env *= 1.f - 30.f * Dt;
			}
			break;
		}
		}
		Out[I] = static_cast<int16>(FMath::Clamp(S, -1.f, 1.f) * 32000.f);
	}
	HonkTime.store(FMath::Max(0.f, Honk));
	return NumSamples;
}
