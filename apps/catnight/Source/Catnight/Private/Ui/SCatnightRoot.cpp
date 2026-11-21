#include "Ui/SCatnightRoot.h"

#include "CatnightRules/Rules.h"
#include "Framework/Application/SlateApplication.h"
#include "HAL/PlatformMisc.h"
#include "Lexicon.h"
#include "Table/BoardView.h"
#include "Table/STable.h"
#include "Ui/CatnightUi.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SWrapBox.h"
#include "Widgets/SBoxPanel.h"

using namespace catnight;
using namespace CatnightUi;

namespace
{
	const FLinearColor Backdrop = Srgb(16, 17, 19);

	FString SeatKindLabel(const FCatnightSeat& Seat)
	{
		return Seat.bHuman ? FString(TEXT("Person on this device")) : FString::Printf(TEXT("%s bot"), *CatnightText::BotLevel(Seat.Level));
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
}

void SCatnightRoot::Construct(const FArguments& InArgs)
{
	Match = InArgs._Match;
	View = InArgs._View;
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
		SNew(SBorder).BorderImage(WhiteBox()).Padding(0)
		.BorderBackgroundColor_Lambda([this]
		{
			// The 3D table shows through: fully at the table, dimmed behind the menus.
			const bool b3D = View && View->b3D && View->MoveCamera;
			if (!b3D) return FSlateColor(Backdrop);
			return FSlateColor(Screen == EScreen::Table ? FLinearColor::Transparent : FLinearColor(Backdrop.R, Backdrop.G, Backdrop.B, 0.72f));
		})
		[
			SAssignNew(Content, SBox)
		]
	];
	ApplyShow(InArgs._Screen);
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
	if (bRebuildNewGame && Screen == EScreen::NewGame)
	{
		bRebuildNewGame = false;
		const bool bHadFocus = Content->HasFocusedDescendants();
		Content->SetContent(BuildNewGame());
		if (bHadFocus) FocusLater();
	}
	if (bFocusPending && FSlateApplication::IsInitialized())
	{
		bFocusPending = false;
		// Buttons show their focus ring (navigation); a whole screen taking focus should not.
		const TSharedPtr<SWidget> F = FocusTarget();
		const bool bButton = F && F->GetType() == TEXT("SButton");
		if (F) FSlateApplication::Get().SetAllUserFocus(F, bButton ? EFocusCause::Navigation : EFocusCause::SetDirectly);
	}
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
	case EScreen::Title:
		Content->SetContent(BuildTitle());
		break;
	case EScreen::NewGame:
		StartError.Reset();
		Content->SetContent(BuildNewGame());
		break;
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

TSharedRef<SWidget> SCatnightRoot::BuildTitle()
{
	TSharedRef<SVerticalBox> Menu = SNew(SVerticalBox);
	auto Add = [&](TSharedRef<SWidget> W) { Menu->AddSlot().AutoHeight().Padding(0, 5)[SNew(SBox).WidthOverride(300)[W]]; };
	const bool bSave = Match->HasSave();
	if (bSave)
	{
		Add(Button(TEXT("Continue"), [this]
		{
			TitleError = Match->Continue();
			if (TitleError.IsEmpty()) Show(EScreen::Table);
			else Show(EScreen::Title);
			return FReply::Handled();
		}, true, true, &Primary));
	}
	Add(Button(TEXT("Play"), [this] { Show(EScreen::NewGame); return FReply::Handled(); }, true, !bSave, bSave ? nullptr : &Primary));
	Add(Button(TEXT("Quit"), [] { FPlatformMisc::RequestExit(false, TEXT("CatnightQuit")); return FReply::Handled(); }));
	if (!TitleError.IsEmpty()) Menu->AddSlot().AutoHeight().Padding(0, 8)[Text(FString::Printf(TEXT("Could not continue: %s"), *TitleError), 11, Danger)];

	return SNew(SBox).HAlign(HAlign_Center).VAlign(VAlign_Center)
	[
		SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)[Text(TEXT("Catnight"), 54, Ivory, true)]
		+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0, 0, 0, 6)[Text(TEXT("Trade · Build · Settle"), 14, Srgb(214, 178, 112))]
		+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0, 0, 0, 28)[Text(TEXT("working title"), 9, Muted)]
		+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)[Menu]
	];
}

