#pragma once

#include "CoreMinimal.h"

namespace CatnightTable
{
	constexpr float ConstructionSeconds = 5.f;
	constexpr float DiceSeconds = 1.15f;
	inline FVector DiceNormal(int32 Face)
	{
		static const FVector Normals[] = {FVector::UpVector, FVector::ForwardVector, FVector::RightVector,
			-FVector::RightVector, -FVector::ForwardVector, -FVector::UpVector};
		return Normals[FMath::Clamp(Face, 1, 6) - 1];
	}
	inline FQuat DiceRotation(int32 Face)
	{
		return FQuat(FVector::UpVector, 0.22f) * FQuat::FindBetweenNormals(DiceNormal(Face), FVector::UpVector);
	}
	inline TArray<FVector2D> Pips(int32 Face)
	{
		TArray<FVector2D> Points;
		if (Face % 2) Points.Add(FVector2D::ZeroVector);
		if (Face >= 2) Points.Append({FVector2D(-0.23, -0.23), FVector2D(0.23, 0.23)});
		if (Face >= 4) Points.Append({FVector2D(-0.23, 0.23), FVector2D(0.23, -0.23)});
		if (Face == 6) Points.Append({FVector2D(-0.23, 0), FVector2D(0.23, 0)});
		return Points;
	}
}
