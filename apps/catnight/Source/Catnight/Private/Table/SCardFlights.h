// Cards flying over the table (docs/CATNIGHT_UI_PLAN.md §4.6): gained resources travel from the
// producing tiles to their place in the Treasury along an arc, turning face up on the way.
// Drawn on top of everything, never hit-testable; reduce motion skips it.
#pragma once

#include "CoreMinimal.h"
#include "Widgets/SLeafWidget.h"

class SCardFlights : public SLeafWidget
{
public:
	SLATE_BEGIN_ARGS(SCardFlights) {}
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
	/** One card from `From` to `To` (absolute screen positions), starting after `Delay` seconds. */
	void Launch(const FString& Image, FVector2D From, FVector2D To, float Delay, float Width = 56.f);
	bool IsBusy() const { return Flights.Num() > 0; }
	/** Drops every card in the air (a curtain or the victory sheet is opening). */
	void Clear() { Flights.Reset(); }

	virtual int32 OnPaint(const FPaintArgs& Args, const FGeometry& G, const FSlateRect& Cull, FSlateWindowElementList& Out,
		int32 Layer, const FWidgetStyle& Style, bool bEnabled) const override;
	virtual FVector2D ComputeDesiredSize(float) const override { return FVector2D::ZeroVector; }
	virtual void Tick(const FGeometry& G, const double Time, const float Dt) override;

private:
	struct FFlight
	{
		FString Image;
		FVector2D From, To;
		float Age = 0.f;
		float Delay = 0.f;
		float Width = 56.f;
	};
	TArray<FFlight> Flights;
};
