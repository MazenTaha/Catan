// The table's Hall & Chart presentation (docs/CATNIGHT_UI_PLAN.md §5–8). The rules logic, the
// board widget and the 3D board hookup stay in STable.cpp; this file only draws.
#include "Table/STable.h"

#include "Brushes/SlateRoundedBoxBrush.h"
#include "CatnightRules/Rules.h"
#include "Daytime.h"
#include "Framework/Application/SlateApplication.h"
#include "Lexicon.h"
#include "Ui/HallKit.h"
#include "Ui/HallSound.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SWrapBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/SNullWidget.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"

using namespace catnight;
using namespace HallKit;
namespace C = Hall::Color;

namespace
{
	/** Widths of the Lists (top left) and the Herald (bottom left) over the island. */
	constexpr float kListsWidth = 330.f;
	constexpr float kHeraldWidth = 420.f;

	PartialCounts Partial(const Counts& Cnt)
	{
		PartialCounts P;
		for (Resource R : kResources)
			if (Cnt[R] > 0) P.Set(R, Cnt[R]);
		return P;
	}

	FString Roman(int32 N)
	{
		static const TPair<int32, const TCHAR*> Table[] = {{40, TEXT("XL")}, {10, TEXT("X")}, {9, TEXT("IX")}, {5, TEXT("V")}, {4, TEXT("IV")}, {1, TEXT("I")}};
		FString Out;
		for (const auto& [Value, Sym] : Table)
			while (N >= Value) { Out += Sym; N -= Value; }
		return Out;
	}

	/** The island's time of day from the game (Daytime.h; the 3D table's light follows the same clock). */
	FString TimeOfDay(const GameState& S) { return CatnightDay::StageName(CatnightDay::HourOf(S)); }

	TSharedRef<SWidget> ArmsOf(const PlayerState& P, float H) { return Arms(P.color, P.sigil, H); }

	/** A thin meter: a gold fill on vellum. */
	TSharedRef<SWidget> Meter(float Fraction, const FLinearColor& Fill, float Height = 6.f)
	{
		const float F = FMath::Clamp(Fraction, 0.f, 1.f);
		const FSlateBrush* White = FCoreStyle::Get().GetBrush("GenericWhiteBox");
		return SNew(SBox).HeightOverride(Height)
			[
				SNew(SBorder).BorderImage(White).BorderBackgroundColor(FLinearColor(0.f, 0.f, 0.f, 0.25f)).Padding(1)
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().FillWidth(FMath::Max(F, 0.001f))[SNew(SBorder).BorderImage(White).BorderBackgroundColor(Fill)]
					+ SHorizontalBox::Slot().FillWidth(FMath::Max(1.f - F, 0.001f))[SNew(SBorder).BorderImage(White).BorderBackgroundColor(FLinearColor(1.f, 0.96f, 0.86f, 0.35f))]
				]
			];
	}

	/** The cost of a build as small card art, each card dimmed when the hand lacks it. */
	TSharedRef<SWidget> CostRow(const Counts& Hand, CostKey Key)
	{
		const Counts Need = Cost(Key).ToCounts();
		TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox);
		for (Resource R : kResources)
		{
			for (int32 K = 0; K < Need[R]; K++)
			{
				const bool bHave = Hand[R] > K;
				Row->AddSlot().AutoWidth().Padding(0, 0, 3, 0)
				[
					SNew(SBox).WidthOverride(24).HeightOverride(33)
					[
						SNew(SOverlay)
						+ SOverlay::Slot()[SNew(SImage).Image(Hall::Image(Hall::CardName(R))).ColorAndOpacity(bHave ? FLinearColor::White : FLinearColor(0.35f, 0.33f, 0.32f))]
						+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Bottom)
						[
							SNew(SBox).WidthOverride(9).HeightOverride(9)
							[
								SNew(SBorder).BorderImage(FCoreStyle::Get().GetBrush("GenericWhiteBox")).BorderBackgroundColor(bHave ? C::OnDarkOk : C::Rubric)
							]
						]
					]
				];
			}
		}
		return Row;
	}
}

// ------------------------------------------------------------------ the instruction

FString STable::Instruction() const
{
	const GameState& S = Match->State();
	if (Match->IsEnded())
	{
		const FString Who = CatnightText::Player(S, *S.winner);
		return Who == TEXT("You") ? FString(TEXT("You win!")) : Who + TEXT(" wins!");
	}
	if (Match->NeedsHandoff()) return FString::Printf(TEXT("Pass the device to %s"), *CatnightText::Player(S, Match->Actor()));
	if (S.phase.kind == PhaseKind::Trade && S.phase.offer.proposer == Me() && !Match->IsHumanToAct())
	{
		return FString::Printf(TEXT("Waiting for %s to answer the offer"), *CatnightText::Player(S, Match->Actor()));
	}
	if (!Match->IsHumanToAct())
	{
		return Match->Actor() == Me() ? FString(TEXT("A bot is playing your seat…")) : FString::Printf(TEXT("%s is thinking…"), *CatnightText::Player(S, Match->Actor()));
	}
	switch (S.phase.kind)
	{
	case PhaseKind::Setup:
	{
		int32 Mine = 0;
		for (int32 V : S.buildings.order) Mine += S.buildings.at[V]->owner == Me() ? 1 : 0;
		if (S.phase.stepCauseway) return TEXT("Build a Road from your new Settlement");
		return Mine == 0 ? TEXT("Place your first Settlement") : TEXT("Place your second Settlement — it gives you resources at once");
	}
	case PhaseKind::Roll: return TEXT("Roll the dice — or play a Knight first");
	case PhaseKind::Discard: return FString::Printf(TEXT("Discard %d cards"), S.phase.pending[Me()]);
	case PhaseKind::MoveWraith: return TEXT("Move the robber — pick any other hex");
	case PhaseKind::Steal: return TEXT("Choose whom to rob");
	case PhaseKind::Decree: return FString::Printf(TEXT("Build %d free Road%s (Road Building)"), S.phase.remaining, S.phase.remaining == 1 ? TEXT("") : TEXT("s"));
	case PhaseKind::Trade: return FString::Printf(TEXT("%s offers you a trade"), *CatnightText::Player(S, S.phase.offer.proposer));
	case PhaseKind::Main: return Build == EBuild::None ? TEXT("Build & trade, then end your turn") : TEXT("Pick a glowing spot to build");
	default: return FString();
	}
}

// ------------------------------------------------------------------ over the island

