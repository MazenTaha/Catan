#include "Ui/HallKit.h"

#include "Brushes/SlateRoundedBoxBrush.h"
#include "Framework/Application/SlateApplication.h"
#include "Rendering/DrawElements.h"
#include "Rendering/SlateRenderer.h"
#include "Fonts/FontMeasure.h"
#include "Styling/CoreStyle.h"
#include "Styling/SlateTypes.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScaleBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Text/STextBlock.h"
#include "Ui/HallSound.h"

using namespace catnight;
namespace C = Hall::Color;

namespace HallKit
{
	namespace
	{
		FLinearColor A(const FLinearColor& Col, float Alpha) { return FLinearColor(Col.R, Col.G, Col.B, Alpha); }
		FLinearColor Lighter(const FLinearColor& Col, float F) { return FLinearColor(FMath::Min(1.f, Col.R * F), FMath::Min(1.f, Col.G * F), FMath::Min(1.f, Col.B * F), Col.A); }

		const FSlateBrush* Rounded(const FLinearColor& Fill, float Radius, const FLinearColor& Outline, float Width)
		{
			static TArray<TSharedPtr<FSlateBrush>> Keep;
			TSharedPtr<FSlateBrush> B = MakeShared<FSlateRoundedBoxBrush>(Fill, Radius, Outline, Width);
			Keep.Add(B);
			return B.Get();
		}

		/** Button styles are built once per kind and kept for the program's life. */
		const FButtonStyle& Style(EButton Kind)
		{
			// Heap-held: buttons keep a pointer to their style, so map growth must never move one.
			static TMap<uint8, TSharedPtr<FButtonStyle>> Styles;
			if (const TSharedPtr<FButtonStyle>* Found = Styles.Find(static_cast<uint8>(Kind))) return **Found;
			FButtonStyle S = FButtonStyle()
				.SetNormalPadding(FMargin(16, 8, 16, 10))
				.SetPressedPadding(FMargin(16, 10, 16, 8));
			const FSlateNoResource None;
			switch (Kind)
			{
			case EButton::Primary:
				S.SetNormal(*Rounded(C::Wax, 4, C::Gold, 2)).SetHovered(*Rounded(Lighter(C::Wax, 1.25f), 4, C::GoldLight, 2.5f))
					.SetPressed(*Rounded(C::WaxDark, 4, C::Gold, 2)).SetDisabled(*Rounded(A(C::WaxDark, 0.6f), 4, A(C::GoldDark, 0.6f), 1.5f));
				break;
			case EButton::Danger:
				S.SetNormal(*Rounded(C::RubricDark, 4, C::Ink, 1.5f)).SetHovered(*Rounded(C::Rubric, 4, C::Ink, 1.5f))
					.SetPressed(*Rounded(C::WaxDark, 4, C::Ink, 1.5f)).SetDisabled(*Rounded(A(C::RubricDark, 0.5f), 4, C::Ink, 1.f));
				break;
			case EButton::Plaque:
				S.SetNormal(*Rounded(C::Brass, 3, C::Ink, 1.5f)).SetHovered(*Rounded(C::GoldLight, 3, C::Ink, 1.5f))
					.SetPressed(*Rounded(C::GoldDark, 3, C::Ink, 1.5f)).SetDisabled(*Rounded(A(C::Brass, 0.35f), 3, A(C::Ink, 0.5f), 1.f));
				break;
			case EButton::Paper:
				S.SetNormal(*Rounded(C::PaperCard, 3, C::MapInk, 1.5f)).SetHovered(*Rounded(FLinearColor(1.f, 0.96f, 0.86f), 3, C::Ink, 2.f))
					.SetPressed(*Rounded(C::Vellum, 3, C::Ink, 2.f)).SetDisabled(*Rounded(A(C::Vellum, 0.5f), 3, A(C::MapInkMuted, 0.5f), 1.f));
				break;
			case EButton::Tab:
				S.SetNormal(*Rounded(A(C::Oak, 0.0f), 2, A(C::GoldDark, 0.0f), 0.f)).SetHovered(*Rounded(A(C::Gold, 0.12f), 2, A(C::Gold, 0.4f), 1.f))
					.SetPressed(*Rounded(A(C::Gold, 0.2f), 2, C::Gold, 1.f)).SetDisabled(None);
				break;
			case EButton::TabOn:
				S.SetNormal(*Rounded(C::Gules, 2, C::Gold, 1.5f)).SetHovered(*Rounded(Lighter(C::Gules, 1.2f), 2, C::GoldLight, 1.5f))
					.SetPressed(*Rounded(C::WaxDark, 2, C::Gold, 1.5f)).SetDisabled(None);
				break;
			case EButton::Seal:
			case EButton::SealOnDark:
				S.SetNormal(None).SetHovered(*Rounded(A(C::Gold, 0.10f), 30, A(C::Gold, 0.0f), 0.f)).SetPressed(None).SetDisabled(None)
					.SetNormalPadding(FMargin(4, 2, 12, 4)).SetPressedPadding(FMargin(4, 4, 12, 2));
				break;
			}
			S.SetNormalForeground(FSlateColor(FLinearColor::White)).SetHoveredForeground(FSlateColor(FLinearColor::White))
				.SetPressedForeground(FSlateColor(FLinearColor::White)).SetDisabledForeground(FSlateColor(FLinearColor(1, 1, 1, 0.5f)));
			return *Styles.Add(static_cast<uint8>(Kind), MakeShared<FButtonStyle>(S));
		}

