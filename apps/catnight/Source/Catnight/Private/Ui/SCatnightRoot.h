// The game's screens in Hall & Chart (docs/CATNIGHT_UI_PLAN.md §8): the title hall, the new-game
// screen, How to Play, Settings, the UI gallery, and the table. Switches between them and keeps
// keyboard/gamepad focus on something useful after every switch.
#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "CatnightMatch.h"

class SBox;
class STable;

class SCatnightRoot : public SCompoundWidget
{
public:
	enum class EScreen : uint8 { Title, NewGame, Table, Rules, Settings, Gallery };

	SLATE_BEGIN_ARGS(SCatnightRoot) {}
		SLATE_ARGUMENT(TSharedPtr<FCatnightMatch>, Match)
		SLATE_ARGUMENT(TSharedPtr<struct FCatnightBoardView>, View)
		SLATE_ARGUMENT(EScreen, Screen)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
	virtual bool SupportsKeyboardFocus() const override { return true; }
	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;
	virtual FReply OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent) override;

	void Show(EScreen Screen);
	EScreen Current() const { return Screen; }
	/** Where keyboard and gamepad focus should go now. */
	TSharedPtr<SWidget> FocusTarget() const;

private:
	void ApplyShow(EScreen Screen);
	TSharedRef<SWidget> BuildTitle();
	TSharedRef<SWidget> BuildNewGame();
	TSharedRef<SWidget> BuildRules();
	TSharedRef<SWidget> BuildSettings();
	TSharedRef<SWidget> BuildGallery();
	/** The hall behind the menus: wall, windows, torches, columns. The torches stand aside (hidden)
	 *  when a screen's content, `ContentWidth` wide and centred, would cover them. */
	TSharedRef<SWidget> InHall(TSharedRef<SWidget> Content, float ContentWidth = 0.f);
	void FocusLater() { bFocusPending = true; }
	void StartGame(FCatnightMatchSetup Setup);

	TSharedPtr<FCatnightMatch> Match;
	TSharedPtr<struct FCatnightBoardView> View;
	TSharedPtr<SBox> Content;
	TSharedPtr<STable> Table;
	TSharedPtr<SWidget> Primary;
	EScreen Screen = EScreen::Title;
	EScreen Back = EScreen::Title;
	TOptional<EScreen> Pending;
	bool bFocusPending = false;
	bool bRebuild = false;

	FCatnightMatchSetup Draft;
	FString StartError;
	FString TitleError;
};
