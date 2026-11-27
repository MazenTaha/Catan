#include "Ui/SCatnightRoot.h"

#include "Brushes/SlateRoundedBoxBrush.h"
#include "CatnightRules/Rules.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Framework/Application/SlateApplication.h"
#include "HAL/PlatformMisc.h"
#include "Lexicon.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "Styling/CoreStyle.h"
#include "Table/BoardView.h"
#include "Table/STable.h"
#include "Ui/HallKit.h"
#include "Ui/HallSettings.h"
#include "Ui/HallSound.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScaleBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SWrapBox.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SNullWidget.h"
#include "Widgets/SOverlay.h"

using namespace catnight;
using namespace HallKit;
namespace C = Hall::Color;

namespace
{
	const PlayerColor SeatColors[] = {PlayerColor::Crimson, PlayerColor::Frost, PlayerColor::Bone, PlayerColor::Violet};
	const Sigil SeatSigils[] = {Sigil::Skull, Sigil::Moon, Sigil::Eye, Sigil::Thorn};

	FString SeatKindLabel(const FCatnightSeat& Seat)
	{
		return Seat.bHuman ? FString(TEXT("This device")) : FString::Printf(TEXT("%s bot"), *CatnightText::BotLevel(Seat.Level));
	}

	FString SeatGloss(const FCatnightSeat& Seat)
	{
		if (Seat.bHuman) return TEXT("Plays on this device");
		switch (Seat.Level)
		{
		case BotLevel::Wanderer: return TEXT("Builds where it likes");
		case BotLevel::Warlord: return TEXT("Counts pips, trades sensibly");
		case BotLevel::Archdemon: return TEXT("Plans ahead, blocks and steals");
		}
		return FString();
	}

	/** Person, then Easy, Medium and Hard bots, then Person again. */
	void CycleSeat(FCatnightSeat& Seat)
	{
		if (Seat.bHuman)
		{
			Seat.bHuman = false;
			Seat.Level = BotLevel::Wanderer;
		}
		else if (Seat.Level == BotLevel::Archdemon)
		{
			Seat.bHuman = true;
		}
		else
		{
			Seat.Level = static_cast<BotLevel>(static_cast<int>(Seat.Level) + 1);
		}
	}

	FString NewSeed() { return FString::Printf(TEXT("table-%d"), FMath::RandRange(1000, 999999)); }

	const FEditableTextBoxStyle& FieldStyle()
	{
		static TSharedPtr<FSlateBrush> Normal = MakeShared<FSlateRoundedBoxBrush>(C::PaperCard, 3.f, C::MapInk, 1.5f);
		static TSharedPtr<FSlateBrush> Hot = MakeShared<FSlateRoundedBoxBrush>(FLinearColor(1.f, 0.96f, 0.86f), 3.f, C::Gold, 2.f);
		static FEditableTextBoxStyle S = FEditableTextBoxStyle(FCoreStyle::Get().GetWidgetStyle<FEditableTextBoxStyle>("NormalEditableTextBox"))
			.SetBackgroundImageNormal(*Normal).SetBackgroundImageHovered(*Hot).SetBackgroundImageFocused(*Hot).SetBackgroundImageReadOnly(*Normal)
			.SetForegroundColor(FSlateColor(C::Ink)).SetFocusedForegroundColor(FSlateColor(C::Ink)).SetPadding(FMargin(10, 6));
		return S;
	}

	TSharedRef<SWidget> Field(const FString& Value, TFunction<void(const FString&)> OnChange, float Width)
	{
		return SNew(SBox).WidthOverride(Width)
			[
				SNew(SEditableTextBox).Style(&FieldStyle()).Font(Hall::Body(20)).Text(FText::FromString(Value))
				.OnTextChanged_Lambda([OnChange](const FText& T) { OnChange(T.ToString()); })
			];
	}

	bool CommandLineBotDelay() { float Ignored; return FParse::Value(FCommandLine::Get(), TEXT("CatnightBotDelay="), Ignored); }
}