		FLinearColor LabelColor(EButton Kind)
		{
			switch (Kind)
			{
			case EButton::Primary:
			case EButton::Danger:
			case EButton::TabOn: return C::OnDark;
			case EButton::Plaque: return C::Ink;
			case EButton::Paper:
			case EButton::Seal: return C::MapInk;
			case EButton::SealOnDark:
			case EButton::Tab: return C::OnDark;
			}
			return C::Ink;
		}

		float Flicker(float Time, float Seed)
		{
			// Layered sines: torch flames breathe, never strobe.
			return 0.82f + 0.08f * FMath::Sin(Time * 7.1f + Seed) + 0.06f * FMath::Sin(Time * 13.7f + Seed * 2.3f) + 0.04f * FMath::Sin(Time * 23.f + Seed * 5.f);
		}
	}

	// ------------------------------------------------------------------ surfaces

	TSharedRef<SWidget> Paper(TSharedRef<SWidget> Content, EPaper Kind, const FMargin& Pad)
	{
		const TCHAR* Tex = Kind == EPaper::Vellum ? TEXT("textures/vellum") : Kind == EPaper::Letter ? TEXT("textures/letter-paper") : TEXT("textures/parchment");
		return SNew(SOverlay)
			+ SOverlay::Slot().Padding(FMargin(-18, -12, -26, -30))
			[
				SNew(SImage).Image(Hall::Box(TEXT("fx/shadow"), FMargin(0.45f))).Visibility(EVisibility::HitTestInvisible)
			]
			+ SOverlay::Slot()
			[
				SNew(SBorder).BorderImage(Hall::Tile(Tex)).Padding(0)
				[
					SNew(SBorder).BorderImage(Rounded(FLinearColor::Transparent, 2, A(C::GoldDark, 0.55f), 2.f)).Padding(0)
				]
			]
			+ SOverlay::Slot().Padding(7)
			[
				SNew(SBorder).BorderImage(Rounded(FLinearColor::Transparent, 1, A(C::MapInk, 0.45f), 1.f)).Visibility(EVisibility::HitTestInvisible)
			]
			+ SOverlay::Slot().Padding(Pad)
			[
				Content
			];
	}