TSharedRef<SWidget> STable::BuildHud()
{
	if (!Match->HasGame()) return SNullWidget::NullWidget;
	// The Lists (top left) and the Herald (bottom left) take this much of the island's width.
	const float ListsEdge = 26.f + kListsWidth + 14.f;
	const float HeraldEdge = 26.f + kHeraldWidth + 14.f;
	TWeakPtr<SBox> WeakHud = HudSlot;
	auto HudWidth = [WeakHud]
	{
		const TSharedPtr<SBox> H = WeakHud.Pin();
		return H ? static_cast<float>(H->GetCachedGeometry().GetLocalSize().X) : 0.f;
	};
	// Centred over the island when there is room; on narrow screens, centred in the space beside the
	// Lists or the Herald, so nothing is drawn over them.
	auto Beside = [HudWidth](TSharedRef<SWidget> W, float LeftEdge) -> TSharedRef<SWidget>
	{
		TWeakPtr<SWidget> Weak = W;
		return SNew(SBox).Visibility(EVisibility::SelfHitTestInvisible)
			.Padding_Lambda([Weak, HudWidth, LeftEdge]
			{
				const TSharedPtr<SWidget> Pin = Weak.Pin();
				const float Avail = HudWidth();
				if (!Pin || Avail <= 0.f) return FMargin(0);
				const float Need = Pin->GetDesiredSize().X;
				return FMargin(FMath::Clamp(2.f * LeftEdge + Need - Avail, 0.f, FMath::Max(0.f, Avail - Need)), 0, 0, 0);
			})
			[W];
	};
	// The room the instruction and hints have beside the Herald (they wrap or shrink to it).
	auto BottomRoom = [HudWidth, HeraldEdge] { const float Avail = HudWidth(); return Avail > 0.f ? FMath::Max(320.f, Avail - HeraldEdge - 14.f) : 1200.f; };

	TSharedRef<SVerticalBox> Bottom = SNew(SVerticalBox).Visibility(EVisibility::SelfHitTestInvisible);
	if (!Match->LastError.IsEmpty())
	{
		Bottom->AddSlot().AutoHeight().HAlign(HAlign_Center).Padding(0, 0, 0, 10)[Slip(Match->LastError, C::Rubric)];
	}
	Bottom->AddSlot().AutoHeight().HAlign(HAlign_Center)[Ribbon(Instruction(), 25, 420.f, true)];
	// Button prompts for the device in use (plan §4.5, §9): glyphs, not key names in the text.
	TSharedRef<SWrapBox> Hints = SNew(SWrapBox).Visibility(EVisibility::HitTestInvisible).PreferredSize_Lambda(BottomRoom).HAlign(HAlign_Center).InnerSlotPadding(FVector2D(0, 4));
	auto AddHint = [&Hints](Hall::EPrompt P, const FString& Label)
	{
		Hints->AddSlot().VAlign(VAlign_Center).Padding(FMargin(9, 0))[PromptHint(P, Label, 30.f)];
	};
	const bool bActing = Match->IsHumanToAct() && !Match->NeedsHandoff();
	if (bActing && Targets->Kind != FBoardTargets::EKind::None)
	{
		AddHint(Hall::EPrompt::Cycle, TEXT("choose a spot"));
		AddHint(Hall::EPrompt::Confirm, TEXT("place"));
	}
	const GameState& HS = Match->State();
	if (bActing && HS.currentPlayer == Me() && (HS.phase.kind == PhaseKind::Roll || (HS.phase.kind == PhaseKind::Main && Build == EBuild::None)))
	{
		AddHint(Hall::EPrompt::Primary, HS.phase.kind == PhaseKind::Roll ? TEXT("roll") : TEXT("end turn"));
	}
	if (bActing && Build != EBuild::None) AddHint(Hall::EPrompt::Back, TEXT("cancel"));
	if (View->b3D)
	{
		AddHint(Hall::EPrompt::Turn, TEXT("turn the table"));
		AddHint(Hall::EPrompt::Zoom, TEXT("zoom"));
	}
	// On a soft dark plate so the prompts read over bright sea and meadows.
	Bottom->AddSlot().AutoHeight().HAlign(HAlign_Center).Padding(0, 8, 0, 0)
	[
		SNew(SBorder).Visibility(EVisibility::HitTestInvisible)
		.BorderImage([] { static const FSlateRoundedBoxBrush Plate(FLinearColor(0.02f, 0.015f, 0.01f, 0.66f), 16.f); return &Plate; }())
		.Padding(FMargin(8, 5))
		[Hints]
	];

	Bottom->AddSlot().AutoHeight().HAlign(HAlign_Center).Padding(0, 4, 0, 0)[OnDark(CatnightText::InspectionHint(), 16, C::OnDarkMuted, true)];

	return SNew(SOverlay).Visibility(EVisibility::SelfHitTestInvisible)
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Top).Padding(FMargin(26, 22, 0, 0))[ListsBox()]
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(FMargin(0, 4, 0, 0))[Beside(BannersRow(), ListsEdge)]
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Bottom).Padding(FMargin(26, 0, 0, 26))[HeraldBox()]
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Bottom).Padding(FMargin(0, 0, 0, 22))
		[
			Beside(SNew(SBox).Visibility(EVisibility::SelfHitTestInvisible).MaxDesiredWidth_Lambda([BottomRoom] { return FOptionalSize(BottomRoom()); })[Bottom], HeraldEdge)
		];
}

TSharedRef<SWidget> STable::ListsBox()
{
	const GameState& S = Match->State();
	const FString When = S.round > 0 ? FString::Printf(TEXT("Round %s · %s"), *Roman(S.round), *TimeOfDay(S)) : FString::Printf(TEXT("Founding · %s"), *TimeOfDay(S));
	int32 Lead = 0;
	for (const PlayerState& P : S.players) Lead = FMath::Max(Lead, VictoryPoints(S, P.id, false));

	auto Claim = [&](const FString& Name, std::optional<int> Holder, int32 Best, int32 Need, const FString& Unit) -> TSharedRef<SWidget>
	{
		TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox);
		if (Holder)
		{
			const PlayerState& P = S.players[*Holder];
			Row->AddSlot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 8, 0)[ArmsOf(P, 34)];
			Row->AddSlot().FillWidth(1.f).VAlign(VAlign_Center)
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()[LabelText(Name, 20, C::Ink)]
				+ SVerticalBox::Slot().AutoHeight()[InkItalic(FString::Printf(TEXT("%s · %d %s"), UTF8_TO_TCHAR(P.name.c_str()), Best, *Unit), 17, C::MapInk)]
			];
		}
		else
		{
			Row->AddSlot().FillWidth(1.f).VAlign(VAlign_Center)
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()[LabelText(Name, 20, C::MapInkMuted)]
				+ SVerticalBox::Slot().AutoHeight()[InkItalic(FString::Printf(TEXT("Needs %d+ · best %d"), Need, Best), 17)]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 3, 0, 0)[Meter(static_cast<float>(Best) / Need, C::GoldDark, 4.f)]
			];
		}
		Row->AddSlot().AutoWidth().VAlign(VAlign_Center).Padding(10, 0, 0, 0)[LabelText(TEXT("+2"), 21, Holder ? C::Rubric : C::MapInkMuted)];
		return Row;
	};
	int32 BestRoad = 0, BestArmy = 0;
	for (int32 L : S.longestLengths) BestRoad = FMath::Max(BestRoad, L);
	for (const PlayerState& P : S.players) BestArmy = FMath::Max(BestArmy, P.playedWardens);

	return SNew(SBox).WidthOverride(kListsWidth)
		[
			Paper(SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()[FitText(LabelText(When, 22, C::Ink))]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 4, 0, 0)
				[
					SNew(SHorizontalBox)
					// One line (a wrapping block in an auto-width slot broke "First to / 10").
					+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 10, 0)
					[
						SNew(STextBlock).Text(FText::FromString(FString::Printf(TEXT("First to %d"), S.config.targetVp))).Font(Hall::Italic(18)).ColorAndOpacity(C::MapInk)
					]
					+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)[Meter(static_cast<float>(Lead) / S.config.targetVp, C::Gold)]
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 4, 0, 0)[Ink(CatnightText::DiceResult(S), 18)]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 4)[Rule()]
				+ SVerticalBox::Slot().AutoHeight()[Claim(TEXT("Longest Road"), S.longestHolder, BestRoad, kLongestMin, TEXT("long"))]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 8, 0, 0)[Claim(TEXT("Largest Army"), S.hostHolder, BestArmy, kHostMin, TEXT("Knights"))],
				EPaper::Vellum, FMargin(20, 14))
		];
}

TSharedRef<SWidget> STable::BannersRow()
{
	const GameState& S = Match->State();
	const float W = 104.f;
	const float Gap = 38.f;
	const int32 N = static_cast<int32>(S.players.size());
	TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox);
	for (const PlayerState& P : S.players)
	{
		const bool bMine = P.id == Me() && !Match->NeedsHandoff();
		const int32 Vp = VictoryPoints(S, P.id, bMine || Match->IsEnded());
		FString Name = UTF8_TO_TCHAR(P.name.c_str());
		if (P.id == Me() && Match->HumanCount() == 1 && Name != TEXT("You")) Name += TEXT(" · you");
		FString Gloss = FString::Printf(TEXT("%d cards"), HandTotal(P));
		if (!Match->IsEnded() && P.id == Match->Actor() && P.kind == SeatKind::Bot) Gloss = TEXT("thinking…");
		Row->AddSlot().AutoWidth().Padding(FMargin(Gap * 0.5f, 0))
		[
			SNew(SBanner).Cloth(Hall::PlayerBannerName(P.color)).ArmsImage(Hall::ArmsName(P.color, P.sigil))
			.Numeral(FString::FromInt(Vp)).Label(Name).LabelPx(19).Gloss(Gloss).Width(W)
			.Lit(P.id == S.currentPlayer && !Match->IsEnded()).Seed(P.id * 1.7f)
			.ToolTipText(FText::FromString(FString::Printf(TEXT("%s: %d points, %d cards, %d development cards, %d Knights, road %d"),
				UTF8_TO_TCHAR(P.name.c_str()), Vp, HandTotal(P), static_cast<int32>(P.omens.size()), P.playedWardens,
				P.id < static_cast<int32>(S.longestLengths.size()) ? S.longestLengths[P.id] : 0)))
		];
	}
	const float PoleW = N * (W + Gap) + 70.f, PoleH = PoleW * 0.1f;
	return SNew(SOverlay)
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Top)[Picture(TEXT("ornaments/banner-pole-800"), PoleW, PoleH)]
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(0, PoleH * 0.44f - W * 0.093f, 0, 0)[Row];
}