void SCatnightRoot::Construct(const FArguments& InArgs)
{
	Match = InArgs._Match;
	OnHeroYard = InArgs._OnHeroYard;
	View = InArgs._View;
	Hall::Init();
	const FHallSettings& Settings = FHallSettings::Get();
	if (View && !FParse::Param(FCommandLine::Get(), TEXT("CatnightFlat")) && !Match->HasGame()) View->b3D = Settings.bStart3D;
	Draft.Seed = NewSeed();
	static const TCHAR* Names[] = {TEXT("You"), TEXT("Ash"), TEXT("Bryn"), TEXT("Cole")};
	for (int32 I = 0; I < 4; I++)
	{
		FCatnightSeat Seat;
		Seat.Name = Names[I];
		Seat.bHuman = I == 0;
		Seat.Level = BotLevel::Warlord;
		Draft.Seats.Add(Seat);
	}
	ChildSlot
	[
		SAssignNew(Content, SBox)
	];
	EScreen First = InArgs._Screen;
	// -CatnightFixture=<moves> [-CatnightFixturePhase=main|roll|setup] [-CatnightFixtureSeed=<seed>]:
	// bots play a seeded game that far, until the person's seat must act in that phase, then the
	// record is reloaded as a normal game (screenshots and UI checks of real positions).
	int32 FixtureMoves = -1;
	if (FParse::Value(FCommandLine::Get(), TEXT("CatnightFixture="), FixtureMoves))
	{
		FString Phase = TEXT("main"), Seed = TEXT("fixture-1");
		FParse::Value(FCommandLine::Get(), TEXT("CatnightFixturePhase="), Phase);
		FParse::Value(FCommandLine::Get(), TEXT("CatnightFixtureSeed="), Seed);
		FCatnightMatchSetup Fixture;
		Fixture.Seed = Seed;
		Fixture.bAutoplay = true;
		Match->Start(Fixture);
		auto Wanted = [this, &Phase]
		{
			const GameState& S = Match->State();
			const bool bMine = Match->Actor() == 0 && !S.handoff;
			if (Phase == TEXT("roll")) return bMine && S.phase.kind == PhaseKind::Roll;
			if (Phase == TEXT("setup")) return bMine && S.phase.kind == PhaseKind::Setup;
			return bMine && S.phase.kind == PhaseKind::Main && S.currentPlayer == 0;
		};
		for (int32 Step = 0; Step < 5000 && !Match->IsEnded(); Step++)
		{
			if (Step >= FixtureMoves && Wanted()) break;
			if (!Match->StepBot()) break;
		}
		Match->LoadRecord(Match->RecordJson());
		First = EScreen::Table;
	}
	FString Asked;
	if (First == EScreen::Title && FParse::Value(FCommandLine::Get(), TEXT("CatnightScreen="), Asked))
	{
		if (Asked == TEXT("gallery")) First = EScreen::Gallery;
		if (Asked == TEXT("rules")) First = EScreen::Rules;
		if (Asked == TEXT("settings")) First = EScreen::Settings;
	}
	ApplyShow(First);
}

void SCatnightRoot::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);
	if (Pending)
	{
		const EScreen Next = *Pending;
		Pending.Reset();
		ApplyShow(Next);
	}
	if (bRebuild && Screen != EScreen::Table)
	{
		bRebuild = false;
		const bool bHadFocus = Content->HasFocusedDescendants();
		ApplyShow(Screen);
		if (!bHadFocus) bFocusPending = false;
	}
	// The menus (stone wall) and the flat chart (its own sea) cover the whole view, so the 3D table
	// behind them is not drawn at all: it cost 6-7 ms of GPU a frame for nothing (laptops ran hot
	// on the title screen). It still ticks, so the light and camera are ready when it shows again.
	if (GEngine && GEngine->GameViewport && GetVisibility() != EVisibility::Collapsed)
	{
		GEngine->GameViewport->bDisableWorldRendering = !(Screen == EScreen::Table && View && View->b3D);
	}
	FHallSettings::Get().ApplyFrameRate(FSlateApplication::IsInitialized() && FSlateApplication::Get().IsActive());
	if (bFocusPending && FSlateApplication::IsInitialized())
	{
		bFocusPending = false;
		// Buttons show their focus ring (navigation); a whole screen taking focus should not.
		const TSharedPtr<SWidget> F = FocusTarget();
		const bool bButton = F && (F->GetType() == TEXT("SButton") || F->GetType() == TEXT("SHallButton"));
		if (F) FSlateApplication::Get().SetAllUserFocus(F, bButton ? EFocusCause::Navigation : EFocusCause::SetDirectly);
	}
}

FReply SCatnightRoot::OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent)
{
	const FKey K = InKeyEvent.GetKey();
	if (Screen != EScreen::Table && Screen != EScreen::Title && (K == EKeys::Escape || K == EKeys::Gamepad_FaceButton_Right))
	{
		Show(Back);
		return FReply::Handled();
	}
	return FReply::Unhandled();
}

TSharedPtr<SWidget> SCatnightRoot::FocusTarget() const
{
	if (Screen == EScreen::Table && Table) return Table->FirstFocus();
	if (Primary) return Primary;
	return ConstCastSharedRef<SCatnightRoot>(SharedThis(this));
}

void SCatnightRoot::Show(EScreen InScreen)
{
	// Deferred: a button on the old screen may be the caller.
	Pending = InScreen;
}

void SCatnightRoot::ApplyShow(EScreen InScreen)
{
	Screen = InScreen;
	Primary.Reset();
	Table.Reset();
	switch (Screen)
	{
	case EScreen::Title: Content->SetContent(BuildTitle()); break;
	case EScreen::NewGame: Content->SetContent(BuildNewGame()); break;
	case EScreen::Rules: Content->SetContent(BuildRules()); break;
	case EScreen::Settings: Content->SetContent(BuildSettings()); break;
	case EScreen::Gallery: Content->SetContent(BuildGallery()); break;
	case EScreen::Table:
		Content->SetContent(SAssignNew(Table, STable)
			.Match(Match)
			.View(View)
			.OnMainMenu(FSimpleDelegate::CreateLambda([this] { Show(EScreen::Title); }))
			.OnNewGame(FSimpleDelegate::CreateLambda([this] { Show(EScreen::NewGame); })));
		break;
	}
	FocusLater();
}

void SCatnightRoot::StartGame(FCatnightMatchSetup Setup)
{
	Setup.bAutoplay = false;
	if (!CommandLineBotDelay()) Match->BotDelay = FHallSettings::Get().BotDelay();
	StartError = Match->Start(Setup);
	if (StartError.IsEmpty()) Show(EScreen::Table);
	else bRebuild = true;
}

// ------------------------------------------------------------------ the hall