	TSharedRef<SWidget> Oak(TSharedRef<SWidget> Content, const FString& Title, const FMargin& Pad)
	{
		auto Corner = [](float SX, float SY, EHorizontalAlignment H, EVerticalAlignment V)
		{
			return SNew(SBox).WidthOverride(26).HeightOverride(26).HAlign(H).VAlign(V)
				.RenderTransformPivot(FVector2D(0.5f, 0.5f))
				.RenderTransform(FSlateRenderTransform(FScale2f(SX, SY)))
				[
					SNew(SImage).Image(Hall::Image(TEXT("ornaments/iron-corner")))
				];
		};
		TSharedRef<SOverlay> O = SNew(SOverlay)
			+ SOverlay::Slot().Padding(FMargin(-16, -10, -24, -28))
			[
				SNew(SImage).Image(Hall::Box(TEXT("fx/shadow"), FMargin(0.45f))).Visibility(EVisibility::HitTestInvisible)
			]
			+ SOverlay::Slot()
			[
				SNew(SBorder).BorderImage(Hall::Tile(TEXT("textures/oak-tile"), FLinearColor(0.78f, 0.7f, 0.62f))).Padding(0)
				[
					SNew(SBorder).BorderImage(Rounded(FLinearColor::Transparent, 3, C::OakDeep, 3.f)).Padding(0)
				]
			]
			+ SOverlay::Slot().Padding(3)
			[
				SNew(SBorder).BorderImage(Rounded(FLinearColor::Transparent, 2, A(C::OakEdge, 0.9f), 1.f)).Visibility(EVisibility::HitTestInvisible)
			]
			+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Top).Padding(2)[Corner(1, 1, HAlign_Left, VAlign_Top)]
			+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Top).Padding(2)[Corner(-1, 1, HAlign_Right, VAlign_Top)]
			+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Bottom).Padding(2)[Corner(1, -1, HAlign_Left, VAlign_Bottom)]
			+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Bottom).Padding(2)[Corner(-1, -1, HAlign_Right, VAlign_Bottom)]
			+ SOverlay::Slot().Padding(Title.IsEmpty() ? Pad : FMargin(Pad.Left, Pad.Top + 22, Pad.Right, Pad.Bottom))
			[
				Content
			];
		if (!Title.IsEmpty())
		{
			O->AddSlot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(FMargin(0, -18, 0, 0))[Ribbon(Title, 18, 0.f)];
		}
		return O;
	}

	TSharedRef<SWidget> StoneWall()
	{
		return SNew(SOverlay)
			+ SOverlay::Slot()[SNew(SBorder).BorderImage(Hall::Tile(TEXT("textures/stone-wall-tile"), FLinearColor(0.62f, 0.58f, 0.55f))).Padding(0)]
			+ SOverlay::Slot()[SNew(SImage).Image(Hall::Image(TEXT("fx/vignette"))).Visibility(EVisibility::HitTestInvisible)];
	}

	// ------------------------------------------------------------------ text

	TSharedRef<SWidget> Ink(const FString& Text, float Px, const FLinearColor& Color, bool bWrap)
	{
		return SNew(STextBlock).Text(FText::FromString(Text)).Font(Hall::Body(Px)).ColorAndOpacity(Color).AutoWrapText(bWrap);
	}

	TSharedRef<SWidget> InkItalic(const FString& Text, float Px, const FLinearColor& Color)
	{
		return SNew(STextBlock).Text(FText::FromString(Text)).Font(Hall::Italic(Px)).ColorAndOpacity(Color).AutoWrapText(true);
	}

	TSharedRef<SWidget> OnDark(const FString& Text, float Px, const FLinearColor& Color, bool bWrap)
	{
		return SNew(STextBlock).Text(FText::FromString(Text)).Font(Hall::Body(Px)).ColorAndOpacity(Color).AutoWrapText(bWrap)
			.ShadowOffset(FVector2D(1, 2)).ShadowColorAndOpacity(FLinearColor(0, 0, 0, 0.85f));
	}

	TSharedRef<SWidget> LabelText(const FString& Text, float Px, const FLinearColor& Color, bool bShadow)
	{
		TSharedRef<STextBlock> T = SNew(STextBlock).Text(FText::FromString(Text)).Font(Hall::Label(Px)).ColorAndOpacity(Color);
		if (bShadow) T->SetShadowOffset(FVector2D(1, 2)), T->SetShadowColorAndOpacity(FLinearColor(0, 0, 0, 0.85f));
		return T;
	}

	TSharedRef<SWidget> Blackletter(const FString& Text, float Px, const FLinearColor& Color, bool bShadow)
	{
		TSharedRef<STextBlock> T = SNew(STextBlock).Text(FText::FromString(Text)).Font(Hall::Title(Px)).ColorAndOpacity(Color);
		if (bShadow) T->SetShadowOffset(FVector2D(2, 3)), T->SetShadowColorAndOpacity(FLinearColor(0, 0, 0, 0.9f));
		return T;
	}

	TSharedRef<SWidget> Rule(const FLinearColor& Color)
	{
		return SNew(SBox).HeightOverride(14).VAlign(VAlign_Center)
			[
				SNew(STextBlock).Text(FText::FromString(FString::ChrN(48, TEXT('·')))).Font(Hall::Body(14)).ColorAndOpacity(A(Color, 0.7f))
				.Justification(ETextJustify::Center).Clipping(EWidgetClipping::ClipToBounds)
			];
	}

	// ------------------------------------------------------------------ ornaments and art

	TSharedRef<SWidget> Ribbon(const FString& Text, float Px, float MinWidth, bool bTitle)
	{
		// The kit's ribbon-title art has its words baked in, so every ribbon uses the blank label ribbon.
		const FString Image = TEXT("ornaments/ribbon-label");
		const float Height = FMath::Max(40.f, Px * 2.0f);
		return SNew(SBox).HeightOverride(Height).MinDesiredWidth(MinWidth)
			[
				SNew(SBorder).BorderImage(Hall::Box(Image, FMargin(0.13f, 0.35f, 0.13f, 0.35f))).Padding(FMargin(62.f + Px * 1.1f, 0, 62.f + Px * 1.1f, Height * 0.12f))
				.HAlign(HAlign_Center).VAlign(VAlign_Center)
				[
					SNew(STextBlock).Text(FText::FromString(Text)).Font(Hall::Label(Px)).ColorAndOpacity(C::Ink)
				]
			];
	}

	TSharedRef<SWidget> Picture(const FString& Image, float Width, float Height)
	{
		const FVector2D Natural = Hall::ImageSize(Image);
		const float H = Height > 0 ? Height : Width * Natural.Y / FMath::Max(1.0, Natural.X);
		return SNew(SBox).WidthOverride(Width).HeightOverride(H)[SNew(SImage).Image(Hall::Image(Image))];
	}

	TSharedRef<SWidget> Arms(PlayerColor Col, Sigil S, float Height)
	{
		return Picture(Hall::ArmsName(Col, S), Height * 128.f / 150.f, Height);
	}

	TSharedRef<SWidget> Icon(const FString& Name, float Size)
	{
		return Picture(TEXT("icons/") + Name, Size, Size);
	}

	TSharedRef<SWidget> ResourceCard(Resource R, int32 Count, float Width, const FString& Badge, bool bLift)
	{
		const float H = Width * 1.42f;
		const bool bNone = Count <= 0;
		TSharedRef<SOverlay> O = SNew(SOverlay)
			+ SOverlay::Slot().Padding(FMargin(-6, -2, -10, -12))[SNew(SImage).Image(Hall::Box(TEXT("fx/shadow"), FMargin(0.45f))).Visibility(EVisibility::HitTestInvisible)]
			+ SOverlay::Slot()[SNew(SBorder).BorderImage(Rounded(C::PaperCard, 5, C::GoldDark, 2.f)).Padding(4)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().FillHeight(1.f)
					[
						SNew(SBorder).BorderImage(Rounded(C::Ink, 3, A(C::Ink, 0.f), 0.f)).Padding(0)
						[
							SNew(SImage).Image(Hall::Image(Hall::CardName(R))).ColorAndOpacity(bNone ? FLinearColor(0.42f, 0.4f, 0.38f) : FLinearColor::White)
						]
					]
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0, 2, 0, 0)
					[
						SNew(STextBlock).Text(FText::FromString(FString::Printf(TEXT("%d"), Count))).Font(Hall::Title(Width * 0.34f))
						.ColorAndOpacity(bNone ? C::MapInkMuted : C::Ink)
					]
				]];
		if (!Badge.IsEmpty())
		{
			O->AddSlot().HAlign(HAlign_Right).VAlign(VAlign_Top).Padding(FMargin(0, -10, -10, 0))
			[
				SNew(SBox).WidthOverride(Width * 0.46f).HeightOverride(Width * 0.46f)
				[
					SNew(SOverlay)
					+ SOverlay::Slot()[SNew(SImage).Image(Hall::Image(TEXT("ornaments/wax-seal-small")))]
					+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)[LabelText(Badge, Width * 0.17f, C::OnDark, true)]
				]
			];
		}
		return SNew(SBox).WidthOverride(Width).HeightOverride(H)
			.RenderTransform(FSlateRenderTransform(FVector2f(0, bLift ? -10.f : 0.f)))
			[O];
	}

	TSharedRef<SWidget> Die(int32 Face, float Size)
	{
		return Picture(FString::Printf(TEXT("dice/die-%d"), FMath::Clamp(Face, 1, 6)), Size, Size);
	}

	// ------------------------------------------------------------------ controls

	TSharedRef<SWidget> Button(const FString& Label, TFunction<FReply()> OnClick, EButton Kind, bool bEnabled, TSharedPtr<SWidget>* OutButton, const FString& IconName, float Px)
	{
		const bool bSeal = Kind == EButton::Seal || Kind == EButton::SealOnDark;
		const float Size = Px > 0 ? Px : (bSeal ? 22.f : Kind == EButton::Tab || Kind == EButton::TabOn ? 18.f : 19.f);
		TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox);
		if (bSeal)
		{
			Row->AddSlot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 10, 0)
			[
				SNew(SBox).WidthOverride(Size * 2.6f).HeightOverride(Size * 2.6f)
				[
					SNew(SOverlay)
					+ SOverlay::Slot()[SNew(SImage).Image(Hall::Image(TEXT("ornaments/wax-seal")))]
					+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
					[
						IconName.IsEmpty() ? SNullWidget::NullWidget : Icon(IconName, Size * 1.1f)
					]
				]
			];
		}
		else if (!IconName.IsEmpty())
		{
			Row->AddSlot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 8, 0)[Icon(IconName, Size * 1.25f)];
		}
		if (!Label.IsEmpty())
		{
			Row->AddSlot().AutoWidth().VAlign(VAlign_Center)
			[
				LabelText(Label, Size, LabelColor(Kind), Kind == EButton::SealOnDark || Kind == EButton::Primary || Kind == EButton::Tab || Kind == EButton::TabOn)
			];
		}
		// Every press has its sound (plan §4.7): wax stamps, brass clicks, wooden tabs, paper.
		const TCHAR* Sound = bSeal || Kind == EButton::Primary ? TEXT("ui-seal")
			: Kind == EButton::Tab || Kind == EButton::TabOn ? TEXT("ui-tab")
			: Kind == EButton::Paper ? TEXT("click") : TEXT("ui-brass");
		TSharedRef<SButton> B = SNew(SButton)
			.ButtonStyle(&Style(Kind))
			.IsEnabled(bEnabled)
			.HAlign(HAlign_Center)
			.VAlign(VAlign_Center)
			.OnClicked_Lambda([OnClick = MoveTemp(OnClick), Sound]
			{
				HallSound::Play(Sound);
				return OnClick();
			})
			[Row];
		if (OutButton) *OutButton = B;
		return B;
	}

	TSharedRef<SWidget> Stepper(int32 Value, TFunction<void(int32)> OnChange, int32 Min, int32 Max, bool bOnDark)
	{
		return SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth()[Button(TEXT("–"), [OnChange, Value] { OnChange(Value - 1); return FReply::Handled(); }, EButton::Paper, Value > Min, nullptr, FString(), 18)]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(8, 0)
			[
				SNew(SBox).WidthOverride(30).HAlign(HAlign_Center)
				[
					SNew(STextBlock).Text(FText::AsNumber(Value)).Font(Hall::Title(28)).ColorAndOpacity(bOnDark ? C::GoldLight : C::Ink)
				]
			]
			+ SHorizontalBox::Slot().AutoWidth()[Button(TEXT("+"), [OnChange, Value] { OnChange(Value + 1); return FReply::Handled(); }, EButton::Paper, Value < Max, nullptr, FString(), 18)];
	}

	TSharedRef<SWidget> Decree(const FString& Title, TSharedRef<SWidget> Body, float Width, const FString& ArmsImage)
	{
		TSharedRef<SHorizontalBox> Head = SNew(SHorizontalBox);
		if (!ArmsImage.IsEmpty()) Head->AddSlot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 14, 0)[Picture(ArmsImage, 44)];
		Head->AddSlot().FillWidth(1.f).VAlign(VAlign_Center)[Blackletter(Title, 42)];
		return SNew(SBox).WidthOverride(Width)
			[
				Paper(SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()[Head]
					+ SVerticalBox::Slot().AutoHeight().Padding(0, 4, 0, 8)[Rule()]
					+ SVerticalBox::Slot().AutoHeight()[Body],
					EPaper::Parchment, FMargin(30, 22, 30, 24))
			];
	}

	TSharedRef<SWidget> Slip(const FString& Text, const FLinearColor& Mark)
	{
		return Paper(SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 10, 0)
			[
				SNew(SBox).WidthOverride(12).HeightOverride(12)[SNew(SBorder).BorderImage(Rounded(Mark, 6, C::Ink, 1.f))]
			]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Ink(Text, 18, C::MapInk, false)],
			EPaper::Letter, FMargin(16, 8));
	}

	// ------------------------------------------------------------------ prompts

	namespace
	{
		/** Rebuilds its glyphs when the player switches between pad and keys. */
		class SPrompt : public SCompoundWidget
		{
		public:
			SLATE_BEGIN_ARGS(SPrompt) {}
			SLATE_END_ARGS()
			void Construct(const FArguments&, Hall::EPrompt InPrompt, float InHeight)
			{
				Which = InPrompt;
				Height = InHeight;
				SetVisibility(EVisibility::HitTestInvisible);
				Rebuild();
			}
			virtual void Tick(const FGeometry& G, const double Time, const float Dt) override
			{
				if (bPad != Hall::bGamepad) Rebuild();
			}
		private:
			void Rebuild()
			{
				bPad = Hall::bGamepad;
				TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox);
				for (const FString& Name : Hall::PromptGlyphs(Which))
				{
					const FVector2D Natural = Hall::ImageSize(Name);
					// Keycaps are drawn a little taller than pad roundels to read the same size.
					const float H = Height * (Name.Contains(TEXT("key-")) ? 0.92f : 1.f);
					Row->AddSlot().AutoWidth().Padding(1, 0)[Picture(Name, H * Natural.X / FMath::Max(1.0, Natural.Y), H)];
				}
				ChildSlot[Row];
			}
			Hall::EPrompt Which = Hall::EPrompt::Confirm;
			float Height = 26.f;
			bool bPad = false;
		};
	}

	TSharedRef<SWidget> Prompt(Hall::EPrompt P, float Height)
	{
		return SNew(SPrompt, P, Height);
	}

	TSharedRef<SWidget> PromptHint(Hall::EPrompt P, const FString& Label, float Height, bool bOnDark)
	{
		return SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Prompt(P, Height)]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(6, 0, 0, 0)
			[
				LabelText(Label, Height * 0.68f, bOnDark ? C::OnDarkMuted : C::MapInkMuted, bOnDark)
			];
	}

	// ------------------------------------------------------------------ glow and torches

	void SGlow::Construct(const FArguments& InArgs)
	{
		Color = InArgs._Color;
		Strength = InArgs._Strength;
		Seed = InArgs._Seed;
		SetVisibility(EVisibility::HitTestInvisible);
	}

	int32 SGlow::OnPaint(const FPaintArgs& Args, const FGeometry& G, const FSlateRect& Cull, FSlateWindowElementList& Out, int32 Layer, const FWidgetStyle& Style, bool bEnabled) const
	{
		const float Time = static_cast<float>(FSlateApplication::Get().GetCurrentTime());
		const float F = Hall::bReduceMotion ? 0.85f : Flicker(Time, Seed);
		const float S = Strength.Get(1.f);
		if (S <= 0.01f) return Layer;
		FLinearColor Tint = Color;
		Tint.A = FMath::Clamp(F * S, 0.f, 1.f);
		FSlateDrawElement::MakeBox(Out, Layer, G.ToPaintGeometry(), Hall::Image(TEXT("fx/glow")), ESlateDrawEffect::None, Tint);
		return Layer + 1;
	}

	TSharedRef<SWidget> Torch(float Height, float Seed)
	{
		const float W = Height * 90.f / 220.f;
		return SNew(SBox).WidthOverride(W).HeightOverride(Height)
			[
				SNew(SOverlay)
				+ SOverlay::Slot().Padding(FMargin(-Height * 1.6f, -Height * 0.9f, -Height * 1.6f, -Height * 0.3f))
				[
					SNew(SGlow).Seed(Seed).Strength(0.75f)
				]
				+ SOverlay::Slot()[SNew(SImage).Image(Hall::Image(TEXT("ornaments/torch")))]
			];
	}

	// ------------------------------------------------------------------ banner

	void SBanner::Construct(const FArguments& InArgs)
	{
		Lit = InArgs._Lit;
		Seed = InArgs._Seed;
		const float W = InArgs._Width;
		const FVector2D Natural = Hall::ImageSize(InArgs._Cloth);
		const float H = W * Natural.Y / FMath::Max(1.0, Natural.X);
		// Player banners are short (about 1.6:1); menu banners are tall (about 2.5:1).
		const bool bShort = H < 2.f * W;
		const float RibbonAt = bShort ? 0.6f : 0.58f;
		TAttribute<FString> Numeral = InArgs._Numeral;
		TAttribute<FString> Label = InArgs._Label;
		TAttribute<FString> Gloss = InArgs._Gloss;
		TAttribute<bool> LitAttr = Lit;

		TSharedRef<SOverlay> Body = SNew(SOverlay)
			+ SOverlay::Slot()[SNew(SImage).Image(Hall::Image(InArgs._Cloth))];
		// Charge (menu) in a gold roundel, or the player's arms, about a quarter down the cloth.
		if (!InArgs._Charge.IsEmpty())
		{
			const float R = W * 0.58f;
			Body->AddSlot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(0, H * 0.17f, 0, 0)
			[
				SNew(SBox).WidthOverride(R).HeightOverride(R)
				[
					SNew(SOverlay)
					+ SOverlay::Slot()[SNew(SImage).Image(Hall::Image(TEXT("ornaments/roundel")))]
					+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)[Icon(InArgs._Charge, R * 0.56f)]
				]
			];
		}
		if (!InArgs._ArmsImage.IsEmpty())
		{
			Body->AddSlot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(0, H * (bShort ? 0.085f : 0.15f), 0, 0)[Picture(InArgs._ArmsImage, W * (bShort ? 0.34f : 0.4f))];
		}
		if (Numeral.IsBound() || !Numeral.Get().IsEmpty())
		{
			Body->AddSlot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(0, H * (bShort ? 0.335f : 0.42f), 0, 0)
			[
				SNew(STextBlock).Text_Lambda([Numeral] { return FText::FromString(Numeral.Get()); }).Font(Hall::Title(W * 0.26f))
				.ColorAndOpacity(C::GoldLight).ShadowOffset(FVector2D(2, 2)).ShadowColorAndOpacity(FLinearColor(0, 0, 0, 0.9f))
			];
		}
		// The label ribbon, wider than the cloth, at about 58 % of its height.
		Body->AddSlot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(FMargin(-W * 0.45f, H * RibbonAt, -W * 0.45f, 0))
		[
			SNew(SBox).HeightOverride(FMath::Max(36.f, InArgs._LabelPx * 1.9f))
			[
				SNew(SBorder).BorderImage(Hall::Box(TEXT("ornaments/ribbon-label"), FMargin(0.13f, 0.35f, 0.13f, 0.35f)))
				.Padding(FMargin(56.f + InArgs._LabelPx * 0.8f, 0, 56.f + InArgs._LabelPx * 0.8f, 4)).HAlign(HAlign_Center).VAlign(VAlign_Center)
				[
					SNew(STextBlock).Text_Lambda([Label] { return FText::FromString(Label.Get()); }).Font(Hall::Label(InArgs._LabelPx)).ColorAndOpacity(C::Ink)
				]
			]
		];
		if (Gloss.IsBound() || !Gloss.Get().IsEmpty())
		{
			Body->AddSlot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(FMargin(8, H * RibbonAt + InArgs._LabelPx * 2.1f, 8, 0))
			[
				SNew(STextBlock).Text_Lambda([Gloss] { return FText::FromString(Gloss.Get()); }).Font(Hall::Italic(InArgs._LabelPx * 0.72f))
				.ColorAndOpacity(C::OnDark).ShadowOffset(FVector2D(1, 1)).ShadowColorAndOpacity(FLinearColor(0, 0, 0, 0.9f)).Justification(ETextJustify::Center)
			];
		}

		TSharedRef<SWidget> Hanging = SNew(SBox).WidthOverride(W).HeightOverride(H)[Body];
		Cloth = Hanging;
		Hanging->SetRenderTransformPivot(FVector2D(0.5f, 0.f));

		TSharedRef<SWidget> Content = Hanging;
		if (InArgs._Clickable)
		{
			TSharedRef<SButton> B = SNew(SButton)
				.ButtonStyle(FCoreStyle::Get(), "NoBorder")
				.ContentPadding(0)
				.OnClicked_Lambda([Clicked = InArgs._OnClicked]
				{
					HallSound::Play(TEXT("ui-cloth"));
					return Clicked.IsBound() ? Clicked.Execute() : FReply::Handled();
				})
				.OnHovered_Lambda([] { HallSound::Play(TEXT("ui-cloth"), 0.35f); })
				.ToolTipText(InArgs._ToolTipText)
				[Hanging];
			ButtonWidget = B;
			Content = B;
		}

		ChildSlot
		[
			SNew(SOverlay)
			+ SOverlay::Slot().Padding(FMargin(-W * 0.9f, -H * 0.25f, -W * 0.9f, -H * 0.15f))
			[
				SNew(SGlow).Seed(Seed * 3.f).Strength_Lambda([this] { return (Lit.Get(false) ? 0.85f : 0.f) + (bHot() ? 0.35f : 0.f); })
			]
			+ SOverlay::Slot()[Content]
		];
	}

	bool SBanner::bHot() const
	{
		return ButtonWidget.IsValid() && (ButtonWidget->IsHovered() || ButtonWidget->HasKeyboardFocus());
	}

	void SBanner::Tick(const FGeometry& G, const double Time, const float Dt)
	{
		SCompoundWidget::Tick(G, Time, Dt);
		if (!Cloth) return;
		const float Goal = bHot() ? -10.f : (Lit.Get(false) ? -4.f : 0.f);
		Lift += (Goal - Lift) * FMath::Min(1.f, Dt * 10.f);
		const float Sway = Hall::bReduceMotion ? 0.f : FMath::DegreesToRadians(0.6f * FMath::Sin(static_cast<float>(Time) * 1.3f + Seed) + 0.25f * FMath::Sin(static_cast<float>(Time) * 2.9f + Seed * 1.7f));
		Cloth->SetRenderTransform(FSlateRenderTransform(FQuat2f(Sway), FVector2f(0, Hall::bReduceMotion ? 0.f : Lift)));
	}

	// ------------------------------------------------------------------ scale bar

	int32 SScaleBar::OnPaint(const FPaintArgs& Args, const FGeometry& G, const FSlateRect& Cull, FSlateWindowElementList& Out, int32 Layer, const FWidgetStyle& Style, bool bEnabled) const
	{
		const FSlateBrush* White = FCoreStyle::Get().GetBrush("GenericWhiteBox");
		const FVector2f Size = G.GetLocalSize();
		const float BarH = Size.Y * 0.38f;
		const float Cell = Size.X / Max;
		for (int32 I = 0; I < Max; I++)
		{
			const bool bOver = I >= Limit;
			const bool bFilled = I < Value;
			FLinearColor Col = (I % 2 == 0) ? C::Ink : C::Vellum;
			if (bOver) Col = (I % 2 == 0) ? C::RubricDark : FLinearColor(0.9f, 0.62f, 0.55f);
			if (!bFilled) Col = FMath::Lerp(Col, C::Parchment, 0.55f);
			FSlateDrawElement::MakeBox(Out, Layer, G.ToPaintGeometry(FVector2f(Cell, BarH), FSlateLayoutTransform(FVector2f(I * Cell, 0))), White, ESlateDrawEffect::None, Col);
		}
		FSlateDrawElement::MakeLines(Out, Layer + 1, G.ToPaintGeometry(), TArray<FVector2f>{{0, 0}, {Size.X, 0}, {Size.X, BarH}, {0, BarH}, {0, 0}}, ESlateDrawEffect::None, C::Ink, true, 1.5f);
		// The limit mark and the hand's marker.
		const float LimitX = Limit * Cell;
		FSlateDrawElement::MakeLines(Out, Layer + 1, G.ToPaintGeometry(), TArray<FVector2f>{{LimitX, -4}, {LimitX, BarH + 4}}, ESlateDrawEffect::None, C::Rubric, true, 2.5f);
		const float X = FMath::Min<float>(Value, Max) * Cell;
		FSlateDrawElement::MakeLines(Out, Layer + 2, G.ToPaintGeometry(), TArray<FVector2f>{{X - 6, -7}, {X + 6, -7}, {X, 1}, {X - 6, -7}}, ESlateDrawEffect::None, Value > Limit ? C::Rubric : C::Ink, true, 2.f);
		// Figures under the bar.
		const FSlateFontInfo Font = Hall::Body(13);
		const TSharedRef<FSlateFontMeasure> Measure = FSlateApplication::Get().GetRenderer()->GetFontMeasureService();
		for (int32 N : {0, 3, 5, 7, 9, 12})
		{
			if (N > Max) continue;
			const FString S = FString::FromInt(N);
			const FVector2f Sz = Measure->Measure(S, Font);
			FSlateDrawElement::MakeText(Out, Layer + 1, G.ToPaintGeometry(Sz, FSlateLayoutTransform(FVector2f(N * Cell - Sz.X * 0.5f, BarH + 1))), S, Font, ESlateDrawEffect::None, N == Limit ? C::Rubric : C::MapInk);
		}
		return Layer + 3;
	}
}
