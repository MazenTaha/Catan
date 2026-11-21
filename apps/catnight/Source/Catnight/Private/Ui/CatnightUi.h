// Shared Slate building blocks for the phase-2 screens (title, new game, table). Plain on
// purpose: phase 3 replaces them with the Hall & Chart widgets.
#pragma once

#include "CoreMinimal.h"
#include "Fonts/SlateFontInfo.h"
#include "CatnightRules/Keys.h"

class SWidget;
struct FSlateBrush;

namespace CatnightUi
{
	FLinearColor Srgb(uint8 R, uint8 G, uint8 B, uint8 A = 255);
	FLinearColor PlayerTint(catnight::PlayerColor C);

	extern const FLinearColor Ink;
	extern const FLinearColor Ivory;
	extern const FLinearColor PanelBg;
	extern const FLinearColor Muted;
	extern const FLinearColor Danger;

	FSlateFontInfo Font(float Size, bool bBold = false);
	const FSlateBrush* WhiteBox();

	TSharedRef<SWidget> Text(const FString& S, float Size = 11, const FLinearColor& Color = FLinearColor::White, bool bBold = false);
	/** A button; `OutButton` receives it (for focus). */
	TSharedRef<SWidget> Button(const FString& Label, TFunction<FReply()> OnClick, bool bEnabled = true, bool bPrimary = false,
		TSharedPtr<SWidget>* OutButton = nullptr);
	TSharedRef<SWidget> Section(const FString& Title, TSharedRef<SWidget> Body);
	/** A filled box in `Color` with padding, holding `Body`. */
	TSharedRef<SWidget> Plate(const FLinearColor& Color, TSharedRef<SWidget> Body, float Padding = 10.f);
	/** A centred card over a dark backdrop that hides what is below (dialogs, the hot-seat curtain). */
	TSharedRef<SWidget> Dialog(TSharedRef<SWidget> Body, float BackdropAlpha = 0.82f, float Width = 520.f);
	/** "[-] N [+]" with clamps. */
	TSharedRef<SWidget> Stepper(int32 Value, TFunction<void(int32)> OnChange, int32 Min, int32 Max);
}