TSharedRef<SWidget> SCatnightRoot::InHall(TSharedRef<SWidget> Inner, float ContentWidth)
{
	// The torches stand 150–230 units in from each side; hide them when centred content reaches them.
	const TAttribute<EVisibility> TorchVis = TAttribute<EVisibility>::CreateLambda([this, ContentWidth]
	{
		const float W = static_cast<float>(GetCachedGeometry().GetLocalSize().X);
		return ContentWidth <= 0.f || W <= 0.f || (W - ContentWidth) * 0.5f >= 240.f ? EVisibility::HitTestInvisible : EVisibility::Collapsed;
	});
	auto Window = [](EHorizontalAlignment H, float Side)
	{
		return SNew(SOverlay)
			+ SOverlay::Slot().Padding(-120)[SNew(SImage).Image(Hall::Image(TEXT("fx/moonglow"))).ColorAndOpacity(FLinearColor(1, 1, 1, 0.55f)).Visibility(EVisibility::HitTestInvisible)]
			+ SOverlay::Slot()[Picture(TEXT("ornaments/night-window"), 230)];
	};
	return SNew(SOverlay)
		+ SOverlay::Slot()[StoneWall()]
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Top).Padding(FMargin(250, 70, 0, 0))[Window(HAlign_Left, 0)]
		+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Top).Padding(FMargin(0, 70, 250, 0))[Window(HAlign_Right, 1)]
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Fill)[SNew(SBox).WidthOverride(120)[SNew(SImage).Image(Hall::Image(TEXT("ornaments/stone-column")))]]
		+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Fill)[SNew(SBox).WidthOverride(120)[SNew(SImage).Image(Hall::Image(TEXT("ornaments/stone-column")))]]
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Top).Padding(FMargin(150, 360, 0, 0))[SNew(SBox).Visibility(TorchVis)[Torch(190, 0.7f)]]
		+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Top).Padding(FMargin(0, 360, 150, 0))[SNew(SBox).Visibility(TorchVis)[Torch(190, 2.9f)]]
		+ SOverlay::Slot()[Inner];
}

// ------------------------------------------------------------------ title

TSharedRef<SWidget> SCatnightRoot::BuildTitle()
{
	const bool bSave = Match->HasSave();
	// Banners hung by their loops on one pole, symmetric: the tall ones (Play, and Continue when a
	// game is saved) in the middle, the one to press first lit. Labels are lettered on the cloth.
	struct FMenuBanner { const TCHAR* Cloth; const TCHAR* Charge; const TCHAR* Label; const TCHAR* Gloss; bool bTall; TFunction<FReply()> OnClick; };
	auto Go = [this](EScreen Target) { return [this, Target] { Back = EScreen::Title; Show(Target); return FReply::Handled(); }; };
	TArray<FMenuBanner> Banners;
	Banners.Add({TEXT("banners/menu-cloth-azure"), TEXT("key"), TEXT("Settings"), TEXT("Sound & sight"), false, Go(EScreen::Settings)});
	if (bSave)
	{
		Banners.Add({TEXT("banners/menu-cloth-sable"), TEXT("hourglass"), TEXT("Continue"), TEXT("Your table awaits"), true, [this]
		{
			TitleError = Match->Continue();
			if (TitleError.IsEmpty()) Show(EScreen::Table);
			else bRebuild = true;
			return FReply::Handled();
		}});
	}
	Banners.Add({TEXT("banners/menu-cloth-gules"), TEXT("crown"), TEXT("Play"), TEXT("Muster a new table"), true, Go(EScreen::NewGame)});
	Banners.Add({TEXT("banners/menu-cloth-vert"), TEXT("book"), TEXT("How to play"), TEXT("The rules"), false, Go(EScreen::Rules)});

	// Four banners (with Continue) stand a little narrower to stay clear of the columns.
	const float Side = bSave ? 192.f : 214.f, Tall = bSave ? 238.f : 262.f, Gap = 40.f, Ends = 96.f;
	const float PoleH = 90.f, RodY = PoleH * 0.444f;
	float RowW = 0.f;
	for (const FMenuBanner& B : Banners) RowW += (B.bTall ? Tall : Side) + Gap;
	TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox);
	int32 Index = 0;
	for (FMenuBanner& B : Banners)
	{
		const float W = B.bTall ? Tall : Side;
		// The first tall banner is the one to press: Continue when there is a game, else Play.
		const bool bFirst = B.bTall && Index == 1;
		TSharedPtr<SBanner> Banner;
		// The cloth's loops (y 0–34 of 434) hang on the rod; the rod runs through them at y 12.
		Row->AddSlot().AutoWidth().VAlign(VAlign_Top).Padding(FMargin(Gap * 0.5f, RodY - 12.f * W / 200.f, Gap * 0.5f, 0))
		[
			SAssignNew(Banner, SBanner)
			.Cloth(B.Cloth).Embroidered(true).Charge(B.Charge).Label(FString(B.Label)).Gloss(FString(B.Gloss)).Width(W)
			.LabelPx(B.bTall ? 44.f : 32.f).Lit(bFirst).Seed(Index * 1.9f).Clickable(true)
			.OnClicked_Lambda(MoveTemp(B.OnClick))
		];
		if (bFirst) Primary = Banner->GetButton();
		Index++;
	}
	TSharedRef<SWidget> Menu = SNew(SOverlay)
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Top)[Pole(RowW + 2.f * Ends, PoleH)]
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Top)[Row];

	TSharedRef<SVerticalBox> Center = SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0, 22, 0, 0)[Picture(TEXT("ornaments/crest"), 78)]
		+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0, -10, 0, 0)[Blackletter(TEXT("Catnight"), 116, C::GoldLight, true)]
		+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0, -6, 0, 0)[Ribbon(TEXT("Trade · Build · Settle"), 24, 440.f, true)]
		+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0, 26, 0, 0)[Menu];
	if (!TitleError.IsEmpty())
	{
		Center->AddSlot().AutoHeight().HAlign(HAlign_Center).Padding(0, 12, 0, 0)[Slip(FString::Printf(TEXT("Could not continue: %s"), *TitleError), C::Rubric)];
	}

	Center->AddSlot().AutoHeight().HAlign(HAlign_Center).Padding(0, 20, 0, 0)[Button(TEXT("Knight & riding yard"), [this] { OnHeroYard.ExecuteIfBound(); return FReply::Handled(); }, EButton::Plaque)];
	return InHall(SNew(SOverlay)
		// The column shrinks to fit a short window rather than lose the banners' points.
		+ SOverlay::Slot().Padding(FMargin(0, 0, 0, 8))
		[
			SNew(SScaleBox).Stretch(EStretch::ScaleToFit).StretchDirection(EStretchDirection::DownOnly).HAlign(HAlign_Center).VAlign(VAlign_Top)[Center]
		]
		+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Bottom).Padding(FMargin(0, 0, 150, 40))
		[
			Button(TEXT("Quit"), [] { FPlatformMisc::RequestExit(false, TEXT("CatnightQuit")); return FReply::Handled(); }, EButton::Plaque, true, nullptr, TEXT("door"))
		]
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Bottom).Padding(FMargin(150, 0, 0, 46))
		[
			OnDark(TEXT("Catnight is a working title."), 17, C::OnDarkMuted, false)
		], RowW + 2.f * Ends);
}