TSharedRef<SWidget> STable::HeraldBox()
{
	const TArray<FString>& Log = Match->Log;
	const int32 Count = bFullLog ? 14 : 6;
	TSharedRef<SVerticalBox> Lines = SNew(SVerticalBox);
	int32 Shown = 0;
	for (int32 I = Log.Num() - 1; I >= 0 && Shown < Count; I--, Shown++)
	{
		// Older lines fade, but never below easy reading.
		const float Fade = FMath::Clamp(1.f - Shown * 0.09f, 0.6f, 1.f);
		Lines->AddSlot().AutoHeight().Padding(0, 1)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 6, 0)[LabelText(TEXT("¶"), 18, FLinearColor(C::Rubric.R, C::Rubric.G, C::Rubric.B, Fade))]
			+ SHorizontalBox::Slot().FillWidth(1.f)[Ink(Log[I], 18, FLinearColor(C::MapInk.R, C::MapInk.G, C::MapInk.B, Fade))]
		];
	}
	return SNew(SBox).WidthOverride(kHeraldWidth)
		[
			Paper(SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)[LabelText(TEXT("The Herald"), 22, C::RubricDark)]
					+ SHorizontalBox::Slot().AutoWidth()[Button(bFullLog ? TEXT("Less") : TEXT("More"), [this] { bFullLog = !bFullLog; return Redraw(); }, EButton::Paper, true, nullptr, TEXT("scroll"), 17)]
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 2, 0, 4)[Rule()]
				+ SVerticalBox::Slot().AutoHeight()[Lines],
				EPaper::Parchment, FMargin(18, 12))
		];
}

// ------------------------------------------------------------------ the right column

TSharedRef<SWidget> STable::BuildPanel()
{
	if (!Match->HasGame()) return Ink(TEXT("No game"));
	TSharedRef<SVerticalBox> Box = SNew(SVerticalBox);
	// Toolbar: brass plaques.
	Box->AddSlot().AutoHeight()
	[
		SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 8, 0)
		[
			Button(View->b3D ? TEXT("Chart") : TEXT("3D table"), [this]
			{
				View->b3D = !View->b3D;
				View->Revision++;
				if (Board) Board->Invalidate(EInvalidateWidgetReason::Paint);
				return Redraw();
			}, EButton::Plaque, View->PickUnderMouse != nullptr || View->b3D, nullptr, TEXT("hex"), 18)
		]
		+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 8, 0)[Button(TEXT("Undo"), [this] { Match->Undo(); return Redraw(); }, EButton::Plaque, Match->CanUndo(), nullptr, TEXT("undo"), 18)]
		+ SHorizontalBox::Slot().FillWidth(1.f)[SNullWidget::NullWidget]
		+ SHorizontalBox::Slot().AutoWidth()[Button(TEXT("Menu"), [this] { bLeaving = true; return Redraw(); }, EButton::Plaque, true, nullptr, TEXT("door"), 18)]
	];
	if (!Match->NeedsHandoff())
	{
		// Spacing sized so the whole column fits a 720p window (900 units at its UI scale) unscrolled.
		Box->AddSlot().AutoHeight().Padding(0, 20, 0, 0)[TreasuryBox()];
		const TSharedPtr<SWidget> Decision = DecreeBox();
		// A decree for you to answer arrives with the rustle of parchment.
		const bool bDecree = Decision.IsValid() && Match->IsHumanToAct();
		if (bDecree && !bDecreeShown) HallSound::Play(TEXT("ui-parchment"));
		bDecreeShown = bDecree;
		Box->AddSlot().AutoHeight().Padding(0, 18, 0, 0)[Decision ? Decision.ToSharedRef() : OrdersBox()];
		Box->AddSlot().AutoHeight().Padding(0, 12, 0, 0)[PrimaryBox()];
	}
	return Box;
}

TSharedRef<SWidget> STable::TreasuryBox()
{
	const GameState& S = Match->State();
	const PlayerState& Mine = S.players[Me()];
	TSharedRef<SHorizontalBox> Cards = SNew(SHorizontalBox);
	for (Resource R : kResources)
	{
		TSharedRef<SWidget> Card = ResourceCard(R, Mine.hand[R], 60);
		HandCards[static_cast<int32>(R)] = Card;
		Cards->AddSlot().AutoWidth().Padding(0, 0, R == Resource::Ore ? 0 : 5, 0)[Card];
	}
	const int32 Total = HandTotal(Mine);
	const FString Limit = Total > kHandLimit ? FString::Printf(TEXT("A 7 would cost you %d cards"), Total / 2)
		: FString::Printf(TEXT("%d to the limit"), kHandLimit - Total);
	// The owner's name for the hand: "Materials" (hot-seat: whose materials they are).
	const FString Title = Match->HumanCount() > 1 ? FString::Printf(TEXT("%s's Materials"), UTF8_TO_TCHAR(Mine.name.c_str())) : FString(TEXT("Materials"));
	return Oak(SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)[Cards]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 14, 0, 0)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Top).Padding(0, 0, 12, 0)[LabelText(FString::Printf(TEXT("%d cards"), Total), 20, C::OnDark, true)]
			+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Top).Padding(0, 6, 4, 0)[SNew(SBox).HeightOverride(40)[SNew(SScaleBar).Value(Total).Limit(kHandLimit).Max(12)]]
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 2, 0, 0)[OnDark(Limit, 18, Total > kHandLimit ? C::OnDarkWarn : C::OnDarkMuted)],
		Title, FMargin(14, 14));
}

TSharedRef<SWidget> STable::PrimaryBox()
{
	const GameState& S = Match->State();
	TSharedRef<SVerticalBox> Box = SNew(SVerticalBox);
	const bool bMyTurn = Match->IsHumanToAct() && S.currentPlayer == Me();
	if (Match->IsEnded())
	{
		Box->AddSlot().AutoHeight().HAlign(HAlign_Center)[Button(TEXT("See the results"), [this] { bVictorySeen = false; return Redraw(); }, EButton::SealOnDark, true, &Primary, TEXT("crown"), 26)];
		return Box;
	}
	if (bMyTurn && S.phase.kind == PhaseKind::Roll)
	{
		Box->AddSlot().AutoHeight().HAlign(HAlign_Center)[Button(TEXT("Roll the dice"), [this] { return Do(Action::Make(ActionType::RollDice, Me())); }, EButton::SealOnDark, true, &Primary, TEXT("hex"), 28)];
	}
	else if (bMyTurn && S.phase.kind == PhaseKind::Main)
	{
		Box->AddSlot().AutoHeight().HAlign(HAlign_Center)[Button(TEXT("End turn"), [this] { Build = EBuild::None; return Do(Action::Make(ActionType::EndTurn, Me())); }, EButton::SealOnDark, true, Primary ? nullptr : &Primary, TEXT("hourglass"), 28)];
	}
	if (bMyTurn && (S.phase.kind == PhaseKind::Roll || S.phase.kind == PhaseKind::Main))
	{
		Box->AddSlot().AutoHeight().HAlign(HAlign_Center).Padding(0, 2, 0, 0)[Prompt(Hall::EPrompt::Primary, 28.f)];
	}
	const int32 N = static_cast<int32>(S.players.size());
	const PlayerState& Next = S.players[(S.currentPlayer + 1) % N];
	Box->AddSlot().AutoHeight().HAlign(HAlign_Center).Padding(0, 8, 0, 0)
	[
		SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 8, 0)[SNew(STextBlock).Text(FText::FromString(TEXT("Next up"))).Font(Hall::Italic(19)).ColorAndOpacity(C::OnDarkMuted)]
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 6, 0)[ArmsOf(Next, 30)]
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[LabelText(UTF8_TO_TCHAR(Next.name.c_str()), 21, C::OnDark, true)]
	];
	return Box;
}