TSharedRef<SWidget> SCatnightRoot::BuildNewGame()
{
	Primary.Reset();
	const int32 N = FMath::Clamp(Draft.Players, kMinPlayers, kMaxPlayers);
	TSharedRef<SVerticalBox> Body = SNew(SVerticalBox);
	auto Row = [&](TSharedRef<SWidget> W, float Top = 6.f) { Body->AddSlot().AutoHeight().Padding(0, Top, 0, 0)[W]; };

	Row(SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)[Text(TEXT("New game"), 26, Ivory, true)]
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)[Button(TEXT("Back"), [this] { Show(EScreen::Title); return FReply::Handled(); })], 0.f);

	// Seats.
	TSharedRef<SWrapBox> Count = SNew(SWrapBox).UseAllottedSize(true).InnerSlotPadding(FVector2D(6, 6));
	for (int32 K = kMinPlayers; K <= kMaxPlayers; K++)
	{
		Count->AddSlot()[Button(FString::Printf(TEXT("%d players"), K), [this, K] { Draft.Players = K; bRebuildNewGame = true; return FReply::Handled(); }, true, N == K)];
	}
	TSharedRef<SVerticalBox> Seats = SNew(SVerticalBox) + SVerticalBox::Slot().AutoHeight()[Count];
	static const PlayerColor Colors[] = {PlayerColor::Crimson, PlayerColor::Frost, PlayerColor::Bone, PlayerColor::Violet};
	for (int32 I = 0; I < N; I++)
	{
		Seats->AddSlot().AutoHeight().Padding(0, 6, 0, 0)
		[
			Plate(Srgb(34, 36, 38),
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0, 0, 10, 0)
				[
					SNew(SBox).WidthOverride(18).HeightOverride(18)[SNew(SBorder).BorderImage(WhiteBox()).BorderBackgroundColor(PlayerTint(Colors[I]))]
				]
				+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center).Padding(0, 0, 10, 0)
				[
					SNew(SEditableTextBox)
					.Text(FText::FromString(Draft.Seats[I].Name))
					.Font(Font(12))
					.OnTextChanged_Lambda([this, I](const FText& T) { Draft.Seats[I].Name = T.ToString(); })
				]
				+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
				[
					SNew(SBox).WidthOverride(200)
					[
						Button(SeatKindLabel(Draft.Seats[I]), [this, I] { CycleSeat(Draft.Seats[I]); bRebuildNewGame = true; return FReply::Handled(); })
					]
				],
				8.f)
		];
	}
	int32 Humans = 0;
	for (int32 I = 0; I < N; I++) Humans += Draft.Seats[I].bHuman ? 1 : 0;
	Seats->AddSlot().AutoHeight().Padding(0, 6, 0, 0)
	[
		Text(Humans > 1 ? TEXT("Hot-seat: the people pass the device between turns; a curtain hides each hand.")
			: Humans == 0 ? TEXT("No people seated: the bots play on their own.") : TEXT("Click a seat's role to change it."), 10, Muted)
	];
	Row(Section(TEXT("Seats"), Seats));

	// Articles of the game.
	TSharedRef<SWrapBox> Layouts = SNew(SWrapBox).UseAllottedSize(true).InnerSlotPadding(FVector2D(6, 6));
	for (LayoutMode L : {LayoutMode::Balanced, LayoutMode::Random, LayoutMode::Beginner})
	{
		Layouts->AddSlot()[Button(CatnightText::Layout(L), [this, L] { Draft.Layout = L; bRebuildNewGame = true; return FReply::Handled(); }, true, Draft.Layout == L)];
	}
	TSharedRef<SVerticalBox> Rules = SNew(SVerticalBox)
		+ SVerticalBox::Slot().AutoHeight()
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)[Text(TEXT("Victory at"), 12, Ivory)]
			+ SHorizontalBox::Slot().AutoWidth()[Stepper(Draft.TargetVp, [this](int32 V) { Draft.TargetVp = V; bRebuildNewGame = true; }, kMinTarget, kMaxTarget)]
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 8, 0, 0)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)[Text(TEXT("Board layout"), 12, Ivory)]
			+ SHorizontalBox::Slot().AutoWidth()[Layouts]
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 8, 0, 0)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)[Text(TEXT("Seed"), 12, Ivory)]
			+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 6, 0)
			[
				SNew(SBox).WidthOverride(180)
				[
					SNew(SEditableTextBox)
					.Text(FText::FromString(Draft.Seed))
					.Font(Font(12))
					.OnTextChanged_Lambda([this](const FText& T) { Draft.Seed = T.ToString(); })
				]
			]
			+ SHorizontalBox::Slot().AutoWidth()[Button(TEXT("Reroll"), [this] { Draft.Seed = NewSeed(); bRebuildNewGame = true; return FReply::Handled(); })]
		]
		+ SVerticalBox::Slot().AutoHeight().Padding(0, 6, 0, 0)[Text(TEXT("The first player is decided by a dice roll-off. The same seed always deals the same island."), 10, Muted)];
	Row(Section(TEXT("Articles of the game"), Rules));

	if (!StartError.IsEmpty()) Row(Text(StartError, 11, Danger), 12.f);
	Row(SNew(SBox).HAlign(HAlign_Left)
		[
			Button(TEXT("Start the game"), [this, N]
			{
				FCatnightMatchSetup Setup = Draft;
				Setup.Seats.SetNum(N);
				Setup.Players = N;
				Setup.bAutoplay = false;
				StartError = Match->Start(Setup);
				if (StartError.IsEmpty()) Show(EScreen::Table);
				else bRebuildNewGame = true;
				return FReply::Handled();
			}, true, true, &Primary)
		], 16.f);

	return SNew(SScrollBox)
		+ SScrollBox::Slot().HAlign(HAlign_Center).Padding(16, 32)
		[
			SNew(SBox).WidthOverride(640)[Body]
		];
}