// ------------------------------------------------------------------ new game

TSharedRef<SWidget> SCatnightRoot::BuildNewGame()
{
	const int32 N = FMath::Clamp(Draft.Players, kMinPlayers, kMaxPlayers);
	auto Rebuild = [this] { bRebuild = true; };

	// Seats: banners on a pole, each with the seat's role and name on an oak board beneath.
	TSharedRef<SHorizontalBox> Banners = SNew(SHorizontalBox);
	TSharedRef<SHorizontalBox> Boards = SNew(SHorizontalBox);
	// Each banner stands over its board (188 a seat).
	const float BW = 152.f;
	for (int32 I = 0; I < N; I++)
	{
		const FCatnightSeat& Seat = Draft.Seats[I];
		Banners->AddSlot().AutoWidth().Padding(FMargin((188.f - BW) * 0.5f, 0))
		[
			SNew(SBanner).Cloth(Hall::PlayerBannerName(SeatColors[I])).ArmsImage(Hall::ArmsName(SeatColors[I], SeatSigils[I]))
			.Label(Seat.Name.IsEmpty() ? FString(TEXT("Seat")) : Seat.Name).LabelPx(23).Width(BW).Seed(I * 1.3f).Lit(I == 0)
		];
		Boards->AddSlot().AutoWidth().Padding(FMargin(6, 0))
		[
			SNew(SBox).WidthOverride(176)
			[
				Oak(SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()[Field(Seat.Name, [this, I](const FString& V) { Draft.Seats[I].Name = V; }, 150)]
					+ SVerticalBox::Slot().AutoHeight().Padding(0, 8, 0, 0)
					[
						Button(SeatKindLabel(Seat), [this, I, Rebuild] { CycleSeat(Draft.Seats[I]); Rebuild(); return FReply::Handled(); }, EButton::Plaque, true, nullptr, FString(), 18)
					]
					// Room for two lines, so every seat's board is the same height.
					+ SVerticalBox::Slot().AutoHeight().Padding(0, 6, 0, 0)[SNew(SBox).MinDesiredHeight(44)[OnDark(SeatGloss(Seat), 17, C::OnDarkMuted)]],
					FString(), FMargin(12, 12))
			]
		];
	}
	const float PoleH = 80.f;
	TSharedRef<SWidget> Seats = SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight()
		[
			SNew(SOverlay)
			+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Top)[Pole(N * 188.f + 120.f, PoleH)]
			+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(0, PoleH * 0.444f - BW * 0.093f, 0, 0)[Banners]
		]
		+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0, 14, 0, 0)[Boards];

	// Articles of the game, on vellum.
	TSharedRef<SHorizontalBox> Count = SNew(SHorizontalBox);
	for (int32 K = kMinPlayers; K <= kMaxPlayers; K++)
	{
		Count->AddSlot().AutoWidth().Padding(0, 0, 6, 0)[Button(FString::Printf(TEXT("%d players"), K), [this, K, Rebuild] { Draft.Players = K; Rebuild(); return FReply::Handled(); }, N == K ? EButton::TabOn : EButton::Paper, true, nullptr, FString(), 19)];
	}
	TSharedRef<SHorizontalBox> Layouts = SNew(SHorizontalBox);
	for (LayoutMode L : {LayoutMode::Balanced, LayoutMode::Random, LayoutMode::Beginner})
	{
		Layouts->AddSlot().AutoWidth().Padding(0, 0, 6, 0)[Button(CatnightText::Layout(L), [this, L, Rebuild] { Draft.Layout = L; Rebuild(); return FReply::Handled(); }, Draft.Layout == L ? EButton::TabOn : EButton::Paper, true, nullptr, FString(), 19)];
	}
	int32 Humans = 0;
	for (int32 I = 0; I < N; I++) Humans += Draft.Seats[I].bHuman ? 1 : 0;
	auto Row = [](const FString& Name, TSharedRef<SWidget> Control)
	{
		return SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 16, 0)[SNew(SBox).WidthOverride(140)[LabelText(Name, 21, C::MapInk)]]
			+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)[Control];
	};
	TSharedPtr<SWidget> StartButton;
	TSharedRef<SVerticalBox> Articles = SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight()[Blackletter(TEXT("Articles of the Game"), 40)]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 2, 0, 10)[Rule()]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 4)[Row(TEXT("Seats"), Count)]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 4)[Row(TEXT("Victory at"), Stepper(Draft.TargetVp, [this, Rebuild](int32 V) { Draft.TargetVp = V; Rebuild(); }, kMinTarget, kMaxTarget))]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 4)[Row(TEXT("The board"), Layouts)]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 4)
		[
			Row(TEXT("Seed"), SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth()[Field(Draft.Seed, [this](const FString& V) { Draft.Seed = V; }, 210)]
				+ SHorizontalBox::Slot().AutoWidth().Padding(8, 0, 0, 0)[Button(TEXT("Reroll"), [this, Rebuild] { Draft.Seed = NewSeed(); Rebuild(); return FReply::Handled(); }, EButton::Paper, true, nullptr, FString(), 19)])
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 10, 0, 0)[Rule()]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 6, 0, 0)
		[
			InkItalic(Humans > 1 ? TEXT("Hot-seat: the people pass the device between turns; a curtain hides each hand.")
				: Humans == 0 ? TEXT("No people seated: the bots play on their own.")
				: TEXT("The first player is chosen by a roll of the dice. The same seed always deals the same island."), 18)
		];
	if (!StartError.IsEmpty()) Articles->AddSlot().AutoHeight().Padding(0, 8, 0, 0)[Ink(StartError, 20, C::Rubric)];
	Articles->AddSlot().AutoHeight().HAlign(HAlign_Right).Padding(0, 14, 0, 0)
	[
		Button(TEXT("Start the game"), [this, N]
		{
			FCatnightMatchSetup Setup = Draft;
			Setup.Seats.SetNum(N);
			Setup.Players = N;
			StartGame(Setup);
			return FReply::Handled();
		}, EButton::Seal, true, &StartButton, TEXT("crown"), 26)
	];
	Primary = StartButton;

	// Seats (four boards of 188) beside the articles (620), 40 apart.
	const float Wide = N * 188.f + 40.f + 620.f;
	return InHall(SNew(SOverlay)
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(0, 40, 0, 0)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)[Blackletter(TEXT("Muster a new table"), 72, C::GoldLight, true)]
			+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0, 34, 0, 0)
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Top).Padding(0, 0, 40, 0)[Seats]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Top)[SNew(SBox).WidthOverride(620)[Paper(Articles, EPaper::Vellum, FMargin(30, 22))]]
			]
		]
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Top).Padding(FMargin(150, 46, 0, 0))
		[
			Button(TEXT("The hall"), [this] { Show(EScreen::Title); return FReply::Handled(); }, EButton::Plaque, true, nullptr, TEXT("undo"))
		], Wide);
}