TSharedRef<SWidget> STable::OrdersBox()
{
	const PlayerState& Mine = Match->State().players[Me()];
	auto TabButton = [this](ETab T, const FString& Label)
	{
		return Button(Label, [this, T] { Tab = T; return Redraw(); }, Tab == T ? EButton::TabOn : EButton::Tab, true, nullptr, FString(), 20);
	};
	TSharedRef<SWidget> Body = Tab == ETab::Build ? BuildTab() : Tab == ETab::Cards ? CardsTab() : TradeBox();
	return Oak(SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight()
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f).HAlign(HAlign_Center)[TabButton(ETab::Build, TEXT("Build"))]
			+ SHorizontalBox::Slot().FillWidth(1.f).HAlign(HAlign_Center)[TabButton(ETab::Cards, FString::Printf(TEXT("Cards (%d)"), static_cast<int32>(Mine.omens.size())))]
			+ SHorizontalBox::Slot().FillWidth(1.f).HAlign(HAlign_Center)[TabButton(ETab::Trade, TEXT("Trade"))]
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 4, 0, 6)[Rule(C::OnDarkMuted)]
		+ SVerticalBox::Slot().AutoHeight()[Body],
		FString(), FMargin(12, 10));
}

TSharedRef<SWidget> STable::BuildTab()
{
	const GameState& S = Match->State();
	const int32 P = Me();
	const PlayerState& Mine = S.players[P];
	const bool bMain = Match->IsHumanToAct() && S.currentPlayer == P && S.phase.kind == PhaseKind::Main;
	struct FItem { const TCHAR* Name; const TCHAR* Blurb; CostKey Cost; EBuild Kind; int32 Left; bool bSpot; };
	const FItem Items[] = {
		{TEXT("Road"), TEXT("Links buildings"), CostKey::Causeway, EBuild::Road, Mine.supply.causeways, !LegalCausewaySpots(S, P).empty()},
		{TEXT("Settlement"), TEXT("1 point"), CostKey::Outpost, EBuild::Settlement, Mine.supply.outposts, !LegalOutpostSpots(S, P).empty()},
		{TEXT("City"), TEXT("2 points"), CostKey::Citadel, EBuild::City, Mine.supply.citadels, !LegalCitadelSpots(S, P).empty()},
		{TEXT("Dev. card"), TEXT("Random card"), CostKey::Omen, EBuild::None, static_cast<int32>(S.omenDeck.size()), true},
	};
	TSharedRef<SVerticalBox> Grid = SNew(SVerticalBox);
	TSharedPtr<SHorizontalBox> Row;
	int32 Index = 0;
	for (const FItem& It : Items)
	{
		if (Index % 2 == 0)
		{
			Row = SNew(SHorizontalBox);
			Grid->AddSlot().AutoHeight().Padding(0, 0, 0, 8)[Row.ToSharedRef()];
		}
		const bool bAfford = CanAfford(Mine.hand, It.Cost);
		const bool bOn = It.Kind != EBuild::None && Build == It.Kind;
		const Counts Need = Cost(It.Cost).ToCounts();
		int32 Short = 0;
		for (Resource R : kResources) Short += FMath::Max(0, Need[R] - Mine.hand[R]);
		FString Status;
		FLinearColor StatusColor = C::MapInkMuted;
		if (bOn) { Status = TEXT("Pick a spot"); StatusColor = C::GoldDark; }
		else if (!bMain) Status = S.phase.kind == PhaseKind::Roll && S.currentPlayer == P ? TEXT("Roll first") : TEXT("Not now");
		else if (It.Left <= 0) Status = TEXT("None left");
		else if (!bAfford) Status = FString::Printf(TEXT("%d short"), Short);
		else if (!It.bSpot) Status = TEXT("No spot");
		else { Status = It.Kind == EBuild::None ? TEXT("Buy") : TEXT("Build"); StatusColor = C::OkInk; }
		const bool bReady = bMain && bAfford && It.Left > 0 && It.bSpot;
		const EBuild Kind = It.Kind;
		TFunction<FReply()> Click = [this, Kind, P, bReady, bOn]() -> FReply
		{
			if (!bReady && !bOn) return FReply::Handled();
			if (Kind == EBuild::None) return Do(Action::Make(ActionType::BuyOmen, P));
			Build = Build == Kind ? EBuild::None : Kind;
			return Redraw();
		};
		// Name alone on the first line (it is the widest word), what it is, the cost, then the status
		// with the pieces left in the supply: nothing shares a line it could be squeezed off.
		TSharedRef<SWidget> Card = SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight()[FitText(LabelText(It.Name, 21, C::Ink))]
			+ SVerticalBox::Slot().AutoHeight()[InkItalic(It.Blurb, 17)]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 5, 0, 4)[CostRow(Mine.hand, It.Cost)]
			+ SVerticalBox::Slot().AutoHeight()
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)[FitText(LabelText(Status, 18, StatusColor))]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(6, 0, 0, 0)[Ink(FString::Printf(TEXT("%d left"), It.Left), 16, C::MapInkMuted, false)]
			];
		Row->AddSlot().FillWidth(1.f).Padding(Index % 2 == 0 ? FMargin(0, 0, 4, 0) : FMargin(4, 0, 0, 0))
		[
			SNew(SBox).MinDesiredHeight(128)
			[
				Clickable(SNew(SBorder).BorderImage(FCoreStyle::Get().GetBrush("NoBorder")).Padding(0).ColorAndOpacity(bReady || bOn ? FLinearColor::White : FLinearColor(0.82f, 0.8f, 0.78f))
					[
						Paper(Card, bOn ? EPaper::Letter : EPaper::Parchment, FMargin(11, 9))
					], Click)
			]
		];
		Index++;
	}
	return Grid;
}

TSharedRef<SWidget> STable::CardsTab()
{
	const GameState& S = Match->State();
	const PlayerState& Mine = S.players[Me()];
	TSharedRef<SVerticalBox> Box = SNew(SVerticalBox);
	const bool bMyTurn = Match->IsHumanToAct() && S.currentPlayer == Me() && (S.phase.kind == PhaseKind::Roll || S.phase.kind == PhaseKind::Main);
	bool bAny = false;
	for (OmenType O : kOmenTypes)
	{
		int32 Count = 0, Ready = 0;
		for (const OwnedOmen& Own : Mine.omens)
		{
			if (Own.type != O) continue;
			Count++;
			if (Own.boughtTurn < S.turn) Ready++;
		}
		if (!Count) continue;
		bAny = true;
		FString Reason;
		if (O == OmenType::Relic) Reason = TEXT("Hidden · +1 point");
		else if (!bMyTurn) Reason = TEXT("Not your turn");
		else if (S.omenPlayedThisTurn) Reason = TEXT("One per turn");
		else if (Ready == 0) Reason = TEXT("Bought this turn");
		else if (O == OmenType::Manup) Reason = TEXT("No one to duel");
		else if (O == OmenType::Decree && (Mine.supply.causeways <= 0 || LegalCausewaySpots(S, Mine.id).empty())) Reason = TEXT("Not now");
		TFunction<FReply()> Play = [this, O]() -> FReply
		{
			switch (O)
			{
			case OmenType::Warden: return Do(Action::Make(ActionType::PlayWarden, Me()));
			case OmenType::Decree: return Do(Action::Make(ActionType::PlayDecree, Me()));
			case OmenType::Harvest: bChoosingPlenty = true; PlentyPick.Reset(); return Redraw();
			case OmenType::Tithe: bChoosingMonopoly = true; return Redraw();
			default: return FReply::Handled();
			}
		};
		Box->AddSlot().AutoHeight().Padding(0, 0, 0, 8)
		[
			Paper(SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Top).Padding(0, 0, 10, 0)[Picture(Hall::OmenCardName(O), 50, 72)]
				+ SHorizontalBox::Slot().FillWidth(1.f)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()[FitText(LabelText(FString::Printf(TEXT("%s ×%d"), *CatnightText::Omen(O), Count), 20, C::Ink))]
					+ SVerticalBox::Slot().AutoHeight()[Ink(CatnightText::OmenHelp(O), 17)]
					+ SVerticalBox::Slot().AutoHeight().Padding(0, 4, 0, 0)
					[
						Reason.IsEmpty() ? Button(TEXT("Play"), Play, EButton::Seal, true, nullptr, TEXT("crown"), 19) : InkItalic(Reason, 17)
					]
				],
				EPaper::Parchment, FMargin(12, 9))
		];
	}
	if (!bAny) Box->AddSlot().AutoHeight()[OnDark(TEXT("No development cards yet. Buy one from the Build tab."), 18, C::OnDarkMuted)];
	if (!Mine.playedOmens.empty())
	{
		TSharedRef<SHorizontalBox> Fan = SNew(SHorizontalBox);
		for (OmenType O : Mine.playedOmens) Fan->AddSlot().AutoWidth().Padding(0, 0, -10, 0)[Picture(Hall::OmenCardName(O), 34, 48)];
		Box->AddSlot().AutoHeight().Padding(0, 6, 0, 0)[OnDark(TEXT("Played"), 18, C::OnDarkMuted, false)];
		Box->AddSlot().AutoHeight().Padding(0, 4, 0, 0)[Fan];
	}
	return Box;
}

