// HallKit: the Hall & Chart widgets for the Unreal UI (docs/CATNIGHT_UI_PLAN.md §7).
// Royal Court pieces (stone, oak, banners, brass, wax) are for acting and for people; Sea Chart
// pieces (parchment, vellum, ink, map notes, the scale bar) are for reading about the island.
#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/SLeafWidget.h"
#include "Ui/HallStyle.h"

namespace HallKit
{
	enum class EPaper : uint8 { Parchment, Vellum, Letter };
	/** Chip / ChipOn: small paper or crimson keys with a tight padding (steppers, rates, counts in narrow rows). */
	enum class EButton : uint8 { Primary, Plaque, Paper, Seal, SealOnDark, Danger, Tab, TabOn, Chip, ChipOn };

	// ---- surfaces
	/** A paper sheet: tiled texture, an ink neat line, a soft shadow. */
	TSharedRef<SWidget> Paper(TSharedRef<SWidget> Content, EPaper Kind = EPaper::Parchment, const FMargin& Pad = FMargin(22, 18));
	/** An oak board with iron corners and, when titled, a brass-and-parchment title ribbon on its top edge. */
	TSharedRef<SWidget> Oak(TSharedRef<SWidget> Content, const FString& Title = FString(), const FMargin& Pad = FMargin(18, 16));
	/** The hall wall: stone blocks, a vignette; fills its slot. */
	TSharedRef<SWidget> StoneWall();

	// ---- text
	TSharedRef<SWidget> Ink(const FString& Text, float Px = 19, const FLinearColor& Color = Hall::Color::MapInk, bool bWrap = true);
	TSharedRef<SWidget> InkItalic(const FString& Text, float Px = 17, const FLinearColor& Color = Hall::Color::MapInkMuted);
	TSharedRef<SWidget> OnDark(const FString& Text, float Px = 18, const FLinearColor& Color = Hall::Color::OnDark, bool bWrap = true);
	TSharedRef<SWidget> LabelText(const FString& Text, float Px, const FLinearColor& Color, bool bShadow = false);
	/** Blackletter heading (≥ 40 px per the plan; numerals may be smaller). */
	TSharedRef<SWidget> Blackletter(const FString& Text, float Px, const FLinearColor& Color = Hall::Color::RubricDark, bool bShadow = false);
	/** A dotted ink rule. */
	TSharedRef<SWidget> Rule(const FLinearColor& Color = Hall::Color::MapInkMuted);

	// ---- ornaments and art
	TSharedRef<SWidget> Ribbon(const FString& Text, float Px = 20, float MinWidth = 0.f, bool bTitle = false);
	TSharedRef<SWidget> Picture(const FString& Image, float Width, float Height = 0.f);
	TSharedRef<SWidget> Arms(catnight::PlayerColor C, catnight::Sigil S, float Height);
	TSharedRef<SWidget> Icon(const FString& Name, float Size);
	/** The banner pole at any length (finials unstretched); the rod's centre is 0.444 of Height down. */
	TSharedRef<SWidget> Pole(float Width, float Height = 90.f);
	/** A resource card with its art, count corner and name; `Badge` (e.g. "+1") as a wax seal. */
	TSharedRef<SWidget> ResourceCard(catnight::Resource R, int32 Count, float Width, const FString& Badge = FString(), bool bLift = false);
	TSharedRef<SWidget> Die(int32 Face, float Size);

	// ---- controls
	TSharedRef<SWidget> Button(const FString& Label, TFunction<FReply()> OnClick, EButton Kind = EButton::Plaque, bool bEnabled = true,
		TSharedPtr<SWidget>* OutButton = nullptr, const FString& IconName = FString(), float Px = 0.f);
	/** – value +, the keys `Size` px square (36 by default; 30 in tight rows such as the trade terms). */
	TSharedRef<SWidget> Stepper(int32 Value, TFunction<void(int32)> OnChange, int32 Min, int32 Max, bool bOnDark = false, float Size = 36.f);
	/** A clickable surface (a build card, a banner) with the hall's gold focus ring, or none when `bRing` is false. */
	TSharedRef<SWidget> Clickable(TSharedRef<SWidget> Content, TFunction<FReply()> OnClick, bool bRing = true);
	/** Text that shrinks to fit its slot instead of being cut off (names on ribbons, long labels). */
	TSharedRef<SWidget> FitText(TSharedRef<SWidget> Text);
	/** A decree (dialog body): parchment, blackletter title, optional arms, rules, content. */
	TSharedRef<SWidget> Decree(const FString& Title, TSharedRef<SWidget> Body, float Width = 620.f, const FString& ArmsImage = FString());
	/** A herald's slip (toast / note on paper). */
	TSharedRef<SWidget> Slip(const FString& Text, const FLinearColor& Mark = Hall::Color::Gold);
	/** A button prompt (e.g. the Y roundel or the Space keycap) that follows the device in use. */
	TSharedRef<SWidget> Prompt(Hall::EPrompt P, float Height = 26.f);
	/** A prompt with a short label after it ("Roll", "Cancel"), for hint rows. */
	TSharedRef<SWidget> PromptHint(Hall::EPrompt P, const FString& Label, float Height = 24.f, bool bOnDark = true);