// ------------------------------------------------------------------ how to play

TSharedRef<SWidget> SCatnightRoot::BuildRules()
{
	auto Chapter = [](const FString& Title, const FString& Text)
	{
		return SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 12, 0, 2)[LabelText(TEXT("¶ ") + Title, 25, C::RubricDark)]
			+ SVerticalBox::Slot().AutoHeight()[Ink(Text, 20)];
	};
	auto Cost = [](const FString& Piece, TArray<Resource> Cards, const FString& Note)
	{
		TSharedRef<SHorizontalBox> Row = SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[SNew(SBox).WidthOverride(140)[LabelText(Piece, 21, C::Ink)]];
		for (Resource R : Cards) Row->AddSlot().AutoWidth().Padding(0, 0, 4, 0)[Picture(Hall::CardName(R), 34, 44)];
		Row->AddSlot().FillWidth(1.f).VAlign(VAlign_Center).Padding(10, 0, 0, 0)[InkItalic(Note, 18)];
		return SNew(SBox).Padding(FMargin(0, 3))[Row];
	};
	using R = Resource;
	TSharedRef<SVerticalBox> Left = SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight()[Chapter(TEXT("The goal"), TEXT("Be the first to reach the victory target (10 points by default) on your own turn. A settlement is worth 1 point, a city 2, Longest Road and Largest Army 2 each, and each Victory Point card 1."))]
		+ SVerticalBox::Slot().AutoHeight()[Chapter(TEXT("The island"), TEXT("Nineteen hexes: Forest gives Lumber, Hills Brick, Pasture Wool, Fields Grain, Mountains Ore, and the Desert nothing. The number on a hex says which roll makes it produce; the dots under it show how likely that is, and red 6s and 8s are the likeliest."))]
		+ SVerticalBox::Slot().AutoHeight()[Chapter(TEXT("Setting out"), TEXT("Each player places a settlement and a road, then a second pair in reverse order. The second settlement pays one card from each hex around it. No settlement may stand next to another building."))]
		+ SVerticalBox::Slot().AutoHeight()[Chapter(TEXT("A turn"), TEXT("Roll the dice: every settlement on a hex with that number takes one card, every city two, except where the robber stands. Then trade and build in any order, and end your turn."))]
		+ SVerticalBox::Slot().AutoHeight()[Chapter(TEXT("Rolling a 7"), TEXT("Nothing is produced. Everyone holding more than seven cards gives up half. The roller moves the robber to another hex and steals one card from a player with a building there."))];
	TSharedRef<SVerticalBox> Right = SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 12, 0, 4)[LabelText(TEXT("¶ The costs"), 25, C::RubricDark)]
		+ SVerticalBox::Slot().AutoHeight()[Cost(TEXT("Road"), {R::Wood, R::Clay}, TEXT("15 each"))]
		+ SVerticalBox::Slot().AutoHeight()[Cost(TEXT("Settlement"), {R::Wood, R::Clay, R::Wool, R::Grain}, TEXT("1 point · 5 each"))]
		+ SVerticalBox::Slot().AutoHeight()[Cost(TEXT("City"), {R::Grain, R::Grain, R::Ore, R::Ore, R::Ore}, TEXT("2 points · 4 each"))]
		+ SVerticalBox::Slot().AutoHeight()[Cost(TEXT("Dev. card"), {R::Wool, R::Grain, R::Ore}, TEXT("25 in the deck"))]
		+ SVerticalBox::Slot().AutoHeight()[Chapter(TEXT("Trade"), TEXT("Only the player whose turn it is trades. Offer cards to everyone or to chosen players; they accept, decline or counter. The bank trades 4 for 1, or 3 for 1 at a general harbour and 2 for 1 at a harbour of that resource, when you have a building on it."))]
		+ SVerticalBox::Slot().AutoHeight()[Chapter(TEXT("Development cards"), TEXT("Knight (move the robber, steal, counts for Largest Army), Road Building (two free roads), Year of Plenty (two cards from the bank), Monopoly (everyone gives you all of one resource) and Victory Point. One per turn, never on the turn you bought it."))]
		+ SVerticalBox::Slot().AutoHeight()[Chapter(TEXT("Keys"), TEXT("Space (Y) rolls or ends the turn. Arrows (LB / RB) choose a spot on the board; Enter (A) places it. Esc (Menu) cancels or opens the menu; Ctrl+Z (X) undoes; L (View) opens the Herald. Drag with the right mouse button, hold Q or E, or use the right stick to turn the table; the wheel (triggers) zooms; Home (right-stick click) brings back the starting view. The prompts on screen follow whichever you use."))];

	TSharedPtr<SWidget> BackButton;
	TSharedRef<SWidget> Sheet = SNew(SBox).WidthOverride(1400)
		[
			Paper(SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)[Blackletter(TEXT("How to Play"), 64)]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 6)[Rule()]
				+ SVerticalBox::Slot().FillHeight(1.f)
				[
					SNew(SScrollBox)
					+ SScrollBox::Slot()
					[
						SNew(SHorizontalBox)
						+ SHorizontalBox::Slot().FillWidth(1.f).Padding(0, 0, 30, 0)[Left]
						+ SHorizontalBox::Slot().FillWidth(1.f)[Right]
					]
				]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Right).Padding(0, 10, 0, 0)
				[
					Button(TEXT("Back to the hall"), [this] { Show(Back); return FReply::Handled(); }, EButton::Paper, true, &BackButton, TEXT("undo"))
				],
				EPaper::Parchment, FMargin(44, 28))
		];
	Primary = BackButton;
	return InHall(SNew(SBox).Padding(FMargin(0, 50, 0, 50)).HAlign(HAlign_Center)[Sheet]);
}