TSharedRef<SWidget> STable::TermsEditor(Counts& Give, Counts& Want, const Counts& Hand)
{
	// Two compact steppers per resource: the columns are as wide as the steppers, so none is cut.
	const float Col = 98.f;
	TSharedRef<SVerticalBox> Box = SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight()
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f)[SNullWidget::NullWidget]
			+ SHorizontalBox::Slot().AutoWidth()[SNew(SBox).WidthOverride(Col).HAlign(HAlign_Center)[LabelText(TEXT("Give"), 18, C::Rubric)]]
			+ SHorizontalBox::Slot().AutoWidth()[SNew(SBox).WidthOverride(Col).HAlign(HAlign_Center)[LabelText(TEXT("Want"), 18, C::OkInk)]]
		];
	for (Resource R : kResources)
	{
		Give[R] = FMath::Clamp(Give[R], 0, Hand[R]);
		Box->AddSlot().AutoHeight().Padding(0, 2)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 6, 0)[Picture(Hall::CardName(R), 24, 33)]
			+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)[FitText(Ink(FString::Printf(TEXT("%s (%d)"), *CatnightText::Resource(R), Hand[R]), 17, C::MapInk, false))]
			+ SHorizontalBox::Slot().AutoWidth()[SNew(SBox).WidthOverride(Col).HAlign(HAlign_Center)[Stepper(Give[R], [this, &Give, &Want, R](int32 V) { Give[R] = V; if (V > 0) Want[R] = 0; bDirty = true; }, 0, Hand[R], false, 30.f)]]
			+ SHorizontalBox::Slot().AutoWidth()[SNew(SBox).WidthOverride(Col).HAlign(HAlign_Center)[Stepper(Want[R], [this, &Give, &Want, R](int32 V) { Want[R] = V; if (V > 0) Give[R] = 0; bDirty = true; }, 0, 9, false, 30.f)]]
		];
	}
	return Box;
}

TSharedRef<SWidget> STable::TradeBox()
{
	const GameState& S = Match->State();
	const int32 P = Me();
	const PlayerState& Mine = S.players[P];
	const bool bMain = Match->IsHumanToAct() && S.currentPlayer == P && S.phase.kind == PhaseKind::Main;
	if (!bMain)
	{
		return OnDark(S.currentPlayer == P && S.phase.kind == PhaseKind::Roll ? TEXT("Roll first.") : TEXT("Not your turn."), 18, C::OnDarkMuted);
	}
	// The bank, as a table: one column per resource (its card, your rate, the bank's stock) and a
	// label column, every cell the same width so the rows line up and fit the column.
	const float LabelW = 46.f, CellW = 54.f;
	auto Cell = [CellW](TSharedRef<SWidget> W) { return SNew(SBox).WidthOverride(CellW).HAlign(HAlign_Center).VAlign(VAlign_Center).Padding(FMargin(2, 0))[W]; };
	auto RowLabel = [LabelW](const FString& T) { return SNew(SBox).WidthOverride(LabelW).VAlign(VAlign_Center)[InkItalic(T, 17)]; };
	TSharedRef<SHorizontalBox> Art = SNew(SHorizontalBox) + SHorizontalBox::Slot().AutoWidth()[SNew(SBox).WidthOverride(LabelW)];
	TSharedRef<SHorizontalBox> GiveRow = SNew(SHorizontalBox) + SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[RowLabel(TEXT("give"))];
	TSharedRef<SHorizontalBox> GetRow = SNew(SHorizontalBox) + SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[RowLabel(TEXT("get"))];
	for (Resource R : kResources)
	{
		const int32 Rate = BestBankRate(S, P, R);
		Art->AddSlot().AutoWidth()[Cell(Picture(Hall::CardName(R), 26, 36))];
		GiveRow->AddSlot().AutoWidth()
		[
			Cell(Button(FString::Printf(TEXT("%d:1"), Rate), [this, R] { BankGive = R; return Redraw(); }, BankGive == R ? EButton::ChipOn : EButton::Chip, Mine.hand[R] >= Rate, nullptr, FString(), 17))
		];
		GetRow->AddSlot().AutoWidth()
		[
			Cell(Button(FString::Printf(TEXT("%d"), S.bank[R]), [this, R] { BankGet = R; return Redraw(); }, BankGet == R ? EButton::ChipOn : EButton::Chip, S.bank[R] > 0, nullptr, FString(), 17))
		];
	}
	const int32 Rate = BestBankRate(S, P, BankGive);
	const bool bBankOk = BankGive != BankGet && Mine.hand[BankGive] >= Rate && S.bank[BankGet] > 0;

	TSharedRef<SWrapBox> To = SNew(SWrapBox).UseAllottedSize(true).InnerSlotPadding(FVector2D(6, 6));
	To->AddSlot()[Button(TEXT("All"), [this] { OfferTo.Reset(); return Redraw(); }, OfferTo.IsEmpty() ? EButton::TabOn : EButton::Paper, true, nullptr, FString(), 17)];
	for (const PlayerState& Other : S.players)
	{
		if (Other.id == P) continue;
		const int32 Id = Other.id;
		To->AddSlot()
		[
			Button(UTF8_TO_TCHAR(Other.name.c_str()), [this, Id]
			{
				if (OfferTo.Contains(Id)) OfferTo.Remove(Id);
				else OfferTo.Add(Id);
				if (OfferTo.Num() == static_cast<int32>(Match->State().players.size()) - 1) OfferTo.Reset();
				return Redraw();
			}, OfferTo.Contains(Id) ? EButton::TabOn : EButton::Paper, true, nullptr, FString(), 17)
		];
	}

	return SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight()
		[
			Paper(SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()[LabelText(TEXT("The bank"), 21, C::RubricDark)]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 4, 0, 4)[Art]
				+ SVerticalBox::Slot().AutoHeight()[GiveRow]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 5, 0, 0)[GetRow]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Right).Padding(0, 8, 0, 0)
				[
					// "for", not an arrow: the hall's fonts have no arrow glyph (it drew as an empty box).
					Button(FString::Printf(TEXT("%d %s for 1 %s"), Rate, *CatnightText::Resource(BankGive), *CatnightText::Resource(BankGet)), [this, P]
					{
						Action A = Action::Make(ActionType::BankTrade, P);
						A.giveRes = BankGive;
						A.receiveRes = BankGet;
						return Do(A);
					}, EButton::Seal, bBankOk, nullptr, TEXT("key"), 18)
				],
				EPaper::Letter, FMargin(14, 10))
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 12, 0, 0)
		[
			Paper(SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()[LabelText(TEXT("Bill of exchange"), 21, C::RubricDark)]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 4, 0, 0)[TermsEditor(OfferGive, OfferWant, Mine.hand)]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 8, 0, 0)[SNew(SHorizontalBox) + SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 8, 0)[LabelText(TEXT("To"), 19, C::MapInk)] + SHorizontalBox::Slot().FillWidth(1.f)[To]]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Right).Padding(0, 8, 0, 0)
				[
					Button(TEXT("Make the offer"), [this, P]
					{
						Action A = Action::Make(ActionType::ProposeTrade, P);
						A.give = Partial(OfferGive);
						A.want = Partial(OfferWant);
						if (!OfferTo.IsEmpty())
						{
							TArray<int32> Sorted = OfferTo.Array();
							Sorted.Sort();
							A.to = std::vector<int>(Sorted.GetData(), Sorted.GetData() + Sorted.Num());
						}
						OfferGive = Counts{};
						OfferWant = Counts{};
						return Do(A);
					}, EButton::Seal, OfferGive.Total() > 0 && OfferWant.Total() > 0, nullptr, TEXT("scroll"), 18)
				],
				EPaper::Parchment, FMargin(14, 10))
		];
}

