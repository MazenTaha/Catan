#include "Table/SCardFlights.h"

#include "Rendering/DrawElements.h"
#include "Styling/CoreStyle.h"
#include "Ui/HallStyle.h"

namespace
{
	constexpr float FlightSeconds = 0.75f;
}

void SCardFlights::Construct(const FArguments& InArgs)
{
	SetVisibility(EVisibility::HitTestInvisible);
}

void SCardFlights::Launch(const FString& Image, FVector2D From, FVector2D To, float Delay, float Width)
{
	if (Hall::bReduceMotion || Flights.Num() > 40) return;
	FFlight F;
	F.Image = Image;
	F.From = From;
	F.To = To;
	F.Delay = Delay;
	F.Width = Width;
	Flights.Add(F);
}

void SCardFlights::Tick(const FGeometry& G, const double Time, const float Dt)
{
	for (FFlight& F : Flights) F.Age += Dt;
	Flights.RemoveAll([](const FFlight& F) { return F.Age > F.Delay + FlightSeconds; });
	if (Flights.Num()) Invalidate(EInvalidateWidgetReason::Paint);
}

int32 SCardFlights::OnPaint(const FPaintArgs& Args, const FGeometry& G, const FSlateRect& Cull, FSlateWindowElementList& Out, int32 Layer, const FWidgetStyle& Style, bool bEnabled) const
{
	const FSlateBrush* Shadow = Hall::Image(TEXT("fx/shadow"));
	const FSlateBrush* Edge = FCoreStyle::Get().GetBrush("GenericWhiteBox");
	for (const FFlight& F : Flights)
	{
		if (F.Age < F.Delay) continue;
		const float T = FMath::Clamp((F.Age - F.Delay) / FlightSeconds, 0.f, 1.f);
		// Ease in-out along an arc that rises toward the top of the screen.
		const float E = T < 0.5f ? 4.f * T * T * T : 1.f - FMath::Pow(-2.f * T + 2.f, 3.f) / 2.f;
		const FVector2D Mid = (F.From + F.To) * 0.5f + FVector2D(0, -FMath::Max(120.f, FVector2D::Distance(F.From, F.To) * 0.28f));
		const FVector2D AbsPos = FMath::Lerp(FMath::Lerp(F.From, Mid, E), FMath::Lerp(Mid, F.To, E), E);
		const FVector2D Local = G.AbsoluteToLocal(AbsPos);
		// Grows out of the tile, then settles to the hand's card size; flips face up in the first third.
		const float Grow = FMath::Lerp(0.45f, 1.f, FMath::Min(1.f, T * 2.5f)) * (1.f + 0.18f * FMath::Sin(T * UE_PI));
		const float Flip = FMath::Abs(FMath::Cos(FMath::Min(1.f, T * 3.f) * UE_PI));
		const FVector2D Natural = Hall::ImageSize(F.Image);
		const float W = F.Width * Grow, H = W * Natural.Y / FMath::Max(1.0, Natural.X);
		const float FlipW = FMath::Max(2.f, W * Flip);
		const float Fade = T > 0.9f ? (1.f - T) / 0.1f : 1.f;
		const FVector2f Size(FlipW, H);
		const FVector2f TopLeft(Local.X - FlipW * 0.5f, Local.Y - H * 0.5f);
		FSlateDrawElement::MakeBox(Out, Layer, G.ToPaintGeometry(Size * 1.3f, FSlateLayoutTransform(TopLeft - Size * 0.15f + FVector2f(6, 10))), Shadow, ESlateDrawEffect::None, FLinearColor(1, 1, 1, 0.55f * Fade));
		const bool bFace = T > 1.f / 6.f;
		if (bFace)
		{
			FSlateDrawElement::MakeBox(Out, Layer + 1, G.ToPaintGeometry(Size + FVector2f(4, 4), FSlateLayoutTransform(TopLeft - FVector2f(2, 2))), Edge, ESlateDrawEffect::None, FLinearColor(0.1f, 0.07f, 0.04f, Fade));
			FSlateDrawElement::MakeBox(Out, Layer + 2, G.ToPaintGeometry(Size, FSlateLayoutTransform(TopLeft)), Hall::Image(F.Image), ESlateDrawEffect::None, FLinearColor(1, 1, 1, Fade));
		}
		else
		{
			// The back: oak with a gold edge.
			FSlateDrawElement::MakeBox(Out, Layer + 1, G.ToPaintGeometry(Size + FVector2f(4, 4), FSlateLayoutTransform(TopLeft - FVector2f(2, 2))), Edge, ESlateDrawEffect::None, Hall::Color::Gold);
			FSlateDrawElement::MakeBox(Out, Layer + 2, G.ToPaintGeometry(Size, FSlateLayoutTransform(TopLeft)), Hall::Tile(TEXT("textures/oak-tile")), ESlateDrawEffect::None, FLinearColor::White);
		}
	}
	return Layer + 3;
}