// ------------------------------------------------------------------ settings

TSharedRef<SWidget> SCatnightRoot::BuildSettings()
{
	FHallSettings& S = FHallSettings::Get();
	auto Apply = [this]
	{
		FHallSettings& Set = FHallSettings::Get();
		Set.Save();
		if (View) View->bReducedMotion = Set.bReduceMotion;
		if (!CommandLineBotDelay()) Match->BotDelay = Set.BotDelay();
		bRebuild = true;
	};
	TSharedRef<SHorizontalBox> Speeds = SNew(SHorizontalBox);
	for (int32 K = 0; K < 4; K++)
	{
		Speeds->AddSlot().AutoWidth().Padding(0, 0, 6, 0)[Button(FHallSettings::BotSpeedName(K), [K, Apply] { FHallSettings::Get().BotSpeed = K; Apply(); return FReply::Handled(); }, S.BotSpeed == K ? EButton::TabOn : EButton::Paper, true, nullptr, FString(), 19)];
	}
	TSharedRef<SHorizontalBox> Rates = SNew(SHorizontalBox);
	for (int32 K = 0; K < 3; K++)
	{
		Rates->AddSlot().AutoWidth().Padding(0, 0, 6, 0)[Button(FHallSettings::FrameRateName(K), [K, Apply] { FHallSettings::Get().FrameRate = K; Apply(); return FReply::Handled(); }, S.FrameRate == K ? EButton::TabOn : EButton::Paper, true, nullptr, FString(), 19)];
	}
	auto Pair = [Apply](bool bValue, const FString& On, const FString& Off, TFunction<void(bool)> Set)
	{
		return SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 6, 0)[Button(On, [Set, Apply] { Set(true); Apply(); return FReply::Handled(); }, bValue ? EButton::TabOn : EButton::Paper, true, nullptr, FString(), 19)]
			+ SHorizontalBox::Slot().AutoWidth()[Button(Off, [Set, Apply] { Set(false); Apply(); return FReply::Handled(); }, !bValue ? EButton::TabOn : EButton::Paper, true, nullptr, FString(), 19)];
	};
	auto Row = [](const FString& Name, const FString& Note, TSharedRef<SWidget> Control)
	{
		return SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 8, 0, 2)
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 18, 0)[SNew(SBox).WidthOverride(210)[LabelText(Name, 22, C::Ink)]]
				+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)[Control]
			]
			+ SVerticalBox::Slot().AutoHeight()[InkItalic(Note, 18)];
	};
	TSharedPtr<SWidget> Done;
	TSharedRef<SWidget> Sheet = SNew(SBox).WidthOverride(900)
		[
			Paper(SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()[Blackletter(TEXT("Of Sound and Sight"), 56)]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 4)[Rule()]
				+ SVerticalBox::Slot().AutoHeight()[LabelText(TEXT("¶ Gameplay"), 23, C::RubricDark)]
				+ SVerticalBox::Slot().AutoHeight()[Row(TEXT("Bot speed"), TEXT("How long the bots think before each move."), Speeds)]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 14, 0, 0)[LabelText(TEXT("¶ Sound"), 23, C::RubricDark)]
				+ SVerticalBox::Slot().AutoHeight()[Row(TEXT("Effects"), TEXT("Dice, building, trading and the hall's own sounds (0 is silent)."),
					Stepper(S.Volume, [Apply](int32 V)
					{
						FHallSettings::Get().Volume = FMath::Clamp(V, 0, 10);
						Apply();
						HallSound::Play(TEXT("ui-brass"));
					}, 0, 10))]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 14, 0, 0)[LabelText(TEXT("¶ Board"), 23, C::RubricDark)]
				+ SVerticalBox::Slot().AutoHeight()[Row(TEXT("Start on"), TEXT("The 3D war table, or the flat chart (you can switch in the game)."),
					Pair(S.bStart3D, TEXT("3D table"), TEXT("Flat chart"), [](bool b) { FHallSettings::Get().bStart3D = b; }))]
				+ SVerticalBox::Slot().AutoHeight()[Row(TEXT("The hall"), TEXT("Stone walls, torches, banners and candles round the war table (from the next start)."),
					Pair(S.bHall, TEXT("On"), TEXT("Off"), [](bool b) { FHallSettings::Get().bHall = b; }))]
				+ SVerticalBox::Slot().AutoHeight()[Row(TEXT("Day and night"), TEXT("The table's light follows the game's clock: each round is part of a day, from sunrise to a lamplit night."),
					Pair(S.bDayNight, TEXT("Follow the game"), TEXT("Always day"), [](bool b) { FHallSettings::Get().bDayNight = b; }))]
				+ SVerticalBox::Slot().AutoHeight()[Row(TEXT("Frame rate"), TEXT("Up to 60 keeps a laptop cool and quiet. In the background the game draws at most 30 a second."), Rates)]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 14, 0, 0)[LabelText(TEXT("¶ Access"), 23, C::RubricDark)]
				+ SVerticalBox::Slot().AutoHeight()[Row(TEXT("Reduce motion"), TEXT("No swaying banners, flickering torches, travelling pieces, tossed dice, dust or gradual construction. Results always stay visible."),
					Pair(S.bReduceMotion, TEXT("On"), TEXT("Off"), [](bool b) { FHallSettings::Get().bReduceMotion = b; }))]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 18, 0, 0)[Rule()]
				+ SVerticalBox::Slot().AutoHeight().Padding(0, 10, 0, 0)
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
					[
						Button(TEXT("Restore defaults"), [Apply] { FHallSettings::Get() = FHallSettings(); Apply(); return FReply::Handled(); }, EButton::Paper, true, nullptr, FString(), 19)
					]
					+ SHorizontalBox::Slot().FillWidth(1.f)[SNullWidget::NullWidget]
					+ SHorizontalBox::Slot().AutoWidth()[Button(TEXT("Done"), [this] { Show(Back); return FReply::Handled(); }, EButton::Seal, true, &Done, TEXT("key"), 24)]
				],
				EPaper::Parchment, FMargin(44, 28))
		];
	Primary = Done;
	// The sheet shrinks to fit a short window rather than lose its last rows.
	return InHall(SNew(SBox).Padding(FMargin(0, 8))
		[
			SNew(SScaleBox).Stretch(EStretch::ScaleToFit).StretchDirection(EStretchDirection::DownOnly).HAlign(HAlign_Center).VAlign(VAlign_Center)[Sheet]
		]);
}