// ------------------------------------------------------------------ decrees in the column

TSharedPtr<SWidget> STable::DecreeBox()
{
	const GameState& S = Match->State();
	const int32 P = Me();
	const PlayerState& Mine = S.players[P];
	const float W = 380.f;
	// Buttons keep their own width (HAlign_Left); only text fills the decree.
	auto Row = [](TSharedRef<SVerticalBox> Box, TSharedRef<SWidget> Wd, float Top = 8.f, EHorizontalAlignment H = HAlign_Fill) { Box->AddSlot().AutoHeight().HAlign(H).Padding(0, Top, 0, 0)[Wd]; };
	auto Actions = [](TSharedRef<SVerticalBox> Box, TSharedRef<SWidget> Wd, float Top = 8.f) { Box->AddSlot().AutoHeight().HAlign(HAlign_Left).Padding(0, Top, 0, 0)[Wd]; };

	if (Match->IsEnded())
	{
		TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
		Row(B, Ink(Instruction(), 21, C::Ink), 0);
		Actions(B, Button(TEXT("New game…"), [this] { OnNewGame.ExecuteIfBound(); return FReply::Handled(); }, EButton::Paper), 10);
		return Decree(TEXT("The game is won"), B, W);
	}
	// My offer is out: the others answer; I can withdraw it.
	if (S.phase.kind == PhaseKind::Trade && S.currentPlayer == P && S.phase.offer.proposer == P && !Match->IsHumanToAct())
	{
		TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
		Row(B, Ink(FString::Printf(TEXT("You offer %s for %s."), *CatnightText::Counts(S.phase.offer.give), *CatnightText::Counts(S.phase.offer.want)), 20, C::Ink), 0);
		Row(B, InkItalic(FString::Printf(TEXT("Waiting for %s."), *CatnightText::Player(S, Match->Actor())), 18));
		Actions(B, Button(TEXT("Withdraw offer"), [this, P] { return Do(Action::Make(ActionType::CancelTrade, P)); }, EButton::Danger, true, &Primary), 12);
		return Decree(TEXT("Offer out"), B, W);
	}
	if (!Match->IsHumanToAct())
	{
		const PlayerState& Who = S.players[Match->Actor()];
		TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
		Row(B, SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 10, 0)[ArmsOf(Who, 48)]
			+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)[Ink(Instruction(), 21, C::Ink)], 0);
		return Oak(B, TEXT("The table waits"), FMargin(16, 14));
	}
	if (bChoosingPlenty)
	{
		const int32 Need = FMath::Min(2, S.bank.Total());
		TSharedRef<SWrapBox> Picks = SNew(SWrapBox).UseAllottedSize(true).InnerSlotPadding(FVector2D(6, 6));
		for (Resource R : kResources)
		{
			Picks->AddSlot()
			[
				Button(FString::Printf(TEXT("%s (%d)"), *CatnightText::Resource(R), S.bank[R]), [this, R, Need]
				{
					if (PlentyPick.Num() < Need) PlentyPick.Add(R);
					return Redraw();
				}, EButton::Paper, S.bank[R] > 0 && PlentyPick.Num() < Need, PlentyPick.Num() < Need && !Primary ? &Primary : nullptr, FString(), 18)
			];
		}
		TArray<FString> Chosen;
		for (Resource R : PlentyPick) Chosen.Add(CatnightText::Resource(R));
		TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
		Row(B, Ink(FString::Printf(TEXT("Take any %d resources from the bank."), Need), 20, C::Ink), 0);
		Row(B, Picks);
		Row(B, InkItalic(FString::Printf(TEXT("Chosen: %s"), Chosen.Num() ? *FString::Join(Chosen, TEXT(", ")) : TEXT("none")), 18));
		Actions(B, SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 10, 0)[Button(TEXT("Invoke"), [this, P]
			{
				Action A = Action::Make(ActionType::PlayHarvestPact, P);
				for (Resource R : PlentyPick) A.resources.push_back(R);
				bChoosingPlenty = false;
				return Do(A);
			}, EButton::Seal, PlentyPick.Num() == Need, PlentyPick.Num() == Need ? &Primary : nullptr, TEXT("crown"), 20)]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Button(TEXT("Cancel"), [this] { bChoosingPlenty = false; return Redraw(); }, EButton::Paper)], 12);
		return Decree(TEXT("Year of Plenty"), B, W);
	}
	if (bChoosingMonopoly)
	{
		TSharedRef<SWrapBox> Picks = SNew(SWrapBox).UseAllottedSize(true).InnerSlotPadding(FVector2D(6, 6));
		for (Resource R : kResources)
		{
			Picks->AddSlot()
			[
				Button(CatnightText::Resource(R), [this, R, P]
				{
					bChoosingMonopoly = false;
					Action A = Action::Make(ActionType::PlayBloodTithe, P);
					A.resource = R;
					return Do(A);
				}, EButton::Paper, true, Primary ? nullptr : &Primary, FString(), 18)
			];
		}
		TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
		Row(B, Ink(TEXT("Name a resource. Every other player gives you all of theirs."), 20, C::Ink), 0);
		Row(B, Picks);
		Actions(B, Button(TEXT("Cancel"), [this] { bChoosingMonopoly = false; return Redraw(); }, EButton::Paper), 12);
		return Decree(TEXT("Monopoly"), B, W);
	}
	switch (S.phase.kind)
	{
	case PhaseKind::Discard:
	{
		const int32 Owed = S.phase.pending[P];
		TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
		Row(B, Ink(FString::Printf(TEXT("A 7 was rolled and you hold %d cards. Give up half to the bank."), HandTotal(Mine)), 19, C::Ink), 0);
		for (Resource R : kResources)
		{
			DiscardPick[R] = FMath::Clamp(DiscardPick[R], 0, Mine.hand[R]);
			Row(B, SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 8, 0)[Picture(Hall::CardName(R), 28, 39)]
				+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)[FitText(Ink(FString::Printf(TEXT("%s (%d)"), *CatnightText::Resource(R), Mine.hand[R]), 18, C::MapInk, false))]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Stepper(DiscardPick[R], [this, R](int32 V) { DiscardPick[R] = V; bDirty = true; }, 0,
					FMath::Min(Mine.hand[R], DiscardPick[R] + Owed - DiscardPick.Total()))], 4);
		}
		const bool bExact = DiscardPick.Total() == Owed;
		Row(B, LabelText(FString::Printf(TEXT("%d / %d chosen"), DiscardPick.Total(), Owed), 20, bExact ? C::OkInk : C::MapInk), 10);
		Actions(B, Button(TEXT("Discard"), [this, P]
		{
			Action A = Action::Make(ActionType::Discard, P);
			A.cards = PartialCounts::From(DiscardPick);
			DiscardPick = Counts{};
			return Do(A);
		}, EButton::Seal, bExact, &Primary, TEXT("scroll"), 20), 8);
		return Decree(FString::Printf(TEXT("Discard %d"), Owed), B, W);
	}
	case PhaseKind::Steal:
	{
		TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
		Row(B, Ink(TEXT("The robber borders several players. Steal one random card from:"), 19, C::Ink), 0);
		for (int Victim : S.phase.candidates)
		{
			const PlayerState& V = S.players[Victim];
			Actions(B, Button(FString::Printf(TEXT("%s · %d cards"), UTF8_TO_TCHAR(V.name.c_str()), HandTotal(V)), [this, P, Victim]
			{
				Action A = Action::Make(ActionType::StealFrom, P);
				A.victim = Victim;
				return Do(A);
			}, EButton::Paper, true, Primary ? nullptr : &Primary, FString(), 20));
		}
		return Decree(TEXT("Whom to rob?"), B, W);
	}
	case PhaseKind::Trade:
	{
		const TradeOffer& O = S.phase.offer;
		const PlayerState& From = S.players[O.proposer];
		TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
		if (bCountering)
		{
			Row(B, TermsEditor(CounterGive, CounterWant, Mine.hand), 0);
			Actions(B, SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 10, 0)[Button(TEXT("Send counter"), [this, P]
				{
					Action A = Action::Make(ActionType::RespondTrade, P);
					A.response = TradeResponse::Counter;
					A.give = Partial(CounterGive);
					A.want = Partial(CounterWant);
					A.hasGive = A.hasWant = true;
					bCountering = false;
					return Do(A);
				}, EButton::Seal, CounterGive.Total() > 0 && CounterWant.Total() > 0, &Primary, TEXT("scroll"), 19)]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Button(TEXT("Back"), [this] { bCountering = false; return Redraw(); }, EButton::Paper)], 12);
			return Decree(TEXT("Counter"), B, W, Hall::ArmsName(From.color, From.sigil));
		}
		auto Side = [](const FString& Title, const Counts& Cnt, const FLinearColor& Col)
		{
			// Many cards wrap onto a second row rather than running off the decree.
			TSharedRef<SWrapBox> Cards = SNew(SWrapBox).UseAllottedSize(true).InnerSlotPadding(FVector2D(3, 3));
			for (Resource R : kResources)
				for (int32 K = 0; K < Cnt[R]; K++) Cards->AddSlot()[Picture(Hall::CardName(R), 28, 39)];
			return SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()[LabelText(Title, 18, Col)]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 3, 6, 0)[Cards];
		};
		const bool bCan = HasAtLeast(Mine.hand, O.want) && HasAtLeast(From.hand, O.give);
		Row(B, Ink(FString::Printf(TEXT("%s %s:"), UTF8_TO_TCHAR(From.name.c_str()), O.counterOf ? TEXT("counters") : TEXT("proposes")), 20, C::Ink), 0);
		Row(B, SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f)[Side(TEXT("You receive"), O.give, C::OkInk)]
			+ SHorizontalBox::Slot().FillWidth(1.f)[Side(TEXT("You give"), O.want, C::Rubric)]);
		if (!bCan) Row(B, InkItalic(TEXT("You lack the cards they ask for."), 18));
		// Accept on its own line (the seal is wide); Counter and Decline together beneath it.
		Actions(B, Button(TEXT("Accept"), [this, P]
		{
			Action A = Action::Make(ActionType::RespondTrade, P);
			A.response = TradeResponse::Accept;
			return Do(A);
		}, EButton::Seal, bCan, bCan ? &Primary : nullptr, TEXT("crown"), 20), 12);
		Actions(B, SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 10, 0)[Button(TEXT("Counter"), [this, O]
			{
				bCountering = true;
				CounterGive = O.want;
				CounterWant = O.give;
				return Redraw();
			}, EButton::Paper)]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Button(TEXT("Decline"), [this, P]
			{
				Action A = Action::Make(ActionType::RespondTrade, P);
				A.response = TradeResponse::Decline;
				return Do(A);
			}, EButton::Paper, true, bCan ? nullptr : &Primary)], 8);
		return Decree(TEXT("A Bargain Offered"), B, W, Hall::ArmsName(From.color, From.sigil));
	}
	case PhaseKind::Setup:
	case PhaseKind::MoveWraith:
	case PhaseKind::Decree:
	{
		TSharedRef<SVerticalBox> B = SNew(SVerticalBox);
		Row(B, Ink(Instruction(), 21, C::Ink), 0);
		if (S.phase.kind == PhaseKind::Setup)
		{
			Row(B, InkItalic(TEXT("Settlements can't stand next to another building. Favour high-dot numbers (6 and 8) and a mix of resources."), 18));
		}
		if (S.phase.kind == PhaseKind::MoveWraith)
		{
			Row(B, InkItalic(TEXT("Pick an opponent's best hex: it produces nothing while the robber is there."), 18));
		}
		return Decree(S.phase.kind == PhaseKind::MoveWraith ? TEXT("The robber") : TEXT("On the island"), B, W);
	}
	default:
		return nullptr;
	}
}