	/** Torchlight: a flickering warm glow (behind a torch, a lit banner, the primary button). */
	class SGlow : public SLeafWidget
	{
	public:
		SLATE_BEGIN_ARGS(SGlow) : _Color(FLinearColor(1.f, 0.62f, 0.25f)), _Strength(1.f), _Seed(0.f) {}
			SLATE_ARGUMENT(FLinearColor, Color)
			SLATE_ATTRIBUTE(float, Strength)
			SLATE_ARGUMENT(float, Seed)
		SLATE_END_ARGS()
		void Construct(const FArguments& InArgs);
		virtual int32 OnPaint(const FPaintArgs& Args, const FGeometry& G, const FSlateRect& Cull, FSlateWindowElementList& Out,
			int32 Layer, const FWidgetStyle& Style, bool bEnabled) const override;
		virtual FVector2D ComputeDesiredSize(float) const override { return FVector2D(64, 64); }
	private:
		FLinearColor Color;
		TAttribute<float> Strength;
		float Seed = 0.f;
	};

	/** A wall torch with its light. */
	TSharedRef<SWidget> Torch(float Height, float Seed);

	/** A hanging banner: cloth, charge or arms, optional score numeral, label ribbon, gloss. Sways. */
	class SBanner : public SCompoundWidget
	{
	public:
		SLATE_BEGIN_ARGS(SBanner) : _Embroidered(false), _Width(150.f), _LabelPx(20.f), _Seed(0.f), _Clickable(false) {}
			SLATE_ARGUMENT(FString, Cloth)        // image name, e.g. "banners/plain-gules"
			/** The title menu's cloth ("banners/menu-cloth-*"): the label is lettered in gold between the
			 *  cloth's embroidered rules instead of on a paper ribbon. */
			SLATE_ARGUMENT(bool, Embroidered)
			SLATE_ARGUMENT(float, Width)
			SLATE_ARGUMENT(FString, Charge)       // image drawn in a roundel (menu), or empty
			SLATE_ARGUMENT(FString, ArmsImage)    // coat of arms (players), or empty
			SLATE_ATTRIBUTE(FString, Numeral)     // score
			SLATE_ATTRIBUTE(FString, Label)
			SLATE_ARGUMENT(float, LabelPx)
			SLATE_ATTRIBUTE(FString, Gloss)
			SLATE_ATTRIBUTE(bool, Lit)
			SLATE_ARGUMENT(float, Seed)
			SLATE_ARGUMENT(bool, Clickable)
			SLATE_EVENT(FOnClicked, OnClicked)
			SLATE_ATTRIBUTE(FText, ToolTipText)
		SLATE_END_ARGS()
		void Construct(const FArguments& InArgs);
		virtual void Tick(const FGeometry& G, const double Time, const float Dt) override;
		TSharedPtr<SWidget> GetButton() const { return ButtonWidget; }
	private:
		TAttribute<bool> Lit;
		TSharedPtr<SWidget> ButtonWidget;
		TSharedPtr<SWidget> Cloth;
		float Seed = 0.f;
		float Lift = 0.f;
		bool bEmbroidered = false;
		bool bHot() const;
	};

	/** The Sea Chart hand-limit meter: 0..12 cells, the limit (7) inked in rubric, a marker. */
	class SScaleBar : public SLeafWidget
	{
	public:
		SLATE_BEGIN_ARGS(SScaleBar) : _Value(0), _Limit(7), _Max(12) {}
			SLATE_ARGUMENT(int32, Value)
			SLATE_ARGUMENT(int32, Limit)
			SLATE_ARGUMENT(int32, Max)
		SLATE_END_ARGS()
		void Construct(const FArguments& InArgs) { Value = InArgs._Value; Limit = InArgs._Limit; Max = InArgs._Max; }
		virtual int32 OnPaint(const FPaintArgs& Args, const FGeometry& G, const FSlateRect& Cull, FSlateWindowElementList& Out,
			int32 Layer, const FWidgetStyle& Style, bool bEnabled) const override;
		virtual FVector2D ComputeDesiredSize(float) const override { return FVector2D(320, 34); }
	private:
		int32 Value = 0, Limit = 7, Max = 12;
	};
}
