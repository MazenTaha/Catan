#include "Ui/CatnightUi.h"

#include "Styling/CoreStyle.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Text/STextBlock.h"

using namespace catnight;

namespace CatnightUi
{
	FLinearColor Srgb(uint8 R, uint8 G, uint8 B, uint8 A) { return FLinearColor(FColor(R, G, B, A)); }

	FLinearColor PlayerTint(PlayerColor C)
	{
		switch (C)
		{
		case PlayerColor::Crimson: return Srgb(196, 48, 43);
		case PlayerColor::Frost: return Srgb(46, 116, 214);
		case PlayerColor::Bone: return Srgb(240, 236, 226);
		case PlayerColor::Violet: return Srgb(236, 128, 32);
		}
		return FLinearColor::White;
	}

	const FLinearColor Ink = Srgb(26, 24, 22);
	const FLinearColor Ivory = Srgb(246, 238, 216);
	const FLinearColor PanelBg = Srgb(24, 26, 28);
	const FLinearColor Muted = Srgb(170, 172, 168);
	const FLinearColor Danger = Srgb(240, 120, 110);

	FSlateFontInfo Font(float Size, bool bBold)
	{
		return FCoreStyle::GetDefaultFontStyle(bBold ? TEXT("Bold") : TEXT("Regular"), Size);
	}

	const FSlateBrush* WhiteBox() { return FCoreStyle::Get().GetBrush("GenericWhiteBox"); }

	TSharedRef<SWidget> Text(const FString& S, float Size, const FLinearColor& Color, bool bBold)
	{
		return SNew(STextBlock).Text(FText::FromString(S)).Font(Font(Size, bBold)).ColorAndOpacity(Color).AutoWrapText(true);
	}

	TSharedRef<SWidget> Button(const FString& Label, TFunction<FReply()> OnClick, bool bEnabled, bool bPrimary, TSharedPtr<SWidget>* OutButton)
	{
		TSharedRef<SButton> B = SNew(SButton)
			.IsEnabled(bEnabled)
			.ContentPadding(FMargin(10, 5))
			.ButtonColorAndOpacity(bPrimary ? Srgb(176, 52, 52) : Srgb(70, 74, 78))
			.OnClicked_Lambda(MoveTemp(OnClick))
			[
				SNew(STextBlock).Text(FText::FromString(Label)).Font(Font(11, bPrimary)).ColorAndOpacity(FLinearColor::White)
			];
		if (OutButton) *OutButton = B;
		return B;
	}

	TSharedRef<SWidget> Section(const FString& Title, TSharedRef<SWidget> Body)
	{
		return SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 10, 0, 4)[Text(Title.ToUpper(), 10, Muted, true)]
			+ SVerticalBox::Slot().AutoHeight()[Body];
	}

	TSharedRef<SWidget> Plate(const FLinearColor& Color, TSharedRef<SWidget> Body, float Padding)
	{
		return SNew(SBorder).BorderImage(WhiteBox()).BorderBackgroundColor(Color).Padding(Padding)[Body];
	}

	TSharedRef<SWidget> Dialog(TSharedRef<SWidget> Body, float BackdropAlpha, float Width)
	{
		return SNew(SBorder)
			.BorderImage(WhiteBox())
			.BorderBackgroundColor(FLinearColor(0.01f, 0.01f, 0.012f, BackdropAlpha))
			.HAlign(HAlign_Center)
			.VAlign(VAlign_Center)
			[
				SNew(SBox)
				.WidthOverride(Width)
				[
					Plate(Srgb(38, 36, 32), Body, 24.f)
				]
			];
	}

	TSharedRef<SWidget> Stepper(int32 Value, TFunction<void(int32)> OnChange, int32 Min, int32 Max)
	{
		return SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth()[Button(TEXT("-"), [OnChange, Value] { OnChange(Value - 1); return FReply::Handled(); }, Value > Min)]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(8, 0)
			[
				SNew(SBox).WidthOverride(22).HAlign(HAlign_Center)[Text(FString::FromInt(Value), 12, Ivory, true)]
			]
			+ SHorizontalBox::Slot().AutoWidth()[Button(TEXT("+"), [OnChange, Value] { OnChange(Value + 1); return FReply::Handled(); }, Value < Max)];
	}
}