// ------------------------------------------------------------------ full-screen

TSharedRef<SWidget> STable::BuildOverlay()
{
	if (!Match->HasGame()) return SNullWidget::NullWidget;
	const GameState& S = Match->State();
	const FSlateBrush* White = FCoreStyle::Get().GetBrush("GenericWhiteBox");
	auto Dim = [White](TSharedRef<SWidget> Inner, float Alpha)
	{
		return SNew(SBorder).BorderImage(White).BorderBackgroundColor(FLinearColor(0.01f, 0.008f, 0.006f, Alpha)).HAlign(HAlign_Center).VAlign(VAlign_Center)[Inner];
	};

	if (bLeaving)
	{
		const bool bEnded = Match->IsEnded();
		TSharedRef<SVerticalBox> B = SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight()[Ink(bEnded ? TEXT("The game is over.") : TEXT("It stays saved: Continue in the hall brings it back."), 20, C::Ink)];
		auto Add = [&](TSharedRef<SWidget> W) { B->AddSlot().AutoHeight().HAlign(HAlign_Left).Padding(0, 10, 0, 0)[W]; };
		Add(Button(TEXT("Main menu"), [this] { bLeaving = false; OnMainMenu.ExecuteIfBound(); return FReply::Handled(); }, EButton::Seal, true, &Primary, TEXT("door"), 22));
		Add(Button(TEXT("New game…"), [this] { bLeaving = false; OnNewGame.ExecuteIfBound(); return FReply::Handled(); }, EButton::Paper));
		Add(Button(TEXT("Restart with the same seed"), [this]
		{
			bLeaving = false;
			bVictorySeen = false;
			Match->Start(Match->Setup());
			return Redraw();
		}, EButton::Paper));
		Add(Button(TEXT("Cancel"), [this] { bLeaving = false; return Redraw(); }, EButton::Paper));
		return Dim(Decree(TEXT("Leave this game?"), B, 520.f), 0.62f);
	}

	if (Match->NeedsHandoff())
	{
		const int32 Next = Match->Actor();
		const PlayerState& P = S.players[Next];
		const FString Name = UTF8_TO_TCHAR(P.name.c_str());
		TSharedRef<SVerticalBox> B = SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight()[Ink(FString::Printf(TEXT("to %s."), *Name), 24, C::Ink)]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 4, 0, 0)[InkItalic(CatnightText::HandoffReason(S, Next), 19)]
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Left).Padding(0, 16, 0, 0)
			[
				Button(FString::Printf(TEXT("I am %s — reveal"), *Name), [this, Next] { return Do(Action::Make(ActionType::AckPassDevice, Next)); }, EButton::Seal, true, &Primary, TEXT("eye"), 23)
			]
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Left).Padding(0, 12, 0, 0)[Button(TEXT("Menu"), [this] { bLeaving = true; return Redraw(); }, EButton::Paper, true, nullptr, TEXT("door"), 18)];
		// Opaque: the previous player's hand must not show through.
		return SNew(SOverlay)
			+ SOverlay::Slot()[StoneWall()]
			+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
				[
					SNew(SBanner).Cloth(Hall::PlayerBannerName(P.color)).ArmsImage(Hall::ArmsName(P.color, P.sigil)).Label(Name).LabelPx(24).Width(200).Lit(true)
				]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0, 30, 0, 0)[Decree(TEXT("Pass the device"), B, 560.f)]
			];
	}

	if (Match->IsEnded() && !bVictorySeen)
	{
		const int32 Winner = *S.winner;
		const PlayerState& Champion = S.players[Winner];
		TArray<int32> Order;
		for (const PlayerState& P : S.players) Order.Add(P.id);
		Order.Sort([&](int32 A, int32 B) { return VpBreakdownOf(S, A).total > VpBreakdownOf(S, B).total; });
		// Column widths fit the headings at their size (the widest is "Longest Road").
		const float WPlayer = 250, WSet = 140, WCity = 100, WRoad = 155, WArmy = 155, WCards = 125, WTotal = 70;
		auto Cell = [](const FString& T, float Wd, const FLinearColor& Col, bool bLabel = false)
		{
			return SNew(SBox).WidthOverride(Wd)[FitText(bLabel ? LabelText(T, 18, Col) : Ink(T, 20, Col, false))];
		};
		TSharedRef<SVerticalBox> Table = SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight()
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth()[Cell(TEXT("Player"), WPlayer, C::MapInkMuted, true)]
				+ SHorizontalBox::Slot().AutoWidth()[Cell(TEXT("Settlements"), WSet, C::MapInkMuted, true)]
				+ SHorizontalBox::Slot().AutoWidth()[Cell(TEXT("Cities"), WCity, C::MapInkMuted, true)]
				+ SHorizontalBox::Slot().AutoWidth()[Cell(TEXT("Longest Road"), WRoad, C::MapInkMuted, true)]
				+ SHorizontalBox::Slot().AutoWidth()[Cell(TEXT("Largest Army"), WArmy, C::MapInkMuted, true)]
				+ SHorizontalBox::Slot().AutoWidth()[Cell(TEXT("Point cards"), WCards, C::MapInkMuted, true)]
				+ SHorizontalBox::Slot().AutoWidth()[Cell(TEXT("Total"), WTotal, C::MapInkMuted, true)]
			];
		for (int32 Id : Order)
		{
			const PlayerState& P = S.players[Id];
			const VpBreakdown Bd = VpBreakdownOf(S, Id);
			const bool bWin = Id == Winner;
			Table->AddSlot().AutoHeight().Padding(0, 4, 0, 0)
			[
				SNew(SBorder).BorderImage(White).BorderBackgroundColor(bWin ? FLinearColor(0.85f, 0.66f, 0.25f, 0.35f) : FLinearColor::Transparent).Padding(FMargin(0, 3))
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().AutoWidth()
					[
						SNew(SBox).WidthOverride(WPlayer)
						[
							SNew(SHorizontalBox)
							+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 8, 0)[ArmsOf(P, 32)]
							+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center).Padding(0, 0, 8, 0)[FitText(LabelText(UTF8_TO_TCHAR(P.name.c_str()), 21, bWin ? C::RubricDark : C::Ink))]
						]
					]
					+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Cell(FString::FromInt(Bd.outposts), WSet, C::Ink)]
					+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Cell(FString::Printf(TEXT("%d (×2)"), Bd.citadels), WCity, C::Ink)]
					+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Cell(Bd.longest ? TEXT("+2") : TEXT("—"), WRoad, C::Ink)]
					+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Cell(Bd.host ? TEXT("+2") : TEXT("—"), WArmy, C::Ink)]
					+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Cell(Bd.relics ? FString::Printf(TEXT("+%d"), Bd.relics) : FString(TEXT("—")), WCards, C::Ink)]
					+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[SNew(SBox).WidthOverride(WTotal)[Blackletter(FString::FromInt(Bd.total), 32, C::Rubric)]]
				]
			];
		}
		// Rolls of fate: how often each total came up.
		int32 Most = 1;
		for (int32 T = 2; T <= 12; T++) Most = FMath::Max(Most, S.stats.rolls[T]);
		TSharedRef<SHorizontalBox> Bars = SNew(SHorizontalBox);
		for (int32 T = 2; T <= 12; T++)
		{
			const FLinearColor Col = T == 7 ? C::Rubric : (T == 6 || T == 8) ? C::WaxLight : C::MapInk;
			Bars->AddSlot().AutoWidth().Padding(0, 0, 6, 0).VAlign(VAlign_Bottom)
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)[Ink(FString::FromInt(S.stats.rolls[T]), 16, C::MapInkMuted, false)]
				+ SVerticalBox::Slot().AutoHeight()[SNew(SBox).WidthOverride(30).HeightOverride(4.f + 54.f * S.stats.rolls[T] / Most)[SNew(SBorder).BorderImage(White).BorderBackgroundColor(Col)]]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)[LabelText(FString::FromInt(T), 18, Col)]
			];
		}
		TSharedRef<SWidget> Sheet = SNew(SBox).WidthOverride(1080)
			[
				Paper(SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)[Blackletter(Champion.name == "You" ? FString(TEXT("You win!")) : FString::Printf(TEXT("%s wins!"), UTF8_TO_TCHAR(Champion.name.c_str())), 64)]
					// One line, centred (a wrapping block centred in its slot broke after two words).
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
					[
						SNew(STextBlock).Text(FText::FromString(FString::Printf(TEXT("after %d rounds, with %d points"), S.round, VpBreakdownOf(S, Winner).total)))
						.Font(Hall::Italic(21)).ColorAndOpacity(C::MapInk)
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0, 8)[Rule()]
					+ SVerticalBox::Slot().AutoHeight()[LabelText(TEXT("Final reckoning"), 24, C::RubricDark)]
					+ SVerticalBox::Slot().AutoHeight().Padding(0, 6, 0, 0)[Table]
					+ SVerticalBox::Slot().AutoHeight().Padding(0, 14, 0, 0)
					[
						SNew(SHorizontalBox)
						+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Bottom)
						[
							SNew(SVerticalBox)
							+ SVerticalBox::Slot().AutoHeight()[LabelText(TEXT("Rolls of fate"), 24, C::RubricDark)]
							+ SVerticalBox::Slot().AutoHeight().Padding(0, 6, 0, 0)[Bars]
						]
						+ SHorizontalBox::Slot().FillWidth(1.f)[SNullWidget::NullWidget]
						+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Bottom)[Picture(TEXT("ornaments/compass-rose"), 100)]
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0, 16, 0, 0)
					[
						SNew(SHorizontalBox)
						+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 14, 0)[Button(TEXT("Play again"), [this]
						{
							FCatnightMatchSetup Again = Match->Setup();
							Again.Seed = FString::Printf(TEXT("table-%d"), FMath::Rand());
							bVictorySeen = false;
							Match->Start(Again);
							return Redraw();
						}, EButton::Seal, true, &Primary, TEXT("crown"), 22)]
						+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 10, 0)[Button(TEXT("New game…"), [this] { OnNewGame.ExecuteIfBound(); return FReply::Handled(); }, EButton::Paper)]
						+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 10, 0)[Button(TEXT("Main menu"), [this] { OnMainMenu.ExecuteIfBound(); return FReply::Handled(); }, EButton::Paper)]
						+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Button(TEXT("See the board"), [this] { bVictorySeen = true; return Redraw(); }, EButton::Paper)]
					],
					EPaper::Vellum, FMargin(40, 20))
			];
		return Dim(SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
			[
				SNew(SBanner).Cloth(Hall::PlayerBannerName(Champion.color)).ArmsImage(Hall::ArmsName(Champion.color, Champion.sigil))
				.Numeral(FString::FromInt(VpBreakdownOf(S, Winner).total)).Label(UTF8_TO_TCHAR(Champion.name.c_str())).LabelPx(24).Width(124).Lit(true)
			]
			// The sheet hangs just below the banner's ribbon, so the winner's name stays in view.
			+ SVerticalBox::Slot().AutoHeight().Padding(0, -34, 0, 0)[Sheet], 0.55f);
	}
	return SNullWidget::NullWidget;
}