// ------------------------------------------------------------------ gallery

TSharedRef<SWidget> SCatnightRoot::BuildGallery()
{
	// Every HallKit piece in its states, for screenshots and review (plan §11.1).
	auto Noop = [] { return FReply::Handled(); };
	TSharedRef<SHorizontalBox> Buttons = SNew(SHorizontalBox);
	for (EButton K : {EButton::Primary, EButton::Plaque, EButton::Paper, EButton::Danger, EButton::TabOn, EButton::Tab})
		Buttons->AddSlot().AutoWidth().Padding(0, 0, 10, 0)[Button(TEXT("Button"), Noop, K)];
	Buttons->AddSlot().AutoWidth().Padding(0, 0, 10, 0)[Button(TEXT("Disabled"), Noop, EButton::Plaque, false)];
	TSharedRef<SHorizontalBox> ArmsRow = SNew(SHorizontalBox);
	for (int32 I = 0; I < 4; I++) ArmsRow->AddSlot().AutoWidth().Padding(0, 0, 12, 0)[Arms(SeatColors[I], SeatSigils[I], 72)];
	TSharedRef<SHorizontalBox> Cards = SNew(SHorizontalBox);
	int32 Counts[] = {1, 1, 3, 0, 2};
	for (Resource Res : kResources) Cards->AddSlot().AutoWidth().Padding(0, 0, 10, 0)[ResourceCard(Res, Counts[static_cast<int>(Res)], 76, Res == Resource::Wool ? TEXT("+1") : FString())];
	TSharedRef<SHorizontalBox> Icons = SNew(SHorizontalBox);
	for (const TCHAR* I : {TEXT("crown"), TEXT("book"), TEXT("key"), TEXT("hourglass"), TEXT("scroll"), TEXT("undo"), TEXT("door"), TEXT("hex"), TEXT("eye")})
		Icons->AddSlot().AutoWidth().Padding(0, 0, 10, 0)[Icon(I, 40)];
	TSharedRef<SHorizontalBox> Dice = SNew(SHorizontalBox);
	for (int32 F = 1; F <= 6; F++) Dice->AddSlot().AutoWidth().Padding(0, 0, 8, 0)[Die(F, 44)];
	TSharedRef<SHorizontalBox> Banners = SNew(SHorizontalBox);
	for (int32 I = 0; I < 4; I++)
	{
		Banners->AddSlot().AutoWidth().Padding(FMargin(26, 0))
		[
			SNew(SBanner).Cloth(Hall::PlayerBannerName(SeatColors[I])).ArmsImage(Hall::ArmsName(SeatColors[I], SeatSigils[I]))
			.Numeral(FString::FromInt(3 + I)).Label(FString(I == 0 ? TEXT("Mazen · you") : TEXT("Morrow"))).LabelPx(17).Width(122).Lit(I == 0).Seed(I)
		];
	}
	return InHall(SNew(SScrollBox)
		+ SScrollBox::Slot().Padding(FMargin(160, 30))
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight()[Blackletter(TEXT("The HallKit"), 64, C::GoldLight, true)]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 10)[Buttons]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 10)
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 20, 0)[Button(TEXT("Accept"), Noop, EButton::SealOnDark, true, nullptr, TEXT("crown"))]
				+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 20, 0)[Button(TEXT("End turn"), Noop, EButton::SealOnDark, true, nullptr, TEXT("hourglass"), 26)]
				+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 20, 0).VAlign(VAlign_Center)[Ribbon(TEXT("Build & trade, then end your turn"), 22, 0.f, true)]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Stepper(3, [](int32) {}, 0, 9, true)]
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 10)[Banners]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 6)
			[
				// The button prompts follow the device in use (move the mouse or touch a pad).
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth()[PromptHint(Hall::EPrompt::Confirm, TEXT("confirm"), 30)]
				+ SHorizontalBox::Slot().AutoWidth().Padding(18, 0, 0, 0)[PromptHint(Hall::EPrompt::Back, TEXT("back"), 30)]
				+ SHorizontalBox::Slot().AutoWidth().Padding(18, 0, 0, 0)[PromptHint(Hall::EPrompt::Primary, TEXT("roll / end turn"), 30)]
				+ SHorizontalBox::Slot().AutoWidth().Padding(18, 0, 0, 0)[PromptHint(Hall::EPrompt::Cycle, TEXT("choose a spot"), 30)]
				+ SHorizontalBox::Slot().AutoWidth().Padding(18, 0, 0, 0)[PromptHint(Hall::EPrompt::Undo, TEXT("undo"), 30)]
				+ SHorizontalBox::Slot().AutoWidth().Padding(18, 0, 0, 0)[PromptHint(Hall::EPrompt::Log, TEXT("herald"), 30)]
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 20)
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 30, 0)[ArmsRow]
				+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 30, 0)[Cards]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()[Icons]
					+ SVerticalBox::Slot().AutoHeight().Padding(0, 10)[Dice]
				]
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 10)
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 40, 0)
				[
					Decree(TEXT("A Bargain Offered"), SNew(SVerticalBox)
						+ SVerticalBox::Slot().AutoHeight()[Ink(TEXT("Morrow proposes two Wool for one Ore."), 20, C::Ink)]
						+ SVerticalBox::Slot().AutoHeight().Padding(0, 12, 0, 0)
						[
							SNew(SHorizontalBox)
							+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 12, 0)[Button(TEXT("Accept"), Noop, EButton::Seal)]
							+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 12, 0)[Button(TEXT("Counter"), Noop, EButton::Paper)]
							+ SHorizontalBox::Slot().AutoWidth()[Button(TEXT("Decline"), Noop, EButton::Paper)]
						],
						560.f, Hall::ArmsName(PlayerColor::Frost, Sigil::Moon))
				]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Top)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight()
					[
						SNew(SBox).WidthOverride(380)
						[
							Oak(SNew(SVerticalBox)
								+ SVerticalBox::Slot().AutoHeight()[OnDark(TEXT("An oak board with iron corners."), 18)]
								+ SVerticalBox::Slot().AutoHeight().Padding(0, 10)[SNew(SBox).WidthOverride(320)[SNew(SScaleBar).Value(9).Limit(7)]],
								TEXT("Materials"))
						]
					]
					+ SVerticalBox::Slot().AutoHeight().Padding(0, 30, 0, 0)[Slip(TEXT("Roll the dice first"), C::Rubric)]
				]
			]
		]);
}
