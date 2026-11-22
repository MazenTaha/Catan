#include "Daytime.h"

namespace CatnightDay
{
	namespace
	{
		struct FStage { float Hour; const TCHAR* Name; };
		const FStage Stages[] = {{6.f, TEXT("Sunrise")}, {9.f, TEXT("Morning")}, {12.f, TEXT("Midday")}, {15.f, TEXT("Afternoon")},
			{18.3f, TEXT("Sunset")}, {20.2f, TEXT("Dusk")}, {0.f, TEXT("Midnight")}, {3.5f, TEXT("Small hours")}};
		constexpr int32 NumStages = UE_ARRAY_COUNT(Stages);
	}

	float HourOf(const catnight::GameState& S)
	{
		if (S.round <= 0) return 9.f;
		const int32 N = FMath::Max(1, static_cast<int32>(S.players.size()));
		const float Within = static_cast<float>((S.currentPlayer - S.firstPlayer + N) % N) / N;
		const int32 I = (S.round - 1) % NumStages;
		const float A = Stages[I].Hour;
		float B = Stages[(I + 1) % NumStages].Hour;
		if (B < A) B += 24.f;
		return FMath::Fmod(A + (B - A) * Within, 24.f);
	}

	FString StageName(float Hour)
	{
		const TCHAR* Best = Stages[0].Name;
		float BestD = 99.f;
		for (const FStage& St : Stages)
		{
			const float D = FMath::Min(FMath::Abs(St.Hour - Hour), 24.f - FMath::Abs(St.Hour - Hour));
			if (D < BestD) { BestD = D; Best = St.Name; }
		}
		return Best;
	}

	float Daylight(float Hour)
	{
		const float SunUp = FMath::Sin((Hour - 6.f) / 12.f * PI);
		return FMath::Clamp(SunUp * 1.6f + 0.25f, 0.f, 1.f);
	}
}
